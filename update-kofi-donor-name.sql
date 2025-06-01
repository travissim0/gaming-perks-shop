-- Update Ko-fi donor name from "Somebody" to specific alias
-- Run this in Supabase SQL Editor to bypass RLS restrictions

-- First, let's see the current record
SELECT kofi_transaction_id, kofi_from_name, kofi_message, kofi_email 
FROM kofi_donations 
WHERE kofi_from_name = 'Somebody';

-- Update the specific record (replace 'NEW_ALIAS_HERE' with the actual alias)
UPDATE kofi_donations 
SET kofi_from_name = 'NEW_ALIAS_HERE'
WHERE kofi_from_name = 'Somebody' 
  AND kofi_transaction_id = 'f78-4107-4b73-af85-91b86e20120d';

-- Verify the change
SELECT kofi_transaction_id, kofi_from_name, kofi_message, kofi_email 
FROM kofi_donations 
WHERE kofi_transaction_id = 'f78-4107-4b73-af85-91b86e20120d';

-- Alternative: If you need to update by email instead of kofi_transaction_id
-- UPDATE kofi_donations 
-- SET kofi_from_name = 'NEW_ALIAS_HERE'
-- WHERE kofi_from_name = 'Somebody' 
--   AND kofi_email = 'bgodin@gmail.com'; 