'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';

function CheckoutSuccessContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [processing, setProcessing] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [soundPlayed, setSoundPlayed] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid checkout session');
      setProcessing(false);
      return;
    }

    const verifyCheckout = async () => {
      try {
        // Verify the checkout session
        const response = await fetch(`/api/verify-checkout?session_id=${sessionId}`, {
          method: 'GET',
        });

        const result = await response.json();

        if (result.error) {
          setError(result.error);
          toast.error(result.error);
        } else {
          setCompleted(true);
          toast.success('Purchase completed successfully!');
          
          // Play success sound after purchase is completed
          if (!soundPlayed && audioRef.current) {
            try {
              await audioRef.current.play();
              setSoundPlayed(true);
            } catch (err) {
              console.log('Could not play audio:', err);
            }
          }
        }
      } catch (error: any) {
        setError('Failed to verify checkout: ' + error.message);
        toast.error('Failed to verify checkout');
      } finally {
        setProcessing(false);
      }
    };

    verifyCheckout();
  }, [sessionId, soundPlayed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Hidden audio element for success sound */}
      <audio 
        ref={audioRef} 
        preload="auto"
        onError={() => console.log('Audio failed to load')}
      >
        <source src="/sounds/promotion.wav" type="audio/wav" />
        Your browser does not support the audio element.
      </audio>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg shadow-2xl p-8">
          <h1 className="text-3xl font-bold mb-6 text-center text-cyan-400 tracking-wider">🎮 CHECKOUT STATUS</h1>

          {processing && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
              <p className="text-gray-300 font-mono">Processing your purchase...</p>
            </div>
          )}

          {!processing && error && (
            <div className="text-center py-6">
              <div className="bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6">
                <p>{error}</p>
              </div>
              <Link 
                href="/perks" 
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wide border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
              >
                Return to Perks
              </Link>
            </div>
          )}

          {!processing && completed && (
            <div className="text-center py-6">
              <div className="bg-green-900/20 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg mb-6">
                <p className="font-medium">Thank you for your purchase!</p>
                <p className="mt-2">Your new perks have been added to your account.</p>
              </div>
              <div className="space-y-4">
                <Link 
                  href="/dashboard" 
                  className="block bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-bold tracking-wide border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
                >
                  📊 Go to Dashboard
                </Link>
                <Link 
                  href="/perks" 
                  className="block bg-gray-700/50 border border-gray-600 text-gray-300 hover:text-cyan-400 hover:border-cyan-500 px-6 py-3 rounded-lg font-bold tracking-wide transition-all duration-300"
                >
                  🛍️ Browse More Perks
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CheckoutSuccessContent />
    </Suspense>
  );
} 