-- Gaming Perks Shop Database Schema
-- Run this in your Supabase SQL Editor to set up the complete database

-- Create profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    in_game_alias TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    registration_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price INTEGER NOT NULL, -- Price in cents
    price_id TEXT NOT NULL, -- Stripe price ID
    image TEXT,
    active BOOLEAN DEFAULT TRUE,
    phrase TEXT, -- Custom phrase for in-game usage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_products table (purchased products)
CREATE TABLE IF NOT EXISTS user_products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    stripe_payment_intent_id TEXT,
    status TEXT DEFAULT 'active', -- active, expired, revoked
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create squads table
CREATE TABLE IF NOT EXISTS squads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    leader_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    max_members INTEGER DEFAULT 6,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create squad_members table
CREATE TABLE IF NOT EXISTS squad_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    squad_id UUID REFERENCES squads(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(squad_id, user_id)
);

-- Create squad_invites table
CREATE TABLE IF NOT EXISTS squad_invites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    squad_id UUID REFERENCES squads(id) ON DELETE CASCADE NOT NULL,
    inviter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    invited_player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, accepted, declined
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create donations table (for tracking donations)
CREATE TABLE IF NOT EXISTS donations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL, -- Amount in cents
    stripe_payment_intent_id TEXT NOT NULL,
    status TEXT DEFAULT 'completed', -- completed, failed, refunded
    donor_name TEXT,
    donor_email TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_in_game_alias ON profiles(in_game_alias);
CREATE INDEX IF NOT EXISTS idx_user_products_user_id ON user_products(user_id);
CREATE INDEX IF NOT EXISTS idx_user_products_product_id ON user_products(product_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_squad_id ON squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_user_id ON squad_members(user_id);
CREATE INDEX IF NOT EXISTS idx_squad_invites_squad_id ON squad_invites(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_invites_invited_player_id ON squad_invites(invited_player_id);
CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for products
CREATE POLICY "Products are viewable by everyone" ON products
    FOR SELECT USING (active = true OR auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

CREATE POLICY "Only admins can insert products" ON products
    FOR INSERT WITH CHECK (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

CREATE POLICY "Only admins can update products" ON products
    FOR UPDATE USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

CREATE POLICY "Only admins can delete products" ON products
    FOR DELETE USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

-- RLS Policies for user_products
CREATE POLICY "Users can view their own purchases" ON user_products
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all purchases" ON user_products
    FOR SELECT USING (auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

CREATE POLICY "System can insert user_products" ON user_products
    FOR INSERT WITH CHECK (true); -- Allow system/webhook inserts

CREATE POLICY "Users can update their own purchases" ON user_products
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for squads
CREATE POLICY "Public squads are viewable by everyone" ON squads
    FOR SELECT USING (is_public = true OR auth.uid() = leader_id OR auth.uid() IN (
        SELECT user_id FROM squad_members WHERE squad_id = squads.id
    ));

CREATE POLICY "Authenticated users can create squads" ON squads
    FOR INSERT WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "Squad leaders can update their squads" ON squads
    FOR UPDATE USING (auth.uid() = leader_id);

CREATE POLICY "Squad leaders can delete their squads" ON squads
    FOR DELETE USING (auth.uid() = leader_id);

-- RLS Policies for squad_members
CREATE POLICY "Squad members are viewable by squad members" ON squad_members
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() IN (
        SELECT leader_id FROM squads WHERE id = squad_id
    ) OR auth.uid() IN (
        SELECT user_id FROM squad_members sm WHERE sm.squad_id = squad_members.squad_id
    ));

CREATE POLICY "Squad leaders can add members" ON squad_members
    FOR INSERT WITH CHECK (auth.uid() IN (
        SELECT leader_id FROM squads WHERE id = squad_id
    ) OR auth.uid() = user_id);

CREATE POLICY "Users can leave squads" ON squad_members
    FOR DELETE USING (auth.uid() = user_id OR auth.uid() IN (
        SELECT leader_id FROM squads WHERE id = squad_id
    ));

-- RLS Policies for squad_invites
CREATE POLICY "Users can view invites they sent or received" ON squad_invites
    FOR SELECT USING (auth.uid() = inviter_id OR auth.uid() = invited_player_id);

CREATE POLICY "Squad members can create invites" ON squad_invites
    FOR INSERT WITH CHECK (auth.uid() = inviter_id OR auth.uid() = invited_player_id);

CREATE POLICY "Users can update invites they received" ON squad_invites
    FOR UPDATE USING (auth.uid() = invited_player_id OR auth.uid() = inviter_id);

-- RLS Policies for donations
CREATE POLICY "Users can view their own donations" ON donations
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ));

CREATE POLICY "System can insert donations" ON donations
    FOR INSERT WITH CHECK (true); -- Allow system/webhook inserts

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_products_updated_at BEFORE UPDATE ON user_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_squads_updated_at BEFORE UPDATE ON squads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_squad_invites_updated_at BEFORE UPDATE ON squad_invites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample data (optional)
-- INSERT INTO products (name, description, price, price_id, phrase, active) VALUES
--     ('VIP Status', 'Access to VIP features and exclusive content', 999, 'price_vip_example', 'VIP', true),
--     ('Premium Pack', 'Premium perks package with extra benefits', 1999, 'price_premium_example', 'PREMIUM', true),
--     ('Supporter Badge', 'Show your support with a special badge', 499, 'price_supporter_example', 'SUPPORT', true)
-- ON CONFLICT DO NOTHING;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated; 