-- Troubleshoot Mecca's Ko-Fi Donation Issue
-- Email: hoagiescars@gmail.com, Ko-Fi Transaction: T-A0A31FYR0I
-- Date: 06/04/2025 03:34, Amount: $5.00

-- ===========================================
-- 1. Find Mecca's user profile
-- ===========================================

SELECT 'Mecca User Profile' as check_type, 
       id, email, in_game_alias, 
       email_confirmed_at,
       created_at, updated_at
FROM profiles 
WHERE email = 'hoagiescars@gmail.com' 
   OR LOWER(in_game_alias) LIKE '%mecca%';

-- ===========================================
-- 2. Find Mecca's Ko-Fi donation
-- ===========================================

SELECT 'Ko-Fi Donation Record' as check_type,
       id, payment_method, amount_cents, currency, status,
       customer_email, customer_name, donation_message,
       kofi_from_name, kofi_email, kofi_transaction_id,
       user_id, created_at, updated_at
FROM donation_transactions 
WHERE kofi_transaction_id = 'T-A0A31FYR0I'
   OR customer_email = 'hoagiescars@gmail.com'
   OR kofi_email = 'hoagiescars@gmail.com'
   OR LOWER(customer_name) LIKE '%mecca%'
   OR LOWER(kofi_from_name) LIKE '%mecca%'
ORDER BY created_at DESC;

-- ===========================================
-- 3. Check if Mecca has any granted perks
-- ===========================================

SELECT 'Mecca Current Perks' as check_type,
       up.id, up.user_id, up.product_id, up.status, up.phrase,
       p.name as product_name, p.price_cents, p.category,
       up.created_at, up.updated_at
FROM user_products up
JOIN products p ON up.product_id = p.id
WHERE up.user_id = (SELECT id FROM profiles WHERE email = 'hoagiescars@gmail.com')
ORDER BY up.created_at DESC;

-- ===========================================
-- 4. Check the Text Kill Macro product
-- ===========================================

SELECT 'Text Kill Macro Product' as check_type,
       id, name, description, price_cents, category, active,
       created_at, updated_at
FROM products 
WHERE LOWER(name) LIKE '%text%kill%macro%'
   OR LOWER(name) LIKE '%kill%macro%'
   OR id = 'c25d69b0-d179-427b-b771-1e99cf26f6d6';

-- ===========================================
-- 5. Check recent Ko-Fi donations around the same time
-- ===========================================

SELECT 'Recent Ko-Fi Donations' as check_type,
       id, customer_email, customer_name, kofi_from_name,
       amount_cents, status, user_id, created_at
FROM donation_transactions 
WHERE payment_method = 'kofi' 
  AND created_at >= '2025-01-06 00:00:00'
  AND created_at <= '2025-01-07 00:00:00'
ORDER BY created_at DESC;

-- ===========================================
-- 6. Check email confirmation status impact
-- ===========================================

SELECT 'Email Confirmation Analysis' as check_type,
       COUNT(*) as total_users,
       COUNT(email_confirmed_at) as confirmed_users,
       COUNT(*) - COUNT(email_confirmed_at) as unconfirmed_users,
       ROUND(
         (COUNT(email_confirmed_at) * 100.0 / COUNT(*)), 2
       ) as confirmation_percentage
FROM profiles;

-- ===========================================
-- 7. Summary and recommendations
-- ===========================================

SELECT 'TROUBLESHOOTING SUMMARY' as summary_type,
       'Check the results above to identify the issue:' as instructions,
       '1. Verify Mecca profile exists and email confirmation status' as step_1,
       '2. Confirm Ko-Fi donation exists and is linked to correct user' as step_2,
       '3. Check if Text Kill Macro perk was already granted' as step_3,
       '4. If perk missing, run the fix script below' as step_4; 