'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Panel, Modal, Empty, Spinner, th, td } from '@/components/ctf/AdminBits';
import { btnQuiet, btnDanger, inputCls, labelCls } from '@/components/ctf/FormBits';
import type { CrewPerson, CrewMatch } from '@/app/api/admin/crew/route';

/**
 * Staff panel: who is actually working matches this season. Sign-ups per role, matches played
 * with them on crew, VODs delivered by recorders, and no-shows an admin marked by hand (the
 * site can't see a spectating ref, so nothing here is automatic). Below: eligible people who
 * signed up for nothing, to nudge. Admin-only; the public never sees any of it.
 */

type Role = 'referee' | 'commentator' | 'recording';
const ROLE_LABEL: Record<Role, string> = { referee: 'Ref', commentator: 'Cast', recording: 'Rec' };
const ROLE_LONG: Record<Role, string> = { referee: 'Referee', commentator: 'Commentator', recording: 'Recorder' };
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const stageOf = (m: CrewMatch) => (m.stage === 'fs' ? (m.fs_color === 'green' ? 'FS Green' : 'FS Red') : m.stage === 'playoff' ? 'Playoffs' : m.week ? `Week ${m.week}` : 'RS');
const roleTag = (ctfRole: string | null) => (ctfRole || '').replace(/^ctf_/, '').replace(/_/g, ' ') || 'player';

interface CrewData {
  league: { slug: string; name: string };
  seasons: { season_number: number; status: string }[];
  season: { season_number: number; status: string } | null;
  people: CrewPerson[];
  idle: { player_id: string; alias: string; ctf_role: string | null }[];
  no_show_installed: boolean;
  matches_played: number;
}

