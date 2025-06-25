'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

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

interface AvailabilityProfile {
  timezone: string;
  availability_days: string[];
  availability_times: Record<string, { start: string; end: string }>;
  preferred_game_types: string[];
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  contact_preferences: {
    discord?: string;
    in_game_only?: boolean;
    email_notifications?: boolean;
  };
  min_notice_hours: number;
  max_events_per_week: number;
  prefer_scheduled_events: boolean;
  notes?: string;
  last_updated: string;
}

interface AvailabilityEditorProps {
  initialData?: Partial<AvailabilityProfile>;
  onSubmit: (data: AvailabilityProfile) => void;
  onCancel?: () => void;
  title?: string;
  submitText?: string;
  showGameTypes?: boolean;
  showContactPreferences?: boolean;
  showSchedulingPreferences?: boolean;
  className?: string;
}

export default function AvailabilityEditor({
  initialData,
  onSubmit,
  onCancel,
  title = "Gaming Availability",
  submitText = "Save Availability",
  showGameTypes = true,
  showContactPreferences = true,
  showSchedulingPreferences = true,
  className = ""
}: AvailabilityEditorProps) {
  const [formData, setFormData] = useState<AvailabilityProfile>({
    timezone: 'America/New_York',
    availability_days: [],
    availability_times: {},
    preferred_game_types: [],
    skill_level: 'intermediate',
    contact_preferences: {
      in_game_only: false,
      email_notifications: true
    },
    min_notice_hours: 24,
    max_events_per_week: 5,
    prefer_scheduled_events: true,
    notes: '',
    last_updated: new Date().toISOString(),
    ...initialData
  });

  const [syncTimes, setSyncTimes] = useState(true);
  const [masterTime, setMasterTime] = useState({ start: '18:00', end: '22:00' });

  // Initialize master time from existing data
  useEffect(() => {
    if (initialData?.availability_times && Object.keys(initialData.availability_times).length > 0) {
      const firstTime = Object.values(initialData.availability_times)[0];
      if (firstTime) {
        setMasterTime(firstTime);
      }
    }
  }, [initialData]);

  const handleDayToggle = (day: string) => {
    setFormData(prev => {
      const isCurrentlySelected = prev.availability_days.includes(day);
      
      if (isCurrentlySelected) {
        // Remove day and its time range
        const newTimes = { ...prev.availability_times };
        delete newTimes[day];
        
        return {
          ...prev,
          availability_days: prev.availability_days.filter(d => d !== day),
          availability_times: newTimes
        };
      } else {
        // Add day with synced or default time range
        const timeToUse = syncTimes ? masterTime : { start: '18:00', end: '22:00' };
        return {
          ...prev,
          availability_days: [...prev.availability_days, day],
          availability_times: {
            ...prev.availability_times,
            [day]: timeToUse
          }
        };
      }
    });
  };

  const handleTimeChange = (day: string, type: 'start' | 'end', value: string) => {
    if (syncTimes) {
      // Update master time and sync to all selected days
      const newMasterTime = { ...masterTime, [type]: value };
      setMasterTime(newMasterTime);
      
      setFormData(prev => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach(selectedDay => {
          newTimes[selectedDay] = { ...newMasterTime };
        });
        
        return {
          ...prev,
          availability_times: newTimes
        };
      });
    } else {
      // Update only the specific day
      setFormData(prev => ({
        ...prev,
        availability_times: {
          ...prev.availability_times,
          [day]: {
            ...prev.availability_times[day],
            [type]: value
          }
        }
      }));
    }
  };

  const handleMasterTimeChange = (type: 'start' | 'end', value: string) => {
    const newMasterTime = { ...masterTime, [type]: value };
    setMasterTime(newMasterTime);
    
    if (syncTimes) {
      // Sync to all selected days
      setFormData(prev => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach(day => {
          newTimes[day] = { ...newMasterTime };
        });
        
        return {
          ...prev,
          availability_times: newTimes
        };
      });
    }
  };

  const handleGameTypeToggle = (gameType: string) => {
    setFormData(prev => ({
      ...prev,
      preferred_game_types: prev.preferred_game_types.includes(gameType)
        ? prev.preferred_game_types.filter(t => t !== gameType)
        : [...prev.preferred_game_types, gameType]
    }));
  };

  const formatTimeForDisplay = (time: string) => {
    const option = TIME_OPTIONS.find(t => t.value === time);
    return option ? option.display : time;
  };

  const getTimezoneAbbr = (timezone: string) => {
    const abbreviations: Record<string, string> = {
      'America/Los_Angeles': 'PST',
      'America/Denver': 'MST', 
      'America/Phoenix': 'MST',
      'America/Chicago': 'CST',
      'America/New_York': 'EST',
      'Europe/London': 'GMT',
      'Europe/Paris': 'CET',
      'Europe/Berlin': 'CET',
      'Asia/Tokyo': 'JST',
      'Australia/Sydney': 'AEST',
      'America/Toronto': 'EST',
      'America/Vancouver': 'PST'
    };
    return abbreviations[timezone] || timezone.split('/')[1];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.availability_days.length === 0) {
      toast.error('Please select at least one day of availability');
      return;
    }
    
    const submissionData: AvailabilityProfile = {
      ...formData,
      last_updated: new Date().toISOString()
    };
    
    onSubmit(submissionData);
  };

  const gameTypes = [
    { key: 'ctf', label: 'CTF', color: 'from-red-500 to-orange-500' },
    { key: 'gravball', label: 'GravBall', color: 'from-blue-500 to-cyan-500' },
    { key: 'arena', label: 'Arena', color: 'from-purple-500 to-pink-500' },
    { key: 'dueling', label: 'Dueling', color: 'from-green-500 to-emerald-500' },
    { key: 'league', label: 'League Play', color: 'from-yellow-500 to-amber-500' }
  ];

  return (
    <div className={`bg-gray-800 rounded-lg p-6 ${className}`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl">⏰</span>
          <h3 className="text-xl font-bold bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
            {title}
          </h3>
        </div>

        {/* Availability Section */}
        <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-xl p-4">
          <div className="space-y-4">
            {/* Time Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {syncTimes && (
                <div className="flex items-center gap-2">
                  <select
                    value={masterTime.start}
                    onChange={(e) => handleMasterTimeChange('start', e.target.value)}
                    className="bg-gray-700 border border-green-500/30 rounded px-2 py-1 text-white text-sm"
                  >
                    {TIME_OPTIONS.map(time => (
                      <option key={time.value} value={time.value}>{time.display}</option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-sm">to</span>
                  <select
                    value={masterTime.end}
                    onChange={(e) => handleMasterTimeChange('end', e.target.value)}
                    className="bg-gray-700 border border-green-500/30 rounded px-2 py-1 text-white text-sm"
                  >
                    {TIME_OPTIONS.map(time => (
                      <option key={time.value} value={time.value}>{time.display}</option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Sync Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-green-300">Sync Times</span>
                <button
                  type="button"
                  onClick={() => setSyncTimes(!syncTimes)}
                  className={`relative w-8 h-4 rounded-full transition-all duration-300 ${
                    syncTimes ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 ${
                    syncTimes ? 'translate-x-4' : 'translate-x-0.5'
                  }`}></div>
                </button>
              </div>

              {/* Timezone */}
              <div className="flex items-center gap-2">
                <span className="text-sm">🌍</span>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                  className="bg-gray-700 border border-blue-500/30 rounded px-2 py-1 text-white text-sm"
                >
                  <option value="America/Los_Angeles">PST - Pacific</option>
                  <option value="America/Denver">MST - Mountain</option>
                  <option value="America/Phoenix">MST - Arizona</option>
                  <option value="America/Chicago">CST - Central</option>
                  <option value="America/New_York">EST - Eastern</option>
                  <option value="Europe/London">GMT - London</option>
                  <option value="Europe/Paris">CET - Central Europe</option>
                  <option value="Europe/Berlin">CET - Berlin</option>
                  <option value="Asia/Tokyo">JST - Tokyo</option>
                  <option value="Australia/Sydney">AEST - Sydney</option>
                  <option value="America/Toronto">EST - Toronto</option>
                  <option value="America/Vancouver">PST - Vancouver</option>
                </select>
              </div>
            </div>

            {/* Days of Week */}
            <div className="grid grid-cols-7 gap-2">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 font-medium ${
                    formData.availability_days.includes(day)
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-400 text-white'
                      : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-green-500'
                  }`}
                >
                  {formData.availability_days.includes(day) && <span className="block text-xs mb-1">✓</span>}
                  {day.substring(0, 3)}
                </button>
              ))}
            </div>

            {/* Individual Day Times */}
            {!syncTimes && formData.availability_days.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-gray-600">
                {formData.availability_days.map((day) => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium text-green-300">{day.substring(0, 3)}</span>
                    <select
                      value={formData.availability_times[day]?.start || '18:00'}
                      onChange={(e) => handleTimeChange(day, 'start', e.target.value)}
                      className="bg-gray-700 border border-green-500/30 rounded px-2 py-1 text-white text-xs"
                    >
                      {TIME_OPTIONS.map(time => (
                        <option key={time.value} value={time.value}>{time.display}</option>
                      ))}
                    </select>
                    <span className="text-gray-400 text-xs">to</span>
                    <select
                      value={formData.availability_times[day]?.end || '22:00'}
                      onChange={(e) => handleTimeChange(day, 'end', e.target.value)}
                      className="bg-gray-700 border border-green-500/30 rounded px-2 py-1 text-white text-xs"
                    >
                      {TIME_OPTIONS.map(time => (
                        <option key={time.value} value={time.value}>{time.display}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Game Types */}
        {showGameTypes && (
          <div>
            <h4 className="text-lg font-medium text-gray-300 mb-3">Game Types You Enjoy</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gameTypes.map((gameType) => (
                <button
                  key={gameType.key}
                  type="button"
                  onClick={() => handleGameTypeToggle(gameType.key)}
                  className={`p-3 rounded-lg border-2 transition-all duration-300 font-medium ${
                    formData.preferred_game_types.includes(gameType.key)
                      ? `bg-gradient-to-r ${gameType.color} border-white/30 text-white`
                      : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {formData.preferred_game_types.includes(gameType.key) && <span className="block text-xs mb-1">✓</span>}
                  {gameType.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skill Level */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Skill Level</label>
          <select
            value={formData.skill_level}
            onChange={(e) => setFormData(prev => ({ ...prev, skill_level: e.target.value as any }))}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="expert">Expert</option>
          </select>
        </div>

        {/* Contact Preferences */}
        {showContactPreferences && (
          <div>
            <h4 className="text-lg font-medium text-gray-300 mb-3">Contact Preferences</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Discord Username (Optional)</label>
                <input
                  type="text"
                  value={formData.contact_preferences.discord || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_preferences: { ...prev.contact_preferences, discord: e.target.value }
                  }))}
                  placeholder="username#1234"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="in_game_only"
                  checked={formData.contact_preferences.in_game_only || false}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_preferences: { ...prev.contact_preferences, in_game_only: e.target.checked }
                  }))}
                  className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded"
                />
                <label htmlFor="in_game_only" className="text-sm text-gray-300">
                  Prefer in-game contact only
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="email_notifications"
                  checked={formData.contact_preferences.email_notifications !== false}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_preferences: { ...prev.contact_preferences, email_notifications: e.target.checked }
                  }))}
                  className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded"
                />
                <label htmlFor="email_notifications" className="text-sm text-gray-300">
                  Allow email notifications for events
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Scheduling Preferences */}
        {showSchedulingPreferences && (
          <div>
            <h4 className="text-lg font-medium text-gray-300 mb-3">Scheduling Preferences</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Minimum Notice (Hours)</label>
                <select
                  value={formData.min_notice_hours}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_notice_hours: parseInt(e.target.value) }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={4}>4 hours</option>
                  <option value={8}>8 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Max Events Per Week</label>
                <select
                  value={formData.max_events_per_week}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_events_per_week: parseInt(e.target.value) }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                >
                  <option value={1}>1 event</option>
                  <option value={2}>2 events</option>
                  <option value={3}>3 events</option>
                  <option value={5}>5 events</option>
                  <option value={7}>7 events</option>
                  <option value={10}>10+ events</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                id="prefer_scheduled"
                checked={formData.prefer_scheduled_events}
                onChange={(e) => setFormData(prev => ({ ...prev, prefer_scheduled_events: e.target.checked }))}
                className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded"
              />
              <label htmlFor="prefer_scheduled" className="text-sm text-gray-300">
                Prefer scheduled events over spontaneous matches
              </label>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Additional Notes</label>
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Any additional information about your availability or preferences..."
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white h-20"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-all duration-300"
          >
            {submitText}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-medium transition-all duration-300"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
} 