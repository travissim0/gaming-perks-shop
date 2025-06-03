'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';

export default function DonatePage() {
  const { user, loading } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [donationMessage, setDonationMessage] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'kofi' | 'square'>('square');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleKofiDonation = () => {
    if (!user) {
      toast.error('Please sign in to make a donation');
      return;
    }

    if (selectedAmount < 1) {
      toast.error('Donation amount must be at least $1');
      return;
    }

    // Create Ko-fi URL with pre-filled amount and message
    const message = donationMessage.trim() || `Donation from ${user.email}`;
    const kofiUrl = `https://ko-fi.com/ctfpl?donation_amount=${selectedAmount}&message=${encodeURIComponent(message)}`;

    // Open Ko-fi in a new tab
    window.open(kofiUrl, '_blank');
    
    toast.success('Redirecting to Ko-fi for secure payment!');
  };

  const handleSquareDonation = async () => {
    if (!user) {
      toast.error('Please sign in to make a donation');
      return;
    }

    if (selectedAmount < 1) {
      toast.error('Donation amount must be at least $1');
      return;
    }

    setIsProcessing(true);
    try {
      toast.loading('Creating secure payment link...', { id: 'square-checkout' });
      
      // Create Square checkout session
      const response = await fetch('/api/square-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: selectedAmount,
          message: donationMessage,
          userEmail: user.email,
        }),
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error, { id: 'square-checkout' });
        return;
      }

      // Success feedback before redirect
      toast.success('Redirecting to secure payment...', { id: 'square-checkout' });
      
      // Small delay for user feedback, then redirect
      setTimeout(() => {
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        }
      }, 800);
    } catch (error) {
      console.error('Square checkout error:', error);
      toast.error('Error creating payment link. Please try again.', { id: 'square-checkout' });
    } finally {
      // Reset processing state after a delay
      setTimeout(() => setIsProcessing(false), 2000);
    }
  };

  const handleDonation = () => {
    if (paymentMethod === 'kofi') {
      handleKofiDonation();
    } else {
      handleSquareDonation();
    }
  };

  const predefinedAmounts = [5, 10, 25, 50, 100];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
        <Navbar user={user} />
        <div className="container mx-auto px-4 pt-24">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
            <p className="mt-4">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 pt-24 pb-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Support Infantry Online
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Help keep the servers running and support ongoing development with a donation
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          {/* Donation Form */}
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Make a Donation</h2>
            
            <div className="space-y-6">
              {/* Amount Selection */}
              <div>
                <label className="block text-gray-300 font-medium mb-3">Select Amount:</label>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {predefinedAmounts.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setSelectedAmount(amount)}
                      className={`p-3 rounded-lg border-2 transition-all duration-300 font-bold ${
                        selectedAmount === amount
                          ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/25'
                          : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-red-500/50 hover:bg-gray-600/70'
                      }`}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center space-x-3">
                  <span className="text-gray-300 font-medium">$</span>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={selectedAmount}
                    onChange={(e) => setSelectedAmount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none transition-colors"
                    placeholder="Enter custom amount"
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-gray-300 font-medium mb-3">Message (Optional):</label>
                <textarea
                  value={donationMessage}
                  onChange={(e) => setDonationMessage(e.target.value)}
                  placeholder="Leave a message of support..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none transition-colors h-24 resize-none"
                />
              </div>

              {/* Payment Method Selection */}
              <div>
                <label className="block text-gray-300 font-medium mb-3">Payment Method:</label>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('kofi')}
                    className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                      paymentMethod === 'kofi'
                        ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/25'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-red-500/50 hover:bg-gray-600/70'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <span className="text-2xl">☕</span>
                      <div className="text-left">
                        <div className="font-bold">Ko-fi</div>
                        <div className="text-sm opacity-75">PayPal, Cards, Apple Pay</div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('square')}
                    className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                      paymentMethod === 'square'
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-blue-500/50 hover:bg-gray-600/70'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <span className="text-2xl">💳</span>
                      <div className="text-left">
                        <div className="font-bold">Square</div>
                        <div className="text-sm opacity-75">Cards, Digital Wallets</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Payment Method Info */}
              <div className={`border rounded-lg p-4 ${
                paymentMethod === 'kofi' 
                  ? 'bg-red-900/20 border-red-500/30' 
                  : 'bg-blue-900/20 border-blue-500/30'
              }`}>
                <div className="flex items-center space-y-2">
                  <div className="text-2xl">{paymentMethod === 'kofi' ? '☕' : '💳'}</div>
                  <div className="ml-3">
                    <div className={`text-lg font-bold ${
                      paymentMethod === 'kofi' ? 'text-red-400' : 'text-blue-400'
                    }`}>
                      {paymentMethod === 'kofi' ? 'Ko-fi Payment' : 'Square Payment'}
                    </div>
                    <div className="text-sm text-gray-300">
                      {paymentMethod === 'kofi' 
                        ? 'Secure payment via Ko-fi • PayPal, Cards, Apple Pay'
                        : 'Secure payment via Square • Credit Cards, Digital Wallets'
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Donate Button */}
              <div className="space-y-4">
                <button 
                  onClick={handleDonation}
                  disabled={!user || selectedAmount < 1 || isProcessing}
                  className={`w-full py-4 rounded-lg font-bold text-lg tracking-wider border transition-all duration-300 shadow-2xl disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white disabled:border-gray-600 ${
                    paymentMethod === 'kofi'
                      ? 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 border-red-500 hover:border-red-400 hover:shadow-red-500/25'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-blue-500 hover:border-blue-400 hover:shadow-blue-500/25'
                  } ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    paymentMethod === 'kofi' 
                      ? `☕ DONATE $${selectedAmount} via KO-FI`
                      : `💳 DONATE $${selectedAmount} via SQUARE`
                  )}
                </button>

                {!user && (
                  <p className="text-gray-400 text-sm text-center">
                    * Please sign in to make a donation
                  </p>
                )}
                
                {isProcessing && paymentMethod === 'square' && (
                  <p className="text-blue-400 text-sm text-center animate-pulse">
                    🔐 Creating secure payment link...
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Mission Statement & Costs */}
          <div className="space-y-6">
            {/* Mission Statement */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">🎖️</span>
                MISSION STATEMENT
              </h3>
              <div className="space-y-4 text-gray-300 leading-relaxed">
                <p>
                  <span className="text-cyan-400 font-bold">INFANTRY ONLINE</span> is more than just a game - 
                  it's a community-driven tactical combat experience that has been engaging soldiers for over two decades.
                </p>
                <p>
                  Your donations directly support:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>🔧 Server infrastructure & maintenance</li>
                  <li>⚡ Performance optimizations & bug fixes</li>
                  <li>🎮 New features & gameplay enhancements</li>
                  <li>🛡️ Anti-cheat systems & security</li>
                  <li>📋 Regular content updates & patches</li>
                  <li>🌍 Community events & tournaments</li>
                </ul>
              </div>
            </div>

            {/* Server Costs */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">🖥️</span>
                SERVER OPERATIONS
              </h3>
              <div className="space-y-3 text-gray-300">
                <div className="flex justify-between">
                  <span>Monthly Server Costs:</span>
                  <span className="font-semibold text-yellow-400">$26/mo</span>
                </div>
                <div className="border-t border-gray-600 pt-2 flex justify-between font-bold text-lg">
                  <span>Total Monthly:</span>
                  <span className="text-red-400">$26/mo</span>
                </div>
                <div className="w-full h-0.5 bg-gradient-to-r from-cyan-500 to-transparent mt-3"></div>
              </div>
            </div>

            {/* Development Hours */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">⏱️</span>
                DEVELOPMENT HOURS
              </h3>
              <div className="space-y-3 text-gray-300">
                <div className="flex justify-between">
                  <span>This Month:</span>
                  <span className="font-semibold text-green-400">47h</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Month:</span>
                  <span className="font-semibold text-blue-400">52h</span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly Average:</span>
                  <span className="font-semibold text-purple-400">45h</span>
                </div>
                <div className="w-full h-0.5 bg-gradient-to-r from-cyan-500 to-transparent mt-3"></div>
                <p className="text-gray-400 text-sm">
                  Development hours include coding, testing, community management, and server maintenance.
                </p>
              </div>
            </div>

            {/* Development Goals */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">🚀</span>
                Development Goals
              </h3>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start">
                  <span className="mr-2 text-green-400">✓</span>
                  <span>Custom phrase system for perks</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-green-400">✓</span>
                  <span>Real-time player tracking</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-yellow-400">⏳</span>
                  <span>Enhanced anti-cheat system</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-yellow-400">⏳</span>
                  <span>Tournament bracket system</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-yellow-400">⏳</span>
                  <span>Mobile companion app</span>
                </li>
              </ul>
            </div>

            {/* Thank You */}
            <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-3 flex items-center">
                <span className="mr-2">🙏</span>
                THANK YOU, SOLDIER
              </h3>
              <p className="text-gray-300 leading-relaxed">
                Every contribution, no matter the size, helps us maintain the servers, develop new features, 
                and keep Infantry Online thriving for current and future generations of tactical combat enthusiasts.
              </p>
              <div className="mt-4 text-yellow-400 font-bold text-lg text-center">
                🏆 MISSION SUCCESS DEPENDS ON YOUR SUPPORT 🏆
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 