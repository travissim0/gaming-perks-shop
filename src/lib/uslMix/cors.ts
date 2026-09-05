import { NextResponse } from 'next/server';

/**
 * The USL Mix GET endpoints are a public API: other community sites are meant to call
 * them from their own pages, so every response carries permissive CORS headers.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

export function corsJson(body: unknown, init?: { status?: number; cache?: number }) {
  const headers: Record<string, string> = { ...CORS_HEADERS };
  if (init?.cache && init.cache > 0) {
    headers['Cache-Control'] = `public, s-maxage=${init.cache}, stale-while-revalidate=${init.cache * 5}`;
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}

export function corsError(message: string, status: number, extra?: Record<string, unknown>) {
  return corsJson({ success: false, error: message, ...(extra || {}) }, { status });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function clampInt(v: string | null, dflt: number, min: number, max: number): number {
  const n = v === null ? NaN : parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
