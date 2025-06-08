'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

function SuccessPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [confetti, setConfetti] = useState(true);

  // Get product info from URL params if provided
  const product = searchParams?.get('product');

  useEffect(() => {
    // Hide confetti after 5 seconds
    const timer = setTimeout(() => setConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      {/* Confetti Animation */}
      {confetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="confetti">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  backgroundColor: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff9ff3'][Math.floor(Math.random() * 5)]
                }}
              />
            ))}
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          
          {/* Success Message */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl p-8 mb-8 shadow-2xl">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-4xl font-bold mb-4">Purchase Successful!</h1>
            <p className="text-xl opacity-90">
              {product ? `Your ${product} perk` : 'Your perk'} has been automatically activated!
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid gap-6 mb-8">
            <div className="bg-gray-800 border border-green-500/30 rounded-lg p-6">
              <div className="flex items-center justify-center mb-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-green-400 font-semibold">Payment Processed</span>
              </div>
              <p className="text-gray-300 text-sm">Ko-fi has successfully processed your payment</p>
            </div>

            <div className="bg-gray-800 border border-blue-500/30 rounded-lg p-6">
              <div className="flex items-center justify-center mb-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-blue-400 font-semibold">Perk Activated</span>
              </div>
              <p className="text-gray-300 text-sm">Your perk is now active and ready to use in-game</p>
            </div>

            {user && (
              <div className="bg-gray-800 border border-purple-500/30 rounded-lg p-6">
                <div className="flex items-center justify-center mb-3">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center mr-3">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-purple-400 font-semibold">Account Linked</span>
                </div>
                <p className="text-gray-300 text-sm">Perk linked to your account: {user.email}</p>
              </div>
            )}
          </div>

          {/* Next Steps */}
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 mb-8">
            <h3 className="text-xl font-semibold text-cyan-400 mb-4">What's Next?</h3>
            <div className="space-y-2 text-gray-300">
              <p>🎮 <strong>Join the game</strong> and enjoy your new perk!</p>
              <p>📧 <strong>Check your email</strong> for purchase confirmation</p>
              <p>💬 <strong>Join our community</strong> to share your experience</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/perks"
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              🛍️ View All Perks
            </Link>
            
            <Link
              href="/"
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              🏠 Return Home
            </Link>

            <Link
              href="/donate"
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
            >
              ☕ Support More
            </Link>
          </div>

        </div>
      </main>

      {/* Confetti CSS */}
      <style jsx>{`
        .confetti {
          position: absolute;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .confetti-piece {
          position: absolute;
          width: 10px;
          height: 10px;
          animation: confetti-fall 3s linear infinite;
        }

        @keyframes confetti-fall {
          to {
            transform: translateY(100vh) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default function PerksSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        <span className="ml-3 text-cyan-400 font-mono">Loading...</span>
      </div>
    }>
      <SuccessPageContent />
    </Suspense>
  );
} 