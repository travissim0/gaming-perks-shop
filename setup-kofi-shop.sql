-- Ko-fi Shop Integration Setup
-- Run this to add the Ko-fi direct link code field to products table
ALTER TABLE products ADD COLUMN kofi_direct_link_code VARCHAR(50);

-- Example: Update existing products with their Ko-fi shop direct link codes
-- Replace 'your_direct_link_code' with the actual codes from Ko-fi shop items

-- Example product updates (replace with your actual product IDs and Ko-fi codes):
-- UPDATE products SET kofi_direct_link_code = '40a4b65a29' WHERE name = 'Text Visual Kill Macro';
-- UPDATE products SET kofi_direct_link_code = 'another_code' WHERE name = 'Another Product';

-- Verify the update
SELECT id, name, price, kofi_direct_link_code FROM products WHERE active = true;

-- Check existing products that need Ko-fi shop items created
SELECT 
  id, 
  name, 
  price / 100.0 as price_dollars,
  customizable,
  kofi_direct_link_code,
  CASE 
    WHEN kofi_direct_link_code IS NULL THEN '❌ Needs Ko-fi shop item'
    ELSE '✅ Has Ko-fi shop item'
  END as status
FROM products 
WHERE active = true
ORDER BY name; 