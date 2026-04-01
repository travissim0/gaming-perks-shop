'use client';

import React, { useState, useEffect } from 'react';

export default function LaunchSignupBanner() {
  const [email, setEmail] = useState('');
  const [alias, setAlias] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [signupCount, setSignupCount] = useState<number | null>(null);

  useEffect(() => {
    // Check if already signed up
    const saved = localStorage.getItem('launch_signup_done');
    if (saved) {
      setStatus('success');
      setMessage('You\'re on the list!');
    }

    // Fetch signup count
    fetch('/api/launch-signup')
      .then(res => res.json())
      .then(data => { if (data.count > 0) setSignupCount(data.count); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/launch-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          in_game_alias: alias.trim() || null,
          notify_by_email: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Something went wrong');
        return;
      }

      setStatus('success');
      setMessage(data.message || 'You\'re on the list!');
      localStorage.setItem('launch_signup_done', 'true');
      setSignupCount(prev => (prev ?? 0) + 1);
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-br from-gray-800/80 via-purple-900/30 to-gray-800/80 backdrop-blur-sm shadow-xl shadow-purple-500/10">
      {/* Top accent bar */}
      <div className="h-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400" />

      {/* Animated background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative p-5">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 mb-3">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-purple-300 text-xs font-semibold uppercase tracking-wider">Coming Soon</span>
          </div>
          <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 uppercase tracking-wide">
            Infantry 2
          </h3>
          <p className="text-gray-400 text-sm mt-1.5">
            The next generation is almost here. Sign up to be notified at launch.
          </p>
        </div>

        {status === 'success' ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/15 border border-green-500/30">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-300 font-semibold text-sm">{message}</span>
            </div>
            {signupCount && signupCount > 1 && (
              <p className="text-gray-500 text-xs mt-3">
                Join {signupCount.toLocaleString()} others waiting for launch
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Email - required */}
            <div>
              <input
                type="email"
                placeholder="Email address *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={status === 'loading'}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-900/60 border border-gray-700/50 text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors disabled:opacity-50"
              />
            </div>

            {/* In-game alias - optional */}
            <div>
              <input
                type="text"
                placeholder="In-game alias (optional)"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                maxLength={50}
                disabled={status === 'loading'}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-900/60 border border-gray-700/50 text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-colors disabled:opacity-50"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={status === 'loading' || !email.trim()}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40"
            >
              {status === 'loading' ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing up...
                </span>
              ) : (
                'Notify Me at Launch'
              )}
            </button>

            {/* Error message */}
            {status === 'error' && message && (
              <p className="text-red-400 text-xs text-center">{message}</p>
            )}

            {/* Privacy note */}
            <p className="text-gray-600 text-[10px] text-center">
              No account required. Your info stays private — only used for launch notification.
            </p>

            {signupCount && signupCount > 0 && (
              <p className="text-gray-500 text-xs text-center">
                {signupCount.toLocaleString()} {signupCount === 1 ? 'player' : 'players'} signed up
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
