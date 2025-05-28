-- Migration script to add donation_message field and fix product references in existing donation_transactions table
-- Run this if you already have the donation_transactions table without these fields

-- Add the donation_message column
ALTER TABLE donation_transactions 
ADD COLUMN IF NOT EXISTS donation_message TEXT;

-- Update perk references to product references if they exist
ALTER TABLE donation_transactions 
RENAME COLUMN perk_id TO product_id;
ALTER TABLE donation_transactions 
RENAME COLUMN perk_name TO product_name;
ALTER TABLE donation_transactions 
RENAME COLUMN perk_description TO product_description;

-- Add comments to document the new fields
COMMENT ON COLUMN donation_transactions.donation_message IS 'Optional message to display with the donation';
COMMENT ON COLUMN donation_transactions.product_id IS 'Reference to the products table';
COMMENT ON COLUMN donation_transactions.product_name IS 'Name of the purchased product';
COMMENT ON COLUMN donation_transactions.product_description IS 'Description of the purchased product';

-- Note: in_game_alias is now retrieved from user_profiles table via user_id join 