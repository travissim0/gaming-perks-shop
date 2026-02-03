'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double-clicking/multiple submissions
    if (loading) {
      return;
    }
    
    setLoading(true);

    // Add validation
    if (!email || !password) {
      toast.error('Please enter both email and password');
      setLoading(false);
      return;
    }

    if (!email.includes('@')) {
      toast.error('Please enter a valid email address');
      setLoading(false);
      return;
    }

    console.log('Attempting login with:', { email: email, passwordLength: password.length });

    try {
      const { error } = await signIn(email.trim(), password);
      
      if (error) {
        console.error('Login error:', error);
        
        // Check if this is a mobile timeout error and offer retry
        if (error.message?.includes('mobile') && error.message?.includes('timeout') && retryCount < 2) {
          setRetryCount(prev => prev + 1);
          toast.error(`${error.message} (Attempt ${retryCount + 1}/3)`);
          
          // Auto-retry after a short delay
          setTimeout(() => {
            if (!loading) {
              handleLogin(e);
            }
          }, 2000);
          return;
        }
        
        toast.error(error.message);
        setRetryCount(0); // Reset retry count on non-timeout errors
      } else {
        toast.success('Logged in successfully!');
        setRetryCount(0); // Reset retry count on success
        router.push('/');
      }
    } catch (error: any) {
      console.error('Login exception:', error);
      toast.error(error.message || 'An error occurred during login');
      setRetryCount(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <div className="text-cyan-400 text-4xl font-bold tracking-wider mb-4">
                          FREE INFANTRY
        </div>
        <h2 className="text-3xl font-bold text-cyan-400 mb-4 tracking-wider">
          🔐 Sign In
        </h2>
        <p className="text-gray-300 text-lg">
          Access your account
        </p>
        <p className="mt-4 text-center text-sm text-gray-400">
          Don't have an account?{' '}
          <Link href="/auth/register" className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors duration-300 tracking-wide">
            Create Account
          </Link>
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl py-8 px-6 sm:px-10">
          <form className="space-y-8" onSubmit={handleLogin}>
            <div>
              <label htmlFor="email" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                📧 Email
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
              <div className="flex items-center justify-between mb-3">
                <label htmlFor="password" className="block text-lg font-bold text-cyan-400 tracking-wide">
                  🔒 Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-gray-400 hover:text-cyan-400 transition-colors duration-300"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                  placeholder="Enter your password..."
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
                {loading ? '🔄 Signing In...' : '🚀 Sign In'}
              </button>
            </div>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-800 text-gray-400 font-mono tracking-wide">Or</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={async () => {
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: `${window.location.origin}/auth/callback`,
                    },
                  });
                  if (error) {
                    toast.error('Failed to start Google sign-in');
                    console.error('Google OAuth error:', error);
                  }
                }}
                className="w-full flex justify-center items-center py-3 px-4 border border-gray-600 rounded-lg shadow-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 hover:text-white font-medium tracking-wide transition-all duration-300 hover:border-cyan-500/50"
              >
                <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                    <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
                    <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
                    <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
                    <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
                  </g>
                </svg>
                Continue with Google
              </button>
            </div>
          </div>

          {/* Security Notice */}
          <div className="mt-8 bg-gray-700/30 border border-gray-600 rounded-lg p-4">
            <div className="flex items-center">
              <span className="text-yellow-400 text-lg mr-2">⚡</span>
              <p className="text-yellow-400 font-bold text-xs font-mono">
                SECURE CONNECTION ACTIVE
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 