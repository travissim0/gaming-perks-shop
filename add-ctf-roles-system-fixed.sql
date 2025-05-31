-- CTF Role Hierarchy System (Fixed Version)
-- Adds comprehensive role management for CTF operations

BEGIN;

-- Drop enum if it exists and recreate (safer approach)
DROP TYPE IF EXISTS ctf_role_type CASCADE;

-- Create enum for CTF roles
CREATE TYPE ctf_role_type AS ENUM (
    'admin',
    'ctf_admin', 
    'ctf_head_referee',
    'ctf_referee',
    'ctf_recorder',
    'ctf_commentator'
);

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS match_results CASCADE;
DROP TABLE IF EXISTS match_commentators CASCADE;
DROP TABLE IF EXISTS referee_applications CASCADE;
DROP TABLE IF EXISTS user_ctf_roles CASCADE;
DROP TABLE IF EXISTS ctf_roles CASCADE;

-- Create CTF roles table with hierarchy
CREATE TABLE ctf_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name ctf_role_type NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    hierarchy_level INTEGER NOT NULL, -- Higher number = higher authority
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert role definitions with hierarchy
INSERT INTO ctf_roles (name, display_name, description, hierarchy_level, permissions) VALUES
('admin', 'Site Administrator', 'Full system access including payments and donations', 100, '{
    "manage_all_users": true,
    "manage_payments": true,
    "manage_donations": true,
    "manage_orders": true,
    "manage_ctf_roles": true,
    "manage_matches": true,
    "manage_squads": true,
    "view_admin_panel": true
}'),
('ctf_admin', 'CTF Administrator', 'Manages all CTF operations and roles (no payment access)', 90, '{
    "manage_ctf_roles": true,
    "assign_ctf_admin": true,
    "manage_matches": true,
    "manage_squads": true,
    "manage_referees": true,
    "manage_referee_applications": true,
    "view_ctf_admin_panel": true
}'),
('ctf_head_referee', 'CTF Head Referee', 'Manages all referees and their applications', 80, '{
    "manage_referees": true,
    "manage_referee_applications": true,
    "approve_referee_promotions": true,
    "manage_match_results": true,
    "view_referee_panel": true
}'),
('ctf_referee', 'CTF Referee', 'Confirms and edits match results and statistics', 70, '{
    "manage_match_results": true,
    "edit_match_stats": true,
    "view_match_details": true,
    "referee_matches": true
}'),
('ctf_recorder', 'CTF Recorder', 'Manages video recordings for tournament matches', 60, '{
    "add_match_videos": true,
    "edit_match_videos": true,
    "manage_tournament_recordings": true
}'),
('ctf_commentator', 'CTF Commentator', 'Can sign up to commentate matches', 50, '{
    "signup_for_commentary": true,
    "view_match_schedule": true
}');

-- Create user roles assignment table
CREATE TABLE user_ctf_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_name ctf_role_type NOT NULL,
    assigned_by UUID REFERENCES profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    UNIQUE(user_id, role_name)
);

-- Create referee applications table
CREATE TABLE referee_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_current_role ctf_role_type,
    requested_role ctf_role_type NOT NULL,
    application_reason TEXT NOT NULL,
    experience_description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add video and commentator fields to matches table (check if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'matches') THEN
        -- Add columns if they don't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'video_url') THEN
            ALTER TABLE matches ADD COLUMN video_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'video_platform') THEN
            ALTER TABLE matches ADD COLUMN video_platform TEXT CHECK (video_platform IN ('youtube', 'twitch', 'vimeo', 'other'));
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'video_title') THEN
            ALTER TABLE matches ADD COLUMN video_title TEXT;
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'recorded_by') THEN
            ALTER TABLE matches ADD COLUMN recorded_by UUID REFERENCES profiles(id);
        END IF;
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'commentary_enabled') THEN
            ALTER TABLE matches ADD COLUMN commentary_enabled BOOLEAN DEFAULT FALSE;
        END IF;
    END IF;
END $$;

-- Create match commentators table
CREATE TABLE match_commentators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL,
    commentator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'commentator' CHECK (role IN ('commentator', 'co_commentator', 'analyst')),
    status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'confirmed', 'declined')),
    assigned_by UUID REFERENCES profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, commentator_id)
);

