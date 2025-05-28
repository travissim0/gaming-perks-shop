'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

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

  useEffect(() => {
    // Check active sessions and sets the user
    const getSession = async () => {
      console.log('Getting session...'); // Debug log
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('Session result:', { 
          user: session?.user?.email || 'No user', 
          hasAccessToken: !!session?.access_token,
          error: error?.message 
        }); // Enhanced debug log
        
        setUser(session?.user ?? null);
        
        // If user is logged in, ensure they have a profile
        if (session?.user) {
          await ensureUserProfile(session.user);
        }
      } catch (error) {
        console.error('Error getting session:', error);
        setUser(null);
      }
      
      setLoading(false);
    };
    
    getSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', { 
        event, 
        user: session?.user?.email || 'No user',
        hasAccessToken: !!session?.access_token 
      }); // Enhanced debug log
      
      setUser(session?.user ?? null);
      
      // If user just logged in, ensure they have a profile
      if (session?.user) {
        await ensureUserProfile(session.user);
      }
      
      setLoading(false);
    });

    return () => {
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

      // If no profile exists, create one
      if (!profile && !error) {
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
          console.error('Error creating profile:', insertError);
        }
      }
    } catch (error) {
      console.error('Error checking/creating profile:', error);
    }
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
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
    await supabase.auth.signOut();
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