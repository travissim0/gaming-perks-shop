import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'all', 'top-game-wins', 'top-series-wins'
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'game_wins';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    if (type === 'top-game-wins') {
      // Get top players by game wins
      const { data, error } = await supabase
        .rpc('get_tt_top_players_by_game_wins', { limit_count: limit });

      if (error) {
        console.error('Error fetching top game wins:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        data: data || [],
        type: 'top-game-wins'
      });
    }

    if (type === 'top-series-wins') {
      // Get top players by series wins
      const { data, error } = await supabase
        .rpc('get_tt_top_players_by_series_wins', { limit_count: limit });

      if (error) {
        console.error('Error fetching top series wins:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        data: data || [],
        type: 'top-series-wins'
      });
    }

    // Get all player records with search and sorting
    let query = supabase
      .from('tt_player_records')
      .select(`
        player_id,
        player_alias,
        game_wins,
        game_losses,
        series_wins,
        series_losses,
        kills,
        deaths,
        created_at,
        updated_at
      `);

    // Apply search filter
    if (search) {
      query = query.ilike('player_alias', `%${search}%`);
    }

    // Apply sorting
    const validSortColumns = ['player_alias', 'game_wins', 'game_losses', 'series_wins', 'series_losses', 'updated_at'];
    if (validSortColumns.includes(sortBy)) {
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
    } else {
      // Default sort by game wins descending
      query = query.order('game_wins', { ascending: false });
    }

    // Apply limit
    if (limit > 0) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching player records:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate additional stats for each player
    const enrichedData = (data || []).map((player: any) => {
      const totalGames = player.game_wins + player.game_losses;
      const totalSeries = player.series_wins + player.series_losses;
      const kills = player.kills || 0;
      const deaths = player.deaths || 0;
      const kdRatio = deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills;

      return {
        ...player,
        kills,
        deaths,
        kd_ratio: kdRatio,
        total_games: totalGames,
        total_series: totalSeries,
        game_win_rate: totalGames > 0 ? Math.round((player.game_wins / totalGames) * 100 * 100) / 100 : 0,
        series_win_rate: totalSeries > 0 ? Math.round((player.series_wins / totalSeries) * 100 * 100) / 100 : 0
      };
    });

    return NextResponse.json({ 
      success: true, 
      data: enrichedData,
      type: 'all',
      count: enrichedData.length
    });

  } catch (error: any) {
    console.error('Error in Triple Threat stats API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify the user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin permissions
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, ctf_role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const hasPermission = profile.is_admin || profile.ctf_role === 'ctf_admin';
    if (!hasPermission) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action, winner_id, loser_id, winner_alias, loser_alias, type } = body;

    if (action === 'update_game_stats') {
      // Update game statistics
      const { error } = await supabase
        .rpc('update_tt_player_game_stats', {
          p_winner_id: winner_id,
          p_loser_id: loser_id,
          p_winner_alias: winner_alias,
          p_loser_alias: loser_alias
        });

      if (error) {
        console.error('Error updating game stats:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Game statistics updated successfully' 
      });
    }

    if (action === 'update_series_stats') {
      // Update series statistics
      const { error } = await supabase
        .rpc('update_tt_player_series_stats', {
          p_winner_id: winner_id,
          p_loser_id: loser_id,
          p_winner_alias: winner_alias,
          p_loser_alias: loser_alias
        });

      if (error) {
        console.error('Error updating series stats:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Series statistics updated successfully' 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in Triple Threat stats POST:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
