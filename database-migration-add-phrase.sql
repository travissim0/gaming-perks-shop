-- Migration to add phrase column to products table
-- Run this in your Supabase SQL editor

-- Add phrase column to products table
ALTER TABLE products 
ADD COLUMN phrase VARCHAR(12) CHECK (phrase ~ '^[a-zA-Z0-9]*$');

-- Add comment to document the column
COMMENT ON COLUMN products.phrase IS 'Optional custom phrase for in-game usage (1-12 alphanumeric characters only)';

-- Create index for faster phrase lookups (optional)
CREATE INDEX IF NOT EXISTS idx_products_phrase ON products(phrase) WHERE phrase IS NOT NULL; 