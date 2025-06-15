'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import supportersCache from '@/lib/supporters-cache.json';

export type DonationMode = 'auto' | 'database' | 'cache';

interface DonationData {
  id: string;
  amount: number;
  currency: string;
  customerName: string;
  message?: string;
  date: string;
  paymentMethod?: string;
}

interface UseDonationModeReturn {
  donations: DonationData[];
  mode: DonationMode;
  isLoading: boolean;
  error: string | null;
  isUsingCache: boolean;
  refreshData: () => Promise<void>;
  setMode: (mode: DonationMode) => void;
}

export function useDonationMode(
  endpoint: 'recent-donations' | 'supporters' = 'recent-donations',
  maxItems: number = 10
): UseDonationModeReturn {
  const [donations, setDonations] = useState<DonationData[]>([]);
  const [mode, setModeState] = useState<DonationMode>('auto');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUsingCache, setIsUsingCache] = useState(false);
  
  // Prevent infinite loops
  const loadingRef = useRef(false);
  const lastFetchRef = useRef<number>(0);

  const loadCachedData = useCallback(() => {
    try {
      const cachedDonations = supportersCache.recentSupporters.slice(0, maxItems).map(supporter => ({
        id: supporter.id,
        amount: supporter.amount,
        currency: supporter.currency,
        customerName: supporter.name,
        message: supporter.message,
        date: supporter.date,
        paymentMethod: 'kofi'
      }));
      
      setDonations(cachedDonations);
      setIsUsingCache(true);
      setError(null);
    } catch (cacheError) {
      console.error('Error loading cached data:', cacheError);
      setDonations([]);
      setError('Failed to load cached data');
    }
  }, [maxItems]);

  const loadDatabaseData = useCallback(async (forceFallback = false) => {
    // Prevent concurrent requests
    if (loadingRef.current) {
      console.log('Request already in progress, skipping...');
      return;
    }

    // Rate limiting - don't fetch more than once per 5 seconds
    const now = Date.now();
    if (now - lastFetchRef.current < 5000) {
      console.log('Rate limited, skipping database fetch');
      return;
    }

    try {
      loadingRef.current = true;
      lastFetchRef.current = now;
      setIsLoading(true);
      setError(null);

      if (forceFallback) {
        throw new Error('Forced fallback to cache');
      }

      console.log(`Fetching from /api/${endpoint}`);
      
      const response = await fetch(`/api/${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add cache control to prevent browser caching issues
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      let formattedDonations: DonationData[] = [];
      
      if (endpoint === 'recent-donations') {
        if (data.donations && data.donations.length > 0) {
          formattedDonations = data.donations.slice(0, maxItems).map((donation: any, index: number) => ({
            id: donation.id || `db-${index}-${Date.now()}`,
            amount: donation.amount || 0,
            currency: donation.currency || 'usd',
            customerName: donation.customerName || donation.customer_name || 'Anonymous',
            message: donation.message || donation.donation_message || '',
            date: donation.date || donation.created_at || new Date().toISOString(),
            paymentMethod: donation.paymentMethod || donation.payment_method || 'unknown'
          }));
        }
      } else if (endpoint === 'supporters') {
        if (data.supporters && data.supporters.length > 0) {
          formattedDonations = data.supporters.slice(0, maxItems).map((supporter: any, index: number) => ({
            id: supporter.id || `supporter-${index}-${Date.now()}`,
            amount: supporter.amount || 0,
            currency: supporter.currency || 'usd',
            customerName: supporter.customer_name || supporter.name || 'Anonymous',
            message: supporter.message || supporter.donation_message || '',
            date: supporter.created_at || supporter.date || new Date().toISOString(),
            paymentMethod: supporter.payment_method || 'unknown'
          }));
        }
      }

      if (formattedDonations.length === 0) {
        console.log('No donations found in database, using cache');
        loadCachedData();
        return;
      }

      console.log(`Successfully loaded ${formattedDonations.length} donations from database`);
      setDonations(formattedDonations);
      setIsUsingCache(false);
      
    } catch (dbError) {
      console.warn(`Failed to fetch from ${endpoint}:`, dbError);
      
      if (mode === 'database') {
        setError(`Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        setDonations([]);
      } else {
        // Fallback to cache for 'auto' mode
        console.log('Falling back to cached data');
        loadCachedData();
      }
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [endpoint, maxItems, mode, loadCachedData]);

  const refreshData = useCallback(async () => {
    switch (mode) {
      case 'cache':
        loadCachedData();
        setIsLoading(false);
        break;
      case 'database':
        await loadDatabaseData();
        break;
      case 'auto':
      default:
        await loadDatabaseData();
        break;
    }
  }, [mode, loadCachedData, loadDatabaseData]);

  const setMode = useCallback((newMode: DonationMode) => {
    if (newMode === mode) return; // Prevent unnecessary updates
    
    console.log(`Switching donation mode from ${mode} to ${newMode}`);
    setModeState(newMode);
  }, [mode]);

  // Reset rate limiting when endpoint changes
  useEffect(() => {
    lastFetchRef.current = 0; // Reset rate limiting when endpoint changes
  }, [endpoint]);

  // Initial load with proper dependency array
  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      if (!mounted) return;
      
      try {
        await refreshData();
      } catch (error) {
        console.error('Error in initial data load:', error);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [mode, endpoint]); // Depend on both mode and endpoint to refresh when either changes

  return {
    donations,
    mode,
    isLoading,
    error,
    isUsingCache,
    refreshData,
    setMode
  };
} 