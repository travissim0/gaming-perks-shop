-- Troubleshoot Ko-Fi Donation for Phlow
-- This script helps find missing Ko-Fi donations and identify email mismatches

-- ===========================================
-- 1. Search for "Phlow" in all relevant fields
-- ===========================================

-- Check if "Phlow" exists as a user alias in profiles
SELECT 'User Profile Search' as search_type, id, email, in_game_alias, created_at
FROM profiles 
WHERE LOWER(in_game_alias) LIKE '%phlow%' 
   OR LOWER(email) LIKE '%phlow%';

-- ===========================================
-- 2. Search Ko-Fi donations for "Phlow"
-- ===========================================

-- Search Ko-Fi donations by name variations
SELECT 'Ko-Fi Donations by Name' as search_type,
       id, payment_method, amount_cents, currency, status,
       customer_email, customer_name, donation_message,
       kofi_from_name, kofi_email, kofi_transaction_id,
       created_at, completed_at
FROM donation_transactions 
WHERE payment_method = 'kofi'
  AND (LOWER(customer_name) LIKE '%phlow%' 
       OR LOWER(kofi_from_name) LIKE '%phlow%'
       OR LOWER(donation_message) LIKE '%phlow%'
       OR LOWER(kofi_email) LIKE '%phlow%'
       OR LOWER(customer_email) LIKE '%phlow%')
ORDER BY created_at DESC;

-- ===========================================
-- 3. Search ALL donations for "Phlow" 
-- ===========================================

-- Search all payment methods for Phlow
SELECT 'All Donations Search' as search_type,
       id, payment_method, amount_cents, currency, status,
       customer_email, customer_name, donation_message,
       kofi_from_name, kofi_email, kofi_transaction_id,
       square_payment_id, created_at
FROM donation_transactions 
WHERE LOWER(customer_name) LIKE '%phlow%' 
   OR LOWER(kofi_from_name) LIKE '%phlow%'
   OR LOWER(donation_message) LIKE '%phlow%'
   OR LOWER(kofi_email) LIKE '%phlow%'
   OR LOWER(customer_email) LIKE '%phlow%'
ORDER BY created_at DESC;

-- ===========================================
-- 4. Check recent Ko-Fi donations (last 30 days)
-- ===========================================

-- Show all recent Ko-Fi donations to see if there are unlinked ones
SELECT 'Recent Ko-Fi Donations' as search_type,
       id, amount_cents, currency, status,
       customer_email, customer_name, donation_message,
       kofi_from_name, kofi_email, kofi_transaction_id,
       user_id, created_at
FROM donation_transactions 
WHERE payment_method = 'kofi'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- ===========================================
-- 5. Check for Ko-Fi donations with missing user links
-- ===========================================

-- Find Ko-Fi donations that couldn't be linked to users
SELECT 'Unlinked Ko-Fi Donations' as search_type,
       id, amount_cents, currency,
       customer_email, customer_name, donation_message,
       kofi_from_name, kofi_email, kofi_transaction_id,
       user_id, created_at
FROM donation_transactions 
WHERE payment_method = 'kofi'
  AND user_id IS NULL
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- ===========================================
-- 6. Check for potential email mismatches
-- ===========================================

-- Find Ko-Fi donations where the Ko-Fi email doesn't match any user
SELECT 'Email Mismatch Check' as search_type,
       d.id, d.amount_cents, d.currency,
       d.kofi_email as kofi_email,
       d.customer_email as donation_email,
       d.kofi_from_name, d.donation_message,
       d.created_at,
       p.email as user_email,
       p.in_game_alias
FROM donation_transactions d
LEFT JOIN profiles p ON p.email = d.kofi_email
WHERE d.payment_method = 'kofi'
  AND d.created_at >= NOW() - INTERVAL '30 days'
  AND p.email IS NULL  -- Ko-Fi email doesn't match any user
ORDER BY d.created_at DESC;

-- ===========================================
-- 7. Show possible matches for manual linking
-- ===========================================

-- Find users with similar names to unlinked Ko-Fi donations
SELECT 'Potential Manual Links' as search_type,
       'Ko-Fi Donation' as record_type,
       d.id as donation_id,
       d.kofi_from_name as kofi_name,
       d.kofi_email,
       d.amount_cents,
       d.created_at,
       NULL as user_id,
       NULL as user_alias,
       NULL as user_email
FROM donation_transactions d
WHERE d.payment_method = 'kofi'
  AND d.user_id IS NULL
  AND d.created_at >= NOW() - INTERVAL '30 days'

UNION ALL

SELECT 'Potential Manual Links' as search_type,
       'User Profile' as record_type,
       NULL as donation_id,
       NULL as kofi_name,
       NULL as kofi_email,
       NULL as amount_cents,
       NULL as created_at,
       p.id as user_id,
       p.in_game_alias as user_alias,
       p.email as user_email
FROM profiles p
WHERE LOWER(p.in_game_alias) LIKE '%phlow%'
   OR LOWER(p.email) LIKE '%phlow%'

ORDER BY record_type, created_at DESC;

-- ===========================================
-- 8. Summary statistics
-- ===========================================

-- Show Ko-Fi donation statistics
SELECT 'Ko-Fi Statistics' as info_type,
       COUNT(*) as total_kofi_donations,
       COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as linked_donations,
       COUNT(CASE WHEN user_id IS NULL THEN 1 END) as unlinked_donations,
       SUM(amount_cents) as total_amount_cents,
       MIN(created_at) as earliest_donation,
       MAX(created_at) as latest_donation
FROM donation_transactions 
WHERE payment_method = 'kofi';

-- ===========================================
-- MANUAL FIX TEMPLATE
-- ===========================================

-- If you find the donation but it's not linked to the right user:
-- 
-- 1. Find the correct user ID:
-- SELECT id FROM profiles WHERE LOWER(in_game_alias) = 'phlow';
-- 
-- 2. Update the donation to link it:
-- UPDATE donation_transactions 
-- SET user_id = 'USER_ID_HERE',
--     customer_name = 'Phlow'
-- WHERE id = 'DONATION_ID_HERE';
--
-- 3. If the Ko-Fi name needs updating:
-- UPDATE donation_transactions 
-- SET kofi_from_name = 'Phlow'
-- WHERE kofi_transaction_id = 'KOFI_TRANSACTION_ID_HERE';

SELECT 'Search Complete' as status, 
       'Check the results above for Phlow donations or potential matches' as next_steps; 