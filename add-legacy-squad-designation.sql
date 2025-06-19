-- Add legacy squad designation system
-- This allows admins to mark squads as "legacy" for historical purposes

-- Add is_legacy column to squads table
ALTER TABLE squads 
ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_squads_is_legacy ON squads(is_legacy);

-- Update the squad interface to include legacy status
COMMENT ON COLUMN squads.is_legacy IS 'Marks a squad as legacy (historical) - typically for old/disbanded squads that should be preserved for history';

-- Add admin policy for managing legacy status
CREATE POLICY "Admins can update squad legacy status" ON squads
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM profiles WHERE is_admin = true
        )
    );

-- Create function to bulk mark squads as legacy based on criteria
CREATE OR REPLACE FUNCTION mark_squads_as_legacy(
    before_date TIMESTAMP WITH TIME ZONE DEFAULT '2023-01-01'::timestamp,
    inactive_only BOOLEAN DEFAULT true
) RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE squads 
    SET is_legacy = true, updated_at = NOW()
    WHERE created_at < before_date
    AND (NOT inactive_only OR is_active = false)
    AND is_legacy = false;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to admins
GRANT EXECUTE ON FUNCTION mark_squads_as_legacy(TIMESTAMP WITH TIME ZONE, BOOLEAN) TO authenticated;

-- Example usage (commented out):
-- SELECT mark_squads_as_legacy('2023-01-01'::timestamp, true); -- Mark inactive squads before 2023 as legacy
-- SELECT mark_squads_as_legacy('2022-01-01'::timestamp, false); -- Mark all squads before 2022 as legacy

SELECT 'Legacy squad designation system added successfully!' as status; 