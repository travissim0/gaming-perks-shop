-- =============================================================================
-- SUPABASE DONATIONS DATABASE VALIDATION QUERIES
-- Copy and paste these queries one by one into Supabase SQL Editor
-- =============================================================================

-- Query 1: Check if donation_transactions table exists and its structure
-- =============================================================================
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'donation_transactions' 
ORDER BY ordinal_position;

-- Query 2: Count total donations in the table
-- =============================================================================
SELECT 
    COUNT(*) as total_donations,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_donations,
    COUNT(CASE WHEN payment_method = 'square' THEN 1 END) as square_donations,
    COUNT(CASE WHEN payment_method = 'kofi' THEN 1 END) as kofi_donations
FROM donation_transactions;

-- Query 3: Check for your specific $1 donation
-- =============================================================================
SELECT 
    id,
    amount_cents,
    currency,
    status,
    payment_method,
    customer_email,
    customer_name,
    donation_message,
    square_payment_id,
    square_order_id,
    created_at,
    completed_at
FROM donation_transactions 
WHERE square_payment_id = '3f41BwwODSrn6MMirlorJ5YG1jDZY'
   OR amount_cents = 100;

-- Query 4: Get the most recent 10 donations
-- =============================================================================
SELECT 
    id,
    amount_cents / 100.0 as amount_dollars,
    currency,
    status,
    payment_method,
    customer_email,
    customer_name,
    donation_message,
    square_payment_id,
    created_at
FROM donation_transactions 
ORDER BY created_at DESC 
LIMIT 10;

-- Query 5: Check for donations from the last 24 hours
-- =============================================================================
SELECT 
    id,
    amount_cents / 100.0 as amount_dollars,
    currency,
    status,
    payment_method,
    customer_email,
    square_payment_id,
    created_at
FROM donation_transactions 
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Query 6: Check RLS (Row Level Security) policies on the table
-- =============================================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'donation_transactions';

-- Query 7: Test inserting a test donation (you can modify the values)
-- =============================================================================
-- UNCOMMENT AND MODIFY THIS QUERY IF YOU WANT TO TEST INSERTION:
/*
INSERT INTO donation_transactions (
    payment_method,
    amount_cents,
    currency,
    status,
    customer_email,
    customer_name,
    donation_message,
    square_payment_id,
    created_at,
    completed_at
) VALUES (
    'square',
    100, -- $1.00
    'usd',
    'completed',
    'test@example.com',
    'Test Donor',
    'SQL Test Donation',
    'test_payment_' || extract(epoch from now())::text,
    NOW(),
    NOW()
) RETURNING *;
*/

-- Query 8: Check if there are any alternative donation tables
-- =============================================================================
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%donation%' 
   OR table_name LIKE '%payment%' 
   OR table_name LIKE '%transaction%';

-- =============================================================================
-- TROUBLESHOOTING NOTES:
-- =============================================================================
-- If Query 1 returns no rows: The table doesn't exist
-- If Query 2 shows 0 donations: The table is empty
-- If Query 3 returns no rows: Your $1 donation isn't in the database
-- If Query 6 shows restrictive policies: RLS might be blocking access
-- ============================================================================= 