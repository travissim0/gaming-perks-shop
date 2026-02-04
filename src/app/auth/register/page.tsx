'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import AvatarSelector from '@/components/AvatarSelector';
import { getDefaultAvatarUrl } from '@/utils/supabaseHelpers';

// Star generation for parallax background
function generateStars(count: number, layer: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `star-${layer}-${i}`,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: layer === 1 ? Math.random() * 2 + 1 : layer === 2 ? Math.random() * 1.5 + 0.5 : Math.random() + 0.3,
    opacity: layer === 1 ? Math.random() * 0.5 + 0.5 : layer === 2 ? Math.random() * 0.4 + 0.3 : Math.random() * 0.3 + 0.2,
    animationDuration: `${Math.random() * 3 + 2}s`,
    animationDelay: `${Math.random() * 2}s`,
  }));
}

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inGameAlias, setInGameAlias] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const [showEmailForm, setShowEmailForm] = useState(false);
  const router = useRouter();
  const { signUp } = useAuth();

  const stars = useMemo(() => ({
    far: generateStars(80, 3),
    mid: generateStars(45, 2),
    close: generateStars(20, 1),
  }), []);

  const validateForm = () => {
    const errors: {[key: string]: string} = {};
    if (!email) {
      errors.email = 'Email is required';
    } else if (!email.includes('@') || !email.includes('.')) {
      errors.email = 'Please enter a valid email address';
    }
    if (!inGameAlias || inGameAlias.trim().length === 0) {
      errors.inGameAlias = 'Username is required';
    } else if (inGameAlias.trim().length < 2) {
      errors.inGameAlias = 'Must be at least 2 characters';
    } else if (inGameAlias.trim().length > 30) {
      errors.inGameAlias = 'Must be less than 30 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(inGameAlias.trim())) {
      errors.inGameAlias = 'Only letters, numbers, underscores, and hyphens';
    }
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Must be at least 6 characters';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormErrors({});
    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }
    setLoading(true);

    try {
      const data = await signUp(
        email.trim(),
        password,
        inGameAlias.trim(),
        selectedAvatar || getDefaultAvatarUrl()
      );

      if (data?.user) {
        if (data.user.email_confirmed_at) {
          toast.success('Account created successfully! You can now sign in.');
        } else {
          toast.success('Registration successful! Check your email for verification.');
        }
        router.push('/auth/login');
        setRetryCount(0);
      } else {
        toast.success('Registration may have succeeded. Please check your email and try signing in.');
        router.push('/auth/login');
      }
    } catch (error: any) {
      console.error('Registration exception:', error);
      if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
        toast.error('An account with this email already exists. Please sign in instead.');
        setTimeout(() => router.push('/auth/login'), 2000);
      } else if (error.message?.includes('timeout') && retryCount < 2) {
        setRetryCount(prev => prev + 1);
        toast.error(`Request timed out. Retrying... (${retryCount + 1}/3)`);
        setLoading(false);
        setTimeout(() => handleRegister(e), 2000);
        return;
      } else if (error.message?.includes('Invalid email')) {
        setFormErrors(prev => ({ ...prev, email: 'Please enter a valid email address' }));
      } else if (error.message?.includes('Password')) {
        setFormErrors(prev => ({ ...prev, password: 'Password is too weak' }));
      } else {
        toast.error(error.message || 'An error occurred during registration');
      }
      setRetryCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      toast.error('Failed to start Google sign-up');
      console.error('Google OAuth error:', error);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center py-8 sm:py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Deep space background */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, #050510 0%, #0a0e1a 40%, #0d1117 70%, #050510 100%)',
      }} />

      {/* Far star layer */}
      <div className="absolute inset-0 reg-drift-far">
        {stars.far.map((star) => (
          <div key={star.id} className="absolute rounded-full bg-white" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            opacity: star.opacity,
          }} />
        ))}
      </div>

      {/* Mid star layer */}
      <div className="absolute inset-0 reg-drift-mid">
        {stars.mid.map((star) => (
          <div key={star.id} className="absolute rounded-full bg-white animate-pulse" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            opacity: star.opacity,
            animationDuration: star.animationDuration,
            animationDelay: star.animationDelay,
          }} />
        ))}
      </div>

      {/* Close star layer */}
      <div className="absolute inset-0 reg-drift-close">
        {stars.close.map((star) => (
          <div key={star.id} className="absolute rounded-full bg-white animate-pulse" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            opacity: star.opacity,
            boxShadow: `0 0 ${star.size * 3}px rgba(255,255,255,0.5)`,
            animationDuration: star.animationDuration,
            animationDelay: star.animationDelay,
          }} />
        ))}
      </div>

      {/* Nebula glow */}
      <div className="absolute inset-0 opacity-20" style={{
        background: 'radial-gradient(ellipse at 40% 25%, rgba(34, 197, 94, 0.3) 0%, transparent 50%), radial-gradient(ellipse at 65% 75%, rgba(34, 211, 238, 0.3) 0%, transparent 40%)',
      }} />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
          <Link href="/" className="inline-block">
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 text-4xl font-bold tracking-wider mb-4 hover:from-cyan-300 hover:to-purple-300 transition-all duration-300">
              FREE INFANTRY
            </div>
          </Link>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-wider">
            Create Account
          </h2>
          <p className="text-gray-400">
            Join the gaming community
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors duration-300">
              Sign In
            </Link>
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-xl shadow-cyan-500/5">
            {/* Top gradient accent */}
            <div className="h-1.5 bg-gradient-to-r from-green-400 via-cyan-500 to-blue-500" />

            <div className="py-8 px-6 sm:px-10">
              {/* Google Sign-Up — Primary CTA */}
              <div className="mb-6">
                <p className="text-center text-xs text-gray-500 uppercase tracking-wider font-semibold mb-4">
                  Recommended
                </p>
                <button
                  onClick={handleGoogleSignUp}
                  disabled={googleLoading}
                  className={`w-full flex justify-center items-center py-4 px-6 rounded-xl shadow-lg bg-white hover:bg-gray-50 text-gray-800 font-bold text-base tracking-wide transition-all duration-300 border-2 border-white/80 hover:border-cyan-400/50 hover:shadow-cyan-500/20 hover:shadow-xl ${
                    googleLoading ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  {googleLoading ? (
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-600" />
                      Connecting to Google...
                    </div>
                  ) : (
                    <>
                      <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                        <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                          <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z" />
                          <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z" />
                          <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z" />
                          <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z" />
                        </g>
                      </svg>
                      Sign up with Google
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-gray-600 mt-2">
                  Fastest way to get started — no password needed
                </p>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700/50" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-gray-900/80 text-gray-500 font-mono tracking-wide uppercase">Or register with email</span>
                </div>
              </div>

              {/* Email Form — Collapsible */}
              {!showEmailForm ? (
                <button
                  onClick={() => setShowEmailForm(true)}
                  className="w-full py-3 px-4 border border-gray-700/50 rounded-lg bg-gray-900/40 hover:bg-gray-800/60 text-gray-400 hover:text-gray-200 font-medium tracking-wide transition-all duration-300 hover:border-cyan-500/30 text-sm"
                >
                  Register with email and password
                </button>
              ) : (
                <form className="space-y-5" onSubmit={handleRegister} noValidate>
                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-cyan-400 mb-2 tracking-wide uppercase">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (formErrors.email) setFormErrors(prev => ({ ...prev, email: '' }));
                      }}
                      className={`appearance-none block w-full px-4 py-3 bg-gray-900/60 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm ${
                        formErrors.email ? 'border-red-500 focus:border-red-500' : 'border-gray-700/50 focus:border-cyan-500'
                      }`}
                      placeholder="Enter your email address..."
                    />
                    {formErrors.email && <p className="mt-1 text-xs text-red-400">{formErrors.email}</p>}
                  </div>

                  <div>
                    <label htmlFor="inGameAlias" className="block text-sm font-semibold text-cyan-400 mb-2 tracking-wide uppercase">
                      Username / Main Alias
                    </label>
                    <input
                      id="inGameAlias"
                      name="inGameAlias"
                      type="text"
                      autoComplete="username"
                      required
                      value={inGameAlias}
                      onChange={(e) => {
                        setInGameAlias(e.target.value);
                        if (formErrors.inGameAlias) setFormErrors(prev => ({ ...prev, inGameAlias: '' }));
                      }}
                      className={`appearance-none block w-full px-4 py-3 bg-gray-900/60 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm ${
                        formErrors.inGameAlias ? 'border-red-500 focus:border-red-500' : 'border-gray-700/50 focus:border-cyan-500'
                      }`}
                      placeholder="Choose your display name..."
                      maxLength={30}
                    />
                    {formErrors.inGameAlias && <p className="mt-1 text-xs text-red-400">{formErrors.inGameAlias}</p>}
                    <p className="text-xs text-gray-600 mt-1 font-mono">2-30 characters, letters, numbers, underscores, hyphens</p>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-semibold text-cyan-400 mb-2 tracking-wide uppercase">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (formErrors.password) setFormErrors(prev => ({ ...prev, password: '' }));
                      }}
                      className={`appearance-none block w-full px-4 py-3 bg-gray-900/60 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm ${
                        formErrors.password ? 'border-red-500 focus:border-red-500' : 'border-gray-700/50 focus:border-cyan-500'
                      }`}
                      placeholder="Create a secure password..."
                      minLength={6}
                    />
                    {formErrors.password && <p className="mt-1 text-xs text-red-400">{formErrors.password}</p>}
                    <p className="text-xs text-gray-600 mt-1 font-mono">Minimum 6 characters</p>
                  </div>

                  {/* Avatar Selection */}
                  <AvatarSelector
                    selectedAvatar={selectedAvatar}
                    onAvatarSelect={setSelectedAvatar}
                    size="small"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full flex justify-center py-3.5 px-6 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg shadow-lg border border-green-500/50 hover:border-green-400 text-white font-bold tracking-wider transition-all duration-300 hover:shadow-green-500/25 ${
                      loading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                        Creating Account...
                      </div>
                    ) : 'Create Account'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drift animations */}
      <style jsx>{`
        .reg-drift-far {
          animation: regDriftFar 25s ease-in-out infinite;
        }
        .reg-drift-mid {
          animation: regDriftMid 15s ease-in-out infinite;
        }
        .reg-drift-close {
          animation: regDriftClose 10s ease-in-out infinite;
        }
        @keyframes regDriftFar {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(4px, -3px); }
          66% { transform: translate(-3px, 3px); }
        }
        @keyframes regDriftMid {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-6px, 5px); }
          66% { transform: translate(5px, -4px); }
        }
        @keyframes regDriftClose {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(10px, -7px); }
          66% { transform: translate(-8px, 6px); }
        }
      `}</style>
    </div>
  );
}
