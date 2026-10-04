// Seek-in-place for YouTube timestamp links inside user-authored HTML (news posts).
//
// News content is injected as HTML, so posts can't run scripts. A post can still embed a
// player (<iframe name="x" src="https://www.youtube.com/embed/ID?enablejsapi=1">) and link
// to timestamps with <a target="x" href="https://www.youtube.com/embed/ID?start=SECONDS">.
// Without help the browser reloads the whole player for every click, which also resets the
// viewer's quality choice. This listens for those clicks and drives the already-loaded
// player through YouTube's iframe postMessage API instead. Anything it can't handle (player
// not ready yet, API not enabled, a non-YouTube link) falls through to the normal link.

const YT_ORIGINS = new Set([
  'https://www.youtube.com',
  'https://www.youtube-nocookie.com',
]);

type PlayerState = { id: number; ready: boolean; videoId: string | null };

function parseEmbed(href: string): { videoId: string; start: number } | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (!YT_ORIGINS.has(url.origin)) return null;
  const match = url.pathname.match(/^\/embed\/([\w-]{6,})/);
  if (!match) return null;
  const start = Number(url.searchParams.get('start') ?? url.searchParams.get('t') ?? 0);
  return { videoId: match[1], start: Number.isFinite(start) ? Math.max(0, start) : 0 };
}

function isApiPlayer(frame: HTMLIFrameElement): boolean {
  const embed = parseEmbed(frame.src);
  return !!embed && /[?&]enablejsapi=1\b/.test(frame.src);
}

export function installYouTubeSeekLinks(): () => void {
  const players = new WeakMap<HTMLIFrameElement, PlayerState>();
  let nextId = 1;

  const stateFor = (frame: HTMLIFrameElement): PlayerState => {
    let state = players.get(frame);
    if (!state) {
      state = { id: nextId++, ready: false, videoId: parseEmbed(frame.src)?.videoId ?? null };
      players.set(frame, state);
    }
    return state;
  };

  const send = (frame: HTMLIFrameElement, payload: Record<string, unknown>) => {
    const target = new URL(frame.src).origin;
    frame.contentWindow?.postMessage(
      JSON.stringify({ ...payload, id: stateFor(frame).id, channel: 'widget' }),
      target,
    );
  };

  // Ask the player to report back; its replies are how we know it can take commands.
  const subscribe = (frame: HTMLIFrameElement) => {
    if (!isApiPlayer(frame)) return;
    const state = stateFor(frame);
    state.ready = false;
    state.videoId = parseEmbed(frame.src)?.videoId ?? state.videoId;
    send(frame, { event: 'listening' });
  };

  const onLoad = (event: Event) => {
    if (event.target instanceof HTMLIFrameElement) subscribe(event.target);
  };

  const onMessage = (event: MessageEvent) => {
    if (!YT_ORIGINS.has(event.origin) || typeof event.data !== 'string') return;
    const frame = Array.from(document.querySelectorAll('iframe')).find(
      (f) => f.contentWindow === event.source,
    );
    if (!frame) return;
    const state = stateFor(frame);
    state.ready = true;
    try {
      const data = JSON.parse(event.data);
      const videoId = data?.info?.videoData?.video_id;
      if (typeof videoId === 'string' && videoId) state.videoId = videoId;
    } catch {
      // not JSON: still proof the player is listening
    }
  };

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.('a[target][href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const embed = parseEmbed(link.href);
    if (!embed) return;
    const frame = Array.from(document.querySelectorAll('iframe')).find(
      (f) => f.name === link.target,
    );
    if (!frame || !isApiPlayer(frame)) return;
    const state = stateFor(frame);
    if (!state.ready) return; // let the normal link reload the player

    event.preventDefault();
    if (state.videoId === embed.videoId) {
      send(frame, { event: 'command', func: 'seekTo', args: [embed.start, true] });
      send(frame, { event: 'command', func: 'playVideo', args: [] });
    } else {
      send(frame, {
        event: 'command',
        func: 'loadVideoById',
        args: [{ videoId: embed.videoId, startSeconds: embed.start }],
      });
      state.videoId = embed.videoId;
    }
  };

  window.addEventListener('message', onMessage);
  document.addEventListener('load', onLoad, true); // iframe load events don't bubble
  document.addEventListener('click', onClick);
  document.querySelectorAll('iframe').forEach(subscribe); // players already on the page

  return () => {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('load', onLoad, true);
    document.removeEventListener('click', onClick);
  };
}
