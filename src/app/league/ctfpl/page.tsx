'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Image from 'next/image';
import Link from 'next/link';
import { Trophy, Users, Calendar, BarChart3, Shield, Crown, ChevronLeft, ChevronRight, Menu } from 'lucide-react';

interface Standing {
  id: string;
  season_number: number;
  squad_id: string;
  matches_played: number;
  wins: number;
  losses: number;
  no_shows: number;
  overtime_wins: number;
  overtime_losses: number;
  points: number;
  kills_for: number;
  deaths_against: number;
  kill_death_difference: number;
  win_percentage: number;
  regulation_wins: number;
  rank: number;
  points_behind: number;
  // Squad details from join
  squad_name: string;
  squad_tag: string;
  banner_url?: string | null;
  captain_alias: string;
}

interface Season {
  season_number: number;
  season_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  champion_squad_ids?: string[];
  runner_up_squad_ids?: string[];
  third_place_squad_ids?: string[];
}

export default function CTFPLStandingsPage() {
  const { user, loading } = useAuth();
  const [standings, setStandings] = useState<Standing[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [currentSeason, setCurrentSeason] = useState<number | null>(null);
  const [seasonInfo, setSeasonInfo] = useState<Season | null>(null);
  const [allSeasons, setAllSeasons] = useState<Season[]>([]);
  const [allSquads, setAllSquads] = useState<{id: string, name: string, tag: string}[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [seasonsLoading, setSeasonsLoading] = useState(true);
  const [navbarMobileMenuOpen, setNavbarMobileMenuOpen] = useState(false);
  const [seasonStats, setSeasonStats] = useState({
    totalMatches: 0,
    totalSquads: 0,
    averageMatchesPerSquad: 0,
    topWinRate: 0,
    totalOvertimeGames: 0,
    averagePointsPerSquad: 0
  });

  const loadAllSeasons = useCallback(async () => {
    try {
      setSeasonsLoading(true);
      const { data: seasonsData, error: seasonsError } = await supabase
        .from('ctfpl_seasons')
        .select('*')
        .order('season_number', { ascending: false });

      if (seasonsError) {
        console.error('Error loading seasons:', seasonsError);
        return;
      }

      if (seasonsData) {
        setAllSeasons(seasonsData);
        
        // Find current active season
        const activeSeason = seasonsData.find(season => season.status === 'active');
        if (activeSeason) {
          setCurrentSeason(activeSeason.season_number);
          // Set selected season to active season if not already set
          if (selectedSeason === null) {
            setSelectedSeason(activeSeason.season_number);
          }
        }
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
    } finally {
      setSeasonsLoading(false);
    }
  }, [selectedSeason]);

  const loadAllSquads = useCallback(async () => {
    try {
      const { data: squadsData, error: squadsError } = await supabase
        .from('squads')
        .select('id, name, tag')
        .order('name');

      if (squadsError) {
        console.error('Error loading squads:', squadsError);
        return;
      }

      if (squadsData) {
        setAllSquads(squadsData);
      }
    } catch (error) {
      console.error('Error loading squads:', error);
    }
  }, []);

  const loadStandingsData = useCallback(async (seasonNumber: number) => {
    try {
      setDataLoading(true);
      
      // Get season info for the selected season
      const seasonData = allSeasons.find(s => s.season_number === seasonNumber);
      if (seasonData) {
        setSeasonInfo(seasonData);
      }
      
      // Get standings data directly from the ctfpl_standings_with_rankings view
      const { data: standingsData, error: standingsError } = await supabase
        .from('ctfpl_standings_with_rankings')
        .select('*')
        .eq('season_number', seasonNumber)
        .order('rank', { ascending: true });

      if (standingsError) {
        console.error('Error loading standings:', standingsError);
        return;
      }

      if (!standingsData) return;

      setStandings(standingsData);

      // Calculate season statistics
      const totalSquads = standingsData.length;
      const totalMatches = standingsData.reduce((sum, team) => sum + team.matches_played, 0);
      const averageMatches = totalSquads > 0 ? totalMatches / totalSquads : 0;
      const topWinRate = standingsData.length > 0 ? standingsData[0].win_percentage : 0;
      const totalOvertimeGames = standingsData.reduce((sum, team) => sum + team.overtime_wins + team.overtime_losses, 0);
      const totalPoints = standingsData.reduce((sum, team) => sum + team.points, 0);
      const averagePoints = totalSquads > 0 ? totalPoints / totalSquads : 0;

      setSeasonStats({
        totalMatches: Math.floor(totalMatches / 2), // Divide by 2 since each match involves 2 teams
        totalSquads,
        averageMatchesPerSquad: Math.round(averageMatches * 10) / 10,
        topWinRate: Math.round(topWinRate * 10) / 10,
        totalOvertimeGames,
        averagePointsPerSquad: Math.round(averagePoints * 10) / 10
      });

    } catch (error) {
      console.error('Error loading standings data:', error);
    } finally {
      setDataLoading(false);
    }
  }, [allSeasons]);

  useEffect(() => {
    loadAllSeasons();
    loadAllSquads();
  }, [loadAllSeasons, loadAllSquads]);

  useEffect(() => {
    if (selectedSeason !== null) {
      loadStandingsData(selectedSeason);
    }
  }, [selectedSeason, loadStandingsData]);

  const handleSeasonSelect = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    setSidebarOpen(false); // Close mobile sidebar when season is selected
  };

  // Helper function to get squad display name from ID
  const getSquadDisplayName = (squadId: string) => {
    // First try to find the squad in the standings data (current season squads)
    const standingSquad = standings.find(s => s.squad_id === squadId);
    if (standingSquad) {
      return `${standingSquad.squad_name} [${standingSquad.squad_tag}]`;
    }
    
    // Then try to find in all squads (including historical)
    const allSquad = allSquads.find(s => s.id === squadId);
    if (allSquad) {
      return `${allSquad.name} [${allSquad.tag}]`;
    }
    
    // If not found, show truncated ID for unknown squads
    return `Unknown Squad (${squadId.slice(0, 8)})`;
  };

  const getRankIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-400" />;
      case 2:
        return <Trophy className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Trophy className="w-5 h-5 text-amber-600" />;
      default:
        return <Shield className="w-5 h-5 text-gray-500" />;
    }
  };

  const getRankBadgeColor = (position: number) => {
    switch (position) {
      case 1:
        return "bg-gradient-to-r from-yellow-500 to-yellow-600 text-black";
      case 2:
        return "bg-gradient-to-r from-gray-400 to-gray-500 text-white";
      case 3:
        return "bg-gradient-to-r from-amber-600 to-amber-700 text-white";
      default:
        return "bg-gradient-to-r from-gray-600 to-gray-700 text-white";
    }
  };

  if (loading || dataLoading) {
    return (
      <>
        <Navbar user={user} />
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading CTFPL Standings...</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar user={user} onMobileMenuChange={setNavbarMobileMenuOpen} />
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        {/* Mobile season selector button - only show when sidebar is closed and navbar menu is closed */}
        {!sidebarOpen && !navbarMobileMenuOpen && (
          <div className="lg:hidden fixed top-44 left-4 z-50">
            <button
              onClick={() => setSidebarOpen(true)}
              className="bg-gray-800/90 hover:bg-gray-700 text-white p-3 rounded-lg shadow-xl border border-cyan-500/50 backdrop-blur-sm"
            >
              <Menu className="w-5 h-5 text-cyan-400" />
            </button>
          </div>
        )}

        {/* Mobile Season Sidebar */}
        <div className={`lg:hidden fixed inset-y-0 left-0 z-40 w-64 bg-gray-800 border-r border-gray-700 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white mb-2">Seasons</h2>
            <p className="text-gray-400 text-sm">Select a season to view standings</p>
          </div>
          
          <div className="overflow-y-auto h-full pb-20">
            {seasonsLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500 mx-auto mb-2"></div>
                <p className="text-gray-400 text-sm">Loading seasons...</p>
              </div>
            ) : allSeasons.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-gray-400 text-sm">No seasons found</p>
              </div>
            ) : (
              allSeasons.map((season) => (
                <button
                  key={season.season_number}
                  onClick={() => handleSeasonSelect(season.season_number)}
                  disabled={dataLoading}
                  className={`w-full text-left p-4 border-b border-gray-700/50 hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedSeason === season.season_number 
                      ? 'bg-cyan-600/20 border-l-4 border-l-cyan-500' 
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Season {season.season_number}</div>
                      <div className="text-gray-400 text-xs">{season.season_name}</div>
                    </div>
                    <div className="flex flex-col items-end">
                      {season.status === 'active' && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                          Active
                        </span>
                      )}
                      {season.status === 'completed' && (
                        <span className="bg-gray-500 text-white text-xs px-2 py-1 rounded-full">
                          Completed
                        </span>
                      )}
                      {dataLoading && selectedSeason === season.season_number && (
                        <div className="animate-spin rounded-full h-3 w-3 border border-cyan-500 border-t-transparent mt-1"></div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30" 
            onClick={() => setSidebarOpen(false)}
          ></div>
        )}

        <div className="container mx-auto px-4 py-8">
          {/* Desktop Season Selector */}
          <div className="hidden lg:block mb-8">
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Season Selection</h2>
                  <p className="text-gray-400 text-sm">Choose a season to view standings</p>
                </div>
                {seasonsLoading && (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500"></div>
                )}
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Current Season Highlight */}
                {seasonInfo && (
                  <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-500/50 rounded-lg p-4 min-w-0 flex-shrink-0">
                    <div className="text-center">
                      <div className="text-cyan-400 font-bold text-lg">Season {selectedSeason}</div>
                      <div className="text-gray-300 text-sm truncate">{seasonInfo.season_name}</div>
                      {currentSeason === selectedSeason && (
                        <div className="mt-1">
                          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                            Current
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Season Dropdown/Selector */}
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <select
                      value={selectedSeason || ''}
                      onChange={(e) => handleSeasonSelect(Number(e.target.value))}
                      disabled={dataLoading || seasonsLoading}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                    >
                      <option value="" disabled>Select a season...</option>
                      {allSeasons.map((season) => (
                        <option key={season.season_number} value={season.season_number}>
                          Season {season.season_number} - {season.season_name} {season.status === 'active' ? '(Active)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronLeft className="absolute right-3 top-1/2 transform -translate-y-1/2 rotate-90 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                
                {/* Quick Navigation Buttons */}
                <div className="flex space-x-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      const currentIndex = allSeasons.findIndex(s => s.season_number === selectedSeason);
                      if (currentIndex < allSeasons.length - 1) {
                        handleSeasonSelect(allSeasons[currentIndex + 1].season_number);
                      }
                    }}
                    disabled={dataLoading || !selectedSeason || allSeasons.findIndex(s => s.season_number === selectedSeason) >= allSeasons.length - 1}
                    className="p-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Previous Season"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const currentIndex = allSeasons.findIndex(s => s.season_number === selectedSeason);
                      if (currentIndex > 0) {
                        handleSeasonSelect(allSeasons[currentIndex - 1].season_number);
                      }
                    }}
                    disabled={dataLoading || !selectedSeason || allSeasons.findIndex(s => s.season_number === selectedSeason) <= 0}
                    className="p-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Next Season"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                {dataLoading && (
                  <div className="flex-shrink-0">
                    <div className="animate-spin rounded-full h-6 w-6 border border-cyan-500 border-t-transparent"></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-cyan-400 mr-3" />
              <h1 className="text-4xl font-bold text-white">CTFPL Standings</h1>
            </div>
            <p className="text-gray-400 text-lg">
              Capture The Flag Player League - Season {selectedSeason || 'Loading...'}
              {seasonInfo && (
                <span className="text-cyan-400 ml-2">({seasonInfo.season_name})</span>
              )}
              {currentSeason === selectedSeason && (
                <span className="text-green-400 ml-2 text-sm">(Current)</span>
              )}
            </p>
          </div>

          {/* Playoff Awards - Only show for completed seasons */}
          {(() => {
            const currentSeasonData = allSeasons.find(s => s.season_number === selectedSeason);
            return currentSeasonData?.status === 'completed';
          })() && (
          <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 rounded-xl shadow-2xl border border-yellow-500/30 overflow-hidden mb-8">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-yellow-400 flex items-center mb-6">
                <Crown className="w-6 h-6 text-yellow-400 mr-3" />
                Playoff Awards
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Golden Flag - 1st Place */}
                <div className="bg-gradient-to-b from-yellow-600/20 to-yellow-800/20 border border-yellow-500/50 rounded-lg p-4 text-center">
                  <div className="text-yellow-400 text-4xl mb-2">🥇</div>
                  <h3 className="text-yellow-400 font-bold text-lg mb-2">Golden Flag</h3>
                  <p className="text-yellow-300 text-sm mb-3">1st Place</p>
                  <div className="text-white font-medium">
                    {(() => {
                      const currentSeasonData = allSeasons.find(s => s.season_number === selectedSeason);
                      if (currentSeasonData?.status === 'active' || currentSeasonData?.status === 'upcoming') {
                        return <span className="text-gray-400 italic">TBD</span>;
                      }
                      if (currentSeasonData?.champion_squad_ids && currentSeasonData.champion_squad_ids.length > 0) {
                        return (
                          <div className="space-y-1">
                            {currentSeasonData.champion_squad_ids.map((squadId: string, index: number) => (
                              <div key={index} className="text-yellow-200">
                                {getSquadDisplayName(squadId)}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return <span className="text-gray-400 italic">No Data</span>;
                    })()}
                  </div>
                </div>

                {/* Silver Flag - 2nd Place */}
                <div className="bg-gradient-to-b from-gray-400/20 to-gray-600/20 border border-gray-400/50 rounded-lg p-4 text-center">
                  <div className="text-gray-300 text-4xl mb-2">🥈</div>
                  <h3 className="text-gray-300 font-bold text-lg mb-2">Silver Flag</h3>
                  <p className="text-gray-400 text-sm mb-3">2nd Place</p>
                  <div className="text-white font-medium">
                    {(() => {
                      const currentSeasonData = allSeasons.find(s => s.season_number === selectedSeason);
                      if (currentSeasonData?.status === 'active' || currentSeasonData?.status === 'upcoming') {
                        return <span className="text-gray-400 italic">TBD</span>;
                      }
                      if (currentSeasonData?.runner_up_squad_ids && currentSeasonData.runner_up_squad_ids.length > 0) {
                        return (
                          <div className="space-y-1">
                            {currentSeasonData.runner_up_squad_ids.map((squadId: string, index: number) => (
                              <div key={index} className="text-gray-200">
                                {getSquadDisplayName(squadId)}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return <span className="text-gray-400 italic">No Data</span>;
                    })()}
                  </div>
                </div>

                {/* Bronze Flag - 3rd Place */}
                <div className="bg-gradient-to-b from-orange-600/20 to-orange-800/20 border border-orange-500/50 rounded-lg p-4 text-center">
                  <div className="text-orange-400 text-4xl mb-2">🥉</div>
                  <h3 className="text-orange-400 font-bold text-lg mb-2">Bronze Flag</h3>
                  <p className="text-orange-300 text-sm mb-3">3rd Place</p>
                  <div className="text-white font-medium">
                    {(() => {
                      const currentSeasonData = allSeasons.find(s => s.season_number === selectedSeason);
                      if (currentSeasonData?.status === 'active' || currentSeasonData?.status === 'upcoming') {
                        return <span className="text-gray-400 italic">TBD</span>;
                      }
                      if (currentSeasonData?.third_place_squad_ids && currentSeasonData.third_place_squad_ids.length > 0) {
                        return (
                          <div className="space-y-1">
                            {currentSeasonData.third_place_squad_ids.map((squadId: string, index: number) => (
                              <div key={index} className="text-orange-200">
                                {getSquadDisplayName(squadId)}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return <span className="text-gray-400 italic">No Data</span>;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Season Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 rounded-xl p-4 border border-cyan-500/30">
              <div className="text-center">
                <Users className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">Total Squads</p>
                <p className="text-xl font-bold text-white">{seasonStats.totalSquads}</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 rounded-xl p-4 border border-green-500/30">
              <div className="text-center">
                <BarChart3 className="w-6 h-6 text-green-400 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">Total Matches</p>
                <p className="text-xl font-bold text-white">{seasonStats.totalMatches}</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-xl p-4 border border-purple-500/30">
              <div className="text-center">
                <Calendar className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">Avg Matches</p>
                <p className="text-xl font-bold text-white">{seasonStats.averageMatchesPerSquad}</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/20 rounded-xl p-4 border border-yellow-500/30">
              <div className="text-center">
                <Crown className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">Top Win Rate</p>
                <p className="text-xl font-bold text-white">{seasonStats.topWinRate}%</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-orange-600/20 to-red-600/20 rounded-xl p-4 border border-orange-500/30">
              <div className="text-center">
                <Trophy className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">OT Games</p>
                <p className="text-xl font-bold text-white">{seasonStats.totalOvertimeGames}</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-xl p-4 border border-indigo-500/30">
              <div className="text-center">
                <BarChart3 className="w-6 h-6 text-indigo-400 mx-auto mb-2" />
                <p className="text-gray-400 text-xs">Avg Points</p>
                <p className="text-xl font-bold text-white">{seasonStats.averagePointsPerSquad}</p>
              </div>
            </div>
          </div>

          {/* Standings Table */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl shadow-2xl border border-gray-700/50 overflow-hidden">
            <div className="p-6 border-b border-gray-700/50">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <Trophy className="w-6 h-6 text-cyan-400 mr-3" />
                CTFPL Season Standings
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-700 to-gray-800">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Squad</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">MP</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">W</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">L</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">NS</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">RW</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">OTW</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Win %</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Points</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">K/D</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Captain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {standings.map((standing) => {
                    return (
                      <tr 
                        key={standing.id} 
                        className="hover:bg-gray-700/30 transition-colors duration-200"
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            {standing.matches_played > 0 ? (
                              <>
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2 ${getRankBadgeColor(standing.rank)}`}>
                                  {standing.rank}
                                </span>
                                {getRankIcon(standing.rank)}
                              </>
                            ) : (
                              <div className="flex items-center">
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mr-2 bg-gray-600 text-gray-400">
                                  -
                                </span>
                                <Shield className="w-5 h-5 text-gray-500" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link 
                            href={`/squads/${standing.squad_id}`}
                            className="flex items-center hover:bg-gray-600/30 transition-colors duration-200 rounded-lg p-1 -m-1"
                          >
                            {standing.banner_url ? (
                              <Image 
                                src={standing.banner_url} 
                                alt={`${standing.squad_name} banner`} 
                                width={32}
                                height={32}
                                className="rounded-lg mr-3 object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center mr-3">
                                <Shield className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-white hover:text-cyan-400 transition-colors">{standing.squad_name}</div>
                              <div className="text-xs text-gray-400">[{standing.squad_tag}]</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm text-gray-300">
                          {standing.matches_played}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm font-medium text-green-400">
                          {standing.wins}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm font-medium text-red-400">
                          {standing.losses}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm font-medium text-orange-400">
                          {standing.no_shows}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm text-gray-300">
                          {standing.regulation_wins}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm text-purple-400">
                          {standing.overtime_wins}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm text-gray-300">
                          {standing.matches_played > 0 ? `${Math.round(standing.win_percentage)}%` : '-'}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
                            {standing.points}
                            {standing.points_behind > 0 && (
                              <span className="ml-1 text-gray-600">(-{standing.points_behind})</span>
                            )}
                          </span>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-center text-sm">
                          <span className={`${standing.kill_death_difference >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {standing.kill_death_difference >= 0 ? '+' : ''}{standing.kill_death_difference}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{standing.captain_alias}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {standings.length === 0 && (
              <div className="text-center py-12">
                <Trophy className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">No standings data found for season {selectedSeason}</p>
                <p className="text-gray-500 text-sm">Standings will appear here once matches begin</p>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="mt-8 text-center text-gray-400 text-sm space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">📊 Column Legend</h4>
                <div className="text-xs space-y-1">
                  <p><span className="text-cyan-400">MP:</span> Matches Played</p>
                  <p><span className="text-green-400">W:</span> Wins <span className="text-red-400">L:</span> Losses <span className="text-orange-400">NS:</span> No Shows</p>
                  <p><span className="text-gray-300">RW:</span> Regulation Wins <span className="text-purple-400">OTW:</span> Overtime Wins</p>
                  <p><span className="text-gray-300">K/D:</span> Kill/Death Difference</p>
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">🏆 Scoring System</h4>
                <div className="text-xs space-y-1">
                  <p><span className="text-green-400">3 points</span> for a win (regulation or overtime)</p>
                  <p><span className="text-yellow-400">1 point</span> for participation (loss)</p>
                  <p><span className="text-red-400">0 points</span> for no-show</p>
                  <p className="text-gray-300">Tiebreakers: Points → Win% → RW → OTW → K/D</p>
                </div>
              </div>
            </div>
            <p className="mt-4">Season {selectedSeason} • Last updated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </>
  );
}