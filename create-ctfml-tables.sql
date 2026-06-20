-- ============================================================================
-- CTFML (Capture the Flag Mix League) — Database Schema
-- ============================================================================
-- A self-contained league with the ctfml_ prefix, mirroring the Triple Threat
-- (tt_) pattern. Shares ONLY the global `profiles` table for player identity.
--
-- Format notes that drove this design:
--   * A SQUAD is the persistent competitive entity (its own name/logo/standings).
--     Rosters: 7 max, 5 starters.
--   * A MATCH is two squads vs two squads (10v10). The "team" pairing is
--     EPHEMERAL (pairings change weekly), so it is NOT its own table — it lives
--     as four squad references on the match row.
--   * Win/Loss propagates to ALL FOUR squads in a match. Standings are per-squad
--     per-season, modeled on the existing ctfpl_standings shape.
--
-- Roster/membership machinery (create/join/password/logo) is cloned from
-- create-triple-threat-tables.sql. Standings are cloned from ctfpl_standings.
--
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE). Paste into the
-- Supabase SQL editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ROSTERS  (clone of tt_teams / tt_team_members)
-- ============================================================================

-- A CTFML squad — the persistent competitive entity.
CREATE TABLE IF NOT EXISTS ctfml_squads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_name          TEXT NOT NULL UNIQUE,
    squad_tag           TEXT,                       -- short display tag, optional
    squad_password_hash TEXT NOT NULL,              -- bcrypt, encrypted by trigger
    squad_banner_url    TEXT,                       -- logo / banner
    owner_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    is_active           BOOLEAN DEFAULT true,
    max_players         INTEGER DEFAULT 7,          -- 7 max roster (5 starters)

    CONSTRAINT ctfml_squads_name_length
        CHECK (char_length(squad_name) >= 3 AND char_length(squad_name) <= 50)
);

-- Encrypt the password on insert/update (reuses the TT helper if it already
-- exists; defined here so this file stands alone).
CREATE OR REPLACE FUNCTION encrypt_ctfml_squad_password()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.squad_password_hash IS NOT NULL
       AND NOT NEW.squad_password_hash LIKE '$2%' THEN
        NEW.squad_password_hash = crypt(NEW.squad_password_hash, gen_salt('bf'));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ctfml_squads_encrypt_password_trigger ON ctfml_squads;
CREATE TRIGGER ctfml_squads_encrypt_password_trigger
    BEFORE INSERT OR UPDATE ON ctfml_squads
    FOR EACH ROW EXECUTE FUNCTION encrypt_ctfml_squad_password();

CREATE TABLE IF NOT EXISTS ctfml_squad_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    squad_id    UUID NOT NULL REFERENCES ctfml_squads(id) ON DELETE CASCADE,
    player_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT true,
    role        TEXT DEFAULT 'player' CHECK (role IN ('owner', 'captain', 'player')),

    UNIQUE(squad_id, player_id)
);

-- Auto-deactivate a squad when its last active member leaves (clone of
-- cleanup_empty_tt_teams).
CREATE OR REPLACE FUNCTION cleanup_empty_ctfml_squads()
RETURNS TRIGGER AS $$
DECLARE
    remaining_members INTEGER;
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false) OR
       (TG_OP = 'DELETE' AND OLD.is_active = true) THEN

        SELECT COUNT(*) INTO remaining_members
        FROM ctfml_squad_members
        WHERE squad_id = OLD.squad_id AND is_active = true;

        IF remaining_members = 0 THEN
            UPDATE ctfml_squads
            SET is_active = false, updated_at = NOW()
            WHERE id = OLD.squad_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ctfml_squad_members_cleanup_trigger ON ctfml_squad_members;
CREATE TRIGGER ctfml_squad_members_cleanup_trigger
    AFTER UPDATE OR DELETE ON ctfml_squad_members
    FOR EACH ROW EXECUTE FUNCTION cleanup_empty_ctfml_squads();

