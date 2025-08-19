-- Add ctf_analyst role to the enum
-- This must be run first, in a separate transaction
ALTER TYPE ctf_role_type ADD VALUE IF NOT EXISTS 'ctf_analyst';
