'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

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
    if (!p.discord) return <span className="text-red-300">Not connected</span>;
    if (!p.discord.in_guild) return <span className="text-amber-300">@{p.discord.username} · not in CTFPL server</span>;
    return <span className="text-green-300">@{p.discord.username}{p.discord.nick && p.discord.nick !== p.discord.username ? ` (${p.discord.nick})` : ''}</span>;
  };

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-indigo-200 flex items-center gap-2">
            Discord bot
            {!loading && !pendingSql && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${online ? 'bg-green-500/15 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                {online ? 'Online' : 'Not running'}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-400">
            {pendingSql
              ? 'Run add-discord-bot.sql in Supabase to enable the bot tables.'
              : loading
                ? 'Checking…'
                : state?.last_sync_at
                  ? <>Last sync {rel(state.last_sync_at)} · {state.last_result}{state.last_error && <span className="text-red-300"> · error: {state.last_error}</span>}</>
                  : 'The bot has not reported in yet. Start it on the server (see bot/README.md).'}
            {pending.length > 0 && <span className="text-amber-300"> · {pending.length} command{pending.length === 1 ? '' : 's'} waiting</span>}
          </div>
        </div>
        {!pendingSql && (
          <div className="flex gap-2">
            <button onClick={() => send('sync')} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">Sync now</button>
            <button onClick={() => setConfirmTeardown(true)} disabled={busy || channels.length === 0} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm">Tear down season channels</button>
          </div>
        )}
      </div>

      {channels.length > 0 && (
        <div className="text-xs text-gray-300">
          <span className="text-gray-400">Set up in Discord:</span>{' '}
          {channels.map((c) => c.squad_name).sort().join(' · ')}
        </div>
      )}

      {!pendingSql && !loading && (
        <div className="border-t border-indigo-500/20 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setRosterOpen((o) => !o)} className="text-sm font-medium text-indigo-200 flex items-center gap-2">
              <span className="text-gray-500 text-xs">{rosterOpen ? '▼' : '▶'}</span>
              Who&apos;s connected{roster.season ? <span className="text-gray-400 font-normal"> · {roster.season}</span> : null}
            </button>
            <div className="text-xs text-gray-400">
              {people.length === 0
                ? 'Nobody on a season team or in the pool yet.'
                : <>{inServer.length} of {people.length} ready{linked.length !== inServer.length && ` · ${linked.length - inServer.length} linked but not in the server`}{captainsMissing.length > 0 && <span className="text-amber-300"> · {captainsMissing.length} captain{captainsMissing.length === 1 ? '' : 's'} missing</span>}</>}
            </div>
          </div>

          {rosterOpen && people.length > 0 && (
            <>
              <div className="flex gap-1.5 mt-2 text-xs">
                {([['all', `All (${people.length})`], ['missing', `Not ready (${missing.length})`]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setRosterFilter(k)}
                    className={`px-2.5 py-1 rounded-md border ${rosterFilter === k ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-gray-500 text-left">
                      <th className="py-1 pr-3 font-medium">Player</th>
                      <th className="py-1 pr-3 font-medium">Role</th>
                      <th className="py-1 font-medium">Discord</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((p) => (
                      <tr key={p.id} className="border-t border-gray-800/80">
                        <td className="py-1.5 pr-3 text-gray-100 font-medium whitespace-nowrap">{p.alias}</td>
                        <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">
                          {p.role === 'pool' ? 'Pool' : <>{p.role === 'captain' ? 'Captain' : 'Player'} · <span className="text-gray-300">{p.squad}</span></>}
                        </td>
                        <td className="py-1.5 whitespace-nowrap">{status(p)}</td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr><td colSpan={3} className="py-2 text-gray-500">Everyone is connected and in the server.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Players connect from their profile page or the league registration form. &ldquo;Not in CTFPL server&rdquo; means they linked Discord but have not joined the server, so the bot cannot give them a role yet.
              </p>
            </>
          )}
        </div>
      )}

      {confirmTeardown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-600 p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-2">Remove all squad roles and channels?</h3>
            <p className="text-gray-300 text-sm mb-4">
              The bot will delete the {channels.length} squad categor{channels.length === 1 ? 'y' : 'ies'}, their text and voice channels, and the squad roles in the Discord server.
              Chat history in those channels is gone for good. Do this after the season is over.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmTeardown(false)} disabled={busy} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white disabled:opacity-50">Cancel</button>
              <button onClick={() => send('teardown')} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50">{busy ? 'Sending…' : 'Tear down'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
