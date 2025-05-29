'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { User, AuthError } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, inGameAlias: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Clear session and redirect to login
  const clearSessionAndRedirect = async () => {
    console.log('🚨 Clearing invalid session and redirecting to login');
    
    try {
      // Clear Supabase session
      await supabase.auth.signOut();
      
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
      
      // Only redirect if we're not already on auth pages
      if (typeof window !== 'undefined' && 
          !window.location.pathname.includes('/auth/') && 
          window.location.pathname !== '/') {
        window.location.href = '/auth/login';
      }
    } catch (error) {
      console.error('Error clearing session:', error);
      setUser(null);
      setLoading(false);
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
      errorCode === 'invalid_grant' ||
      errorCode === 'refresh_token_not_found'
    );
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    // Set a maximum loading time of 10 seconds
    const loadingTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.log('⏰ Auth loading timeout reached, clearing session');
        clearSessionAndRedirect();
      }
    }, 10000);

    // Check active sessions and sets the user
    const getSession = async () => {
      console.log('🔐 Getting session...'); // Debug log
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (error) {
          console.error('❌ Session error:', error);
          
          // Handle refresh token errors specifically
          if (isAuthTokenError(error)) {
            console.log('🚨 Detected invalid/expired refresh token, clearing session');
            await clearSessionAndRedirect();
            return;
          }
          
          // For other errors, still clear the session but don't redirect
          setUser(null);
          setLoading(false);
          return;
        }
        
        console.log('✅ Session result:', { 
          user: session?.user?.email || 'No user', 
          hasAccessToken: !!session?.access_token,
          hasRefreshToken: !!session?.refresh_token,
          expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'No expiry'
        }); // Enhanced debug log
        
        setUser(session?.user ?? null);
        
        // If user is logged in, ensure they have a profile
        if (session?.user) {
          await ensureUserProfile(session.user);
        }
      } catch (error: any) {
        console.error('❌ Error getting session:', error);
        
        if (!mounted) return;

        // Handle refresh token errors
        if (isAuthTokenError(error)) {
          await clearSessionAndRedirect();
          return;
        }
        
        setUser(null);
      }
      
      if (mounted) {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    };
    
    getSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log('🔄 Auth state changed:', { 
        event, 
        user: session?.user?.email || 'No user',
        hasAccessToken: !!session?.access_token,
        hasRefreshToken: !!session?.refresh_token
      }); // Enhanced debug log
      
      // Handle specific auth events
      if (event === 'TOKEN_REFRESHED') {
        console.log('✅ Token refreshed successfully');
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        setUser(null);
        setLoading(false);
        return;
      }
      
      setUser(session?.user ?? null);
      
      // If user just logged in, ensure they have a profile
      if (session?.user) {
        try {
          await ensureUserProfile(session.user);
        } catch (error: any) {
          console.error('❌ Error ensuring user profile:', error);
          
          // If profile creation fails due to auth issues, handle it
          if (isAuthTokenError(error)) {
            await clearSessionAndRedirect();
            return;
          }
        }
      }
      
      if (mounted) {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // Ensure user has a profile, create one if they don't
  const ensureUserProfile = async (user: User) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('❌ Error checking profile:', error);
        
        // If it's an auth error, don't try to create profile
        if (isAuthTokenError(error)) {
          throw error;
        }
        
        return;
      }

      // If no profile exists, create one
      if (!profile) {
        console.log('📝 Creating user profile...');
        const { error: insertError } = await supabase
          .from('profiles')
          .insert([
            {
              id: user.id,
              email: user.email || '',
              in_game_alias: user.user_metadata?.inGameAlias || '',
            },
          ]);

        if (insertError) {
          console.error('❌ Error creating profile:', insertError);
          
          // If it's an auth error, propagate it
          if (isAuthTokenError(insertError)) {
            throw insertError;
          }
        } else {
          console.log('✅ Profile created successfully');
        }
      }
    } catch (error: any) {
      console.error('❌ Error checking/creating profile:', error);
      throw error; // Re-throw to be handled by caller
    }
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      
      if (result.error && isAuthTokenError(result.error)) {
        console.log('🚨 Auth error during sign in, clearing any existing session');
        await clearSessionAndRedirect();
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Sign in error:', error);
      
      if (isAuthTokenError(error)) {
        await clearSessionAndRedirect();
      }
      
      throw error;
    }
  };

  // Sign up with email and password
  const signUp = async (email: string, password: string, inGameAlias: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          inGameAlias,
        },
      },
    });

    // Profile will be created on first login, not here
    return { data, error };
  };

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      
      // Clear any remaining local storage
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).forEach(key => {
          if (key.includes('auth-token') || key.includes('supabase')) {
            localStorage.removeItem(key);
          }
        });
      }
      
      setUser(null);
    } catch (error) {
      console.error('❌ Error during sign out:', error);
      // Even if sign out fails, clear local state
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
} 