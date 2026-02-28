'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import AvailabilityHeatmap from '@/components/AvailabilityHeatmap';
import { Plus, Users, Clock, Calendar, Trash2, Target, Activity, ChevronDown, ChevronRight } from 'lucide-react';

interface ZoneInterest {
  id: string;
  zone_name: string;
  player_alias: string;
  player_email?: string;
  days_available: string[];
  time_ranges: Record<string, { start: string; end: string }>;
  timezone: string;
  notes?: string;
  created_at: string;
  user_id?: string; // null for guest accounts
}

interface ScheduledEvent {
  id: string;
  zone_name: string;
  event_name: string;
  scheduled_datetime: string;
  duration_minutes: number;
  organizer_alias: string;
  participants: string[];
  auto_start_zone: boolean;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
}

interface ZoneOption {
  name: string;
  key: string;
  description: string;
  typical_players: string;
  icon: string;
  status?: 'RUNNING' | 'STOPPED';
}

interface ServerZone {
  name: string;
  status: 'RUNNING' | 'STOPPED';
}

interface ServerZones {
  [key: string]: ServerZone;
}

interface ZoneCategory {
  name: string;
  icon: string;
  description: string;
  zones: ZoneOption[];
  defaultExpanded?: boolean;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Generate time options in 15-minute increments (12-hour format)
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const totalMinutes = i * 15;
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  const ampm = hours24 < 12 ? 'AM' : 'PM';
  const formattedMinutes = minutes.toString().padStart(2, '0');
  return {
    display: `${hours12}:${formattedMinutes} ${ampm}`,
    value: `${hours24.toString().padStart(2, '0')}:${formattedMinutes}`
  };
});

const TIMEZONES = [
  // US Timezones (PST through EST, including special cases)
  { value: 'America/Los_Angeles', label: 'PST - Pacific' },
  { value: 'America/Denver', label: 'MST - Mountain' },
  { value: 'America/Phoenix', label: 'MST - Arizona' },
  { value: 'America/Chicago', label: 'CST - Central' },
  { value: 'America/New_York', label: 'EST - Eastern' },
  
  // Other common timezones
  { value: 'Europe/London', label: 'GMT - London' },
  { value: 'Europe/Paris', label: 'CET - Central Europe' },
  { value: 'Europe/Berlin', label: 'CET - Berlin' },
  { value: 'Asia/Tokyo', label: 'JST - Tokyo' },
  { value: 'Australia/Sydney', label: 'AEST - Sydney' },
  { value: 'America/Toronto', label: 'EST - Toronto' },
  { value: 'America/Vancouver', label: 'PST - Vancouver' }
];

// Helper function to get current day name
const getCurrentDayName = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
};

