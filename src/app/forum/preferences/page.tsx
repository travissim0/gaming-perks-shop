'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useForum } from '@/hooks/useForum';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import type { ForumUserPreferences } from '@/types/forum';

export default function ForumPreferencesPage() {
  const { user } = useAuth();
  const { getUserPreferences, updateUserPreferences, loading, error } = useForum();
  
  const [preferences, setPreferences] = useState<ForumUserPreferences | null>(null);
  const [formData, setFormData] = useState({
    email_notifications: true,
    signature: '',
    posts_per_page: 20
  });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (user) {
      loadPreferences();
    }
  }, [user]);

  const loadPreferences = async () => {
    const userPrefs = await getUserPreferences();
    if (userPrefs) {
      setPreferences(userPrefs);
      setFormData({
        email_notifications: userPrefs.email_notifications,
        signature: userPrefs.signature || '',
        posts_per_page: userPrefs.posts_per_page
      });
    } else {
      // Set defaults if no preferences exist
      setFormData({
        email_notifications: true,
        signature: '',
        posts_per_page: 20
      });
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const success = await updateUserPreferences(formData);
      if (success) {
        toast.success('Preferences saved successfully');
        setHasChanges(false);
        await loadPreferences(); // Refresh data
      } else {
        toast.error('Failed to save preferences');
      }
    } catch (err) {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setFormData({
      email_notifications: true,
      signature: '',
      posts_per_page: 20
    });
    setHasChanges(true);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-8 shadow-2xl text-center">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">🔐 Login Required</h3>
            <p className="text-gray-300 mb-6">You need to be logged in to access forum preferences.</p>
            <Link 
              href="/auth/login?redirect=/forum/preferences"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 inline-block"
            >
              🚀 Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-cyan-500/30 shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg border border-blue-500/50">
              ⚙️
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-cyan-400 tracking-wider text-shadow-glow">
                Forum Preferences
              </h1>
              <p className="text-gray-400 text-sm mt-1">Customize your forum experience</p>
            </div>
          </div>
          
          <nav className="text-sm text-gray-400">
            <Link href="/forum" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              🏠 Forum
            </Link>
            <span className="mx-2">→</span>
            <span>Preferences</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-gradient-to-r from-red-900/20 to-red-800/20 border border-red-500/30 text-red-400 px-6 py-4 rounded-lg mb-6 font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Notifications Section */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-cyan-400 mb-4 tracking-wider">📧 Notifications</h2>
            
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.email_notifications}
                  onChange={(e) => handleInputChange('email_notifications', e.target.checked)}
                  className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-2"
                />
                <div>
                  <div className="text-gray-300 font-medium">Email Notifications</div>
                  <div className="text-gray-500 text-sm">Receive emails when someone replies to your subscribed threads</div>
                </div>
              </label>
            </div>
          </div>

          {/* Display Section */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-green-500/30 rounded-lg p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-green-400 mb-4 tracking-wider">🎮 Display Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 font-medium mb-2">Posts Per Page</label>
                <select
                  value={formData.posts_per_page}
                  onChange={(e) => handleInputChange('posts_per_page', parseInt(e.target.value))}
                  className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-green-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-400 transition-all duration-300"
                >
                  <option value={10}>10 posts per page</option>
                  <option value={20}>20 posts per page</option>
                  <option value={30}>30 posts per page</option>
                  <option value={50}>50 posts per page</option>
                </select>
                <p className="text-gray-500 text-sm mt-1">How many posts to show on each page of a thread</p>
              </div>
            </div>
          </div>

          {/* Signature Section */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-purple-400 mb-4 tracking-wider">✍️ Signature</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 font-medium mb-2">Your Signature</label>
                <textarea
                  value={formData.signature}
                  onChange={(e) => handleInputChange('signature', e.target.value)}
                  placeholder="Enter your forum signature (appears below your posts)..."
                  rows={4}
                  maxLength={200}
                  className="w-full bg-gradient-to-b from-gray-700 to-gray-800 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 transition-all duration-300 resize-vertical"
                />
                <div className="flex justify-between text-sm mt-1">
                  <p className="text-gray-500">Text that appears below your posts</p>
                  <p className="text-gray-500">{formData.signature.length}/200</p>
                </div>
                
                {formData.signature && (
                  <div className="mt-3 p-3 bg-gray-700/30 border border-purple-500/20 rounded-lg">
                    <p className="text-gray-400 text-xs mb-1">Preview:</p>
                    <div className="text-gray-300 text-sm italic border-t border-gray-600 pt-2">
                      {formData.signature}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={resetToDefaults}
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 shadow-lg transform hover:scale-105"
            >
              🔄 Reset to Defaults
            </button>
            
            <div className="flex items-center space-x-4">
              {hasChanges && (
                <span className="text-yellow-400 text-sm">You have unsaved changes</span>
              )}
              <button
                type="submit"
                disabled={!hasChanges || saving || loading}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-50"
              >
                {saving ? '🔄 Saving...' : '💾 Save Preferences'}
              </button>
            </div>
          </div>
        </form>

        {/* Help Section */}
        <div className="mt-8 bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-6 shadow-xl">
          <h3 className="text-lg font-bold text-yellow-400 mb-4 tracking-wider">
            💡 Help & Tips
          </h3>
          <div className="space-y-2 text-gray-300 text-sm">
            <div>• <strong>Email Notifications:</strong> You'll receive emails for threads you're subscribed to</div>
            <div>• <strong>Posts Per Page:</strong> Higher numbers load more content but may be slower</div>
            <div>• <strong>Signature:</strong> Keep it short and relevant - it appears on every post</div>
            <div>• <strong>Privacy:</strong> Your preferences are private and only visible to you</div>
          </div>
        </div>
      </div>
    </div>
  );
} 