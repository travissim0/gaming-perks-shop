import 'server-only';
import { serviceClient } from './service-client';
import { z } from 'zod';
import { Actor, TournamentError, accountIdSchema } from './contracts';
import { readerIdentity } from './reader';
import { RpcPort, TournamentRepository } from './repository';

export function tournamentEnabled() {
  return process.env.DUELING_TOURNAMENT_ENABLED === 'true';
}

class SupabaseRpcPort implements RpcPort {
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await serviceClient().rpc(name, args);
    if (error) {
      const status = /^PT(4\d\d)$/.exec(error.code ?? '');
      if (status) throw new TournamentError(error.code, error.message, Number(status[1]));
      console.error('dueling_tournament_rpc_failed', { procedure: name, code: error.code });
      throw new TournamentError(
        'unavailable',
        'Tournament services are temporarily unavailable. Please retry.',
        503,
      );
    }
    return data;
  }
}

export function serverRepository() {
  if (!tournamentEnabled())
    throw new TournamentError('unavailable', 'Tournament services are not available yet.', 503);
  return new TournamentRepository(new SupabaseRpcPort());
}

export async function verifiedActor(request: Request, required: boolean): Promise<Actor | null> {
  const header = request.headers.get('authorization');
  if (!header) {
    if (required)
      throw new TournamentError('unauthorized', 'Sign in to your Freeinf account.', 401);
    return null;
  }
  const match = /^Bearer ([^\s]{20,8192})$/.exec(header);
  if (!match)
    throw new TournamentError(
      'unauthorized',
      'Your session could not be verified. Please sign in again.',
      401,
    );
  const { data, error } = await serviceClient().auth.getUser(match[1]);
  if (error || !data.user)
    throw new TournamentError(
      'unauthorized',
      'Your session has expired. Please sign in again.',
      401,
    );
  const identity = accountIdSchema.safeParse(data.user.id);
  if (!identity.success)
    throw new TournamentError(
      'unauthorized',
      'Your Freeinf account ID could not be verified.',
      401,
    );
  const userId = identity.data;
  const capabilities = await serverRepository().capabilities(userId);
  // Owner-confirmed mapping: profiles.id equals auth.users.id; alias is display-only.
  const { data: profile, error: profileError } = await serviceClient()
    .from('profiles')
    .select('in_game_alias')
    .eq('id', userId)
    .maybeSingle();
  if (profileError)
    throw new TournamentError(
      'profile_unavailable',
      'Your Freeinf profile could not be loaded.',
      503,
    );
  const parsed = z.object({ in_game_alias: z.string().nullable() }).nullable().safeParse(profile);
  if (!parsed.success)
    throw new TournamentError(
      'profile_unavailable',
      'Your Freeinf profile could not be loaded.',
      503,
    );
  return { userId, alias: parsed.data?.in_game_alias ?? null, director: capabilities.director };
}

export async function requireExistingStaffAccount(userId: string) {
  if (!accountIdSchema.safeParse(userId).success)
    throw new TournamentError('invalid_account', 'Enter the existing Freeinf account ID.', 422);
  const { data, error } = await serviceClient().auth.admin.getUserById(userId);
  if (error || !data.user)
    throw new TournamentError('invalid_account', 'That Freeinf account could not be found.', 422);
}

export async function publicReadLimit(request: Request): Promise<void> {
  const id = readerIdentity(request, {
    secret: process.env.DUELING_TOURNAMENT_RATE_SECRET,
    vercel: process.env.VERCEL === '1',
    localTest: process.env.DUELING_TOURNAMENT_LOCAL_TEST === 'true',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const { data, error } = await serviceClient().rpc('dueling_tournament_rate_check', {
    p_key: `request:${id}`,
    p_limit: 240,
  });
  if (error || data !== true)
    throw new TournamentError(
      'busy',
      'Too many tournament requests. Please retry shortly.',
      error ? 503 : 429,
    );
}
