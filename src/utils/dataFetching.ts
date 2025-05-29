import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface FetchOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  showErrorToast?: boolean;
  errorMessage?: string;
}

interface FetchResult<T> {
  data: T | null;
  error: Error | null;
  success: boolean;
}

// Timeout wrapper for any async operation
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 15000,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
}

// Robust fetch function with retry logic
export async function robustFetch<T>(
  fetchFunction: () => Promise<T>,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const {
    timeout = 15000,
    retries = 2,
    retryDelay = 1000,
    showErrorToast = true,
    errorMessage = 'Failed to load data'
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Fetch attempt ${attempt + 1}/${retries + 1}`);
      
      const data = await withTimeout(fetchFunction(), timeout);
      
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

// Specific Supabase query wrapper
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

// Pre-configured queries for common operations
export const queries = {
  getUserSquad: async (userId: string) => {
    return supabaseQuery(
      async () => {
        const query = supabase
          .from('squad_members')
          .select(`squads!inner(id, name, tag)`)
          .eq('player_id', userId)
          .eq('status', 'active')
          .maybeSingle();
        return await query;
      },
      { errorMessage: 'Failed to load user squad' }
    );
  },

  getSquadDetails: async (squadId: string) => {
    return supabaseQuery(
      async () => {
        const query = supabase
          .from('squads')
          .select('*')
          .eq('id', squadId)
          .eq('is_active', true)
          .single();
        return await query;
      },
      { errorMessage: 'Failed to load squad details' }
    );
  },

  getSquadMembers: async (squadId: string) => {
    return supabaseQuery(
      async () => {
        const query = supabase
          .from('squad_members')
          .select(`
            id,
            player_id,
            role,
            joined_at,
            profiles!squad_members_player_id_fkey(in_game_alias)
          `)
          .eq('squad_id', squadId)
          .eq('status', 'active')
          .order('joined_at', { ascending: true });
        return await query;
      },
      { errorMessage: 'Failed to load squad members' }
    );
  },

  getAllSquads: async () => {
    return supabaseQuery(
      async () => {
        const query = supabase
          .from('squads')
          .select(`
            id,
            name,
            tag,
            description,
            discord_link,
            website_link,
            captain_id,
            created_at,
            squad_members!inner(
              id,
              player_id,
              role,
              profiles!squad_members_player_id_fkey(in_game_alias)
            )
          `)
          .eq('is_active', true)
          .eq('squad_members.status', 'active')
          .order('created_at', { ascending: false });
        return await query;
      },
      { errorMessage: 'Failed to load squads' }
    );
  },

  getPendingInvites: async (userId: string) => {
    return supabaseQuery(
      async () => {
        const query = supabase
          .from('squad_invites')
          .select(`
            *,
            squads!squad_invites_squad_id_fkey(name, tag),
            inviter:profiles!squad_invites_invited_by_fkey(in_game_alias)
          `)
          .eq('invited_player_id', userId)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString());
        return await query;
      },
      { errorMessage: 'Failed to load pending invites' }
    );
  }
}; 