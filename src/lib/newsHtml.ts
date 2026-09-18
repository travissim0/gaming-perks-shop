/**
 * Raw-HTML news posts.
 *
 * Posts can be written in the rich-text editor (stored as a TipTap document)
 * or pasted as HTML (stored as a string), which is how designed announcements
 * like the CTFDL S5 post come in. Every renderer already accepts a string and
 * drops it in as HTML, so this file only has to make that string safe and
 * make a pasted *page* (head, body, preview shells) work as a post body.
 *
 * Runs on both the client (before preview/save) and the server (on save), so
 * it is plain string work with no DOM.
 */

/** True when the stored content is an HTML string rather than an editor document. */
export function isHtmlContent(content: unknown): content is string {
  if (typeof content !== 'string') return false;
  const t = content.trim();
  return t.length > 0 && !t.startsWith('{') && /<[a-z][\s\S]*>/i.test(t);
}

const DROP_TAGS = ['script', 'link', 'meta', 'title', 'base', 'object', 'embed', 'applet', 'form', 'input', 'textarea', 'select', 'noscript'];

function stripStyleRules(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // no external pulls, no IE expressions
    .replace(/@import[^;]*;/gi, '')
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/url\(\s*['"]?\s*(javascript|vbscript|data):[^)]*\)/gi, 'url()')
    // rules aimed at the page itself, or at the preview shell around a pasted page
    // (lookbehind rather than a capture so back-to-back rules are all caught in one pass)
    .replace(/(?<=^|})\s*(?:html|body|\*)(?:\s*,\s*(?:html|body|\*))*\s*\{[^}]*\}/gim, '')
    .replace(/(?<=^|})\s*\.preview-[^{]*\{[^}]*\}/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Point the post's font names at the site's loaded faces (next/font hashes the family names). */
function siteFonts(s: string): string {
  return s
    .replace(/(?<!var\(--font-display\),\s*["']?)["']?Barlow Condensed["']?/g, 'var(--font-display), "Barlow Condensed"')
    .replace(/(?<!var\(--font-body\),\s*)(?<![\w-])Inter(?=\s*[,;}"'])/g, 'var(--font-body), Inter');
}

/**
 * Clean pasted HTML into a post body: keep a whole page's `<style>` blocks and
 * body content, drop scripts and page-level rules, strip inline event
 * handlers and script URLs. Idempotent, so re-saving a cleaned post is a no-op.
 */
export function prepareNewsHtml(raw: string): string {
  let html = String(raw || '').replace(/\r\n?/g, '\n');

  // A full document: keep its <style> blocks (from the head) and the body's content.
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) {
    const bodyAt = html.search(/<body/i);
    const headStyles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).filter((s) => html.indexOf(s) < bodyAt);
    html = `${headStyles.join('\n')}\n${body[1]}`;
  }

  // A preview shell wrapper (<div class="preview-col">…</div>) is dropped, its contents kept.
  if (/class=["'][^"']*\bpreview-[\w-]+/i.test(html)) {
    html = html.replace(/<div[^>]*class=["'][^"']*\bpreview-[\w-]+[^"']*["'][^>]*>/i, '');
    const last = html.lastIndexOf('</div>');
    if (last >= 0) html = html.slice(0, last) + html.slice(last + 6);
  }

  html = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DROP_TAGS) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '').replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }
  // iframes only for YouTube embeds
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (m) => (/src=["']https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\//i.test(m) ? m : ''));
  // inline handlers and script URLs
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s+(href|src|xlink:href|action|formaction)\s*=\s*(["']?)\s*(javascript|vbscript|data):[^"'\s>]*\2/gi, '');
  // style blocks and style attributes
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => `<style>${siteFonts(stripStyleRules(css))}</style>`);
  html = html.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, _q, dq, sq) => {
    const v = siteFonts(stripStyleRules(dq ?? sq ?? ''));
    return ` style="${v.replace(/"/g, '&quot;')}"`;
  });

  return html.trim();
}
