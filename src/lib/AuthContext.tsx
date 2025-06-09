'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { User, AuthError } from '@supabase/supabase-js';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { withTimeout } from '@/utils/dataFetching';
import { toast } from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, inGameAlias: string) => Promise<any>;
  signOut: () => Promise<void>;
  retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authAttempts, setAuthAttempts] = useState(0);
  const [lastAuthCheck, setLastAuthCheck] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'fast' | 'slow' | 'unknown'>('unknown');

  // Detect mobile and connection quality
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Detect mobile
      const checkMobile = () => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      };
      setIsMobile(checkMobile());

      // Check connection quality
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (connection) {
        const updateConnectionQuality = () => {
          const effectiveType = connection.effectiveType;
          if (effectiveType === '4g' || effectiveType === '3g') {
            setConnectionQuality('fast');
          } else {
            setConnectionQuality('slow');
          }
        };
        
        updateConnectionQuality();
        connection.addEventListener('change', updateConnectionQuality);
        
        return () => {
          connection.removeEventListener('change', updateConnectionQuality);
        };
      }
    }
  }, []);

  // Dynamic timeout based on device and connection - Balanced for performance
  const getAuthTimeout = () => {
    if (connectionQuality === 'slow' || isMobile) {
      return 60000; // 60 seconds for slow connections or mobile (was 1 hour)
    }
    return 30000; // 30 seconds for fast connections (was 30 minutes)
  };

  // Use our loading timeout hook with auth-specific handling - extended for mobile
  useLoadingTimeout({
    isLoading: loading,
    timeout: getAuthTimeout(),
          onTimeout: () => {
        console.error('⏰ Authentication timeout - forcing completion');
        const message = isMobile ? 
          'Authentication timed out (after 60 seconds). Please check your connection and try again.' :
          'Authentication check timed out (after 30 seconds). This might be due to a slow connection.';
        setError(message);
        setLoading(false);
        toast.error(message);
      }
  });

  // Clear session and redirect to login
  const clearSessionAndRedirect = async (reason?: string) => {
    console.log('🚨 Clearing invalid session and redirecting to login:', reason);
    
    try {
      // Clear Supabase session with timeout
      await withTimeout(
        supabase.auth.signOut(),
        30000, // 30 seconds timeout for session cleanup
        'Session signout timeout'
      );
    } catch (signOutError) {
      console.warn('Warning: signOut failed:', signOutError);
      // Continue with cleanup even if signOut fails
    }
    
    try {
      // Clear any local storage items
      if (typeof window !== 'undefined') {
        // Clear all Supabase auth tokens
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }
      
      setUser(null);
      setLoading(false);
      setError(reason || 'Session expired');
      
      // Only redirect if we're not already on auth pages
      if (typeof window !== 'undefined' && 
          !window.location.pathname.includes('/auth/') && 
          window.location.pathname !== '/') {
        
        // Add a small delay to show the error message
        setTimeout(() => {
          window.location.href = '/auth/login';
        }, 1500);
      }
    } catch (error) {
      console.error('Error clearing session:', error);
      setUser(null);
      setLoading(false);
      setError('Failed to clear session properly');
    }
  };

  // Check if error is related to invalid/expired tokens
  const isAuthTokenError = (error: any): boolean => {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    
    return (
      errorMessage.includes('refresh token not found') ||
      errorMessage.includes('invalid refresh token') ||
      errorMessage.includes('refresh_token_not_found') ||
      errorMessage.includes('invalid_grant') ||
      errorMessage.includes('token_expired') ||
      errorMessage.includes('jwt expired') ||
      errorMessage.includes('invalid jwt') ||
      errorMessage.includes('unauthorized') ||
      errorCode === 'invalid_grant' ||
      errorCode === 'refresh_token_not_found' ||
      errorCode === 'token_expired'
    );
  };

  // Check if we should skip auth check (recently checked and failed)
  const shouldSkipAuthCheck = (): boolean => {
    const now = Date.now();
    const timeSinceLastCheck = now - lastAuthCheck;
    const cooldownPeriod = authAttempts > 2 ? 10000 : 5000; // 10s after multiple failures, 5s otherwise
    
    return timeSinceLastCheck < cooldownPeriod && authAttempts > 0;
  };

  // Clear corrupted session data
  const clearCorruptedSession = async (): Promise<void> => {
    console.log('🧹 Clearing potentially corrupted session data...');
    
    try {
      // Clear Supabase auth state
      await supabase.auth.signOut({ scope: 'local' });
      
      // Clear localStorage items
      if (typeof window !== 'undefined') {
        const keysToRemove = Object.keys(localStorage).filter(key => 
          key.includes('supabase') || 
          key.includes('auth-token') ||
          key.includes('sb-')
        );
        
        keysToRemove.forEach(key => {
          try {
            localStorage.removeItem(key);
            console.log(`🗑️ Removed localStorage key: ${key}`);
          } catch (error) {
            console.warn(`⚠️ Failed to remove localStorage key ${key}:`, error);
          }
        });
        
        // Clear sessionStorage as well
        const sessionKeysToRemove = Object.keys(sessionStorage).filter(key => 
          key.includes('supabase') || 
          key.includes('auth-token') ||
          key.includes('sb-')
        );
        
        sessionKeysToRemove.forEach(key => {
          try {
            sessionStorage.removeItem(key);
            console.log(`🗑️ Removed sessionStorage key: ${key}`);
          } catch (error) {
            console.warn(`⚠️ Failed to remove sessionStorage key ${key}:`, error);
          }
        });
      }
      
      // Reset auth state
      setUser(null);
      setError(null);
      setAuthAttempts(0);
      setLastAuthCheck(0);
      
      console.log('✅ Session cleanup completed');
    } catch (error) {
      console.error('❌ Error during session cleanup:', error);
    }
  };

  // Robust session getter with retry logic
  const getSessionRobust = async (attempt: number = 1): Promise<void> => {
    const maxAttempts = 3;
    console.log(`🔐 Getting session (attempt ${attempt}/${maxAttempts})...`);
    
    try {
      // Use timeout wrapper for session check - extended to 30-60 minutes
      const sessionTimeout = isMobile || connectionQuality === 'slow' ? 3600000 : 1800000; // 1 hour or 30 minutes
      const sessionResult = await withTimeout(
        supabase.auth.getSession(),
        sessionTimeout, // Dynamic timeout based on device and connection
        'Session check timeout'
      );

      const { data: { session }, error } = sessionResult;

      if (error) {
        console.error('❌ Session error:', error);
        
        // Handle refresh token errors specifically
        if (isAuthTokenError(error)) {
          console.log('🚨 Detected invalid/expired token, clearing session');
          await clearSessionAndRedirect('Session expired or invalid');
          return;
        }
        
        throw error;
      }
      
      console.log('✅ Session result:', { 
        user: session?.user?.email || 'No user', 
        hasAccessToken: !!session?.access_token,
        hasRefreshToken: !!session?.refresh_token,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'No expiry'
      });
      
      setUser(session?.user ?? null);
      setError(null);
      setAuthAttempts(0); // Reset attempts on success
      
      // If user is logged in, ensure they have a profile
      if (session?.user) {
        await ensureUserProfileRobust(session.user);
      }
      
    } catch (error: any) {
      console.error(`❌ Error getting session (attempt ${attempt}):`, error);
      
      // Handle auth errors
      if (isAuthTokenError(error)) {
        await clearSessionAndRedirect('Authentication failed');
        return;
      }
      
      // Retry logic for non-auth errors
      if (attempt < maxAttempts && !error.message?.includes('timeout')) {
        console.log(`🔄 Retrying session check in 2s... (attempt ${attempt + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getSessionRobust(attempt + 1);
      }
      
      // Final failure
      console.error('❌ All session check attempts failed');
      setUser(null);
      setError(`Authentication failed: ${error.message}`);
      setAuthAttempts(prev => prev + 1);
    }
  };

  // Robust profile creation/checking
  const ensureUserProfileRobust = async (user: User, attempt: number = 1): Promise<void> => {
    const maxAttempts = 2;
    
    try {
      console.log(`📋 Checking user profile (attempt ${attempt}/${maxAttempts})...`);
      
      // Create a timeout race for the profile check with longer timeout
      const profileCheckPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile check timeout')), 1800000) // 30 minutes for profile check
      );
      
      const profileResult = await Promise.race([profileCheckPromise, timeoutPromise]) as any;
      const { data: profile, error } = profileResult;

      if (error) {
        console.error('❌ Error checking profile:', error);
        
        // If it's an auth error, don't try to create profile
        if (isAuthTokenError(error)) {
          throw error;
        }
        
        // Retry for non-auth errors
        if (attempt < maxAttempts) {
          console.log(`🔄 Retrying profile check... (attempt ${attempt + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay
          return ensureUserProfileRobust(user, attempt + 1);
        }
        
        console.warn('⚠️ Profile check failed, continuing without profile creation');
        return;
      }

      // If no profile exists, create one
      if (!profile) {
        console.log('📝 Creating user profile...');
        
        // Create a timeout race for the profile creation with longer timeout
        const insertPromise = supabase
          .from('profiles')
          .insert([
            {
              id: user.id,
              email: user.email || '',
              in_game_alias: user.user_metadata?.inGameAlias || '',
            },
          ]);
        
        const insertTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile creation timeout')), 1800000) // 30 minutes for profile creation
        );
        
        const insertResult = await Promise.race([insertPromise, insertTimeoutPromise]) as any;
        const { error: insertError } = insertResult;

        if (insertError) {
          console.error('❌ Error creating profile:', insertError);
          
          // If it's an auth error, propagate it
          if (isAuthTokenError(insertError)) {
            throw insertError;
          }
          
          console.warn('⚠️ Profile creation failed, continuing anyway');
        } else {
          console.log('✅ Profile created successfully');
        }
      } else {
        console.log('✅ Profile exists');
      }
    } catch (error: any) {
      console.error('❌ Error in profile management:', error);
      
      // Only throw auth errors for critical failures, log timeouts as warnings
      if (isAuthTokenError(error)) {
        throw error;
      }
      
      // Don't throw timeout errors, just log them
      if (error.message?.includes('timeout')) {
        console.warn('⚠️ Profile operation timed out, continuing with authentication');
        return;
      }
      
      console.warn('⚠️ Profile management failed, continuing with authentication');
    }
  };

  // Manual retry function for users
  const retryAuth = async () => {
    console.log('🔄 Manual auth retry requested');
    setLoading(true);
    setError(null);
    
    // If we've had multiple failures, clear session data first
    if (authAttempts >= 2) {
      console.log('🧹 Clearing session data before retry due to multiple failures');
      await clearCorruptedSession();
    } else {
      setAuthAttempts(0);
      setLastAuthCheck(0);
      
      try {
        await getSessionRobust();
      } finally {
        setLoading(false);
        setLastAuthCheck(Date.now());
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    // Properly type the subscription - Supabase auth returns { data: { subscription: ... } }
    let authSubscription: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    const initializeAuth = async () => {
      if (!mounted) return;
      
      if (shouldSkipAuthCheck()) {
        console.log('⏭️ Skipping auth check - too recent');
        setLoading(false);
        return;
      }

      // Check for session corruption indicators before proceeding
      if (authAttempts >= 3) {
        console.log('🚨 Multiple auth failures detected - clearing potentially corrupted session');
        await clearCorruptedSession();
        setLoading(false);
        return;
      }
      
      try {
        console.log('🔍 Getting initial session...');
        
        const sessionPromise = withTimeout(
          supabase.auth.getSession(),
          getAuthTimeout(), // Use dynamic timeout based on device
          'Session check timeout'
        );

        const { data: { session }, error: sessionError } = await sessionPromise;

        if (!mounted) return;

        if (sessionError) {
          console.error('❌ Session error:', sessionError);
          
          if (isAuthTokenError(sessionError)) {
            await clearSessionAndRedirect('Session validation failed');
            return;
          }
          
          throw sessionError;
        }

        console.log('📋 Initial session:', { 
          hasSession: !!session,
          user: session?.user?.email || 'No user',
          hasAccessToken: !!session?.access_token,
          hasRefreshToken: !!session?.refresh_token
        });

        setUser(session?.user ?? null);
        setLastAuthCheck(Date.now());

        // If there's a user, ensure they have a profile
        if (session?.user) {
          console.log('👤 Ensuring user profile...');
          try {
            await ensureUserProfileRobust(session.user);
          } catch (profileError: any) {
            console.error('❌ Profile error:', profileError);
            
            if (isAuthTokenError(profileError)) {
              await clearSessionAndRedirect('Profile verification failed');
              return;
            }
            
            // Don't fail auth completely for profile issues
            console.warn('⚠️ Profile creation/update failed but continuing with auth');
          }
        }

        console.log('✅ Auth initialization complete');
        setError(null);
        setAuthAttempts(0);

      } catch (error: any) {
        console.error('❌ Auth initialization error:', error);
        
        if (!mounted) return;

        if (error.message?.includes('timeout')) {
          setError('Authentication check timed out. Please try again.');
          if (authAttempts < 2) {
            console.log('🔄 Retrying auth due to timeout...');
            setAuthAttempts(prev => prev + 1);
            // Schedule a retry without changing dependencies to avoid infinite loop
            setTimeout(() => {
              if (mounted) {
                console.log('🔄 Executing scheduled auth retry...');
                initializeAuth();
              }
            }, 2000); // 2-second delay before retry
            return;
          }
        } else if (isAuthTokenError(error)) {
          await clearSessionAndRedirect('Authentication failed');
          return;
        } else {
          setError(error.message || 'Authentication error occurred');
        }
        
        setUser(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Initialize auth
    initializeAuth();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const authListenerResult = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log('🔄 Auth state changed:', { 
        event, 
        user: session?.user?.email || 'No user',
        hasAccessToken: !!session?.access_token,
        hasRefreshToken: !!session?.refresh_token
      });
      
      // Handle specific auth events
      if (event === 'TOKEN_REFRESHED') {
        console.log('✅ Token refreshed successfully');
        setError(null);
        setAuthAttempts(0);
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        setUser(null);
        setError(null);
        setLoading(false);
        return;
      } else if (event === 'SIGNED_IN') {
        console.log('👋 User signed in');
        setError(null);
        setAuthAttempts(0);
      }
      
      setUser(session?.user ?? null);
      
      // If user just logged in, ensure they have a profile
      if (session?.user) {
        try {
          await ensureUserProfileRobust(session.user);
        } catch (error: any) {
          console.error('❌ Error ensuring user profile:', error);
          
          // If profile creation fails due to auth issues, handle it
          if (isAuthTokenError(error)) {
            await clearSessionAndRedirect('Profile setup failed');
            return;
          }
        }
      }
      
      if (mounted) {
        setLoading(false);
      }
    });

    // Store the subscription properly - Supabase returns { data: { subscription } }
    authSubscription = authListenerResult;

    return () => {
      mounted = false;
      // Properly handle subscription cleanup with error handling
      try {
        if (authSubscription?.data?.subscription?.unsubscribe) {
          console.log('🧹 Cleaning up auth subscription...');
          authSubscription.data.subscription.unsubscribe();
        }
      } catch (error) {
        console.warn('⚠️ Error during auth subscription cleanup:', error);
        // Don't throw - just log the warning
      }
    };
  }, []); // Remove authAttempts dependency to prevent infinite loop

  // Enhanced sign in with timeout and retry - mobile optimized
  const signIn = async (email: string, password: string) => {
    try {
      console.log('🔑 Attempting sign in...');
      
      // Use balanced timeout for mobile/slow connections
      const signInTimeout = getAuthTimeout();
      
      const result = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        signInTimeout,
        'Sign in timeout'
      );
      
      if (result.error && isAuthTokenError(result.error)) {
        console.log('🚨 Auth error during sign in, clearing any existing session');
        await clearSessionAndRedirect('Sign in failed');
      }
      
      if (result.error) {
        console.error('❌ Sign in error:', result.error);
        
        // Enhanced mobile error messaging
        if (result.error.message?.includes('timeout') && isMobile) {
          result.error.message = 'Sign in timed out (after 60 seconds). Please check your connection and try again.';
        }
      } else {
        console.log('✅ Sign in successful');
        setError(null);
        setAuthAttempts(0);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Sign in error:', error);
      
      if (isAuthTokenError(error)) {
        await clearSessionAndRedirect('Sign in authentication error');
      }
      
      // Enhanced mobile error handling
      if (error.message?.includes('timeout') && isMobile) {
        error.message = 'Sign in timed out (after 60 seconds). Please ensure you have a stable internet connection and try again.';
      }
      
      throw error;
    }
  };

  // Enhanced sign up with timeout
  const signUp = async (email: string, password: string, inGameAlias: string) => {
    try {
      console.log('📝 Attempting sign up...');
      
      const result = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              inGameAlias,
            },
          },
        }),
        getAuthTimeout(), // Use dynamic timeout
        'Sign up timeout'
      );

      if (result.error) {
        console.error('❌ Sign up error:', result.error);
      } else {
        console.log('✅ Sign up successful');
      }

      return result;
    } catch (error: any) {
      console.error('❌ Sign up error:', error);
      throw error;
    }
  };

  // Enhanced sign out with timeout
  const signOut = async () => {
    try {
      console.log('👋 Signing out...');
      
      await withTimeout(
        supabase.auth.signOut(),
        30000, // 30 seconds timeout for sign out
        'Sign out timeout'
      );
      
      // Clear any remaining local storage
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }
      
      setUser(null);
      setError(null);
      setAuthAttempts(0);
      console.log('✅ Sign out successful');
    } catch (error) {
      console.error('❌ Error during sign out:', error);
      // Even if sign out fails, clear local state
      setUser(null);
      setError(null);
      toast.error('Sign out may not have completed properly. Please clear your browser cache if you experience issues.');
    }
  };

  const value = {
    user,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    retryAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
} 