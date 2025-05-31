const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deployForumFixes() {
  try {
    console.log('🚀 Deploying forum fixes...');
    
    // Step 1: Add posts_count column to profiles if it doesn't exist
    console.log('📝 Adding posts_count column to profiles...');
    try {
      await supabase.rpc('exec_sql', { 
        sql_text: `
          DO $$ 
          BEGIN
              IF NOT EXISTS (
                  SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' AND table_name = 'profiles' 
                  AND column_name = 'posts_count'
              ) THEN
                  ALTER TABLE profiles ADD COLUMN posts_count INTEGER DEFAULT 0;
                  
                  -- Initialize post counts for existing users
                  UPDATE profiles SET posts_count = (
                      SELECT COUNT(*) FROM forum_posts 
                      WHERE author_id = profiles.id AND is_deleted = false
                  );
              END IF;
          END $$;
        `
      });
      console.log('✅ Posts count column added');
    } catch (err) {
      console.warn('⚠️  Posts count column may already exist:', err.message);
    }
    
    // Step 2: Add simple DELETE policy for forum_posts (authors only)
    console.log('📝 Adding simple DELETE policy for forum_posts...');
    try {
      await supabase.rpc('exec_sql', { 
        sql_text: `
          DROP POLICY IF EXISTS "Authors and moderators can delete posts" ON forum_posts;
          DROP POLICY IF EXISTS "Authors can delete their posts" ON forum_posts;
          DROP POLICY IF EXISTS "Users can delete own posts" ON forum_posts;
          
          CREATE POLICY "Authors can delete their own posts" ON forum_posts
              FOR DELETE USING (auth.uid() = author_id);
        `
      });
      console.log('✅ Simple DELETE policy added');
    } catch (err) {
      console.warn('⚠️  DELETE policy creation failed:', err.message);
    }
    
    // Step 3: Create post count update function
    console.log('📝 Creating post count update function...');
    try {
      await supabase.rpc('exec_sql', { 
        sql_text: `
          CREATE OR REPLACE FUNCTION update_user_post_count()
          RETURNS TRIGGER AS $$
          BEGIN
              IF TG_OP = 'INSERT' THEN
                  UPDATE profiles 
                  SET posts_count = posts_count + 1
                  WHERE id = NEW.author_id;
                  RETURN NEW;
              ELSIF TG_OP = 'UPDATE' THEN
                  IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
                      UPDATE profiles 
                      SET posts_count = GREATEST(posts_count - 1, 0)
                      WHERE id = OLD.author_id;
                  ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
                      UPDATE profiles 
                      SET posts_count = posts_count + 1
                      WHERE id = NEW.author_id;
                  END IF;
                  RETURN NEW;
              ELSIF TG_OP = 'DELETE' THEN
                  IF OLD.is_deleted = false THEN
                      UPDATE profiles 
                      SET posts_count = GREATEST(posts_count - 1, 0)
                      WHERE id = OLD.author_id;
                  END IF;
                  RETURN OLD;
              END IF;
              RETURN NULL;
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
        `
      });
      console.log('✅ Post count function created');
    } catch (err) {
      console.warn('⚠️  Function creation failed:', err.message);
    }
    
    // Step 4: Create trigger
    console.log('📝 Creating post count trigger...');
    try {
      await supabase.rpc('exec_sql', { 
        sql_text: `
          DROP TRIGGER IF EXISTS update_user_post_count_trigger ON forum_posts;
          CREATE TRIGGER update_user_post_count_trigger
              AFTER INSERT OR UPDATE OR DELETE ON forum_posts
              FOR EACH ROW EXECUTE FUNCTION update_user_post_count();
        `
      });
      console.log('✅ Post count trigger created');
    } catch (err) {
      console.warn('⚠️  Trigger creation failed:', err.message);
    }
    
    // Verify the deployment
    console.log('🔍 Verifying deployment...');
    
    // Check if posts_count column exists
    const { data: columns } = await supabase
      .rpc('sql', {
        query: `
          SELECT column_name
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'profiles' 
          AND column_name = 'posts_count';
        `
      });
    
    console.log('✓ Posts count column exists:', columns && columns.length > 0);
    
    // Check if delete policy exists
    const { data: policies } = await supabase
      .rpc('sql', {
        query: `
          SELECT policyname, qual
          FROM pg_policies 
          WHERE schemaname = 'public' AND tablename = 'forum_posts' 
          AND cmd = 'DELETE';
        `
      });
    
    console.log('✓ Delete policies found:', policies?.length || 0);
    if (policies && policies.length > 0) {
      console.log('✓ Policy details:');
      policies.forEach(p => {
        console.log(`  - ${p.policyname}: ${p.qual}`);
      });
    }
    
    console.log('🎉 Forum fixes deployment completed!');
    
  } catch (error) {
    console.error('💥 Deployment failed:', error);
  }
}

deployForumFixes(); 