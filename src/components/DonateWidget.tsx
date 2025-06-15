'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useDonationMode } from '@/hooks/useDonationMode';
import supportersCache from '@/lib/supporters-cache.json';

interface DonateWidgetProps {
  className?: string;
  showRecentSupporters?: boolean;
  maxRecentSupporters?: number;
}

export default function DonateWidget({ 
  className = "",
  showRecentSupporters = true,
  maxRecentSupporters = 3
}: DonateWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { donations: recentSupporters, isUsingCache } = useDonationMode(
    'recent-donations',
    maxRecentSupporters
  );

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  };

  return (
    <div className={`bg-gradient-to-b from-gray-900/90 to-black/90 backdrop-blur-sm border border-blue-500/30 rounded-xl shadow-2xl overflow-hidden relative ${className}`}>
      {/* Starfield Background Effect */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-4 left-8 w-1 h-1 bg-blue-300 rounded-full animate-pulse"></div>
        <div className="absolute top-12 right-12 w-0.5 h-0.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        <div className="absolute top-20 left-20 w-0.5 h-0.5 bg-cyan-300 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-32 right-6 w-1 h-1 bg-indigo-300 rounded-full animate-pulse" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-44 left-12 w-0.5 h-0.5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-20 right-16 w-0.5 h-0.5 bg-purple-300 rounded-full animate-pulse" style={{ animationDelay: '2.5s' }}></div>
      </div>

      {/* Header with Call to Action */}
      <div className="bg-gradient-to-r from-blue-600/90 to-purple-600/90 text-white relative overflow-hidden">
        {/* Cosmic background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="text-9xl flex items-center justify-center h-full">🚀</div>
        </div>
        
        <div className="relative z-10 p-6 text-center">
          <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg">
            <span className="text-2xl">🌌</span>
          </div>
          <h3 className="text-xl font-bold mb-2 tracking-wider">SUPPORT OUR MISSION</h3>
          <p className="text-blue-100 text-sm mb-4">
            Help keep our cosmic community thriving!
          </p>
          
          {/* Stats */}
          <div className="bg-black/30 backdrop-blur-sm rounded-lg p-3 mb-4 border border-white/20">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold text-cyan-300">
                  {formatAmount(supportersCache.stats.totalAmount, 'usd')}
                </div>
                <div className="text-xs text-blue-100">Total Raised</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-300">
                  {supportersCache.stats.totalSupporters}
                </div>
                <div className="text-xs text-blue-100">Space Pilots</div>
              </div>
            </div>
          </div>

          {/* Donate Button */}
          <Link 
            href="/donate"
            className="inline-block w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:from-cyan-400 hover:to-blue-400 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <div className="flex items-center justify-center space-x-2">
              <span>🌟</span>
              <span>LAUNCH SUPPORT</span>
              <span>🚀</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Supporters Section */}
      {showRecentSupporters && recentSupporters.length > 0 && (
        <div className="p-4 bg-gradient-to-b from-gray-900/50 to-black/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-cyan-300 text-sm flex items-center gap-2">
              <span>🌟</span>
              Recent Space Pilots
            </h4>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {isExpanded ? 'Show Less' : 'Show All'}
            </button>
          </div>

          <div className="space-y-2">
            {recentSupporters
              .slice(0, isExpanded ? recentSupporters.length : 2)
              .map((supporter) => (
                <div 
                  key={supporter.id}
                  className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-800/50 to-gray-900/50 rounded-lg border border-gray-700/50 backdrop-blur-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">🌟</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-cyan-300 truncate">
                          {supporter.customerName}
                        </p>
                        {supporter.message && (
                          <p className="text-xs text-gray-400 truncate">
                            "{supporter.message}"
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          {formatTimeAgo(supporter.date)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right ml-2">
                    <div className="text-sm font-bold text-purple-400">
                      {formatAmount(supporter.amount, supporter.currency)}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* View All Link */}
          <div className="mt-4 text-center">
            <Link 
              href="/supporters"
              className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              View All Space Pilots →
            </Link>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="px-4 pb-4 bg-gradient-to-b from-gray-900/50 to-black/50">
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/perks"
            className="text-center py-2 px-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-blue-300 rounded-lg text-xs font-medium hover:from-blue-600/30 hover:to-purple-600/30 transition-all duration-300 border border-blue-500/30"
          >
            🎁 Perks
          </Link>
          <Link
            href="/supporters"
            className="text-center py-2 px-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-300 rounded-lg text-xs font-medium hover:from-purple-600/30 hover:to-pink-600/30 transition-all duration-300 border border-purple-500/30"
          >
            🏆 Leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
} 