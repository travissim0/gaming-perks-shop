-- Fix database relationships for Gaming Perks Shop
-- Run this in Supabase SQL Editor if you're getting relationship errors

-- Ensure foreign keys exist with proper names
ALTER TABLE user_products 
DROP CONSTRAINT IF EXISTS user_products_user_id_fkey;

ALTER TABLE user_products 
ADD CONSTRAINT user_products_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE user_products 
DROP CONSTRAINT IF EXISTS user_products_product_id_fkey;

ALTER TABLE user_products 
ADD CONSTRAINT user_products_product_id_fkey 
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- Ensure donations foreign key exists
ALTER TABLE donations 
DROP CONSTRAINT IF EXISTS donations_user_id_fkey;

ALTER TABLE donations 
ADD CONSTRAINT donations_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Verify the foreign keys exist
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('user_products', 'donations', 'squad_members', 'squad_invites')
ORDER BY tc.table_name; 