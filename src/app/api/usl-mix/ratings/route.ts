import { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { corsError, corsJson, corsPreflight } from '@/lib/uslMix/cors';
import { ELO } from '@/lib/uslMix/elo';
import { aliasKey } from '@/lib/uslMix/types';

/**
 * GET /api/usl-mix/ratings - current rating for a batch of aliases, in the order asked.
 *   ?a=alias&a=alias2 ...      repeatable (safe for aliases with commas)
 *   ?aliases=alias1,alias2     comma list, for convenience
 *   ?format=text               one line per alias: alias<TAB>rating<TAB>games (the zone script's format)
 * Players with no rated game come back at the base rating with games=0. Max 64 aliases per call.
 * The zone uses this during the draft to show captains how the team ratings are developing.
 */
export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

const MAX_ALIASES = 64;

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const wanted = [...sp.getAll('a'), ...(sp.get('aliases') || '').split(',')]
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, MAX_ALIASES);
    if (wanted.length === 0) return corsError('pass ?a=alias (repeatable) or ?aliases=a,b,c', 400);

    const keys = Array.from(new Set(wanted.map(aliasKey)));
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from('usl_mix_player_ratings').select('alias_key, alias, rating, games, wins, losses, peak_rating').in('alias_key', keys);
    if (error) return corsError(error.message, 500);
    const byKey = new Map((data ?? []).map((r: any) => [r.alias_key, r]));

    const ratings = wanted.map((alias) => {
      const r = byKey.get(aliasKey(alias));
      const games = Number(r?.games ?? 0);
      return {
        alias: r?.alias ?? alias,
        alias_key: aliasKey(alias),
        rating: Math.round(Number(r?.rating ?? ELO.BASE_RATING) * 10) / 10,
        games,
        wins: Number(r?.wins ?? 0),
        losses: Number(r?.losses ?? 0),
        peak_rating: r ? Math.round(Number(r.peak_rating) * 10) / 10 : null,
        provisional: games < ELO.PROVISIONAL_GAMES,
        found: !!r,
      };
    });

    if ((sp.get('format') || '').toLowerCase() === 'text') {
      const body = ratings.map((r) => `${r.alias.replace(/[\t\r\n]/g, ' ')}\t${r.rating}\t${r.games}`).join('\n') + '\n';
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=15',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return corsJson({ success: true, base_rating: ELO.BASE_RATING, provisional_games: ELO.PROVISIONAL_GAMES, ratings }, { cache: 15 });
  } catch (e: any) {
    return corsError(e?.message || 'Internal error', 500);
  }
}
