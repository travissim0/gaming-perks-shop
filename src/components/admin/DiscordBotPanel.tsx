'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { btnQuiet, btnDanger } from '@/components/ctf/FormBits';

const btnDiscord = 'px-4 py-2 rounded-md text-sm font-medium bg-[#5865F2] text-white hover:bg-[#6B76F5] disabled:opacity-50 transition-colors';

interface BotState { guild_id: string | null; season_id: string | null; last_sync_at: string | null; last_result: string | null; last_error: string | null; updated_at: string }
interface Pending { id: string; action: string; created_at: string }
interface ChannelRow { squad_id: string; squad_name: string; season_id: string; updated_at: string }
interface Person {
  id: string;
  alias: string;
  role: 'captain' | 'member' | 'pool';
  squad: string | null;
  discord: { username: string; in_guild: boolean; nick: string | null; linked_at: string | null } | null;
}
interface Roster { season: string | null; people: Person[] }

const rel = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

/**
 * Staff view of the FreeInf CTF Discord bot: heartbeat, what it has built,
 * Sync now, and the confirmed season teardown.
 */
export default function DiscordBotPanel() {
  const [state, setState] = useState<BotState | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [roster, setRoster] = useState<Roster>({ season: null, people: [] });
  const [rosterFilter, setRosterFilter] = useState<'all' | 'missing'>('all');
  const [rosterOpen, setRosterOpen] = useState(true);
  const [pendingSql, setPendingSql] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmTeardown, setConfirmTeardown] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/discord/bot', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const json = await res.json();
      if (json.pending_sql) { setPendingSql(true); return; }
      setState(json.state || null);
      setPending(json.pending || []);
      setChannels(json.channels || []);
      setRoster(json.roster || { season: null, people: [] });
    } catch (e) {
      console.error('bot panel load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const send = async (action: 'sync' | 'teardown') => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/discord/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action, season_id: state?.season_id || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      toast.success(action === 'sync' ? 'Sync requested — the bot picks it up within seconds' : 'Teardown requested');
      setConfirmTeardown(false);
      setTimeout(load, 3000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const online = !!state?.updated_at && Date.now() - new Date(state.updated_at).getTime() < 20 * 60 * 1000;

  const people = roster.people;
  const linked = people.filter((p) => p.discord);
  const inServer = linked.filter((p) => p.discord!.in_guild);
  const missing = people.filter((p) => !p.discord || !p.discord.in_guild);
  const shown = rosterFilter === 'missing' ? missing : people;
  const captainsMissing = people.filter((p) => p.role === 'captain' && (!p.discord || !p.discord.in_guild));

  const status = (p: Person) => {
    if (!p.discord) return <span className="text-[#F87171]">Not connected</span>;
    if (!p.discord.in_guild) return <span className="text-[#F59E0B]">@{p.discord.username} · not in CTFPL server</span>;
    return <span className="text-[#34D399]">@{p.discord.username}{p.discord.nick && p.discord.nick !== p.discord.username ? ` (${p.discord.nick})` : ''}</span>;
  };

  const th = 'py-2 px-4 text-left text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]';

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7] flex items-center gap-2">
            Discord bot
            {!loading && !pendingSql && (
              <span className={`font-sans text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${online ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-white/5 text-[#8B98B0]'}`}>
                {online ? 'Online' : 'Not running'}
              </span>
            )}
          </h2>
          <div className="text-xs text-[#8B98B0]">
            {pendingSql
              ? 'Run add-discord-bot.sql in Supabase to enable the bot tables.'
              : loading
                ? 'Checking…'
                : state?.last_sync_at
                  ? <>Last sync {rel(state.last_sync_at)} · {state.last_result}{state.last_error && <span className="text-[#F87171]"> · error: {state.last_error}</span>}</>
                  : 'The bot has not reported in yet. Start it on the server (see bot/README.md).'}
            {pending.length > 0 && <span className="text-[#F59E0B]"> · {pending.length} command{pending.length === 1 ? '' : 's'} waiting</span>}
            {channels.length > 0 && <> · Set up in Discord: <span className="text-[#E6EDF7]">{channels.map((c) => c.squad_name).sort().join(', ')}</span></>}
          </div>
        </div>
        {!pendingSql && (
          <div className="flex gap-2">
            <button onClick={() => send('sync')} disabled={busy} className={btnDiscord}>Sync now</button>
            <button onClick={() => setConfirmTeardown(true)} disabled={busy || channels.length === 0} className={`${btnQuiet} disabled:opacity-50 disabled:cursor-not-allowed`}>Tear down season channels</button>
          </div>
        )}
      </div>

      {!pendingSql && !loading && (
        <div>
          <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06]">
            <button onClick={() => setRosterOpen((o) => !o)} className="text-sm font-medium text-[#E6EDF7] flex items-center gap-2">
              <span className="text-[#8B98B0] text-xs">{rosterOpen ? '▼' : '▶'}</span>
              Who&apos;s connected{roster.season ? <span className="text-[#8B98B0] font-normal"> · {roster.season}</span> : null}
            </button>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#8B98B0]">
              <span>
                {people.length === 0
                  ? 'Nobody on a season team or in the pool yet.'
                  : <><span className="text-[#E6EDF7] tabular-nums">{inServer.length}</span> of {people.length} ready{linked.length !== inServer.length && ` · ${linked.length - inServer.length} linked but not in the server`}{captainsMissing.length > 0 && <span className="text-[#F59E0B]"> · {captainsMissing.length} captain{captainsMissing.length === 1 ? '' : 's'} missing</span>}</>}
              </span>
              {rosterOpen && people.length > 0 && (
                <span className="flex gap-1.5">
                  {([['all', `All ${people.length}`], ['missing', `Not ready ${missing.length}`]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setRosterFilter(k)} className={`rounded-md px-2.5 py-1 transition-colors ${rosterFilter === k ? 'bg-[#22D3EE]/15 text-[#22D3EE]' : 'bg-white/5 text-[#E6EDF7] hover:bg-white/10'}`}>
                      {label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          </div>

          {rosterOpen && people.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={th}>Player</th>
                      <th className={th}>Role</th>
                      <th className={th}>Discord</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                        <td className="py-2 px-4 text-sm font-medium text-[#E6EDF7] whitespace-nowrap">{p.alias}</td>
                        <td className="py-2 px-4 text-sm text-[#8B98B0] whitespace-nowrap">
                          {p.role === 'pool' ? 'Pool' : <>{p.role === 'captain' ? 'Captain' : 'Player'} · <span className="text-[#E6EDF7]">{p.squad}</span></>}
                        </td>
                        <td className="py-2 px-4 text-sm whitespace-nowrap">{status(p)}</td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr><td colSpan={3} className="py-3 px-4 text-sm text-[#8B98B0]">Everyone is connected and in the server.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3 text-[11px] text-[#8B98B0]/70 border-t border-white/[0.06]">
                Players connect from their profile page or the league registration form. &ldquo;Not in CTFPL server&rdquo; means they linked Discord but have not joined the server, so the bot cannot give them a role yet.
              </p>
            </>
          )}
        </div>
      )}

      {confirmTeardown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && setConfirmTeardown(false)}>
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#131A2B] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl text-[#E6EDF7] mb-2">Remove all squad roles and channels?</h3>
            <p className="text-sm text-[#8B98B0] mb-4">
              The bot will delete the {channels.length} squad categor{channels.length === 1 ? 'y' : 'ies'}, their text and voice channels, and the squad roles in the Discord server.
              Chat history in those channels is gone for good. Do this after the season is over.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmTeardown(false)} disabled={busy} className={btnQuiet}>Cancel</button>
              <button onClick={() => send('teardown')} disabled={busy} className={`${btnDanger} bg-[#F87171]/10`}>{busy ? 'Sending…' : 'Tear down'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
