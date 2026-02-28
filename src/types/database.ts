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
  is_zone_admin: boolean;
  site_admin: boolean;
  ctf_role?: CtfRoleType | null;
  registration_status: string;
  is_league_banned: boolean;
  league_ban_reason?: string | null;
  league_ban_date?: string | null;
  avatar_url?: string | null;
  hide_from_free_agents: boolean;
  transitional_player?: boolean; // Optional for backward compatibility
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
  max_members?: number; // Default will be 15, optional for backward compatibility
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
  responded_at?: string | null;
  decline_reason?: string | null;
}

export interface SeasonRosterLock {
  id: number;
  season_id: string;
  is_locked: boolean;
  locked_at: string | null;
  unlocked_at: string | null;
  locked_by: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeasonRosterLockWithSeason extends SeasonRosterLock {
  season?: {
    id: string;
    season_number: number;
    season_name: string | null;
    status: 'upcoming' | 'active' | 'completed';
  };
}

export interface SquadRating {
  id: string;
  squad_id: string;
  analyst_id: string;
  season_name: string;
  league_slug: string;
  analysis_date: string;
  analyst_commentary?: string | null;
  analyst_quote?: string | null;
  breakdown_summary?: string | null;
  is_official: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlayerRating {
  id: string;
  squad_rating_id: string;
  player_id: string;
  rating: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// MULTI-LEAGUE INTERFACES
// =============================================================================

export interface League {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface LeagueSeason {
  id: string;
  league_id: string;
  season_number: number;
  season_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'upcoming' | 'active' | 'completed';
  champion_squad_ids: string[];
  runner_up_squad_ids: string[];
  third_place_squad_ids: string[];
  total_matches: number;
  total_squads: number;
}

export interface LeagueStanding {
  id: string;
  league_season_id: string;
  squad_id: string;
  matches_played: number;
  wins: number;
  losses: number;
  no_shows: number;
  overtime_wins: number;
  overtime_losses: number;
  regulation_wins: number;
  points: number;
  kills_for: number;
  deaths_against: number;
  kill_death_difference: number;
  win_percentage: number;
}

export interface LeagueStandingWithRanking extends LeagueStanding {
  squad_name: string;
  squad_tag: string;
  banner_url: string | null;
  captain_alias: string;
  rank: number;
  points_behind: number;
  season_number: number;
  league_slug: string;
  league_name: string;
}

// Extended interfaces for joined data
export interface SquadRatingWithDetails extends SquadRating {
  squad_name: string;
  squad_tag: string;
  analyst_alias: string;
}

export interface PlayerRatingWithDetails extends PlayerRating {
  player_alias: string;
}

export interface MatchReportWithDetails extends MatchReport {
  squad_a_banner_url?: string | null;
  squad_b_banner_url?: string | null;
  creator_alias: string;
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

export interface MatchReport {
  id: string;
  title: string;
  squad_a_id?: string | null;
  squad_b_id?: string | null;
  squad_a_name: string;
  squad_b_name: string;
  match_summary: string;
  match_highlights_video_url?: string | null;
  match_date: string;
  season_name: string;
  league_slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayerRating {
  id: string;
  match_report_id: string;
  player_alias: string;
  player_id?: string | null;
  class_position: string;
  performance_description: string;
  highlight_clip_url?: string | null;
  kills: number;
  deaths: number;
  turret_damage?: number | null;
  rating_before: number;
  rating_adjustment: number;
  rating_after: number;
  display_order: number;
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
  | 'ctf_commentator'
  | 'ctf_analyst'
  | 'ctf_analyst_commentator'
  | 'ctf_analyst_commentator_referee'
  | 'ctf_analyst_referee';

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
  return ['ctf_admin', 'ctf_head_referee', 'ctf_referee', 'ctf_recorder', 'ctf_commentator', 'ctf_analyst', 'ctf_analyst_commentator', 'ctf_analyst_commentator_referee', 'ctf_analyst_referee'].includes(role);
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

// =============================================================================
// EXPENSE TRACKING TYPES
// =============================================================================

export type ExpenseCategory = 
  | 'website_hosting'
  | 'server_hosting'
  | 'ai_development_subscription'
  | 'ai_development_usage'
  | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  expense_date: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  is_recurring: boolean;
  recurring_period?: string;
  provider?: string;
  notes?: string;
}

export interface FinancialOverview {
  period: string;
  total_revenue: number;
  total_donations: number;
  total_orders: number;
  total_expenses: number;
  website_costs: number;
  server_costs: number;
  ai_subscription_costs: number;
  ai_usage_costs: number;
  other_costs: number;
  net_profit: number;
  profit_margin: number;
} 