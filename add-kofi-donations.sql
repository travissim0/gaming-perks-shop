-- Ko-fi Donations Integration
-- This extends the donation system to support Ko-fi payments alongside Stripe

-- Add Ko-fi specific columns to donation_transactions table
ALTER TABLE donation_transactions 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'stripe';

-- Update existing records to have payment_method = 'stripe'
UPDATE donation_transactions 
SET payment_method = 'stripe' 
WHERE payment_method IS NULL;

-- Add Ko-fi specific fields
ALTER TABLE donation_transactions 
ADD COLUMN IF NOT EXISTS kofi_transaction_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS kofi_message TEXT,
ADD COLUMN IF NOT EXISTS kofi_from_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS kofi_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS kofi_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS kofi_shop_items JSONB;

-- Create index on payment_method for better filtering performance
CREATE INDEX IF NOT EXISTS idx_donation_transactions_payment_method 
ON donation_transactions(payment_method);

-- Create index on kofi_transaction_id for Ko-fi webhook lookups
CREATE INDEX IF NOT EXISTS idx_donation_transactions_kofi_transaction_id 
ON donation_transactions(kofi_transaction_id);

-- Add comment for documentation
COMMENT ON COLUMN donation_transactions.payment_method IS 'Payment method used: stripe, kofi';
COMMENT ON COLUMN donation_transactions.kofi_transaction_id IS 'Ko-fi transaction/payment ID from webhook';
COMMENT ON COLUMN donation_transactions.kofi_message IS 'Message from Ko-fi donation';
COMMENT ON COLUMN donation_transactions.kofi_from_name IS 'Donor name from Ko-fi';
COMMENT ON COLUMN donation_transactions.kofi_email IS 'Donor email from Ko-fi';
COMMENT ON COLUMN donation_transactions.kofi_url IS 'Ko-fi public URL for the donation';
COMMENT ON COLUMN donation_transactions.kofi_shop_items IS 'JSON array of Ko-fi shop items purchased (if any)';

-- Create a function to get donation stats by payment method
CREATE OR REPLACE FUNCTION get_donation_stats_by_method()
RETURNS TABLE (
    payment_method VARCHAR(20),
    total_count BIGINT,
    total_amount_cents BIGINT,
    avg_amount_cents NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dt.payment_method,
        COUNT(*)::BIGINT as total_count,
        SUM(dt.amount_cents)::BIGINT as total_amount_cents,
        AVG(dt.amount_cents) as avg_amount_cents
    FROM donation_transactions dt
    WHERE dt.status = 'completed'
    GROUP BY dt.payment_method
    ORDER BY total_amount_cents DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions on the function
GRANT EXECUTE ON FUNCTION get_donation_stats_by_method() TO authenticated;

-- Create a view for easy Ko-fi donation querying
CREATE OR REPLACE VIEW kofi_donations AS
SELECT 
    id,
    user_id,
    amount_cents,
    currency,
    status,
    kofi_transaction_id,
    kofi_message,
    kofi_from_name,
    kofi_email,
    kofi_url,
    kofi_shop_items,
    created_at,
    completed_at
FROM donation_transactions
WHERE payment_method = 'kofi';

-- Grant access to the view
GRANT SELECT ON kofi_donations TO authenticated;

-- Create RLS policy for Ko-fi donations view
ALTER TABLE donation_transactions ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own Ko-fi donations
CREATE POLICY "Users can view their own kofi donations" 
ON donation_transactions FOR SELECT 
USING (
    payment_method = 'kofi' AND 
    (user_id = auth.uid() OR auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    ))
);

-- Policy for admins to view all Ko-fi donations  
CREATE POLICY "Admins can view all kofi donations"
ON donation_transactions FOR SELECT
USING (
    payment_method = 'kofi' AND 
    auth.uid() IN (
        SELECT id FROM profiles WHERE is_admin = true
    )
);

-- Policy for Ko-fi webhook to insert donations
CREATE POLICY "Allow kofi webhook inserts"
ON donation_transactions FOR INSERT
WITH CHECK (payment_method = 'kofi');

-- Add validation constraint
ALTER TABLE donation_transactions 
ADD CONSTRAINT check_payment_method 
CHECK (payment_method IN ('stripe', 'kofi'));

-- Add constraint to ensure Ko-fi donations have kofi_transaction_id
ALTER TABLE donation_transactions 
ADD CONSTRAINT check_kofi_transaction_id 
CHECK (
    (payment_method = 'kofi' AND kofi_transaction_id IS NOT NULL) OR 
    (payment_method != 'kofi')
);

COMMIT;

-- Display success message
SELECT 'Ko-fi donation support has been successfully added to the database!' as status; 