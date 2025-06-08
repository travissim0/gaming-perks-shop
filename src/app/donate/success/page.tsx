'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

function DonateSuccessContent() {
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [pendingDonation, setPendingDonation] = useState<any>(null);

  useEffect(() => {
    // Check for pending donation from Ko-fi
    const pendingData = localStorage.getItem('pendingDonation');
    if (pendingData) {
      try {
        const donation = JSON.parse(pendingData);
        setPendingDonation(donation);
        localStorage.removeItem('pendingDonation');
      } catch (e) {
        console.error('Error parsing pending donation:', e);
      }
    }

    // Play success sound if available
    if (audioRef.current) {
      audioRef.current.play().catch(() => {
        console.log('Audio playback failed - user interaction required');
      });
    }

    // Show confetti effect
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);

    // Show success toast
    toast.success('🎉 Thank you for your support!', { 
      duration: 5000,
      position: 'top-center'
    });
  }, []);

  const getPaymentMethodDisplay = () => {
    return { name: 'Ko-fi', icon: '☕', color: 'red' };
  };

  const paymentInfo = getPaymentMethodDisplay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Confetti Effect */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-transparent">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 3}s`
                }}
              >
                <span className="text-2xl">
                  {['🎉', '✨', '💫', '⭐', '🌟'][Math.floor(Math.random() * 5)]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden audio element for success sound */}
      <audio 
        ref={audioRef} 
        preload="auto"
        onError={() => console.log('Audio failed to load')}
      >
        <source src="/sounds/promotion.wav" type="audio/wav" />
        Your browser does not support the audio element.
      </audio>

      <div className="max-w-4xl w-full">
        {/* Success Card */}
        <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 md:p-12 shadow-2xl text-center relative overflow-hidden">
          
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-pink-500"></div>
          </div>

          <div className="relative z-10">
            {/* Success Icon and Title */}
            <div className="mb-8">
              <div className="text-8xl mb-6 animate-bounce">
                {paymentInfo.icon}
              </div>
              <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent mb-4">
                MISSION SUCCESS!
              </h1>
              <p className="text-2xl md:text-3xl text-white font-semibold">
                Thank you for supporting our community!
              </p>
            </div>

            {/* Donation Details */}
            {pendingDonation && (
              <div className="mb-8 bg-gray-700/30 border border-gray-600/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-white mb-4">Your Contribution Details</h3>
                <div className="grid md:grid-cols-2 gap-4 text-left">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Amount:</span>
                    <span className="text-green-400 font-bold text-xl">${pendingDonation.amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Purpose:</span>
                    <span className="text-white capitalize">{pendingDonation.purpose.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Payment Method:</span>
                    <span className="text-red-400 font-medium">☕ Ko-fi</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Status:</span>
                    <span className="text-green-400 font-medium">✅ Processing</span>
                  </div>
                </div>
                {pendingDonation.message && (
                  <div className="mt-4 pt-4 border-t border-gray-600/50">
                    <span className="text-gray-300 block mb-2">Your Message:</span>
                    <div className="text-white bg-gray-800/50 rounded-lg p-3 italic">
                      "{pendingDonation.message}"
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Impact Message */}
            <div className="mb-8 bg-gradient-to-r from-red-900/20 to-pink-900/20 border border-red-500/30 rounded-xl p-6">
              <h3 className="text-2xl font-bold text-red-400 mb-4">Your Impact</h3>
              <div className="grid md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <div className="text-3xl mb-2">🖥️</div>
                  <div className="text-white font-bold">Server Uptime</div>
                  <div className="text-gray-400 text-sm">Keeping battles alive</div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <div className="text-3xl mb-2">⚡</div>
                  <div className="text-white font-bold">Development</div>
                  <div className="text-gray-400 text-sm">New features & fixes</div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <div className="text-3xl mb-2">🏆</div>
                  <div className="text-white font-bold">Community</div>
                  <div className="text-gray-400 text-sm">Events & tournaments</div>
                </div>
              </div>
            </div>

            {/* Processing Information */}
            <div className="mb-8 bg-blue-900/20 border border-blue-500/30 rounded-xl p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-3">What Happens Next?</h3>
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-blue-400">⏱️</span>
                  <span className="text-gray-300">Your donation is being processed automatically</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-blue-400">📊</span>
                  <span className="text-gray-300">It will appear in our donation tracking within a few minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-blue-400">🎮</span>
                  <span className="text-gray-300">Your support will be recognized in-game during announcements</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-blue-400">💝</span>
                  <span className="text-gray-300">Thank you for helping keep Infantry Online thriving!</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                href="/"
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-cyan-500/25 hover:scale-105"
              >
                🏠 Return Home
              </Link>
              
              <Link 
                href="/donate"
                className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-red-500/25 hover:scale-105"
              >
                ☕ Donate Again
              </Link>
              
              <Link 
                href="/perks"
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-purple-500/25 hover:scale-105"
              >
                🎁 Browse Perks
              </Link>
            </div>

            {/* Testimonial */}
            <div className="mt-8 text-gray-400 italic text-lg">
              "Your support helps keep the Infantry Online community strong and growing. Every soldier counts!" 
              <br />
              <span className="text-cyan-400 font-bold not-italic">- The Development Team</span>
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>📞</span>
              Need Help?
            </h3>
            <p className="text-gray-300 mb-4">
              If you have any questions about your donation or need assistance, feel free to reach out to our support team.
            </p>
            <Link 
              href="/contact"
              className="text-cyan-400 hover:text-cyan-300 underline font-medium"
            >
              Contact Support →
            </Link>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>🎮</span>
              Join the Action
            </h3>
            <p className="text-gray-300 mb-4">
              Ready to get back into the fight? Join one of our active servers and see your contribution in action!
            </p>
            <Link 
              href="/servers"
              className="text-cyan-400 hover:text-cyan-300 underline font-medium"
            >
              View Servers →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DonateSuccessPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      <DonateSuccessContent />
    </div>
  );
} 