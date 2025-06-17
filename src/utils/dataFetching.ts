import { supabase, getCachedSupabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface FetchOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  showErrorToast?: boolean;
  errorMessage?: string;
  useCache?: boolean;
  cacheKey?: string;
}

interface FetchResult<T> {
  data: T | null;
  error: Error | null;
  success: boolean;
}

// Simple in-memory cache for read-heavy operations
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

// Cache utility functions
export const cacheUtils = {
  get: <T>(key: string): T | null => {
    const cached = cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      cache.delete(key);
      return null;
    }
    
    return cached.data;
  },
  
  set: <T>(key: string, data: T, ttlMs: number = 300000): void => { // 5 min default
    cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  },
  
  clear: (pattern?: string): void => {
    if (!pattern) {
      cache.clear();
      return;
    }
    
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  }
};

// Timeout wrapper for any async operation
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000, // Reduced from 15s to 10s for snappier UX
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

// Robust fetch function with retry logic and caching
export async function robustFetch<T>(
  fetchFunction: () => Promise<T>,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const {
    timeout = 10000, // Reduced timeout
    retries = 1, // Reduced retries for faster failure
    retryDelay = 500, // Reduced retry delay
    showErrorToast = true,
    errorMessage = 'Failed to load data',
    useCache = false,
    cacheKey
  } = options;

  // Check cache first if enabled
  if (useCache && cacheKey) {
    const cachedData = cacheUtils.get<T>(cacheKey);
    if (cachedData !== null) {
      console.log(`🎯 Cache hit for: ${cacheKey}`);
      return { data: cachedData, error: null, success: true };
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Fetch attempt ${attempt + 1}/${retries + 1}`);
      
      const data = await withTimeout(fetchFunction(), timeout);
      
      // Cache successful results if enabled
      if (useCache && cacheKey && data !== null) {
        cacheUtils.set(cacheKey, data);
        console.log(`💾 Cached result for: ${cacheKey}`);
      }
      
      console.log('✅ Fetch successful');
      return { data, error: null, success: true };
      
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`❌ Fetch attempt ${attempt + 1} failed:`, lastError.message);
      
      // Don't retry on certain errors
      if (
        lastError.message.includes('auth') ||
        lastError.message.includes('unauthorized') ||
        lastError.message.includes('forbidden') ||
        lastError.message.includes('not found')
      ) {
        console.log('🚫 Not retrying due to error type');
        break;
      }
      
      // Wait before retrying (except on last attempt)
      if (attempt < retries) {
        console.log(`⏳ Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // All attempts failed
  console.error('❌ All fetch attempts failed:', lastError);
  
  if (showErrorToast) {
    toast.error(`${errorMessage}: ${lastError?.message || 'Unknown error'}`);
  }

  return { data: null, error: lastError, success: false };
}

// Specific Supabase query wrapper with optimizations
export async function supabaseQuery<T>(
  queryFunction: () => Promise<{ data: T | null; error: any }>,
  options: FetchOptions = {}
): Promise<FetchResult<T | null>> {
  return robustFetch(async () => {
    const result = await queryFunction();
    
    if (result.error) {
      throw new Error(result.error.message || 'Database query failed');
    }
    
    return result.data;
  }, options);
}

// Batch query utility for multiple related queries
export async function batchQueries<T>(
  queries: Array<{
    key: string;
    query: () => Promise<{ data: T | null; error: any }>;
    options?: FetchOptions;
  }>
): Promise<Record<string, FetchResult<T | null>>> {
  const results = await Promise.allSettled(
    queries.map(async ({ key, query, options = {} }) => ({
      key,
      result: await supabaseQuery(query, options)
    }))
  );

  const batchResult: Record<string, FetchResult<T | null>> = {};
  
  results.forEach((result, index) => {
    const key = queries[index].key;
    if (result.status === 'fulfilled') {
      batchResult[key] = result.value.result;
    } else {
      batchResult[key] = {
        data: null,
        error: new Error(result.reason),
        success: false
      };
    }
  });

  return batchResult;
}

// Pre-configured optimized queries for common operations
export const queries = {
  getUserSquad: async (userId: string) => {
    return supabaseQuery(
      async () => {
        // Optimized with specific field selection
        const query = getCachedSupabase()
          .from('squad_members')
          .select(`squads!inner(id, name, tag)`)
          .eq('player_id', userId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        return await query;
      },
      { 
        errorMessage: 'Failed to load user squad',
        useCache: true,
        cacheKey: `user_squad_${userId}`
      }
    );
  },

  getSquadDetails: async (squadId: string) => {
    return supabaseQuery(
      async () => {
        const query = getCachedSupabase()
          .from('squads')
          .select('id, name, tag, description, discord_link, website_link, captain_id, created_at, banner_url, is_active')
          .eq('id', squadId)
          .maybeSingle();
        return await query;
      },
      { 
        errorMessage: 'Failed to load squad details',
        useCache: true,
        cacheKey: `squad_details_${squadId}`
      }
    );
  },

  getSquadMembers: async (squadId: string) => {
    return supabaseQuery(
      async () => {
        const query = getCachedSupabase()
          .from('squad_members')
          .select(`
            id,
            player_id,
            role,
            joined_at,
            status,
            profiles!squad_members_player_id_fkey(in_game_alias)
          `)
          .eq('squad_id', squadId)
          .eq('status', 'active')
          .order('joined_at', { ascending: true })
          .limit(50); // Add reasonable limit
        return await query;
      },
      { 
        errorMessage: 'Failed to load squad members',
        useCache: true,
        cacheKey: `squad_members_${squadId}`
      }
    );
  },

  getTopSquads: async (limit: number = 10) => {
    return supabaseQuery(
      async () => {
        // Optimized query avoiding complex joins - only active squads for home page
        const query = getCachedSupabase()
          .from('squads')
          .select(`
            id,
            name,
            tag,
            description,
            captain_id,
            created_at
          `)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(limit);
        return await query;
      },
      { 
        errorMessage: 'Failed to load top squads',
        useCache: true,
        cacheKey: `top_squads_${limit}`
      }
    );
  },

  getAllSquads: async () => {
    return supabaseQuery(
      async () => {
        // Get all squads (active and inactive) for squads page
        const query = getCachedSupabase()
          .from('squads')
          .select(`
            id,
            name,
            tag,
            description,
            captain_id,
            created_at,
            is_active,
            banner_url,
            profiles!squads_captain_id_fkey(in_game_alias)
          `)
          .order('created_at', { ascending: false });
        return await query;
      },
      { 
        errorMessage: 'Failed to load squads',
        useCache: true,
        cacheKey: 'all_squads'
      }
    );
  },

  getPendingInvites: async (userId: string) => {
    return supabaseQuery(
      async () => {
        const query = supabase // Don't cache user-specific data
          .from('squad_invites')
          .select(`
            id,
            squad_id,
            invited_by,
            expires_at,
            created_at,
            squads!squad_invites_squad_id_fkey(name, tag),
            inviter:profiles!squad_invites_invited_by_fkey(in_game_alias)
          `)
          .eq('invited_player_id', userId)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .limit(10);
        return await query;
      },
      { errorMessage: 'Failed to load pending invites' }
    );
  },

  // New optimized queries for home page
  getRecentDonations: async (limit: number = 10) => {
    return supabaseQuery(
      async () => {
        const query = getCachedSupabase()
          .from('donations')
          .select('amount, donor_name, message, created_at')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(limit);
        return await query;
      },
      { 
        errorMessage: 'Failed to load recent donations',
        useCache: true,
        cacheKey: `recent_donations_${limit}`
      }
    );
  },

  getOnlineUsers: async (limit: number = 20) => {
    return supabaseQuery(
      async () => {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const query = getCachedSupabase()
          .from('profiles')
          .select('id, in_game_alias, last_seen')
          .gte('last_seen', fiveMinutesAgo)
          .order('last_seen', { ascending: false })
          .limit(limit);
        return await query;
      },
      { 
        errorMessage: 'Failed to load online users',
        useCache: true,
        cacheKey: `online_users_${limit}`
      }
    );
  },

  getUpcomingMatches: async (limit: number = 5) => {
    return supabaseQuery(
      async () => {
        const now = new Date().toISOString();
        const query = getCachedSupabase()
          .from('matches')
          .select(`
            id,
            title,
            scheduled_at,
            match_type,
            status,
            squad_a:squads!matches_squad_a_id_fkey(name, tag),
            squad_b:squads!matches_squad_b_id_fkey(name, tag)
          `)
          .gte('scheduled_at', now)
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true })
          .limit(limit);
        return await query;
      },
      { 
        errorMessage: 'Failed to load upcoming matches',
        useCache: true,
        cacheKey: `upcoming_matches_${limit}`
      }
    );
  }
}; 