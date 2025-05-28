-- Delete acrimoneyius@gmail.com users
-- Run this in the Supabase SQL Editor

-- First, let's see what we're about to delete
SELECT 
    au.id,
    au.email,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    p.in_game_alias,
    p.registration_status
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE au.email = 'acrimoneyius@gmail.com';

-- Delete from profiles table first (to avoid foreign key constraints)
DELETE FROM public.profiles 
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email = 'acrimoneyius@gmail.com'
);

-- Delete from auth.users table
DELETE FROM auth.users 
WHERE email = 'acrimoneyius@gmail.com';

-- Verify deletion - this should return no rows
SELECT 
    au.id,
    au.email,
    au.created_at,
    p.in_game_alias
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE au.email = 'acrimoneyius@gmail.com'; 