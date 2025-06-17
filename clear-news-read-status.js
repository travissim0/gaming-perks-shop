const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearReadStatus() {
  try {
    console.log('🧹 Clearing all news read status entries...');
    
    // Get current read status count
    const { data: currentReads, error: countError } = await supabase
      .from('news_post_reads')
      .select('*');
      
    if (countError) {
      console.error('Error counting reads:', countError);
      return;
    }
    
    console.log(`📊 Found ${currentReads?.length || 0} read status entries`);
    
    if (currentReads && currentReads.length > 0) {
      // Clear all read status entries
      const { error: deleteError } = await supabase
        .from('news_post_reads')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
        
      if (deleteError) {
        console.error('Error clearing read status:', deleteError);
        return;
      }
      
      console.log('✅ Successfully cleared all read status entries');
      console.log('🌟 All news posts will now show as unread with glow effects!');
    } else {
      console.log('ℹ️ No read status entries found to clear');
    }
    
    // Show current news posts
    const { data: posts, error: postsError } = await supabase
      .from('news_posts')
      .select('id, title, status')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
      
    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return;
    }
    
    console.log('\n📰 Current published news posts:');
    posts?.forEach((post, index) => {
      console.log(`${index + 1}. ${post.title} (ID: ${post.id})`);
    });
    
    console.log('\n💡 Tips:');
    console.log('- Refresh your browser to see posts as unread');
    console.log('- Unread posts should have glowing borders and shimmer effects');
    console.log('- Posts will be marked as read after viewing for 3+ seconds');
    console.log('- You can run this script again to reset read status');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Allow clearing specific user's read status
async function clearUserReadStatus(userId) {
  try {
    console.log(`🧹 Clearing read status for user: ${userId}`);
    
    const { data: userReads, error: countError } = await supabase
      .from('news_post_reads')
      .select('*')
      .eq('user_id', userId);
      
    if (countError) {
      console.error('Error counting user reads:', countError);
      return;
    }
    
    console.log(`📊 Found ${userReads?.length || 0} read entries for this user`);
    
    if (userReads && userReads.length > 0) {
      const { error: deleteError } = await supabase
        .from('news_post_reads')
        .delete()
        .eq('user_id', userId);
        
      if (deleteError) {
        console.error('Error clearing user read status:', deleteError);
        return;
      }
      
      console.log('✅ Successfully cleared read status for user');
      console.log('🌟 All news posts will now show as unread for this user!');
    } else {
      console.log('ℹ️ No read status entries found for this user');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the appropriate function based on command line arguments
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === '--user' && args[1]) {
  clearUserReadStatus(args[1]);
} else if (args.length > 0 && args[0] === '--help') {
  console.log('📖 Usage:');
  console.log('  node clear-news-read-status.js                    # Clear all read status');
  console.log('  node clear-news-read-status.js --user <user-id>   # Clear specific user read status');
  console.log('  node clear-news-read-status.js --help             # Show this help');
} else {
  clearReadStatus();
} 