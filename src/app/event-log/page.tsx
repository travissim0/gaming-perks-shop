'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';
import { Clock, Users, Trophy, User, Search, Filter, Calendar } from 'lucide-react';
import Navbar from '@/components/Navbar';

interface PlayerEvent {
  id: string;
  player_id: string;
  event_type: string;
  event_data: any;
  description: string;
  created_at: string;
  squad_id?: string;
  profiles?: {
    in_game_alias: string;
    avatar_url?: string;
  };
  related_player_profiles?: {
    in_game_alias: string;
  };
  squads?: {
    name: string;
  };
}

const EVENT_ICONS: Record<string, string> = {
  'squad_joined': '➕',
  'squad_left': '➖',
  'squad_kicked': '🦵',
  'squad_promoted': '⬆️',
  'squad_demoted': '⬇️',
  'squad_ownership_transferred': '👑',
  'free_agents_joined': '🎯',
  'free_agents_left': '🚪',
  'match_played': '⚔️',
  'tournament_win': '🏆',
  'elo_change': '📊',
  'donation_made': '💰',
  'perk_purchased': '🛍️',
};

const EVENT_COLORS: Record<string, string> = {
  'squad_joined': 'text-green-400',
  'squad_left': 'text-yellow-400',
  'squad_kicked': 'text-red-400',
  'squad_promoted': 'text-blue-400',
  'squad_demoted': 'text-orange-400',
  'squad_ownership_transferred': 'text-purple-400',
  'free_agents_joined': 'text-cyan-400',
  'free_agents_left': 'text-gray-400',
  'match_played': 'text-green-300',
  'tournament_win': 'text-yellow-300',
  'elo_change': 'text-blue-300',
  'donation_made': 'text-green-500',
  'perk_purchased': 'text-pink-400',
};

