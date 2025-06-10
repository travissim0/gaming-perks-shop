'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

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
  const [loading, setLoading] = useState(false); // Start false for immediate render
  const [error, setError] = useState<string | null>(null);

  // Fast initial auth check
  useEffect(() => {
    let isMounted = true;

    const quickAuthCheck = async () => {
      try {
        // Quick session check with 3-second timeout
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 3000)
        );

        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        
        if (isMounted) {
          if (session?.user) {
            setUser(session.user);
            console.log('✅ Quick auth check: user found');
          } else {
            console.log('ℹ️ Quick auth check: no session');
          }
        }
      } catch (error) {
        console.warn('⚠️ Quick auth check failed:', error);
        // Don't set error - just continue without auth
      }
    };

    // Start quick check immediately (non-blocking)
    quickAuthCheck();

    // Set up auth state listener (background)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        console.log('🔄 Auth state change:', event);
        
        if (session?.user) {
          setUser(session.user);
          setError(null);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      if (data.user) {
        setUser(data.user);
        return { user: data.user, session: data.session };
      }
    } catch (error: any) {
      const message = error.message || 'Failed to sign in';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, inGameAlias: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      // Create profile in background (non-blocking)
      if (data.user) {
        supabase
          .from('profiles')
          .insert([{
            id: data.user.id,
            email: data.user.email,
            in_game_alias: inGameAlias,
          }])
          .then(({ error: profileError }) => {
            if (profileError) {
              console.warn('Profile creation failed (non-blocking):', profileError);
            }
          });
      }

      return data;
    } catch (error: any) {
      const message = error.message || 'Failed to sign up';
      setError(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      setError(null);
    } catch (error: any) {
      console.error('Sign out error:', error);
      // Force local logout even if server signout fails
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const retryAuth = async () => {
    setError(null);
    // Just trigger a quick session check
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    } catch (error) {
      console.warn('Retry auth failed:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signIn,
        signUp,
        signOut,
        retryAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
} 