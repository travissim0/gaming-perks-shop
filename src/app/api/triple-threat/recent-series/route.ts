import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    // Get distinct series with their info (using text-based aliases)
    const { data, error } = await supabaseAdmin
      .from('tt_player_stats')
      .select('series_id, recorded_at, player_alias, team_name, result, game_number_in_series')
      .not('series_id', 'is', null)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('Error fetching series:', error);
      return NextResponse.json({
        error: 'Failed to fetch series',
        details: error.message
      }, { status: 500 });
    }

    // Group by series_id
    const seriesMap = new Map<string, {
      series_id: string;
      game_count: number;
      first_game_date: string;
      winning_team: string;
      losing_team: string;
      winning_players: Set<string>;
      losing_players: Set<string>;
    }>();

    (data || []).forEach((record: any) => {
      const seriesId = record.series_id;
      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          series_id: seriesId,
          game_count: 0,
          first_game_date: record.recorded_at,
          winning_team: '',
          losing_team: '',
          winning_players: new Set(),
          losing_players: new Set()
        });
      }

      const series = seriesMap.get(seriesId)!;
      
      // Track game count (each player creates a record, so divide by unique players later)
      if (record.game_number_in_series && record.game_number_in_series > series.game_count) {
        series.game_count = record.game_number_in_series;
      }
      
      // Add players to their respective teams
      if (record.result === 'win') {
        if (record.player_alias) series.winning_players.add(record.player_alias);
        if (record.team_name && !series.winning_team) series.winning_team = record.team_name;
      } else if (record.result === 'loss' || record.result === 'lose') {
        if (record.player_alias) series.losing_players.add(record.player_alias);
        if (record.team_name && !series.losing_team) series.losing_team = record.team_name;
      }
      
      // Keep the earliest date
      if (new Date(record.recorded_at) < new Date(series.first_game_date)) {
        series.first_game_date = record.recorded_at;
      }
    });

    // Format series data
    const seriesWithPlayers = Array.from(seriesMap.values())
      .sort((a, b) => new Date(b.first_game_date).getTime() - new Date(a.first_game_date).getTime())
      .slice(0, limit)
      .map((series) => {
        // Determine series type based on game count
        let seriesType = 'Single Game';
        if (series.game_count >= 9) seriesType = 'BO9';
        else if (series.game_count >= 5) seriesType = 'BO5';
        else if (series.game_count >= 3) seriesType = 'BO3';
        else if (series.game_count > 1) seriesType = `BO${series.game_count}`;
        
        return {
          series_id: series.series_id,
          game_count: series.game_count || 1,
          first_game_date: series.first_game_date,
          winning_team: series.winning_team || '',
          losing_team: series.losing_team || '',
          winning_players: Array.from(series.winning_players).filter(p => p),
          losing_players: Array.from(series.losing_players).filter(p => p),
          series_type: seriesType
        };
      });

    console.log('📊 Recent series data sample:', seriesWithPlayers.length > 0 ? seriesWithPlayers[0] : 'No data');
    
    return NextResponse.json({
      success: true,
      series: seriesWithPlayers
    });

  } catch (error: any) {
    console.error('Error in recent series API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

