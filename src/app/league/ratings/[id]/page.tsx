'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SquadRatingWithDetails, PlayerRatingWithDetails } from '@/types/database';
import { SYSTEM_USER_ID } from '@/lib/constants';
import { getRatingColor, getRatingBgColor, getStarDisplay } from '@/utils/ratingUtils';

export default function IndividualSquadRatingPage() {
  const params = useParams();
  const [squadRating, setSquadRating] = useState<SquadRatingWithDetails | null>(null);
  const [playerRatings, setPlayerRatings] = useState<PlayerRatingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchRatingDetails();
    }
  }, [params.id]);

  const fetchRatingDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/squad-ratings/${params.id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch rating details');
      }

      setSquadRating(data.squad_rating);
      setPlayerRatings(data.player_ratings || []);
    } catch (err) {
      console.error('Error fetching rating details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch rating details');
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

  // Rating utilities imported from @/utils/ratingUtils

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-20 bg-gray-700 rounded mb-8"></div>
            <div className="h-12 bg-gray-700 rounded mb-6"></div>
            <div className="space-y-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !squadRating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Rating</h2>
            <p className="text-red-300">{error || 'Rating not found'}</p>
            <Link 
              href="/league/ratings"
              className="inline-block mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Back to Ratings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mb-8">
          <Link 
            href="/league/ratings"
            className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition-colors group"
          >
            <svg className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Ratings
          </Link>
          
          <Link 
            href="/"
            className="inline-flex items-center text-gray-400 hover:text-gray-300 transition-colors text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Home
          </Link>
        </div>

        {/* Squad Name - Biggest Letters */}
        <div className="text-center mb-8">
          <h1 className="text-6xl md:text-8xl font-black text-white mb-4 tracking-tight">
            {squadRating.squad_name}
          </h1>
          <div className="flex items-center justify-center space-x-4 mb-4">
            <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-2xl font-bold px-6 py-3 rounded-lg">
              {squadRating.squad_tag}
            </div>
            {/* Official/Unofficial Badge */}
            <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${
              squadRating.is_official 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
            }`}>
              {squadRating.is_official ? '✓ Official Rating' : '⚠ Unofficial Rating'}
            </div>
          </div>
          {/* Unofficial Disclaimer for Individual Page */}
          {!squadRating.is_official && (
            <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-500/30 rounded-lg p-4 max-w-2xl mx-auto">
              <div className="flex items-center justify-center space-x-2">
                <span className="text-orange-400">⚠️</span>
                <p className="text-orange-200/80 text-sm text-center">
                  This is an individual opinion and should be taken with a grain of salt.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Squad Breakdown by Analyst */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-300 mb-2">
            Squad Breakdown by <span className="text-cyan-400">
              {squadRating.analyst_id === SYSTEM_USER_ID ? 'Anonymous' : squadRating.analyst_alias}
            </span>
          </h2>
          <h3 className="text-xl text-gray-400 mb-2">({squadRating.season_name})</h3>
          <p className="text-gray-500">{formatDate(squadRating.analysis_date)}</p>
        </div>

        {/* Analyst Commentary Section */}
        {squadRating.analyst_commentary && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white mb-6 border-b border-gray-700 pb-2">
              Analyst Commentary
            </h2>
            {squadRating.analyst_quote && (
              <div className="bg-gradient-to-r from-gray-800/50 to-gray-900/50 border-l-4 border-cyan-500 p-6 mb-6 rounded-r-lg">
                <blockquote className="text-xl text-gray-300 italic font-light">
                  "{squadRating.analyst_quote}"
                </blockquote>
                <cite className="text-cyan-400 text-sm font-medium mt-2 block">
                  — {squadRating.analyst_id === SYSTEM_USER_ID ? 'Anonymous' : squadRating.analyst_alias}
                </cite>
              </div>
            )}
            <div className="prose prose-invert max-w-none">
              <div className="text-gray-300 leading-relaxed whitespace-pre-line">
                {squadRating.analyst_commentary}
              </div>
            </div>
          </div>
        )}

        {/* Breakdown Summary Section */}
        {squadRating.breakdown_summary && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white mb-6 border-b border-gray-700 pb-2">
              Breakdown Summary
            </h2>
            <div className="bg-gray-800/50 rounded-lg p-6">
              <div className="text-gray-300 leading-relaxed whitespace-pre-line">
                {squadRating.breakdown_summary}
              </div>
            </div>
          </div>
        )}

        {/* Player Notes Section */}
        {playerRatings.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl font-bold text-white mb-6 border-b border-gray-700 pb-2">
              Player Notes
            </h2>
            <div className="grid gap-6">
              {playerRatings
                .sort((a, b) => b.rating - a.rating)
                .map((playerRating) => (
                <div 
                  key={playerRating.id}
                  className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-2xl font-bold text-white">
                        {playerRating.player_alias}
                      </h3>
                      <div className={`px-3 py-1 rounded-full border ${getRatingBgColor(playerRating.rating)}`}>
                        <span className={`font-bold text-lg ${getRatingColor(playerRating.rating)}`}>
                          {playerRating.rating}★
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStarDisplay(playerRating.rating)}
                      <span className={`text-sm font-medium ${getRatingColor(playerRating.rating)}`}>
                        ({playerRating.rating}/6.0)
                      </span>
                    </div>
                  </div>
                  
                  {playerRating.notes && (
                    <div className="bg-gray-900/50 rounded-lg p-4">
                      <div className="text-gray-300 leading-relaxed whitespace-pre-line">
                        {playerRating.notes}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t border-gray-700">
          <p className="text-gray-500 text-sm">
            Analysis published on {formatDate(squadRating.created_at)}
            {squadRating.updated_at !== squadRating.created_at && (
              <span> • Last updated {formatDate(squadRating.updated_at)}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}