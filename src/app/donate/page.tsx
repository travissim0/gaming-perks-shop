'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { handleKofiRedirect } from '@/utils/deviceDetection';
import MobilePaymentInfo from '@/components/MobilePaymentInfo';
import { useDonationMode } from '@/hooks/useDonationMode';
import supportersCache from '@/lib/supporters-cache.json';

export default function DonatePage() {
  const { user } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [donationMessage, setDonationMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [donationPurpose, setDonationPurpose] = useState<string>('general');
  
  // Use the donation mode hook
  const { donations: recentDonations, isUsingCache } = useDonationMode('recent-donations', 9);

  const predefinedAmounts = [5, 10, 25, 50, 100];
  
  const donationPurposes = [
    { id: 'general', name: 'General Support', description: 'Keep the servers running' },
    { id: 'events', name: 'Special Events', description: 'Support tournaments & competitions' },
    { id: 'development', name: 'Development', description: 'New features & improvements' },
    { id: 'community', name: 'Community', description: 'Support community initiatives' }
  ];

  const handlePrepareKofiDonation = () => {
    if (selectedAmount < 5) {
      toast.error('Donation amount must be at least $5 (Ko-fi minimum)');
      return;
    }

    setShowPaymentModal(true);
  };

  const handleConfirmKofiDonation = () => {
    setIsProcessing(true);
    setShowPaymentModal(false);

    // Enhanced Ko-fi URL with better structure
    const purposeText = donationPurposes.find(p => p.id === donationPurpose)?.name || 'General Support';
    const fullMessage = `${purposeText}${donationMessage ? ` | ${donationMessage}` : ''}`;
    
    const kofiUrl = `https://ko-fi.com/ctfpl?amount=${selectedAmount}${fullMessage ? `&message=${encodeURIComponent(fullMessage)}` : ''}`;
    
         // Store donation attempt for tracking
     const donationData = {
       amount: selectedAmount,
       purpose: donationPurpose,
       message: donationMessage,
       timestamp: Date.now(),
       email: user?.email || 'guest'
     };
    
    localStorage.setItem('pendingDonation', JSON.stringify(donationData));
    
    // Success feedback with better messaging
    toast.success('🚀 Preparing your secure Ko-fi payment...', { duration: 3000 });
    
    setTimeout(() => {
      toast('📝 Your donation details have been prepared. Redirecting to Ko-fi for payment...', { 
        duration: 3000,
        icon: '💳'
      });
      
      // Direct mobile-friendly redirect without additional delays
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // On mobile, use same-window redirect to avoid popup blockers
        toast('📱 Redirecting to Ko-fi payment page...', { 
          duration: 2000,
          icon: '📱'
        });
        // Immediate redirect for mobile
        setTimeout(() => {
          window.location.href = kofiUrl;
        }, 100);
      } else {
        // On desktop, open in new tab
        window.open(kofiUrl, '_blank');
        setIsProcessing(false);
        
        // Show return instructions for desktop users
        setTimeout(() => {
          toast('🔄 After completing payment on Ko-fi, return here to see your contribution!', { 
            duration: 8000,
            icon: '🏠'
          });
        }, 1000);
      }
    }, 1000);
  };

  // Check for returning donation
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnFromKofi = urlParams.get('return');
    
    if (returnFromKofi === 'kofi') {
      const pendingDonation = localStorage.getItem('pendingDonation');
      if (pendingDonation) {
        localStorage.removeItem('pendingDonation');
        toast.success('✅ Thank you for your donation! It may take a few minutes to appear in our system.', {
          duration: 8000
        });
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-4 px-4">
        {/* Hero Section */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-red-400 via-pink-400 to-orange-400 bg-clip-text text-transparent mb-3">
            Support Our Community
          </h1>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Help keep our Infantry Online servers running, support development of new features, 
            and contribute to special community events. Every donation makes a difference!
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {/* Donation Form */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 shadow-2xl">
              <h2 className="text-2xl font-bold text-white mb-6 text-center flex items-center justify-center gap-3">
                <span className="text-3xl">☕</span>
                Make a Donation
              </h2>
              
              <div className="space-y-6">
                {/* Donation Purpose and Amount Selection - Side by Side */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Donation Purpose */}
                  <div>
                    <label className="block text-gray-300 font-semibold mb-4">What would you like to support?</label>
                    <div className="grid grid-cols-1 gap-3">
                      {donationPurposes.map((purpose) => (
                        <button
                          key={purpose.id}
                          onClick={() => setDonationPurpose(purpose.id)}
                          className={`p-3 rounded-lg border-2 transition-all duration-300 text-left ${
                            donationPurpose === purpose.id
                              ? 'bg-red-600/20 border-red-400 text-white shadow-lg shadow-red-500/25'
                              : 'bg-gray-700/30 border-gray-600 text-gray-300 hover:border-red-500/50 hover:bg-gray-600/50'
                          }`}
                        >
                          <div className="font-bold text-sm">{purpose.name}</div>
                          <div className="text-xs opacity-75 mt-1">{purpose.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount Selection and Donate Button */}
                  <div className="space-y-4">
                    {/* Amount Selection */}
                    <div>
                      <label className="block text-gray-300 font-semibold mb-4">Select Amount:</label>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {predefinedAmounts.map((amount) => (
                          <button
                            key={amount}
                            onClick={() => setSelectedAmount(amount)}
                            className={`p-3 rounded-lg border-2 transition-all duration-300 font-bold ${
                              selectedAmount === amount
                                ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-500/25 scale-105'
                                : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-red-500/50 hover:bg-gray-600/70 hover:scale-102'
                            }`}
                          >
                            ${amount}
                          </button>
                        ))}
                      </div>
                      
                      <div className="flex items-center bg-gray-700/30 border border-gray-600 rounded-lg p-2">
                        <span className="text-gray-300 font-bold text-lg px-3">$</span>
                        <input
                          type="number"
                          min="5"
                          max="10000"
                          value={selectedAmount}
                          onChange={(e) => setSelectedAmount(Math.max(5, parseInt(e.target.value) || 5))}
                          className="flex-1 bg-transparent text-white text-lg font-bold placeholder-gray-400 focus:outline-none px-2 py-2"
                          placeholder="Custom amount ($5 min)"
                        />
                      </div>
                    </div>

                    {/* Donate Button - Positioned here */}
                    <button 
                      onClick={handlePrepareKofiDonation}
                      disabled={selectedAmount < 5 || isProcessing}
                      className={`w-full py-4 rounded-lg font-bold text-lg tracking-wider border-2 transition-all duration-300 shadow-xl disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white disabled:border-gray-600 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 border-red-500 hover:border-red-400 hover:shadow-red-500/25 hover:scale-105 ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                      {isProcessing ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>Preparing Payment...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
                          <span className="text-xl">☕</span>
                          <span>DONATE ${selectedAmount} via KO-FI</span>
                          <span className="text-xl">→</span>
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className="block text-gray-300 font-semibold mb-3">
                    Personal Message <span className="text-gray-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    value={donationMessage}
                    onChange={(e) => setDonationMessage(e.target.value)}
                    placeholder="Share why you're supporting us, or leave a message for the community..."
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:border-red-500 focus:outline-none transition-colors h-24 resize-none"
                    maxLength={200}
                  />
                  <div className="text-right text-gray-500 text-xs mt-2">
                    {donationMessage.length}/200 characters
                  </div>
                </div>

                {!user && (
                  <div className="text-center p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                    <p className="text-blue-400 font-medium">
                      💡 <Link href="/auth" className="underline hover:text-blue-300">Sign in</Link> to track your donation history, or continue as guest
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Supporters - Mobile-first responsive layout */}
            <div className="bg-gradient-to-b from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 shadow-2xl">
              {/* Mobile Layout: Top supporters full width, recent supporters 1/3 at bottom */}
              <div className="block lg:hidden">
                {/* Top Supporters - Full Width on Mobile */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-4 text-center">🏆 Top Supporters</h3>
                  <div className="space-y-3">
                    {recentDonations.length > 0 ? (
                      (() => {
                        // Group donations by amount to handle ties
                        const sortedDonations = recentDonations
                          .slice()
                          .sort((a, b) => b.amount - a.amount);
                        
                        // Get unique amounts and group supporters by amount
                        const amountGroups: { [key: string]: any[] } = {};
                        sortedDonations.forEach(donation => {
                          const amount = Math.round(donation.amount * 100) / 100;
                          const amountKey = amount.toFixed(2);
                          if (!amountGroups[amountKey]) {
                            amountGroups[amountKey] = [];
                          }
                          amountGroups[amountKey].push({...donation, amount});
                        });
                        
                        // Get the top 3 unique amounts
                        const topAmounts = Object.keys(amountGroups)
                          .map(key => parseFloat(key))
                          .sort((a, b) => b - a)
                          .slice(0, 3);
                        
                        const trophyIcons = ['🥇', '🥈', '🥉'];
                        const trophyColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
                        const nameTextSizes = ['text-xl', 'text-lg', 'text-base']; // Mobile-optimized sizes
                        const amountTextSizes = ['text-lg', 'text-base', 'text-sm']; // Mobile-optimized sizes
                        const paddingSizes = ['p-4', 'p-3', 'p-3']; 
                        const cardThemes = [
                          'bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border-yellow-500/30', // Gold
                          'bg-gradient-to-br from-gray-600/20 to-gray-500/10 border-gray-400/30',       // Silver
                          'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-600/30'    // Bronze
                        ];
                        
                        return topAmounts.map((amount, rankIndex) => {
                          const supporters = amountGroups[amount.toFixed(2)];
                          const isMultiple = supporters.length > 1;
                          
                          if (isMultiple) {
                            return (
                              <div key={`mobile-rank-${rankIndex}`} className={`relative overflow-hidden rounded-lg ${paddingSizes[rankIndex]} ${cardThemes[rankIndex]}`}>
                                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                  <div className="text-9xl">{trophyIcons[rankIndex]}</div>
                                </div>
                                <div className="relative z-10">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="grid grid-cols-1 gap-1">
                                        {supporters.map((supporter, idx) => {
                                          const displayName = supporter.customerName || 'Anonymous Supporter';
                                          return (
                                            <div key={`mobile-supporter-${idx}`} className={`text-white font-bold ${nameTextSizes[rankIndex]} truncate text-left`}>
                                              {displayName}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    <div className={`font-bold ${trophyColors[rankIndex]} ${amountTextSizes[rankIndex]} text-right ml-4`}>
                                      ${amount.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            const supporter = supporters[0];
                            const displayName = supporter.customerName || 'Anonymous Supporter';
                            return (
                              <div key={`mobile-rank-${rankIndex}`} className={`relative overflow-hidden rounded-lg ${paddingSizes[rankIndex]} ${cardThemes[rankIndex]}`}>
                                <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                  <div className="text-9xl">{trophyIcons[rankIndex]}</div>
                                </div>
                                <div className="relative z-10 flex items-center justify-between">
                                  <div className={`text-white font-bold ${nameTextSizes[rankIndex]} truncate text-left`}>
                                    {displayName}
                                  </div>
                                  <div className={`font-bold ${trophyColors[rankIndex]} ${amountTextSizes[rankIndex]} text-right ml-4`}>
                                    ${supporter.amount.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            );
                          }
                        });
                      })()
                    ) : (
                      <div className="text-center py-6">
                        <div className="text-2xl mb-2">🏆</div>
                        <div className="text-gray-500 text-sm">No top supporters yet</div>
                        <div className="text-gray-600 text-xs mt-1">Be the first to support us!</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Supporters - Bottom 1/3 on Mobile with horizontal spread */}
                <div className="border-t border-gray-700/50 pt-4">
                  <h3 className="text-sm font-bold text-white mb-3 text-center">Recent Supporters</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {recentDonations.length > 3 ? (
                      <>
                        {recentDonations.slice(3, 9).map((donation, index) => {
                          const displayName = donation.customerName || 'Anonymous Supporter';
                          const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                          const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500'];
                          const avatarColor = colors[index % colors.length];
                          
                          return (
                            <div key={`mobile-recent-${index}`} className="flex items-center gap-2 p-2 bg-gray-700/30 rounded">
                              <div className={`w-6 h-6 ${avatarColor} rounded-full flex items-center justify-center text-white font-bold text-xs`}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-medium text-xs truncate">{displayName}</div>
                                <div className="text-gray-400 text-xs">
                                  ${donation.amount.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <div className="col-span-2 text-center py-4">
                        <div className="text-lg mb-1">🤗</div>
                        <div className="text-gray-500 text-xs">More supporters coming soon!</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop Layout: Side-by-side 2/3 and 1/3 */}
              <div className="hidden lg:block">
                <div className="grid grid-cols-3 gap-6">
                  {/* Top Supporters - Left Side (2/3 width) */}
                  <div className="col-span-2">
                    <h3 className="text-xl font-bold text-white mb-3 text-center">🏆 Top Supporters</h3>
                    <div className="space-y-2">
                      {recentDonations.length > 0 ? (
                        (() => {
                          // Group donations by amount to handle ties
                          const sortedDonations = recentDonations
                            .slice()
                            .sort((a, b) => b.amount - a.amount);
                          
                          // Get unique amounts and group supporters by amount
                          const amountGroups: { [key: string]: any[] } = {};
                          sortedDonations.forEach(donation => {
                            const amount = Math.round(donation.amount * 100) / 100;
                            const amountKey = amount.toFixed(2);
                            if (!amountGroups[amountKey]) {
                              amountGroups[amountKey] = [];
                            }
                            amountGroups[amountKey].push({...donation, amount});
                          });
                          
                          // Get the top 3 unique amounts
                          const topAmounts = Object.keys(amountGroups)
                            .map(key => parseFloat(key))
                            .sort((a, b) => b - a)
                            .slice(0, 3);
                          
                          const trophyIcons = ['🥇', '🥈', '🥉'];
                          const trophyColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
                          const nameTextSizes = ['text-2xl', 'text-xl', 'text-lg']; // Desktop sizes
                          const amountTextSizes = ['text-xl', 'text-lg', 'text-base']; // Desktop sizes
                          const paddingSizes = ['p-4', 'p-3.5', 'p-3']; 
                          const cardThemes = [
                            'bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border-yellow-500/30', // Gold
                            'bg-gradient-to-br from-gray-600/20 to-gray-500/10 border-gray-400/30',       // Silver
                            'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-600/30'    // Bronze
                          ];
                          
                          return topAmounts.map((amount, rankIndex) => {
                            const supporters = amountGroups[amount.toFixed(2)];
                            const isMultiple = supporters.length > 1;
                            
                            if (isMultiple) {
                              return (
                                <div key={`desktop-rank-${rankIndex}`} className={`relative overflow-hidden rounded-lg ${paddingSizes[rankIndex]} ${cardThemes[rankIndex]}`}>
                                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                    <div className="text-9xl">{trophyIcons[rankIndex]}</div>
                                  </div>
                                  <div className="relative z-10">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <div className="grid grid-cols-1 gap-1">
                                          {supporters.map((supporter, idx) => {
                                            const displayName = supporter.customerName || 'Anonymous Supporter';
                                            return (
                                              <div key={`desktop-supporter-${idx}`} className={`text-white font-bold ${nameTextSizes[rankIndex]} truncate text-left`}>
                                                {displayName}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div className={`font-bold ${trophyColors[rankIndex]} ${amountTextSizes[rankIndex]} text-right ml-4`}>
                                        ${amount.toFixed(2)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            } else {
                              const supporter = supporters[0];
                              const displayName = supporter.customerName || 'Anonymous Supporter';
                              return (
                                <div key={`desktop-rank-${rankIndex}`} className={`relative overflow-hidden rounded-lg ${paddingSizes[rankIndex]} ${cardThemes[rankIndex]}`}>
                                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                                    <div className="text-9xl">{trophyIcons[rankIndex]}</div>
                                  </div>
                                  <div className="relative z-10 flex items-center justify-between">
                                    <div className={`text-white font-bold ${nameTextSizes[rankIndex]} truncate text-left`}>
                                      {displayName}
                                    </div>
                                    <div className={`font-bold ${trophyColors[rankIndex]} ${amountTextSizes[rankIndex]} text-right ml-4`}>
                                      ${supporter.amount.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          });
                        })()
                      ) : (
                        <div className="text-center py-6">
                          <div className="text-2xl mb-2">🏆</div>
                          <div className="text-gray-500 text-sm">No top supporters yet</div>
                          <div className="text-gray-600 text-xs mt-1">Be the first to support us!</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Supporters - Right Side (1/3 width) */}
                  <div className="col-span-1">
                    <h3 className="text-sm font-bold text-white mb-3 text-center">Recent</h3>
                    <div className="space-y-1.5">
                      {recentDonations.length > 3 ? (
                        <>
                          {recentDonations.slice(3, 9).map((donation, index) => {
                            const displayName = donation.customerName || 'Anonymous Supporter';
                            const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
                            const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500'];
                            const avatarColor = colors[index % colors.length];
                            
                            return (
                              <div key={`desktop-recent-${index}`} className="flex items-center gap-1.5 p-1.5 bg-gray-700/30 rounded">
                                <div className={`w-4 h-4 ${avatarColor} rounded-full flex items-center justify-center text-white font-bold text-xs`}>
                                  {initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-white font-medium text-xs truncate">{displayName}</div>
                                  <div className="text-gray-400 text-xs">
                                    ${donation.amount.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-center py-4">
                          <div className="text-lg mb-1">🤗</div>
                          <div className="text-gray-500 text-xs">More supporters coming soon!</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-center mt-4 pt-3 border-t border-gray-700/50">
                <a href="/supporters" className="text-red-400 hover:text-red-300 text-xs underline">
                  View all supporters →
                </a>
              </div>
            </div>

            {/* Ko-fi Secure Payment - Moved here */}
            <div className="bg-gradient-to-b from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-3xl">☕</div>
                <div>
                  <div className="text-lg font-bold text-red-400">Ko-fi Secure Payment</div>
                  <div className="text-gray-300 text-sm">PayPal • Credit Cards • Apple Pay • Google Pay</div>
                </div>
              </div>
              <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg p-3">
                <strong>How it works:</strong> You'll be securely redirected to Ko-fi to complete your payment ($5 minimum). 
                Your donation details will be prepared and sent automatically. After payment, return here to see your contribution!
                <br /><br />
                <Link href="/donate/mobile-help" className="text-blue-400 underline hover:text-blue-300">
                  📱 Mobile payment not working? Get help here →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Payment Confirmation Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6 text-center">Confirm Your Donation</h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between">
                <span className="text-gray-300">Amount:</span>
                <span className="text-white font-bold text-xl">${selectedAmount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Purpose:</span>
                <span className="text-white">{donationPurposes.find(p => p.id === donationPurpose)?.name}</span>
              </div>
              {donationMessage && (
                <div>
                  <span className="text-gray-300">Message:</span>
                  <div className="text-white bg-gray-700/50 rounded p-2 mt-1 text-sm">
                    "{donationMessage}"
                  </div>
                </div>
              )}
            </div>

                         <MobilePaymentInfo className="mb-6" />
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 px-4 bg-gray-600 hover:bg-gray-500 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmKofiDonation}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all duration-300"
              >
                Continue to Ko-fi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 