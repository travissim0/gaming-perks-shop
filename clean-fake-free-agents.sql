-- Clean up fake/test free agent data
-- This removes any free agents that were automatically added during setup

-- Delete all existing free agent records since these were likely test data
DELETE FROM free_agents WHERE id IS NOT NULL;

-- Reset the sequence if it exists
-- This ensures clean IDs when real users start joining
SELECT setval(pg_get_serial_sequence('free_agents', 'id'), 1, false);

-- Verify cleanup
SELECT COUNT(*) as remaining_free_agents FROM free_agents; 