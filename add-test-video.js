const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for admin operations
);

async function addTestVideo() {
  const gameId = 'ovd_20250621_214936';
  
  console.log('🎬 Adding test video data for game:', gameId);
  
  try {
    // First check if there's already a match for this game
    const { data: existingMatch, error: checkError } = await supabase
      .from('matches')
      .select('id, title, game_id')
      .eq('game_id', gameId)
      .single();
      
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('❌ Error checking existing match:', checkError);
      return;
    }
    
    if (existingMatch) {
      console.log('📋 Found existing match:', existingMatch.title);
      
      // Update the existing match with video data
      const { data: updatedMatch, error: updateError } = await supabase
        .from('matches')
        .update({
          youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Roll for testing
          video_title: 'OvD Match Recording - Test Video',
          video_description: 'This is a test video for the YouTube embedding functionality on the game stats page.',
          video_thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
        })
        .eq('id', existingMatch.id)
        .select();
        
      if (updateError) {
        console.error('❌ Error updating match:', updateError);
      } else {
        console.log('✅ Updated match with video data:', updatedMatch);
      }
    } else {
      console.log('📝 Creating new match for game...');
      
      // Create a new match with video data
      const { data: newMatch, error: createError } = await supabase
        .from('matches')
        .insert({
          title: 'OvD Test Match - ' + gameId,
          description: 'Test match created for video embedding functionality',
          game_id: gameId,
          youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          video_title: 'OvD Match Recording - Test Video',
          video_description: 'This is a test video for the YouTube embedding functionality on the game stats page.',
          video_thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          status: 'completed',
          created_at: new Date().toISOString()
        })
        .select();
        
      if (createError) {
        console.error('❌ Error creating match:', createError);
      } else {
        console.log('✅ Created new match with video data:', newMatch);
      }
    }
    
    // Test the API endpoint
    console.log('\n🧪 Testing API endpoint...');
    const response = await fetch(`http://localhost:3000/api/player-stats/game/${gameId}`);
    if (response.ok) {
      const apiData = await response.json();
      console.log('✅ API Response Success:', apiData.success);
      console.log('📺 Video Info from API:', JSON.stringify(apiData.data?.videoInfo, null, 2));
    } else {
      console.log('❌ API Response failed:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('❌ Operation failed:', error);
  }
}

addTestVideo(); 