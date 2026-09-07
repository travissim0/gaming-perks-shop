/**
 * League rules data access. Rules live in `league_rules` — one row per
 * rulebook section, body is a TipTap JSON document (what RichTextEditor
 * produces). See create-league-rules.sql.
 */
import { supabase } from '@/lib/supabase';

export interface RuleSection {
  id: string;
  league_slug: string;
  category: string;
  title: string;
  body: unknown;            // TipTap doc (object) — may arrive as string from some clients
  sort_order: number;
  is_published: boolean;
  source: 'admin' | 'pdf-seed' | string;
  updated_at: string | null;
}

const COLS = 'id, league_slug, category, title, body, sort_order, is_published, source, updated_at';

/** Published sections for a league, in display order. */
export async function getLeagueRules(leagueSlug: string): Promise<RuleSection[]> {
  const { data, error } = await supabase
    .from('league_rules')
    .select(COLS)
    .eq('league_slug', leagueSlug)
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) {
    // Table may not exist yet — treat as "no rules published".
    console.warn('league_rules query failed:', error.message);
    return [];
  }
  return (data as RuleSection[]) || [];
}

/** All sections (including unpublished) — admin use; RLS enforces access. */
export async function getLeagueRulesAdmin(leagueSlug: string): Promise<RuleSection[]> {
  const { data, error } = await supabase
    .from('league_rules')
    .select(COLS)
    .eq('league_slug', leagueSlug)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as RuleSection[]) || [];
}

export const EMPTY_DOC = { type: 'doc', content: [] };

/** Normalize a body value (object or JSON string) into a TipTap doc object. */
export function toDoc(body: unknown): Record<string, unknown> {
  if (!body) return EMPTY_DOC;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? parsed : EMPTY_DOC;
    } catch {
      // Plain text fallback → single paragraph
      return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] };
    }
  }
  return body as Record<string, unknown>;
}
