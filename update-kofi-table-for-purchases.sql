-- Add columns to track Ko-fi donations used for purchases
ALTER TABLE donation_transactions 
ADD COLUMN IF NOT EXISTS used_for_purchase BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES user_products(id);

-- Create index for better performance when looking up unused donations
CREATE INDEX IF NOT EXISTS idx_donation_transactions_purchase_lookup 
ON donation_transactions (used_for_purchase, customer_email, amount_cents, created_at);

CREATE INDEX IF NOT EXISTS idx_donation_transactions_kofi_from_name_lookup 
ON donation_transactions (used_for_purchase, kofi_from_name, amount_cents, created_at);

-- Update any existing records to have used_for_purchase = false if null
UPDATE donation_transactions 
SET used_for_purchase = false 
WHERE used_for_purchase IS NULL; 