import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { requireZoneAdmin } from '@/lib/adminApiAuth';
import { recomputeAllRatings } from '@/lib/uslMix/ingest';
import { ELO } from '@/lib/uslMix/elo';

/**
 * POST /api/usl-mix/admin/recompute - wipe ratings and replay every mix game with the
 * constants currently in src/lib/uslMix/elo.ts. Zone admins only. Use after tuning the formula.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireZoneAdmin(request);
  if (!auth.ok) return auth.response!;
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
