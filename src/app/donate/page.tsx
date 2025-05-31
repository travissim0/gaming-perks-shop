'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { loadStripe } from '@stripe/stripe-js';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

export default function DonatePage() {
  const { user, loading } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [donationMessage, setDonationMessage] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<'stripe' | 'kofi'>('stripe');

  const handleDonation = async () => {
    if (!user) {
      toast.error('Please sign in to make a donation');
      return;
    }

    if (selectedAmount < 1) {
      toast.error('Donation amount must be at least $1');
      return;
    }

    if (selectedMethod === 'kofi') {
      handleKofiDonation();
      return;
    }

    try {
      // Get the user's access token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Please sign in again to make a donation');
        return;
      }

      // Call the donation checkout API
      const response = await fetch('/api/donation-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: selectedAmount,
          donationMessage: donationMessage.trim(),
        }),
      });

      const session_data = await response.json();

      if (session_data.error) {
        toast.error(session_data.error);
        return;
      }

      // Redirect to Stripe Checkout
      const stripe = await stripePromise;
      const { error } = await stripe!.redirectToCheckout({
        sessionId: session_data.id,
      });

      if (error) {
        toast.error(error.message || 'An error occurred');
      }
    } catch (error: any) {
      toast.error('Error creating donation session: ' + error.message);
    }
  };

  const handleKofiDonation = () => {
    // Create Ko-fi URL with custom amount and message
    const kofiUrl = new URL('https://ko-fi.com/ctfpl');
    
    // Ko-fi doesn't support direct amount setting via URL, but we can add the amount in a custom message
    // The user will need to manually enter the amount on Ko-fi
    if (donationMessage.trim()) {
      // Add the selected amount and message to Ko-fi's message field
      const fullMessage = `$${selectedAmount} - ${donationMessage.trim()}`;
      kofiUrl.searchParams.set('message', fullMessage);
    }
    
    // Store the intended donation in localStorage so we can potentially track it later
    localStorage.setItem('pendingKofiDonation', JSON.stringify({
      amount: selectedAmount,
      message: donationMessage.trim(),
      timestamp: new Date().toISOString(),
      userId: user?.id
    }));
    
    // Open Ko-fi in a new tab
    window.open(kofiUrl.toString(), '_blank');
    
    // Show success message with instructions
    toast.success(
      `Redirecting to Ko-fi! Please donate $${selectedAmount} with your message.`,
      { duration: 5000 }
    );
  };

  // Mock data - in the future this could come from a database
  const serverCosts = {
    monthly: 89.99,
    annual: 1079.88
  };

  const developmentHours = {
    thisMonth: 47,
    lastMonth: 52,
    average: 45
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">💰 SUPPORT THE MISSION</h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Your support directly funds our tactical operations and keeps Infantry Online running at peak performance.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Donation Form */}
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
              <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">🎯 TACTICAL SUPPORT</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-gray-300 font-medium mb-3">Select Support Amount:</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[5, 10, 25, 50, 100, 250].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setSelectedAmount(amount)}
                        className={`p-4 rounded-lg border-2 transition-all duration-300 font-bold tracking-wide ${
                          selectedAmount === amount
                            ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/25'
                            : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-cyan-500/50 hover:bg-gray-600/70'
                        }`}
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-2">Custom Amount:</label>
                  <input
                    type="number"
                    min="1"
                    value={selectedAmount}
                    onChange={(e) => setSelectedAmount(parseInt(e.target.value) || 0)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none transition-all duration-300"
                    placeholder="Enter amount"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-3">Choose Payment Method:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedMethod('stripe')}
                      className={`p-4 rounded-lg border-2 transition-all duration-300 font-medium ${
                        selectedMethod === 'stripe'
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/25'
                          : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-indigo-500/50 hover:bg-gray-600/70'
                      }`}
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <div className="text-2xl">💳</div>
                        <div className="text-sm font-bold">Stripe</div>
                        <div className="text-xs text-gray-400">Credit/Debit Cards</div>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setSelectedMethod('kofi')}
                      className={`p-4 rounded-lg border-2 transition-all duration-300 font-medium ${
                        selectedMethod === 'kofi'
                          ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/25'
                          : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-red-500/50 hover:bg-gray-600/70'
                      }`}
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <div className="text-2xl">☕</div>
                        <div className="text-sm font-bold">Ko-fi</div>
                        <div className="text-xs text-gray-400">Buy Me a Coffee</div>
                      </div>
                    </button>
                  </div>
                  
                  {selectedMethod === 'kofi' && (
                    <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <div className="text-red-400 mt-0.5">ℹ️</div>
                        <div className="text-red-200 text-sm">
                          <div className="font-medium mb-1">Ko-fi Instructions:</div>
                          <div>You'll be redirected to Ko-fi where you can manually enter the donation amount and message. Please include your selected amount (${selectedAmount}) in your donation.</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-2">Donation Message (Optional):</label>
                  <textarea
                    value={donationMessage}
                    onChange={(e) => setDonationMessage(e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none transition-all duration-300 resize-none"
                    placeholder="Leave a message with your donation..."
                    rows={3}
                    maxLength={200}
                  />
                  <p className="text-gray-400 text-sm mt-1">{donationMessage.length}/200 characters</p>
                </div>

                <button 
                  onClick={handleDonation}
                  disabled={!user || selectedAmount < 1}
                  className={`w-full py-4 rounded-lg font-bold text-lg tracking-wider border transition-all duration-300 shadow-2xl ${
                    selectedMethod === 'stripe' 
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white border-indigo-500 hover:border-indigo-400 disabled:border-gray-600 hover:shadow-indigo-500/25'
                      : 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white border-red-500 hover:border-red-400 disabled:border-gray-600 hover:shadow-red-500/25'
                  }`}
                >
                  {selectedMethod === 'stripe' ? '💳' : '☕'} DONATE ${selectedAmount} via {selectedMethod === 'stripe' ? 'STRIPE' : 'KO-FI'}
                </button>

                {!user && (
                  <p className="text-gray-400 text-sm text-center">
                    * Please sign in to make a donation
                  </p>
                )}
              </div>
            </div>

            {/* Mission Statement & Costs */}
            <div className="space-y-6">
              {/* Mission Statement */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
                <h2 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider">🎖️ MISSION STATEMENT</h2>
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
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-cyan-400 mb-4 tracking-wider">🖥️ SERVER OPERATIONS</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Monthly Server Costs:</span>
                    <span className="text-yellow-400 font-bold">${serverCosts.monthly}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Annual Infrastructure:</span>
                    <span className="text-yellow-400 font-bold">${serverCosts.annual}</span>
                  </div>
                  <div className="w-full h-0.5 bg-gradient-to-r from-cyan-500 to-transparent mt-3"></div>
                </div>
              </div>

              {/* Development Hours */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-cyan-400 mb-4 tracking-wider">⏱️ DEVELOPMENT HOURS</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">This Month:</span>
                    <span className="text-green-400 font-bold">{developmentHours.thisMonth}h</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Last Month:</span>
                    <span className="text-blue-400 font-bold">{developmentHours.lastMonth}h</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Monthly Average:</span>
                    <span className="text-purple-400 font-bold">{developmentHours.average}h</span>
                  </div>
                  <div className="w-full h-0.5 bg-gradient-to-r from-cyan-500 to-transparent mt-3"></div>
                  <p className="text-gray-400 text-sm">
                    Development hours include coding, testing, community management, and server maintenance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Thank You Message */}
          <div className="mt-12 text-center bg-gradient-to-r from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
            <h2 className="text-4xl font-bold text-cyan-400 mb-4 tracking-wider">🙏 THANK YOU, SOLDIER</h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Every contribution, no matter the size, helps us maintain the servers, develop new features, 
              and keep Infantry Online thriving for current and future generations of tactical combat enthusiasts.
            </p>
            <div className="mt-6 text-yellow-400 font-bold text-lg">
              🏆 MISSION SUCCESS DEPENDS ON YOUR SUPPORT 🏆
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 