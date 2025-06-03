-- Add Square payment support to user_products table
-- Run this in your Supabase SQL Editor

-- Add Square-specific columns to user_products table
ALTER TABLE user_products 
ADD COLUMN IF NOT EXISTS square_payment_id TEXT,
ADD COLUMN IF NOT EXISTS square_order_id TEXT,
ADD COLUMN IF NOT EXISTS square_checkout_session_id TEXT;

-- Add indexes for Square payment lookups
CREATE INDEX IF NOT EXISTS idx_user_products_square_payment_id 
ON user_products(square_payment_id);

CREATE INDEX IF NOT EXISTS idx_user_products_square_order_id 
ON user_products(square_order_id);

CREATE INDEX IF NOT EXISTS idx_user_products_square_checkout_session_id 
ON user_products(square_checkout_session_id);

-- Handle purchase_method column - create enum if it doesn't exist, or add 'square' value
DO $$
BEGIN
    -- Check if purchase_method enum type exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_method') THEN
        -- Create the enum type with all values
        CREATE TYPE purchase_method AS ENUM ('stripe', 'kofi', 'square', 'manual', 'admin_grant');
        
        -- Add purchase_method column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'user_products' 
            AND column_name = 'purchase_method'
        ) THEN
            ALTER TABLE user_products 
            ADD COLUMN purchase_method purchase_method DEFAULT 'kofi';
        END IF;
    ELSE
        -- Enum exists, check if 'square' value exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumlabel = 'square' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'purchase_method')
        ) THEN
            -- Add 'square' to the existing purchase_method enum
            ALTER TYPE purchase_method ADD VALUE 'square';
        END IF;
    END IF;
END $$;

-- Add comments to document the new columns
COMMENT ON COLUMN user_products.square_payment_id IS 'Square payment ID for tracking the specific payment transaction';
COMMENT ON COLUMN user_products.square_order_id IS 'Square order ID for tracking the order that contains this purchase';
COMMENT ON COLUMN user_products.square_checkout_session_id IS 'Square checkout session ID for tracking the checkout process';

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_products' 
AND column_name IN ('square_payment_id', 'square_order_id', 'square_checkout_session_id', 'purchase_method')
ORDER BY column_name;

-- Show current table structure for user_products
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_products' 
ORDER BY ordinal_position; 