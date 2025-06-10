import React, { useState, useEffect, ReactNode } from 'react';

interface ProgressiveSectionProps {
  children: ReactNode;
  fallback: ReactNode;
  delay?: number;
  priority?: 'high' | 'medium' | 'low';
  name?: string;
}

export function ProgressiveSection({ 
  children, 
  fallback, 
  delay = 0, 
  priority = 'medium',
  name = 'section'
}: ProgressiveSectionProps) {
  const [shouldLoad, setShouldLoad] = useState(delay === 0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (delay === 0) {
      setIsLoading(false);
      return;
    }

    // Stagger loading based on priority
    const priorityDelays = {
      high: delay,
      medium: delay + 500,
      low: delay + 1000
    };

    const timer = setTimeout(() => {
      console.log(`🔄 Loading ${name} (${priority} priority)`);
      setShouldLoad(true);
      
      // Simulate brief loading state
      setTimeout(() => {
        setIsLoading(false);
        console.log(`✅ ${name} loaded`);
      }, 100);
    }, priorityDelays[priority]);

    return () => clearTimeout(timer);
  }, [delay, priority, name]);

  if (!shouldLoad || isLoading) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Hook for progressive data loading
export function useProgressiveData<T>(
  fetchFunction: () => Promise<T>,
  initialData: T,
  delay = 0,
  name = 'data'
) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);
        console.log(`🔄 Fetching ${name}...`);
        
        const result = await fetchFunction();
        setData(result);
        console.log(`✅ ${name} fetched successfully`);
      } catch (err) {
        console.error(`❌ Error fetching ${name}:`, err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [fetchFunction, delay, name]);

  return { data, loading, error };
} 