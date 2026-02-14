-- ============================================================
-- Multi-League: Create leagues + league_seasons in Supabase
-- Run this entire script in Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Leagues table (CTFPL, CTFDL, OVDL, future leagues)
CREATE TABLE IF NOT EXISTS leagues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

INSERT INTO leagues (slug, name, description) VALUES
  ('ctfpl', 'CTFPL', 'Capture The Flag Players League'),
  ('ctfdl', 'CTFDL', 'Capture The Flag Duel League'),
  ('ovdl', 'OVDL', 'Other League')
ON CONFLICT (slug) DO NOTHING;

-- 2. League seasons (for non-CTFPL leagues; CTFPL keeps using ctfpl_seasons)
CREATE TABLE IF NOT EXISTS league_seasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  season_name VARCHAR(100),
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed')),
  champion_squad_ids UUID[] DEFAULT '{}',
  runner_up_squad_ids UUID[] DEFAULT '{}',
  third_place_squad_ids UUID[] DEFAULT '{}',
  total_matches INTEGER DEFAULT 0,
  total_squads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(league_id, season_number)
);

CREATE INDEX IF NOT EXISTS idx_league_seasons_league_id ON league_seasons(league_id);
CREATE INDEX IF NOT EXISTS idx_league_seasons_status ON league_seasons(status);

-- 3. RLS (optional – uncomment if you use Row Level Security)
-- ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE league_seasons ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "leagues_select" ON leagues FOR SELECT USING (true);
-- CREATE POLICY "league_seasons_select" ON league_seasons FOR SELECT USING (true);
-- CREATE POLICY "leagues_all" ON leagues FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "league_seasons_all" ON league_seasons FOR ALL USING (true) WITH CHECK (true);
