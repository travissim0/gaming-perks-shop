const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    });
    
    console.log('Loaded .env.local file');
  } catch (error) {
    console.log('Could not load .env.local, trying environment variables');
  }
}

loadEnvLocal();

// Hardcode the values if needed (you can replace these with your actual values)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debugDuelingDatabase() {
  console.log('=== DEBUGGING DUELING DATABASE ===');
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Service Key:', SUPABASE_SERVICE_KEY ? 'Set' : 'Not set');
  
  try {
    // Check recent matches
    console.log('\n1. Recent Dueling Matches:');
    const { data: matches, error: matchesError } = await supabase
      .from('recent_dueling_matches')
      .select('*')
      .limit(5)
      .order('completed_at', { ascending: false });
    
    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
    } else {
      console.log(`Found ${matches.length} matches:`);
      matches.forEach(match => {
        console.log(`  Match ${match.id}: ${match.player1_name} vs ${match.player2_name}`);
        console.log(`    Score: ${match.player1_rounds_won}-${match.player2_rounds_won} (${match.total_rounds} rounds)`);
        console.log(`    Status: ${match.match_status}, Type: ${match.match_type}`);
        console.log(`    Rounds data: ${typeof match.rounds_data} - ${JSON.stringify(match.rounds_data).substring(0, 100)}...`);
        console.log('');
      });
    }

    // Check raw dueling_matches table
    console.log('\n2. Raw Dueling Matches Table:');
    const { data: rawMatches, error: rawError } = await supabase
      .from('dueling_matches')
      .select('*')
      .limit(5)
      .order('completed_at', { ascending: false });
    
    if (rawError) {
      console.error('Error fetching raw matches:', rawError);
    } else {
      console.log(`Found ${rawMatches.length} raw matches:`);
      rawMatches.forEach(match => {
        console.log(`  Match ${match.id}: ${match.player1_name} vs ${match.player2_name}`);
        console.log(`    Score: ${match.player1_rounds_won}-${match.player2_rounds_won} (${match.total_rounds} rounds)`);
        console.log(`    Status: ${match.match_status}, Winner: ${match.winner_name}`);
        console.log('');
      });
    }

    // Check rounds for the latest match
    if (rawMatches.length > 0) {
      const latestMatchId = rawMatches[0].id;
      console.log(`\n3. Rounds for Match ${latestMatchId}:`);
      
      const { data: rounds, error: roundsError } = await supabase
        .from('dueling_rounds')
        .select('*')
        .eq('match_id', latestMatchId)
        .order('round_number');
      
      if (roundsError) {
        console.error('Error fetching rounds:', roundsError);
      } else {
        console.log(`Found ${rounds.length} rounds:`);
        rounds.forEach(round => {
          console.log(`  Round ${round.round_number}: ${round.winner_name} beats ${round.loser_name}`);
          console.log(`    HP: ${round.winner_hp_left} vs ${round.loser_hp_left}`);
          console.log(`    Duration: ${round.round_duration_seconds}s`);
        });
      }

      // Check kills for the latest match
      console.log(`\n4. Kills for Match ${latestMatchId}:`);
      
      const { data: kills, error: killsError } = await supabase
        .from('dueling_kills')
        .select('*')
        .eq('match_id', latestMatchId)
        .order('kill_timestamp');
      
      if (killsError) {
        console.error('Error fetching kills:', killsError);
      } else {
        console.log(`Found ${kills.length} kills:`);
        kills.forEach(kill => {
          console.log(`  ${kill.killer_name} killed ${kill.victim_name}`);
          console.log(`    Shots: ${kill.shots_fired}/${kill.shots_hit} (${((kill.shots_hit/kill.shots_fired)*100).toFixed(1)}%)`);
          console.log(`    HP: ${kill.victim_hp_before} -> ${kill.victim_hp_after}`);
        });
      }
    }

  } catch (error) {
    console.error('Error in debug script:', error);
  }
}

debugDuelingDatabase(); 