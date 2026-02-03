'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import AvatarSelector from '@/components/AvatarSelector';
import { getDefaultAvatarUrl } from '@/utils/supabaseHelpers';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inGameAlias, setInGameAlias] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const router = useRouter();
  const { signUp } = useAuth();

  // Enhanced form validation
  const validateForm = () => {
    const errors: {[key: string]: string} = {};

    // Email validation
    if (!email) {
      errors.email = 'Email is required';
    } else if (!email.includes('@') || !email.includes('.')) {
      errors.email = 'Please enter a valid email address';
    }

    // Username validation
    if (!inGameAlias || inGameAlias.trim().length === 0) {
      errors.inGameAlias = 'Username/Main Alias is required';
    } else if (inGameAlias.trim().length < 2) {
      errors.inGameAlias = 'Username/Main Alias must be at least 2 characters';
    } else if (inGameAlias.trim().length > 30) {
      errors.inGameAlias = 'Username/Main Alias must be less than 30 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(inGameAlias.trim())) {
      errors.inGameAlias = 'Username/Main Alias can only contain letters, numbers, underscores, and hyphens';
    }

    // Password validation
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double-clicking/multiple submissions
    if (loading) {
      return;
    }

    // Clear previous errors
    setFormErrors({});
    
    // Validate form
    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }
    
    setLoading(true);

    try {
      console.log('Attempting registration with:', { 
        email: email.trim(), 
        aliasLength: inGameAlias.length,
        hasAvatar: !!selectedAvatar 
      });

      const data = await signUp(
        email.trim(), 
        password, 
        inGameAlias.trim(), 
        selectedAvatar || getDefaultAvatarUrl()
      );
      
      // If we get here, registration was successful
      console.log('Registration successful, data:', data);
      
      if (data?.user) {
        // Check if user needs email confirmation
        if (data.user.email_confirmed_at) {
          toast.success('Account created successfully! You can now sign in.');
        } else {
          toast.success('Registration successful! Check your email for verification.');
        }
        router.push('/auth/login');
        setRetryCount(0); // Reset retry count on success
      } else {
        // Handle case where signUp returns but without user data
        console.warn('Registration returned without user data:', data);
        toast.success('Registration may have succeeded. Please check your email and try signing in.');
        router.push('/auth/login');
      }
    } catch (error: any) {
      console.error('Registration exception:', error);
      
      // Handle specific error types
      if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        toast.error('An account with this email already exists. Please sign in instead.');
        setTimeout(() => {
          router.push('/auth/login');
        }, 2000);
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        toast.error('Network error. Please check your internet connection.');
      } else if (error.message?.includes('timeout') && retryCount < 2) {
        setRetryCount(prev => prev + 1);
        toast.error(`Request timed out. Retrying... (${retryCount + 1}/3)`);
        setLoading(false);
        
        // Auto-retry after a short delay
        setTimeout(() => {
          handleRegister(e);
        }, 2000);
        return;
      } else if (error.message?.includes('Invalid email')) {
        toast.error('Please enter a valid email address.');
        setFormErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
      } else if (error.message?.includes('Password')) {
        toast.error('Password is too weak. Please choose a stronger password.');
        setFormErrors(prev => ({ ...prev, password: 'Password is too weak' }));
      } else {
        toast.error(error.message || 'An error occurred during registration');
      }
      setRetryCount(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex flex-col justify-center py-6 px-4 sm:py-12 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6 sm:mb-8">
        <div className="text-cyan-400 text-3xl sm:text-4xl font-bold tracking-wider mb-4">
          FREE INFANTRY
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-cyan-400 mb-4 tracking-wider">
          🎖️ Create Account
        </h2>
        <p className="text-gray-300 text-base sm:text-lg">
          Join the gaming community
        </p>
        <p className="mt-4 text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors duration-300 tracking-wide">
            Sign In
          </Link>
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl py-6 px-4 sm:py-8 sm:px-6 lg:px-10">
          <form className="space-y-6" onSubmit={handleRegister} noValidate>
            <div>
              <label htmlFor="email" className="block text-base sm:text-lg font-bold text-cyan-400 mb-2 sm:mb-3 tracking-wide">
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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formErrors.email) {
                      setFormErrors(prev => ({ ...prev, email: '' }));
                    }
                  }}
                  className={`appearance-none block w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm sm:text-base ${
                    formErrors.email 
                      ? 'border-red-500 focus:border-red-500' 
                      : 'border-gray-600 focus:border-cyan-500'
                  }`}
                  placeholder="Enter your email address..."
                />
                {formErrors.email && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.email}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="inGameAlias" className="block text-base sm:text-lg font-bold text-cyan-400 mb-2 sm:mb-3 tracking-wide">
                🎮 Username/Main Alias
              </label>
              <div className="mt-1">
                <input
                  id="inGameAlias"
                  name="inGameAlias"
                  type="text"
                  autoComplete="username"
                  required
                  value={inGameAlias}
                  onChange={(e) => {
                    setInGameAlias(e.target.value);
                    if (formErrors.inGameAlias) {
                      setFormErrors(prev => ({ ...prev, inGameAlias: '' }));
                    }
                  }}
                  className={`appearance-none block w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm sm:text-base ${
                    formErrors.inGameAlias 
                      ? 'border-red-500 focus:border-red-500' 
                      : 'border-gray-600 focus:border-cyan-500'
                  }`}
                  placeholder="Choose your username/main alias..."
                  maxLength={30}
                />
                {formErrors.inGameAlias && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.inGameAlias}</p>
                )}
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  ⚡ This will be your display name (1-30 characters)
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-base sm:text-lg font-bold text-cyan-400 mb-2 sm:mb-3 tracking-wide">
                🔒 Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formErrors.password) {
                      setFormErrors(prev => ({ ...prev, password: '' }));
                    }
                  }}
                  className={`appearance-none block w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm sm:text-base ${
                    formErrors.password 
                      ? 'border-red-500 focus:border-red-500' 
                      : 'border-gray-600 focus:border-cyan-500'
                  }`}
                  placeholder="Create a secure password..."
                  minLength={6}
                />
                {formErrors.password && (
                  <p className="mt-1 text-sm text-red-400">{formErrors.password}</p>
                )}
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  🔐 Minimum 6 characters
                </p>
              </div>
            </div>

            {/* Avatar Selection */}
            <div>
              <AvatarSelector 
                selectedAvatar={selectedAvatar}
                onAvatarSelect={setSelectedAvatar}
                size="small"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full flex justify-center py-3 sm:py-4 px-4 sm:px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg shadow-2xl border border-green-500 hover:border-green-400 text-white font-bold text-base sm:text-lg tracking-wider transition-all duration-300 hover:shadow-green-500/25 ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Account...
                  </>
                ) : (
                  '🚀 Create Account'
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 sm:mt-8">
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
                className="w-full flex justify-center items-center py-2 sm:py-3 px-4 border border-gray-600 rounded-lg shadow-lg bg-gray-700/50 hover:bg-gray-600/70 text-gray-300 hover:text-white font-medium tracking-wide transition-all duration-300 hover:border-cyan-500/50 text-sm sm:text-base"
              >
                <svg className="h-4 w-4 sm:h-5 sm:w-5 mr-3" viewBox="0 0 24 24">
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
          <div className="mt-6 sm:mt-8 bg-gray-700/30 border border-gray-600 rounded-lg p-3 sm:p-4">
            <div className="flex items-center">
              <span className="text-yellow-400 text-base sm:text-lg mr-2">⚡</span>
              <p className="text-yellow-400 font-bold text-xs sm:text-sm font-mono">
                SECURE CONNECTION ACTIVE
              </p>
            </div>
          </div>

          {/* Mobile-specific help text */}
          <div className="mt-4 sm:hidden">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-start">
                <span className="text-blue-400 text-sm mr-2">💡</span>
                <div>
                  <p className="text-blue-400 font-bold text-xs mb-1">Mobile Tips:</p>
                  <ul className="text-blue-300 text-xs space-y-1">
                    <li>• Ensure stable internet connection</li>
                    <li>• Use a valid email address</li>
                    <li>• Choose a unique username/main alias</li>
                    <li>• Password must be 6+ characters</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 