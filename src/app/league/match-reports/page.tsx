'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import type { MatchReportWithDetails } from '@/types/database';

interface League {
  id: string;
  slug: string;
  name: string;
}

export default function MatchReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<MatchReportWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [leagueFilter, setLeagueFilter] = useState<string>('all');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionLoading, setPermissionLoading] = useState(true);

  useEffect(() => {
    fetchReports();
    checkPermissions();
    fetchLeagues();
  }, [user]);

  const fetchLeagues = async () => {
    const { data } = await supabase
      .from('leagues')
      .select('id, slug, name')
      .order('slug');
    if (data) setLeagues(data);
  };

  const checkPermissions = async () => {
    if (!user) {
      setHasPermission(false);
      setPermissionLoading(false);
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
    } finally {
      setPermissionLoading(false);
    }
  };

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/match-reports');
      
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      } else {
        setError('Failed to load match reports');
      }
    } catch (error) {
      console.error('Error fetching match reports:', error);
      setError('Failed to load match reports');
    } finally {
      setLoading(false);
    }
  };

  const getSeasons = () => {
    const seasons = Array.from(new Set(reports.map(r => r.season_name)));
    return seasons.sort().reverse();
  };

  const filteredReports = reports.filter(report => {
    const matchesSearch = searchTerm === '' ||
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.squad_a_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.squad_b_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.creator_alias.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeason = seasonFilter === 'all' || report.season_name === seasonFilter;

    const matchesLeague = leagueFilter === 'all' || (report as any).league_slug === leagueFilter;

    return matchesSearch && matchesSeason && matchesLeague;
  });

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
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-8">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4">
                Match Reports
              </h1>
              <p className="text-xl text-gray-300 max-w-3xl">
                Detailed analysis and player performance ratings from competitive matches
              </p>
            </div>
            
            {!permissionLoading && hasPermission && (
              <Link href="/league/match-reports/create">
                <button className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-cyan-500/20">
                  📝 Create Match Report
                </button>
              </Link>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-cyan-400">{reports.length}</div>
              <div className="text-gray-400">Total Reports</div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{getSeasons().length}</div>
              <div className="text-gray-400">Seasons Covered</div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-400">
                {Array.from(new Set(reports.map(r => r.creator_alias))).length}
              </div>
              <div className="text-gray-400">Contributing Analysts</div>
            </div>
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
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search Reports
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, squads, or analyst..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Filter by Season
              </label>
              <select
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="all">All Seasons</option>
                {getSeasons().map(season => (
                  <option key={season} value={season}>{season}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-8">
            <div className="text-red-400">{error}</div>
          </div>
        )}

        {/* Reports List */}
        {filteredReports.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">
              {searchTerm || seasonFilter !== 'all' ? 'No matches found' : 'No match reports yet'}
            </h3>
            <p className="text-gray-400 mb-6">
              {searchTerm || seasonFilter !== 'all' 
                ? 'Try adjusting your search filters' 
                : 'Match reports will appear here once analysts create them'}
            </p>
            {!permissionLoading && hasPermission && (
              <Link href="/league/match-reports/create">
                <button className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-300">
                  Create First Report
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {filteredReports.map((report) => (
              <Link key={report.id} href={`/league/match-reports/${report.id}`}>
                <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 rounded-lg p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-white group-hover:text-cyan-400 transition-colors">
                      {report.title}
                    </h3>
                    <div className="text-sm text-gray-400">
                      {formatDate(report.match_date)}
                    </div>
                  </div>

                  {/* Squad vs Squad */}
                  <div className="grid grid-cols-3 gap-4 items-center mb-4">
                    {/* Squad A */}
                    <div className="text-center">
                      <div className="aspect-square w-20 mx-auto rounded-lg border border-cyan-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden mb-2">
                        {report.squad_a_banner_url ? (
                          <img 
                            src={report.squad_a_banner_url} 
                            alt={`${report.squad_a_name} banner`} 
                            className="w-full h-full object-cover opacity-70" 
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-700/40" />
                        )}
                      </div>
                      <div className="text-cyan-400 font-semibold text-sm">
                        {report.squad_a_name}
                      </div>
                    </div>

                    {/* VS */}
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-400">VS</div>
                    </div>

                    {/* Squad B */}
                    <div className="text-center">
                      <div className="aspect-square w-20 mx-auto rounded-lg border border-purple-500/20 bg-gradient-to-br from-gray-800/70 to-gray-900/70 overflow-hidden mb-2">
                        {report.squad_b_banner_url ? (
                          <img 
                            src={report.squad_b_banner_url} 
                            alt={`${report.squad_b_name} banner`} 
                            className="w-full h-full object-cover opacity-70" 
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-700/40" />
                        )}
                      </div>
                      <div className="text-purple-400 font-semibold text-sm">
                        {report.squad_b_name}
                      </div>
                    </div>
                  </div>

                  {/* Summary Preview */}
                  <p className="text-gray-300 mb-4 line-clamp-2">
                    {report.match_summary}
                  </p>

                  {/* Metadata */}
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <div className="flex items-center space-x-4">
                      <span>📊 By {report.creator_alias}</span>
                      <span>🏆 {report.season_name}</span>
                      {(report as any).league_slug && (
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs font-medium uppercase">
                          {(report as any).league_slug}
                        </span>
                      )}
                    </div>
                    <div>
                      {formatRelativeTime(report.created_at, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
