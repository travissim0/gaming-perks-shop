'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import CtfmlBackground from '@/components/ctfml/CtfmlBackground';
import CtfmlHeader from '@/components/ctfml/CtfmlHeader';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

interface CtfmlSquad {
  id: string;
  squad_name: string;
  squad_tag: string | null;
  squad_banner_url: string | null;
  owner_id: string;
  owner_alias: string;
  created_at: string;
  is_active: boolean;
  member_count: number;
  max_players: number;
}

interface UserSquad {
  id: string;
  squad_name: string;
  owner_id: string;
  role: string;
}

export default function CtfmlSquadsPage() {
  const { user } = useAuth();
  const [squads, setSquads] = useState<CtfmlSquad[]>([]);
  const [userSquad, setUserSquad] = useState<UserSquad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    tag: '',
    password: '',
    confirm: '',
    bannerFile: null as File | null,
  });

  // Join modal
  const [joinTarget, setJoinTarget] = useState<CtfmlSquad | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  const loadSquads = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_ctfml_squads_with_counts');
      if (error) throw error;
      setSquads((data as CtfmlSquad[]) || []);
    } catch (err: any) {
      console.error('Error loading CTFML squads:', err);
      setError(err?.message || 'Failed to load squads');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUserSquad = useCallback(async () => {
    if (!user) {
      setUserSquad(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('ctfml_squad_members')
        .select('role, ctfml_squads!inner(id, squad_name, owner_id, is_active)')
        .eq('player_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data && (data as any).ctfml_squads?.is_active) {
        const sq = (data as any).ctfml_squads;
        setUserSquad({ id: sq.id, squad_name: sq.squad_name, owner_id: sq.owner_id, role: (data as any).role });
      } else {
        setUserSquad(null);
      }
    } catch (err: any) {
      console.error('Error loading user squad:', err);
      setUserSquad(null);
    }
  }, [user]);

  useEffect(() => {
    loadSquads();
  }, [loadSquads]);

  useEffect(() => {
    loadUserSquad();
  }, [loadUserSquad]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (createForm.password !== createForm.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (createForm.password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }

    setSubmitting(true);
    try {
      let bannerUrl: string | null = null;
      if (createForm.bannerFile) {
        const ext = createForm.bannerFile.name.split('.').pop();
        const path = `ctfml-banners/squad_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, createForm.bannerFile);
        if (upErr) throw upErr;
        bannerUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }

      // Trigger encrypts the password on insert.
      const { data: squad, error: sqErr } = await supabase
        .from('ctfml_squads')
        .insert({
          squad_name: createForm.name.trim(),
          squad_tag: createForm.tag.trim() || null,
          squad_password_hash: createForm.password,
          squad_banner_url: bannerUrl,
          owner_id: user.id,
        })
        .select()
        .single();
      if (sqErr) throw sqErr;

      const { error: memErr } = await supabase
        .from('ctfml_squad_members')
        .insert({ squad_id: squad.id, player_id: user.id, role: 'owner' });
      if (memErr) throw memErr;

      toast.success('Squad created!');
      setShowCreate(false);
      setCreateForm({ name: '', tag: '', password: '', confirm: '', bannerFile: null });
      loadSquads();
      loadUserSquad();
    } catch (err: any) {
      console.error('Error creating squad:', err);
      if (err.code === '23505') toast.error('Squad name already taken');
      else toast.error('Failed to create squad: ' + (err?.message || 'unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinTarget) return;

    setSubmitting(true);
    try {
      const { data: verified, error: vErr } = await supabase.rpc('ctfml_verify_squad_password', {
        squad_name_input: joinTarget.squad_name,
        password_input: joinPassword,
      });
      if (vErr) throw vErr;
      if (!verified) {
        toast.error('Invalid password');
        setSubmitting(false);
        return;
      }

      const { data: canJoin, error: cErr } = await supabase.rpc('ctfml_can_join_squad', {
        squad_id_input: joinTarget.id,
        user_id_input: user.id,
      });
      if (cErr) throw cErr;
      if (!canJoin) {
        toast.error('Squad is full or you are already a member');
        setSubmitting(false);
        return;
      }

      const { error: jErr } = await supabase
        .from('ctfml_squad_members')
        .insert({ squad_id: joinTarget.id, player_id: user.id, role: 'player' });
      if (jErr) throw jErr;

      toast.success(`Joined ${joinTarget.squad_name}!`);
      setJoinTarget(null);
      setJoinPassword('');
      loadSquads();
      loadUserSquad();
    } catch (err: any) {
      console.error('Error joining squad:', err);
      toast.error('Failed to join: ' + (err?.message || 'unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CtfmlBackground opacity={0.16}>
      <CtfmlHeader currentPage="squads" />

      <div className="relative pt-32 pb-20 z-10 max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300 bg-clip-text text-transparent drop-shadow-lg">
              CTFML Squads
            </h1>
            <p className="text-white/80 mt-2">Up to 7 players each · 5 starters per match.</p>
          </div>

          {/* Action area */}
          <div>
            {!user && (
              <Link
                href="/auth/login"
                className="inline-block bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 px-5 py-2.5 rounded-lg hover:bg-emerald-500/30 transition-colors"
              >
                Log in to create or join
              </Link>
            )}
            {user && userSquad && (
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-400/30 rounded-lg px-4 py-2.5">
                <span className="text-sm text-white/80">
                  Your squad: <span className="text-emerald-200 font-semibold">{userSquad.squad_name}</span>
                </span>
                <Link
                  href={`/league/ctfml/squads/${userSquad.id}`}
                  className="text-sm px-3 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 transition-colors"
                >
                  Manage →
                </Link>
              </div>
            )}
            {user && !userSquad && (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-medium px-5 py-2.5 rounded-lg shadow-lg transition-all"
              >
                + Create Squad
              </button>
            )}
          </div>
        </div>

        {loading && <div className="text-center py-20 text-white/70">Loading squads…</div>}

        {error && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-6 text-red-200">{error}</div>
        )}

        {!loading && !error && squads.length === 0 && (
          <div className="bg-emerald-400/5 border border-emerald-300/30 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">🛡️</div>
            <h2 className="text-2xl font-bold text-emerald-200 mb-2">No squads yet</h2>
            <p className="text-white/70">
              {user ? 'Be the first — create a squad to get started.' : 'Log in to create the first CTFML squad.'}
            </p>
          </div>
        )}

        {!loading && !error && squads.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {squads.map((squad) => {
              const isFull = squad.member_count >= squad.max_players;
              const canJoin = user && !userSquad && !isFull;
              return (
                <div
                  key={squad.id}
                  className="bg-gradient-to-br from-emerald-400/5 to-teal-600/10 backdrop-blur-sm border border-emerald-300/30 rounded-2xl p-6 hover:border-emerald-200/60 hover:shadow-2xl hover:shadow-emerald-400/20 transition-all duration-300"
                >
                  <div className="flex items-center gap-4 mb-4">
                    {squad.squad_banner_url ? (
                      <img
                        src={squad.squad_banner_url}
                        alt={squad.squad_name}
                        className="w-14 h-14 rounded-lg object-cover border border-emerald-400/40"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-emerald-400/40 flex items-center justify-center text-xl font-black text-emerald-200">
                        {(squad.squad_tag || squad.squad_name)[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link
                        href={`/league/ctfml/squads/${squad.id}`}
                        className="text-lg font-bold text-white truncate hover:text-emerald-200 transition-colors block"
                      >
                        {squad.squad_name}
                      </Link>
                      {squad.squad_tag && (
                        <span className="text-xs text-emerald-300 font-mono">[{squad.squad_tag}]</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm mb-4">
                    <span className="text-white/70">
                      Captain: <span className="text-teal-200">{squad.owner_alias}</span>
                    </span>
                    <span className={`px-2 py-1 rounded-md border font-medium ${isFull ? 'bg-rose-500/15 border-rose-400/30 text-rose-200' : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'}`}>
                      {squad.member_count}/{squad.max_players}
                    </span>
                  </div>

                  {canJoin && (
                    <button
                      onClick={() => { setJoinTarget(squad); setJoinPassword(''); }}
                      className="w-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 py-2 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm font-medium"
                    >
                      Join Squad
                    </button>
                  )}
                  {isFull && !userSquad && (
                    <div className="w-full text-center text-xs text-rose-300/80 py-2">Squad full</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-950 border border-emerald-400/40 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-emerald-200 mb-4">Create Squad</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">Squad name</label>
                <input
                  type="text" required minLength={3} maxLength={50}
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Tag (optional)</label>
                <input
                  type="text" maxLength={8}
                  value={createForm.tag}
                  onChange={(e) => setCreateForm({ ...createForm, tag: e.target.value })}
                  className="w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Password</label>
                  <input
                    type="password" required
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-1">Confirm</label>
                  <input
                    type="password" required
                    value={createForm.confirm}
                    onChange={(e) => setCreateForm({ ...createForm, confirm: e.target.value })}
                    className="w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Banner / logo (optional)</label>
                <input
                  type="file" accept="image/*"
                  onChange={(e) => setCreateForm({ ...createForm, bannerFile: e.target.files?.[0] || null })}
                  className="w-full text-sm text-white/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-emerald-500/20 file:text-emerald-200"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={submitting}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join modal */}
      {joinTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-gray-950 border border-emerald-400/40 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-emerald-200 mb-1">Join {joinTarget.squad_name}</h2>
            <p className="text-sm text-white/60 mb-4">Enter the squad password to join.</p>
            <form onSubmit={handleJoin} className="space-y-4">
              <input
                type="password" required autoFocus
                placeholder="Squad password"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                className="w-full bg-gray-900 border border-emerald-400/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-300"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setJoinTarget(null); setJoinPassword(''); }}
                  className="flex-1 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={submitting}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium disabled:opacity-50"
                >
                  {submitting ? 'Joining…' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </CtfmlBackground>
  );
}
