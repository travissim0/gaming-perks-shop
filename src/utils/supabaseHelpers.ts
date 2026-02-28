// Supabase Helper Utilities
// Handles connection management, retries, and error handling

import { supabase, getCachedSupabase, withRetry } from '@/lib/supabase';
import { PostgrestError } from '@supabase/supabase-js';

// Connection management and retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second
const CONNECTION_TIMEOUT = 10000; // 10 seconds

// Custom error types
export class SupabaseConnectionError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'SupabaseConnectionError';
  }
}

export class SupabaseQueryError extends Error {
  constructor(message: string, public originalError?: PostgrestError) {
    super(message);
    this.name = 'SupabaseQueryError';
  }
}

// Utility to wait/delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Check if error is connection-related
const isConnectionError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  
  return (
    errorMessage.includes('connection') ||
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('could not establish') ||
    errorMessage.includes('receiving end does not exist') ||
    errorCode.includes('connection') ||
    errorCode === 'pgrst301' // PostgREST connection error
  );
};

// Local retry wrapper for Supabase queries with context
async function retryWithContext<T>(
  operation: () => Promise<T>,
  context: string = 'query'
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      console.log(`🔄 ${context}: Attempt ${attempt}/${RETRY_ATTEMPTS}`);
      
      // Add timeout to prevent hanging connections
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), CONNECTION_TIMEOUT);
      });
      
      const result = await Promise.race([operation(), timeoutPromise]) as T;
      
      console.log(`✅ ${context}: Success on attempt ${attempt}`);
      return result;
      
    } catch (error: any) {
      lastError = error;
      console.error(`❌ ${context}: Attempt ${attempt} failed:`, error);
      
      // If it's not a connection error, don't retry
      if (!isConnectionError(error) && attempt === 1) {
        break;
      }
      
      // If this is the last attempt, don't delay
      if (attempt < RETRY_ATTEMPTS) {
        const delayTime = RETRY_DELAY * attempt; // Exponential backoff
        console.log(`⏳ ${context}: Waiting ${delayTime}ms before retry...`);
        await delay(delayTime);
      }
    }
  }
  
  // All attempts failed
  if (isConnectionError(lastError)) {
    throw new SupabaseConnectionError(
      `Failed to connect after ${RETRY_ATTEMPTS} attempts: ${lastError.message}`,
      lastError
    );
  } else {
    throw new SupabaseQueryError(
      `Query failed: ${lastError.message}`,
      lastError
    );
  }
}

// Enhanced helper functions with better error handling and retry logic

export const getFreeAgents = async () => {
  try {
    const operation = async () => {
      const { data, error } = await supabase
        .from('free_agents')
        .select(`
          *,
          profiles!free_agents_player_id_fkey (
            in_game_alias,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching free agents:', error);
        throw new Error(`Failed to fetch free agents: ${error.message}`);
      }

      // Return all free agents - filtering will be done on the frontend
      return data || [];
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('getFreeAgents failed:', error.message);
    // Return empty array instead of throwing to prevent page crashes
    return [];
  }
};

export const getAllPlayers = async () => {
  try {
    const operation = async () => {
      // Get ALL players without filtering - let the frontend handle visibility filtering
      // Use regular supabase client to avoid caching issues with visibility changes
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('in_game_alias', { ascending: true });

      if (error) {
        console.error('Error fetching players:', error);
        throw new Error(`Failed to fetch players: ${error.message}`);
      }

      console.log(`getAllPlayers: Fetched ${data?.length || 0} total players`);
      
      // Return all players - filtering will be done on the frontend
      return data || [];
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('getAllPlayers failed:', error.message);
    return [];
  }
};

export const checkIfUserInFreeAgentPool = async (userId: string) => {
  if (!userId) return false;

  try {
    const operation = async () => {
      // First check if user is in free agent pool
      const { data: freeAgentData, error: freeAgentError } = await supabase
        .from('free_agents')
        .select('id')
        .eq('player_id', userId)
        .eq('is_active', true)
        .single();

      if (freeAgentError && freeAgentError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error checking free agent status:', freeAgentError);
        throw new Error(`Failed to check free agent status: ${freeAgentError.message}`);
      }

      const isInFreeAgentPool = !!freeAgentData;
      
      if (!isInFreeAgentPool) {
        return false;
      }

      // Check if user can actually be a free agent (not in active squads)
      const { data: canBeFreeAgent, error: canBeError } = await supabase
        .rpc('can_be_free_agent', { user_id: userId });

      if (canBeError) {
        console.error('Error checking can_be_free_agent:', canBeError);
        // Fallback to old logic if function fails
        return isInFreeAgentPool;
      }

      return isInFreeAgentPool && canBeFreeAgent;
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('checkIfUserInFreeAgentPool failed:', error.message);
    return false;
  }
};

export const getSquadInvitations = async (userId: string) => {
  if (!userId) return [];

  try {
    const operation = async () => {
      const { data, error } = await supabase
        .from('squad_invites')
        .select(`
          *,
          squads (
            id,
            name,
            description,
            squad_photo_url
          )
        `)
        .eq('invited_player_id', userId)
        .neq('invited_by', userId) // EXCLUDE join requests (where user invited themselves)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching squad invitations:', error);
        throw new Error(`Failed to fetch squad invitations: ${error.message}`);
      }

      return data || [];
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('getSquadInvitations failed:', error.message);
    return [];
  }
};

export const getAllSquads = async () => {
  try {
    const operation = async () => {
      const { data, error } = await getCachedSupabase()
        .from('squads')
        .select(`
          *,
          squad_members (
            id,
            profiles (
              in_game_alias,
              avatar_url
            )
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching squads:', error);
        throw new Error(`Failed to fetch squads: ${error.message}`);
      }

      return data || [];
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('getAllSquads failed:', error.message);
    return [];
  }
};

export const getRecentGames = async (limit: number = 5) => {
  try {
    const operation = async () => {
      const { data, error } = await getCachedSupabase()
        .from('player_stats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching recent games:', error);
        throw new Error(`Failed to fetch recent games: ${error.message}`);
      }

      return data || [];
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('getRecentGames failed:', error.message);
    return [];
  }
};

export const getPlayerStats = async (playerName?: string) => {
  try {
    const operation = async () => {
      let query = getCachedSupabase()
        .from('player_stats')
        .select('*')
        .order('created_at', { ascending: false });

      if (playerName) {
        query = query.eq('player_name', playerName);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.error('Error fetching player stats:', error);
        throw new Error(`Failed to fetch player stats: ${error.message}`);
      }

      return data || [];
    };

    return await withRetry(operation);
  } catch (error: any) {
    console.error('getPlayerStats failed:', error.message);
    return [];
  }
};

// Utility function to handle API responses consistently
export const handleApiResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // If we can't parse the error response, use the default message
    }
    
    throw new Error(errorMessage);
  }
  
  try {
    return await response.json();
  } catch (error) {
    console.warn('Failed to parse JSON response:', error);
    return null;
  }
};

