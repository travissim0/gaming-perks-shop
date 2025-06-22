'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';

interface DonationTransaction {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  product_name: string;
  product_description: string;
  customer_email: string;
  customer_name: string;
  donation_message: string;
  created_at: string;
  completed_at: string;
}

function DonationSuccessContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [transaction, setTransaction] = useState<DonationTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [soundPlayed, setSoundPlayed] = useState(false);
  const [copied, setCopied] = useState(false);

  const sessionId = searchParams.get('session_id');
  const paymentIntentId = searchParams.get('payment_intent');

  useEffect(() => {
    if (!sessionId && !paymentIntentId) {
      setError('No transaction information found');
      setIsLoading(false);
      return;
    }

    const fetchTransaction = async () => {
      try {
        const response = await fetch(`/api/donation-transaction?${sessionId ? `session_id=${sessionId}` : `payment_intent=${paymentIntentId}`}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch transaction details');
        }

        const data = await response.json();
        setTransaction(data);

        // Play success sound after transaction is loaded with a small delay
        setTimeout(async () => {
          if (!soundPlayed && audioRef.current) {
            try {
              // Reset audio to beginning
              audioRef.current.currentTime = 0;
              await audioRef.current.play();
              setSoundPlayed(true);
              console.log('Donation success sound played successfully');
            } catch (err) {
              console.log('Could not play donation success audio:', err);
              // Try again after user interaction
              const playOnInteraction = () => {
                if (audioRef.current && !soundPlayed) {
                  audioRef.current.currentTime = 0;
                  audioRef.current.play().then(() => {
                    setSoundPlayed(true);
                    console.log('Donation success sound played after user interaction');
                  }).catch(e => console.log('Audio still failed:', e));
                }
                document.removeEventListener('click', playOnInteraction);
                document.removeEventListener('keydown', playOnInteraction);
              };
              document.addEventListener('click', playOnInteraction);
              document.addEventListener('keydown', playOnInteraction);
            }
          }
        }, 500); // 500ms delay to ensure page is fully loaded
      } catch (err) {
        console.error('Error fetching transaction:', err);
        setError('Failed to load transaction details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransaction();
  }, [sessionId, paymentIntentId, soundPlayed]);

  const formatCurrency = (cents: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const downloadReceipt = () => {
    if (!transaction) return;

    const receiptContent = `
                FREE INFANTRY DONATION RECEIPT
================================

Transaction ID: ${transaction.id}
Date: ${formatDate(transaction.completed_at || transaction.created_at)}
Amount: ${formatCurrency(transaction.amount_cents, transaction.currency)}
Status: ${transaction.status.toUpperCase()}

Customer Information:
Name: ${transaction.customer_name || 'N/A'}
Email: ${transaction.customer_email}

${transaction.donation_message ? `Donation Message: "${transaction.donation_message}"` : ''}

${transaction.product_name ? `
Product: ${transaction.product_name}
Description: ${transaction.product_description || 'N/A'}
` : ''}

              Thank you for supporting Free Infantry!

This receipt is for tax purposes. Please keep this record for your files.
Generated on: ${new Date().toLocaleString()}
    `.trim();

    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Infantry_Online_Receipt_${transaction.id}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <Navbar user={user} />
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-2xl mx-auto bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-500/30 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-3xl font-bold text-red-400 mb-4">Transaction Error</h1>
            <p className="text-gray-300 mb-6">{error}</p>
            <Link 
              href="/perks" 
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300"
            >
              Return to Perks
            </Link>
          </div>
        </main>
      </div>
    );
  }

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

      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Success Header */}
          <div className="bg-gradient-to-b from-green-900/20 to-green-800/20 border border-green-500/30 rounded-lg p-8 text-center mb-8">
            <div className="text-8xl mb-6">🎉</div>
            <h1 className="text-4xl font-bold text-green-400 mb-4 tracking-wider">Thank you for your support!</h1>
            <p className="text-xl text-gray-300 mb-6">
              Your donation helps keep Free Infantry running and supports ongoing development!
            </p>
            <div className="text-cyan-400 font-mono text-lg">
              MISSION SUPPORT CONFIRMED
            </div>
          </div>

          {transaction && (
            <>
              {/* Transaction Summary */}
              <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 mb-6">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4 tracking-wider">🧾 TRANSACTION SUMMARY</h2>
                
                {/* Full Transaction ID with Copy Button */}
                <div className="mb-6 p-4 bg-gray-700/30 border border-gray-600/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 font-medium">Transaction ID:</span>
                    <button
                      onClick={() => copyToClipboard(transaction.id)}
                      className="flex items-center gap-2 px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 rounded text-cyan-400 text-sm transition-all duration-200"
                    >
                      {copied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-gray-300 font-mono text-sm break-all bg-gray-800/50 p-3 rounded border">
                    {transaction.id}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Amount:</span>
                      <span className="text-green-400 font-bold text-lg">
                        {formatCurrency(transaction.amount_cents, transaction.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status:</span>
                      <span className="text-green-400 font-bold uppercase">{transaction.status}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Date:</span>
                      <span className="text-gray-300">{formatDate(transaction.completed_at || transaction.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Email:</span>
                      <span className="text-gray-300">{transaction.customer_email}</span>
                    </div>
                    {transaction.customer_name && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Name:</span>
                        <span className="text-gray-300">{transaction.customer_name}</span>
                      </div>
                    )}

                  </div>
                </div>
                
                {/* Donation Message */}
                {transaction.donation_message && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-lg">
                    <h3 className="text-lg font-bold text-purple-400 mb-2">💬 Donation Message</h3>
                    <p className="text-gray-300 italic">"{transaction.donation_message}"</p>
                    <p className="text-sm text-gray-500 mt-2">- {transaction.customer_name || 'Anonymous'}</p>
                  </div>
                )}
              </div>



              {/* Product Information */}
              {transaction.product_name && (
                <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-6 mb-6">
                  <h2 className="text-2xl font-bold text-cyan-400 mb-4 tracking-wider">⚡ COMBAT ENHANCEMENT ACTIVATED</h2>
                  
                  <div className="bg-gray-700/50 border border-cyan-500/30 rounded-lg p-6">
                    <h3 className="text-xl font-bold text-cyan-300 mb-2">{transaction.product_name}</h3>
                    {transaction.product_description && (
                      <p className="text-gray-300 leading-relaxed">{transaction.product_description}</p>
                    )}
                    <div className="mt-4 p-3 bg-cyan-900/20 border border-cyan-500/30 rounded">
                      <p className="text-cyan-300 text-sm">
                        🎮 Your tactical enhancement is now active and ready for deployment in combat operations!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Receipt Download Section */}
          {transaction && (
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/30 rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-bold text-yellow-400 mb-4 tracking-wider">📄 TAX RECEIPT</h2>
              <p className="text-gray-300 mb-4">
                Download your donation receipt for tax purposes. This receipt contains all necessary information for tax deduction claims.
              </p>
              <button
                onClick={downloadReceipt}
                className="bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white px-6 py-3 rounded-lg font-bold tracking-wider transition-all duration-300 shadow-lg hover:shadow-yellow-500/25 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                DOWNLOAD RECEIPT
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/dashboard" 
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-8 py-3 rounded-lg font-bold tracking-wider text-center transition-all duration-300 shadow-lg hover:shadow-cyan-500/25"
            >
              📊 VIEW DASHBOARD
            </Link>
            <Link 
              href="/perks" 
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 text-white px-8 py-3 rounded-lg font-bold tracking-wider text-center transition-all duration-300 border border-gray-500 hover:border-gray-400"
            >
              🛍️ BROWSE MORE PERKS
            </Link>
            <Link 
              href="/" 
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-8 py-3 rounded-lg font-bold tracking-wider text-center transition-all duration-300 shadow-lg hover:shadow-green-500/25"
            >
              🏠 RETURN TO BASE
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DonationSuccess() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DonationSuccessContent />
    </Suspense>
  );
} 