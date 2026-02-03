'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Auth callback error:', error);
          router.push('/auth/login');
          return;
        }
      }

      // Get the current user after code exchange
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      // Check if user has a profile with alias set
      const { data: profile } = await supabase
        .from('profiles')
        .select('in_game_alias')
        .eq('id', user.id)
        .single();

      if (!profile || !profile.in_game_alias) {
        // Ensure profile row exists for new Google users
        if (!profile) {
          await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            in_game_alias: null,
          });
        }
        router.push('/auth/complete-profile');
      } else {
        router.push('/home-new');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <h2 className="text-xl text-cyan-400 font-bold">Completing sign-in...</h2>
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
