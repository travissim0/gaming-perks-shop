-- Migration to add phrase column to user_products table
-- Run this in your Supabase SQL editor

-- Add phrase column to user_products table
ALTER TABLE user_products 
ADD COLUMN IF NOT EXISTS phrase VARCHAR(12) CHECK (phrase ~ '^[a-zA-Z0-9]*$');

-- Add comment to document the column
COMMENT ON COLUMN user_products.phrase IS 'Custom phrase for in-game usage (1-12 alphanumeric characters only)';

-- Create index for faster phrase lookups (optional)
CREATE INDEX IF NOT EXISTS idx_user_products_phrase ON user_products(phrase) WHERE phrase IS NOT NULL;

-- Remove the phrase column from products table since it's now per-purchase
-- Note: Only run this if you don't need the default phrase in products anymore
-- ALTER TABLE products DROP COLUMN IF EXISTS phrase; 