-- ============================================================================
-- 2. SEASONS  (modeled on ctfpl_seasons)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctfml_seasons (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number         INTEGER NOT NULL UNIQUE,
    season_name           TEXT,
    status                TEXT DEFAULT 'upcoming'
                          CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),
    start_date            DATE,
    end_date              DATE,

    -- Roster rules for this season (defaults match the CTFML format)
    max_roster            INTEGER DEFAULT 7,
    starters              INTEGER DEFAULT 5,

    -- Final placements (arrays handle ties), filled on finalize
    champion_squad_ids    UUID[] DEFAULT '{}',
    runner_up_squad_ids   UUID[] DEFAULT '{}',
    third_place_squad_ids UUID[] DEFAULT '{}',

    total_squads          INTEGER DEFAULT 0,
    total_matches         INTEGER DEFAULT 0,

    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Which squads are registered for a given season.
CREATE TABLE IF NOT EXISTS ctfml_season_squads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id     UUID NOT NULL REFERENCES ctfml_seasons(id) ON DELETE CASCADE,
    squad_id      UUID NOT NULL REFERENCES ctfml_squads(id) ON DELETE CASCADE,
    status        TEXT DEFAULT 'registered'
                  CHECK (status IN ('registered', 'withdrawn', 'disqualified')),
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    registered_by UUID REFERENCES profiles(id),

    UNIQUE(season_id, squad_id)
);

-- ============================================================================
-- 3. MATCHES  (the 4-squad pairing — CTFML-specific shape)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctfml_matches (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id          UUID NOT NULL REFERENCES ctfml_seasons(id) ON DELETE CASCADE,

    -- Side A = two allied squads; Side B = two allied squads. Pairing is
    -- ephemeral, so it lives here rather than in its own table.
    side_a_squad1_id   UUID NOT NULL REFERENCES ctfml_squads(id),
    side_a_squad2_id   UUID NOT NULL REFERENCES ctfml_squads(id),
    side_b_squad1_id   UUID NOT NULL REFERENCES ctfml_squads(id),
    side_b_squad2_id   UUID NOT NULL REFERENCES ctfml_squads(id),

    side_a_score       INTEGER DEFAULT 0,
    side_b_score       INTEGER DEFAULT 0,
    side_a_result      TEXT CHECK (side_a_result IN ('Win', 'Loss', 'No Show')),
    side_b_result      TEXT CHECK (side_b_result IN ('Win', 'Loss', 'No Show')),

    match_type         TEXT DEFAULT 'Season'
                       CHECK (match_type IN ('Season', 'Playoffs', 'Finals', 'Friendly')),
    match_date         TIMESTAMPTZ DEFAULT NOW(),
    arena_name         TEXT,
    game_id            TEXT UNIQUE,        -- links to per-player stats ingestion
    game_length_minutes NUMERIC,
    is_overtime        BOOLEAN DEFAULT false,
    mvp_player_name    TEXT,

    created_by         UUID REFERENCES profiles(id),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),

    -- All four squads in a match must be distinct.
    CONSTRAINT ctfml_matches_distinct_squads CHECK (
        side_a_squad1_id <> side_a_squad2_id AND
        side_a_squad1_id <> side_b_squad1_id AND
        side_a_squad1_id <> side_b_squad2_id AND
        side_a_squad2_id <> side_b_squad1_id AND
        side_a_squad2_id <> side_b_squad2_id AND
        side_b_squad1_id <> side_b_squad2_id
    )
);

-- ============================================================================
-- 4. STANDINGS  (per squad, per season — modeled on ctfpl_standings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctfml_standings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id           UUID NOT NULL REFERENCES ctfml_seasons(id) ON DELETE CASCADE,
    squad_id            UUID NOT NULL REFERENCES ctfml_squads(id) ON DELETE CASCADE,

    matches_played      INTEGER DEFAULT 0,
    wins                INTEGER DEFAULT 0,
    losses              INTEGER DEFAULT 0,
    no_shows            INTEGER DEFAULT 0,
    points              INTEGER DEFAULT 0,          -- win 3 / loss 1 / no-show 0 (see RPC)

    score_for           INTEGER DEFAULT 0,          -- accumulated own-side score
    score_against       INTEGER DEFAULT 0,          -- accumulated opposing-side score
    score_difference    INTEGER DEFAULT 0,

    win_percentage      NUMERIC DEFAULT 0,
    current_streak_type TEXT CHECK (current_streak_type IN ('win', 'loss')),
    current_streak_count INTEGER DEFAULT 0,

    manual_rank         INTEGER,                    -- admin override, optional

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(season_id, squad_id)
);