// Connection health check utility
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    return { 
      healthy: !error, 
      error: error?.message,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    return { 
      healthy: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Safe squad members query
export async function getSquadMembers(squadId: string): Promise<any[]> {
  return retryWithContext(async () => {
    const { data, error } = await supabase
      .from('squad_members')
      .select(`
        id,
        player_id,
        role,
        status,
        joined_at,
        profiles(
          id,
          in_game_alias,
          email
        )
      `)
      .eq('squad_id', squadId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }, 'getSquadMembers');
}

// Get all site avatars for user selection
export async function getSiteAvatars(): Promise<string[]> {
  return retryWithContext(async () => {
    try {
      // Use API route to fetch avatars (server-side with service role)
      const response = await fetch('/api/avatars');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      console.log(`Found ${data.count || 0} site avatars`);
      return data.avatars || [];
    } catch (error) {
      console.error('Error in getSiteAvatars:', error);
      return [];
    }
  }, 'getSiteAvatars');
}

// Get default avatar URL
export function getDefaultAvatarUrl(): string {
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl('site-avatars/a7inf2.png');
  return publicUrl;
}

// Export utility functions
export {
  withRetry,
  isConnectionError
};

/**
 * Privacy safeguard: ensures display names never contain email parts or other private information
 * @param profile - User profile object
 * @returns Safe display name that doesn't leak private information
 */
export const getSafeDisplayName = (profile: {
  in_game_alias?: string | null;
  email?: string | null;
}): string => {
  // Only return the alias if it exists and is not an email or email part
  if (profile.in_game_alias && 
      profile.in_game_alias.trim() !== '' &&
      !profile.in_game_alias.includes('@') &&
      !profile.in_game_alias.includes('.')) {
    return profile.in_game_alias;
  }
  
  // Never return email or email parts for privacy
  return 'Anonymous User';
};

/**
 * Privacy safeguard: ensures display names are safe for public display
 * @param name - Name to check
 * @returns Safe name or fallback
 */
export const validateDisplayName = (name: string | null | undefined): string => {
  if (!name || name.trim() === '') {
    return 'Anonymous User';
  }
  
  // Check if the name looks like an email or email part
  if (name.includes('@') || (name.includes('.') && name.length > 3)) {
    return 'Anonymous User';
  }
  
  return name;
};

/**
 * Privacy safeguard: ensures squad member names are safe for public display
 * @param member - Squad member object
 * @returns Safe display name
 */
export const getSafeSquadMemberName = (member: {
  in_game_alias?: string | null;
  profiles?: { in_game_alias?: string | null } | null;
}): string => {
  const alias = member.in_game_alias || member.profiles?.in_game_alias;
  return validateDisplayName(alias);
};

/**
 * Get all squad ratings with joined data
 * @returns Promise with squad ratings including squad and analyst info
 */
export const getSquadRatings = async () => {
  return retryWithContext(
    async () => {
      const { data, error } = await supabase.rpc('get_squad_ratings');
      
      if (error) {
        throw new SupabaseQueryError(`Failed to fetch squad ratings: ${error.message}`, error);
      }
      
      return { data, error: null };
    },
    'getSquadRatings',
    RETRY_ATTEMPTS
  );
};

/**
 * Get a specific squad rating with player ratings
 * @param ratingId - Squad rating ID
 * @returns Promise with squad rating and player ratings
 */
export const getSquadRatingDetails = async (ratingId: string) => {
  return retryWithContext(
    async () => {
      // Get squad rating details
      const { data: squadRating, error: squadError } = await supabase
        .rpc('get_squad_ratings')
        .eq('id', ratingId)
        .single();

      if (squadError) {
        throw new SupabaseQueryError(`Failed to fetch squad rating: ${squadError.message}`, squadError);
      }

      // Get player ratings for this squad rating
      const { data: playerRatings, error: playersError } = await supabase
        .rpc('get_player_ratings_for_squad', { squad_rating_uuid: ratingId });

      if (playersError) {
        throw new SupabaseQueryError(`Failed to fetch player ratings: ${playersError.message}`, playersError);
      }

      return { 
        data: { 
          squad_rating: squadRating, 
          player_ratings: playerRatings || [] 
        }, 
        error: null 
      };
    },
    'getSquadRatingDetails',
    RETRY_ATTEMPTS
  );
}; 