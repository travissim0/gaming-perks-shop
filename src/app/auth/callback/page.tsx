'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function CallbackContent() {
  const router = useRouter();
  const [status, setStatus] = useState('Completing sign-in...');

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let subscriptionRef: { unsubscribe: () => void } | null = null;

    const checkProfileAndRedirect = async (userId: string, email: string | undefined) => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('in_game_alias')
          .eq('id', userId)
          .single();

        if (!profile || !profile.in_game_alias) {
          // Ensure profile row exists for new Google users
          if (!profile) {
            await supabase.from('profiles').upsert({
              id: userId,
              email: email,
              in_game_alias: null,
            });
          }
          router.push('/auth/complete-profile');
        } else {
          router.push('/home-new');
        }
      } catch (err) {
        console.error('Profile check error:', err);
        router.push('/home-new');
      }
    };

    const handleCallback = async () => {
      // The Supabase client has detectSessionInUrl: true and flowType: 'pkce',
      // so it automatically detects ?code= in the URL and exchanges it for a session.
      // We just need to wait for the session to be established.

      // First check if session is already available
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setStatus('Checking profile...');
        await checkProfileAndRedirect(session.user.id, session.user.email);
        return;
      }

      // If no session yet, listen for auth state changes
      setStatus('Waiting for authentication...');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, newSession) => {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && newSession?.user) {
            subscription.unsubscribe();
            clearTimeout(timeoutId);
            setStatus('Checking profile...');
            await checkProfileAndRedirect(newSession.user.id, newSession.user.email);
          }
        }
      );

      subscriptionRef = subscription;

      // Timeout fallback — if auth doesn't complete in 15 seconds, redirect to login
      timeoutId = setTimeout(() => {
        subscription.unsubscribe();
        console.error('Auth callback timed out');
        router.push('/auth/login');
      }, 15000);
    };

    handleCallback();

    return () => {
      clearTimeout(timeoutId);
      subscriptionRef?.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <h2 className="text-xl text-cyan-400 font-bold">{status}</h2>
        <p className="text-gray-400 mt-2">Please wait</p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto"></div>
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