-- ============================================================================
-- 5. PLAYER STATS  (optional per-game stats; mirrors tt_player_stats)
--    You can skip this and reuse the global player_stats ingestion via game_id
--    instead — kept here so CTFML is fully self-contained if you want it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ctfml_player_stats (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id      UUID REFERENCES ctfml_matches(id) ON DELETE CASCADE,
    season_id     UUID REFERENCES ctfml_seasons(id) ON DELETE CASCADE,
    squad_id      UUID REFERENCES ctfml_squads(id) ON DELETE CASCADE,
    player_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player_alias  TEXT,                       -- denormalized for alias-only records
    side          TEXT CHECK (side IN ('A', 'B')),
    is_starter    BOOLEAN DEFAULT false,      -- one of the 5 starters this match
    result        TEXT CHECK (result IN ('Win', 'Loss')),

    kills         INTEGER DEFAULT 0,
    deaths        INTEGER DEFAULT 0,
    captures      INTEGER DEFAULT 0,
    carrier_kills INTEGER DEFAULT 0,

    recorded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 6. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ctfml_squads_owner       ON ctfml_squads(owner_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_squads_active       ON ctfml_squads(is_active);

CREATE INDEX IF NOT EXISTS idx_ctfml_members_squad       ON ctfml_squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_members_player      ON ctfml_squad_members(player_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_members_active      ON ctfml_squad_members(is_active);

CREATE INDEX IF NOT EXISTS idx_ctfml_season_squads_season ON ctfml_season_squads(season_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_season_squads_squad  ON ctfml_season_squads(squad_id);

CREATE INDEX IF NOT EXISTS idx_ctfml_matches_season      ON ctfml_matches(season_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_matches_date        ON ctfml_matches(match_date);
CREATE INDEX IF NOT EXISTS idx_ctfml_matches_sa1         ON ctfml_matches(side_a_squad1_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_matches_sa2         ON ctfml_matches(side_a_squad2_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_matches_sb1         ON ctfml_matches(side_b_squad1_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_matches_sb2         ON ctfml_matches(side_b_squad2_id);

CREATE INDEX IF NOT EXISTS idx_ctfml_standings_season    ON ctfml_standings(season_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_standings_squad     ON ctfml_standings(squad_id);

CREATE INDEX IF NOT EXISTS idx_ctfml_player_stats_match  ON ctfml_player_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_player_stats_player ON ctfml_player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_ctfml_player_stats_squad  ON ctfml_player_stats(squad_id);

-- ============================================================================
-- 7. ROW LEVEL SECURITY  (same pattern as tt_* / ctfpl_*)
-- ============================================================================

ALTER TABLE ctfml_squads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctfml_squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctfml_seasons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctfml_season_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctfml_matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctfml_standings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctfml_player_stats  ENABLE ROW LEVEL SECURITY;

-- Reusable admin predicate: site/ctf admins manage league data.
-- (Inlined per-policy below to avoid a helper-function dependency.)

-- ---- ctfml_squads ----------------------------------------------------------
DROP POLICY IF EXISTS ctfml_squads_read         ON ctfml_squads;
DROP POLICY IF EXISTS ctfml_squads_owner_insert ON ctfml_squads;
DROP POLICY IF EXISTS ctfml_squads_owner_update ON ctfml_squads;
DROP POLICY IF EXISTS ctfml_squads_owner_delete ON ctfml_squads;

CREATE POLICY ctfml_squads_read ON ctfml_squads
    FOR SELECT USING (is_active = true);
CREATE POLICY ctfml_squads_owner_insert ON ctfml_squads
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = owner_id);
CREATE POLICY ctfml_squads_owner_update ON ctfml_squads
    FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY ctfml_squads_owner_delete ON ctfml_squads
    FOR DELETE USING (auth.uid() = owner_id);

-- ---- ctfml_squad_members ---------------------------------------------------
DROP POLICY IF EXISTS ctfml_members_read   ON ctfml_squad_members;
DROP POLICY IF EXISTS ctfml_members_insert ON ctfml_squad_members;
DROP POLICY IF EXISTS ctfml_members_update ON ctfml_squad_members;
DROP POLICY IF EXISTS ctfml_members_delete ON ctfml_squad_members;

CREATE POLICY ctfml_members_read ON ctfml_squad_members
    FOR SELECT USING (true);
CREATE POLICY ctfml_members_insert ON ctfml_squad_members
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = player_id);
CREATE POLICY ctfml_members_update ON ctfml_squad_members
    FOR UPDATE USING (
        auth.uid() = player_id
        OR auth.uid() IN (SELECT owner_id FROM ctfml_squads WHERE id = squad_id)
    );
CREATE POLICY ctfml_members_delete ON ctfml_squad_members
    FOR DELETE USING (
        auth.uid() = player_id
        OR auth.uid() IN (SELECT owner_id FROM ctfml_squads WHERE id = squad_id)
    );

-- ---- ctfml_seasons / season_squads / matches / standings / player_stats ----
-- Public read; admins manage.

DROP POLICY IF EXISTS ctfml_seasons_read   ON ctfml_seasons;
DROP POLICY IF EXISTS ctfml_seasons_admin  ON ctfml_seasons;
CREATE POLICY ctfml_seasons_read ON ctfml_seasons
    FOR SELECT USING (true);
CREATE POLICY ctfml_seasons_admin ON ctfml_seasons
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
    ));

DROP POLICY IF EXISTS ctfml_season_squads_read  ON ctfml_season_squads;
DROP POLICY IF EXISTS ctfml_season_squads_admin ON ctfml_season_squads;
CREATE POLICY ctfml_season_squads_read ON ctfml_season_squads
    FOR SELECT USING (true);
CREATE POLICY ctfml_season_squads_admin ON ctfml_season_squads
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
    ));

DROP POLICY IF EXISTS ctfml_matches_read  ON ctfml_matches;
DROP POLICY IF EXISTS ctfml_matches_admin ON ctfml_matches;
CREATE POLICY ctfml_matches_read ON ctfml_matches
    FOR SELECT USING (true);
CREATE POLICY ctfml_matches_admin ON ctfml_matches
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
    ));

DROP POLICY IF EXISTS ctfml_standings_read  ON ctfml_standings;
DROP POLICY IF EXISTS ctfml_standings_admin ON ctfml_standings;
CREATE POLICY ctfml_standings_read ON ctfml_standings
    FOR SELECT USING (true);
CREATE POLICY ctfml_standings_admin ON ctfml_standings
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
    ));

