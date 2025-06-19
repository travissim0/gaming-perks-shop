// Database Types - Auto-generated from schema
// Generated on: 2024-12-19
// Source: get-complete-schema.sql output

// =============================================================================
// RPC FUNCTION RETURN TYPES (Critical for Type Safety)
// =============================================================================

// get_free_agents_optimized() RPC function return type
export interface GetFreeAgentsOptimizedResult {
  player_id: string;
  in_game_alias: string;
  email: string;
  created_at: string;
}

// get_squad_invitations_optimized(user_id_param uuid) RPC function return type
export interface GetSquadInvitationsOptimizedResult {
  invite_id: string;
  squad_id: string;
  squad_name: string;
  squad_tag: string;
  inviter_alias: string;
  message: string | null;
  created_at: string;
  expires_at: string;
  status: string;
}

// get_squad_members_optimized(squad_id_param uuid) RPC function return type
export interface GetSquadMembersOptimizedResult {
  member_id: string;
  player_id: string;
  player_alias: string;
  role: string;
  joined_at: string;
}

// =============================================================================
// TABLE INTERFACES
// =============================================================================

export interface Profile {
  id: string;
  email: string;
  in_game_alias?: string | null;
  is_admin: boolean;
  is_media_manager: boolean;
  ctf_role?: CtfRoleType | null;
  registration_status: string;
  is_league_banned: boolean;
  league_ban_reason?: string | null;
  league_ban_date?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Squad {
  id: string;
  name: string;
  tag: string;
  description?: string | null;
  discord_link?: string | null;
  website_link?: string | null;
  captain_id: string;
  is_active: boolean;
  is_legacy: boolean;
  tournament_eligible: boolean;
  banner_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SquadMember {
  id: string;
  squad_id: string;
  player_id: string;
  role: 'captain' | 'co_captain' | 'player';
  status: string;
  joined_at: string;
}

export interface FreeAgent {
  id: string;
  player_id: string;
  preferred_roles: string[];
  secondary_roles?: string[];
  availability?: string | null;
  availability_days?: string[];
  availability_times?: Record<string, { start: string; end: string }>;
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  class_ratings?: Record<string, number>;
  classes_to_try?: string[];
  notes?: string | null;
  contact_info?: string | null;
  timezone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SquadInvite {
  id: string;
  squad_id: string;
  invited_player_id: string;
  invited_by: string;
  message?: string | null;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  expires_at: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  price_id: string;
  image?: string | null;
  active: boolean;
  phrase?: string | null;
  customizable: boolean;
  kofi_direct_link_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface News {
  id: string;
  title: string;
  content: string;
  author_id: string;
  published: boolean;
  featured: boolean;
  reactions: any; // JSONB
  created_at: string;
  updated_at: string;
}

// =============================================================================
// ENUMS
// =============================================================================

export type CtfRoleType = 
  | 'ctf_admin'
  | 'ctf_head_referee'
  | 'ctf_referee'
  | 'ctf_recorder'
  | 'ctf_commentator';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type SquadMemberRole = 'captain' | 'co_captain' | 'player';

export type InviteStatus = 'pending' | 'accepted' | 'declined';

// =============================================================================
// EXTENDED INTERFACES WITH JOINS (For Direct Queries)
// =============================================================================

// Extended interfaces for when you use direct queries with joins
export interface FreeAgentWithProfile extends FreeAgent {
  profile?: Profile;
}

export interface SquadMemberWithProfile extends SquadMember {
  profile?: Profile;
}

export interface SquadInviteWithDetails extends SquadInvite {
  squad?: Squad;
  invited_by_profile?: Profile;
}

// =============================================================================
// QUERY RESULT TYPES (For Direct Supabase Queries)
// =============================================================================

// For direct free agents query with profile join
export interface FreeAgentQueryResult {
  id: string;
  player_id: string;
  preferred_roles: string[];
  availability?: string | null;
  skill_level: SkillLevel;
  notes?: string | null;
  contact_info?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile: {
    id: string;
    in_game_alias: string;
    email: string;
  };
}

// For direct squad invitations query with joins
export interface SquadInvitationQueryResult {
  id: string;
  squad_id: string;
  invited_player_id: string;
  invited_by: string;
  message?: string | null;
  status: InviteStatus;
  created_at: string;
  expires_at: string;
  squad: {
    id: string;
    name: string;
    tag: string;
    captain_id: string;
  };
  invited_by_profile: {
    id: string;
    in_game_alias: string;
  };
}

// For direct squad members query with profile join
export interface SquadMemberQueryResult {
  id: string;
  squad_id: string;
  player_id: string;
  role: SquadMemberRole;
  status: string;
  joined_at: string;
  profile: {
    id: string;
    in_game_alias: string;
    email: string;
  };
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isValidCtfRole(role: string): role is CtfRoleType {
  return ['ctf_admin', 'ctf_head_referee', 'ctf_referee', 'ctf_recorder', 'ctf_commentator'].includes(role);
}

export function isValidSkillLevel(level: string): level is SkillLevel {
  return ['beginner', 'intermediate', 'advanced', 'expert'].includes(level);
}

export function isValidSquadRole(role: string): role is SquadMemberRole {
  return ['captain', 'co_captain', 'player'].includes(role);
}

// =============================================================================
// USAGE NOTES
// =============================================================================

/*
IMPORTANT: RPC Function vs Direct Query Types

❌ AVOID using RPC functions due to type mismatches:
- get_free_agents_optimized() → Use GetFreeAgentsOptimizedResult
- get_squad_invitations_optimized() → Use GetSquadInvitationsOptimizedResult  
- get_squad_members_optimized() → Use GetSquadMembersOptimizedResult

✅ PREFER direct Supabase queries with proper types:
- FreeAgentQueryResult for .from('free_agents').select('*, profile:profiles(*)')
- SquadInvitationQueryResult for .from('squad_invites').select('*, squad:squads(*), invited_by_profile:profiles!invited_by(*)')
- SquadMemberQueryResult for .from('squad_members').select('*, profile:profiles(*)')

Example Migration:
// OLD (causes type errors)
const { data } = await supabase.rpc('get_free_agents_optimized');

// NEW (type safe)
const { data } = await supabase
  .from('free_agents')
  .select(`
    *,
    profile:profiles(id, in_game_alias, email)
  `)
  .eq('is_active', true)
  .returns<FreeAgentQueryResult[]>();
*/ 