export default function PlayerEventLogPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('30'); // days
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 25;

  useEffect(() => {
    fetchEvents();
  }, [eventTypeFilter, dateRange]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('player_events')
        .select(`
          *,
          profiles!player_events_player_id_fkey(in_game_alias, avatar_url),
          related_player_profiles:profiles!player_events_related_player_id_fkey(in_game_alias),
          squads(name)
        `)
        .order('created_at', { ascending: false });

      // Apply date filter
      if (dateRange !== 'all') {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(dateRange));
        query = query.gte('created_at', daysAgo.toISOString());
      }

      // Apply event type filter
      if (eventTypeFilter !== 'all') {
        query = query.eq('event_type', eventTypeFilter);
      }

      const { data, error: fetchError } = await query.limit(1000);

      if (fetchError) throw fetchError;

      setEvents(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      event.profiles?.in_game_alias?.toLowerCase().includes(searchLower) ||
      event.description.toLowerCase().includes(searchLower) ||
      event.squads?.name?.toLowerCase().includes(searchLower) ||
      event.related_player_profiles?.in_game_alias?.toLowerCase().includes(searchLower)
    );
  });

  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * eventsPerPage,
    currentPage * eventsPerPage
  );

  const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const eventDate = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - eventDate.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return eventDate.toLocaleDateString();
  };

  const renderEventDescription = (event: PlayerEvent) => {
    const playerName = event.profiles?.in_game_alias || 'Unknown Player';
    const squadName = event.squads?.name;
    const squadId = event.event_data?.squad_id || event.squad_id;

    // Create clickable player link
    const PlayerLink = ({ children }: { children: React.ReactNode }) => (
      <Link
        href={`/stats/player/${playerName}`}
        className="font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        {children}
      </Link>
    );

    // Create clickable squad link
    const SquadLink = ({ children }: { children: React.ReactNode }) => (
      squadId ? (
        <Link
          href={`/squads/${squadId}`}
          className="font-bold text-blue-400 hover:text-blue-300 transition-colors"
        >
          {children}
        </Link>
      ) : (
        <span className="font-bold text-blue-400">{children}</span>
      )
    );

    // Parse the description and replace player/squad names with clickable links
    switch (event.event_type) {
      case 'squad_joined':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-gray-300"> joined squad </span>
            {squadName && <SquadLink>{squadName}</SquadLink>}
            <span className="text-gray-400"> as {event.event_data?.role || 'player'}</span>
          </span>
        );

      case 'squad_left':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-gray-300"> left squad </span>
            {squadName && <SquadLink>{squadName}</SquadLink>}
          </span>
        );

      case 'squad_kicked':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-red-300"> was kicked from squad </span>
            {squadName && <SquadLink>{squadName}</SquadLink>}
          </span>
        );

      case 'squad_promoted':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-green-300"> was promoted to </span>
            <span className="text-green-400 font-semibold">{event.event_data?.new_role}</span>
            <span className="text-gray-300"> in </span>
            {squadName && <SquadLink>{squadName}</SquadLink>}
          </span>
        );

      case 'squad_demoted':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-orange-300"> was demoted to </span>
            <span className="text-orange-400 font-semibold">{event.event_data?.new_role}</span>
            <span className="text-gray-300"> in </span>
            {squadName && <SquadLink>{squadName}</SquadLink>}
          </span>
        );

      case 'squad_ownership_transferred':
        const action = event.event_data?.action;
        if (action === 'transferred_away') {
          return (
            <span className="text-white">
              <PlayerLink>{playerName}</PlayerLink>
              <span className="text-purple-300"> transferred ownership of </span>
              {squadName && <SquadLink>{squadName}</SquadLink>}
              <span className="text-gray-300"> to </span>
              <span className="text-cyan-400 font-semibold">{event.event_data?.transferred_to}</span>
            </span>
          );
        } else {
          return (
            <span className="text-white">
              <PlayerLink>{playerName}</PlayerLink>
              <span className="text-purple-300"> received ownership of </span>
              {squadName && <SquadLink>{squadName}</SquadLink>}
              <span className="text-gray-300"> from </span>
              <span className="text-cyan-400 font-semibold">{event.event_data?.received_from}</span>
            </span>
          );
        }

      case 'free_agents_joined':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-cyan-300"> joined the </span>
            <Link href="/free-agents" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
              free agents pool
            </Link>
          </span>
        );

      case 'free_agents_left':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-yellow-300"> left the </span>
            <Link href="/free-agents" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
              free agents pool
            </Link>
          </span>
        );

      case 'elo_change':
        const change = event.event_data?.change || 0;
        const oldElo = event.event_data?.old_elo;
        const newElo = event.event_data?.new_elo;
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-gray-300">'s ELO changed from </span>
            <span className="text-yellow-400 font-mono">{oldElo}</span>
            <span className="text-gray-300"> to </span>
            <span className="text-yellow-400 font-mono">{newElo}</span>
            <span className={`font-mono font-semibold ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {' '}({change > 0 ? '+' : ''}{change})
            </span>
          </span>
        );

      case 'tournament_win':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-yellow-300"> won tournament: </span>
            <span className="text-yellow-400 font-semibold">{event.event_data?.tournament_name}</span>
            {squadName && (
              <>
                <span className="text-gray-300"> representing </span>
                <SquadLink>{squadName}</SquadLink>
              </>
            )}
          </span>
        );

      case 'donation_made':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-green-300"> made a donation of </span>
            <span className="text-green-400 font-semibold">${event.event_data?.amount}</span>
          </span>
        );

      case 'perk_purchased':
        return (
          <span className="text-white">
            <PlayerLink>{playerName}</PlayerLink>
            <span className="text-pink-300"> purchased perk: </span>
            <span className="text-pink-400 font-semibold">{event.event_data?.perk_name}</span>
          </span>
        );

      default:
        // Fallback to original description with basic highlighting
        return (
          <span className="text-white">
            {event.description}
          </span>
        );
    }
  };

  const eventTypes = [
    { value: 'all', label: 'All Events' },
    { value: 'squad_joined', label: 'Squad Joined' },
    { value: 'squad_left', label: 'Squad Left' },
    { value: 'squad_kicked', label: 'Squad Kicked' },
    { value: 'squad_promoted', label: 'Squad Promoted' },
    { value: 'squad_demoted', label: 'Squad Demoted' },
    { value: 'squad_ownership_transferred', label: 'Squad Ownership' },
    { value: 'free_agents_joined', label: 'Free Agents Joined' },
    { value: 'free_agents_left', label: 'Free Agents Left' },
    { value: 'match_played', label: 'Match Played' },
    { value: 'tournament_win', label: 'Tournament Win' },
    { value: 'elo_change', label: 'ELO Change' },
  ];

  const dateRanges = [
    { value: '1', label: 'Last 24 hours' },
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: 'all', label: 'All time' },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-gray-400 mb-6">You need to be logged in to view the player event log.</p>
          <Link
            href="/auth/login"
            className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <Navbar user={user} />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Clock className="w-8 h-8 text-cyan-400 mr-3" />
            <h1 className="text-3xl font-bold text-white">Player Event Log</h1>
          </div>
          <p className="text-gray-400">
            Track all player activities across the community including squad movements, achievements, and more.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search players, squads, events..."
                className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Event Type Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 appearance-none"
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
              >
                {eventTypes.map((type) => (
                  <option key={type.value} value={type.value} className="bg-gray-800">
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filter */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 appearance-none"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                {dateRanges.map((range) => (
                  <option key={range.value} value={range.value} className="bg-gray-800">
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-4 text-sm text-gray-400">
            Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
            {searchTerm && ` matching "${searchTerm}"`}
          </div>
        </div>

        {/* Events List */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-400">Loading events...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-400 mb-4">Error loading events: {error}</p>
              <button
                onClick={fetchEvents}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : paginatedEvents.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No events found</p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-2 text-cyan-400 hover:text-cyan-300 text-sm"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-700/30">
              {paginatedEvents.map((event) => (
                <div key={event.id} className="p-4 hover:bg-gray-700/20 transition-colors">
                  <div className="flex items-center space-x-3">
                    {/* Event Icon */}
                    <div className={`text-xl flex-shrink-0 ${EVENT_COLORS[event.event_type] || 'text-gray-400'}`}>
                      {EVENT_ICONS[event.event_type] || '📋'}
                    </div>

                    {/* Event Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          {/* Enhanced Event Description with clickable elements */}
                          <div className="text-base leading-tight">
                            {renderEventDescription(event)}
                          </div>

                          {/* Additional event data */}
                          {event.event_data && Object.keys(event.event_data).length > 0 && (
                            <div className="mt-1 text-sm text-gray-400">
                              {event.event_data.previous_role && event.event_data.new_role && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-orange-400">{event.event_data.previous_role}</span>
                                  <span>→</span>
                                  <span className="text-green-400">{event.event_data.new_role}</span>
                                </span>
                              )}
                              {event.event_data.reason && (
                                <span className="ml-2 text-yellow-400">• {event.event_data.reason}</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <span className="text-sm text-gray-500 ml-4 flex-shrink-0">
                          {formatTimeAgo(event.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
              >
                Previous
              </button>

              <div className="flex space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-2 rounded-lg transition-colors ${
                        currentPage === page
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 