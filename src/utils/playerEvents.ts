import { supabase } from '@/lib/supabase';

export interface PlayerEventData {
  player_id: string;
  event_type: string;
  description: string;
  event_data?: Record<string, any>;
  squad_id?: string | null;
  related_player_id?: string | null;
}

export class PlayerEventLogger {
  /**
   * Log a player event
   */
  static async logEvent(eventData: PlayerEventData): Promise<string | null> {
    try {
      const { data, error } = await supabase.rpc('log_player_event', {
        p_player_id: eventData.player_id,
        p_event_type: eventData.event_type,
        p_description: eventData.description,
        p_event_data: eventData.event_data || {},
        p_squad_id: eventData.squad_id || null,
        p_related_player_id: eventData.related_player_id || null
      });

      if (error) {
        console.error('Error logging player event:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error logging player event:', error);
      return null;
    }
  }

  /**
   * Log squad join event
   */
  static async logSquadJoin(
    playerId: string,
    squadId: string,
    squadName: string,
    playerName: string,
    role: string = 'player'
  ): Promise<string | null> {
    return this.logEvent({
      player_id: playerId,
      event_type: 'squad_joined',
      description: `${playerName} joined squad ${squadName} as ${role}`,
      event_data: { squad_name: squadName, role },
      squad_id: squadId
    });
  }

  /**
   * Log squad leave event
   */
  static async logSquadLeave(
    playerId: string,
    squadId: string,
    squadName: string,
    playerName: string,
    reason?: string
  ): Promise<string | null> {
    let description = `${playerName} left squad ${squadName}`;
    if (reason) {
      description += ` (${reason})`;
    }

    return this.logEvent({
      player_id: playerId,
      event_type: 'squad_left',
      description,
      event_data: { squad_name: squadName, reason },
      squad_id: squadId
    });
  }

  /**
   * Log squad kick event
   */
  static async logSquadKick(
    playerId: string,
    squadId: string,
    squadName: string,
    playerName: string,
    kickedByPlayerId: string,
    reason?: string
  ): Promise<string | null> {
    let description = `${playerName} was kicked from squad ${squadName}`;
    if (reason) {
      description += ` (${reason})`;
    }

    return this.logEvent({
      player_id: playerId,
      event_type: 'squad_kicked',
      description,
      event_data: { squad_name: squadName, reason, kicked_by: kickedByPlayerId },
      squad_id: squadId,
      related_player_id: kickedByPlayerId
    });
  }

  /**
   * Log squad promotion event
   */
  static async logSquadPromotion(
    playerId: string,
    squadId: string,
    squadName: string,
    playerName: string,
    fromRole: string,
    toRole: string,
    promotedByPlayerId?: string
  ): Promise<string | null> {
    return this.logEvent({
      player_id: playerId,
      event_type: 'squad_promoted',
      description: `${playerName} was promoted from ${fromRole} to ${toRole} in ${squadName}`,
      event_data: { 
        squad_name: squadName, 
        previous_role: fromRole, 
        new_role: toRole,
        promoted_by: promotedByPlayerId
      },
      squad_id: squadId,
      related_player_id: promotedByPlayerId
    });
  }

  /**
   * Log squad demotion event
   */
  static async logSquadDemotion(
    playerId: string,
    squadId: string,
    squadName: string,
    playerName: string,
    fromRole: string,
    toRole: string,
    demotedByPlayerId?: string
  ): Promise<string | null> {
    return this.logEvent({
      player_id: playerId,
      event_type: 'squad_demoted',
      description: `${playerName} was demoted from ${fromRole} to ${toRole} in ${squadName}`,
      event_data: { 
        squad_name: squadName, 
        previous_role: fromRole, 
        new_role: toRole,
        demoted_by: demotedByPlayerId
      },
      squad_id: squadId,
      related_player_id: demotedByPlayerId
    });
  }

  /**
   * Log squad ownership transfer
   */
  static async logSquadOwnershipTransfer(
    oldCaptainId: string,
    newCaptainId: string,
    squadId: string
  ): Promise<void> {
    try {
      await supabase.rpc('log_squad_ownership_transfer', {
        p_old_captain_id: oldCaptainId,
        p_new_captain_id: newCaptainId,
        p_squad_id: squadId
      });
    } catch (error) {
      console.error('Error logging squad ownership transfer:', error);
    }
  }

  /**
   * Log free agent activity
   */
  static async logFreeAgentActivity(
    playerId: string,
    action: 'joined' | 'left',
    reason?: string
  ): Promise<void> {
    try {
      await supabase.rpc('log_free_agent_activity', {
        p_player_id: playerId,
        p_action: action,
        p_reason: reason
      });
    } catch (error) {
      console.error('Error logging free agent activity:', error);
    }
  }

  /**
   * Log match participation
   */
  static async logMatchParticipation(
    playerId: string,
    matchId: string,
    result: 'win' | 'loss' | 'draw',
    scoreData?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.rpc('log_match_participation', {
        p_player_id: playerId,
        p_match_id: matchId,
        p_result: result,
        p_score_data: scoreData || {}
      });
    } catch (error) {
      console.error('Error logging match participation:', error);
    }
  }

