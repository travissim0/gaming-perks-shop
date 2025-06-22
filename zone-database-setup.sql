-- Zone Management Database Setup
-- Run this in your Supabase SQL editor

-- Create zone_status table to store current zone states
CREATE TABLE IF NOT EXISTS zone_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_key TEXT NOT NULL UNIQUE,
    zone_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'STOPPED')),
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),
    hostname TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create zone_commands table for web app to send commands to zone script
CREATE TABLE IF NOT EXISTS zone_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_key TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('start', 'stop', 'restart')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_by UUID REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    result_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create zone_logs table for audit trail
CREATE TABLE IF NOT EXISTS zone_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    zone_key TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    hostname TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_zone_status_zone_key ON zone_status(zone_key);
CREATE INDEX IF NOT EXISTS idx_zone_commands_status ON zone_commands(status);
CREATE INDEX IF NOT EXISTS idx_zone_commands_created_at ON zone_commands(created_at);
CREATE INDEX IF NOT EXISTS idx_zone_logs_zone_key ON zone_logs(zone_key);
CREATE INDEX IF NOT EXISTS idx_zone_logs_timestamp ON zone_logs(timestamp);

-- Enable Row Level Security
ALTER TABLE zone_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for zone_status (read-only for authenticated users)
CREATE POLICY "Allow authenticated users to read zone status" ON zone_status
    FOR SELECT USING (auth.role() = 'authenticated');

-- RLS Policies for zone_commands 
CREATE POLICY "Allow zone admins to insert commands" ON zone_commands
    FOR INSERT WITH CHECK (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE is_admin = true 
            OR ctf_role = 'ctf_admin' 
            OR ctf_role = 'ctf_head_referee'
        )
    );

CREATE POLICY "Allow zone admins to read commands" ON zone_commands
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE is_admin = true 
            OR ctf_role = 'ctf_admin' 
            OR ctf_role = 'ctf_head_referee'
        )
    );

-- RLS Policies for zone_logs
CREATE POLICY "Allow zone admins to read logs" ON zone_logs
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE is_admin = true 
            OR ctf_role = 'ctf_admin' 
            OR ctf_role = 'ctf_head_referee'
        )
    );

-- Function to update zone_status updated_at timestamp
CREATE OR REPLACE FUNCTION update_zone_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_zone_status_updated_at
    BEFORE UPDATE ON zone_status
    FOR EACH ROW
    EXECUTE FUNCTION update_zone_status_updated_at();

-- Function to clean up old completed commands (optional)
CREATE OR REPLACE FUNCTION cleanup_old_zone_commands()
RETURNS void AS $$
BEGIN
    DELETE FROM zone_commands 
    WHERE status IN ('completed', 'failed') 
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Insert initial zone data (customize these based on your actual zones)
INSERT INTO zone_status (zone_key, zone_name, status) VALUES
    ('ctf', 'CTF - Twin Peaks 2.0', 'STOPPED'),
    ('tp', 'CTF - Twin Peaks Classic', 'STOPPED'),
    ('usl', 'League - USL Matches', 'STOPPED'),
    ('usl2', 'League - USL Secondary', 'STOPPED'),
    ('skMini', 'Skirmish - Minimaps', 'STOPPED'),
    ('grav', 'Sports - GravBall', 'STOPPED'),
    ('arena', 'Arcade - The Arena', 'STOPPED')
ON CONFLICT (zone_key) DO NOTHING;

-- Grant necessary permissions to service role
GRANT ALL ON zone_status TO service_role;
GRANT ALL ON zone_commands TO service_role;
GRANT ALL ON zone_logs TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role; 