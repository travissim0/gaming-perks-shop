'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loading) return;
    
    setLoading(true);

    // Validate email
    if (!email) {
      toast.error('Please enter your email address');
      setLoading(false);
      return;
    }

    if (!email.includes('@')) {
      toast.error('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 Sending password reset email to:', email);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        console.error('❌ Reset password error:', error);
        toast.error(error.message);
      } else {
        console.log('✅ Password reset email sent');
        toast.success('Password reset email sent! Check your inbox.');
        setEmailSent(true);
      }
    } catch (error: any) {
      console.error('Reset password exception:', error);
      toast.error(error.message || 'An error occurred while sending reset email');
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full mx-4">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📧</div>
            <h1 className="text-3xl font-bold text-cyan-400 mb-2 tracking-wider">Email Sent!</h1>
            <p className="text-gray-300">Check your inbox for password reset instructions</p>
          </div>

          {/* Email Confirmation */}
          <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Email sent to:</span>
                <span className="text-cyan-400 font-mono">{email}</span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
            <h3 className="text-blue-400 font-bold mb-2">📋 Next Steps:</h3>
            <ul className="text-gray-300 text-sm space-y-1">
              <li>• Check your email inbox</li>
              <li>• Look for the password reset email</li>
              <li>• Click the reset link in the email</li>
              <li>• Set your new password</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/auth/login"
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 text-center block"
            >
              ← Back to Login
            </Link>
            
            <button
              onClick={() => setEmailSent(false)}
              className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Send Another Email
            </button>
          </div>

          <p className="text-gray-500 text-xs mt-4 text-center">
            Didn't receive the email? Check your spam folder or try again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-3xl font-bold text-cyan-400 mb-2 tracking-wider">Reset Password</h1>
          <p className="text-gray-300">Enter your email to receive reset instructions</p>
        </div>

        {/* Reset Form */}
        <form onSubmit={handleForgotPassword} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
              📧 Email Address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                placeholder="Enter your email address..."
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-4 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-2xl border border-cyan-500 hover:border-cyan-400 text-white font-bold text-lg tracking-wider transition-all duration-300 hover:shadow-cyan-500/25 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? '📤 Sending Email...' : '📤 Send Reset Email'}
            </button>
          </div>
        </form>

        {/* Navigation */}
        <div className="mt-8 text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-800 text-gray-400">or</span>
            </div>
          </div>

          <div className="space-y-2">
            <Link
              href="/auth/login"
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors duration-300 block"
            >
              ← Back to Login
            </Link>
            <Link
              href="/auth/register"
              className="text-gray-400 hover:text-gray-300 font-medium transition-colors duration-300 block"
            >
              Don't have an account? Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 