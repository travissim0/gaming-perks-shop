'use client';

import { useState, useEffect } from 'react';
import { getSiteAvatars, getDefaultAvatarUrl } from '@/utils/supabaseHelpers';

interface AvatarSelectorProps {
  selectedAvatar: string | null;
  onAvatarSelect: (avatarUrl: string) => void;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function AvatarSelector({ 
  selectedAvatar, 
  onAvatarSelect, 
  showLabel = true,
  size = 'medium'
}: AvatarSelectorProps) {
  const [siteAvatars, setSiteAvatars] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-20 h-20'
  };

  const gridClasses = {
    small: 'grid-cols-6 gap-2',
    medium: 'grid-cols-5 gap-3',
    large: 'grid-cols-4 gap-4'
  };

  useEffect(() => {
    const loadAvatars = async () => {
      try {
        setLoading(true);
        const avatars = await getSiteAvatars();
        setSiteAvatars(avatars);
        
        // If no avatar is selected, set default
        if (!selectedAvatar && avatars.length > 0) {
          const defaultAvatar = getDefaultAvatarUrl();
          onAvatarSelect(defaultAvatar);
        }
      } catch (err) {
        console.error('Error loading site avatars:', err);
        setError('Failed to load avatars');
      } finally {
        setLoading(false);
      }
    };

    loadAvatars();
  }, [selectedAvatar, onAvatarSelect]);

  if (loading) {
    return (
      <div className="space-y-3">
        {showLabel && (
          <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
            🖼️ Choose Avatar
          </label>
        )}
        <div className="bg-gray-700 rounded-lg p-4">
          <div className="animate-pulse">
            <div className={`grid ${gridClasses[size]} mb-4`}>
              {[...Array(10)].map((_, i) => (
                <div key={i} className={`${sizeClasses[size]} bg-gray-600 rounded-lg`}></div>
              ))}
            </div>
          </div>
          <p className="text-gray-400 text-center">Loading avatars...</p>
        </div>
      </div>
    );
  }

  if (error || siteAvatars.length === 0) {
    return (
      <div className="space-y-3">
        {showLabel && (
          <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
            🖼️ Choose Avatar
          </label>
        )}
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <p className="text-gray-400">
            {error || 'No avatars available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showLabel && (
        <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
          🖼️ Choose Avatar
        </label>
      )}
      
      {/* Selected Avatar Preview */}
      {selectedAvatar && (
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-400 mb-2">Selected Avatar:</p>
          <img 
            src={selectedAvatar} 
            alt="Selected avatar" 
            className={`${sizeClasses[size]} mx-auto rounded-lg border-2 border-cyan-400 object-cover`}
          />
        </div>
      )}

      {/* Avatar Grid */}
      <div className="bg-gray-700 rounded-lg p-4">
        <div className={`grid ${gridClasses[size]} max-h-64 overflow-y-auto`}>
          {siteAvatars.map((avatarUrl, index) => {
            const isSelected = selectedAvatar === avatarUrl;
            return (
              <button
                key={index}
                onClick={() => onAvatarSelect(avatarUrl)}
                className={`${sizeClasses[size]} rounded-lg border-2 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  isSelected 
                    ? 'border-cyan-400 ring-2 ring-cyan-400/50' 
                    : 'border-gray-600 hover:border-gray-400'
                }`}
              >
                <img 
                  src={avatarUrl} 
                  alt={`Avatar option ${index + 1}`}
                  className="w-full h-full object-cover rounded-md"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          Click an avatar to select it
        </p>
      </div>
    </div>
  );
} 