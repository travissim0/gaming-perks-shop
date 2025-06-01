-- Ko-fi Donation Integration SQL
-- Run this in your Supabase SQL Editor to add Ko-fi support to the donation system

-- First, create the donation_transactions table if it doesn't exist
-- This replaces the old 'donations' table with a more comprehensive structure
CREATE TABLE IF NOT EXISTS donation_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Basic transaction info
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT DEFAULT 'completed', -- completed, pending, failed, refunded
    
    -- Customer information
    customer_email TEXT,
    customer_name TEXT,
    donation_message TEXT,
    
    -- Payment method and provider info
    payment_method TEXT DEFAULT 'stripe', -- 'stripe' or 'kofi'
    stripe_payment_intent_id TEXT,
    stripe_session_id TEXT,
    
    -- Ko-fi specific fields
    kofi_transaction_id TEXT,
    kofi_message TEXT,
    kofi_from_name TEXT,
    kofi_email TEXT,
    kofi_url TEXT,
    kofi_shop_items JSONB,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_donation_transactions_user_id ON donation_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_payment_method ON donation_transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_status ON donation_transactions(status);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_created_at ON donation_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_kofi_transaction_id ON donation_transactions(kofi_transaction_id);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_stripe_payment_intent_id ON donation_transactions(stripe_payment_intent_id);

-- Enable Row Level Security
ALTER TABLE donation_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for donation_transactions
CREATE POLICY "Users can view their own donations" ON donation_transactions
    FOR SELECT USING (
        auth.uid() = user_id OR 
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    );

CREATE POLICY "Admins can view all donations" ON donation_transactions
    FOR SELECT USING (
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    );

CREATE POLICY "System can insert donations" ON donation_transactions
    FOR INSERT WITH CHECK (true); -- Allow webhook and system inserts

CREATE POLICY "Admins can update donations" ON donation_transactions
    FOR UPDATE USING (
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    );

CREATE POLICY "Admins can delete donations" ON donation_transactions
    FOR DELETE USING (
        auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    );

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_donation_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_donation_transactions_updated_at 
    BEFORE UPDATE ON donation_transactions
    FOR EACH ROW 
    EXECUTE FUNCTION update_donation_transactions_updated_at();

-- Migrate existing donations from old table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'donations') THEN
        INSERT INTO donation_transactions (
            user_id,
            amount_cents,
            currency,
            status,
            customer_email,
            customer_name,
            donation_message,
            payment_method,
            stripe_payment_intent_id,
            created_at,
            completed_at
        )
        SELECT 
            user_id,
            amount as amount_cents,
            'usd' as currency,
            COALESCE(status, 'completed') as status,
            donor_email as customer_email,
            donor_name as customer_name,
            message as donation_message,
            'stripe' as payment_method,
            stripe_payment_intent_id,
            created_at,
            created_at as completed_at
        FROM donations
        WHERE NOT EXISTS (
            SELECT 1 FROM donation_transactions dt 
            WHERE dt.stripe_payment_intent_id = donations.stripe_payment_intent_id
        );
        
        RAISE NOTICE 'Migrated existing donations to donation_transactions table';
    END IF;
END $$;

-- Create a view for backward compatibility (optional)
CREATE OR REPLACE VIEW donations_view AS
SELECT 
    id,
    user_id,
    amount_cents as amount,
    customer_email as donor_email,
    customer_name as donor_name,
    donation_message as message,
    stripe_payment_intent_id,
    status,
    created_at
FROM donation_transactions
WHERE payment_method = 'stripe';

-- Insert a test Ko-fi donation (commented out - uncomment to test)
/*
INSERT INTO donation_transactions (
    payment_method,
    amount_cents,
    currency,
    status,
    customer_email,
    customer_name,
    donation_message,
    kofi_transaction_id,
    kofi_from_name,
    kofi_email,
    created_at,
    completed_at
) VALUES (
    'kofi',
    1000, -- $10.00
    'usd',
    'completed',
    'test@kofi.com',
    'Ko-fi Test User',
    'Test Ko-fi donation for integration',
    'kofi_test_' || extract(epoch from now()),
    'Ko-fi Test User',
    'test@kofi.com',
    now(),
    now()
);
*/

-- Verify the setup
SELECT 
    'Ko-fi donation integration setup complete!' as message,
    COUNT(*) as total_transactions,
    COUNT(*) FILTER (WHERE payment_method = 'stripe') as stripe_count,
    COUNT(*) FILTER (WHERE payment_method = 'kofi') as kofi_count
FROM donation_transactions; 