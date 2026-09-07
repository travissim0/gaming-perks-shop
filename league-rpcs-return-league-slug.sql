-- ============================================================================
-- Return league_slug from the match-report and squad-rating RPCs
-- ============================================================================
-- match_reports and squad_ratings already have a league_slug column, but the
-- RPCs the pages read through never returned it — so the league filters on
-- /league/match-reports and /league/ratings silently matched nothing.
--
-- The return type changes, so each function must be dropped and recreated.
-- Bodies are identical to the live versions plus the one extra column.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_match_reports_with_details();

CREATE FUNCTION public.get_match_reports_with_details()
RETURNS TABLE(
    id uuid,
    title text,
    squad_a_id uuid,
    squad_b_id uuid,
    squad_a_name text,
    squad_b_name text,
    squad_a_banner_url text,
    squad_b_banner_url text,
    match_summary text,
    match_highlights_video_url text,
    match_date date,
    season_name text,
    created_by uuid,
    creator_alias text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    league_slug text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        mr.id,
        mr.title,
        mr.squad_a_id,
        mr.squad_b_id,
        mr.squad_a_name,
        mr.squad_b_name,
        sa.banner_url AS squad_a_banner_url,
        sb.banner_url AS squad_b_banner_url,
        mr.match_summary,
        mr.match_highlights_video_url,
        mr.match_date,
        mr.season_name,
        mr.created_by,
        p.in_game_alias AS creator_alias,
        mr.created_at,
        mr.updated_at,
        mr.league_slug
    FROM match_reports mr
    JOIN profiles p ON mr.created_by = p.id
    LEFT JOIN squads sa ON mr.squad_a_id = sa.id
    LEFT JOIN squads sb ON mr.squad_b_id = sb.id
    ORDER BY mr.match_date DESC, mr.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.get_squad_ratings();

CREATE FUNCTION public.get_squad_ratings()
RETURNS TABLE(
    id uuid,
    squad_id uuid,
    squad_name text,
    squad_tag text,
    analyst_id uuid,
    analyst_alias text,
    season_name text,
    analysis_date date,
    analyst_commentary text,
    analyst_quote text,
    breakdown_summary text,
    is_official boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    league_slug text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        sr.id,
        sr.squad_id,
        s.name AS squad_name,
        s.tag AS squad_tag,
        sr.analyst_id,
        p.in_game_alias AS analyst_alias,
        sr.season_name,
        sr.analysis_date,
        sr.analyst_commentary,
        sr.analyst_quote,
        sr.breakdown_summary,
        sr.is_official,
        sr.created_at,
        sr.updated_at,
        sr.league_slug
    FROM squad_ratings sr
    JOIN squads s ON sr.squad_id = s.id
    JOIN profiles p ON sr.analyst_id = p.id
    ORDER BY sr.is_official DESC, sr.analysis_date DESC, sr.created_at DESC;
$$;
