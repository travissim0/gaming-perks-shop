-- Update Rainbow Caw price to $5.00
-- Run this in your Supabase SQL Editor

-- First, let's see the current Rainbow Caw product
SELECT id, name, description, price, active 
FROM products 
WHERE name ILIKE '%rainbow%caw%' OR name ILIKE '%rainbow caw%';

-- Update the price to $5.00 (500 cents)
UPDATE products 
SET 
    price = 500,  -- $5.00 in cents
    updated_at = NOW()
WHERE name ILIKE '%rainbow%caw%' OR name ILIKE '%rainbow caw%';

-- Verify the update
SELECT id, name, description, price, active, updated_at 
FROM products 
WHERE name ILIKE '%rainbow%caw%' OR name ILIKE '%rainbow caw%'; 