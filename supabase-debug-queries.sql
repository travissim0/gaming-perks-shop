-- =============================================
-- Supabase Database Debug Queries
-- Run these in your Supabase SQL Editor
-- =============================================

-- 1. Check donation_transactions table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'donation_transactions' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Count total donations
SELECT 
  COUNT(*) as total_donations,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_donations,
  COUNT(CASE WHEN payment_method = 'kofi' THEN 1 END) as kofi_donations,
  SUM(amount_cents) / 100.0 as total_amount_usd
FROM donation_transactions;

-- 3. Recent donations (what your API should return)
SELECT 
  id,
  amount_cents / 100.0 as amount_usd,
  currency,
  customer_name,
  kofi_from_name,
  donation_message,
  payment_method,
  status,
  created_at
FROM donation_transactions 
WHERE status = 'completed'
ORDER BY created_at DESC 
LIMIT 10;

-- 4. Check for $121+ donations (your missing donation)
SELECT 
  id,
  amount_cents / 100.0 as amount_usd,
  customer_name,
  kofi_from_name,
  kofi_transaction_id,
  donation_message,
  created_at,
  status
FROM donation_transactions 
WHERE amount_cents >= 12100
ORDER BY created_at DESC;

-- 5. Ko-Fi specific donations
SELECT 
  id,
  amount_cents / 100.0 as amount_usd,
  kofi_from_name,
  kofi_transaction_id,
  kofi_email,
  created_at,
  status
FROM donation_transactions 
WHERE payment_method = 'kofi'
  AND kofi_transaction_id IS NOT NULL
ORDER BY created_at DESC 
LIMIT 20;

-- 6. Check for any duplicate Ko-Fi transactions
SELECT 
  kofi_transaction_id,
  COUNT(*) as count,
  STRING_AGG(id::text, ', ') as record_ids
FROM donation_transactions 
WHERE kofi_transaction_id IS NOT NULL
GROUP BY kofi_transaction_id
HAVING COUNT(*) > 1;

-- 7. Check RLS policies on donation_transactions
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

-- 8. Check table permissions
SELECT 
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges 
WHERE table_name = 'donation_transactions'
  AND table_schema = 'public';

-- 9. Recent donations by payment method
SELECT 
  payment_method,
  COUNT(*) as count,
  SUM(amount_cents) / 100.0 as total_amount,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM donation_transactions 
WHERE status = 'completed'
GROUP BY payment_method
ORDER BY count DESC;

-- 10. Search for potential $121 donation variations
SELECT 
  id,
  amount_cents / 100.0 as amount_usd,
  customer_name,
  kofi_from_name,
  customer_email,
  kofi_email,
  donation_message,
  kofi_message,
  created_at
FROM donation_transactions 
WHERE (amount_cents BETWEEN 12000 AND 12200)  -- $120-$122 range
   OR (customer_name ILIKE '%zmn%')
   OR (kofi_from_name ILIKE '%zmn%')
   OR (donation_message ILIKE '%ez dila%')
ORDER BY created_at DESC;

-- =============================================
-- Maintenance Queries (if needed)
-- =============================================

-- Fix any null statuses (set to completed)
-- UPDATE donation_transactions 
-- SET status = 'completed' 
-- WHERE status IS NULL AND amount_cents > 0;

-- Check for orphaned records
-- SELECT COUNT(*) FROM donation_transactions WHERE user_id IS NOT NULL 
-- AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = donation_transactions.user_id);

-- Performance check - slow queries
-- SELECT COUNT(*) FROM donation_transactions WHERE created_at > NOW() - INTERVAL '7 days'; 