-- Create donation_transactions table (minimal version without user_profiles dependency)
CREATE TABLE IF NOT EXISTS donation_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_session_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    product_id UUID,
    product_name TEXT,
    product_description TEXT,
    customer_email TEXT,
    customer_name TEXT,
    donation_message TEXT, -- Optional message to display with the donation
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_donation_transactions_user_id ON donation_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_status ON donation_transactions(status);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_created_at ON donation_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_stripe_payment_intent ON donation_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_stripe_session ON donation_transactions(stripe_session_id);

-- Create updated_at trigger for donation_transactions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_donation_transactions_updated_at 
    BEFORE UPDATE ON donation_transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Set up Row Level Security (RLS) - simplified without user_profiles dependency
ALTER TABLE donation_transactions ENABLE ROW LEVEL SECURITY;

-- Basic policies for donation_transactions
CREATE POLICY "Users can view their own donation transactions" ON donation_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own donation transactions" ON donation_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can do everything" ON donation_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT ALL ON donation_transactions TO authenticated;
GRANT ALL ON donation_transactions TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role; 