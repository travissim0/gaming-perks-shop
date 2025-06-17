const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkReadStatus() {
  try {
    console.log('📊 Checking news read status...\n');
    console.log('Environment check:');
    console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Found' : 'Missing');
    console.log('SERVICE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Found' : 'Missing');
    console.log('');
    
    // Get all published posts
    const { data: posts, error: postsError } = await supabase
      .from('news_posts')
      .select('id, title, status, view_count, created_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
      
    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return;
    }
    
    console.log(`📰 Found ${posts?.length || 0} published news posts:\n`);
    
    for (const post of posts || []) {
      console.log(`📄 "${post.title}"`);
      console.log(`   ID: ${post.id}`);
      console.log(`   Views: ${post.view_count || 0}`);
      console.log(`   Created: ${new Date(post.created_at).toLocaleDateString()}`);
      
      // Get read status for this post
      const { data: reads, error: readsError } = await supabase
        .from('news_post_reads')
        .select(`
          user_id,
          read_at,
          reading_time_seconds,
          profiles!inner(in_game_alias, email)
        `)
        .eq('post_id', post.id);
        
      if (readsError) {
        console.log('   ❌ Error fetching read status');
      } else if (reads && reads.length > 0) {
        console.log(`   ✅ Read by ${reads.length} user(s):`);
        reads.forEach((read, index) => {
          const alias = read.profiles?.in_game_alias || 'Unknown';
          const email = read.profiles?.email || 'Unknown';
          const readTime = new Date(read.read_at).toLocaleString();
          console.log(`      ${index + 1}. ${alias} (${email}) - ${readTime}`);
        });
      } else {
        console.log('   🌟 Unread by all users (will show glow effect)');
      }
      console.log('');
    }
    
    // Show total stats
    const { data: totalReads, error: totalError } = await supabase
      .from('news_post_reads')
      .select('*');
      
    if (!totalError) {
      console.log(`📊 Total read entries in database: ${totalReads?.length || 0}`);
    }
    
    console.log('\n💡 Database Info:');
    console.log('- Read status is stored in the "news_post_reads" table');
    console.log('- Each entry links a user_id to a post_id with read_at timestamp');
    console.log('- Posts without entries in this table show as unread with glow effects');
    console.log('- Run "node clear-news-read-status.js" to reset all read status');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkReadStatus(); 