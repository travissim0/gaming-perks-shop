-- Migrate existing free agent records to new enhanced schema format (FIXED VERSION)
-- This script updates existing records to properly use the new fields

-- First, let's see what we're working with
SELECT 
    id,
    preferred_roles,
    secondary_roles,
    availability,
    availability_days,
    availability_times,
    class_ratings,
    classes_to_try,
    timezone,
    created_at
FROM free_agents 
WHERE is_active = true
ORDER BY created_at DESC;

-- Step 1: Initialize null/empty fields with proper defaults
UPDATE free_agents 
SET 
    secondary_roles = COALESCE(secondary_roles, '{}'),
    availability_days = COALESCE(availability_days, '{}'),
    class_ratings = COALESCE(class_ratings, '{}'),
    classes_to_try = COALESCE(classes_to_try, '{}'),
    availability_times = COALESCE(availability_times, '{}'),
    timezone = COALESCE(timezone, 'America/New_York')
WHERE 
    secondary_roles IS NULL OR 
    availability_days IS NULL OR 
    class_ratings IS NULL OR 
    classes_to_try IS NULL OR 
    availability_times IS NULL OR 
    timezone IS NULL;

-- Step 2: Migrate old availability text to structured data (only for records with empty availability_days)
UPDATE free_agents 
SET 
    availability_days = CASE 
        WHEN availability ILIKE '%monday%' OR availability ILIKE '%weekday%' OR availability ILIKE '%week night%' THEN 
            ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday']
        WHEN availability ILIKE '%weekend%' OR availability ILIKE '%sunday%' THEN 
            ARRAY['Saturday', 'Sunday']
        WHEN availability ILIKE '%available%' AND availability NOT ILIKE '%not available%' THEN 
            ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        ELSE ARRAY[]::text[]
    END
WHERE 
    array_length(availability_days, 1) IS NULL AND
    availability IS NOT NULL AND 
    availability != '';

-- Step 3: Set default practice times for records that now have availability days
UPDATE free_agents 
SET 
    availability_times = CASE 
        WHEN availability ILIKE '%5pm%' OR availability ILIKE '%17:%' THEN 
            '{"Monday": {"start": "17:00", "end": "21:00"}, "Tuesday": {"start": "17:00", "end": "21:00"}, "Wednesday": {"start": "17:00", "end": "21:00"}, "Thursday": {"start": "17:00", "end": "21:00"}}'::jsonb
        WHEN availability ILIKE '%evening%' OR availability ILIKE '%night%' THEN 
            '{"Monday": {"start": "18:00", "end": "22:00"}, "Tuesday": {"start": "18:00", "end": "22:00"}, "Wednesday": {"start": "18:00", "end": "22:00"}, "Thursday": {"start": "18:00", "end": "22:00"}}'::jsonb
        WHEN availability ILIKE '%weekend%' THEN 
            '{"Saturday": {"start": "14:00", "end": "18:00"}, "Sunday": {"start": "14:00", "end": "18:00"}}'::jsonb
        ELSE '{}'::jsonb
    END
WHERE 
    array_length(availability_days, 1) > 0 AND
    availability_times = '{}'::jsonb;

-- Step 4: Convert old role format to new CTF classes for preferred_roles
UPDATE free_agents 
SET preferred_roles = array_replace(preferred_roles, 'Offense', 'O INF')
WHERE 'Offense' = ANY(preferred_roles);

UPDATE free_agents 
SET preferred_roles = array_replace(preferred_roles, 'Defense', 'D INF')
WHERE 'Defense' = ANY(preferred_roles);

UPDATE free_agents 
SET preferred_roles = array_replace(preferred_roles, 'Support', 'Medic')
WHERE 'Support' = ANY(preferred_roles);

-- Handle Flex role - remove duplicates and add both O INF and D INF if not already present
UPDATE free_agents 
SET preferred_roles = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_remove(preferred_roles, 'Flex') || 
            CASE WHEN NOT ('O INF' = ANY(preferred_roles)) THEN ARRAY['O INF'] ELSE ARRAY[]::text[] END ||
            CASE WHEN NOT ('D INF' = ANY(preferred_roles)) THEN ARRAY['D INF'] ELSE ARRAY[]::text[] END
        )
    )
)
WHERE 'Flex' = ANY(preferred_roles);

-- Step 5: Add some sample enhanced data for testing (to the most recent record)
UPDATE free_agents 
SET 
    secondary_roles = ARRAY['Medic', 'Engineer'],
    availability_days = ARRAY['Monday', 'Wednesday', 'Friday'],
    availability_times = '{"Monday": {"start": "18:00", "end": "22:00"}, "Wednesday": {"start": "19:00", "end": "23:00"}, "Friday": {"start": "18:00", "end": "22:00"}}'::jsonb,
    class_ratings = '{"O INF": 4, "D INF": 3, "Medic": 5}'::jsonb,
    classes_to_try = ARRAY['Engineer', 'SL'],
    timezone = 'America/New_York'
WHERE id = (
    SELECT id FROM free_agents 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT 1
);

-- Step 6: Verify the migration worked
SELECT 
    preferred_roles,
    secondary_roles,
    availability_days,
    availability_times,
    class_ratings,
    classes_to_try,
    timezone,
    availability as old_availability_text
FROM free_agents 
WHERE is_active = true
ORDER BY created_at DESC;

-- Step 7: Show summary of enhanced vs basic records
SELECT 
    COUNT(*) as total_active_agents,
    COUNT(CASE WHEN array_length(secondary_roles, 1) > 0 THEN 1 END) as with_secondary_roles,
    COUNT(CASE WHEN array_length(availability_days, 1) > 0 THEN 1 END) as with_availability_days,
    COUNT(CASE WHEN class_ratings != '{}'::jsonb THEN 1 END) as with_class_ratings,
    COUNT(CASE WHEN array_length(classes_to_try, 1) > 0 THEN 1 END) as with_classes_to_try
FROM free_agents 
WHERE is_active = true; 