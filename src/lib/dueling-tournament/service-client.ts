import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase } from '../supabase';
import { TournamentError } from './contracts';

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim())
    throw new TournamentError(
      'unavailable',
      'Tournament services are temporarily unavailable.',
      503,
    );
  // The shared helper otherwise falls back to the public client key. Check on
  // every call, including after it has been cached by another server route.
  return getServiceSupabase();
}
