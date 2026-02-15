-- ============================================================
-- Zone Explorer Tables
-- Run this SQL in your Supabase SQL editor
-- ============================================================

-- 1. Zone Categories (broad groupings: CTF, Skirmish, Sports, etc.)
CREATE TABLE IF NOT EXISTS zone_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '🎮',
  accent_color TEXT NOT NULL DEFAULT 'cyan',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Zone Name Mappings
-- Maps dynamic zone_title strings (from the zonepop API) → categories.
-- zone_title is UNIQUE — one title belongs to exactly one category.
-- Admins manage these mappings via the on-site UI.
CREATE TABLE IF NOT EXISTS zone_name_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_title TEXT NOT NULL UNIQUE,
  category_id UUID REFERENCES zone_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Zone Media (thumbnails, previews, VOD links per zone title)
CREATE TABLE IF NOT EXISTS zone_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_title TEXT NOT NULL UNIQUE,
  thumbnail_url TEXT,
  hover_preview_url TEXT,
  vod_link TEXT,
  icon_override TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Zone Notification Subscriptions
CREATE TABLE IF NOT EXISTS zone_notification_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_title TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, zone_title)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_zone_name_mappings_title ON zone_name_mappings(zone_title);
CREATE INDEX IF NOT EXISTS idx_zone_name_mappings_category ON zone_name_mappings(category_id);
CREATE INDEX IF NOT EXISTS idx_zone_media_title ON zone_media(zone_title);
CREATE INDEX IF NOT EXISTS idx_zone_notif_subs_user ON zone_notification_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_zone_notif_subs_zone ON zone_notification_subscriptions(zone_title);

-- ============================================================
-- RLS Policies
-- ============================================================

-- zone_categories: public read
ALTER TABLE zone_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_categories_public_read" ON zone_categories
  FOR SELECT USING (true);

-- zone_name_mappings: public read
ALTER TABLE zone_name_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_name_mappings_public_read" ON zone_name_mappings
  FOR SELECT USING (true);

-- zone_media: public read
ALTER TABLE zone_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_media_public_read" ON zone_media
  FOR SELECT USING (true);

-- zone_notification_subscriptions: user-scoped CRUD
ALTER TABLE zone_notification_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_notif_subs_select_own" ON zone_notification_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "zone_notif_subs_insert_own" ON zone_notification_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "zone_notif_subs_update_own" ON zone_notification_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "zone_notif_subs_delete_own" ON zone_notification_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Seed Data: Categories
-- ============================================================
INSERT INTO zone_categories (name, icon, accent_color, description, sort_order) VALUES
  ('CTF',       '🏁', 'red',    'Capture The Flag gameplay',           1),
  ('Skirmish',  '💥', 'orange', 'Fast-paced combat and team battles',  2),
  ('Sports',    '⚽', 'green',  'Sports-based gameplay modes',         3),
  ('Arcade',    '🎮', 'purple', 'Arcade-style game modes',             4),
  ('League',    '🏆', 'yellow', 'Competitive league matches',          5),
  ('Bots',      '🤖', 'cyan',   'Bot-filled practice zones',          6)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Seed Data: Zone Name Mappings
-- These use the exact Title strings from the zonepop API.
-- Admins can add/change these from the Zone Explorer admin panel.
-- ============================================================

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'CTF - Twin Peaks 2.0', id FROM zone_categories WHERE name = 'CTF'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'CTF - Twin Peaks Classic', id FROM zone_categories WHERE name = 'CTF'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'League - USL Matches', id FROM zone_categories WHERE name = 'League'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'League - USL Secondary', id FROM zone_categories WHERE name = 'League'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'Skirmish - Minimaps', id FROM zone_categories WHERE name = 'Skirmish'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'Sports - GravBall', id FROM zone_categories WHERE name = 'Sports'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'Arcade - The Arena', id FROM zone_categories WHERE name = 'Arcade'
ON CONFLICT (zone_title) DO NOTHING;

INSERT INTO zone_name_mappings (zone_title, category_id)
SELECT 'Bots - Zombie Zone', id FROM zone_categories WHERE name = 'Bots'
ON CONFLICT (zone_title) DO NOTHING;
