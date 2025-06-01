-- Script to relax the phrase constraint for user_products.phrase
-- This allows spaces and common special characters while keeping a 12 character limit

-- First, drop the existing constraint
ALTER TABLE user_products DROP CONSTRAINT IF EXISTS user_products_phrase_check;

-- Add a more flexible constraint that allows:
-- - Letters (a-z, A-Z)
-- - Numbers (0-9) 
-- - Spaces
-- - Common punctuation: ! ? . - _ 
-- - Length between 1-12 characters
ALTER TABLE user_products 
ADD CONSTRAINT user_products_phrase_check 
CHECK (phrase IS NULL OR (LENGTH(phrase) >= 1 AND LENGTH(phrase) <= 12 AND phrase ~ '^[a-zA-Z0-9 !?._-]+$'));

-- Update the comment to reflect the new rules
COMMENT ON COLUMN user_products.phrase IS 'Custom phrase for in-game usage (1-12 characters: letters, numbers, spaces, and !?._- allowed)';

-- Test the constraint with some example phrases
-- These should all work now:
SELECT 'EZPZ NEWB!' ~ '^[a-zA-Z0-9 !?._-]+$' AS test1;  -- Should return true
SELECT 'BOOM!' ~ '^[a-zA-Z0-9 !?._-]+$' AS test2;       -- Should return true
SELECT 'Player_123' ~ '^[a-zA-Z0-9 !?._-]+$' AS test3;  -- Should return true 