DROP POLICY IF EXISTS ctfml_player_stats_read  ON ctfml_player_stats;
DROP POLICY IF EXISTS ctfml_player_stats_admin ON ctfml_player_stats;
CREATE POLICY ctfml_player_stats_read ON ctfml_player_stats
    FOR SELECT USING (true);
CREATE POLICY ctfml_player_stats_admin ON ctfml_player_stats
    FOR ALL USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true OR ctf_role = 'ctf_admin'
    ));

-- ============================================================================
-- 8. ROSTER HELPER RPCs  (clones of the tt_ helpers)
-- ============================================================================

CREATE OR REPLACE FUNCTION ctfml_verify_squad_password(squad_name_input TEXT, password_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT squad_password_hash INTO stored_hash
    FROM ctfml_squads
    WHERE squad_name = squad_name_input AND is_active = true;

    IF stored_hash IS NULL THEN RETURN FALSE; END IF;
    RETURN crypt(password_input, stored_hash) = stored_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctfml_can_join_squad(squad_id_input UUID, user_id_input UUID)
RETURNS BOOLEAN AS $$
DECLARE
    member_count    INTEGER;
    squad_max       INTEGER;
    already_member  INTEGER;
BEGIN
    SELECT COUNT(*) INTO already_member
    FROM ctfml_squad_members
    WHERE squad_id = squad_id_input AND player_id = user_id_input AND is_active = true;
    IF already_member > 0 THEN RETURN FALSE; END IF;

    SELECT max_players INTO squad_max FROM ctfml_squads WHERE id = squad_id_input;
    SELECT COUNT(*) INTO member_count
    FROM ctfml_squad_members
    WHERE squad_id = squad_id_input AND is_active = true;

    RETURN member_count < squad_max;
END;
$$ LANGUAGE plpgsql;

-- Squads list with member counts (for the CTFML squads page).
CREATE OR REPLACE FUNCTION get_ctfml_squads_with_counts()
RETURNS TABLE (
    id UUID, squad_name TEXT, squad_tag TEXT, squad_banner_url TEXT,
    owner_id UUID, owner_alias TEXT, created_at TIMESTAMPTZ,
    is_active BOOLEAN, member_count BIGINT, max_players INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.squad_name, s.squad_tag, s.squad_banner_url,
           s.owner_id, COALESCE(p.in_game_alias, 'Unknown') AS owner_alias,
           s.created_at, s.is_active,
           COALESCE(m.member_count, 0) AS member_count, s.max_players
    FROM ctfml_squads s
    LEFT JOIN profiles p ON s.owner_id = p.id
    LEFT JOIN (
        SELECT mem.squad_id, COUNT(*) AS member_count
        FROM ctfml_squad_members mem
        WHERE mem.is_active = true
        GROUP BY mem.squad_id
    ) m ON s.id = m.squad_id
    WHERE s.is_active = true
    ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_ctfml_squad_members(squad_id_input UUID)
RETURNS TABLE (
    id UUID, player_id UUID, player_alias TEXT, player_avatar TEXT,
    joined_at TIMESTAMPTZ, role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.player_id,
           COALESCE(p.in_game_alias, 'Unknown') AS player_alias,
           p.avatar_url AS player_avatar, m.joined_at, m.role
    FROM ctfml_squad_members m
    LEFT JOIN profiles p ON m.player_id = p.id
    WHERE m.squad_id = squad_id_input AND m.is_active = true
    ORDER BY CASE WHEN m.role = 'owner' THEN 0
                  WHEN m.role = 'captain' THEN 1 ELSE 2 END,
             m.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. STANDINGS UPDATE  (writes a result to ALL FOUR squads in a match)
-- ============================================================================

-- Internal: upsert one squad's standings row for a result.
CREATE OR REPLACE FUNCTION ctfml_apply_squad_result(
    p_season_id      UUID,
    p_squad_id       UUID,
    p_result         TEXT,   -- 'win' | 'loss' | 'no_show'
    p_score_for      INTEGER,
    p_score_against  INTEGER
) RETURNS VOID AS $$
DECLARE
    v_win   INTEGER := CASE WHEN p_result = 'win' THEN 1 ELSE 0 END;
    v_loss  INTEGER := CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END;
    v_ns    INTEGER := CASE WHEN p_result = 'no_show' THEN 1 ELSE 0 END;
    -- CTFPL scoring: win = 3, loss = 1 (participation point), no-show = 0.
    -- Overtime never changes points ("a win is a win").
    v_pts   INTEGER := CASE p_result WHEN 'win' THEN 3 WHEN 'loss' THEN 1 ELSE 0 END;
    v_streak_type TEXT := CASE WHEN p_result = 'win' THEN 'win' ELSE 'loss' END;
BEGIN
    INSERT INTO ctfml_standings AS cs (
        season_id, squad_id, matches_played, wins, losses, no_shows, points,
        score_for, score_against, score_difference, win_percentage,
        current_streak_type, current_streak_count, updated_at
    ) VALUES (
        p_season_id, p_squad_id, 1, v_win, v_loss, v_ns, v_pts,
        p_score_for, p_score_against, p_score_for - p_score_against,
        CASE WHEN v_win = 1 THEN 100 ELSE 0 END,
        v_streak_type, 1, NOW()
    )
    ON CONFLICT (season_id, squad_id) DO UPDATE SET
        matches_played   = cs.matches_played + 1,
        wins             = cs.wins + v_win,
        losses           = cs.losses + v_loss,
        no_shows         = cs.no_shows + v_ns,
        points           = cs.points + v_pts,
        score_for        = cs.score_for + p_score_for,
        score_against    = cs.score_against + p_score_against,
        score_difference = (cs.score_for + p_score_for) - (cs.score_against + p_score_against),
        win_percentage   = ROUND(
                              (cs.wins + v_win)::NUMERIC
                              / NULLIF(cs.matches_played + 1, 0) * 100, 2),
        current_streak_count = CASE
            WHEN cs.current_streak_type = v_streak_type THEN cs.current_streak_count + 1
            ELSE 1 END,
        current_streak_type  = v_streak_type,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public: recompute standings impact for a single match. Call this from the
-- admin match-create API after inserting the ctfml_matches row.
-- Only 'Season' matches affect standings (Playoffs/Finals/Friendly do not).
CREATE OR REPLACE FUNCTION update_ctfml_standings(p_match_id UUID)
RETURNS VOID AS $$
DECLARE
    m            ctfml_matches%ROWTYPE;
    a_result     TEXT;
    b_result     TEXT;
BEGIN
    SELECT * INTO m FROM ctfml_matches WHERE id = p_match_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CTFML match % not found', p_match_id;
    END IF;

    IF m.match_type <> 'Season' THEN
        RETURN;  -- non-season games don't move standings
    END IF;

    -- Derive normalized results
    IF m.side_a_result = 'No Show' THEN a_result := 'no_show';
    ELSIF m.side_a_score > m.side_b_score THEN a_result := 'win';
    ELSE a_result := 'loss';
    END IF;

    IF m.side_b_result = 'No Show' THEN b_result := 'no_show';
    ELSIF m.side_b_score > m.side_a_score THEN b_result := 'win';
    ELSE b_result := 'loss';
    END IF;

    -- Propagate to all four squads
    PERFORM ctfml_apply_squad_result(m.season_id, m.side_a_squad1_id, a_result, m.side_a_score, m.side_b_score);
    PERFORM ctfml_apply_squad_result(m.season_id, m.side_a_squad2_id, a_result, m.side_a_score, m.side_b_score);
    PERFORM ctfml_apply_squad_result(m.season_id, m.side_b_squad1_id, b_result, m.side_b_score, m.side_a_score);
    PERFORM ctfml_apply_squad_result(m.season_id, m.side_b_squad2_id, b_result, m.side_b_score, m.side_a_score);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. STANDINGS RANKING VIEW  (ordered records → playoff seeding)
-- ============================================================================
-- "A win is a win." CTFPL scoring: win 3 / loss 1 / no-show 0. Rank by points,
-- then win %, then score differential, then score for. Admin can override with
-- manual_rank.
-- Playoffs are single elimination, seeded off this view's `rank`.

CREATE OR REPLACE VIEW ctfml_standings_with_rankings AS
SELECT
    cs.*,
    s.squad_name,
    s.squad_tag,
    s.squad_banner_url,
    RANK() OVER (
        PARTITION BY cs.season_id
        ORDER BY cs.points DESC, cs.win_percentage DESC,
                 cs.score_difference DESC, cs.score_for DESC
    ) AS computed_rank,
    COALESCE(
        cs.manual_rank,
        RANK() OVER (
            PARTITION BY cs.season_id
            ORDER BY cs.points DESC, cs.win_percentage DESC,
                     cs.score_difference DESC, cs.score_for DESC
        )
    ) AS rank
FROM ctfml_standings cs
JOIN ctfml_squads s ON s.id = cs.squad_id;

-- ============================================================================
-- 11. COMMENTS
-- ============================================================================
COMMENT ON TABLE ctfml_squads        IS 'CTFML squads — persistent competitive entity, 7 max / 5 starters';
COMMENT ON TABLE ctfml_squad_members IS 'CTFML squad membership (references global profiles)';
COMMENT ON TABLE ctfml_seasons       IS 'CTFML seasons and final placements';
COMMENT ON TABLE ctfml_season_squads IS 'Squads registered to a CTFML season';
COMMENT ON TABLE ctfml_matches       IS 'CTFML matches: two allied squads (side A) vs two (side B) — 10v10';
COMMENT ON TABLE ctfml_standings     IS 'Per-squad per-season standings; a match result applies to all 4 squads';
COMMENT ON TABLE ctfml_player_stats  IS 'Optional per-game player stats for CTFML (or reuse global player_stats via game_id)';
