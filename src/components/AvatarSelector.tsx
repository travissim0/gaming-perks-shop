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
  const [retryCount, setRetryCount] = useState(0);

  const sizeClasses = {
    small: 'w-10 h-10 sm:w-12 sm:h-12',
    medium: 'w-14 h-14 sm:w-16 sm:h-16',
    large: 'w-16 h-16 sm:w-20 sm:h-20'
  };

  const gridClasses = {
    small: 'grid-cols-4 sm:grid-cols-6 gap-2',
    medium: 'grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3',
    large: 'grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4'
  };

  const loadAvatars = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading avatars...');
      const avatars = await getSiteAvatars();
      
      if (avatars && avatars.length > 0) {
        setSiteAvatars(avatars);
        console.log(`Loaded ${avatars.length} avatars`);
        
        // Don't auto-select avatar - let user choose
        // This was causing auto-submission of the registration form
      } else {
        throw new Error('No avatars found');
      }
    } catch (err: any) {
      console.error('Error loading site avatars:', err);
      
      if (err.message?.includes('network') || err.message?.includes('fetch')) {
        setError('Network error. Please check your connection.');
      } else {
        setError('Failed to load avatars');
      }
      
      // Auto-retry on mobile timeout errors
      if (err.message?.includes('timeout') && retryCount < 2) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          loadAvatars();
        }, 2000);
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAvatars();
  }, []); // Added empty dependency array to prevent infinite re-renders

  const handleAvatarSelect = (avatarUrl: string) => {
    onAvatarSelect(avatarUrl);
    
    // Provide haptic feedback on mobile if available
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    loadAvatars();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {showLabel && (
          <label className="block text-base sm:text-lg font-bold text-cyan-400 mb-2 sm:mb-3 tracking-wide">
            🖼️ Choose Avatar
          </label>
        )}
        <div className="bg-gray-700 rounded-lg p-3 sm:p-4">
          <div className="animate-pulse">
            <div className={`grid ${gridClasses[size]} mb-4`}>
              {[...Array(12)].map((_, i) => (
                <div key={i} className={`${sizeClasses[size]} bg-gray-600 rounded-lg`}></div>
              ))}
            </div>
          </div>
          <p className="text-gray-400 text-center text-sm">Loading avatars...</p>
        </div>
      </div>
    );
  }

  if (error || siteAvatars.length === 0) {
    return (
      <div className="space-y-3">
        {showLabel && (
          <label className="block text-base sm:text-lg font-bold text-cyan-400 mb-2 sm:mb-3 tracking-wide">
            🖼️ Choose Avatar
          </label>
        )}
        <div className="bg-gray-700 rounded-lg p-3 sm:p-4 text-center">
          <div className="mb-3">
            <span className="text-red-400 text-2xl">⚠️</span>
          </div>
          <p className="text-gray-400 text-sm mb-3">
            {error || 'No avatars available'}
          </p>
          {error && (
            <button
              onClick={handleRetry}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors duration-200"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showLabel && (
        <label className="block text-base sm:text-lg font-bold text-cyan-400 mb-2 sm:mb-3 tracking-wide">
          🖼️ Choose Avatar
        </label>
      )}
      
      {/* Selected Avatar Preview */}
      {selectedAvatar ? (
        <div className="bg-gray-700 rounded-lg p-3 sm:p-4 text-center">
          <p className="text-sm text-gray-400 mb-2">Selected Avatar:</p>
          <img 
            src={selectedAvatar} 
            alt="Selected avatar" 
            className={`${sizeClasses[size]} mx-auto rounded-lg border-2 border-cyan-400 object-cover`}
            loading="lazy"
          />
        </div>
      ) : (
        <div className="bg-gray-700/50 rounded-lg p-3 sm:p-4 text-center border border-gray-600 border-dashed">
          <p className="text-sm text-gray-400 mb-2">No avatar selected</p>
          <div className="text-gray-500 text-xs">
            Choose an avatar below or a default will be assigned
          </div>
        </div>
      )}

      {/* Avatar Grid */}
      <div className="bg-gray-700 rounded-lg p-3 sm:p-4">
        <div className={`grid ${gridClasses[size]} max-h-48 sm:max-h-64 overflow-y-auto`}>
          {siteAvatars.map((avatarUrl, index) => {
            const isSelected = selectedAvatar === avatarUrl;
            return (
              <button
                key={index}
                onClick={() => handleAvatarSelect(avatarUrl)}
                className={`${sizeClasses[size]} rounded-lg border-2 transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95 ${
                  isSelected 
                    ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-105' 
                    : 'border-gray-600 hover:border-gray-400'
                }`}
                aria-label={`Select avatar ${index + 1}`}
                type="button"
              >
                <img 
                  src={avatarUrl} 
                  alt={`Avatar option ${index + 1}`}
                  className="w-full h-full object-cover rounded-md"
                  loading="lazy"
                  onError={(e) => {
                    console.warn(`Failed to load avatar ${index + 1}:`, avatarUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3 text-center">
          {siteAvatars.length > 12 ? 'Scroll to see more avatars' : 'Tap an avatar to select it'}
        </p>
      </div>
    </div>
  );
} 