import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variable handling for both development and production
const getSupabaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.includes('your-project.supabase.co')) {
    console.warn('⚠️ Supabase URL not configured properly. Please set NEXT_PUBLIC_SUPABASE_URL');
    // Return a fallback that will cause descriptive errors rather than silent failures
    return 'https://not-configured.supabase.co';
  }
  return url;
};

const getSupabaseAnonKey = () => {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || key.includes('your_anon_key_here')) {
    console.warn('⚠️ Supabase anon key not configured properly. Please set NEXT_PUBLIC_SUPABASE_ANON_KEY');
    // Return a fallback that will cause descriptive errors
    return 'not-configured-key';
  }
  return key;
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

console.log('🔧 Supabase configuration:', {
  url: supabaseUrl.replace(/\/\/.*@/, '//***@'), // Hide sensitive parts
  hasValidKey: !supabaseAnonKey.includes('not-configured'),
  environment: process.env.NODE_ENV || 'development'
});

// Singleton client instance to prevent multiple instantiations
let clientInstance: SupabaseClient | null = null;

// Main client with optimized configuration for better reliability
export const supabase = (() => {
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      realtime: {
        params: {
          eventsPerSecond: 5, // Reduced from 10
        },
        heartbeatIntervalMs: 30000, // 30 seconds
        reconnectAfterMs: (tries: number) => Math.min(tries * 1000, 30000), // Max 30s
      },
      global: {
        headers: {
          'Cache-Control': 'max-age=300', // 5 minute cache for static data
          'X-Client-Info': 'gaming-perks-shop/1.0',
        },
      },
      // Connection pooling configuration
      db: {
        schema: 'public',
      },
    });
  }
  return clientInstance;
})();

// Cached service client instance to prevent multiple instantiations
let serviceClient: SupabaseClient | null = null;

// Service client with optimizations for server-side operations
export const getServiceSupabase = () => {
  if (!serviceClient) {
    serviceClient = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          flowType: 'pkce',
        },
        realtime: {
          params: {
            eventsPerSecond: 1, // Minimal for server operations
          },
          heartbeatIntervalMs: 60000, // 1 minute
        },
        global: {
          headers: {
            'Cache-Control': 'max-age=300',
            'X-Client-Info': 'gaming-perks-shop-service/1.0',
          },
        },
      }
    );
  }
  return serviceClient;
};

// Cached read-only client instance
let cachedClient: SupabaseClient | null = null;

// Cached client for read-heavy operations
export const getCachedSupabase = () => {
  if (!cachedClient) {
    cachedClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          flowType: 'pkce',
        },
        realtime: {
          params: {
            eventsPerSecond: 1, // Minimal for cached operations
          },
          heartbeatIntervalMs: 120000, // 2 minutes
        },
        global: {
          headers: {
            'Cache-Control': 'max-age=600', // 10 minute cache for read operations
            'X-Client-Info': 'gaming-perks-shop-cache/1.0',
          },
        },
      }
    );
  }
  return cachedClient;
};

// Utility function to handle connection retries with exponential backoff
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on authentication errors
      if (error.message?.includes('JWT') || error.message?.includes('auth')) {
        throw error;
      }
      
      // Don't retry on final attempt
      if (attempt === maxRetries - 1) {
        break;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`⚠️ Operation failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}; 