import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Service role client for queries that need to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: match_report_id } = await params;

    const { data: comments, error } = await supabaseAdmin
      .from('match_report_comments')
      .select(`
        id,
        match_report_id,
        user_id,
        content,
        created_at,
        profiles:user_id (
          in_game_alias,
          avatar_url
        )
      `)
      .eq('match_report_id', match_report_id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten the joined profile data
    const formattedComments = (comments || []).map((comment: any) => ({
      id: comment.id,
      match_report_id: comment.match_report_id,
      user_id: comment.user_id,
      content: comment.content,
      created_at: comment.created_at,
      author_alias: comment.profiles?.in_game_alias || null,
      author_avatar_url: comment.profiles?.avatar_url || null,
    }));

    return NextResponse.json({ comments: formattedComments });
  } catch (error) {
    console.error('Error in comments GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: match_report_id } = await params;

    // Verify authorization via Bearer token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = body;

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 });
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Comment must be 2000 characters or less' }, { status: 400 });
    }

    // Insert the comment
    const { data: newComment, error: insertError } = await supabaseAdmin
      .from('match_report_comments')
      .insert({
        match_report_id,
        user_id: user.id,
        content: content.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting comment:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Fetch the user's profile for the response
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('in_game_alias, avatar_url')
      .eq('id', user.id)
      .single();

    const formattedComment = {
      id: newComment.id,
      match_report_id: newComment.match_report_id,
      user_id: newComment.user_id,
      content: newComment.content,
      created_at: newComment.created_at,
      author_alias: profile?.in_game_alias || null,
      author_avatar_url: profile?.avatar_url || null,
    };

    return NextResponse.json({ comment: formattedComment }, { status: 201 });
  } catch (error) {
    console.error('Error in comments POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authorization via Bearer token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const commentId = url.searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json({ error: 'Comment ID is required' }, { status: 400 });
    }

    // Delete the comment — only allow owner to delete
    const { error: deleteError } = await supabaseAdmin
      .from('match_report_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting comment:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in comments DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
