import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

/**
 * Resolve the caller from the Authorization bearer token, matching the pattern the
 * map-vote API already uses. Returns null for anonymous callers - reads stay open to
 * them, only voting requires an account.
 */
export async function getVoter(request: NextRequest): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  return user ? { id: user.id } : null;
}
