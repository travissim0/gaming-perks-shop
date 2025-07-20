ALTER TABLE ctfpl_standings
  ADD COLUMN IF NOT EXISTS no_shows INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS overtime_wins INTEGER DEFAULT 0 NOT        
  NULL,
  ADD COLUMN IF NOT EXISTS overtime_losses INTEGER DEFAULT 0 NOT      
  NULL;

  -- Now we can safely drop the ties column
  ALTER TABLE ctfpl_standings
  DROP COLUMN IF EXISTS ties;

  -- Add the regulation_wins calculated column
  ALTER TABLE ctfpl_standings
  ADD COLUMN IF NOT EXISTS regulation_wins INTEGER GENERATED
  ALWAYS AS (wins - overtime_wins) STORED;

  -- Update the streak tracking to include no_show
  ALTER TABLE ctfpl_standings
  DROP CONSTRAINT IF EXISTS
  ctfpl_standings_current_streak_type_check;

  ALTER TABLE ctfpl_standings
  ADD CONSTRAINT ctfpl_standings_current_streak_type_check
  CHECK (current_streak_type IN ('win', 'loss', 'no_show'));