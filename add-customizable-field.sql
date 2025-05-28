-- Migration to add customizable field to products table
-- Run this in your Supabase SQL editor

-- Add customizable column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS customizable BOOLEAN DEFAULT false;

-- Add comment to document the column
COMMENT ON COLUMN products.customizable IS 'Whether this product supports custom phrase input during purchase';

-- Update existing "Text Visual Kill Macro" to be customizable
UPDATE products 
SET customizable = true 
WHERE name ILIKE '%text visual kill macro%' OR name ILIKE '%text%macro%' OR name ILIKE '%kill macro%';

-- Create index for faster filtering (optional)
CREATE INDEX IF NOT EXISTS idx_products_customizable ON products(customizable) WHERE customizable = true; 