-- Add Square payment support to donation_transactions table
-- Run this in your Supabase SQL Editor

-- Add Square-specific columns to donation_transactions table
ALTER TABLE donation_transactions 
ADD COLUMN IF NOT EXISTS square_payment_id TEXT,
ADD COLUMN IF NOT EXISTS square_order_id TEXT;

-- Add indexes for Square payment lookups
CREATE INDEX IF NOT EXISTS idx_donation_transactions_square_payment_id 
ON donation_transactions(square_payment_id);

CREATE INDEX IF NOT EXISTS idx_donation_transactions_square_order_id 
ON donation_transactions(square_order_id);

-- Handle payment_method column - create enum if it doesn't exist, or add 'square' value
DO $$
BEGIN
    -- Check if payment_method enum type exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        -- Create the enum type with all values
        CREATE TYPE payment_method AS ENUM ('kofi', 'stripe', 'square', 'manual');
        
        -- Add payment_method column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'donation_transactions' 
            AND column_name = 'payment_method'
        ) THEN
            ALTER TABLE donation_transactions 
            ADD COLUMN payment_method payment_method DEFAULT 'kofi';
        END IF;
    ELSE
        -- Enum exists, check if 'square' value exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumlabel = 'square' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'payment_method')
        ) THEN
            -- Add 'square' to the existing payment_method enum
            ALTER TYPE payment_method ADD VALUE 'square';
        END IF;
    END IF;
END $$;

-- Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'donation_transactions' 
AND column_name IN ('square_payment_id', 'square_order_id', 'payment_method')
ORDER BY column_name; 