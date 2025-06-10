import { createClient } from '@supabase/supabase-js';

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

// Optimized client configuration for better performance
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'Cache-Control': 'max-age=300' // 5 minute cache for static data
    }
  },
  // Connection pooling configuration
  db: {
    schema: 'public'
  }
});

// Service client with optimizations for server-side operations
export const getServiceSupabase = () => createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        'Cache-Control': 'max-age=300'
      }
    }
  }
);

// Cached client for read-heavy operations
export const getCachedSupabase = () => createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        'Cache-Control': 'max-age=600' // 10 minute cache for read operations
      }
    }
  }
); 