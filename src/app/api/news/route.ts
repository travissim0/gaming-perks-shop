import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

interface NewsPost {
  id: string;
  title: string;
  subtitle: string;
  content: any;
  featured_image_url: string;
  author_name: string;
  status: string;
  featured: boolean;
  priority: number;
  view_count: number;
  created_at: string;
  published_at: string;
  tags: string[];
  metadata: any;
  is_read: boolean;
  read_at: string;
  reaction_counts: any;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');
    const offset = parseInt(searchParams.get('offset') || '0');
    const featured_only = searchParams.get('featured') === 'true';
    const postId = searchParams.get('postId');
    
    // Get user context if available
    const authHeader = request.headers.get('authorization');
    let user = null;
    
    if (authHeader) {
      const userSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: authHeader,
            },
          },
        }
      );
      
      const { data: { user: authUser } } = await userSupabase.auth.getUser();
      user = authUser;
    }

    // If requesting a specific post
    if (postId) {
      try {
        // Try the new function first, fall back to old approach if it fails
        let posts, error;
        
        try {
          const result = await supabase.rpc('get_news_posts_with_read_status', {
            user_uuid: user?.id || null,
            limit_count: 1,
            post_uuid: postId
          });
          posts = result.data;
          error = result.error;
        } catch (functionError) {
          console.log('New function not available, using fallback approach');
          
          // Fallback: Direct query approach
          const { data: postData, error: postError } = await supabase
            .from('news_posts')
            .select(`
              id,
              title,
              subtitle,
              content,
              featured_image_url,
              author_name,
              status,
              featured,
              priority,
              view_count,
              created_at,
              published_at,
              tags,
              metadata
            `)
            .eq('id', postId)
            .eq('status', 'published')
            .single();

          if (postError) {
            error = postError;
          } else if (postData) {
            // Get reaction counts
            const { data: reactions } = await supabase
              .from('news_post_reactions')
              .select('reaction_type')
              .eq('post_id', postId);

            const reaction_counts = reactions?.reduce((acc: any, r: any) => {
              acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1;
              return acc;
            }, {}) || {};

            // Check if user has read this post
            let is_read = false;
            let read_at = null;
            if (user) {
              const { data: readData } = await supabase
                .from('news_post_reads')
                .select('read_at')
                .eq('post_id', postId)
                .eq('user_id', user.id)
                .single();
              
              if (readData) {
                is_read = true;
                read_at = readData.read_at;
              }
            }

            posts = [{
              ...postData,
              is_read,
              read_at,
              reaction_counts
            }];
          }
        }

        if (error) {
          console.error('Error fetching news post:', error);
          if (error.code === 'PGRST116') {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
          }
          return NextResponse.json({ error: 'Failed to fetch news post' }, { status: 500 });
        }

        if (!posts || posts.length === 0) {
          return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // Increment view count
        await supabase
          .from('news_posts')
          .update({ view_count: (posts[0].view_count || 0) + 1 })
          .eq('id', postId);

        return NextResponse.json({ post: posts[0] });
      } catch (error) {
        console.error('Unexpected error fetching post:', error);
        return NextResponse.json({ error: 'Failed to fetch news post' }, { status: 500 });
      }
    }
    
    // Use the custom function to get posts with read status
    let posts, error;
    
    try {
      const result = await supabase.rpc('get_news_posts_with_read_status', {
        user_uuid: user?.id || null,
        limit_count: limit,
        offset_count: offset
      });
      posts = result.data;
      error = result.error;
    } catch (functionError) {
      console.log('Function not available, using fallback approach. Error:', functionError);
      
      // Fallback: Direct query approach
      try {
        const { data: postsData, error: postsError } = await supabase
          .from('news_posts')
          .select(`
            id,
            title,
            subtitle,
            content,
            featured_image_url,
            author_name,
            status,
            featured,
            priority,
            view_count,
            created_at,
            published_at,
            tags,
            metadata
          `)
          .eq('status', 'published')
          .lte('published_at', new Date().toISOString())
          .order('featured', { ascending: false })
          .order('priority', { ascending: false })
          .order('published_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (postsError) {
          console.error('Error in fallback query:', postsError);
          error = postsError;
        } else if (postsData) {
          // Get reaction counts for all posts
          const postIds = postsData.map(p => p.id);
          
          let reactions: any[] = [];
          if (postIds.length > 0) {
            const { data: reactionsData, error: reactionsError } = await supabase
              .from('news_post_reactions')
              .select('post_id, reaction_type')
              .in('post_id', postIds);
              
            if (reactionsError) {
              console.error('Error fetching reactions:', reactionsError);
              // Continue without reactions
            } else {
              reactions = reactionsData || [];
            }
          }

          const reactionsByPost = reactions.reduce((acc: any, r: any) => {
            if (!acc[r.post_id]) acc[r.post_id] = {};
            acc[r.post_id][r.reaction_type] = (acc[r.post_id][r.reaction_type] || 0) + 1;
            return acc;
          }, {});

          // Get read status for user if available
          let readPosts: any[] = [];
          if (user && postIds.length > 0) {
            const { data: readData, error: readError } = await supabase
              .from('news_post_reads')
              .select('post_id, read_at')
              .eq('user_id', user.id)
              .in('post_id', postIds);
              
            if (readError) {
              console.error('Error fetching read status:', readError);
              // Continue without read status
            } else {
              readPosts = readData || [];
            }
          }

          const readPostsMap = readPosts.reduce((acc: any, read: any) => {
            acc[read.post_id] = read.read_at;
            return acc;
          }, {});

          posts = postsData.map(post => ({
            ...post,
            is_read: !!readPostsMap[post.id],
            read_at: readPostsMap[post.id] || null,
            reaction_counts: reactionsByPost[post.id] || {}
          }));
        }
      } catch (fallbackError) {
        console.error('Error in fallback approach:', fallbackError);
        error = fallbackError;
      }
    }

    if (error) {
      console.error('Error fetching news posts:', error);
      return NextResponse.json({ error: 'Failed to fetch news posts' }, { status: 500 });
    }

    // Filter featured posts if requested
    const filteredPosts = featured_only ? posts?.filter((post: NewsPost) => post.featured) : posts;

    // Get total count for pagination
    let totalCount = 0;
    try {
      const { count } = await supabase
        .from('news_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString());
      totalCount = count || 0;
    } catch (countError) {
      console.error('Error getting total count:', countError);
    }

    return NextResponse.json({ 
      posts: filteredPosts || [], 
      total: totalCount,
      offset,
      limit 
    });
  } catch (error) {
    console.error('Error in news API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );
    
    const { data: { user } } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, postId, reactionType, readingTime } = body;

    if (action === 'mark_read') {
      // Mark post as read using authenticated user's client
      const { error } = await userSupabase.rpc('mark_news_post_read', {
        post_uuid: postId,
        reading_seconds: readingTime || 0
      });

      if (error) {
        console.error('Error marking post as read:', error);
        return NextResponse.json({ error: 'Failed to mark post as read', details: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'get_reaction_details') {
      // Get detailed reaction info for tooltips
      // First get the reactions
      const { data: reactions, error: reactionsError } = await userSupabase
        .from('news_post_reactions')
        .select('reaction_type, user_id')
        .eq('post_id', postId);

      if (reactionsError) {
        console.error('Error fetching reactions:', reactionsError);
        return NextResponse.json({ error: 'Failed to fetch reaction details' }, { status: 500 });
      }

      if (!reactions || reactions.length === 0) {
        return NextResponse.json({ reactionDetails: {} });
      }

      // Get user IDs
      const userIds = [...new Set(reactions.map(r => r.user_id))];
      
      // Get profiles for these users
      const { data: profiles, error: profilesError } = await userSupabase
        .from('profiles')
        .select('id, in_game_alias')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return NextResponse.json({ error: 'Failed to fetch user profiles' }, { status: 500 });
      }

      // Create a map of user_id to alias
      const userAliasMap = profiles?.reduce((acc: Record<string, string>, profile: any) => {
        acc[profile.id] = profile.in_game_alias || 'Unknown User';
        return acc;
      }, {}) || {};

      // Group reactions by type with user names
      const reactionDetails = reactions.reduce((acc: Record<string, string[]>, reaction: any) => {
        const type = reaction.reaction_type;
        if (!acc[type]) {
          acc[type] = [];
        }
        const alias = userAliasMap[reaction.user_id] || 'Unknown User';
        acc[type].push(alias);
        return acc;
      }, {});

      return NextResponse.json({ reactionDetails });
    }

    if (action === 'react') {
      // Check if user already has this reaction
      const { data: existingReaction } = await userSupabase
        .from('news_post_reactions')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .eq('reaction_type', reactionType)
        .single();

      let error;
      
      if (existingReaction) {
        // User already reacted - remove the reaction
        const deleteResult = await userSupabase
          .from('news_post_reactions')
          .delete()
          .eq('id', existingReaction.id);
        error = deleteResult.error;
      } else {
        // User hasn't reacted - add the reaction
        const insertResult = await userSupabase
          .from('news_post_reactions')
          .insert({
            post_id: postId,
            user_id: user.id,
            reaction_type: reactionType
          });
        error = insertResult.error;
      }

      if (error) {
        console.error('Error toggling reaction:', error);
        return NextResponse.json({ error: 'Failed to react to post', details: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: existingReaction ? 'removed' : 'added' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in news POST API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 