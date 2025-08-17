'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import TripleThreatBackground from '@/components/TripleThreatBackground';
import TripleThreatHeader from '@/components/TripleThreatHeader';

interface Event {
  id: string;
  event_type: string;
  title: string;
  description: string;
  related_user_id: string | null;
  related_user_alias: string | null;
  related_team_id: string | null;
  related_team_name: string | null;
  metadata: any;
  created_at: string;
  is_read: boolean;
}

export default function TripleThreatEventsPage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [limit, setLimit] = useState(25);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    time: '',
    message: ''
  });

  useEffect(() => {
    if (!authLoading) {
      loadEvents();
    }
  }, [authLoading, filter, limit]);

  const loadEvents = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Try RPC first, fallback to direct query
      try {
        const { data, error } = await supabase.rpc('get_tt_user_events', {
          user_id_input: user.id,
          limit_input: limit,
          offset_input: 0
        });

        if (error) throw error;
        setEvents(data || []);
      } catch (rpcError) {
        console.log('RPC failed for events, using direct query:', rpcError);
        
        // Fallback to simpler direct query
        const { data, error } = await supabase
          .from('tt_challenges')
          .select(`
            id, status, created_at, match_type,
            challenger_team:tt_teams!tt_challenges_challenger_team_id_fkey(team_name),
            challenged_team:tt_teams!tt_challenges_challenged_team_id_fkey(team_name),
            created_by_profile:profiles!tt_challenges_created_by_fkey(in_game_alias)
          `)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        // Transform challenge data to event format
        const challengeEvents = (data || []).map((challenge: any) => ({
          id: `challenge_${challenge.id}`,
          event_type: 'challenge_sent',
          title: '⚔️ Team Challenge',
          description: `${challenge.challenger_team?.team_name} challenged ${challenge.challenged_team?.team_name}`,
          related_user_id: null,
          related_user_alias: challenge.created_by_profile?.in_game_alias,
          related_team_id: null,
          related_team_name: challenge.challenger_team?.team_name,
          metadata: { status: challenge.status, match_type: challenge.match_type },
          created_at: challenge.created_at,
          is_read: true
        }));

        setEvents(challengeEvents);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'challenge_sent':
      case 'challenge_received':
        return '⚔️';
      case 'challenge_accepted':
        return '✅';
      case 'challenge_declined':
        return '❌';
      case 'team_created':
        return '🆕';
      case 'team_member_joined':
        return '👥';
      case 'team_member_left':
        return '👋';
      case 'match_created':
        return '🏆';
      case 'match_completed':
        return '🎯';
      case 'tournament_created':
        return '🏅';
      default:
        return '📝';
    }
  };

  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString([], { 
          hour: 'numeric', 
          minute: '2-digit' 
        });
        times.push({ value: timeString, display: displayTime });
      }
    }
    return times;
  };

  const handleScheduleResponse = async (event: Event, action: 'accept' | 'reject' | 'counter') => {
    if (!user || !event.metadata?.proposal_id) return;

    try {
      if (action === 'counter') {
        setSelectedEvent(event);
        setScheduleForm({
          date: '',
          time: '',
          message: ''
        });
        setShowScheduleModal(true);
        return;
      }

      const { data, error } = await supabase.rpc('respond_to_schedule_proposal', {
        proposal_id_input: event.metadata.proposal_id,
        responder_id: user.id,
        response_action: action,
        message_input: null
      });

      if (error) throw error;

      if (data && data.success) {
        alert(`Schedule ${action}ed successfully!`);
        loadEvents(); // Reload events
      } else {
        alert('Failed to respond: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error responding to schedule:', error);
      alert('Failed to respond: ' + error.message);
    }
  };

  const submitCounterProposal = async () => {
    if (!selectedEvent || !user || !scheduleForm.date || !scheduleForm.time) return;

    try {
      const proposedDateTime = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      
      const { data, error } = await supabase.rpc('respond_to_schedule_proposal', {
        proposal_id_input: selectedEvent.metadata.proposal_id,
        responder_id: user.id,
        response_action: 'counter',
        counter_time_input: proposedDateTime.toISOString(),
        message_input: scheduleForm.message || null
      });

      if (error) throw error;

      if (data && data.success) {
        alert('Counter proposal sent successfully!');
        setShowScheduleModal(false);
        setSelectedEvent(null);
        loadEvents();
      } else {
        alert('Failed to send counter proposal: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error sending counter proposal:', error);
      alert('Failed to send counter proposal: ' + error.message);
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'challenge_sent':
      case 'challenge_received':
        return 'from-purple-600/20 to-pink-600/20 border-purple-500/30';
      case 'challenge_accepted':
        return 'from-green-600/20 to-emerald-600/20 border-green-500/30';
      case 'challenge_declined':
        return 'from-red-600/20 to-orange-600/20 border-red-500/30';
      case 'team_created':
      case 'team_member_joined':
        return 'from-blue-600/20 to-cyan-600/20 border-blue-500/30';
      case 'team_member_left':
        return 'from-gray-600/20 to-slate-600/20 border-gray-500/30';
      case 'match_created':
      case 'match_completed':
        return 'from-yellow-600/20 to-amber-600/20 border-yellow-500/30';
      case 'tournament_created':
        return 'from-purple-600/20 to-indigo-600/20 border-purple-500/30';
      default:
        return 'from-gray-600/20 to-slate-600/20 border-gray-500/30';
    }
  };

  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'challenges') return event.event_type.includes('challenge');
    if (filter === 'teams') return event.event_type.includes('team');
    if (filter === 'matches') return event.event_type.includes('match');
    if (filter === 'unread') return !event.is_read;
    return true;
  });

  if (authLoading) {
    return (
      <TripleThreatBackground opacity={0.15}>
        <TripleThreatHeader currentPage="events" showTeamStatus={true} />
        <div className="flex items-center justify-center pt-20">
          <div className="text-xl animate-pulse text-white">Loading...</div>
        </div>
      </TripleThreatBackground>
    );
  }

  if (!user) {
    return (
      <TripleThreatBackground opacity={0.18}>
        <TripleThreatHeader currentPage="events" showTeamStatus={false} />
        <div className="max-w-4xl mx-auto px-6 pt-20">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold mb-4">Please Sign In</h1>
            <p className="text-gray-400 mb-8">You need to be logged in to view Triple Threat events.</p>
          </div>
        </div>
      </TripleThreatBackground>
    );
  }

  return (
    <TripleThreatBackground opacity={0.18}>
      <TripleThreatHeader currentPage="events" showTeamStatus={true} />

      {/* Header */}
      <div className="relative pt-20 pb-12 z-10">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300 bg-clip-text text-transparent drop-shadow-2xl">
            📜 Event Log
          </h1>
          <div className="bg-gradient-to-r from-cyan-400/15 via-purple-500/15 to-pink-400/15 backdrop-blur-sm border border-purple-400/40 rounded-2xl p-6 shadow-2xl shadow-purple-500/20">
            <p className="text-xl text-white/90">
              Complete history of Triple Threat activities and events
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20">
        
        {/* Filter Controls */}
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all' 
                  ? 'bg-cyan-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => setFilter('challenges')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'challenges' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              ⚔️ Challenges
            </button>
            <button
              onClick={() => setFilter('teams')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'teams' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              👥 Teams
            </button>
            <button
              onClick={() => setFilter('matches')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'matches' 
                  ? 'bg-yellow-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🏆 Matches
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'unread' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🔴 Unread
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <label className="text-white text-sm">Show:</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600"
            >
              <option value={25}>25 events</option>
              <option value={50}>50 events</option>
              <option value={100}>100 events</option>
            </select>
          </div>
        </div>

        {/* Events List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-xl animate-pulse text-white">Loading events...</div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📜</div>
            <h2 className="text-2xl font-bold text-gray-400 mb-4">No Events Found</h2>
            <p className="text-gray-500">
              {filter === 'all' 
                ? 'No events have been recorded yet.' 
                : `No ${filter} events found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <div 
                key={event.id} 
                className={`bg-gradient-to-r ${getEventColor(event.event_type)} backdrop-blur-sm border rounded-xl p-6 hover:scale-[1.01] transition-all duration-200 ${
                  !event.is_read ? 'ring-2 ring-cyan-400/50' : ''
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div className="text-3xl flex-shrink-0">
                    {getEventIcon(event.event_type)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-white">{event.title}</h3>
                      <div className="flex items-center space-x-2">
                        {!event.is_read && (
                          <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
                        )}
                        <span className="text-xs text-gray-400">
                          {new Date(event.created_at).toLocaleDateString()} {' '}
                          {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-gray-200 mb-3">{event.description}</p>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      {event.related_user_alias && (
                        <span>👤 {event.related_user_alias}</span>
                      )}
                      {event.related_team_name && (
                        <span>🛡️ {event.related_team_name}</span>
                      )}
                      {event.metadata?.status && (
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          event.metadata.status === 'pending' ? 'bg-yellow-600/30 text-yellow-200' :
                          event.metadata.status === 'accepted' ? 'bg-green-600/30 text-green-200' :
                          event.metadata.status === 'declined' ? 'bg-red-600/30 text-red-200' :
                          'bg-gray-600/30 text-gray-200'
                        }`}>
                          {event.metadata.status}
                        </span>
                      )}
                      
                      {/* Schedule Response Buttons */}
                      {event.event_type === 'schedule_proposed' && !event.is_read && event.metadata?.proposal_id && (
                        <div className="flex space-x-2 mt-3 pt-3 border-t border-gray-600/50">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScheduleResponse(event, 'accept');
                            }}
                            className="bg-green-600/80 hover:bg-green-600 text-white text-xs px-3 py-1 rounded transition-colors"
                          >
                            ✅ Accept
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScheduleResponse(event, 'counter');
                            }}
                            className="bg-blue-600/80 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded transition-colors"
                          >
                            📅 Counter
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScheduleResponse(event, 'reject');
                            }}
                            className="bg-red-600/80 hover:bg-red-600 text-white text-xs px-3 py-1 rounded transition-colors"
                          >
                            ❌ Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {filteredEvents.length >= limit && (
          <div className="text-center mt-8">
            <button
              onClick={() => setLimit(prev => prev + 25)}
              className="bg-purple-600/80 hover:bg-purple-600 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Load More Events
            </button>
          </div>
        )}

        {/* Counter Proposal Modal */}
        {showScheduleModal && selectedEvent && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-600/50 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  📅 Counter Propose Time
                </h3>
                <button
                  onClick={() => {
                    setShowScheduleModal(false);
                    setSelectedEvent(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <div className="text-center mb-4 p-3 bg-gray-800/50 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">Original Proposal</div>
                  <div className="font-medium text-white text-sm">
                    {selectedEvent.description}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Counter Date
                  </label>
                  <input
                    type="date"
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Counter Time (EST, 15-minute intervals)
                  </label>
                  <select
                    value={scheduleForm.time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    required
                  >
                    <option value="">Select time...</option>
                    {generateTimeOptions().map((time) => (
                      <option key={time.value} value={time.value}>
                        {time.display}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Message (Optional)
                  </label>
                  <textarea
                    value={scheduleForm.message}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, message: e.target.value })}
                    placeholder="Explain why you're proposing a different time..."
                    className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 transition-colors resize-none"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleModal(false);
                    setSelectedEvent(null);
                  }}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCounterProposal}
                  disabled={!scheduleForm.date || !scheduleForm.time}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Counter
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </TripleThreatBackground>
  );
}