  /**
   * Log tournament win
   */
  static async logTournamentWin(
    playerId: string,
    tournamentName: string,
    playerName: string,
    squadId?: string,
    squadName?: string
  ): Promise<string | null> {
    let description = `${playerName} won tournament: ${tournamentName}`;
    if (squadName) {
      description += ` (representing ${squadName})`;
    }

    return this.logEvent({
      player_id: playerId,
      event_type: 'tournament_win',
      description,
      event_data: { 
        tournament_name: tournamentName,
        squad_name: squadName
      },
      squad_id: squadId
    });
  }

  /**
   * Log ELO change
   */
  static async logEloChange(
    playerId: string,
    playerName: string,
    oldElo: number,
    newElo: number,
    matchId?: string
  ): Promise<string | null> {
    const change = newElo - oldElo;
    const changeText = change > 0 ? `+${change}` : change.toString();
    
    return this.logEvent({
      player_id: playerId,
      event_type: 'elo_change',
      description: `${playerName}'s ELO changed from ${oldElo} to ${newElo} (${changeText})`,
      event_data: { 
        old_elo: oldElo,
        new_elo: newElo,
        change: change,
        match_id: matchId
      }
    });
  }

  /**
   * Log donation made
   */
  static async logDonation(
    playerId: string,
    playerName: string,
    amount: number,
    currency: string = 'USD',
    donationId?: string
  ): Promise<string | null> {
    return this.logEvent({
      player_id: playerId,
      event_type: 'donation_made',
      description: `${playerName} made a donation of $${amount} ${currency}`,
      event_data: { 
        amount,
        currency,
        donation_id: donationId
      }
    });
  }

  /**
   * Log perk purchase
   */
  static async logPerkPurchase(
    playerId: string,
    playerName: string,
    perkName: string,
    amount: number,
    currency: string = 'USD'
  ): Promise<string | null> {
    return this.logEvent({
      player_id: playerId,
      event_type: 'perk_purchased',
      description: `${playerName} purchased perk: ${perkName} for $${amount} ${currency}`,
      event_data: { 
        perk_name: perkName,
        amount,
        currency
      }
    });
  }
}

// Export convenience functions
export const logPlayerEvent = PlayerEventLogger.logEvent;
export const logSquadJoin = PlayerEventLogger.logSquadJoin;
export const logSquadLeave = PlayerEventLogger.logSquadLeave;
export const logSquadKick = PlayerEventLogger.logSquadKick;
export const logSquadPromotion = PlayerEventLogger.logSquadPromotion;
export const logSquadDemotion = PlayerEventLogger.logSquadDemotion;
export const logSquadOwnershipTransfer = PlayerEventLogger.logSquadOwnershipTransfer;
export const logFreeAgentActivity = PlayerEventLogger.logFreeAgentActivity;
export const logMatchParticipation = PlayerEventLogger.logMatchParticipation;
export const logTournamentWin = PlayerEventLogger.logTournamentWin;
export const logEloChange = PlayerEventLogger.logEloChange;
export const logDonation = PlayerEventLogger.logDonation;
 