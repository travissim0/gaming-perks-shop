-- =============================================================================
-- Generic League Standings (for CTFDL, OVDL, and future leagues)
-- Mirrors ctfpl_standings but uses league_season_id FK instead of season_number
-- =============================================================================

-- Table
CREATE TABLE IF NOT EXISTS league_standings (
    id UUID DEFAULT gen_random_uuid(),
    league_season_id UUID NOT NULL REFERENCES league_seasons(id) ON DELETE CASCADE,
    squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
    matches_played INTEGER DEFAULT 0 NOT NULL,
    wins INTEGER DEFAULT 0 NOT NULL,
    losses INTEGER DEFAULT 0 NOT NULL,
    no_shows INTEGER DEFAULT 0 NOT NULL,
    overtime_wins INTEGER DEFAULT 0 NOT NULL,
    overtime_losses INTEGER DEFAULT 0 NOT NULL,
    points INTEGER DEFAULT 0 NOT NULL,
    kills_for INTEGER DEFAULT 0 NOT NULL,
    deaths_against INTEGER DEFAULT 0 NOT NULL,
    win_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN matches_played > 0
            THEN ROUND((wins::NUMERIC / matches_played) * 100, 2)
            ELSE 0
        END
    ) STORED,
    kill_death_difference INTEGER GENERATED ALWAYS AS (kills_for - deaths_against) STORED,
    regulation_wins INTEGER GENERATED ALWAYS AS (wins - overtime_wins) STORED,
    current_streak_type VARCHAR(10) DEFAULT 'win' CHECK (current_streak_type IN ('win', 'loss', 'no_show')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (league_season_id, squad_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_league_standings_season ON league_standings(league_season_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_squad ON league_standings(squad_id);
CREATE INDEX IF NOT EXISTS idx_league_standings_points ON league_standings(league_season_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_league_standings_ranking ON league_standings(
    league_season_id, points DESC, win_percentage DESC, regulation_wins DESC
);

-- RLS
ALTER TABLE league_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to league standings" ON league_standings
    FOR SELECT USING (true);

CREATE POLICY "Allow admin insert on league standings" ON league_standings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.is_admin = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

CREATE POLICY "Allow admin update on league standings" ON league_standings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.is_admin = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

CREATE POLICY "Allow admin delete on league standings" ON league_standings
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.is_admin = true OR profiles.ctf_role = 'ctf_admin')
        )
    );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_league_standings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_league_standings_updated_at ON league_standings;
CREATE TRIGGER trigger_league_standings_updated_at
    BEFORE UPDATE ON league_standings
    FOR EACH ROW
    EXECUTE FUNCTION update_league_standings_updated_at();

-- =============================================================================
-- Ranking View
-- =============================================================================

CREATE OR REPLACE VIEW league_standings_with_rankings AS
SELECT
    s.*,
    sq.name AS squad_name,
    sq.tag AS squad_tag,
    sq.banner_url,
    p.in_game_alias AS captain_alias,
    ls.season_number,
    l.slug AS league_slug,
    l.name AS league_name,
    ROW_NUMBER() OVER (
        PARTITION BY s.league_season_id
        ORDER BY
            s.points DESC,
            s.win_percentage DESC,
            s.regulation_wins DESC,
            s.overtime_wins DESC,
            s.kill_death_difference DESC,
            s.wins DESC
    ) AS rank,
    (
        SELECT MAX(points)
        FROM league_standings s2
        WHERE s2.league_season_id = s.league_season_id
    ) - s.points AS points_behind
FROM league_standings s
JOIN squads sq ON s.squad_id = sq.id
LEFT JOIN profiles p ON sq.captain_id = p.id
JOIN league_seasons ls ON s.league_season_id = ls.id
JOIN leagues l ON ls.league_id = l.id
ORDER BY s.league_season_id, rank;

-- =============================================================================
-- Update Function
-- =============================================================================

CREATE OR REPLACE FUNCTION update_league_standings(
    p_league_season_id UUID,
    p_team1_squad_id UUID,
    p_team2_squad_id UUID,
    p_team1_result TEXT,
    p_team2_result TEXT,
    p_team1_overtime BOOLEAN DEFAULT false,
    p_team2_overtime BOOLEAN DEFAULT false,
    p_team1_kills INTEGER DEFAULT 0,
    p_team2_kills INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
    team1_points INTEGER;
    team2_points INTEGER;
    team1_wins INTEGER;
    team1_losses INTEGER;
    team1_no_shows INTEGER;
    team2_wins INTEGER;
    team2_losses INTEGER;
    team2_no_shows INTEGER;
    team1_ot_wins INTEGER;
    team1_ot_losses INTEGER;
    team2_ot_wins INTEGER;
    team2_ot_losses INTEGER;
BEGIN
    team1_wins := 0; team1_losses := 0; team1_no_shows := 0;
    team2_wins := 0; team2_losses := 0; team2_no_shows := 0;
    team1_ot_wins := 0; team1_ot_losses := 0;
    team2_ot_wins := 0; team2_ot_losses := 0;

    CASE p_team1_result
        WHEN 'win' THEN
            team1_points := 3;
            team1_wins := 1;
            IF p_team1_overtime THEN team1_ot_wins := 1; END IF;
        WHEN 'loss' THEN
            team1_points := 1;
            team1_losses := 1;
            IF p_team1_overtime THEN team1_ot_losses := 1; END IF;
        WHEN 'no_show' THEN
            team1_points := 0;
            team1_no_shows := 1;
    END CASE;

    CASE p_team2_result
        WHEN 'win' THEN
            team2_points := 3;
            team2_wins := 1;
            IF p_team2_overtime THEN team2_ot_wins := 1; END IF;
        WHEN 'loss' THEN
            team2_points := 1;
            team2_losses := 1;
            IF p_team2_overtime THEN team2_ot_losses := 1; END IF;
        WHEN 'no_show' THEN
            team2_points := 0;
            team2_no_shows := 1;
    END CASE;

    -- Upsert team 1
    INSERT INTO league_standings (
        league_season_id, squad_id, matches_played, wins, losses, no_shows,
        overtime_wins, overtime_losses, points, kills_for, deaths_against
    ) VALUES (
        p_league_season_id, p_team1_squad_id, 1, team1_wins, team1_losses,
        team1_no_shows, team1_ot_wins, team1_ot_losses, team1_points,
        p_team1_kills, p_team2_kills
    )
    ON CONFLICT (league_season_id, squad_id) DO UPDATE SET
        matches_played = league_standings.matches_played + 1,
        wins = league_standings.wins + team1_wins,
        losses = league_standings.losses + team1_losses,
        no_shows = league_standings.no_shows + team1_no_shows,
        overtime_wins = league_standings.overtime_wins + team1_ot_wins,
        overtime_losses = league_standings.overtime_losses + team1_ot_losses,
        points = league_standings.points + team1_points,
        kills_for = league_standings.kills_for + p_team1_kills,
        deaths_against = league_standings.deaths_against + p_team2_kills;

    -- Upsert team 2
    INSERT INTO league_standings (
        league_season_id, squad_id, matches_played, wins, losses, no_shows,
        overtime_wins, overtime_losses, points, kills_for, deaths_against
    ) VALUES (
        p_league_season_id, p_team2_squad_id, 1, team2_wins, team2_losses,
        team2_no_shows, team2_ot_wins, team2_ot_losses, team2_points,
        p_team2_kills, p_team1_kills
    )
    ON CONFLICT (league_season_id, squad_id) DO UPDATE SET
        matches_played = league_standings.matches_played + 1,
        wins = league_standings.wins + team2_wins,
        losses = league_standings.losses + team2_losses,
        no_shows = league_standings.no_shows + team2_no_shows,
        overtime_wins = league_standings.overtime_wins + team2_ot_wins,
        overtime_losses = league_standings.overtime_losses + team2_ot_losses,
        points = league_standings.points + team2_points,
        kills_for = league_standings.kills_for + p_team2_kills,
        deaths_against = league_standings.deaths_against + p_team1_kills;
END;
$$ LANGUAGE plpgsql;
