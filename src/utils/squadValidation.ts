/**
 * Squad Size Validation Utilities
 * Safe implementation that works before and after database schema updates
 */

import { Squad, SquadMember, Profile } from '@/types/database';

interface ValidationResult {
  canAdd: boolean;
  reason: string;
  currentCount: number;
  maxMembers: number;
  transitionalCount: number;
  regularCount: number;
}

interface ExtendedSquadMember extends SquadMember {
  profile?: Profile;
  profiles?: Profile;
}

/**
 * Safely check if a player is transitional
 * Returns false if field doesn't exist (backward compatibility)
 */
export const isTransitionalPlayer = (profile: Profile | null | undefined): boolean => {
  if (!profile) return false;
  // Safe check - returns false if field doesn't exist
  return profile.transitional_player === true;
};

/**
 * Get the effective max members for a squad
 * Uses 15 as default if max_members field doesn't exist
 */
export const getSquadMaxMembers = (squad: Squad): number => {
  return squad.max_members ?? 15;
};

/**
 * Count squad members by type
 */
export const countSquadMembers = (members: ExtendedSquadMember[]) => {
  let regularCount = 0;
  let transitionalCount = 0;
  
  members.forEach(member => {
    // Try both profile and profiles fields (different query structures)
    const profile = member.profile || member.profiles;
    
    if (isTransitionalPlayer(profile)) {
      transitionalCount++;
    } else {
      regularCount++;
    }
  });
  
  return { regularCount, transitionalCount, totalCount: regularCount + transitionalCount };
};

/**
 * Check if a player can be added to a squad
 * Safe implementation with admin override support
 */
export const canAddPlayerToSquad = (
  squad: Squad,
  currentMembers: ExtendedSquadMember[],
  newPlayerProfile: Profile,
  isAdmin: boolean = false
): ValidationResult => {
  const maxMembers = getSquadMaxMembers(squad);
  const { regularCount, transitionalCount } = countSquadMembers(currentMembers);
  
  // Admin override - always allow
  if (isAdmin) {
    return {
      canAdd: true,
      reason: 'Admin override - no limits apply',
      currentCount: regularCount + transitionalCount,
      maxMembers,
      transitionalCount,
      regularCount
    };
  }
  
  // If new player is transitional, always allow (they don't count toward limit)
  if (isTransitionalPlayer(newPlayerProfile)) {
    return {
      canAdd: true,
      reason: 'Transitional player - exempt from squad size limits',
      currentCount: regularCount + transitionalCount,
      maxMembers,
      transitionalCount: transitionalCount + 1,
      regularCount
    };
  }
  
  // Check if adding regular player would exceed limit
  if (regularCount >= maxMembers) {
    return {
      canAdd: false,
      reason: `Squad at capacity for regular players (${regularCount}/${maxMembers})${transitionalCount > 0 ? ` [+${transitionalCount} transitional]` : ''}`,
      currentCount: regularCount + transitionalCount,
      maxMembers,
      transitionalCount,
      regularCount
    };
  }
  
  return {
    canAdd: true,
    reason: `Within limits (${regularCount + 1}/${maxMembers} regular players)`,
    currentCount: regularCount + transitionalCount,
    maxMembers,
    transitionalCount,
    regularCount: regularCount + 1
  };
};

/**
 * Get display text for squad member count
 */
export const getSquadMemberCountDisplay = (
  squad: Squad,
  members: ExtendedSquadMember[]
): string => {
  const { regularCount, transitionalCount } = countSquadMembers(members);
  const maxMembers = getSquadMaxMembers(squad);
  
  if (transitionalCount === 0) {
    return `${regularCount}/${maxMembers} members`;
  }
  
  return `${regularCount}/${maxMembers} members (+${transitionalCount} transitional)`;
};

/**
 * Check if squad is at capacity for regular players
 */
export const isSquadAtCapacity = (
  squad: Squad,
  members: ExtendedSquadMember[]
): boolean => {
  const { regularCount } = countSquadMembers(members);
  const maxMembers = getSquadMaxMembers(squad);
  return regularCount >= maxMembers;
};

/**
 * Safe way to check if user has admin permissions
 * Handles different admin types
 */
export const hasAdminOverride = (userProfile: Profile | null | undefined): boolean => {
  if (!userProfile) return false;
  return userProfile.is_admin || userProfile.site_admin || userProfile.is_zone_admin;
};