// Supabase Helper Utilities
// Handles connection management, retries, and error handling

import { supabase } from '@/lib/supabase';
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

// Retry wrapper for Supabase queries
async function withRetry<T>(
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

// Safe free agents query
export async function getFreeAgents(): Promise<any[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('free_agents')
      .select(`
        id,
        player_id,
        preferred_roles,
        secondary_roles,
        availability,
        availability_days,
        availability_times,
        skill_level,
        class_ratings,
        classes_to_try,
        notes,
        contact_info,
        timezone,
        is_active,
        created_at,
        updated_at,
        profiles(
          id,
          in_game_alias,
          email,
          created_at
        )
      `)
      .eq('is_active', true)
      .not('profiles.in_game_alias', 'is', null)
      .neq('profiles.in_game_alias', '')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return data || [];
  }, 'getFreeAgents');
}

// Safe squad invitations query
export async function getSquadInvitations(userId: string): Promise<any[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('squad_invites')
      .select(`
        id,
        squad_id,
        message,
        created_at,
        expires_at,
        status,
        squads!inner(
          id,
          name,
          tag,
          is_active
        ),
        profiles!squad_invites_invited_by_fkey(
          in_game_alias
        )
      `)
      .eq('invited_player_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }, 'getSquadInvitations');
}

// Safe squads query
export async function getAllSquads(): Promise<any[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('squads')
      .select(`
        id,
        name,
        tag,
        description,
        discord_link,
        website_link,
        captain_id,
        is_active,
        is_legacy,
        tournament_eligible,
        banner_url,
        created_at,
        updated_at,
        profiles!squads_captain_id_fkey(in_game_alias)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }, 'getAllSquads');
}

// Safe squad members query
export async function getSquadMembers(squadId: string): Promise<any[]> {
  return withRetry(async () => {
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

// Safe check if user is in free agent pool
export async function checkIfUserInFreeAgentPool(userId: string): Promise<boolean> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('free_agents')
      .select('id')
      .eq('player_id', userId)
      .eq('is_active', true)
      .maybeSingle(); // Use maybeSingle instead of single to handle no results

    if (error) {
      throw error;
    }

    return !!data; // Return true if data exists, false otherwise
  }, 'checkIfUserInFreeAgentPool');
}

// Connection health check
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    return !error;
  } catch (error) {
    console.error('Supabase connection check failed:', error);
    return false;
  }
}

// Get all players for the players filter (shows everyone signed up)
export async function getAllPlayers(): Promise<any[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        in_game_alias,
        email,
        registration_status,
        created_at,
        is_league_banned,
        ctf_role
      `)
      .eq('registration_status', 'completed')
      .not('in_game_alias', 'is', null)
      .neq('in_game_alias', '')
      .order('in_game_alias', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }, 'getAllPlayers');
}

// Get all site avatars for user selection
export async function getSiteAvatars(): Promise<string[]> {
  return withRetry(async () => {
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