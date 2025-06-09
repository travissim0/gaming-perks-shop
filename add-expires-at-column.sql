-- Add missing expires_at column to user_products table
-- This column is required for the Ko-fi webhook to work properly

-- Add the expires_at column if it doesn't exist
ALTER TABLE user_products 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Set default values for existing records (never expire for purchased items)
UPDATE user_products 
SET expires_at = NULL 
WHERE expires_at IS NULL;

-- Add a comment to document the column
COMMENT ON COLUMN user_products.expires_at IS 'Expiration date for temporary perks. NULL means never expires.';

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'user_products' 
AND column_name = 'expires_at'; 