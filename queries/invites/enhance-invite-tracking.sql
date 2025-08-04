-- Enhanced Invite Tracking System
-- Add new columns for better invite analytics and tracking

-- Add invite source tracking
ALTER TABLE squad_invites 
ADD COLUMN invite_source VARCHAR(50) DEFAULT 'manual';

-- Add invite category/type
ALTER TABLE squad_invites 
ADD COLUMN invite_type VARCHAR(50) DEFAULT 'recruitment';

-- Add viewed timestamp (when recipient first viewed the invite)
ALTER TABLE squad_invites 
ADD COLUMN viewed_at TIMESTAMP WITH TIME ZONE;

-- Create enum constraint for invite_source
ALTER TABLE squad_invites 
ADD CONSTRAINT invite_source_check 
CHECK (invite_source IN ('free_agent_list', 'direct_username', 'manual_search', 'referral', 'manual'));

-- Create enum constraint for invite_type  
ALTER TABLE squad_invites 
ADD CONSTRAINT invite_type_check 
CHECK (invite_type IN ('recruitment', 'replacement', 'expansion', 'legacy_transfer'));

-- Add comments for documentation
COMMENT ON COLUMN squad_invites.invite_source IS 'How the invite was initiated: free_agent_list, direct_username, manual_search, referral, manual';
COMMENT ON COLUMN squad_invites.invite_type IS 'Purpose of invite: recruitment, replacement, expansion, legacy_transfer';
COMMENT ON COLUMN squad_invites.viewed_at IS 'When the recipient first viewed the invitation';
COMMENT ON COLUMN squad_invites.responded_at IS 'When the recipient accepted/declined the invitation';

-- Create index for invite analytics queries
CREATE INDEX idx_squad_invites_analytics ON squad_invites(invited_by, status, invite_type, created_at);
CREATE INDEX idx_squad_invites_squad_analytics ON squad_invites(squad_id, status, created_at);
CREATE INDEX idx_squad_invites_response_time ON squad_invites(created_at, responded_at) WHERE responded_at IS NOT NULL;

-- Update existing data with default values (optional - for retroactive analysis)
-- UPDATE squad_invites 
-- SET invite_source = CASE 
--   WHEN invited_by = invited_player_id THEN 'manual'
--   ELSE 'direct_username'
-- END
-- WHERE invite_source IS NULL;

-- Update existing data with invite types based on patterns
-- UPDATE squad_invites 
-- SET invite_type = CASE 
--   WHEN message ILIKE '%legacy%' THEN 'legacy_transfer'
--   WHEN invited_by = invited_player_id THEN 'recruitment'
--   ELSE 'recruitment'
-- END
-- WHERE invite_type IS NULL;