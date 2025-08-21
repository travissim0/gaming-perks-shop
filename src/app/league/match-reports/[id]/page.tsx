'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { MatchReportWithDetails, MatchPlayerRating } from '@/types/database';

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

  useEffect(() => {
    if (params.id) {
      fetchReportDetails();
      checkPermissions();
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Star rating utility functions (exact same as ratings page)
  const getRatingColor = (rating: number) => {
    if (rating >= 5.5) return 'text-purple-400';
    if (rating >= 5.0) return 'text-green-400';
    if (rating >= 4.5) return 'text-lime-400';
    if (rating >= 4.0) return 'text-yellow-400';
    if (rating >= 3.5) return 'text-amber-400';
    if (rating >= 3.0) return 'text-orange-400';
    if (rating >= 2.5) return 'text-red-400';
    return 'text-red-500';
  };

  const getRatingBgColor = (rating: number) => {
    if (rating >= 5.5) return 'bg-purple-500/20 border-purple-500/50';
    if (rating >= 5.0) return 'bg-green-500/20 border-green-500/50';
    if (rating >= 4.5) return 'bg-lime-500/20 border-lime-500/50';
    if (rating >= 4.0) return 'bg-yellow-500/20 border-yellow-500/50';
    if (rating >= 3.5) return 'bg-amber-500/20 border-amber-500/50';
    if (rating >= 3.0) return 'bg-orange-500/20 border-orange-500/50';
    if (rating >= 2.5) return 'bg-red-500/20 border-red-500/50';
    return 'bg-red-600/20 border-red-600/50';
  };

  const getStarDisplay = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 6 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <div className="flex items-center space-x-1">
        {[...Array(fullStars)].map((_, i) => (
          <span key={`full-${i}`} className="text-yellow-400">★</span>
        ))}
        {hasHalfStar && <span className="text-yellow-400">☆</span>}
        {[...Array(emptyStars)].map((_, i) => (
          <span key={`empty-${i}`} className="text-gray-600">☆</span>
        ))}
      </div>
    );
  };

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
                        <span>{formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}</span>
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
      </div>
    </div>
  );
}
