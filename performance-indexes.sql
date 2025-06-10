-- Performance Optimization Indexes for Gaming Perks Shop
-- Run this in your Supabase SQL Editor to add performance indexes

-- ====================
-- PROFILES TABLE INDEXES
-- ====================

-- Index for online user queries (last_seen lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_recent 
ON profiles(last_seen DESC) 
WHERE last_seen > NOW() - INTERVAL '1 hour';

-- Composite index for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_admin_status 
ON profiles(is_admin, registration_status);

-- Index for in-game alias searches (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_profiles_alias_lower 
ON profiles(LOWER(in_game_alias));

-- ====================
-- USER_PRODUCTS TABLE INDEXES  
-- ====================

-- Composite index for user purchase queries
CREATE INDEX IF NOT EXISTS idx_user_products_user_status 
ON user_products(user_id, status);

-- Index for expiration cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_products_expires_at 
ON user_products(expires_at) 
WHERE expires_at IS NOT NULL;

-- Index for recent purchases queries
CREATE INDEX IF NOT EXISTS idx_user_products_recent 
ON user_products(created_at DESC, status);

-- ====================
-- PRODUCTS TABLE INDEXES
-- ====================

-- Index for active products
CREATE INDEX IF NOT EXISTS idx_products_active 
ON products(active, created_at DESC) 
WHERE active = true;

-- Index for Ko-fi code lookups
CREATE INDEX IF NOT EXISTS idx_products_kofi_code 
ON products(kofi_direct_link_code) 
WHERE kofi_direct_link_code IS NOT NULL;

-- ====================
-- SQUADS TABLE INDEXES
-- ====================

-- Index for active squads with member count
CREATE INDEX IF NOT EXISTS idx_squads_active 
ON squads(is_active, created_at DESC) 
WHERE is_active = true;

-- ====================
-- SQUAD_MEMBERS TABLE INDEXES
-- ====================

-- Composite index for squad member queries
CREATE INDEX IF NOT EXISTS idx_squad_members_active 
ON squad_members(squad_id, status, joined_at);

-- Index for player squad lookups
CREATE INDEX IF NOT EXISTS idx_squad_members_player_status 
ON squad_members(player_id, status);

-- ====================
-- MATCHES TABLE INDEXES
-- ====================

-- Index for upcoming matches
CREATE INDEX IF NOT EXISTS idx_matches_upcoming 
ON matches(scheduled_at ASC, status) 
WHERE status = 'scheduled' AND scheduled_at > NOW();

-- Index for recent completed matches
CREATE INDEX IF NOT EXISTS idx_matches_recent 
ON matches(completed_at DESC, status) 
WHERE status = 'completed';

-- Composite index for squad matches
CREATE INDEX IF NOT EXISTS idx_matches_squads 
ON matches(squad_a_id, squad_b_id, status);

-- ====================
-- DONATIONS TABLE INDEXES
-- ====================

-- Index for recent donations display
CREATE INDEX IF NOT EXISTS idx_donations_recent 
ON donations(created_at DESC, status) 
WHERE status = 'completed';

-- Index for user donation history
CREATE INDEX IF NOT EXISTS idx_donations_user 
ON donations(user_id, created_at DESC);

-- ====================
-- PLAYER_STATS TABLE INDEXES (if exists)
-- ====================

-- Index for player name lookups
CREATE INDEX IF NOT EXISTS idx_player_stats_name 
ON player_stats(player_name, game_date DESC);

-- Index for game mode filtering
CREATE INDEX IF NOT EXISTS idx_player_stats_mode_date 
ON player_stats(game_mode, game_date DESC);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_player_stats_kills 
ON player_stats(total_kills DESC, player_name);

-- ====================
-- AGGREGATE STATS TABLE INDEXES (if exists)
-- ====================

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_player_aggregate_kills 
ON player_aggregate_stats(total_kills DESC, player_name);

-- Index for KD ratio leaderboard
CREATE INDEX IF NOT EXISTS idx_player_aggregate_kd 
ON player_aggregate_stats(kill_death_ratio DESC) 
WHERE kill_death_ratio IS NOT NULL;

-- ====================
-- PARTIAL INDEXES FOR COMMON QUERIES
-- ====================

-- Partial index for pending squad invites
CREATE INDEX IF NOT EXISTS idx_squad_invites_pending 
ON squad_invites(invited_player_id, expires_at) 
WHERE status = 'pending' AND expires_at > NOW();

-- Partial index for active match participants
CREATE INDEX IF NOT EXISTS idx_match_participants_active 
ON match_participants(match_id, player_id) 
WHERE status = 'active';

-- ====================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ====================

-- Update table statistics for better query planning
ANALYZE profiles;
ANALYZE products;
ANALYZE user_products;
ANALYZE squads;
ANALYZE squad_members;
ANALYZE squad_invites;
ANALYZE matches;
ANALYZE donations;

-- Note: Run ANALYZE after major data changes to keep statistics current 