'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const visibilityKey = 'freeinf:tournament-visibility:v1';
let visibilityRequest: Promise<boolean> | undefined;

function sessionVisibility(): Promise<boolean> {
  if (visibilityRequest) return visibilityRequest;
  try {
    const stored = sessionStorage.getItem(visibilityKey);
    if (stored === 'true' || stored === 'false') return Promise.resolve(stored === 'true');
  } catch {
    /* Fall back to one shared request for this document. */
  }
  visibilityRequest = fetch('/api/ctf/dueling-tournaments/status', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Feature status unavailable');
      const value: unknown = await response.json();
      const enabled = Boolean(
        value && typeof value === 'object' && 'enabled' in value && value.enabled === true,
      );
      try {
        sessionStorage.setItem(visibilityKey, String(enabled));
      } catch {
        /* Storage is optional. */
      }
      return enabled;
    })
    .catch(() => false);
  return visibilityRequest;
}

export function useTournamentEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void sessionVisibility().then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}

export function TournamentFeatureLink({ className }: { className: string }) {
  return useTournamentEnabled() ? (
    <Link href="/dueling-tournament" className={className}>
      Tournaments
    </Link>
  ) : null;
}
