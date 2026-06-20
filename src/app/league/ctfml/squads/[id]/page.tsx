'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import CtfmlBackground from '@/components/ctfml/CtfmlBackground';
import CtfmlHeader from '@/components/ctfml/CtfmlHeader';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

interface Squad {
  id: string;
  squad_name: string;
  squad_tag: string | null;
  squad_banner_url: string | null;
  owner_id: string;
  max_players: number;
  created_at: string;
  is_active: boolean;
}

interface Member {
  id: string;
  player_id: string;
  player_alias: string;
  player_avatar: string | null;
  joined_at: string;
  role: string;
}

const ROLE_BADGE: Record<string, { label: string; cls: string }> = {
  owner: { label: 'Owner', cls: 'bg-amber-500/20 border-amber-400/40 text-amber-200' },
  captain: { label: 'Captain', cls: 'bg-sky-500/20 border-sky-400/40 text-sky-200' },
  player: { label: 'Player', cls: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200' },
};

export default function CtfmlSquadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [squad, setSquad] = useState<Squad | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = !!user && !!squad && squad.owner_id === user.id;
  const isMember = !!user && members.some((m) => m.player_id === user.id);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data: sq, error: sqErr } = await supabase
        .from('ctfml_squads')
        .select('id, squad_name, squad_tag, squad_banner_url, owner_id, max_players, created_at, is_active')
        .eq('id', id)
        .maybeSingle();
      if (sqErr) throw sqErr;
      if (!sq) { setError('Squad not found'); setLoading(false); return; }
      setSquad(sq as Squad);

      const { data: mem, error: memErr } = await supabase.rpc('get_ctfml_squad_members', {
        squad_id_input: id,
      });
      if (memErr) throw memErr;
      setMembers((mem as Member[]) || []);
    } catch (err: any) {
      console.error('Error loading squad detail:', err);
      setError(err?.message || 'Failed to load squad');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (member: Member) => {
    if (!squad || !confirm(`Remove ${member.player_alias} from ${squad.squad_name}?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('ctfml_squad_members')
        .delete()
        .eq('squad_id', squad.id)
        .eq('player_id', member.player_id);
      if (error) throw error;
      toast.success(`Removed ${member.player_alias}`);
      load();
    } catch (err: any) {
      toast.error('Failed to remove: ' + (err?.message || 'error'));
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!squad || !user || !confirm(`Leave ${squad.squad_name}?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('ctfml_squad_members')
        .delete()
        .eq('squad_id', squad.id)
        .eq('player_id', user.id);
      if (error) throw error;
      toast.success('Left squad');
      router.push('/league/ctfml/squads');
    } catch (err: any) {
      toast.error('Failed to leave: ' + (err?.message || 'error'));
      setBusy(false);
    }
  };

  const handleDisband = async () => {
    if (!squad || !confirm(`Disband ${squad.squad_name}? This removes the squad and all its members.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('ctfml_squads').delete().eq('id', squad.id);
      if (error) throw error;
      toast.success('Squad disbanded');
      router.push('/league/ctfml/squads');
    } catch (err: any) {
      toast.error('Failed to disband: ' + (err?.message || 'error'));
      setBusy(false);
    }
  };

  return (
    <CtfmlBackground opacity={0.16}>
      <CtfmlHeader currentPage="squads" />

      <div className="relative pt-32 pb-20 z-10 max-w-3xl mx-auto px-6">
        <Link href="/league/ctfml/squads" className="text-sm text-emerald-300 hover:text-emerald-200">
          ← All squads
        </Link>

        {loading && <div className="text-center py-20 text-white/70">Loading…</div>}

        {error && !loading && (
          <div className="mt-6 bg-red-500/10 border border-red-400/30 rounded-xl p-6 text-red-200">{error}</div>
        )}

        {!loading && !error && squad && (
          <>
            {/* Header */}
            <div className="mt-4 flex items-center gap-5 mb-8 flex-wrap">
              {squad.squad_banner_url ? (
                <img
                  src={squad.squad_banner_url}
                  alt={squad.squad_name}
                  className="w-20 h-20 rounded-xl object-cover border border-emerald-400/40"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/40 flex items-center justify-center text-3xl font-black text-emerald-200">
                  {(squad.squad_tag || squad.squad_name)[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl md:text-4xl font-black text-white">{squad.squad_name}</h1>
                <div className="flex items-center gap-3 mt-1 text-sm text-white/70 flex-wrap">
                  {squad.squad_tag && <span className="text-emerald-300 font-mono">[{squad.squad_tag}]</span>}
                  <span>{members.length}/{squad.max_players} members</span>
                  <span className="text-white/40">·</span>
                  <span>since {new Date(squad.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Owner / member actions */}
              {isOwner && (
                <button
                  onClick={handleDisband}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/30 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Disband squad
                </button>
              )}
              {!isOwner && isMember && (
                <button
                  onClick={handleLeave}
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/30 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Leave squad
                </button>
              )}
            </div>

            {/* Roster */}
            <h2 className="text-lg font-bold text-emerald-200 mb-4">Roster</h2>
            {members.length === 0 ? (
              <p className="text-white/50 text-sm">No active members.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {members.map((mem) => {
                  const badge = ROLE_BADGE[mem.role] || ROLE_BADGE.player;
                  return (
                    <div
                      key={mem.id}
                      className="flex items-center gap-3 bg-gray-900/50 border border-emerald-400/20 rounded-xl px-4 py-3"
                    >
                      {mem.player_avatar ? (
                        <img src={mem.player_avatar} alt={mem.player_alias} className="w-10 h-10 rounded-full border border-emerald-400/30" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/30 flex items-center justify-center text-sm font-bold text-emerald-200">
                          {mem.player_alias[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-medium truncate">{mem.player_alias}</div>
                        <div className="text-xs text-white/40">
                          joined {new Date(mem.joined_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-md border ${badge.cls}`}>{badge.label}</span>
                      {/* Owner can remove any non-owner member */}
                      {isOwner && mem.role !== 'owner' && (
                        <button
                          onClick={() => handleRemove(mem)}
                          disabled={busy}
                          title="Remove from squad"
                          className="text-xs px-2 py-1 rounded-md bg-rose-500/15 border border-rose-400/30 text-rose-200 hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </CtfmlBackground>
  );
}
