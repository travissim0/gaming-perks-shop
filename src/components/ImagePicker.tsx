'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface ImagePickerProps {
  selectedImage: string;
  onImageSelect: (url: string) => void;
  bucket?: string;
  folder?: string;
  allowUpload?: boolean;
  className?: string;
}

interface StorageImage {
  name: string;
  url: string;
  size?: number;
  lastModified?: string;
}

export default function ImagePicker({
  selectedImage,
  onImageSelect,
  bucket = 'avatars',
  folder = 'news-banners',
  allowUpload = true,
  className = ''
}: ImagePickerProps) {
  const [images, setImages] = useState<StorageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    loadImages();
  }, [bucket, folder]);

  const loadImages = async () => {
    try {
      setLoading(true);
      
      // List files in the storage bucket
      const { data: files, error } = await supabase.storage
        .from(bucket)
        .list(folder, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        console.error('Error loading images:', error);
        if (error.message?.includes('Bucket not found')) {
          toast.error('Image storage bucket not found. Please contact an administrator.');
        } else {
          toast.error(`Failed to load images: ${error.message}`);
        }
        return;
      }

      // Get public URLs for each image
      const imagePromises = files
        .filter(file => {
          const ext = file.name.toLowerCase();
          return ext.endsWith('.jpg') || ext.endsWith('.jpeg') || 
                 ext.endsWith('.png') || ext.endsWith('.gif') || 
                 ext.endsWith('.webp');
        })
        .map(async (file) => {
          const filePath = folder ? `${folder}/${file.name}` : file.name;
          const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

          return {
            name: file.name,
            url: data.publicUrl,
            size: file.metadata?.size,
            lastModified: file.metadata?.lastModified
          };
        });

      const imageList = await Promise.all(imagePromises);
      setImages(imageList);
    } catch (error) {
      console.error('Error in loadImages:', error);
      toast.error('Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPG, PNG, GIF, WEBP)');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image must be smaller than 5MB');
      return;
    }

    try {
      setUploading(true);
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = folder ? `${folder}/${fileName}` : fileName;

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error details:', uploadError);
        if (uploadError.message?.includes('Bucket not found')) {
          toast.error('Image storage bucket not found. Please contact an administrator.');
          return;
        } else if (uploadError.message?.includes('policy')) {
          toast.error('Upload permission denied. Please contact an administrator.');
          return;
        }
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      toast.success('Image uploaded successfully!');
      
      // Add to images list and select it
      const newImage: StorageImage = {
        name: fileName,
        url: data.publicUrl,
        size: file.size
      };
      
      setImages(prev => [newImage, ...prev]);
      onImageSelect(data.publicUrl);
      setShowPicker(false);
      
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getImageName = (url: string) => {
    return url.split('/').pop()?.split('?')[0] || 'Unknown';
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-2">Featured Image</label>
      
      {/* Selected Image Preview */}
      {selectedImage && (
        <div className="mb-4 relative">
          <img
            src={selectedImage}
            alt="Selected"
            className="w-full max-w-md h-32 object-cover rounded-lg border border-gray-600"
          />
          <button
            type="button"
            onClick={() => onImageSelect('')}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
          >
            ×
          </button>
          <p className="text-xs text-gray-400 mt-1">
            {getImageName(selectedImage)}
          </p>
        </div>
      )}

      {/* Image Picker Button */}
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
        >
          {selectedImage ? 'Change Image' : 'Select Image'}
        </button>
        
        {allowUpload && (
          <label className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors cursor-pointer">
            {uploading ? 'Uploading...' : 'Upload New'}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
      </div>

      {/* Manual URL Input (fallback) */}
      <input
        type="url"
        value={selectedImage}
        onChange={(e) => onImageSelect(e.target.value)}
        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-sm"
        placeholder="Or paste image URL directly..."
      />

      {/* Image Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg border border-gray-600 max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-600 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Choose Image</h3>
              <button
                onClick={() => setShowPicker(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-3 text-gray-400">Loading images...</span>
                </div>
              ) : images.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-4">📷</div>
                  <p>No images found in storage.</p>
                  {allowUpload && (
                    <p className="text-sm mt-2">Upload your first image using the "Upload New" button.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {images.map((image) => (
                    <div
                      key={image.url}
                      onClick={() => {
                        onImageSelect(image.url);
                        setShowPicker(false);
                      }}
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-200 hover:scale-105 ${
                        selectedImage === image.url
                          ? 'border-blue-500 ring-2 ring-blue-500/50'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <div className="aspect-video">
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                        <p className="text-white text-xs font-medium truncate">
                          {image.name}
                        </p>
                        {image.size && (
                          <p className="text-gray-300 text-xs">
                            {formatFileSize(image.size)}
                          </p>
                        )}
                      </div>
                      {selectedImage === image.url && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                          ✓
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-600 flex justify-between">
              <button
                onClick={loadImages}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                🔄 Refresh
              </button>
              <button
                onClick={() => setShowPicker(false)}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg text-white text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 