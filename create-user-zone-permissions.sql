-- Create user zone permissions table
CREATE TABLE IF NOT EXISTS user_zone_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    zone_key VARCHAR(255) NOT NULL,
    zone_name VARCHAR(255) NOT NULL,
    permissions TEXT[] DEFAULT ARRAY['start', 'stop', 'restart'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    
    UNIQUE(user_id, zone_key)
);

-- Enable RLS
ALTER TABLE user_zone_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own zone permissions" 
ON user_zone_permissions FOR SELECT 
USING (auth.uid() = user_id);

-- Admins can view and manage all zone permissions
CREATE POLICY "Admins can manage all zone permissions" 
ON user_zone_permissions FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (is_admin = true OR is_zone_admin = true OR site_admin = true)
    )
);

-- Create function to get user zone permissions
CREATE OR REPLACE FUNCTION get_user_zone_permissions(p_user_id UUID)
RETURNS TABLE (
    zone_key VARCHAR(255),
    zone_name VARCHAR(255),
    permissions TEXT[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT uzp.zone_key, uzp.zone_name, uzp.permissions
    FROM user_zone_permissions uzp
    WHERE uzp.user_id = p_user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_zone_permissions(UUID) TO authenticated;

-- Create function to check if user has zone permission
CREATE OR REPLACE FUNCTION user_has_zone_permission(
    p_user_id UUID,
    p_zone_key VARCHAR(255),
    p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    has_permission BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM user_zone_permissions uzp
        WHERE uzp.user_id = p_user_id 
        AND uzp.zone_key = p_zone_key
        AND p_permission = ANY(uzp.permissions)
    ) INTO has_permission;
    
    RETURN has_permission;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION user_has_zone_permission(UUID, VARCHAR(255), TEXT) TO authenticated;

-- Insert trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_zone_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_zone_permissions_updated_at
    BEFORE UPDATE ON user_zone_permissions
    FOR EACH ROW EXECUTE FUNCTION update_user_zone_permissions_updated_at();
