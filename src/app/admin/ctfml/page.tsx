'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';

interface Season {
  id: string;
  season_number: number;
  season_name: string | null;
  status: string;
}

interface Squad {
  id: string;
  squad_name: string;
  squad_tag: string | null;
}

interface MatchRow {
  id: string;
  match_date: string;
  side_a_result: string | null;
  side_b_result: string | null;
  match_type: string;
  side_a_squad1_id: string;
  side_a_squad2_id: string;
  side_b_squad1_id: string;
  side_b_squad2_id: string;
}

const EMPTY_MATCH = {
  a1: '', a2: '', b1: '', b2: '',
  winner: 'A' as 'A' | 'B',
  matchType: 'Season',
  matchDate: new Date().toISOString().split('T')[0],
  arena: '',
  isOvertime: false,
  noShowA: false,
  noShowB: false,
  mvp: '',
};

export default function CtfmlAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // New season form
  const [newSeason, setNewSeason] = useState({ number: '', name: '', status: 'upcoming' });

  // Match form
  const [m, setM] = useState({ ...EMPTY_MATCH });

  const squadName = useCallback(
    (id: string) => squads.find((s) => s.id === id)?.squad_name ?? '—',
    [squads],
  );

  // ---- auth gate ----
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin, ctf_role')
        .eq('id', user.id)
        .single();
      const ok = data && (data.is_admin === true || data.ctf_role === 'ctf_admin');
      if (!ok) {
        toast.error('Unauthorized: CTF Admin access required');
        router.push('/dashboard');
        return;
      }
      setAuthorized(true);
    })();
  }, [user, authLoading, router]);

  // ---- data loads ----
  const loadSeasons = useCallback(async () => {
    const { data, error } = await supabase
      .from('ctfml_seasons')
      .select('id, season_number, season_name, status')
      .order('season_number', { ascending: false });
    if (error) { toast.error('Failed to load seasons'); return; }
    const list = (data as Season[]) || [];
    setSeasons(list);
    setSelectedSeasonId((cur) => cur || list.find((s) => s.status === 'active')?.id || list[0]?.id || '');
  }, []);

  const loadSquads = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_ctfml_squads_with_counts');
    if (error) { toast.error('Failed to load squads'); return; }
    setSquads(((data as any[]) || []).map((s) => ({ id: s.id, squad_name: s.squad_name, squad_tag: s.squad_tag })));
  }, []);

  const loadMatches = useCallback(async (seasonId: string) => {
    if (!seasonId) { setMatches([]); return; }
    const { data, error } = await supabase
      .from('ctfml_matches')
      .select('id, match_date, side_a_result, side_b_result, match_type, side_a_squad1_id, side_a_squad2_id, side_b_squad1_id, side_b_squad2_id')
      .eq('season_id', seasonId)
      .order('match_date', { ascending: false })
      .limit(25);
    if (error) { toast.error('Failed to load matches'); return; }
    setMatches((data as MatchRow[]) || []);
  }, []);

  useEffect(() => { if (authorized) { loadSeasons(); loadSquads(); } }, [authorized, loadSeasons, loadSquads]);
  useEffect(() => { if (authorized) loadMatches(selectedSeasonId); }, [authorized, selectedSeasonId, loadMatches]);

  // ---- create season ----
  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(newSeason.number, 10);
    if (!num) { toast.error('Season number required'); return; }
    setSubmitting(true);
    try {
      // If marking active, demote any currently-active season first.
      if (newSeason.status === 'active') {
        await supabase.from('ctfml_seasons').update({ status: 'completed' }).eq('status', 'active');
      }
      const { error } = await supabase.from('ctfml_seasons').insert({
        season_number: num,
        season_name: newSeason.name.trim() || null,
        status: newSeason.status,
      });
      if (error) throw error;
      toast.success(`Season ${num} created`);
      setNewSeason({ number: '', name: '', status: 'upcoming' });
      loadSeasons();
    } catch (err: any) {
      if (err.code === '23505') toast.error('That season number already exists');
      else toast.error('Failed to create season: ' + (err?.message || 'error'));
    } finally {
      setSubmitting(false);
    }
  };

  const setSeasonStatus = async (seasonId: string, status: string) => {
    try {
      if (status === 'active') {
        await supabase.from('ctfml_seasons').update({ status: 'completed' }).eq('status', 'active');
      }
      const { error } = await supabase.from('ctfml_seasons').update({ status }).eq('id', seasonId);
      if (error) throw error;
      toast.success('Season updated');
      loadSeasons();
    } catch (err: any) {
      toast.error('Failed: ' + (err?.message || 'error'));
    }
  };

  // ---- record match ----
  const handleRecordMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedSeasonId) { toast.error('Select a season first'); return; }

    const picks = [m.a1, m.a2, m.b1, m.b2];
    if (picks.some((p) => !p)) { toast.error('Pick all four squads'); return; }
    if (new Set(picks).size !== 4) { toast.error('All four squads must be different'); return; }

    // CTFML is pure win/loss. Derive each side's result from no-show flags
    // and the winner pick.
    let resultA: string;
    let resultB: string;
    if (m.noShowA && m.noShowB) {
      resultA = 'No Show'; resultB = 'No Show';
    } else if (m.noShowA) {
      resultA = 'No Show'; resultB = 'Win';
    } else if (m.noShowB) {
      resultB = 'No Show'; resultA = 'Win';
    } else {
      resultA = m.winner === 'A' ? 'Win' : 'Loss';
      resultB = m.winner === 'A' ? 'Loss' : 'Win';
    }

    setSubmitting(true);
    try {
      const { data: match, error: insErr } = await supabase
        .from('ctfml_matches')
        .insert({
          season_id: selectedSeasonId,
          side_a_squad1_id: m.a1,
          side_a_squad2_id: m.a2,
          side_b_squad1_id: m.b1,
          side_b_squad2_id: m.b2,
          side_a_result: resultA,
          side_b_result: resultB,
          match_type: m.matchType,
          match_date: m.matchDate,
          arena_name: m.arena.trim() || null,
          is_overtime: m.isOvertime,
          mvp_player_name: m.mvp.trim() || null,
          created_by: user.id,
          game_id: `CTFML_${Date.now()}`,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // Propagate result to all four squads' standings (Season matches only — the RPC enforces that).
      const { error: rpcErr } = await supabase.rpc('update_ctfml_standings', { p_match_id: match.id });
      if (rpcErr) throw rpcErr;

      toast.success('Match recorded' + (m.matchType === 'Season' ? ' and standings updated' : ''));
      setM({ ...EMPTY_MATCH });
      loadMatches(selectedSeasonId);
    } catch (err: any) {
      console.error('Record match error:', err);
      toast.error('Failed to record match: ' + (err?.message || 'error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Squad <select> that hides squads already chosen in other slots.
  const SquadSelect = ({ value, onChange, exclude }: { value: string; onChange: (v: string) => void; exclude: string[] }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300"
    >
      <option value="">— select squad —</option>
      {squads
        .filter((s) => s.id === value || !exclude.includes(s.id))
        .map((s) => (
          <option key={s.id} value={s.id}>
            {s.squad_name}{s.squad_tag ? ` [${s.squad_tag}]` : ''}
          </option>
        ))}
    </select>
  );

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="pt-32 text-center text-white/60">Checking access…</div>
      </div>
    );
  }

  const inputCls = 'w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300';

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-20">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent">
            CTFML Admin
          </h1>
          <Link href="/league/ctfml" className="text-sm text-emerald-300 hover:text-emerald-200">
            View CTFML →
          </Link>
        </div>

        {/* ---- Seasons ---- */}
        <section className="mb-10 bg-gray-900/50 border border-emerald-400/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-emerald-200 mb-4">Seasons</h2>

          <form onSubmit={handleCreateSeason} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
            <input
              type="number" placeholder="Number *" value={newSeason.number}
              onChange={(e) => setNewSeason({ ...newSeason, number: e.target.value })}
              className={inputCls}
            />
            <input
              type="text" placeholder="Name (optional)" value={newSeason.name}
              onChange={(e) => setNewSeason({ ...newSeason, name: e.target.value })}
              className={`${inputCls} sm:col-span-2`}
            />
            <select
              value={newSeason.status}
              onChange={(e) => setNewSeason({ ...newSeason, status: e.target.value })}
              className={inputCls}
            >
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
            <button
              type="submit" disabled={submitting}
              className="sm:col-span-4 justify-self-start bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              + Create Season
            </button>
          </form>

          {seasons.length === 0 ? (
            <p className="text-white/50 text-sm">No seasons yet.</p>
          ) : (
            <div className="space-y-2">
              {seasons.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-gray-950/60 border border-white/10 rounded-lg px-4 py-2">
                  <span className="text-sm">
                    <span className="font-semibold text-white">{s.season_name || `Season ${s.season_number}`}</span>
                    <span className="text-white/40 ml-2">#{s.season_number}</span>
                  </span>
                  <select
                    value={s.status}
                    onChange={(e) => setSeasonStatus(s.id, e.target.value)}
                    className="bg-gray-900 border border-emerald-400/30 rounded-md px-2 py-1 text-xs"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---- Record match ---- */}
        <section className="mb-10 bg-gray-900/50 border border-emerald-400/20 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-emerald-200">Record Match</h2>
            <select
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— season —</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.season_name || `Season ${s.season_number}`}{s.status === 'active' ? ' (active)' : ''}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleRecordMatch} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Side A */}
              <div className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-emerald-200">Side A</h3>
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input type="checkbox" checked={m.noShowA} onChange={(e) => setM({ ...m, noShowA: e.target.checked })} />
                    No-show
                  </label>
                </div>
                <SquadSelect value={m.a1} onChange={(v) => setM({ ...m, a1: v })} exclude={[m.a2, m.b1, m.b2]} />
                <SquadSelect value={m.a2} onChange={(v) => setM({ ...m, a2: v })} exclude={[m.a1, m.b1, m.b2]} />
              </div>

              {/* Side B */}
              <div className="bg-sky-500/5 border border-sky-400/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sky-200">Side B</h3>
                  <label className="flex items-center gap-2 text-xs text-white/70">
                    <input type="checkbox" checked={m.noShowB} onChange={(e) => setM({ ...m, noShowB: e.target.checked })} />
                    No-show
                  </label>
                </div>
                <SquadSelect value={m.b1} onChange={(v) => setM({ ...m, b1: v })} exclude={[m.a1, m.a2, m.b2]} />
                <SquadSelect value={m.b2} onChange={(v) => setM({ ...m, b2: v })} exclude={[m.a1, m.a2, m.b1]} />
              </div>
            </div>

            {/* Winner */}
            {!m.noShowA && !m.noShowB ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-sm text-white/60">Winner:</span>
                <div className="inline-flex rounded-lg overflow-hidden border border-emerald-400/40">
                  <button
                    type="button"
                    onClick={() => setM({ ...m, winner: 'A' })}
                    className={`px-5 py-2 text-sm font-medium transition-colors ${m.winner === 'A' ? 'bg-emerald-500/30 text-emerald-100' : 'bg-gray-900 text-white/60 hover:bg-gray-800'}`}
                  >
                    Side A
                  </button>
                  <button
                    type="button"
                    onClick={() => setM({ ...m, winner: 'B' })}
                    className={`px-5 py-2 text-sm font-medium transition-colors ${m.winner === 'B' ? 'bg-sky-500/30 text-sky-100' : 'bg-gray-900 text-white/60 hover:bg-gray-800'}`}
                  >
                    Side B
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-amber-300/80">
                No-show recorded — the other side is awarded the win.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">Type</label>
                <select value={m.matchType} onChange={(e) => setM({ ...m, matchType: e.target.value })} className={inputCls}>
                  <option value="Season">Season</option>
                  <option value="Playoffs">Playoffs</option>
                  <option value="Finals">Finals</option>
                  <option value="Friendly">Friendly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Date</label>
                <input type="date" value={m.matchDate} onChange={(e) => setM({ ...m, matchDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Arena (optional)</label>
                <input type="text" value={m.arena} onChange={(e) => setM({ ...m, arena: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">MVP (optional)</label>
                <input type="text" value={m.mvp} onChange={(e) => setM({ ...m, mvp: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={m.isOvertime} onChange={(e) => setM({ ...m, isOvertime: e.target.checked })} />
                Overtime (record only — does not change points)
              </label>
              <button
                type="submit" disabled={submitting}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 rounded-lg font-medium disabled:opacity-50"
              >
                {submitting ? 'Recording…' : 'Record Match'}
              </button>
            </div>
          </form>
        </section>

        {/* ---- Recent matches ---- */}
        <section className="bg-gray-900/50 border border-emerald-400/20 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-emerald-200 mb-4">Recent Matches</h2>
          {matches.length === 0 ? (
            <p className="text-white/50 text-sm">No matches recorded for this season.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((mr) => {
                const aWon = mr.side_a_result === 'Win';
                const bWon = mr.side_b_result === 'Win';
                return (
                  <div key={mr.id} className="flex items-center justify-between bg-gray-950/60 border border-white/10 rounded-lg px-4 py-2 text-sm">
                    <span>
                      <span className={aWon ? 'text-emerald-300 font-semibold' : 'text-white/50'}>
                        {squadName(mr.side_a_squad1_id)} + {squadName(mr.side_a_squad2_id)}
                      </span>
                      <span className="mx-2 text-white/40">vs</span>
                      <span className={bWon ? 'text-emerald-300 font-semibold' : 'text-white/50'}>
                        {squadName(mr.side_b_squad1_id)} + {squadName(mr.side_b_squad2_id)}
                      </span>
                    </span>
                    <span className="text-white/40 text-xs">{mr.match_type} · {new Date(mr.match_date).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
