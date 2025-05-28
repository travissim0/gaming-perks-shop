'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';

export default function TestDonation() {
  const { user, loading } = useAuth();
  const [amount, setAmount] = useState(5);
  const [donationMessage, setDonationMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createTestDonation = async () => {
    if (!user) {
      toast.error('You must be logged in to create a test donation');
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No valid session');
      }

      const response = await fetch('/api/create-test-donation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount,
          donationMessage: donationMessage || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create test donation');
      }

      toast.success(`Test donation of $${amount} created successfully!`);
      
      // Reset form
      setAmount(5);
      setDonationMessage('');
      
      // Optionally redirect to dashboard to see the donation
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (error: any) {
      console.error('Error creating test donation:', error);
      toast.error(error.message || 'Failed to create test donation');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-2xl mx-auto bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">🚫</div>
            <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
            <p className="text-gray-300 mb-6">You must be logged in to access this test page.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
            <h1 className="text-3xl font-bold text-cyan-400 mb-6 tracking-wider text-center">
              🧪 TEST DONATION CREATOR
            </h1>
            <p className="text-gray-300 mb-8 text-center">
              Create test donation transactions to verify the donation tracking system works properly.
            </p>

            <div className="space-y-6">
              <div>
                <label className="block text-cyan-400 font-bold mb-2">
                  Donation Amount ($)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={amount}
                  onChange={(e) => setAmount(parseInt(e.target.value) || 1)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter amount in dollars"
                />
              </div>

              <div>
                <label className="block text-cyan-400 font-bold mb-2">
                  Donation Message (Optional)
                </label>
                <textarea
                  value={donationMessage}
                  onChange={(e) => setDonationMessage(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="Enter a test message..."
                  rows={3}
                  maxLength={200}
                />
                <p className="text-gray-500 text-sm mt-1">
                  {donationMessage.length}/200 characters
                </p>
              </div>

              <button
                onClick={createTestDonation}
                disabled={isCreating || amount < 1}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-4 rounded-lg font-bold tracking-wide transition-all duration-300 shadow-lg hover:shadow-green-500/25"
              >
                {isCreating ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                    Creating Test Donation...
                  </div>
                ) : (
                  `Create Test Donation - $${amount}`
                )}
              </button>
            </div>

            <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
              <h3 className="text-yellow-400 font-bold mb-2">⚠️ Development Only</h3>
              <p className="text-gray-300 text-sm">
                This page creates test donation records directly in the database, bypassing Stripe. 
                Use this to test the donation tracking system during development.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 