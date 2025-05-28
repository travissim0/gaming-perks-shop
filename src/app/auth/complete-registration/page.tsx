'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

function CompleteRegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const aliasParam = searchParams.get('alias');
    if (aliasParam) {
      setAlias(decodeURIComponent(aliasParam));
    }

    // Handle the auth callback
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          setError('Invalid or expired verification link');
          setVerifying(false);
          return;
        }

        if (data.session?.user) {
          setEmail(data.session.user.email || '');
          setVerifying(false);
          
          // Check if user already has a password set
          if (data.session.user.user_metadata?.password_set) {
            toast.success('Account already completed!');
            router.push('/dashboard');
            return;
          }
        } else {
          setError('No active session found. Please click the verification link in your email again.');
          setVerifying(false);
        }
      } catch (err) {
        console.error('Session check error:', err);
        setError('Failed to verify session');
        setVerifying(false);
      }
    };

    handleAuthCallback();
  }, [searchParams, router]);

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('🔧 Starting registration completion...');

      // Validate passwords
      if (password.length < 6) {
        setError('Password must be at least 6 characters long');
        setLoading(false);
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }

      console.log('✅ Password validation passed');

      // Update user password
      console.log('🔑 Updating user password...');
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: {
          password_set: true,
          registration_completed: true,
          registration_completed_at: new Date().toISOString()
        }
      });

      if (updateError) {
        console.error('❌ Password update error:', updateError);
        throw updateError;
      }

      console.log('✅ Password updated successfully');

      // Update profile status
      console.log('📝 Updating profile status...');
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            registration_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', session.session.user.id);

        if (profileError) {
          console.error('❌ Profile update error:', profileError);
          // Don't fail the registration for this, but show a warning
          console.warn('Profile update failed but continuing with registration');
        } else {
          console.log('✅ Profile updated successfully');
        }
      } else {
        console.warn('⚠️ No session found for profile update');
      }

      console.log('🎉 Registration completion successful, redirecting...');
      toast.success('Registration completed successfully!');
      
      // Add a small delay before redirect to ensure everything is saved
      setTimeout(() => {
        setLoading(false);
        router.push('/dashboard');
      }, 1000);

    } catch (error: any) {
      console.error('❌ Registration completion error:', error);
      setError(error.message || 'Failed to complete registration');
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-cyan-400 mb-2">Verifying Account</h1>
          <p className="text-gray-300">Please wait while we verify your email...</p>
        </div>
      </div>
    );
  }

  if (error && !email) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-400 mb-4">Verification Failed</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          <Link 
            href="/auth/login" 
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎮</div>
          <h1 className="text-3xl font-bold text-cyan-400 mb-2 tracking-wider">Complete Registration</h1>
          <p className="text-gray-300">Set your password to finish account setup</p>
        </div>

        {/* Account Info */}
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">In-Game Alias:</span>
              <span className="text-cyan-400 font-mono font-bold">{alias}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Email:</span>
              <span className="text-gray-300 font-mono">{email}</span>
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleCompleteRegistration} className="space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Enter your password"
              required
              minLength={6}
            />
            <p className="text-gray-500 text-xs mt-1">Minimum 6 characters</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Confirm your password"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg hover:shadow-cyan-500/25 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                Completing Registration...
              </div>
            ) : (
              'Complete Registration'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-cyan-400 hover:text-cyan-300 font-medium">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CompleteRegistration() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompleteRegistrationContent />
    </Suspense>
  );
} 