-- Create donation_transactions table to track all donations
CREATE TABLE IF NOT EXISTS donation_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_session_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
    product_id UUID REFERENCES products(id),
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

-- Create donation_line_items table for detailed breakdown
CREATE TABLE IF NOT EXISTS donation_line_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    donation_transaction_id UUID REFERENCES donation_transactions(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, -- 'perk', 'tip', 'custom'
    item_name TEXT NOT NULL,
    item_description TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price_cents INTEGER NOT NULL,
    total_price_cents INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_donation_transactions_user_id ON donation_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_status ON donation_transactions(status);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_created_at ON donation_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_donation_transactions_stripe_payment_intent ON donation_transactions(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_donation_line_items_transaction_id ON donation_line_items(donation_transaction_id);

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

-- Set up Row Level Security (RLS)
ALTER TABLE donation_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_line_items ENABLE ROW LEVEL SECURITY;

-- Policies for donation_transactions
CREATE POLICY "Users can view their own donation transactions" ON donation_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own donation transactions" ON donation_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own donation transactions" ON donation_transactions
    FOR UPDATE USING (auth.uid() = user_id);

-- Admin policies for donation_transactions
CREATE POLICY "Admins can view all donation transactions" ON donation_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can update all donation transactions" ON donation_transactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.is_admin = true
        )
    );

-- Policies for donation_line_items
CREATE POLICY "Users can view their own donation line items" ON donation_line_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM donation_transactions 
            WHERE donation_transactions.id = donation_line_items.donation_transaction_id 
            AND donation_transactions.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own donation line items" ON donation_line_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM donation_transactions 
            WHERE donation_transactions.id = donation_line_items.donation_transaction_id 
            AND donation_transactions.user_id = auth.uid()
        )
    );

-- Admin policies for donation_line_items
CREATE POLICY "Admins can view all donation line items" ON donation_line_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.is_admin = true
        )
    );

CREATE POLICY "Admins can update all donation line items" ON donation_line_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.user_id = auth.uid() 
            AND user_profiles.is_admin = true
        )
    );

-- Grant necessary permissions
GRANT ALL ON donation_transactions TO authenticated;
GRANT ALL ON donation_line_items TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated; 