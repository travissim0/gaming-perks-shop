'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CLASS_OPTIONS, TIMEZONE_OPTIONS, ROLE_GROUPS } from '@/lib/constants';

export interface FreeAgentFormData {
  preferred_roles: string[];
  secondary_roles: string[];
  availability: string;
  availability_days: string[];
  availability_times: Record<string, { start: string; end: string }>;
  skill_level: string;
  class_ratings: Record<string, number>;
  classes_to_try: string[];
  notes: string;
  contact_info: string;
  timezone: string;
}

interface FreeAgentJoinFormProps {
  onSubmit: (data: FreeAgentFormData) => void;
  onCancel: () => void;
  initialData?: Partial<FreeAgentFormData>;
  submitLabel?: string;
}

export default function FreeAgentJoinForm({
  onSubmit,
  onCancel,
  initialData,
  submitLabel,
}: FreeAgentJoinFormProps) {
  const isEditMode = !!initialData;
  const buttonText = submitLabel || (isEditMode ? 'Update Free Agent Info' : 'Join Free Agent Pool');

  const [formData, setFormData] = useState({
    preferred_roles: [] as string[],
    secondary_roles: [] as string[],
    availability_days: [] as string[],
    availability_times: {} as Record<string, { start: string; end: string }>,
    skill_level: 'intermediate',
    class_ratings: {} as Record<string, number>,
    classes_to_try: [] as string[],
    notes: '',
    contact_info: '',
  });

  const [userTimezone, setUserTimezone] = useState('America/New_York');
  const [expandedSections, setExpandedSections] = useState({
    preferred: true,
    secondary: false,
    ratings: false,
    tryClasses: false,
  });
  const [syncTimes, setSyncTimes] = useState(true);
  const [masterTime, setMasterTime] = useState({ start: '18:00', end: '22:00' });

  // Pre-populate when initialData is provided (edit mode)
  useEffect(() => {
    if (initialData) {
      setFormData({
        preferred_roles: initialData.preferred_roles || [],
        secondary_roles: initialData.secondary_roles || [],
        availability_days: initialData.availability_days || [],
        availability_times: initialData.availability_times || {},
        skill_level: initialData.skill_level || 'intermediate',
        class_ratings: initialData.class_ratings || {},
        classes_to_try: initialData.classes_to_try || [],
        notes: initialData.notes || '',
        contact_info: initialData.contact_info || '',
      });
      if (initialData.timezone) setUserTimezone(initialData.timezone);
      // In edit mode, expand sections that have data
      setExpandedSections({
        preferred: true,
        secondary: (initialData.secondary_roles?.length || 0) > 0,
        ratings: Object.keys(initialData.class_ratings || {}).length > 0,
        tryClasses: (initialData.classes_to_try?.length || 0) > 0,
      });
    }
  }, [initialData]);

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const formatTimeForDisplay = (time: string, fromTimezone: string = 'America/New_York') => {
    if (!time) return '';
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateTime = new Date(`${today}T${time}:00`);
      if (userTimezone !== 'America/New_York') {
        const estTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true }).format(dateTime);
        const userTime = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, hour: '2-digit', minute: '2-digit', hour12: true }).format(dateTime);
        return `${estTime} EST (${userTime} your time)`;
      } else {
        const estTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true }).format(dateTime);
        return `${estTime} EST`;
      }
    } catch {
      return `${time} EST`;
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleRoleToggle = (role: string, type: 'preferred' | 'secondary' | 'try') => {
    if (type === 'preferred') {
      setFormData(prev => ({
        ...prev,
        preferred_roles: prev.preferred_roles.includes(role)
          ? prev.preferred_roles.filter(r => r !== role)
          : [...prev.preferred_roles, role],
      }));
    } else if (type === 'secondary') {
      setFormData(prev => ({
        ...prev,
        secondary_roles: prev.secondary_roles.includes(role)
          ? prev.secondary_roles.filter(r => r !== role)
          : [...prev.secondary_roles, role],
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        classes_to_try: prev.classes_to_try.includes(role)
          ? prev.classes_to_try.filter(r => r !== role)
          : [...prev.classes_to_try, role],
      }));
    }
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case 'Offense': return 'bg-gray-500/20 text-gray-300';
      case 'Defense': return 'bg-gray-600/20 text-gray-400';
      case 'Fighter': return 'bg-slate-500/20 text-slate-300';
      case 'Support': return 'bg-green-500/20 text-green-300';
      default: return 'bg-purple-500/20 text-purple-300';
    }
  };

  const handleDayToggle = (day: string) => {
    setFormData(prev => {
      const isCurrentlySelected = prev.availability_days.includes(day);
      if (isCurrentlySelected) {
        const newTimes = { ...prev.availability_times };
        delete newTimes[day];
        return { ...prev, availability_days: prev.availability_days.filter(d => d !== day), availability_times: newTimes };
      } else {
        const timeToUse = syncTimes ? masterTime : { start: '18:00', end: '22:00' };
        return { ...prev, availability_days: [...prev.availability_days, day], availability_times: { ...prev.availability_times, [day]: timeToUse } };
      }
    });
  };

  const handleTimeChange = (day: string, type: 'start' | 'end', value: string) => {
    if (syncTimes) {
      const newMasterTime = { ...masterTime, [type]: value };
      setMasterTime(newMasterTime);
      setFormData(prev => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach(selectedDay => { newTimes[selectedDay] = { ...newMasterTime }; });
        return { ...prev, availability_times: newTimes };
      });
    } else {
      setFormData(prev => ({
        ...prev,
        availability_times: { ...prev.availability_times, [day]: { ...prev.availability_times[day], [type]: value } },
      }));
    }
  };

  const handleMasterTimeChange = (type: 'start' | 'end', value: string) => {
    const newMasterTime = { ...masterTime, [type]: value };
    setMasterTime(newMasterTime);
    if (syncTimes) {
      setFormData(prev => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach(day => { newTimes[day] = { ...newMasterTime }; });
        return { ...prev, availability_times: newTimes };
      });
    }
  };

  const handleRatingChange = (role: string, rating: number) => {
    setFormData(prev => ({ ...prev, class_ratings: { ...prev.class_ratings, [role]: rating } }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.preferred_roles.length === 0) {
      toast.error('Please select at least one preferred role');
      return;
    }
    if (formData.availability_days.length === 0) {
      toast.error('Please select at least one day of availability');
      return;
    }

    const availabilityString = formData.availability_days.map(day => {
      const times = formData.availability_times[day];
      return times ? `${day}: ${times.start}-${times.end}` : day;
    }).join(', ');

    onSubmit({
      preferred_roles: formData.preferred_roles,
      secondary_roles: formData.secondary_roles,
      availability: availabilityString,
      availability_days: formData.availability_days,
      availability_times: formData.availability_times,
      skill_level: 'intermediate',
      class_ratings: formData.class_ratings,
      classes_to_try: formData.classes_to_try,
      notes: formData.notes,
      contact_info: formData.contact_info,
      timezone: userTimezone,
    });
  };

  const getClassColor = (role: string, isSelected: boolean) => {
    const colorMap: Record<string, string> = {
      'O INF': isSelected ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-red-500',
      'D INF': isSelected ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-red-500',
      'O HVY': isSelected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-500',
      'D HVY': isSelected ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-blue-500',
      'Medic': isSelected ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-yellow-500',
      'SL': isSelected ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-green-500',
      'Foot JT': isSelected ? 'bg-gray-400 border-gray-300 text-black' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400',
      'D Foot JT': isSelected ? 'bg-gray-400 border-gray-300 text-black' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400',
      'Pack JT': isSelected ? 'bg-gray-400 border-gray-300 text-black' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400',
      'Engineer': isSelected ? 'bg-amber-700 border-amber-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-amber-600',
      'Infil': isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500',
      '10-man Infil': isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500',
    };
    return colorMap[role] || (isSelected ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-purple-500');
  };

  const roleGroups = ROLE_GROUPS;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black/80 via-purple-900/20 to-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border border-cyan-500/20 animate-slideUp">
        <div className="text-center mb-8">
          <h3 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2 animate-pulse">
            {isEditMode ? '✏️ Update Free Agent Info' : '🎯 Join Free Agent Pool'}
          </h3>
          <p className="text-gray-400 text-lg">
            {isEditMode ? 'Update your details so squads can find you!' : 'Show your skills and find your perfect squad!'}
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-cyan-400 to-purple-400 mx-auto mt-4 rounded-full animate-pulse"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Preferred Classes */}
          <div className="border border-cyan-500/30 rounded-xl bg-gradient-to-r from-cyan-500/5 to-purple-500/5 shadow-lg hover:shadow-cyan-500/20 transition-all duration-300">
            <button
              type="button"
              onClick={() => toggleSection('preferred')}
              className="w-full flex items-center justify-between p-6 bg-gradient-to-r from-cyan-600/20 to-purple-600/20 hover:from-cyan-600/30 hover:to-purple-600/30 transition-all duration-300 rounded-t-xl group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl animate-bounce">⭐</span>
                <span className="text-lg font-bold bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent">
                  Preferred Classes
                </span>
                <span className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30 animate-pulse">
                  REQUIRED
                </span>
              </div>
              <span className="text-cyan-400 text-xl group-hover:scale-110 transition-transform duration-300">
                {expandedSections.preferred ? '−' : '+'}
              </span>
            </button>
            {expandedSections.preferred && (
              <div className="p-4 border-t border-cyan-500/20 animate-slideDown">
                {/* Row 1: Infantry and Heavy Weapons */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {roleGroups.slice(0, 2).map((group, groupIndex) => (
                    <div key={group.name} className="space-y-2">
                      <h4 className="text-sm font-bold text-cyan-300 mb-2">{group.name}</h4>
                      <div className="border border-gray-600 rounded-lg overflow-hidden grid grid-cols-2">
                        {group.roles.map((role, roleIndex) => (
                          <button
                            key={role.key}
                            type="button"
                            onClick={() => handleRoleToggle(role.key, 'preferred')}
                            className={`p-2 text-xs border-r last:border-r-0 transition-all duration-300 font-medium ${getClassColor(role.key, formData.preferred_roles.includes(role.key))}`}
                            style={{ animationDelay: `${(groupIndex * 2 + roleIndex) * 50}ms` }}
                          >
                            <div className="text-sm font-bold mb-1">{role.label}</div>
                            <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(role.tag)}`}>{role.tag}</div>
                            {formData.preferred_roles.includes(role.key) && <div className="text-xs mt-1 animate-pulse">✓</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Row 2: Jump Trooper, Pack JT, Infiltrator */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  <div className="col-span-2 space-y-2">
                    <h4 className="text-sm font-bold text-cyan-300 mb-2">Jump Trooper</h4>
                    <div className="border border-gray-600 rounded-lg overflow-hidden grid grid-cols-2">
                      {roleGroups[2].roles.map((role) => (
                        <button key={role.key} type="button" onClick={() => handleRoleToggle(role.key, 'preferred')}
                          className={`p-2 text-xs border-r last:border-r-0 transition-all duration-300 font-medium ${getClassColor(role.key, formData.preferred_roles.includes(role.key))}`}>
                          <div className="text-sm font-bold mb-1">{role.label}</div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(role.tag)}`}>{role.tag}</div>
                          {formData.preferred_roles.includes(role.key) && <div className="text-xs mt-1 animate-pulse">✓</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-1 space-y-2">
                    <h4 className="text-sm font-bold text-cyan-300 mb-2">Pack JT</h4>
                    <div className="border border-gray-600 rounded-lg overflow-hidden">
                      <button type="button" onClick={() => handleRoleToggle('Pack JT', 'preferred')}
                        className={`p-2 text-xs transition-all duration-300 font-medium w-full ${getClassColor('Pack JT', formData.preferred_roles.includes('Pack JT'))}`}>
                        <div className="text-sm font-bold mb-1">Pack</div>
                        <div className={`text-xs px-1 py-0.5 rounded ${getTagColor('Offense')}`}>Offense</div>
                        {formData.preferred_roles.includes('Pack JT') && <div className="text-xs mt-1 animate-pulse">✓</div>}
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <h4 className="text-sm font-bold text-cyan-300 mb-2">Infiltrator</h4>
                    <div className="border border-gray-600 rounded-lg overflow-hidden grid grid-cols-2">
                      {roleGroups[7].roles.map((role) => (
                        <button key={role.key} type="button" onClick={() => handleRoleToggle(role.key, 'preferred')}
                          className={`p-2 text-xs border-r last:border-r-0 transition-all duration-300 font-medium ${getClassColor(role.key, formData.preferred_roles.includes(role.key))}`}>
                          <div className="text-sm font-bold mb-1">{role.label}</div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(role.tag)}`}>{role.tag}</div>
                          {formData.preferred_roles.includes(role.key) && <div className="text-xs mt-1 animate-pulse">✓</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 3: Medic, Engineer, Squad Leader */}
                <div className="grid grid-cols-3 gap-4">
                  {[roleGroups[4], roleGroups[5], roleGroups[6]].map((group) => (
                    <div key={group.name} className="space-y-2">
                      <h4 className="text-sm font-bold text-cyan-300 mb-2">{group.name}</h4>
                      <div className="border border-gray-600 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => handleRoleToggle(group.roles[0].key, 'preferred')}
                          className={`p-2 text-xs transition-all duration-300 font-medium w-full ${getClassColor(group.roles[0].key, formData.preferred_roles.includes(group.roles[0].key))}`}>
                          <div className="text-sm font-bold mb-1">{group.roles[0].label}</div>
                          <div className={`text-xs px-1 py-0.5 rounded ${getTagColor(group.roles[0].tag)}`}>{group.roles[0].tag}</div>
                          {formData.preferred_roles.includes(group.roles[0].key) && <div className="text-xs mt-1 animate-pulse">✓</div>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Consolidated Row: Secondary, Ratings, Try */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Secondary Classes */}
            <div className="border border-yellow-500/30 rounded-xl bg-gradient-to-r from-yellow-500/5 to-amber-500/5 shadow-lg hover:shadow-yellow-500/20 transition-all duration-300">
              <button type="button" onClick={() => toggleSection('secondary')}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-yellow-600/20 to-amber-600/20 hover:from-yellow-600/30 hover:to-amber-600/30 transition-all duration-300 rounded-t-xl group">
                <div className="flex items-center gap-2">
                  <span className="text-lg animate-bounce">⚡</span>
                  <span className="text-sm font-bold bg-gradient-to-r from-yellow-300 to-amber-300 bg-clip-text text-transparent">Secondary Classes</span>
                </div>
                <span className="text-yellow-400 text-lg group-hover:scale-110 transition-transform duration-300">{expandedSections.secondary ? '−' : '+'}</span>
              </button>
              {expandedSections.secondary && (
                <div className="p-4 border-t border-yellow-500/20 animate-slideDown">
                  <p className="text-gray-400 text-xs mb-3">Can play but not preferred</p>
                  <div className="grid grid-cols-1 gap-2">
                    {CLASS_OPTIONS.map((role, index) => (
                      <button key={role} type="button" onClick={() => handleRoleToggle(role, 'secondary')}
                        className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 transform hover:scale-105 font-medium opacity-75 ${getClassColor(role, formData.secondary_roles?.includes(role) || false)}`}
                        style={{ animationDelay: `${index * 30}ms` }}>
                        <span className="block text-sm mb-1">{role}</span>
                        {formData.secondary_roles?.includes(role) && <span className="text-xs opacity-80 animate-pulse">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rate Your Classes */}
            <div className="border border-pink-500/30 rounded-xl bg-gradient-to-r from-pink-500/5 to-rose-500/5 shadow-lg hover:shadow-pink-500/20 transition-all duration-300">
              <button type="button" onClick={() => toggleSection('ratings')}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-pink-600/20 to-rose-600/20 hover:from-pink-600/30 hover:to-rose-600/30 transition-all duration-300 rounded-t-xl group">
                <div className="flex items-center gap-2">
                  <span className="text-lg animate-pulse">⭐</span>
                  <span className="text-sm font-bold bg-gradient-to-r from-pink-300 to-rose-300 bg-clip-text text-transparent">Rate Your Classes</span>
                </div>
                <span className="text-pink-400 text-lg group-hover:scale-110 transition-transform duration-300">{expandedSections.ratings ? '−' : '+'}</span>
              </button>
              {expandedSections.ratings && (
                <div className="p-4 border-t border-pink-500/20 animate-slideDown">
                  <p className="text-gray-400 text-xs mb-3">Rate 1-5 scale</p>
                  <div className="space-y-3">
                    {[...formData.preferred_roles, ...(formData.secondary_roles || [])].filter((role, index, arr) => arr.indexOf(role) === index).map(role => (
                      <div key={role} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg border border-pink-500/20">
                        <span className="font-medium text-pink-300 text-xs">{role}</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(rating => (
                            <button key={rating} type="button" onClick={() => handleRatingChange(role, rating)}
                              className={`w-6 h-6 rounded-lg text-xs font-bold transition-all duration-300 transform hover:scale-110 border ${
                                (formData.class_ratings?.[role] || 0) >= rating
                                  ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-black border-yellow-300 shadow-sm shadow-yellow-400/30'
                                  : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600 hover:text-yellow-300 hover:border-yellow-500'
                              }`}>
                              {rating}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Classes to Try */}
            <div className="border border-indigo-500/30 rounded-xl bg-gradient-to-r from-indigo-500/5 to-violet-500/5 shadow-lg hover:shadow-indigo-500/20 transition-all duration-300">
              <button type="button" onClick={() => toggleSection('tryClasses')}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600/20 to-violet-600/20 hover:from-indigo-600/30 hover:to-violet-600/30 transition-all duration-300 rounded-t-xl group">
                <div className="flex items-center gap-2">
                  <span className="text-lg animate-bounce">🎯</span>
                  <span className="text-sm font-bold bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">Classes to Try</span>
                </div>
                <span className="text-indigo-400 text-lg group-hover:scale-110 transition-transform duration-300">{expandedSections.tryClasses ? '−' : '+'}</span>
              </button>
              {expandedSections.tryClasses && (
                <div className="p-4 border-t border-indigo-500/20 animate-slideDown">
                  <p className="text-gray-400 text-xs mb-3">Want to learn this season</p>
                  <div className="grid grid-cols-1 gap-2">
                    {CLASS_OPTIONS.map((role, index) => (
                      <button key={role} type="button" onClick={() => handleRoleToggle(role, 'try')}
                        className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 transform hover:scale-105 font-medium opacity-60 ${getClassColor(role, formData.classes_to_try?.includes(role) || false)}`}
                        style={{ animationDelay: `${index * 30}ms` }}>
                        <span className="block text-sm mb-1">{role}</span>
                        {formData.classes_to_try?.includes(role) && <span className="text-xs opacity-80 animate-pulse">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Availability */}
          <div className="border border-green-500/30 rounded-xl bg-gradient-to-r from-green-500/5 to-blue-500/5 shadow-lg hover:shadow-green-500/20 transition-all duration-300">
            <div className="p-4 bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-t-xl">
              <div className="space-y-4 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl sm:text-2xl animate-pulse">⏰</span>
                  <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-green-300 to-blue-300 bg-clip-text text-transparent">Practice Availability</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {syncTimes && (
                      <div className="flex items-center gap-2">
                        <select value={masterTime.start} onChange={(e) => handleMasterTimeChange('start', e.target.value)}
                          className="bg-gray-700/80 border border-green-500/30 rounded-lg px-2 py-1 text-white text-xs focus:border-green-400 transition-all duration-300 min-w-0 flex-1 sm:w-auto">
                          {timeSlots.map(time => <option key={time} value={time}>{formatTimeForDisplay(time, userTimezone)}</option>)}
                        </select>
                        <span className="text-gray-400 text-xs flex-shrink-0">to</span>
                        <select value={masterTime.end} onChange={(e) => handleMasterTimeChange('end', e.target.value)}
                          className="bg-gray-700/80 border border-green-500/30 rounded-lg px-2 py-1 text-white text-xs focus:border-green-400 transition-all duration-300 min-w-0 flex-1 sm:w-auto">
                          {timeSlots.map(time => <option key={time} value={time}>{formatTimeForDisplay(time, userTimezone)}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-300">Sync Times</span>
                      <button type="button" onClick={() => setSyncTimes(!syncTimes)}
                        className={`relative w-8 h-4 rounded-full transition-all duration-300 ${syncTimes ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-600'} shadow-sm flex-shrink-0`}>
                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 ${syncTimes ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm animate-spin-slow flex-shrink-0">🌍</span>
                    <select value={userTimezone} onChange={(e) => setUserTimezone(e.target.value)}
                      className="bg-gray-700/80 border border-blue-500/30 rounded-lg px-2 sm:px-3 py-1 text-white text-xs sm:text-sm focus:border-blue-400 transition-all duration-300 min-w-0 flex-1 sm:w-auto">
                      {TIMEZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => (
                  <button key={day} type="button" onClick={() => handleDayToggle(day)}
                    className={`p-2 rounded-lg text-xs border-2 transition-all duration-300 transform hover:scale-105 font-medium ${
                      formData.availability_days.includes(day)
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-400 text-white shadow-lg shadow-green-500/30'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-green-500 hover:bg-gray-700'
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}>
                    {formData.availability_days.includes(day) && <span className="block text-xs mb-1 animate-pulse">✓</span>}
                    {day.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 space-y-3">
              {formData.availability_days.map((day, index) => (
                <div key={day} className="space-y-2" style={{ animationDelay: `${index * 100}ms` }}>
                  <div className="flex items-center gap-3">
                    <span className="w-16 text-sm font-medium text-green-300">{day.substring(0, 3)}</span>
                    <div className="flex items-center gap-2 text-sm flex-wrap animate-slideIn">
                      <select value={formData.availability_times[day]?.start || '18:00'} onChange={(e) => handleTimeChange(day, 'start', e.target.value)} disabled={syncTimes}
                        className={`border rounded px-2 py-1 text-white text-xs transition-all duration-300 ${syncTimes ? 'bg-gray-600 border-gray-500 cursor-not-allowed opacity-75' : 'bg-gray-700 border-green-500/30 focus:border-green-400 hover:border-green-400'}`}>
                        {timeSlots.map(time => (
                          <option key={time} value={time}>{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${time}:00`))}</option>
                        ))}
                      </select>
                      <span className="text-gray-400 text-xs">to</span>
                      <select value={formData.availability_times[day]?.end || '22:00'} onChange={(e) => handleTimeChange(day, 'end', e.target.value)} disabled={syncTimes}
                        className={`border rounded px-2 py-1 text-white text-xs transition-all duration-300 ${syncTimes ? 'bg-gray-600 border-gray-500 cursor-not-allowed opacity-75' : 'bg-gray-700 border-green-500/30 focus:border-green-400 hover:border-green-400'}`}>
                        {timeSlots.map(time => (
                          <option key={time} value={time}>{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(`2000-01-01T${time}:00`))}</option>
                        ))}
                      </select>
                      <span className="text-green-400 text-xs font-bold">EST</span>
                    </div>
                  </div>
                  {userTimezone !== 'America/New_York' && (
                    <div className="ml-16 text-xs text-blue-400 bg-blue-500/10 rounded p-1 border border-blue-500/20 animate-fadeIn">
                      <span className="text-blue-300">🌍</span> {formatTimeForDisplay(formData.availability_times[day]?.start || '18:00')} - {formatTimeForDisplay(formData.availability_times[day]?.end || '22:00')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="border border-purple-500/30 rounded-xl bg-gradient-to-r from-purple-500/5 to-pink-500/5 p-6 shadow-lg hover:shadow-purple-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl animate-bounce">💬</span>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">Discord Username</span>
              <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full text-xs font-medium border border-purple-500/30">optional</span>
            </div>
            <input type="text" value={formData.contact_info}
              onChange={(e) => setFormData(prev => ({ ...prev, contact_info: e.target.value }))}
              placeholder="Discord username, Steam profile, etc."
              className="w-full bg-gray-700/80 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 transition-all duration-300 backdrop-blur-sm placeholder-gray-400"
            />
          </div>

          {/* Additional Notes */}
          <div className="border border-orange-500/30 rounded-xl bg-gradient-to-r from-orange-500/5 to-red-500/5 p-6 shadow-lg hover:shadow-orange-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl animate-pulse">📝</span>
              <span className="text-lg font-bold bg-gradient-to-r from-orange-300 to-red-300 bg-clip-text text-transparent">Additional Notes</span>
              <span className="bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full text-xs font-medium border border-orange-500/30">optional</span>
            </div>
            <textarea value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Previous experience, goals, what you're looking for in a squad, etc."
              className="w-full bg-gray-700/80 border border-orange-500/30 rounded-xl px-4 py-3 text-white resize-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all duration-300 backdrop-blur-sm placeholder-gray-400"
              rows={4}
            />
          </div>

          <div className="flex gap-6 pt-8 border-t border-gradient-to-r from-cyan-500/20 to-purple-500/20">
            <button type="button" onClick={onCancel}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-500 hover:to-gray-600 transition-all duration-300 transform hover:scale-105 font-medium border border-gray-500/30 shadow-lg">
              Cancel
            </button>
            <button type="submit" disabled={formData.preferred_roles.length === 0}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-green-500 via-emerald-500 to-cyan-500 text-white rounded-xl hover:from-green-400 hover:via-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transition-all duration-300 transform hover:scale-105 font-bold shadow-lg shadow-green-500/30 border border-green-400/30 relative overflow-hidden group">
              <span className="relative flex items-center justify-center gap-2">
                🚀 {buttonText}
                <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-cyan-400/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
