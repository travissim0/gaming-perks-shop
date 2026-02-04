'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import AvatarSelector from '@/components/AvatarSelector';
import { getDefaultAvatarUrl } from '@/utils/supabaseHelpers';

function CompleteProfileContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [alias, setAlias] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      setEmail(user.email || '');
      setUserId(user.id);
      setCheckingSession(false);
    };

    checkSession();
  }, [router]);

  const validateAlias = (value: string): string | null => {
    if (!value || value.trim().length === 0) {
      return 'Username/Main Alias is required';
    }
    if (value.trim().length < 2) {
      return 'Must be at least 2 characters';
    }
    if (value.trim().length > 30) {
      return 'Must be less than 30 characters';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) {
      return 'Only letters, numbers, underscores, and hyphens allowed';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !userId) return;

    setError('');

    const aliasError = validateAlias(alias);
    if (aliasError) {
      setError(aliasError);
      return;
    }

    setLoading(true);

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email,
          in_game_alias: alias.trim(),
          avatar_url: selectedAvatar || getDefaultAvatarUrl(),
          updated_at: new Date().toISOString(),
        });

      if (profileError) {
        if (profileError.message?.includes('unique') || profileError.message?.includes('duplicate')) {
          setError('This alias is already taken. Please choose a different one.');
        } else {
          throw profileError;
        }
        return;
      }

      toast.success('Profile complete! Welcome to Free Infantry.');
      router.push('/');
    } catch (err: any) {
      console.error('Profile completion error:', err);
      setError(err.message || 'Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center py-12 px-4">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-cyan-400 text-3xl font-bold tracking-wider mb-4">
            FREE INFANTRY
          </div>
          <h1 className="text-2xl font-bold text-cyan-400 mb-2 tracking-wider">
            Complete Your Profile
          </h1>
          <p className="text-gray-300">
            Choose your in-game alias to get started
          </p>
          {email && (
            <p className="text-gray-500 text-sm mt-2 font-mono">{email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="alias" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
              Username/Main Alias
            </label>
            <input
              id="alias"
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="appearance-none block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
              placeholder="Choose your username/main alias..."
              maxLength={30}
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1 font-mono">
              2-30 characters, letters, numbers, underscores, hyphens
            </p>
          </div>

          {/* Avatar Selection */}
          <div>
            <AvatarSelector
              selectedAvatar={selectedAvatar}
              onAvatarSelect={setSelectedAvatar}
              size="small"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full flex justify-center py-4 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-2xl border border-cyan-500 hover:border-cyan-400 text-white font-bold text-lg tracking-wider transition-all duration-300 hover:shadow-cyan-500/25 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                Saving...
              </div>
            ) : (
              'Complete Setup'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">
            Wrong account?{' '}
            <Link href="/auth/login" className="text-cyan-400 hover:text-cyan-300 font-medium">
              Sign in with a different account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CompleteProfile() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
      </div>
    }>
      <CompleteProfileContent />
    </Suspense>
  );
}
