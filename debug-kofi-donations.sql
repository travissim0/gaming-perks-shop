-- Debug Ko-fi Donations
-- Run this to check if Ko-fi integration is properly set up

-- 1. Check if payment_method column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'donation_transactions' AND column_name = 'payment_method';

-- 2. Check if Ko-fi specific columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'donation_transactions' 
AND column_name IN ('kofi_transaction_id', 'kofi_message', 'kofi_from_name', 'kofi_email', 'kofi_url');

-- 3. Check existing donations and their payment methods
SELECT 
    payment_method,
    COUNT(*) as count,
    SUM(amount_cents) as total_cents
FROM donation_transactions 
GROUP BY payment_method
ORDER BY count DESC;

-- 4. Check if there are any Ko-fi donations
SELECT 
    id,
    payment_method,
    amount_cents,
    kofi_transaction_id,
    kofi_from_name,
    created_at
FROM donation_transactions 
WHERE payment_method = 'kofi'
ORDER BY created_at DESC 
LIMIT 5;

-- 5. Check RLS policies on donation_transactions
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'donation_transactions' 
AND policyname LIKE '%kofi%';

-- 6. Test if we can manually insert a Ko-fi donation (for debugging)
-- IMPORTANT: This is just for testing - replace with real test data
/*
INSERT INTO donation_transactions (
    payment_method,
    amount_cents,
    currency,
    status,
    customer_email,
    customer_name,
    donation_message,
    kofi_transaction_id,
    kofi_from_name,
    created_at,
    completed_at
) VALUES (
    'kofi',
    500, -- $5.00
    'usd',
    'completed',
    'test@example.com',
    'Test User',
    'Test Ko-fi donation',
    'test-' || extract(epoch from now()),
    'Test User',
    now(),
    now()
);
*/

-- Display results
SELECT 'Database schema check complete. Review the results above.' as status; 