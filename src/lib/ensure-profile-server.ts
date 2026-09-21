import { createClient, type User } from '@supabase/supabase-js';

/*
 * Make sure a signed-in user has a row in `profiles`, and create one from their auth record if not.
 *
 * Why this exists: web sign-up creates the auth user and then inserts the profile from the browser.
 * With email verification on there is no session at that moment, so the insert is refused by row
 * security and the error is swallowed. The player confirms their email, signs in, and every screen
 * that needs a profile row fails ("Profile not found", foreign-key errors on aliases, invisible in
 * user management). Server-side, with the service key, the row can always be created.
 *
 * The alias is taken from the sign-up metadata (options.data.in_game_alias); if there is none the
 * row is created with a null alias and the site's complete-profile flow asks for one.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_AVATAR = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/site-avatars/a7inf2.png`;

export interface EnsuredProfile {
  id: string;
  in_game_alias: string | null;
  is_league_banned: boolean;
  created: boolean;
}

export async function ensureProfile(user: User): Promise<EnsuredProfile | null> {
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id, in_game_alias, is_league_banned')
    .eq('id', user.id)
    .maybeSingle();
  if (existing) return { ...existing, is_league_banned: !!existing.is_league_banned, created: false };

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const alias = typeof meta.in_game_alias === 'string' && meta.in_game_alias.trim() ? meta.in_game_alias.trim() : null;
  const now = new Date().toISOString();

  const { data: inserted, error } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email,
      in_game_alias: alias,
      avatar_url: DEFAULT_AVATAR,
      registration_status: alias ? 'completed' : 'pending',
      last_seen: now,
    })
    .select('id, in_game_alias, is_league_banned')
    .maybeSingle();

  if (error) {
    // A concurrent request may have created it first; re-read before giving up.
    if (error.code === '23505') {
      const { data: again } = await supabaseAdmin.from('profiles').select('id, in_game_alias, is_league_banned').eq('id', user.id).maybeSingle();
      return again ? { ...again, is_league_banned: !!again.is_league_banned, created: false } : null;
    }
    console.error('ensureProfile insert failed:', error.message);
    return null;
  }
  if (inserted) console.log(`ensureProfile: created missing profile for ${user.email} (${alias ?? 'no alias'})`);
  return inserted ? { ...inserted, is_league_banned: !!inserted.is_league_banned, created: true } : null;
}