-- Create match results table for detailed tracking
CREATE TABLE match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL,
    squad_a_score INTEGER DEFAULT 0,
    squad_b_score INTEGER DEFAULT 0,
    winner_squad_id UUID,
    map_name TEXT,
    game_duration INTERVAL,
    additional_stats JSONB DEFAULT '{}',
    recorded_by UUID REFERENCES profiles(id),
    verified_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints after table creation (safer)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'matches') THEN
        ALTER TABLE match_commentators ADD CONSTRAINT match_commentators_match_id_fkey 
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
        
        ALTER TABLE match_results ADD CONSTRAINT match_results_match_id_fkey 
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'squads') THEN
        ALTER TABLE match_results ADD CONSTRAINT match_results_winner_squad_id_fkey 
        FOREIGN KEY (winner_squad_id) REFERENCES squads(id);
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX idx_user_ctf_roles_user_id ON user_ctf_roles(user_id);
CREATE INDEX idx_user_ctf_roles_role_name ON user_ctf_roles(role_name);
CREATE INDEX idx_referee_applications_applicant ON referee_applications(applicant_id);
CREATE INDEX idx_referee_applications_status ON referee_applications(status);
CREATE INDEX idx_match_commentators_match ON match_commentators(match_id);
CREATE INDEX idx_match_commentators_commentator ON match_commentators(commentator_id);
CREATE INDEX idx_match_results_match ON match_results(match_id);

-- Create RLS policies for CTF roles
ALTER TABLE ctf_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ctf_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referee_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_commentators ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

-- CTF roles are readable by all authenticated users
CREATE POLICY "CTF roles are viewable by authenticated users" ON ctf_roles
    FOR SELECT USING (auth.role() = 'authenticated');

-- User CTF roles policies
CREATE POLICY "Users can view their own CTF roles" ON user_ctf_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "CTF admins can view all user roles" ON user_ctf_roles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_ctf_roles ucr 
            WHERE ucr.user_id = auth.uid() 
            AND ucr.role_name IN ('admin', 'ctf_admin')
            AND ucr.is_active = true
        )
    );

CREATE POLICY "CTF admins can manage user roles" ON user_ctf_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_ctf_roles ucr 
            WHERE ucr.user_id = auth.uid() 
            AND ucr.role_name IN ('admin', 'ctf_admin')
            AND ucr.is_active = true
        )
    );

-- Referee applications policies
CREATE POLICY "Users can view their own applications" ON referee_applications
    FOR SELECT USING (auth.uid() = applicant_id);

CREATE POLICY "Users can create referee applications" ON referee_applications
    FOR INSERT WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "Head referees can manage applications" ON referee_applications
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_ctf_roles ucr 
            WHERE ucr.user_id = auth.uid() 
            AND ucr.role_name IN ('admin', 'ctf_admin', 'ctf_head_referee')
            AND ucr.is_active = true
        )
    );

-- Match commentators policies
CREATE POLICY "Commentators can view match assignments" ON match_commentators
    FOR SELECT USING (auth.uid() = commentator_id);

CREATE POLICY "CTF roles can manage commentator assignments" ON match_commentators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_ctf_roles ucr 
            WHERE ucr.user_id = auth.uid() 
            AND ucr.role_name IN ('admin', 'ctf_admin', 'ctf_head_referee')
            AND ucr.is_active = true
        )
    );

-- Match results policies
CREATE POLICY "Referees can manage match results" ON match_results
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_ctf_roles ucr 
            WHERE ucr.user_id = auth.uid() 
            AND ucr.role_name IN ('admin', 'ctf_admin', 'ctf_head_referee', 'ctf_referee')
            AND ucr.is_active = true
        )
    );

-- Create helper functions
CREATE OR REPLACE FUNCTION get_user_highest_ctf_role(user_uuid UUID)
RETURNS ctf_role_type AS $$
BEGIN
    RETURN (
        SELECT cr.name
        FROM user_ctf_roles ucr
        JOIN ctf_roles cr ON cr.name = ucr.role_name
        WHERE ucr.user_id = user_uuid AND ucr.is_active = true
        ORDER BY cr.hierarchy_level DESC
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION user_has_ctf_permission(user_uuid UUID, permission_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT COALESCE(
            bool_or((cr.permissions->permission_name)::boolean), 
            false
        )
        FROM user_ctf_roles ucr
        JOIN ctf_roles cr ON cr.name = ucr.role_name
        WHERE ucr.user_id = user_uuid AND ucr.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_assign_ctf_role(assigner_uuid UUID, target_role ctf_role_type)
RETURNS BOOLEAN AS $$
DECLARE
    assigner_level INTEGER;
    target_level INTEGER;
BEGIN
    -- Get assigner's highest role level
    SELECT MAX(cr.hierarchy_level) INTO assigner_level
    FROM user_ctf_roles ucr
    JOIN ctf_roles cr ON cr.name = ucr.role_name
    WHERE ucr.user_id = assigner_uuid AND ucr.is_active = true;
    
    -- Get target role level
    SELECT hierarchy_level INTO target_level
    FROM ctf_roles
    WHERE name = target_role;
    
    -- Can assign if assigner level is higher than target level
    RETURN COALESCE(assigner_level, 0) > COALESCE(target_level, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ctf_roles_updated_at BEFORE UPDATE ON ctf_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referee_applications_updated_at BEFORE UPDATE ON referee_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_results_updated_at BEFORE UPDATE ON match_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT; 