import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { recomputeAllRatings } from '@/lib/uslMix/ingest';
import { ELO } from '@/lib/uslMix/elo';

/**
 * POST /api/usl-mix/admin/recompute - wipe ratings and replay every mix game with the
 * constants currently in src/lib/uslMix/elo.ts. Use after tuning the formula.
 * Auth: a zone admin's session token, or the zone's own USL_MIX_INGEST_KEY (as x-api-key or
 * Authorization: Bearer) - whoever can post games can replay them.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

function ingestKeyMatches(request: NextRequest): boolean {
  const expected = process.env.USL_MIX_INGEST_KEY;
  if (!expected) return false;
  const bearer = request.headers.get('Authorization');
  const given = request.headers.get('x-api-key') ?? (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null);
  return !!given && given === expected;
}

export async function POST(request: NextRequest) {
  if (!ingestKeyMatches(request)) {
    const auth = await requireZoneAdmin(request);
    if (!auth.ok) return auth.response!;
  }
  try {
    const result = await recomputeAllRatings(getServiceSupabase());
    return NextResponse.json({ success: true, ...result, constants: ELO });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'recompute failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ constants: ELO });
}
