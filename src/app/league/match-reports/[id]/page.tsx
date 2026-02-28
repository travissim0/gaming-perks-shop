'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import type { MatchReportWithDetails, MatchPlayerRating, MatchReportComment } from '@/types/database';
import { getRatingColor, getRatingBgColor, getStarDisplay } from '@/utils/ratingUtils';

// Expandable Video Player Component
const ExpandableVideoPlayer = ({ embedUrl, playerRating, isLeft }: { 
  embedUrl: string; 
  playerRating: MatchPlayerRating; 
  isLeft: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleVideoClick = () => {
    setIsExpanded(true);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(false);
  };

  return (
    <>
      {/* Original Video Container */}
      <div 
        className={`relative aspect-video rounded-lg overflow-hidden border border-gray-700 shadow-lg cursor-pointer transition-transform hover:scale-105 ${!isExpanded ? '' : 'opacity-0 pointer-events-none'}`}
        onClick={handleVideoClick}
      >
        <iframe
          src={embedUrl}
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={`${playerRating.player_alias} highlight clip`}
          loading="lazy"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <div className="bg-black/70 rounded-full p-4">
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded Video Overlay */}
      {isExpanded && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div 
            className="relative w-[80vw] h-[80vh] transform transition-all duration-2000 ease-out scale-100"
            style={{
              animation: 'expandIn 2s ease-out forwards'
            }}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 transition-colors z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Expanded video */}
            <iframe
              src={`${embedUrl}&autoplay=1`}
              className="w-full h-full rounded-lg"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              title={`${playerRating.player_alias} highlight clip - Expanded`}
            />
            
            {/* Player info overlay */}
            <div className="absolute bottom-4 left-4 bg-black/70 rounded-lg p-3">
              <h4 className="text-white font-bold">{playerRating.player_alias}</h4>
              <p className="text-gray-300 text-sm">{playerRating.class_position}</p>
            </div>
          </div>
        </div>
      )}

      {/* CSS for animation */}
      <style jsx>{`
        @keyframes expandIn {
          from {
            transform: scale(0.3);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};

export default function MatchReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [report, setReport] = useState<MatchReportWithDetails | null>(null);
  const [playerRatings, setPlayerRatings] = useState<MatchPlayerRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [comments, setComments] = useState<MatchReportComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchReportDetails();
      checkPermissions();
      fetchComments();
    }
  }, [params.id, user]);

  const checkPermissions = async () => {
    if (!user) {
      setHasPermission(false);
      return;
    }

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, ctf_role')
        .eq('id', user.id)
        .single();

      if (!error && profile) {
        setHasPermission(
          profile?.is_admin || 
          profile?.ctf_role === 'ctf_admin' || 
          (profile?.ctf_role && profile?.ctf_role.includes('analyst'))
        );
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const fetchReportDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/match-reports/${params.id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch match report');
      }

      setReport(data.report);
      setPlayerRatings(data.playerRatings || []);
    } catch (err) {
      console.error('Error fetching match report:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch match report');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      setLoadingComments(true);
      const response = await fetch(`/api/match-reports/${params.id}/comments`);
      const data = await response.json();
      if (response.ok) {
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!newComment.trim() || submittingComment) return;

    try {
      setSubmittingComment(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const response = await fetch(`/api/match-reports/${params.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        setComments(prev => [...prev, data.comment]);
        setNewComment('');
      } else {
        console.error('Error posting comment:', data.error);
      }
    } catch (err) {
      console.error('Error submitting comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/match-reports/${params.id}/comments?commentId=${commentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (response.ok) {
        setComments(prev => prev.filter(c => c.id !== commentId));
      }
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Rating utilities imported from @/utils/ratingUtils

  // Extract embed code or create embed URL
  const getEmbedCode = (embedCodeOrUrl: string) => {
    if (!embedCodeOrUrl) return null;
    
    // If it's already an iframe embed code, extract the src
    const iframeMatch = embedCodeOrUrl.match(/<iframe[^>]*src="([^"]*)"[^>]*>/i);
    if (iframeMatch) {
      return iframeMatch[1]; // Return the src URL from the iframe
    }
    
    // If it's just a URL, try to convert it to embed format
    if (embedCodeOrUrl.includes('youtube.com') || embedCodeOrUrl.includes('youtu.be')) {
      // Extract video ID from various YouTube URL formats
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = embedCodeOrUrl.match(regExp);
      
      if (match && match[2].length === 11) {
        return `https://www.youtube.com/embed/${match[2]}?autoplay=0&controls=1&modestbranding=1&rel=0`;
      }
    }
    
    return null;
  };

  // Render rating adjustment display with individual backgrounds
  const renderRatingAdjustment = (playerRating: MatchPlayerRating) => {
    const { rating_before, rating_adjustment, rating_after } = playerRating;
    const adjustmentColor = rating_adjustment >= 0 ? 'text-green-400' : 'text-red-400';
    const adjustmentBg = rating_adjustment > 0 ? 'bg-green-500/20' : rating_adjustment < 0 ? 'bg-red-500/20' : 'bg-gray-500/20';
    
    return (
      <div className="flex items-center space-x-3">
        {/* Before Rating */}
        <div className="flex flex-col items-center space-y-1">
          <div className={`px-3 py-1 rounded-lg font-semibold text-sm ${getRatingBgColor(rating_before)} ${getRatingColor(rating_before)}`}>
            {rating_before.toFixed(1)}
          </div>
          <div className="flex items-center">
            {getStarDisplay(rating_before)}
          </div>
        </div>

        {/* Adjustment */}
        <div className="flex flex-col items-center space-y-1">
          <div className={`px-3 py-1 rounded-lg font-bold text-sm ${adjustmentBg} ${adjustmentColor} border border-current/30`}>
            {rating_adjustment >= 0 ? '+' : ''}{rating_adjustment.toFixed(1)}
          </div>
          <div className="text-gray-400 text-lg">→</div>
        </div>

        {/* After Rating */}
        <div className="flex flex-col items-center space-y-1">
          <div className={`px-3 py-1 rounded-lg font-semibold text-sm ${getRatingBgColor(rating_after)} ${getRatingColor(rating_after)}`}>
            {rating_after.toFixed(1)}
          </div>
          <div className="flex items-center">
            {getStarDisplay(rating_after)}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-20 bg-gray-700 rounded mb-8"></div>
            <div className="h-64 bg-gray-700 rounded mb-8"></div>
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-red-400 mb-4">Error Loading Match Report</h2>
            <p className="text-gray-400 mb-6">{error || 'Match report not found'}</p>
            <Link 
              href="/league/match-reports"
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 inline-flex items-center"
            >
              Back to Match Reports
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Link 
              href="/league/match-reports"
              className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-2 transition-colors"
            >
              <span>←</span>
              <span>Back to Match Reports</span>
            </Link>
            
            {hasPermission && (
              <Link 
                href={`/league/match-reports/${report.id}/edit`}
                className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-300 inline-flex items-center"
              >
                ✏️ Edit Report
              </Link>
            )}
          </div>

          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            {report.title}
          </h1>
        </div>

        {/* Main Content: Video + Squad Info & Summary */}
        <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-8 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Half: Highlights Video */}
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-cyan-400 flex items-center">
                <span className="mr-2">🎬</span>
                Match Highlights
              </h3>
              {report.match_highlights_video_url && getEmbedCode(report.match_highlights_video_url) ? (
                <div className="aspect-video rounded-lg overflow-hidden border border-gray-600 shadow-lg">
                  <iframe
                    src={getEmbedCode(report.match_highlights_video_url)}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Match Highlights"
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <div className="text-6xl mb-4">🎥</div>
                    <div className="text-lg">No highlights video available</div>
                    <div className="text-sm text-gray-500 mt-2">Video will appear here when added</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Half: Squad vs Squad + Match Summary */}
            <div className="space-y-6">
              {/* Squad vs Squad Section */}
              <div className="bg-gray-900/30 border border-gray-600 rounded-lg p-6">
                <div className="grid grid-cols-3 gap-4 items-center">
                  {/* Squad A */}
                  <div className="text-center">
                    <div className="aspect-square w-20 mx-auto rounded-lg border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden mb-3 shadow-lg">
                      {report.squad_a_banner_url ? (
                        <img 
                          src={report.squad_a_banner_url} 
                          alt={`${report.squad_a_name} banner`} 
                          className="w-full h-full object-cover opacity-70" 
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700/40 flex items-center justify-center">
                          <span className="text-2xl text-gray-500">🛡️</span>
                        </div>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-cyan-400">
                      {report.squad_a_name}
                    </h2>
                  </div>

                  {/* VS Center */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-400 mb-1">VS</div>
                    <div className="w-16 h-0.5 bg-gradient-to-r from-cyan-500 to-purple-500 mx-auto rounded"></div>
                  </div>

                  {/* Squad B */}
                  <div className="text-center">
                    <div className="aspect-square w-20 mx-auto rounded-lg border border-purple-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden mb-3 shadow-lg">
                      {report.squad_b_banner_url ? (
                        <img 
                          src={report.squad_b_banner_url} 
                          alt={`${report.squad_b_name} banner`} 
                          className="w-full h-full object-cover opacity-70" 
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700/40 flex items-center justify-center">
                          <span className="text-2xl text-gray-500">🛡️</span>
                        </div>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-purple-400">
                      {report.squad_b_name}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Match Analysis */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white flex items-center">
                  <span className="mr-2">📋</span>
                  Match Analysis
                </h3>
                <div className="bg-gray-900/50 border border-gray-600 rounded-lg p-6">
                  <div className="text-lg text-gray-300 leading-relaxed mb-6">
                    "{report.match_summary}"
                  </div>
                  
                  {/* Match Metadata */}
                  <div className="pt-4 border-t border-gray-600">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center space-x-2 text-gray-400">
                        <span>📅</span>
                        <span>{formatDate(report.match_date)}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-400">
                        <span>🏆</span>
                        <span>{report.season_name}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-400">
                        <span>📊</span>
                        <span>By {report.creator_alias}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-400">
                        <span>🕒</span>
                        <span>{formatRelativeTime(report.created_at, { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Player Ratings */}
        {playerRatings.length > 0 && (
          <div className="mb-8">
            <h3 className="text-3xl font-bold text-white mb-8 text-center">Player Performance Analysis</h3>
            
            <div className="space-y-12">
              {playerRatings.map((playerRating, index) => {
                const isLeft = index % 2 === 0;
                const embedUrl = playerRating.highlight_clip_url ? getEmbedCode(playerRating.highlight_clip_url) : null;
                
                return (
                  <div key={playerRating.id} className={`grid grid-cols-1 lg:grid-cols-2 gap-8 items-center ${!isLeft ? 'lg:grid-flow-col-dense' : ''}`}>
                    {/* Video/Clip Section */}
                    <div className={`${!isLeft ? 'lg:col-start-2' : ''}`}>
                      {playerRating.highlight_clip_url ? (
                        embedUrl ? (
                          <ExpandableVideoPlayer 
                            embedUrl={embedUrl} 
                            playerRating={playerRating} 
                            isLeft={isLeft}
                          />
                        ) : (
                          <div className="aspect-video rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                            <div className="text-center text-gray-400">
                              <div className="text-4xl mb-2">🎬</div>
                              <div className="mb-4">Clip available on YouTube</div>
                              <a
                                href={playerRating.highlight_clip_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg inline-flex items-center space-x-2 transition-colors"
                              >
                                <span>📺</span>
                                <span>Watch on YouTube</span>
                              </a>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="aspect-video rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                          <div className="text-center text-gray-400">
                            <div className="text-6xl mb-4">🎥</div>
                            <div>No clip available</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Content Section */}
                    <div className={`bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-xl p-6 ${!isLeft ? 'lg:col-start-1' : ''}`}>
                      {/* Player Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-2xl font-bold text-white">{playerRating.player_alias}</h4>
                          <p className="text-cyan-400 font-semibold">{playerRating.class_position}</p>
                        </div>
                        <div className="px-4 py-2 rounded-lg border border-gray-600 bg-gray-800/50">
                          <div className="text-center">
                            {renderRatingAdjustment(playerRating)}
                          </div>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="text-center bg-gray-900/50 rounded-lg p-3">
                          <div className="text-xl font-bold text-green-400">{playerRating.kills}</div>
                          <div className="text-xs text-gray-400">Kills</div>
                        </div>
                        <div className="text-center bg-gray-900/50 rounded-lg p-3">
                          <div className="text-xl font-bold text-red-400">{playerRating.deaths}</div>
                          <div className="text-xs text-gray-400">Deaths</div>
                        </div>
                        {playerRating.turret_damage && (
                          <div className="text-center bg-gray-900/50 rounded-lg p-3">
                            <div className="text-xl font-bold text-orange-400">{playerRating.turret_damage}</div>
                            <div className="text-xs text-gray-400">Turret Dmg</div>
                          </div>
                        )}
                      </div>

                      {/* Performance Description */}
                      <div className="text-gray-300 leading-relaxed">
                        {playerRating.performance_description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Player Rating Button for Admins */}
        {hasPermission && (
          <div className="text-center mt-12">
            <Link href={`/league/match-reports/${report.id}/add-player`}>
              <button className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg">
                ➕ Add Player Rating
              </button>
            </Link>
          </div>
        )}

        {/* Comments Section */}
        <div className="mt-12 bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-6">
            <h3 className="text-2xl font-bold text-white">Comments</h3>
            <span className="bg-gray-700 text-gray-300 text-sm font-medium px-2.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          </div>

          {/* Comment Form */}
          {user ? (
            <div className="mb-6">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                maxLength={2000}
                rows={3}
                className="w-full bg-gray-900/50 border border-gray-600 rounded-lg p-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">
                  {newComment.length}/2000
                </span>
                <button
                  onClick={submitComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300"
                >
                  {submittingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-6 text-center py-4 bg-gray-900/30 border border-gray-700 rounded-lg">
              <p className="text-gray-400">
                <Link href="/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">Log in</Link> to comment
              </p>
            </div>
          )}

          {/* Comment List */}
          {loadingComments ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse flex space-x-3">
                  <div className="w-8 h-8 bg-gray-700 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-1/4"></div>
                    <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length > 0 ? (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex space-x-3 bg-gray-900/30 border border-gray-700/50 rounded-lg p-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {comment.author_avatar_url ? (
                      <img
                        src={comment.author_avatar_url}
                        alt={comment.author_alias || 'Anonymous'}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-gray-400 text-sm font-bold">
                          {(comment.author_alias || 'A').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-semibold text-cyan-400">
                        {comment.author_alias || 'Anonymous'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(comment.created_at, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>

                  {/* Delete Button */}
                  {user && user.id === comment.user_id && (
                    <button
                      onClick={() => deleteComment(comment.id)}
                      className="flex-shrink-0 text-gray-500 hover:text-red-400 transition-colors p-1"
                      title="Delete comment"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">Be the first to comment</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
