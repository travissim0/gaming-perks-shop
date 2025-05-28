-- Simple migration script for donation tracking
-- Run this if you already have a donation_transactions table

-- Add the donation_message column if it doesn't exist
ALTER TABLE donation_transactions 
ADD COLUMN IF NOT EXISTS donation_message TEXT;

-- Add comment to document the new field
COMMENT ON COLUMN donation_transactions.donation_message IS 'Optional message to display with the donation';

-- If you have perk references that need to be changed to product references, uncomment these:
-- ALTER TABLE donation_transactions RENAME COLUMN perk_id TO product_id;
-- ALTER TABLE donation_transactions RENAME COLUMN perk_name TO product_name;
-- ALTER TABLE donation_transactions RENAME COLUMN perk_description TO product_description;

-- Note: in_game_alias is retrieved from user_profiles table via user_id join 