'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    const handlePasswordReset = async () => {
      try {
        // Check if we have a session from the email link
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth error:', error);
          setError('Invalid or expired reset link');
          setVerifying(false);
          return;
        }

        if (data.session?.user) {
          setEmail(data.session.user.email || '');
          setVerifying(false);
        } else {
          setError('No active session found. Please click the reset link in your email again.');
          setVerifying(false);
        }
      } catch (err) {
        console.error('Session check error:', err);
        setError('Failed to verify reset link');
        setVerifying(false);
      }
    };

    handlePasswordReset();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('🔧 Starting password reset...');

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
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        console.error('❌ Password update error:', updateError);
        throw updateError;
      }

      console.log('✅ Password updated successfully');
      toast.success('Password reset successfully!');
      
      // Redirect to login
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);

    } catch (error: any) {
      console.error('❌ Reset password error:', error);
      setError(error.message || 'Failed to reset password');
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative mb-8">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-2xl">🔐</div>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-cyan-400 mb-4">Verifying Reset Link...</h2>
          <p className="text-gray-400 text-lg">Please wait while we verify your password reset request</p>
        </div>
      </div>
    );
  }

  if (error && !email) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-red-400 mb-4">Reset Link Invalid</h1>
          <p className="text-gray-300 mb-6">{error}</p>
          
          <div className="space-y-3">
            <Link 
              href="/auth/forgot-password" 
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 text-center block"
            >
              Request New Reset Link
            </Link>
            <Link 
              href="/auth/login" 
              className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 text-center block"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔑</div>
          <h1 className="text-3xl font-bold text-cyan-400 mb-2 tracking-wider">Set New Password</h1>
          <p className="text-gray-300">Enter your new password below</p>
        </div>

        {/* Account Info */}
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Email:</span>
              <span className="text-cyan-400 font-mono">{email}</span>
            </div>
          </div>
        </div>

        {/* Reset Form */}
        <form onSubmit={handleResetPassword} className="space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              New Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Enter your new password"
              required
              minLength={6}
            />
            <p className="text-gray-500 text-xs mt-1">Minimum 6 characters</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="Confirm your new password"
              required
              minLength={6}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-4 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-2xl border border-cyan-500 hover:border-cyan-400 text-white font-bold text-lg tracking-wider transition-all duration-300 hover:shadow-cyan-500/25 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? '🔄 Resetting Password...' : '🔑 Reset Password'}
            </button>
          </div>
        </form>

        {/* Navigation */}
        <div className="mt-8 text-center">
          <Link
            href="/auth/login"
            className="text-gray-400 hover:text-gray-300 font-medium transition-colors duration-300"
          >
            ← Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
} 