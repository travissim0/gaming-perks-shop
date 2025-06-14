'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
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
  const [loading, setLoading] = useState(false); // Start false for immediate render
  const [error, setError] = useState<string | null>(null);

  // Fast, reliable auth check with short timeouts
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const quickAuthCheck = async () => {
      try {
        console.log('🔍 Quick auth check starting...');
        
        // Fast session check with 5-second timeout (much shorter than before)
        const sessionPromise = supabase.auth.getSession();
        timeoutId = setTimeout(() => {
          console.warn('⚠️ Auth check taking longer than expected, continuing without session');
        }, 5000);

        const { data: { session }, error } = await sessionPromise;
        clearTimeout(timeoutId);
        
        if (!isMounted) return;

        if (error) {
          console.warn('⚠️ Session error (non-blocking):', error.message);
          // Don't show error toast for session issues - just continue
          return;
        }

        if (session?.user) {
          setUser(session.user);
          console.log('✅ User session found:', session.user.email);
          
          // Background profile update (non-blocking)
          updateUserActivity(session.user).catch(err => 
            console.warn('Profile update failed (non-blocking):', err)
          );
        } else {
          console.log('ℹ️ No active session');
        }
      } catch (error: any) {
        console.warn('⚠️ Auth check failed (non-blocking):', error.message);
        // Don't show error toasts for auth checks - they're often due to network issues
      }
    };

    // Start quick check immediately (non-blocking)
    quickAuthCheck();

    // Set up auth state listener for real-time updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        console.log('🔄 Auth state change:', event);
        
        switch (event) {
          case 'SIGNED_IN':
            if (session?.user) {
              setUser(session.user);
              setError(null);
              console.log('✅ User signed in:', session.user.email);
              
              // Background profile update
              updateUserActivity(session.user).catch(err => 
                console.warn('Profile update failed:', err)
              );
            }
            break;
            
          case 'SIGNED_OUT':
            setUser(null);
            setError(null);
            console.log('👋 User signed out');
            break;
            
          case 'TOKEN_REFRESHED':
            if (session?.user) {
              setUser(session.user);
              setError(null);
              console.log('🔄 Token refreshed for:', session.user.email);
            }
            break;
            
          default:
            if (session?.user) {
              setUser(session.user);
            } else {
              setUser(null);
            }
        }
      }
    );

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Fast, non-blocking user activity update
  const updateUserActivity = async (user: User) => {
    try {
      const response = await fetch('/api/user/update-activity', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      
      if (!response.ok && response.status !== 404) {
        console.warn('Activity update failed:', response.status);
      }
    } catch (error) {
      console.warn('Activity update error:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔑 Signing in...');
      
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error('❌ Sign in error:', signInError.message);
        const errorMessage = signInError.message || 'Failed to sign in';
        setError(errorMessage);
        toast.error(errorMessage);
        throw signInError;
      }

      if (data.user) {
        setUser(data.user);
        setError(null);
        console.log('✅ Sign in successful');
        toast.success('Signed in successfully!');
        return { user: data.user, session: data.session };
      }
    } catch (error: any) {
      const message = error.message || 'Failed to sign in';
      setError(message);
      if (!message.includes('Invalid login credentials')) {
        toast.error(message);
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, inGameAlias: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📝 Signing up...');
      
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            in_game_alias: inGameAlias,
          },
        },
      });

      if (signUpError) {
        console.error('❌ Sign up error:', signUpError.message);
        const errorMessage = signUpError.message || 'Failed to create account';
        setError(errorMessage);
        toast.error(errorMessage);
        throw signUpError;
      }

      console.log('✅ Sign up successful');
      
      // Create profile synchronously to ensure it exists before success
      if (data.user) {
        try {
          await createUserProfile(data.user, inGameAlias);
          console.log('✅ Profile created successfully for:', data.user.email);
          toast.success('Account created successfully!');
        } catch (profileError: any) {
          console.error('❌ Profile creation failed:', profileError);
          toast.error('Account created but profile setup incomplete. Please try signing in.');
        }
      } else {
        toast.success('Account created successfully!');
      }

      return data;
    } catch (error: any) {
      const message = error.message || 'Failed to create account';
      setError(message);
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const createUserProfile = async (user: User, inGameAlias: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          email: user.email,
          in_game_alias: inGameAlias,
          last_seen: new Date().toISOString(),
        }]);
      
      if (error) {
        // Handle duplicate key error gracefully
        if (error.message.includes('duplicate key')) {
          console.log('Profile already exists, updating instead...');
          
          // Try to update existing profile
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              in_game_alias: inGameAlias,
              email: user.email,
              registration_status: 'completed',
              last_seen: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
          
          if (updateError) {
            console.error('Profile update failed:', updateError);
            throw updateError;
          }
        } else {
          console.error('Profile creation failed:', error);
          throw error;
        }
      }
    } catch (error) {
      console.warn('Profile creation failed:', error);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      console.log('👋 Signing out...');
      
      await supabase.auth.signOut();
      setUser(null);
      setError(null);
      
      console.log('✅ Sign out successful');
      toast.success('Signed out successfully');
    } catch (error: any) {
      console.error('❌ Sign out error:', error);
      // Force local logout even if server signout fails
      setUser(null);
      setError(null);
      toast.error('Sign out completed (with warnings)');
    } finally {
      setLoading(false);
    }
  };

  const retryAuth = async () => {
    setError(null);
    console.log('🔄 Retrying auth...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      
      if (session?.user) {
        console.log('✅ Auth retry successful');
        toast.success('Connection restored');
      } else {
        console.log('ℹ️ No session found on retry');
      }
    } catch (error: any) {
      console.warn('Auth retry failed:', error);
      toast.error('Connection retry failed');
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