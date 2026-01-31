import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CORS headers for game server communication
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-api-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// ─── Authentication ────────────────────────────────────────────────────────────

function authenticateRequest(request: NextRequest, body: any): boolean {
  const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expectedKey) return false;

  // Method 1: Supabase-style headers (Authorization Bearer + apikey)
  const authHeader = request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('apikey');
  if (authHeader && apiKeyHeader) {
    const providedKey = authHeader.replace('Bearer ', '');
    if (providedKey === expectedKey && apiKeyHeader === expectedKey) return true;
  }

  // Method 2: x-api-key header (generic API key auth)
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey && xApiKey === expectedKey) return true;

  // Method 3: Body auth_key fallback (for edge networks that strip headers)
  if (body?.auth_key && body.auth_key === expectedKey) return true;

  return false;
}

// ─── POST - Receive stats from game server ─────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('=== BO9 Dueling Stats Request ===');
    console.log('Action:', body.action);

    if (!authenticateRequest(request, body)) {
      console.log('BO9 Stats: Authentication failed');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400, headers: corsHeaders }
      );
    }

    // ── Test action ──
    if (action === 'test') {
      console.log('BO9 Stats: Test ping received');
      return NextResponse.json(
        { success: true, message: 'BO9 stats endpoint is working', timestamp: new Date().toISOString() },
        { headers: corsHeaders }
      );
    }

    // ── Round result ──
    if (action === 'round_result') {
      return await handleRoundResult(body);
    }

    // ── Series complete ──
    if (action === 'series_complete') {
      return await handleSeriesComplete(body);
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400, headers: corsHeaders }
    );

  } catch (error) {
    console.error('BO9 Stats POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function handleRoundResult(body: any) {
  const required = ['series_id', 'round_number', 'winner_alias', 'loser_alias'];
  for (const field of required) {
    if (!body[field] && body[field] !== 0) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from('dueling_bo9_rounds')
    .insert({
      series_id: body.series_id,
      round_number: body.round_number,
      winner_alias: body.winner_alias,
      loser_alias: body.loser_alias,
      winner_hp_remaining: body.winner_hp_remaining ?? null,
      duration_seconds: body.duration_seconds ?? null,
      winner_shots_fired: body.winner_shots_fired ?? null,
      winner_shots_hit: body.winner_shots_hit ?? null,
      loser_shots_fired: body.loser_shots_fired ?? null,
      loser_shots_hit: body.loser_shots_hit ?? null,
      winner_kills: body.winner_kills ?? null,
      loser_kills: body.loser_kills ?? null,
      player1_series_score: body.player1_series_score ?? null,
      player2_series_score: body.player2_series_score ?? null,
      arena_name: body.arena_name ?? null,
    });

  if (error) {
    console.error('BO9 round insert error:', error);
    return NextResponse.json(
      { error: 'Failed to insert round', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  console.log(`BO9 Stats: Round ${body.round_number} recorded for series ${body.series_id}`);
  return NextResponse.json(
    { success: true, message: `Round ${body.round_number} recorded` },
    { headers: corsHeaders }
  );
}

async function handleSeriesComplete(body: any) {
  const required = ['series_id', 'player1_alias', 'player2_alias', 'winner_alias'];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from('dueling_bo9_series')
    .insert({
      series_id: body.series_id,
      player1_alias: body.player1_alias,
      player2_alias: body.player2_alias,
      winner_alias: body.winner_alias,
      final_score: body.final_score ?? null,
      total_rounds: body.total_rounds ?? null,
      total_duration_seconds: body.total_duration_seconds ?? null,
      player1_total_shots_fired: body.player1_total_shots_fired ?? null,
      player1_total_shots_hit: body.player1_total_shots_hit ?? null,
      player1_accuracy_pct: body.player1_accuracy_pct ?? null,
      player1_total_kills: body.player1_total_kills ?? null,
      player2_total_shots_fired: body.player2_total_shots_fired ?? null,
      player2_total_shots_hit: body.player2_total_shots_hit ?? null,
      player2_accuracy_pct: body.player2_accuracy_pct ?? null,
      player2_total_kills: body.player2_total_kills ?? null,
      arena_name: body.arena_name ?? null,
      started_at: body.started_at ?? null,
      completed_at: body.completed_at ?? new Date().toISOString(),
    });

  if (error) {
    console.error('BO9 series insert error:', error);
    return NextResponse.json(
      { error: 'Failed to insert series', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }

  console.log(`BO9 Stats: Series ${body.series_id} completed - ${body.winner_alias} wins ${body.final_score}`);
  return NextResponse.json(
    { success: true, message: 'Series recorded', series_id: body.series_id },
    { headers: corsHeaders }
  );
}

// ─── GET - Serve data to the page ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'recent_series';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const player = searchParams.get('player');
    const seriesId = searchParams.get('series_id');

    // ── Recent series listing ──
    if (type === 'recent_series') {
      let query = supabaseAdmin
        .from('dueling_bo9_series')
        .select('*', { count: 'exact' })
        .order('completed_at', { ascending: false });

      if (player && player.trim()) {
        query = query.or(`player1_alias.ilike.%${player.trim()}%,player2_alias.ilike.%${player.trim()}%`);
      }

      const { data, error, count } = await query.range(offset, offset + limit - 1);

      if (error) {
        console.error('BO9 recent series query error:', error);
        return NextResponse.json({ error: 'Failed to fetch series', details: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: data || [],
        pagination: { total: count || 0, offset, limit, hasMore: (offset + limit) < (count || 0) },
      });
    }

    // ── Series detail (with rounds) ──
    if (type === 'series_detail' && seriesId) {
      const [seriesResult, roundsResult] = await Promise.all([
        supabaseAdmin
          .from('dueling_bo9_series')
          .select('*')
          .eq('series_id', seriesId)
          .single(),
        supabaseAdmin
          .from('dueling_bo9_rounds')
          .select('*')
          .eq('series_id', seriesId)
          .order('round_number', { ascending: true }),
      ]);

      if (seriesResult.error) {
        return NextResponse.json({ error: 'Series not found', details: seriesResult.error.message }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        series: seriesResult.data,
        rounds: roundsResult.data || [],
      });
    }

    // ── Aggregate player stats across all BO9 series ──
    if (type === 'player_stats') {
      const { data: allSeries, error } = await supabaseAdmin
        .from('dueling_bo9_series')
        .select('*')
        .order('completed_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch stats', details: error.message }, { status: 500 });
      }

      // Aggregate per-player stats from series data
      const playerMap: Record<string, {
        alias: string;
        series_played: number;
        series_won: number;
        series_lost: number;
        total_rounds: number;
        total_kills: number;
        total_shots_fired: number;
        total_shots_hit: number;
        total_duration_seconds: number;
      }> = {};

      for (const s of (allSeries || [])) {
        // Player 1
        const p1 = s.player1_alias;
        if (!playerMap[p1]) {
          playerMap[p1] = { alias: p1, series_played: 0, series_won: 0, series_lost: 0, total_rounds: 0, total_kills: 0, total_shots_fired: 0, total_shots_hit: 0, total_duration_seconds: 0 };
        }
        playerMap[p1].series_played++;
        if (s.winner_alias === p1) playerMap[p1].series_won++;
        else playerMap[p1].series_lost++;
        playerMap[p1].total_rounds += s.total_rounds || 0;
        playerMap[p1].total_kills += s.player1_total_kills || 0;
        playerMap[p1].total_shots_fired += s.player1_total_shots_fired || 0;
        playerMap[p1].total_shots_hit += s.player1_total_shots_hit || 0;
        playerMap[p1].total_duration_seconds += s.total_duration_seconds || 0;

        // Player 2
        const p2 = s.player2_alias;
        if (!playerMap[p2]) {
          playerMap[p2] = { alias: p2, series_played: 0, series_won: 0, series_lost: 0, total_rounds: 0, total_kills: 0, total_shots_fired: 0, total_shots_hit: 0, total_duration_seconds: 0 };
        }
        playerMap[p2].series_played++;
        if (s.winner_alias === p2) playerMap[p2].series_won++;
        else playerMap[p2].series_lost++;
        playerMap[p2].total_rounds += s.total_rounds || 0;
        playerMap[p2].total_kills += s.player2_total_kills || 0;
        playerMap[p2].total_shots_fired += s.player2_total_shots_fired || 0;
        playerMap[p2].total_shots_hit += s.player2_total_shots_hit || 0;
        playerMap[p2].total_duration_seconds += s.total_duration_seconds || 0;
      }

      // Convert to sorted array
      let playerStats = Object.values(playerMap).map(p => ({
        ...p,
        win_rate: p.series_played > 0 ? Math.round((p.series_won / p.series_played) * 10000) / 100 : 0,
        accuracy_pct: p.total_shots_fired > 0 ? Math.round((p.total_shots_hit / p.total_shots_fired) * 10000) / 100 : 0,
      }));

      // Filter by player name if specified
      if (player && player.trim()) {
        const search = player.trim().toLowerCase();
        playerStats = playerStats.filter(p => p.alias.toLowerCase().includes(search));
      }

      // Sort by series won descending
      playerStats.sort((a, b) => b.series_won - a.series_won || b.win_rate - a.win_rate);

      return NextResponse.json({
        success: true,
        data: playerStats.slice(offset, offset + limit),
        pagination: { total: playerStats.length, offset, limit, hasMore: (offset + limit) < playerStats.length },
      });
    }

    // ── Aggregate totals for stat cards ──
    if (type === 'aggregates') {
      const { data: allSeries, error } = await supabaseAdmin
        .from('dueling_bo9_series')
        .select('total_rounds, total_duration_seconds, player1_accuracy_pct, player2_accuracy_pct');

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch aggregates', details: error.message }, { status: 500 });
      }

      const series = allSeries || [];
      const totalSeries = series.length;
      const totalRounds = series.reduce((sum, s) => sum + (s.total_rounds || 0), 0);
      const totalDuration = series.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0);

      let accuracySum = 0;
      let accuracyCount = 0;
      for (const s of series) {
        if (s.player1_accuracy_pct != null) { accuracySum += Number(s.player1_accuracy_pct); accuracyCount++; }
        if (s.player2_accuracy_pct != null) { accuracySum += Number(s.player2_accuracy_pct); accuracyCount++; }
      }

      return NextResponse.json({
        success: true,
        data: {
          total_series: totalSeries,
          total_rounds: totalRounds,
          avg_series_duration_seconds: totalSeries > 0 ? Math.round(totalDuration / totalSeries) : 0,
          avg_accuracy_pct: accuracyCount > 0 ? Math.round((accuracySum / accuracyCount) * 100) / 100 : 0,
        },
      });
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });

  } catch (error) {
    console.error('BO9 Stats GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