export default function ZoneInterestPage() {
  const { user } = useAuth();
  const [zoneInterests, setZoneInterests] = useState<Record<string, ZoneInterest[]>>({});
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>([]);
  const [availableZones, setAvailableZones] = useState<ZoneOption[]>([]);
  const [zoneCategories, setZoneCategories] = useState<ZoneCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set()); // Start collapsed
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckCompleted, setAdminCheckCompleted] = useState(false);
  const [guestForm, setGuestForm] = useState({
    player_alias: '',
    player_email: '',
    timezone: 'America/New_York',
    days_available: [] as string[],
    time_ranges: {} as Record<string, { start: string; end: string }>,
    notes: ''
  });
  const [eventForm, setEventForm] = useState({
    zone_name: '',
    event_name: '',
    scheduled_date: '',
    scheduled_time: '',
    use_exact_time: false,
    exact_time: '',
    duration_minutes: 60,
    auto_start_zone: false, // Disabled for end users
    notes: ''
  });

  // Check admin status when user changes
  const checkAdminStatus = async () => {
    if (!user?.id) {
      setIsAdmin(false);
      setAdminCheckCompleted(true);
      return;
    }

    let adminStatus = false;
    
    // Check user metadata first (legacy)
    if (user?.user_metadata?.is_admin || user?.user_metadata?.ctf_role === 'ctf_admin') {
      adminStatus = true;
    }
    
    // Always check profiles table (more reliable)
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, ctf_role, in_game_alias')
        .eq('id', user.id)
        .single();
      
      if (error) {
        console.error('Error checking admin status:', error);
      } else if (profile) {
        const profileIsAdmin = profile.is_admin || 
                             profile.ctf_role === 'ctf_admin' || 
                             profile.ctf_role === 'ctf_head_referee';
        if (profileIsAdmin) {
          adminStatus = true;
        }
      }
    } catch (error) {
      console.error('Exception checking admin status:', error);
    }
    
    setIsAdmin(adminStatus);
    setAdminCheckCompleted(true);
  };

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    loadData();
  }, []);

  // Initialize form with user data when user changes or form opens
  useEffect(() => {
    if (showJoinForm && user) {
      const userAlias = user.user_metadata?.in_game_alias || '';
      setGuestForm(prev => ({
        ...prev,
        player_alias: userAlias,
        player_email: user.email || '',
        // Default to current day if no days selected
        days_available: prev.days_available.length === 0 ? [getCurrentDayName()] : prev.days_available
      }));
    }
  }, [showJoinForm, user]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadAvailableZones(),
        loadZoneInterests(),
        loadScheduledEvents()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableZones = async () => {
    setZonesLoading(true);
    try {
      const response = await fetch('/api/admin/zone-management');
      if (!response.ok) {
        throw new Error('Failed to fetch zones');
      }
      
      const data = await response.json();
      const serverZones = data.zones as ServerZones;
      
      // Convert server zones to ZoneOption format with descriptions and icons
      const zoneOptions: ZoneOption[] = Object.entries(serverZones).map(([key, zone]) => {
        // Generate descriptions and icons based on zone names
        let description = 'Game zone';
        let icon = '🎮';
        let typical_players = '4-16';
        
        const zoneName = zone.name.toLowerCase();
        if (zoneName.includes('ctf')) {
          description = 'Capture the Flag gameplay';
          icon = '🏁';
          typical_players = '12-24';
        } else if (zoneName.includes('arena')) {
          description = 'Arena combat';
          icon = '⚔️';
          typical_players = '8-16';
        } else if (zoneName.includes('league') || zoneName.includes('usl')) {
          description = 'League matches';
          icon = '🏆';
          typical_players = '12-24';
        } else if (zoneName.includes('skirmish')) {
          description = 'Skirmish battles';
          icon = '💥';
          typical_players = '6-12';
        } else if (zoneName.includes('gravball') || zoneName.includes('grav')) {
          description = 'GravBall sports action';
          icon = '⚽';
          typical_players = '8-16';
        } else if (zoneName.includes('twin peaks')) {
          description = 'Twin Peaks CTF';
          icon = '🏁';
          typical_players = '12-24';
        }
        
        return {
          name: zone.name,
          key: key,
          description,
          typical_players,
          icon,
          status: zone.status
        };
      });
      
      // Add test zone for site admins only
      // Use the component's admin state instead of doing another check
      if (isAdmin && adminCheckCompleted) {
        zoneOptions.push({
          name: 'TEST ZONE - Admin Only',
          key: 'test-zone-admin',
          description: '🧪 Test zone for development and admin testing purposes',
          typical_players: '4-12',
          icon: '🧪',
          status: 'STOPPED'
        });
        
        // Create fake test data for the test zone
        await createTestZoneData();
      }
      
      setAvailableZones(zoneOptions);
      
      // Categorize zones
      const categories = await categorizeZones(zoneOptions);
      setZoneCategories(categories);
      
    } catch (error) {
      console.error('Error loading available zones:', error);
      // Fallback to basic zones if server fetch fails
      const fallbackZones = [
        { name: 'General Gaming', key: 'general', description: 'General gaming zone', typical_players: '4-16', icon: '🎮' }
      ];
      setAvailableZones(fallbackZones);
      const fallbackCategories = await categorizeZones(fallbackZones);
      setZoneCategories(fallbackCategories);
    } finally {
      setZonesLoading(false);
    }
  };

  const createTestZoneData = async () => {
    try {
      // Clear existing test data first
      const { error: clearError } = await supabase
        .from('zone_interests')
        .delete()
        .or('player_alias.like.TestPlayer%,player_alias.like.TestGamer%,player_alias.like.CrossZone%,player_alias.like.AdminTester%');

      if (clearError) {
        console.error('Error clearing existing test data:', clearError);
        // Continue anyway, might be first time
      }
      
      // Also clear test events
      const { error: clearEventsError } = await supabase
        .from('scheduled_zone_events')
        .delete()
        .like('event_name', '[TEST]%');

      if (clearEventsError) {
        console.error('Error clearing test events:', clearEventsError);
      }

      // Create comprehensive test data across all zone types to showcase heatmap variety
      const testInterests: any[] = [];
      
      // Get zone keys for different categories
      const zoneKeys = {
        ctf: 'ctf', // CTF - Twin Peaks 2.0
        skirmish: 'skMini', // SK - Minimaps 
        sports: 'grav', // Sports - GravBall
        arcade: 'arena', // Arcade - The Arena
        admin: 'test-zone-admin' // Admin test zone - ENHANCED
      };

      // Generate 100+ diverse test players with realistic patterns
      const timeZones = ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'];
      
      // Create different availability patterns with more realistic gaming schedules
      const patterns = [
        // Prime time evening hours (most popular) - Peak gaming time
        { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], times: { start: '19:00', end: '22:00' }, weight: 25, description: 'Weekday prime time' },
        { days: ['Tuesday', 'Thursday'], times: { start: '20:00', end: '23:00' }, weight: 20, description: 'Mid-week late night' },
        { days: ['Wednesday', 'Friday'], times: { start: '18:00', end: '21:00' }, weight: 18, description: 'Early evening' },
        
        // Weekend warrior patterns (high popularity)
        { days: ['Saturday', 'Sunday'], times: { start: '14:00', end: '18:00' }, weight: 22, description: 'Weekend afternoon' },
        { days: ['Saturday'], times: { start: '10:00', end: '16:00' }, weight: 15, description: 'Saturday marathon' },
        { days: ['Sunday'], times: { start: '12:00', end: '17:00' }, weight: 12, description: 'Sunday session' },
        { days: ['Friday', 'Saturday', 'Sunday'], times: { start: '20:00', end: '23:59' }, weight: 16, description: 'Weekend nights' },
        
        // Night owl patterns (medium popularity)
        { days: ['Friday', 'Saturday'], times: { start: '22:00', end: '02:00' }, weight: 10, description: 'Late night warriors' },
        { days: ['Thursday', 'Friday'], times: { start: '21:00', end: '01:00' }, weight: 8, description: 'Pre-weekend late' },
        { days: ['Saturday', 'Sunday'], times: { start: '23:00', end: '03:00' }, weight: 6, description: 'Weekend night owls' },
        
        // Early bird patterns (lower popularity)
        { days: ['Saturday', 'Sunday'], times: { start: '08:00', end: '12:00' }, weight: 5, description: 'Morning warriors' },
        { days: ['Monday', 'Wednesday'], times: { start: '06:00', end: '09:00' }, weight: 3, description: 'Early birds' },
        { days: ['Tuesday', 'Thursday'], times: { start: '07:00', end: '10:00' }, weight: 4, description: 'Morning grind' },
        
        // Lunch break gamers (niche)
        { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], times: { start: '12:00', end: '13:30' }, weight: 8, description: 'Lunch break gaming' },
        
        // Flexible/all-day availability (for streamers/content creators)
        { days: ['Monday', 'Tuesday', 'Wednesday'], times: { start: '10:00', end: '22:00' }, weight: 5, description: 'Streamer schedule' },
        { days: ['Thursday', 'Friday'], times: { start: '09:00', end: '21:00' }, weight: 4, description: 'Content creator' },
        
        // Casual weekend-only players
        { days: ['Saturday'], times: { start: '19:00', end: '23:00' }, weight: 7, description: 'Saturday night casual' },
        { days: ['Sunday'], times: { start: '15:00', end: '19:00' }, weight: 6, description: 'Sunday afternoon' },
      ];

      let playerIndex = 1;

      // Create test data for each zone type with enhanced admin zone
      Object.entries(zoneKeys).forEach(([category, zoneKey]) => {
        // For admin test zone, create MUCH more data to make it visually impressive
        const isAdminZone = zoneKey === 'test-zone-admin';
        const multiplier = isAdminZone ? 3 : 1; // 3x more data for admin zone
        
        patterns.forEach((pattern, patternIndex) => {
          // Create multiple players per pattern based on weight
          const actualWeight = pattern.weight * multiplier;
          for (let i = 0; i < actualWeight; i++) {
            if (playerIndex > 500) break; // Cap at 500 players total
            
            const timeRanges: Record<string, { start: string; end: string }> = {};
            pattern.days.forEach(day => {
              timeRanges[day] = pattern.times;
            });

            // Create more realistic player names for admin zone
            const playerName = isAdminZone 
              ? `TestGamer${playerIndex}_${category}${i}`
              : `TestPlayer${playerIndex}`;
            
            const playerNotes = isAdminZone 
              ? `[ADMIN TEST] ${pattern.description} - ${category} enthusiast (Pattern ${patternIndex + 1})`
              : `${category} enthusiast - Pattern ${patternIndex + 1}`;

            testInterests.push({
              zone_name: zoneKey,
              player_alias: playerName,
              player_email: `test${playerIndex}@example.com`,
              days_available: pattern.days,
              time_ranges: timeRanges,
              timezone: timeZones[playerIndex % timeZones.length],
              notes: playerNotes,
              user_id: null // Guest players for testing
            });

            playerIndex++;
          }
        });
      });

      // Add cross-zone enthusiasts with enhanced data
      const crossZonePlayers = [
        {
          zones: ['ctf', 'skMini'],
          days: ['Monday', 'Wednesday', 'Friday'],
          times: { start: '19:00', end: '22:00' },
          count: 12,
          description: 'CTF/Skirmish hybrid players'
        },
        {
          zones: ['grav', 'arena'],
          days: ['Saturday', 'Sunday'],
          times: { start: '14:00', end: '17:00' },
          count: 8,
          description: 'Sports/Arcade weekend warriors'
        },
        {
          zones: ['ctf', 'grav', 'skMini'],
          days: ['Tuesday', 'Thursday'],
          times: { start: '20:00', end: '23:00' },
          count: 10,
          description: 'Multi-zone veterans'
        },
        {
          zones: ['test-zone-admin'],
          days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          times: { start: '09:00', end: '22:00' },
          count: 25,
          description: 'Admin zone stress testers'
        }
      ];

      crossZonePlayers.forEach((crossZone, crossIndex) => {
        for (let i = 0; i < crossZone.count; i++) {
          crossZone.zones.forEach(zoneKey => {
            if (playerIndex > 600) return; // Cap total players
            
            const timeRanges: Record<string, { start: string; end: string }> = {};
            crossZone.days.forEach(day => {
              timeRanges[day] = crossZone.times;
            });

            const isAdminZone = zoneKey === 'test-zone-admin';
            const playerName = isAdminZone 
              ? `AdminTester_${crossIndex}_${i}_${playerIndex}`
              : `CrossZone${crossIndex}_${i}_${playerIndex}`;

            testInterests.push({
              zone_name: zoneKey,
              player_alias: playerName,
              player_email: `crosszone${playerIndex}@example.com`,
              days_available: crossZone.days,
              time_ranges: timeRanges,
              timezone: timeZones[playerIndex % timeZones.length],
              notes: `[CROSS-ZONE] ${crossZone.description} - interested in ${crossZone.zones.join(', ')}`,
              user_id: null
            });

            playerIndex++;
          });
        }
      });

      // Insert test data in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < testInterests.length; i += batchSize) {
        const batch = testInterests.slice(i, i + batchSize);
        const { error } = await supabase
          .from('zone_interests')
          .insert(batch);

        if (error) {
          console.error(`Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error);
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Also create some test scheduled events for the admin zone
      const testEvents = [
        {
          zone_name: 'test-zone-admin',
          event_name: '[TEST] Admin Zone Stress Test',
          scheduled_datetime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
          duration_minutes: 90,
          organizer_alias: 'TestEventOrganizer',
          participants: ['AdminTester_0_0_1', 'AdminTester_1_0_2', 'TestGamer1_admin0'],
          auto_start_zone: false,
          status: 'scheduled' as const,
          notes: 'Admin-only test event to demonstrate scheduling functionality'
        },
        {
          zone_name: 'test-zone-admin',
          event_name: '[TEST] Peak Hours Demo Event',
          scheduled_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
          duration_minutes: 120,
          organizer_alias: 'TestEventOrganizer',
          participants: ['AdminTester_0_0_1', 'AdminTester_1_0_2', 'AdminTester_2_0_3', 'TestGamer1_admin0', 'TestGamer2_admin1'],
          auto_start_zone: false,
          status: 'scheduled' as const,
          notes: 'Large test event to show high participation'
        }
      ];

      const { error: eventsError } = await supabase
        .from('scheduled_zone_events')
        .insert(testEvents);

      if (eventsError) {
        console.error('Error creating test events:', eventsError);
      }
      
    } catch (error) {
      console.error('Error in createTestZoneData:', error);
    }
  };

  const loadZoneInterests = async () => {
    try {
      const { data, error } = await supabase
        .from('zone_interests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by zone
      const grouped = (data || []).reduce((acc: Record<string, ZoneInterest[]>, interest) => {
        const zone = interest.zone_name;
        if (!acc[zone]) acc[zone] = [];
        acc[zone].push(interest);
        return acc;
      }, {});

      setZoneInterests(grouped);
    } catch (error) {
      console.error('Error loading zone interests:', error);
    }
  };

  const loadScheduledEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduled_zone_events')
        .select('*')
        .gte('scheduled_datetime', new Date().toISOString())
        .order('scheduled_datetime', { ascending: true });

      if (error) throw error;
      setScheduledEvents(data || []);
    } catch (error) {
      console.error('Error loading scheduled events:', error);
    }
  };

  const handleJoinZone = async () => {
    if (!selectedZone || !guestForm.player_alias) return;

    try {
      // Find the selected zone to get the proper zone key
      const selectedZoneData = availableZones.find(z => z.name === selectedZone || z.key === selectedZone);
      const zoneKey = selectedZoneData?.key || selectedZone;

      // Use in_game_alias as the primary identifier, fallback to form input
      const playerAlias = user?.user_metadata?.in_game_alias || guestForm.player_alias;

      const interestData = {
        zone_name: zoneKey, // Use zone key for database consistency
        player_alias: playerAlias,
        player_email: guestForm.player_email || null,
        days_available: guestForm.days_available,
        time_ranges: guestForm.time_ranges,
        timezone: guestForm.timezone,
        notes: guestForm.notes || null,
        user_id: user?.id || null
      };

      const { error } = await supabase
        .from('zone_interests')
        .insert(interestData);

      if (error) throw error;

      // Reset form and reload data
      setGuestForm({
        player_alias: '',
        player_email: '',
        timezone: 'America/New_York',
        days_available: [],
        time_ranges: {},
        notes: ''
      });
      setShowJoinForm(false);
      setSelectedZone('');
      await loadZoneInterests();
    } catch (error) {
      console.error('Error joining zone interest:', error);
      alert('Failed to join zone interest. Please try again.');
    }
  };

  const handleCreateEvent = async () => {
    if (!eventForm.zone_name || !eventForm.event_name || !eventForm.scheduled_date || !eventForm.scheduled_time) return;

    try {
      const scheduledDatetime = new Date(`${eventForm.scheduled_date}T${eventForm.scheduled_time}`).toISOString();
      
      // Find the selected zone to get the proper zone key
      const selectedZoneData = availableZones.find(z => z.name === eventForm.zone_name || z.key === eventForm.zone_name);
      const zoneKey = selectedZoneData?.key || eventForm.zone_name;
      
      const eventData = {
        zone_name: zoneKey, // Use zone key for database consistency
        event_name: eventForm.event_name,
        scheduled_datetime: scheduledDatetime,
        duration_minutes: eventForm.duration_minutes,
                  organizer_alias: user?.user_metadata?.in_game_alias || 'Anonymous Organizer',
        participants: [],
        auto_start_zone: eventForm.auto_start_zone,
        status: 'scheduled' as const
      };

      const { error } = await supabase
        .from('scheduled_zone_events')
        .insert(eventData);

      if (error) throw error;

      // Reset form and reload data
      setEventForm({
        zone_name: '',
        event_name: '',
        scheduled_date: '',
        scheduled_time: '',
        use_exact_time: false,
        exact_time: '',
        duration_minutes: 60,
        auto_start_zone: false,
        notes: ''
      });
      setShowEventForm(false);
      await loadScheduledEvents();
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Failed to create event. Please try again.');
    }
  };

  const toggleDay = (day: string) => {
    const newDays = guestForm.days_available.includes(day)
      ? guestForm.days_available.filter(d => d !== day)
      : [...guestForm.days_available, day];
    
    setGuestForm(prev => ({ ...prev, days_available: newDays }));
  };

  const updateTimeRange = (day: string, type: 'start' | 'end', value: string) => {
    setGuestForm(prev => ({
      ...prev,
      time_ranges: {
        ...prev.time_ranges,
        [day]: {
          ...prev.time_ranges[day],
          [type]: value
        }
      }
    }));
  };

  const generateAvailabilityGraph = (interests: ZoneInterest[]) => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const dayAvailability: Record<string, Record<number, number>> = {};

    DAYS_OF_WEEK.forEach(day => {
      dayAvailability[day] = {};
      hours.forEach(hour => {
        dayAvailability[day][hour] = 0;
      });
    });

    interests.forEach((interest) => {
      interest.days_available.forEach(day => {
        const timeRange = interest.time_ranges[day];
        if (timeRange && timeRange.start && timeRange.end) {
          try {
            const startHour = parseInt(timeRange.start.split(':')[0]);
            const endHour = parseInt(timeRange.end.split(':')[0]);
            
            // Handle overnight ranges (e.g., 22:00 to 02:00)
            if (endHour >= startHour) {
              for (let hour = startHour; hour <= endHour; hour++) {
                dayAvailability[day][hour]++;
              }
            } else {
              // Overnight range
              for (let hour = startHour; hour <= 23; hour++) {
                dayAvailability[day][hour]++;
              }
              for (let hour = 0; hour <= endHour; hour++) {
                dayAvailability[day][hour]++;
              }
            }
          } catch (error) {
            console.error('Error parsing time range:', timeRange, error);
          }
        }
      });
    });

    return dayAvailability;
  };

  const getHeatmapColor = (count: number, maxCount: number) => {
    if (count === 0) return 'bg-gray-800';
    const intensity = count / maxCount;
    if (intensity <= 0.25) return 'bg-green-900/40';
    if (intensity <= 0.5) return 'bg-green-700/60';
    if (intensity <= 0.75) return 'bg-green-500/70';
    return 'bg-green-400/80';
  };

  const formatTimeRange = (timeRange: { start: string; end: string }) => {
    return `${timeRange.start} - ${timeRange.end}`;
  };

  const joinEvent = async (eventId: string) => {
    if (!user) {
      alert('Please log in to join events');
      return;
    }

    try {
      const event = scheduledEvents.find(e => e.id === eventId);
      if (!event) return;

      const playerAlias = user.user_metadata?.in_game_alias || 'Anonymous Player';
      const updatedParticipants = [...event.participants, playerAlias];

      const { error } = await supabase
        .from('scheduled_zone_events')
        .update({ participants: updatedParticipants })
        .eq('id', eventId);

      if (error) throw error;
      await loadScheduledEvents();
    } catch (error) {
      console.error('Error joining event:', error);
      alert('Failed to join event. Please try again.');
    }
  };

  const leaveEvent = async (eventId: string) => {
    if (!user) return;

    try {
      const event = scheduledEvents.find(e => e.id === eventId);
      if (!event) return;

      const playerAlias = user.user_metadata?.in_game_alias || 'Anonymous Player';
      const updatedParticipants = event.participants.filter(p => p !== playerAlias);

      const { error } = await supabase
        .from('scheduled_zone_events')
        .update({ participants: updatedParticipants })
        .eq('id', eventId);

      if (error) throw error;
      await loadScheduledEvents();
    } catch (error) {
      console.error('Error leaving event:', error);
      alert('Failed to leave event. Please try again.');
    }
  };

  // Function to categorize zones
  const categorizeZones = async (zones: ZoneOption[]): Promise<ZoneCategory[]> => {
    // Filter out test zones for public users (only show to admins)
    const publicZones = zones.filter(zone => {
      // Hide test zones from public users
      if (!isAdmin && (
        zone.key.toLowerCase().includes('test') || 
        zone.name.toLowerCase().includes('test') ||
        zone.key === 'test-zone-admin'
      )) {
        return false;
      }
      return true;
    });

    const categories: ZoneCategory[] = [
      {
        name: 'Skirmish',
        icon: '💥',
        description: 'Fast-paced combat and team battles',
        zones: [],
        defaultExpanded: true
      },
      {
        name: 'CTF',
        icon: '🏁',
        description: 'Capture The Flag gameplay',
        zones: [],
        defaultExpanded: true
      },
      {
        name: 'Sports',
        icon: '⚽',
        description: 'Sports-based gameplay modes',
        zones: []
      },
      {
        name: 'Arcade',
        icon: '🎮',
        description: 'Arcade-style game modes',
        zones: []
      },
      {
        name: 'League',
        icon: '🏆',
        description: 'Competitive league matches',
        zones: []
      }
    ];

    // Add admin-only category if user is admin and has test zones
    if (isAdmin && zones.some(zone => zone.key === 'test-zone-admin' || zone.name.toLowerCase().includes('test'))) {
      categories.push({
        name: 'Admin & Testing',
        icon: '🧪',
        description: 'Administrative and testing zones',
        zones: []
      });
    }

    // Categorize zones
    publicZones.forEach(zone => {
      const zoneName = zone.name.toLowerCase();
      const zoneKey = zone.key.toLowerCase();
      
      if (zoneName.includes('ctf') || zoneName.includes('capture the flag')) {
        categories.find(c => c.name === 'CTF')?.zones.push(zone);
      } else if (
        zoneName.includes('skirmish') || 
        zoneName.includes('sk -') || 
        zoneName.includes('usl') ||
        zoneName.includes('league')
      ) {
        // Group USL/League zones under Skirmish since they're skirmish-based
        if (zoneName.includes('usl') || zoneName.includes('league')) {
          // Filter out test zones from league category
          if (!zoneName.includes('test')) {
            categories.find(c => c.name === 'Skirmish')?.zones.push(zone);
          }
        } else {
          categories.find(c => c.name === 'Skirmish')?.zones.push(zone);
        }
      } else if (zoneName.includes('sports') || zoneName.includes('gravball')) {
        categories.find(c => c.name === 'Sports')?.zones.push(zone);
      } else if (zoneName.includes('arcade') || zoneName.includes('arena')) {
        categories.find(c => c.name === 'Arcade')?.zones.push(zone);
      } else if (zoneKey === 'test-zone-admin' || zoneName.includes('test')) {
        // Admin/test zones
        categories.find(c => c.name === 'Admin & Testing')?.zones.push(zone);
      } else {
        // Uncategorized zones go to Arcade
        categories.find(c => c.name === 'Arcade')?.zones.push(zone);
      }
    });

    // Filter out empty categories
    return categories.filter(category => category.zones.length > 0);
  };

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
        <div className="container mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-1/3 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 bg-gray-700 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Target className="w-8 h-8 text-cyan-400" />
            Zone Interest & Events
          </h1>
          <p className="text-gray-300 text-lg">
            Join zone interest groups, set your availability, and organize community events
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-4 mb-8 justify-center">
          <button
            onClick={() => setShowJoinForm(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium transition-all"
          >
            <Plus className="w-5 h-5" />
            Join Zone Interest
          </button>
          
          {user && (
            <button
              onClick={() => setShowEventForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all"
            >
              <Calendar className="w-5 h-5" />
              Schedule Event
            </button>
          )}
          
          {/* Admin Test Data Controls */}
          {isAdmin && adminCheckCompleted && (
            <>
              <button
                onClick={async () => {
                  try {
                    const response = await fetch('/api/admin/setup-zone-tables', {
                      method: 'POST'
                    });
                    const result = await response.json();
                    if (result.success) {
                      alert('Database tables setup completed!');
                    } else {
                      alert('Error setting up tables: ' + result.error);
                    }
                  } catch (error) {
                    console.error('Error setting up tables:', error);
                    alert('Error setting up tables: ' + (error as Error).message);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all text-sm"
              >
                🔧 Setup DB Tables
              </button>
              
              <button
                onClick={async () => {
                  await createTestZoneData();
                  await loadData(); // Reload all data
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white rounded-lg font-medium transition-all text-sm"
              >
                🧪 Refresh Test Data
              </button>
              
              <button
                onClick={async () => {
                  if (confirm('Clear ALL test data? This will remove all TestPlayer entries.')) {
                    const { error } = await supabase
                      .from('zone_interests')
                      .delete()
                      .or('player_alias.like.TestPlayer%,player_alias.like.TestGamer%,player_alias.like.CrossZone%,player_alias.like.AdminTester%');
                    
                    if (error) {
                      console.error('Error clearing test data:', error);
                      alert('Error clearing test data: ' + error.message);
                    } else {
                      alert('Test data cleared successfully');
                      await loadData(); // Reload all data
                    }
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-lg font-medium transition-all text-sm"
              >
                🗑️ Clear Test Data
              </button>
            </>
          )}
        </div>

        {/* Scheduled Events */}
        {scheduledEvents.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <Activity className="w-6 h-6 text-purple-400" />
              Upcoming Events
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scheduledEvents.map((event) => {
                const userParticipating = user && user.user_metadata?.in_game_alias && event.participants.includes(user.user_metadata.in_game_alias);
                
                return (
                  <div key={event.id} className="bg-gray-800/50 border border-gray-600/50 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">{event.event_name}</h3>
                      <span className="px-2 py-1 bg-purple-600/20 text-purple-300 text-xs rounded border border-purple-500/30">
                        {event.zone_name}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-300 mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-cyan-400" />
                        {new Date(event.scheduled_datetime).toLocaleDateString()} at {new Date(event.scheduled_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        {event.duration_minutes} minutes
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-cyan-400" />
                        {event.participants.length} participant{event.participants.length !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-gray-400">
                        Organized by: {event.organizer_alias}
                      </div>
                      {event.auto_start_zone && (
                        <div className="text-xs text-green-400">
                          🎯 Zone will auto-start 1 hour before event
                        </div>
                      )}
                    </div>

                    {user && (
                      <div className="flex gap-2">
                        {userParticipating ? (
                          <button
                            onClick={() => leaveEvent(event.id)}
                            className="flex-1 px-3 py-2 bg-red-600/20 text-red-300 border border-red-500/30 rounded text-sm hover:bg-red-600/30 transition-colors"
                          >
                            Leave Event
                          </button>
                        ) : (
                          <button
                            onClick={() => joinEvent(event.id)}
                            className="flex-1 px-3 py-2 bg-green-600/20 text-green-300 border border-green-500/30 rounded text-sm hover:bg-green-600/30 transition-colors"
                          >
                            Join Event
                          </button>
                        )}
                      </div>
                    )}
                    
                    {event.participants.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-600/30">
                        <div className="text-xs text-gray-400 mb-2">Participants:</div>
                        <div className="flex flex-wrap gap-1">
                          {event.participants.map((participant, idx) => (
                            <span key={idx} className="px-2 py-1 bg-gray-700/50 text-gray-300 text-xs rounded">
                              {participant}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Zone Categories */}
        <div className="space-y-6">
          {zoneCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.name);
            const totalInterested = category.zones.reduce((sum, zone) => 
              sum + (zoneInterests[zone.key] || []).length, 0
            );

            return (
              <div key={category.name} className="bg-gray-800/50 border border-gray-600/50 rounded-lg overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.name)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{category.icon}</span>
                    <div className="text-left">
                      <h2 className="text-xl font-semibold text-white">{category.name}</h2>
                      <p className="text-sm text-gray-400">{category.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-semibold text-cyan-400">{category.zones.length}</div>
                      <div className="text-xs text-gray-400">zones</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-green-400">{totalInterested}</div>
                      <div className="text-xs text-gray-400">interested</div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Category Content */}
                {isExpanded && (
                  <div className="border-t border-gray-600/30">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                      {category.zones.map((zone) => {
                        const interests = zoneInterests[zone.key] || [];
                        const availabilityData = generateAvailabilityGraph(interests);
                        const maxCount = Math.max(
                          ...Object.values(availabilityData).flatMap(dayData => Object.values(dayData))
                        );

                        return (
                          <div key={zone.key} className="bg-gray-700/30 border border-gray-600/30 rounded-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">{zone.icon}</span>
                                <div>
                                  <h3 className="text-lg font-semibold text-white">{zone.name}</h3>
                                  <p className="text-sm text-gray-400">{zone.typical_players} players</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xl font-bold text-cyan-400">{interests.length}</div>
                                <div className="text-xs text-gray-400">interested</div>
                                {zone.status && (
                                  <div className={`text-xs font-medium mt-1 px-2 py-1 rounded ${
                                    zone.status === 'RUNNING' 
                                      ? 'bg-green-600/20 text-green-300 border border-green-500/30' 
                                      : 'bg-red-600/20 text-red-300 border border-red-500/30'
                                  }`}>
                                    {zone.status === 'RUNNING' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                                  </div>
                                )}
                              </div>
                            </div>

                            <p className="text-gray-300 text-sm mb-4">{zone.description}</p>

                            {/* Enhanced Availability Heatmap */}
                            <AvailabilityHeatmap 
                              zoneName={zone.name} 
                              availabilityData={availabilityData}
                              maxCount={maxCount}
                              className="mb-4"
                            />

                            {/* Interest List */}
                            {interests.length > 0 && (
                              <div className="mb-4">
                                <h4 className="text-sm font-medium text-gray-300 mb-2">Interested Players</h4>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                  {interests.slice(0, 5).map((interest) => (
                                    <div key={interest.id} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-300">{interest.player_alias}</span>
                                      <span className="text-gray-500">{interest.timezone}</span>
                                    </div>
                                  ))}
                                  {interests.length > 5 && (
                                    <div className="text-xs text-gray-500 text-center">
                                      +{interests.length - 5} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            <button
                              onClick={() => {
                                setSelectedZone(zone.key);
                                setShowJoinForm(true);
                              }}
                              className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 text-cyan-300 border border-cyan-500/30 rounded hover:from-cyan-600/30 hover:to-blue-600/30 transition-all text-sm font-medium"
                            >
                              Join Interest Group
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Join Form Modal */}
        {showJoinForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold text-white mb-4">
                Join Zone Interest{selectedZone && `: ${selectedZone}`}
              </h3>

              <div className="space-y-4">
                {!selectedZone && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Zone</label>
                    <select
                      value={selectedZone}
                      onChange={(e) => setSelectedZone(e.target.value)}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="">Select a zone...</option>
                      {availableZones.map((zone) => (
                        <option key={zone.key} value={zone.key}>{zone.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Player Alias <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={guestForm.player_alias}
                    onChange={(e) => setGuestForm(prev => ({ ...prev, player_alias: e.target.value }))}
                    placeholder="Your in-game alias"
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email (optional)</label>
                  <input
                    type="email"
                    value={guestForm.player_email}
                    onChange={(e) => setGuestForm(prev => ({ ...prev, player_email: e.target.value }))}
                    placeholder="your@email.com"
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Timezone</label>
                  <select
                    value={guestForm.timezone}
                    onChange={(e) => setGuestForm(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Available Days</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`p-2 rounded text-sm font-medium transition-colors ${
                          guestForm.days_available.includes(day)
                            ? 'bg-cyan-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Ranges */}
                {guestForm.days_available.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Time Availability</label>
                    <div className="space-y-3">
                      {guestForm.days_available.map((day) => (
                        <div key={day} className="flex items-center gap-3">
                          <div className="w-20 text-sm text-gray-300">{day.slice(0, 3)}</div>
                          <select
                            value={guestForm.time_ranges[day]?.start || ''}
                            onChange={(e) => updateTimeRange(day, 'start', e.target.value)}
                            className="p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm flex-1"
                          >
                            <option value="">Start time...</option>
                            {TIME_OPTIONS.map((time) => (
                              <option key={time.value} value={time.value}>{time.display}</option>
                            ))}
                          </select>
                          <span className="text-gray-400">to</span>
                          <select
                            value={guestForm.time_ranges[day]?.end || ''}
                            onChange={(e) => updateTimeRange(day, 'end', e.target.value)}
                            className="p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm flex-1"
                          >
                            <option value="">End time...</option>
                            {TIME_OPTIONS.map((time) => (
                              <option key={time.value} value={time.value}>{time.display}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Notes (optional)</label>
                  <textarea
                    value={guestForm.notes}
                    onChange={(e) => setGuestForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional information..."
                    rows={3}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowJoinForm(false);
                    setSelectedZone('');
                    setGuestForm({
                      player_alias: '',
                      player_email: '',
                      timezone: 'America/New_York',
                      days_available: [],
                      time_ranges: {},
                      notes: ''
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinZone}
                  disabled={!selectedZone || !guestForm.player_alias}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Join Interest Group
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Event Form Modal */}
        {showEventForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-2xl w-full">
              <h3 className="text-xl font-semibold text-white mb-4">Schedule Zone Event</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Zone <span className="text-red-400">*</span></label>
                  <select
                    value={eventForm.zone_name}
                    onChange={(e) => setEventForm(prev => ({ ...prev, zone_name: e.target.value }))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  >
                    <option value="">Select a zone...</option>
                    {availableZones.map((zone) => (
                      <option key={zone.key} value={zone.key}>{zone.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Event Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={eventForm.event_name}
                    onChange={(e) => setEventForm(prev => ({ ...prev, event_name: e.target.value }))}
                    placeholder="e.g., 'Evening CTF Tournament'"
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Date <span className="text-red-400">*</span></label>
                    <input
                      type="date"
                      value={eventForm.scheduled_date}
                      onChange={(e) => setEventForm(prev => ({ ...prev, scheduled_date: e.target.value }))}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Time <span className="text-red-400">*</span></label>
                    <select
                      value={eventForm.scheduled_time}
                      onChange={(e) => setEventForm(prev => ({ ...prev, scheduled_time: e.target.value }))}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                    >
                      <option value="">Select time...</option>
                      {TIME_OPTIONS.map((time) => (
                        <option key={time.value} value={time.value}>{time.display}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Duration (minutes)</label>
                  <input
                    type="number"
                    value={eventForm.duration_minutes}
                    onChange={(e) => setEventForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                    className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>

                {/* Auto-start option removed for end users - admin feature only */}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowEventForm(false);
                    setEventForm({
                      zone_name: '',
                      event_name: '',
                      scheduled_date: '',
                      scheduled_time: '',
                      use_exact_time: false,
                      exact_time: '',
                      duration_minutes: 60,
                      auto_start_zone: false,
                      notes: ''
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateEvent}
                  disabled={!eventForm.zone_name || !eventForm.event_name || !eventForm.scheduled_date || !eventForm.scheduled_time}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Schedule Event
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 