'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { secondsLeft, type DraftBundle } from '@/lib/ctfdl-draft';

/**
 * Live draft state for the lobby / recap / admin pages.
 *
 * - Fetches the board from /api/ctfdl/draft (with the viewer's token if signed in).
 * - Subscribes to Realtime changes on the draft row + picks and refetches.
 * - Polls every few seconds while live as a fallback.
 * - Runs a 1s clock corrected by the server's timestamp, and pokes /tick
 *   once per turn when the clock hits zero (server decides whether to auto-pick).
 * - Tracks presence so the lobby can show how many people are watching.
 */
export function useDraft(opts: { draftId?: string | null; seasonId?: string | null; presence?: boolean } = {}) {
  const { draftId, seasonId, presence = false } = opts;
  const [bundle, setBundle] = useState<DraftBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [viewers, setViewers] = useState(0);
  const offsetRef = useRef(0);
  const lastTickedPick = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch {
      return {};
    }
  }, []);

  const refetch = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      try {
        const params = new URLSearchParams();
        if (draftId) params.set('draft', draftId);
        else if (seasonId) params.set('season', seasonId);
        const res = await fetch(`/api/ctfdl/draft?${params.toString()}`, { headers: await authHeaders(), cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load draft (${res.status})`);
        const json: DraftBundle = await res.json();
        offsetRef.current = new Date(json.server_time).getTime() - Date.now();
        setBundle(json);
        setError(null);
      } catch (e: any) {
        setError(e.message || 'Failed to load draft');
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [draftId, seasonId, authHeaders]);

  /** Apply a bundle returned by an action response without waiting for a refetch. */
  const applyBundle = useCallback((b: DraftBundle | undefined | null) => {
    if (!b) return;
    offsetRef.current = new Date(b.server_time).getTime() - Date.now();
    setBundle(b);
  }, []);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  // Realtime + presence
  const liveId = bundle?.draft?.id || null;
  useEffect(() => {
    if (!liveId) return;
    const channel = supabase.channel(`ctfdl-draft-${liveId}`, { config: { presence: { key: Math.random().toString(36).slice(2) } } });
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ctfdl_drafts', filter: `id=eq.${liveId}` }, () => { refetch(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ctfdl_draft_picks', filter: `draft_id=eq.${liveId}` }, () => { refetch(); });
    if (presence) {
      channel.on('presence', { event: 'sync' }, () => {
        setViewers(Object.keys(channel.presenceState()).length);
      });
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && presence) channel.track({ at: Date.now() });
    });
    return () => { supabase.removeChannel(channel); };
  }, [liveId, presence, refetch]);

  // Polling fallback while the draft is running
  const status = bundle?.draft?.status;
  useEffect(() => {
    if (status !== 'live' && status !== 'paused') return;
    const t = setInterval(() => { refetch(); }, 5000);
    return () => clearInterval(t);
  }, [status, refetch]);

  // 1s clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + offsetRef.current;
  const clock = secondsLeft(bundle?.draft || null, serverNow);

  // Poke the server when the clock expires (once per turn)
  useEffect(() => {
    const d = bundle?.draft;
    if (!d || d.status !== 'live' || d.pick_seconds == null || clock == null || clock > 0) return;
    if (lastTickedPick.current === d.current_pick) return;
    lastTickedPick.current = d.current_pick;
    (async () => {
      try {
        await fetch('/api/ctfdl/draft/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id: d.id }) });
      } catch { /* polling will catch up */ }
      setTimeout(() => refetch(), 800);
    })();
  }, [bundle, clock, refetch]);

  return { bundle, loading, error, refetch, applyBundle, clock, serverNow, viewers, authHeaders };
}
