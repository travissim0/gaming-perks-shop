import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useCTFRoles } from './useCTFRoles';

interface MediaPermissions {
  canManageMatchVideos: boolean;
  canAccessMediaPlatform: boolean;
  isMediaManager: boolean;
  isAdmin: boolean;
}

export function useMediaPermissions() {
  const { user } = useAuth();
  const { hasPermission } = useCTFRoles();
  const [permissions, setPermissions] = useState<MediaPermissions>({
    canManageMatchVideos: false,
    canAccessMediaPlatform: false,
    isMediaManager: false,
    isAdmin: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      checkPermissions();
    } else {
      setPermissions({
        canManageMatchVideos: false,
        canAccessMediaPlatform: false,
        isMediaManager: false,
        isAdmin: false,
      });
      setLoading(false);
    }
  }, [user]);

  const checkPermissions = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Get user profile permissions
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, is_media_manager')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const isAdmin = profile?.is_admin || false;
      const isMediaManager = profile?.is_media_manager || false;

      // Check CTF permissions for match videos
      const hasCTFVideoPermission = hasPermission('add_match_videos') || hasPermission('edit_match_videos');

      const newPermissions: MediaPermissions = {
        isAdmin,
        isMediaManager,
        canAccessMediaPlatform: isAdmin || isMediaManager,
        canManageMatchVideos: isAdmin || isMediaManager || hasCTFVideoPermission,
      };

      setPermissions(newPermissions);
    } catch (error) {
      console.error('Error checking media permissions:', error);
      setPermissions({
        canManageMatchVideos: false,
        canAccessMediaPlatform: false,
        isMediaManager: false,
        isAdmin: false,
      });
    } finally {
      setLoading(false);
    }
  };

  // Add video to match
  const addMatchVideo = async (
    matchId: string,
    videoData: {
      youtube_url?: string;
      vod_url?: string;
      highlight_url?: string;
      video_title?: string;
      video_description?: string;
      video_thumbnail_url?: string;
    }
  ) => {
    if (!permissions.canManageMatchVideos) {
      throw new Error('Insufficient permissions to manage match videos');
    }

    try {
      const { data, error } = await supabase.rpc('add_match_video', {
        p_match_id: matchId,
        p_youtube_url: videoData.youtube_url || null,
        p_vod_url: videoData.vod_url || null,
        p_highlight_url: videoData.highlight_url || null,
        p_video_title: videoData.video_title || null,
        p_video_description: videoData.video_description || null,
        p_video_thumbnail_url: videoData.video_thumbnail_url || null,
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to add video');
      }

      return data;
    } catch (error: any) {
      console.error('Error adding match video:', error);
      throw error;
    }
  };

  // Get match video information
  const getMatchVideoInfo = async (matchId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_match_video_info', {
        p_match_id: matchId,
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error getting match video info:', error);
      throw error;
    }
  };

  // Check if user can manage videos for a specific match
  const checkMatchVideoPermissions = async (matchId: string) => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('user_can_manage_match_videos', {
        user_id: user.id,
      });

      if (error) throw error;
      return data || false;
    } catch (error) {
      console.error('Error checking match video permissions:', error);
      return false;
    }
  };

  return {
    permissions,
    loading,
    addMatchVideo,
    getMatchVideoInfo,
    checkMatchVideoPermissions,
    refresh: checkPermissions,
  };
} 