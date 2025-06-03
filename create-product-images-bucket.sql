-- Create storage bucket for product images
-- Run this in your Supabase SQL Editor

-- Create the product-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
);

-- Create storage policies

-- Policy: Allow admins to upload product images
CREATE POLICY "Admins can upload product images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'product-images' AND
  auth.uid() IN (
    SELECT id FROM profiles WHERE is_admin = true
  )
);

-- Policy: Allow admins to update product images
CREATE POLICY "Admins can update product images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'product-images' AND
  auth.uid() IN (
    SELECT id FROM profiles WHERE is_admin = true
  )
);

-- Policy: Allow admins to delete product images
CREATE POLICY "Admins can delete product images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'product-images' AND
  auth.uid() IN (
    SELECT id FROM profiles WHERE is_admin = true
  )
);

-- Policy: Allow public read access to product images
CREATE POLICY "Public can view product images" ON storage.objects
FOR SELECT USING (bucket_id = 'product-images'); 