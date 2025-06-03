'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';

function DonateSuccessContent() {
  const searchParams = useSearchParams();
  const paymentMethod = searchParams.get('payment_method');
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Auto-play success sound and handle loading
    const handleSuccess = async () => {
      try {
        // Try to play the success sound
        if (audioRef.current) {
          // Set volume to a reasonable level
          audioRef.current.volume = 0.7;
          
          // Attempt to play (might fail due to browser autoplay policies)
          const playPromise = audioRef.current.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('🔊 Success sound played!');
              })
              .catch((error) => {
                console.log('🔇 Autoplay blocked by browser:', error);
                // Fallback: show a visual indicator that sound is available
              });
          }
        }
      } catch (error) {
        console.log('Audio error:', error);
      }
      
      // Simulate loading state for better UX
      setTimeout(() => {
        setIsLoading(false);
      }, 1000);
    };

    handleSuccess();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Processing your donation...</p>
        </div>
      </div>
    );
  }

  const getPaymentMethodDisplay = () => {
    switch (paymentMethod) {
      case 'square':
        return { name: 'Square', icon: '💳', color: 'blue' };
      case 'kofi':
        return { name: 'Ko-fi', icon: '☕', color: 'orange' };
      default:
        return { name: 'Payment', icon: '✅', color: 'green' };
    }
  };

  const paymentInfo = getPaymentMethodDisplay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center p-4">
      {/* Hidden audio element for success sound */}
      <audio 
        ref={audioRef} 
        preload="auto"
        onError={() => console.log('Audio failed to load')}
      >
        <source src="/sounds/promotion.wav" type="audio/wav" />
        Your browser does not support the audio element.
      </audio>

      <div className="max-w-2xl w-full">
        {/* Success Card */}
        <div className="bg-gray-800/50 backdrop-blur-md rounded-3xl border border-cyan-500/30 p-8 text-center shadow-2xl">
          {/* Success Icon */}
          <div className="mb-6">
            <div className="w-20 h-20 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-cyan-400 mb-2">🎉 Thank You! 🎉</h1>
            <p className="text-xl text-gray-300">Your donation was successful</p>
          </div>

          {/* Payment Method */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 rounded-full border border-cyan-500/30">
              <span className="text-2xl">{paymentInfo.icon}</span>
              <span className="text-cyan-300">Paid via {paymentInfo.name}</span>
            </div>
          </div>

          {/* Message */}
          <div className="mb-8 p-6 bg-gray-700/30 rounded-2xl border border-gray-600/30">
            <h2 className="text-xl font-semibold text-cyan-400 mb-3">Your Support Matters</h2>
            <p className="text-gray-300 leading-relaxed">
              Your generous donation helps keep the CTFPL Infantry Online community thriving! 
              Your contribution supports server costs, development, and special events that make 
              our gaming experience awesome.
            </p>
          </div>

          {/* What's Next */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">What's Next?</h3>
            <div className="grid gap-4 text-left">
              <div className="flex items-start gap-3 p-3 bg-gray-700/20 rounded-lg border border-gray-600/30">
                <span className="text-cyan-400 mt-1">📧</span>
                <div>
                  <p className="text-gray-200 font-medium">Email Confirmation</p>
                  <p className="text-gray-400 text-sm">You'll receive a receipt via email shortly</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-700/20 rounded-lg border border-gray-600/30">
                <span className="text-cyan-400 mt-1">🎮</span>
                <div>
                  <p className="text-gray-200 font-medium">Join the Game</p>
                  <p className="text-gray-400 text-sm">Your donation will be visible in the community feed</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-700/20 rounded-lg border border-gray-600/30">
                <span className="text-cyan-400 mt-1">💬</span>
                <div>
                  <p className="text-gray-200 font-medium">Community Recognition</p>
                  <p className="text-gray-400 text-sm">Your support helps everyone enjoy Infantry Online</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center">
            <Link 
              href="/"
              className="inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg transition-all duration-300 shadow-lg transform hover:scale-105 hover:shadow-cyan-500/25"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 mt-6 text-sm">
          Thank you for supporting the Infantry Online community! 🎮
        </p>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
        <p className="text-gray-300">Loading success page...</p>
      </div>
    </div>
  );
}

export default function DonateSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <DonateSuccessContent />
    </Suspense>
  );
} 