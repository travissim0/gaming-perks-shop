'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { SquadRatingWithDetails } from '@/types/database';
import { SYSTEM_USER_ID } from '@/lib/constants';
import Pagination from '@/components/Pagination';

interface League {
  id: string;
  slug: string;
  name: string;
}

export default function SquadRatingsPage() {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<SquadRatingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [showUnofficialRatings, setShowUnofficialRatings] = useState(false);
  const [canManageRatings, setCanManageRatings] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  useEffect(() => {
    fetchRatings();
    fetchLeagues();
  }, []);

  const fetchLeagues = async () => {
    const { data } = await supabase
      .from('leagues')
      .select('id, slug, name')
      .order('slug');
    if (data) setLeagues(data);
  };

  useEffect(() => {
    checkRatingsPermissions();
  }, [user]);

  const checkRatingsPermissions = async () => {
    if (!user) {
      setCanManageRatings(false);
      return;
    }

    // Anyone who is authenticated can now create unofficial ratings
    setCanManageRatings(true);
  };

  const fetchRatings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/squad-ratings');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch ratings');
      }

      setRatings(data.ratings || []);
    } catch (err) {
      console.error('Error fetching ratings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch ratings');
    } finally {
      setLoading(false);
    }
  };

  // Get unique seasons for filter
  const seasons = Array.from(new Set(ratings.map(r => r.season_name))).sort();

  // Filter ratings based on search, season, league, and official status
  const filteredRatings = ratings.filter(rating => {
    const matchesSearch = !searchTerm ||
      rating.squad_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rating.squad_tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rating.analyst_alias?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeason = selectedSeason === 'all' || rating.season_name === selectedSeason;

    const matchesLeague = leagueFilter === 'all' || (rating as any).league_slug === leagueFilter;

    // Handle missing is_official field (default to false for backwards compatibility)
    const isOfficial = rating.is_official === true;
    const isUnofficial = rating.is_official === false || rating.is_official === undefined || rating.is_official === null;

    // Show official ratings always, unofficial only if requested
    const matchesOfficialFilter = isOfficial || (isUnofficial && showUnofficialRatings);

    return matchesSearch && matchesSeason && matchesLeague && matchesOfficialFilter;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSeason, leagueFilter, showUnofficialRatings]);

  // Separate official and unofficial ratings for display
  const officialRatings = filteredRatings.filter(r => r.is_official === true);
  const unofficialRatings = filteredRatings.filter(r => r.is_official !== true);

  const totalPages = Math.ceil(filteredRatings.length / ITEMS_PER_PAGE);
  const paginatedRatings = filteredRatings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-700 rounded mb-6"></div>
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-700 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-400 mb-2">Error Loading Ratings</h2>
            <p className="text-red-300">{error}</p>
            <button 
              onClick={fetchRatings}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Back to Home Button */}
        <div className="mb-6">
          <Link 
            href="/"
            className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition-colors group"
          >
            <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="mb-12">
          <div className="flex flex-col md:flex-row items-center justify-between mb-6">
            <div className="text-center md:text-left">
              <h1 className="text-5xl font-bold text-white mb-4">
                Squad <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Ratings</span>
              </h1>
              <p className="text-gray-400 text-xl">Professional analysis and player breakdowns</p>
            </div>
            {canManageRatings && (
              <div className="mt-6 md:mt-0">
                <Link
                  href="/admin/ratings?tab=create"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-pink-500/20 transform hover:scale-105"
                >
                  <span className="text-xl mr-2">➕</span>
                  Add Rating
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* League Filter */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLeagueFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                leagueFilter === 'all'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              All Leagues
            </button>
            {leagues.map(league => (
              <button
                key={league.slug}
                onClick={() => setLeagueFilter(league.slug)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  leagueFilter === league.slug
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {league.name}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800/50 rounded-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search squads or analysts
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by squad name, tag, or analyst..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div className="md:w-64">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Season
              </label>
              <select
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="all">All Seasons</option>
                {seasons.map(season => (
                  <option key={season} value={season}>{season}</option>
                ))}
              </select>
            </div>
            <div className="md:w-64">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Rating Types
              </label>
              <button
                onClick={() => setShowUnofficialRatings(!showUnofficialRatings)}
                className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                  showUnofficialRatings 
                    ? 'bg-orange-600 border-orange-500 text-white' 
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-orange-500 hover:bg-gray-650'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <span className="text-lg">
                    {showUnofficialRatings ? '👁️' : '👁️‍🗨️'}
                  </span>
                  <span className="font-medium">
                    {showUnofficialRatings ? 'Hide' : 'Show'} Unofficial Ratings
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Unofficial Ratings Disclaimer */}
        {showUnofficialRatings && unofficialRatings.length > 0 && (
          <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="text-orange-400 text-xl">⚠️</div>
              <div>
                <h3 className="text-orange-300 font-semibold mb-1">Unofficial Ratings Shown</h3>
                <p className="text-orange-200/80 text-sm">
                  Individual opinions shown alongside official panel reviews. 
                  Look for the badges to distinguish between rating types.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-400">
            Showing {filteredRatings.length} of {ratings.length} rating{ratings.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Ratings Grid */}
        {filteredRatings.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-2xl font-bold text-gray-300 mb-2">No Ratings Found</h3>
            <p className="text-gray-500">
              {ratings.length === 0 
                ? "No squad ratings have been published yet." 
                : "No ratings match your current filters."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {paginatedRatings.map((rating) => (
              <Link
                key={rating.id}
                href={`/league/ratings/${rating.id}`}
                className="group block"
              >
                <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-lg p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xl font-bold px-3 py-2 rounded">
                        {rating.squad_tag}
                      </div>
                      {/* Official/Unofficial Badge */}
                      <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        rating.is_official 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      }`}>
                        {rating.is_official ? '✓ Official' : '⚠ Unofficial'}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white group-hover:text-cyan-400 transition-colors">
                          {rating.squad_name}
                        </h3>
                        <p className="text-gray-400">
                          Analyzed by <span className="text-cyan-400">
                            {rating.analyst_id === SYSTEM_USER_ID ? 'Anonymous' : rating.analyst_alias}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2 mb-1">
                        {(rating as any).league_slug && (
                          <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs font-medium uppercase">
                            {(rating as any).league_slug}
                          </span>
                        )}
                        <span className="text-sm text-gray-400">{rating.season_name}</span>
                      </div>
                      <div className="text-sm text-gray-500">{formatDate(rating.analysis_date)}</div>
                    </div>
                  </div>

                  {rating.analyst_quote && (
                    <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
                      <blockquote className="text-gray-300 italic">
                        "{rating.analyst_quote}"
                      </blockquote>
                    </div>
                  )}

                  {rating.breakdown_summary && (
                    <div className="text-gray-400 text-sm line-clamp-3">
                      {rating.breakdown_summary}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                    <div className="text-sm text-gray-500">
                      Published {formatDate(rating.created_at)}
                    </div>
                    <div className="flex items-center text-cyan-400 group-hover:text-cyan-300 transition-colors">
                      <span className="text-sm font-medium">View Analysis</span>
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={filteredRatings.length}
              itemsPerPage={ITEMS_PER_PAGE}
            />
          </div>
        )}
      </div>
    </div>
  );
}