'use client';

import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function MobileHelpPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">📱 Mobile Payment Help</h1>
            <p className="text-gray-300 text-lg">
              Having trouble with Ko-Fi donations on your mobile device? We've got you covered!
            </p>
          </div>

          {/* Quick Fix Section */}
          <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-green-400 mb-4">🚀 Quick Fix (Try This First!)</h2>
            <div className="space-y-3 text-gray-300">
              <p className="font-medium">If Ko-Fi payments aren't working on your phone:</p>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>Make sure you're using your phone's <strong>default browser</strong> (Safari on iPhone, Chrome on Android)</li>
                <li>Close and reopen your browser app completely</li>
                <li>Try the donation again - it should work better now!</li>
              </ol>
            </div>
          </div>

          {/* Common Issues */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Popup Blockers */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h3 className="text-xl font-bold text-red-400 mb-3">🚫 Popup Blocked</h3>
              <p className="text-gray-300 mb-3">
                If nothing happens when you click "Donate":
              </p>
              <ul className="text-gray-300 space-y-1 text-sm">
                <li>• Check for a popup blocker notification</li>
                <li>• Allow popups for this site</li>
                <li>• Or use your browser's default app</li>
              </ul>
            </div>

            {/* App Browser Issues */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-3">📱 App Browser Issues</h3>
              <p className="text-gray-300 mb-3">
                If you're using a social media app browser:
              </p>
              <ul className="text-gray-300 space-y-1 text-sm">
                <li>• Tap "Open in Browser" or "Open in Safari/Chrome"</li>
                <li>• Or copy the link and paste in your main browser</li>
                <li>• Instagram/Facebook browsers often block payments</li>
              </ul>
            </div>

            {/* Loading Issues */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h3 className="text-xl font-bold text-yellow-400 mb-3">⏳ Page Won't Load</h3>
              <p className="text-gray-300 mb-3">
                If Ko-Fi doesn't load properly:
              </p>
              <ul className="text-gray-300 space-y-1 text-sm">
                <li>• Check your internet connection</li>
                <li>• Try refreshing the page</li>
                <li>• Clear your browser cache</li>
                <li>• Try a different browser app</li>
              </ul>
            </div>

            {/* Payment Methods */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h3 className="text-xl font-bold text-purple-400 mb-3">💳 Payment Methods</h3>
              <p className="text-gray-300 mb-3">
                Ko-Fi accepts on mobile:
              </p>
              <ul className="text-gray-300 space-y-1 text-sm">
                <li>• PayPal (recommended for mobile)</li>
                <li>• Apple Pay (iPhone/iPad)</li>
                <li>• Google Pay (Android)</li>
                <li>• Credit/debit cards</li>
              </ul>
            </div>
          </div>

          {/* Step-by-Step Guide */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">📋 Step-by-Step Mobile Donation</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</div>
                <div className="text-gray-300">
                  <strong>Start the donation:</strong> Fill out the form and click "DONATE"
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</div>
                <div className="text-gray-300">
                  <strong>Mobile redirect:</strong> You'll see a "Redirecting to Ko-fi" message
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</div>
                <div className="text-gray-300">
                  <strong>Ko-Fi payment:</strong> Complete your payment on Ko-Fi's secure page
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">4</div>
                <div className="text-gray-300">
                  <strong>Return here:</strong> Use your browser's back button to return
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">5</div>
                <div className="text-gray-300">
                  <strong>Confirmation:</strong> Your donation will appear in our system within minutes
                </div>
              </div>
            </div>
          </div>

          {/* Browser Recommendations */}
          <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-purple-400 mb-4">🌐 Recommended Mobile Browsers</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-bold text-white mb-2">📱 iPhone/iPad:</h4>
                <ul className="text-gray-300 space-y-1 text-sm">
                  <li>✅ Safari (default - best compatibility)</li>
                  <li>✅ Chrome for iOS</li>
                  <li>⚠️ Avoid in-app browsers</li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-white mb-2">🤖 Android:</h4>
                <ul className="text-gray-300 space-y-1 text-sm">
                  <li>✅ Chrome (default - best compatibility)</li>
                  <li>✅ Firefox Mobile</li>
                  <li>⚠️ Avoid Samsung Internet for payments</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Still Having Issues */}
          <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border border-red-500/30 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-red-400 mb-4">🆘 Still Having Issues?</h2>
            <div className="space-y-3 text-gray-300">
              <p>Don't worry! Here are your options:</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-bold text-white mb-2">Try Alternative Methods:</h4>
                  <ul className="space-y-1 text-sm">
                    <li>• Use a desktop/laptop computer</li>
                    <li>• Try Ko-Fi directly: <a href="https://ko-fi.com/ctfpl" className="text-blue-400 underline">ko-fi.com/ctfpl</a></li>
                    <li>• Ask a friend to donate for you</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-white mb-2">Contact Support:</h4>
                  <ul className="space-y-1 text-sm">
                    <li>• Join our Discord for help</li>
                    <li>• Report the issue to admins</li>
                    <li>• Include your device/browser info</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Link
              href="/donate"
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-8 py-3 rounded-lg font-medium transition-all duration-300"
            >
              ← Try Donating Again
            </Link>
            <Link
              href="https://ko-fi.com/ctfpl"
              target="_blank"
              className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-8 py-3 rounded-lg font-medium transition-all duration-300"
            >
              ☕ Go to Ko-Fi Directly
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
} 