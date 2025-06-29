'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, withRetry } from './supabase';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, inGameAlias: string, avatarUrl?: string) => Promise<any>;
  signOut: () => Promise<void>;
  retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    const error = new Error('useAuth must be used within an AuthProvider');
    error.name = 'AuthContextError';
    throw error;
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start true to wait for auth check
  const [error, setError] = useState<string | null>(null);

  // Improved auth check with better error handling and shorter timeouts
  useEffect(() => {
    let isMounted = true;
    let authTimeout: NodeJS.Timeout;
    let fallbackTimeout: NodeJS.Timeout;

    const quickAuthCheck = async () => {
      try {
        console.log('🔍 AUTH: Quick auth check starting...', new Date().toISOString());
        setLoading(true);
        
        // Set a hard timeout for auth operations (reduced to 3 seconds)
        const authPromise = (async () => {
          try {
            const { data: { session }, error } = await supabase.auth.getSession();
            console.log('🔄 AUTH: Session check completed', { 
              hasSession: !!session, 
              hasUser: !!session?.user,
              error: error?.message 
            });
            return { session, error };
          } catch (sessionError: any) {
            console.warn('⚠️ AUTH: Session check failed:', sessionError.message);
            // Ensure we return a properly structured error
            const properError = sessionError instanceof Error ? sessionError : new Error(String(sessionError));
            return { session: null, error: properError };
          }
        })();

        // Create a timeout promise that resolves after 3 seconds (reduced from 5)
        const timeoutPromise = new Promise<{ session: any, error: any }>((resolve) => {
          authTimeout = setTimeout(() => {
            console.warn('⏰ AUTH: Session check timed out, proceeding without user');
            const timeoutError = new Error('Auth timeout');
            timeoutError.name = 'AuthTimeoutError';
            resolve({ session: null, error: timeoutError });
          }, 3000);
        });

        // Race between auth check and timeout
        const { session, error } = await Promise.race([authPromise, timeoutPromise]);
        
        // Clear timeout if auth completed first
        if (authTimeout) clearTimeout(authTimeout);
        
        if (!isMounted) return;

        if (error && !error.message.includes('timeout')) {
          console.warn('⚠️ AUTH: Session error (non-blocking):', error.message);
          // Only set error for critical auth failures
          if (error.message.includes('Invalid JWT')) {
            setError('Session expired. Please sign in again.');
          }
        }

        if (session?.user) {
          setUser(session.user);
          console.log('✅ AUTH: User session found:', session.user.email, session.user.id);
          
          // Background profile update (non-blocking with retry)
          updateUserActivity(session.user).catch(err => {
            console.warn('Profile update failed (non-blocking):', err.message);
            // Don't throw errors from background operations
          });
        } else {
          console.log('ℹ️ AUTH: No active session found');
          setUser(null);
        }
        
        setLoading(false);
        console.log('🏁 AUTH: Initial auth check complete, loading set to false');
      } catch (error: any) {
        console.warn('⚠️ AUTH: Auth check failed (non-blocking):', error);
        
        // Ensure error is properly structured
        const properError = error instanceof Error ? error : new Error(String(error));
        
        // Only show critical errors to users
        if (properError.message?.includes('network') || properError.message?.includes('fetch')) {
          setError('Connection issues detected. Some features may be limited.');
        }
        
        if (isMounted) {
          setLoading(false);
          console.log('🏁 AUTH: Auth check failed, loading set to false');
        }
        
        // Don't rethrow errors from the auth check - let the app continue
      }
    };

    // Add a fallback timeout to ensure loading never stays true indefinitely (reduced to 5 seconds)
    fallbackTimeout = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('🚨 AUTH: Fallback timeout triggered - forcing loading to false');
        setLoading(false);
      }
    }, 5000); // 5 second absolute maximum (reduced from 8)

    // Start quick check immediately
    quickAuthCheck().catch(err => {
      console.error('🚨 AUTH: Unhandled error in quickAuthCheck:', err);
      // Ensure loading is always set to false even if quickAuthCheck throws
      if (isMounted) {
        setLoading(false);
      }
    });

    // Set up auth state listener for real-time updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        try {
          console.log('🔄 AUTH: Auth state change:', event, session?.user?.email);
          
          // Clear fallback timeout when we get any auth state change
          if (fallbackTimeout) clearTimeout(fallbackTimeout);
          
          switch (event) {
            case 'SIGNED_IN':
              if (session?.user) {
                setUser(session.user);
                setError(null);
                setLoading(false);
                console.log('✅ User signed in:', session.user.email);
                
                // Background profile update with retry - don't throw errors
                updateUserActivity(session.user).catch(err => {
                  console.warn('Profile update failed:', err.message);
                  // Don't throw errors from background operations
                });
              }
              break;
              
            case 'SIGNED_OUT':
              setUser(null);
              setError(null);
              setLoading(false);
              console.log('👋 User signed out');
              break;
              
            case 'TOKEN_REFRESHED':
              if (session?.user) {
                setUser(session.user);
                setError(null);
                setLoading(false);
                console.log('🔄 Token refreshed for:', session.user.email);
              }
              break;
              
            case 'USER_UPDATED':
              if (session?.user) {
                setUser(session.user);
                setLoading(false);
                console.log('👤 User updated:', session.user.email);
              }
              break;
              
            default:
              if (session?.user) {
                setUser(session.user);
              } else {
                setUser(null);
              }
              setLoading(false);
          }
        } catch (stateChangeError: any) {
          console.error('🚨 AUTH: Error in auth state change handler:', stateChangeError);
          
          // Ensure loading is set to false even if there's an error
          setLoading(false);
          
          // Don't throw errors from the state change handler
        }
      }
    );

    return () => {
      isMounted = false;
      if (authTimeout) clearTimeout(authTimeout);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // Improved user activity update with retry logic
  const updateUserActivity = async (user: User) => {
    try {
      const updateOperation = async () => {
        const response = await fetch('/api/user/update-activity', { 
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ userId: user.id })
        });
        
        if (!response.ok && response.status !== 404) {
          const error = new Error(`Activity update failed: ${response.status}`);
          error.name = 'ActivityUpdateError';
          throw error;
        }
        
        return response;
      };
      
      await withRetry(updateOperation, 2, 1000);
    } catch (error: any) {
      console.warn('Activity update error:', error.message);
      // Don't rethrow - this is a background operation
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔑 Signing in...');
      
      const signInOperation = () => supabase.auth.signInWithPassword({
        email,
        password,
      });

      const { data, error: signInError } = await withRetry(signInOperation, 2, 1000);

      if (signInError) {
        console.error('❌ Sign in error:', signInError.message);
        const errorMessage = signInError.message || 'Failed to sign in';
        setError(errorMessage);
        
        // More user-friendly error messages
        if (errorMessage.includes('Invalid login credentials')) {
          toast.error('Invalid email or password');
        } else if (errorMessage.includes('network')) {
          toast.error('Connection error. Please check your internet connection.');
        } else {
          toast.error(errorMessage);
        }
        
        // Ensure we throw a proper Error object
        const properError = signInError instanceof Error ? signInError : new Error(errorMessage);
        properError.name = 'SignInError';
        throw properError;
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
      
      // Ensure we throw a proper Error object
      const properError = error instanceof Error ? error : new Error(message);
      properError.name = properError.name || 'SignInError';
      throw properError;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, inGameAlias: string, avatarUrl?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('📝 Signing up...', { email, aliasLength: inGameAlias.length });
      
      // Enhanced validation for mobile
      if (!email || !email.includes('@')) {
        const error = new Error('Please enter a valid email address');
        error.name = 'ValidationError';
        throw error;
      }
      
      if (!inGameAlias || inGameAlias.length < 2) {
        const error = new Error('Username must be at least 2 characters');
        error.name = 'ValidationError';
        throw error;
      }
      
      if (!password || password.length < 6) {
        const error = new Error('Password must be at least 6 characters');
        error.name = 'ValidationError';
        throw error;
      }
      
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            in_game_alias: inGameAlias.trim(),
          },
        },
      });

      if (signUpError) {
        console.error('❌ Sign up error:', signUpError.message);
        
        // Enhanced error handling for mobile
        let errorMessage = signUpError.message || 'Failed to create account';
        
        if (errorMessage.includes('User already registered')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.';
        } else if (errorMessage.includes('Invalid email')) {
          errorMessage = 'Please enter a valid email address';
        } else if (errorMessage.includes('Password')) {
          errorMessage = 'Password is too weak. Please choose a stronger password.';
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (errorMessage.includes('timeout')) {
          errorMessage = 'Request timed out. Please try again.';
        }
        
        setError(errorMessage);
        const properError = new Error(errorMessage);
        properError.name = 'SignUpError';
        throw properError;
      }

      console.log('✅ Sign up successful');
      
      // Create profile synchronously to ensure it exists before success
      if (data.user) {
        try {
          await createUserProfile(data.user, inGameAlias.trim(), avatarUrl);
          console.log('✅ Profile created successfully for:', data.user.email);
        } catch (profileError: any) {
          console.error('❌ Profile creation failed:', profileError);
          // Don't throw here - account was created successfully
          console.warn('Account created but profile setup incomplete. User can complete setup later.');
        }
      }

      return data;
    } catch (error: any) {
      const message = error.message || 'Failed to create account';
      setError(message);
      console.error('Sign up failed:', message);
      
      // Ensure we throw a proper Error object
      const properError = error instanceof Error ? error : new Error(message);
      properError.name = properError.name || 'SignUpError';
      throw properError;
    } finally {
      setLoading(false);
    }
  };

  const createUserProfile = async (user: User, inGameAlias: string, avatarUrl?: string) => {
    try {
      // Import default avatar function
      const { getDefaultAvatarUrl } = await import('@/utils/supabaseHelpers');
      const finalAvatarUrl = avatarUrl || getDefaultAvatarUrl();
      
      const { error } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          email: user.email,
          in_game_alias: inGameAlias,
          avatar_url: finalAvatarUrl,
          last_seen: new Date().toISOString(),
        }]);
      
      if (error) {
        // Handle duplicate key error gracefully
        const errorMessage = (error as any)?.message || String(error);
        if (errorMessage.includes('duplicate key')) {
          console.log('Profile already exists, updating instead...');
          
          // Try to update existing profile
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              in_game_alias: inGameAlias,
              email: user.email,
              avatar_url: finalAvatarUrl,
              registration_status: 'completed',
              last_seen: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);
          
          if (updateError) {
            console.error('Profile update failed:', updateError);
            const updateErrorMessage = (updateError as any)?.message || String(updateError);
            const properError = new Error(updateErrorMessage || 'Profile update failed');
            properError.name = 'ProfileUpdateError';
            throw properError;
          }
        } else {
          console.error('Profile creation failed:', error);
          const properError = new Error(errorMessage || 'Profile creation failed');
          properError.name = 'ProfileCreationError';
          throw properError;
        }
      }
    } catch (error: any) {
      console.warn('Profile creation failed:', error);
      // Ensure error is properly structured before rethrowing
      const properError = error instanceof Error ? error : new Error(String(error));
      properError.name = properError.name || 'ProfileError';
      throw properError;
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
      
      // Don't throw errors from signOut - user expects to be signed out
    } finally {
      setLoading(false);
    }
  };

  const retryAuth = async () => {
    setError(null);
    console.log('🔄 Retrying auth...');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        console.log('✅ Auth retry successful');
      } else {
        setUser(null);
        console.log('ℹ️ No session found on retry');
      }
    } catch (error: any) {
      console.error('❌ Auth retry failed:', error);
      setUser(null);
      
      // Ensure error is properly structured
      const properError = error instanceof Error ? error : new Error(String(error));
      properError.name = 'AuthRetryError';
      setError(properError.message);
      
      // Don't throw from retry - it's meant to be a recovery operation
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