export default function CrewPanel({ league = 'ctfdl', season }: { league?: string; season?: number | null }) {
  const [data, setData] = useState<CrewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonNumber, setSeasonNumber] = useState<number | null>(season ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [marking, setMarking] = useState<{ person: CrewPerson; match: CrewMatch } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showIdle, setShowIdle] = useState(false);

  const headers = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ league });
      if (seasonNumber) q.set('season', String(seasonNumber));
      const r = await fetch(`/api/admin/crew?${q}`, { headers: await headers(), cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      setData(j);
      if (j?.season && !seasonNumber) setSeasonNumber(j.season.season_number);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [league, seasonNumber]);

  useEffect(() => { load(); }, [load]);

  const setNoShow = async (person: CrewPerson, match: CrewMatch, noShow: boolean) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/crew', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await headers()) }, body: JSON.stringify({ match_id: match.match_id, player_id: person.player_id, role: match.role, no_show: noShow, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed');
      toast.success(noShow ? `${person.alias} marked as a no-show` : 'No-show cleared');
      setMarking(null); setNote('');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const total = (p: CrewPerson, k: 'signed' | 'played' | 'no_shows') => (['referee', 'commentator', 'recording'] as Role[]).reduce((n, r) => n + p.by_role[r][k], 0);

  const seasonPicker = data && data.seasons.length > 1 ? (
    <select value={seasonNumber ?? ''} onChange={(e) => setSeasonNumber(Number(e.target.value))} className={`${inputCls} w-auto py-1 text-xs`}>
      {data.seasons.map((s) => <option key={s.season_number} value={s.season_number}>Season {s.season_number}{s.status === 'active' ? ' (current)' : ''}</option>)}
    </select>
  ) : null;

  return (
    <>
      <Panel
        title="Crew"
        hint={<>Who is working matches: sign-ups per role, matches played with them on crew, VODs from recorders, and no-shows marked by staff. Admin-only. {data && !data.no_show_installed && <span className="text-[#F59E0B]">Run add-crew-no-show.sql to mark no-shows.</span>}</>}
        actions={seasonPicker}
      >
        {loading && !data ? (
          <Spinner label="Loading crew…" />
        ) : !data ? (
          <Empty>Could not load crew activity.</Empty>
        ) : data.people.length === 0 ? (
          <Empty>Nobody has signed up for a match this season yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className={th}>Person</th>
                  <th className={`${th} text-right`} title="Referee: signed up · worked">Ref</th>
                  <th className={`${th} text-right`} title="Commentator: signed up · worked">Cast</th>
                  <th className={`${th} text-right`} title="Recorder: signed up · worked">Rec</th>
                  <th className={`${th} text-right`} title="VODs posted on matches they recorded">VODs</th>
                  <th className={`${th} text-right`}>No-shows</th>
                  <th className={`${th} text-right`}>Last worked</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => {
                  const isOpen = open === p.player_id;
                  const cell = (r: Role) => {
                    const v = p.by_role[r];
                    if (!v.signed) return <span className="text-[#8B98B0]/50">—</span>;
                    return <span title={`${v.signed} signed up, ${v.played} worked${v.no_shows ? `, ${v.no_shows} no-show` : ''}`}><span className="text-[#E6EDF7]">{v.played}</span><span className="text-[#8B98B0]"> / {v.signed}</span></span>;
                  };
                  return (
                    <FragmentRow key={p.player_id}>
                      <tr onClick={() => setOpen(isOpen ? null : p.player_id)} className={`cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03] ${isOpen ? 'bg-white/[0.03]' : ''}`}>
                        <td className={td}>
                          <span className="text-[#E6EDF7]">{p.alias}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-[#8B98B0]">{roleTag(p.ctf_role)}</span>
                        </td>
                        <td className={`${td} text-right tabular-nums`}>{cell('referee')}</td>
                        <td className={`${td} text-right tabular-nums`}>{cell('commentator')}</td>
                        <td className={`${td} text-right tabular-nums`}>{cell('recording')}</td>
                        <td className={`${td} text-right tabular-nums text-[#E6EDF7]`}>{p.vods || <span className="text-[#8B98B0]/50">—</span>}</td>
                        <td className={`${td} text-right tabular-nums`}>{total(p, 'no_shows') ? <span className="text-[#F87171]">{total(p, 'no_shows')}</span> : <span className="text-[#8B98B0]/50">—</span>}</td>
                        <td className={`${td} text-right text-[#8B98B0]`}>{p.last_at ? when(p.last_at) : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-white/[0.06]">
                          <td colSpan={7} className="bg-[#0B0F1A]/60 px-4 py-2">
                            <ul className="divide-y divide-white/[0.04]">
                              {p.matches.map((m) => (
                                <li key={`${m.match_id}-${m.role}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
                                  <span className="w-20 text-[#8B98B0]">{when(m.scheduled_at)}</span>
                                  <span className="w-16 rounded bg-white/5 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-wide text-[#8B98B0]">{ROLE_LABEL[m.role]}</span>
                                  <span className="w-16 text-[10px] uppercase tracking-wide text-[#8B98B0]">{stageOf(m)}</span>
                                  <Link href={`/matches/${m.match_id}`} className="min-w-0 flex-1 truncate text-[#E6EDF7] hover:text-[#22D3EE]">{m.title}</Link>
                                  <span className={m.played ? 'text-[#34D399]' : 'text-[#8B98B0]'}>{m.played ? 'played' : m.status}</span>
                                  {m.role === 'recording' && m.played && <span className={m.vod ? 'text-[#34D399]' : 'text-[#F59E0B]'}>{m.vod ? 'VOD up' : 'no VOD'}</span>}
                                  {m.no_show ? (
                                    <span className="flex items-center gap-2">
                                      <span className="rounded bg-[#F87171]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#F87171]" title={`${m.no_show_by_alias || 'staff'}${m.no_show_at ? ` · ${new Date(m.no_show_at).toLocaleDateString()}` : ''}${m.no_show_note ? ` · ${m.no_show_note}` : ''}`}>No-show</span>
                                      {m.no_show_note && <span className="text-[#8B98B0]">“{m.no_show_note}”</span>}
                                      <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); setNote(''); setNoShow(p, m, false); }} className="text-[#8B98B0] hover:text-[#E6EDF7]">clear</button>
                                    </span>
                                  ) : data.no_show_installed && m.played ? (
                                    <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); setNote(''); setMarking({ person: p, match: m }); }} className="text-[#8B98B0] hover:text-[#F87171]">didn't show</button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 px-4 text-[11px] text-[#8B98B0]">
              Worked / signed up. "Worked" counts matches that were played with the person on crew and not marked as a no-show. {data.matches_played} match{data.matches_played === 1 ? '' : 'es'} played this season. Click a row for the matches.
            </p>
          </div>
        )}

        {data && data.idle.length > 0 && (
          <div className="mt-3 border-t border-white/[0.06] px-4 pt-3">
            <button type="button" onClick={() => setShowIdle((v) => !v)} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7]">
              {showIdle ? 'Hide' : 'Show'} the {data.idle.length} eligible {data.idle.length === 1 ? 'person' : 'people'} with no sign-ups this season
            </button>
            {showIdle && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {data.idle.map((p) => (
                  <li key={p.player_id} className="rounded-md bg-white/5 px-2 py-1 text-xs text-[#E6EDF7]">{p.alias} <span className="text-[10px] uppercase tracking-wide text-[#8B98B0]">{roleTag(p.ctf_role)}</span></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      {marking && (
        <Modal title={`Mark ${marking.person.alias} as a no-show`} hint={`${ROLE_LONG[marking.match.role]} on ${marking.match.title}, ${when(marking.match.scheduled_at)}. Only admins see this.`} onClose={() => setMarking(null)}
          actions={<><button type="button" onClick={() => setMarking(null)} className={btnQuiet}>Cancel</button><button type="button" disabled={busy} onClick={() => setNoShow(marking.person, marking.match, true)} className={btnDanger + ' bg-[#F87171]/10'}>{busy ? 'Saving…' : 'Mark no-show'}</button></>}>
          <label className={labelCls}>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. never joined the arena; Soup reffed instead" maxLength={300} className={inputCls} />
        </Modal>
      )}
    </>
  );
}

/** A keyed pair of table rows (the person and their expanded matches). */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
