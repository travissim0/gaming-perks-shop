-- Check the actual structure of tables to understand the column names
\d+ squad_members;
\d+ squads;
\d+ profiles;

-- Check what columns exist in squad_members table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'squad_members' 
ORDER BY ordinal_position;

-- Check what columns exist in squads table  
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'squads' 
ORDER BY ordinal_position;

-- Check what columns exist in profiles table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position; 