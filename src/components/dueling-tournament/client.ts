'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Command } from '@/lib/dueling-tournament/contracts';
import type { TournamentView } from '@/lib/dueling-tournament/view';
import { detailResponseSchema } from '@/lib/dueling-tournament/wire';

export const apiRoot = '/api/ctf/dueling-tournaments';
export class TournamentClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (data.session?.access_token)
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiRoot}${path}`, { ...init, headers, cache: 'no-store' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string(), code: z.string().optional() }).safeParse(payload);
    throw new TournamentClientError(
      error.success ? error.data.error : 'The request could not be completed. Please retry.',
      response.status,
      error.success ? (error.data.code ?? 'request_failed') : 'request_failed',
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new TournamentClientError(
      'Tournament data could not be read. Please refresh.',
      502,
      'invalid_response',
    );
  return parsed.data;
}

export function useTournament(locator: string, staff = false) {
  const { user, loading: authLoading } = useAuth();
  const [event, setEvent] = useState<TournamentView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const eventRef = useRef(event);
  eventRef.current = event;

  const refresh = useCallback(async () => {
    if (lock.current) return false;
    const version = ++generation.current;
    try {
      const result = await requestJson(`/${encodeURIComponent(locator)}`, detailResponseSchema);
      if (generation.current !== version) return false;
      setEvent(result.event);
      setError('');
      setLastFetched(Date.now());
      return true;
    } catch (failure) {
      if (generation.current === version) {
        if (failure instanceof TournamentClientError && [401, 403, 404].includes(failure.status))
          setEvent(null);
        setError(failure instanceof Error ? failure.message : 'Could not load the tournament.');
      }
      return false;
    } finally {
      if (generation.current === version) setLoading(false);
    }
  }, [locator]);

  const invalidateRequests = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    if (authLoading) return;
    // Clear role/private state immediately when the signed-in identity changes.
    setEvent(null);
    setLoading(true);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let delay = staff ? 5000 : 15000;
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === 'visible' && !lock.current) {
        const success = await refresh();
        delay = success ? (staff ? 5000 : 15000) : Math.min(delay * 2, 60000);
      }
      if (active) timer = setTimeout(poll, delay);
    };
    const visible = () => {
      if (document.visibilityState === 'visible') {
        delay = staff ? 5000 : 15000;
        void refresh();
      }
    };
    void poll();
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      invalidateRequests();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, staff, user?.id, authLoading, invalidateRequests]);

  const mutate = useCallback(
    async (command: Command) => {
      const current = eventRef.current;
      if (!current || lock.current) return false;
      lock.current = true;
      setBusy(true);
      const version = ++generation.current;
      try {
        const result = await requestJson(`/${encodeURIComponent(locator)}`, detailResponseSchema, {
          method: 'POST',
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            expectedRevision: current.revision,
            command,
          }),
        });
        if (generation.current !== version) return false;
        setEvent(result.event);
        setError('');
        setLastFetched(Date.now());
        return true;
      } catch (failure) {
        if (generation.current !== version) return false;
        if (
          failure instanceof TournamentClientError &&
          (failure.status === 401 || failure.status === 403)
        )
          setEvent(null);
        if (failure instanceof TournamentClientError && failure.status === 409) {
          try {
            const latest = await requestJson(
              `/${encodeURIComponent(locator)}`,
              detailResponseSchema,
            );
            if (generation.current === version) {
              setEvent(latest.event);
              setLastFetched(Date.now());
              setError(
                `${failure.message} The latest state is loaded. Review your retained input before submitting again.`,
              );
            }
          } catch {
            setError(
              'The event changed and could not be refreshed. Your input is retained. Refresh before submitting again.',
            );
          }
        } else
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not confirm the change. Refresh before retrying.',
          );
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [locator],
  );

  return {
    event,
    error,
    loading: loading || authLoading,
    busy,
    refresh,
    mutate,
    lastFetched,
    user,
  };
}

export function eventTime(value: string | null, full = false): string {
  if (!value) return 'To be announced';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    ...(full ? ({ month: 'short', day: 'numeric', weekday: 'short' } as const) : {}),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}
