'use client';

import { useState, useEffect } from 'react';
import supportersCache from '@/lib/supporters-cache.json';

interface Supporter {
  id: string;
  rank: number;
  name: string;
  amount: number;
  currency: string;
  medal: string;
  message: string;
  date: string;
  isHighlighted: boolean;
}

interface RecentSupporter {
  id: string;
  name: string;
  amount: number;
  currency: string;
  message: string;
  date: string;
}

interface SupportersStats {
  totalAmount: number;
  totalSupporters: number;
  thisMonthAmount: number;
  averageDonation: number;
  largestContribution: {
    name: string;
    amount: number;
    message: string;
  };
}

interface UseCachedSupportersReturn {
  topSupporters: Supporter[];
  recentSupporters: RecentSupporter[];
  stats: SupportersStats;
  isUsingCache: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
}

export function useCachedSupporters(
  maxTopSupporters: number = 10,
  maxRecentSupporters: number = 5
): UseCachedSupportersReturn {
  const [topSupporters, setTopSupporters] = useState<Supporter[]>([]);
  const [recentSupporters, setRecentSupporters] = useState<RecentSupporter[]>([]);
  const [stats, setStats] = useState<SupportersStats>(supportersCache.stats);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadCachedData = () => {
    setTopSupporters(supportersCache.topSupporters.slice(0, maxTopSupporters));
    setRecentSupporters(supportersCache.recentSupporters.slice(0, maxRecentSupporters));
    setStats(supportersCache.stats);
    setIsUsingCache(true);
    setIsLoading(false);
  };

  const fetchLiveData = async () => {
    try {
      // Try to fetch from the supporters API
      const supportersResponse = await fetch('/api/supporters');
      
      if (supportersResponse.ok) {
        const supportersData = await supportersResponse.json();
        
        // Convert API data to our format
        if (supportersData.supporters && supportersData.supporters.length > 0) {
          const apiTopSupporters = supportersData.supporters
            .slice(0, maxTopSupporters)
            .map((supporter: any, index: number) => ({
              id: supporter.id || `api-${index}`,
              rank: index + 1,
              name: supporter.customer_name || supporter.name || 'Anonymous',
              amount: typeof supporter.amount_cents === 'number' 
                ? Math.round(supporter.amount_cents / 100) 
                : supporter.amount || 0,
              currency: supporter.currency || 'usd',
              medal: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅',
              message: supporter.donation_message || supporter.message || '',
              date: supporter.created_at || supporter.date || new Date().toISOString(),
              isHighlighted: index < 3
            }));

          setTopSupporters(apiTopSupporters);
          setIsUsingCache(false);
        } else {
          throw new Error('No supporters data from API');
        }
      } else {
        throw new Error(`API returned ${supportersResponse.status}`);
      }

      // Try to fetch recent donations
      const recentResponse = await fetch('/api/recent-donations');
      if (recentResponse.ok) {
        const recentData = await recentResponse.json();
        
        if (recentData.donations && recentData.donations.length > 0) {
          const apiRecentSupporters = recentData.donations
            .slice(0, maxRecentSupporters)
            .map((donation: any, index: number) => ({
              id: `recent-api-${index}`,
              name: donation.customerName || donation.customer_name || 'Anonymous',
              amount: donation.amount || 0,
              currency: donation.currency || 'usd',
              message: donation.message || '',
              date: donation.date || donation.created_at || new Date().toISOString()
            }));

          setRecentSupporters(apiRecentSupporters);
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.warn('Failed to fetch live supporters data, using cache:', error);
      loadCachedData();
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    await fetchLiveData();
  };

  useEffect(() => {
    // Always load cached data first for instant display
    loadCachedData();
    
    // Then try to fetch live data in the background
    fetchLiveData();
  }, [maxTopSupporters, maxRecentSupporters]);

  return {
    topSupporters,
    recentSupporters,
    stats,
    isUsingCache,
    isLoading,
    refreshData
  };
} 