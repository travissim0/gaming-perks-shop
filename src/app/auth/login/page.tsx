'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

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

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();
  const { signIn } = useAuth();

  const stars = useMemo(() => ({
    far: generateStars(80, 3),
    mid: generateStars(45, 2),
    close: generateStars(20, 1),
  }), []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) return;
    setLoading(true);

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

    try {
      const { error } = await signIn(email.trim(), password);

      if (error) {
        console.error('Login error:', error);

        if (error.message?.includes('mobile') && error.message?.includes('timeout') && retryCount < 2) {
          setRetryCount(prev => prev + 1);
          toast.error(`${error.message} (Attempt ${retryCount + 1}/3)`);
          setTimeout(() => {
            if (!loading) handleLogin(e);
          }, 2000);
          return;
        }

        toast.error(error.message);
        setRetryCount(0);
      } else {
        toast.success('Logged in successfully!');
        setRetryCount(0);
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
    <div className="relative min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Deep space background */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, #050510 0%, #0a0e1a 40%, #0d1117 70%, #050510 100%)',
      }} />

      {/* Far star layer - slowest drift */}
      <div className="absolute inset-0 login-drift-far">
        {stars.far.map((star) => (
          <div key={star.id} className="absolute rounded-full bg-white" style={{
            left: star.left, top: star.top,
            width: star.size, height: star.size,
            opacity: star.opacity,
          }} />
        ))}
      </div>

      {/* Mid star layer - medium drift + twinkle */}
      <div className="absolute inset-0 login-drift-mid">
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

      {/* Close star layer - fastest drift + glow */}
      <div className="absolute inset-0 login-drift-close">
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
        background: 'radial-gradient(ellipse at 50% 30%, rgba(34, 211, 238, 0.4) 0%, transparent 50%), radial-gradient(ellipse at 70% 70%, rgba(59, 130, 246, 0.3) 0%, transparent 40%)',
      }} />

      {/* Content */}
      <div className="relative z-10">
        {/* Header Section */}
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
          <Link href="/" className="inline-block">
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 text-4xl font-bold tracking-wider mb-4 hover:from-cyan-300 hover:to-purple-300 transition-all duration-300">
              FREE INFANTRY
            </div>
          </Link>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-wider">
            Sign In
          </h2>
          <p className="text-gray-400">
            Access your account
          </p>
          <p className="mt-4 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link href="/auth/register" className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors duration-300 tracking-wide">
              Create Account
            </Link>
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 via-gray-900/80 to-gray-800/50 backdrop-blur-sm shadow-xl shadow-cyan-500/5">
            {/* Top gradient accent */}
            <div className="h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500" />

            <div className="py-8 px-6 sm:px-10">
              <form className="space-y-6" onSubmit={handleLogin}>
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
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm"
                    placeholder="Enter your email address..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-semibold text-cyan-400 tracking-wide uppercase">
                      Password
                    </label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs text-gray-500 hover:text-cyan-400 transition-colors duration-300"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 bg-gray-900/60 border border-gray-700/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono text-sm"
                    placeholder="Enter your password..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full flex justify-center py-3.5 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg shadow-lg border border-cyan-500/50 hover:border-cyan-400 text-white font-bold tracking-wider transition-all duration-300 hover:shadow-cyan-500/25 ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                      Signing In...
                    </div>
                  ) : 'Sign In'}
                </button>
              </form>

              {/* Divider */}
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700/50" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-gray-900/80 text-gray-500 font-mono tracking-wide uppercase">Or</span>
                  </div>
                </div>

                <div className="mt-5">
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
                    className="w-full flex justify-center items-center py-3 px-4 border border-gray-700/50 rounded-lg bg-gray-900/40 hover:bg-gray-800/60 text-gray-300 hover:text-white font-medium tracking-wide transition-all duration-300 hover:border-cyan-500/30"
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
            </div>
          </div>
        </div>
      </div>

      {/* Drift animations */}
      <style jsx>{`
        .login-drift-far {
          animation: loginDriftFar 25s ease-in-out infinite;
        }
        .login-drift-mid {
          animation: loginDriftMid 15s ease-in-out infinite;
        }
        .login-drift-close {
          animation: loginDriftClose 10s ease-in-out infinite;
        }
        @keyframes loginDriftFar {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(4px, -3px); }
          66% { transform: translate(-3px, 3px); }
        }
        @keyframes loginDriftMid {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-6px, 5px); }
          66% { transform: translate(5px, -4px); }
        }
        @keyframes loginDriftClose {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(10px, -7px); }
          66% { transform: translate(-8px, 6px); }
        }
      `}</style>
    </div>
  );
}
