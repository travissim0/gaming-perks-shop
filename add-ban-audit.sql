-- League bans: record which staff member issued the ban.
-- CTF management → Bans shows "Banned <date> by <alias>" once this exists.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS league_banned_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Backfill: the bans already on the books were issued by Soup. Remove this
-- statement before running if that is not right.
UPDATE profiles
SET league_banned_by = (SELECT id FROM profiles WHERE in_game_alias = 'Soup' LIMIT 1)
WHERE is_league_banned = true AND league_banned_by IS NULL;
