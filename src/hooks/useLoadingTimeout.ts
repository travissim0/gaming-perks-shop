import { useEffect, useRef } from 'react';

interface UseLoadingTimeoutOptions {
  isLoading: boolean;
  timeout?: number; // milliseconds
  onTimeout?: () => void;
  resetOnChange?: boolean;
}

export function useLoadingTimeout({
  isLoading,
  timeout = 15000, // 15 seconds default
  onTimeout,
  resetOnChange = true
}: UseLoadingTimeoutOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => {
    // Update ref to track loading state
    const wasLoading = isLoadingRef.current;
    isLoadingRef.current = isLoading;

    // Clear existing timeout if loading state changes
    if (timeoutRef.current && (resetOnChange || !isLoading)) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Set new timeout if loading starts
    if (isLoading && (!resetOnChange || !wasLoading)) {
      timeoutRef.current = setTimeout(() => {
        if (isLoadingRef.current) {
          console.warn(`Loading timeout reached after ${timeout}ms`);
          onTimeout?.();
        }
      }, timeout);
    }

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, timeout, onTimeout, resetOnChange]);

  // Cleanup function for manual use
  const clearLoadingTimeout = () => {
    if (timeoutRef.current) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  return { clearTimeout: clearLoadingTimeout };
} 