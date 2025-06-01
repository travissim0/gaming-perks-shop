-- Update RLS policies to allow users to update their own user_products
-- This enables phrase editing functionality on the frontend

-- First apply the relaxed phrase constraint
-- (Copy from relax-phrase-constraint.sql)
ALTER TABLE user_products DROP CONSTRAINT IF EXISTS user_products_phrase_check;

ALTER TABLE user_products 
ADD CONSTRAINT user_products_phrase_check 
CHECK (phrase IS NULL OR (LENGTH(phrase) >= 1 AND LENGTH(phrase) <= 12 AND phrase ~ '^[a-zA-Z0-9 !?._-]+$'));

COMMENT ON COLUMN user_products.phrase IS 'Custom phrase for in-game usage (1-12 characters: letters, numbers, spaces, and !?._- allowed)';

-- Update RLS policy to allow users to update their own purchases
-- Drop the existing update policy if it exists
DROP POLICY IF EXISTS "Users can update their own purchases" ON user_products;

-- Create new update policy that allows phrase updates
CREATE POLICY "Users can update their own purchases" ON user_products
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_products' 
ORDER BY policyname; 