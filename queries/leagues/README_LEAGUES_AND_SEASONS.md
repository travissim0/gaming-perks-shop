# Multi-League Support: Leagues + League Seasons

This adds support for multiple leagues (CTFPL, CTFDL, OVDL, and future leagues) so admins can manage seasons per league and upload/edit historical season info.

## What to run

**Run the SQL below in your Supabase SQL editor** (e.g. Dashboard → SQL Editor). Run the sections in order.

---

## 1. Create `leagues` table

```sql
-- Leagues (CTFPL, CTFDL, OVDL, future leagues)
CREATE TABLE IF NOT EXISTS leagues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Seed known leagues
INSERT INTO leagues (slug, name, description) VALUES
  ('ctfpl', 'CTFPL', 'Capture The Flag Players League'),
  ('ctfdl', 'CTFDL', 'Capture The Flag Duel League'),
  ('ovdl', 'OVDL', 'Other League')
ON CONFLICT (slug) DO NOTHING;
```

---

## 2. Create `league_seasons` table (for non-CTFPL leagues)

CTFPL keeps using the existing `ctfpl_seasons` table. Other leagues use `league_seasons`.

```sql
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
```

---

## 3. Enable RLS and basic policies (optional)

```sql
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_seasons ENABLE ROW LEVEL SECURITY;

-- Allow read for all (public standings/seasons)
CREATE POLICY "leagues_select" ON leagues FOR SELECT USING (true);
CREATE POLICY "league_seasons_select" ON league_seasons FOR SELECT USING (true);

-- Insert/update/delete only via service role or your admin auth (adjust to your auth pattern)
CREATE POLICY "leagues_all" ON leagues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "league_seasons_all" ON league_seasons FOR ALL USING (true) WITH CHECK (true);
```

If you use Supabase auth for admins, replace the last two policies with checks on `auth.jwt() ->> 'role'` or your admin check.

---

## After running

- **CTFPL** seasons stay in `ctfpl_seasons` (no data migration).
- **CTFDL, OVDL, and new leagues** use `league_seasons` with the appropriate `league_id`.
- The admin “Manage Seasons” modal will show a league dropdown and add/edit seasons for the selected league (CTFPL → `ctfpl_seasons`, others → `league_seasons`).
