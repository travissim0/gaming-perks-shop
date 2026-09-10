'use client';

import { useState, useEffect, type ReactNode } from 'react';
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
  /** Staff-only flag; only sent when the form shows the captain question. */
  willing_to_captain?: boolean;
}

interface FreeAgentJoinFormProps {
  onSubmit: (data: FreeAgentFormData) => void;
  onCancel: () => void;
  initialData?: Partial<FreeAgentFormData>;
  submitLabel?: string;
  /** Render in the page flow (registration page) instead of a modal overlay. */
  inline?: boolean;
  /** Show the "interested in captaining" question (answer is staff-only). */
  showCaptainInterest?: boolean;
  /** Optional header content rendered above the sections (league/season context). */
  header?: ReactNode;
  submitting?: boolean;
  /**
   * The player's linked Discord account (from their profile). When present the
   * Discord field is filled in and read-only; when null a Connect button is
   * offered next to the plain text field.
   */
  discord?: { username: string; nick: string | null; inGuild: boolean } | null;
  /** Starts the Discord link flow (returns to the registration page). */
  onConnectDiscord?: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SELECTED_CLASS: Record<string, string> = {
  'O INF': 'bg-red-600 border-red-500 text-white',
  'D INF': 'bg-red-600 border-red-500 text-white',
  'O HVY': 'bg-blue-600 border-blue-500 text-white',
  'D HVY': 'bg-blue-600 border-blue-500 text-white',
  'Medic': 'bg-yellow-600 border-yellow-500 text-white',
  'SL': 'bg-green-600 border-green-500 text-white',
  'Foot JT': 'bg-gray-300 border-gray-200 text-black',
  'D Foot JT': 'bg-gray-300 border-gray-200 text-black',
  'Pack JT': 'bg-gray-300 border-gray-200 text-black',
  'Engineer': 'bg-amber-700 border-amber-600 text-white',
  'Infil': 'bg-purple-600 border-purple-500 text-white',
  '10-man Infil': 'bg-purple-600 border-purple-500 text-white',
};
const UNSELECTED_CLASS = 'bg-[#1B2438] border-white/5 text-[#E6EDF7] hover:border-[#22D3EE]/60';

export default function FreeAgentJoinForm({
  onSubmit,
  onCancel,
  initialData,
  submitLabel,
  inline = false,
  showCaptainInterest = false,
  header,
  submitting = false,
  discord = null,
  onConnectDiscord,
}: FreeAgentJoinFormProps) {
  const isEditMode = !!initialData;
  const buttonText = submitLabel || (isEditMode ? 'Save changes' : 'Register');

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
    willing_to_captain: false,
  });

  const [userTimezone, setUserTimezone] = useState('America/New_York');
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
        willing_to_captain: !!initialData.willing_to_captain,
      });
      if (initialData.timezone) setUserTimezone(initialData.timezone);
      // If every saved day shares one window, keep "same time every day" on with that window.
      const times = Object.values(initialData.availability_times || {});
      if (times.length > 0) {
        const first = times[0];
        const allSame = times.every((t) => t.start === first.start && t.end === first.end);
        setSyncTimes(allSame);
        if (allSame) setMasterTime({ start: first.start, end: first.end });
      }
    }
  }, [initialData]);

  const timeSlots = (() => {
    const slots: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  })();

  const fmt12 = (time: string) =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
      new Date(`2000-01-01T${time}:00`),
    );

  const formatTimeForDisplay = (time: string) => {
    if (!time) return '';
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateTime = new Date(`${today}T${time}:00`);
      const est = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }).format(dateTime);
      if (userTimezone !== 'America/New_York') {
        const local = new Intl.DateTimeFormat('en-US', { timeZone: userTimezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(dateTime);
        return `${est} EST (${local} your time)`;
      }
      return `${est} EST`;
    } catch {
      return `${time} EST`;
    }
  };

  const handleRoleToggle = (role: string, type: 'preferred' | 'secondary' | 'try') => {
    const key = type === 'preferred' ? 'preferred_roles' : type === 'secondary' ? 'secondary_roles' : 'classes_to_try';
    setFormData((prev) => ({
      ...prev,
      [key]: prev[key].includes(role) ? prev[key].filter((r) => r !== role) : [...prev[key], role],
    }));
  };

  const handleDayToggle = (day: string) => {
    setFormData((prev) => {
      if (prev.availability_days.includes(day)) {
        const newTimes = { ...prev.availability_times };
        delete newTimes[day];
        return { ...prev, availability_days: prev.availability_days.filter((d) => d !== day), availability_times: newTimes };
      }
      const timeToUse = syncTimes ? masterTime : { start: '18:00', end: '22:00' };
      return {
        ...prev,
        availability_days: [...prev.availability_days, day],
        availability_times: { ...prev.availability_times, [day]: timeToUse },
      };
    });
  };

  const handleTimeChange = (day: string, type: 'start' | 'end', value: string) => {
    setFormData((prev) => ({
      ...prev,
      availability_times: { ...prev.availability_times, [day]: { ...prev.availability_times[day], [type]: value } },
    }));
  };

  const handleMasterTimeChange = (type: 'start' | 'end', value: string) => {
    const newMasterTime = { ...masterTime, [type]: value };
    setMasterTime(newMasterTime);
    setFormData((prev) => {
      const newTimes = { ...prev.availability_times };
      prev.availability_days.forEach((day) => { newTimes[day] = { ...newMasterTime }; });
      return { ...prev, availability_times: newTimes };
    });
  };

  const toggleSync = () => {
    const next = !syncTimes;
    setSyncTimes(next);
    if (next) {
      setFormData((prev) => {
        const newTimes = { ...prev.availability_times };
        prev.availability_days.forEach((day) => { newTimes[day] = { ...masterTime }; });
        return { ...prev, availability_times: newTimes };
      });
    }
  };

  const handleRatingChange = (role: string, rating: number) => {
    setFormData((prev) => ({ ...prev, class_ratings: { ...prev.class_ratings, [role]: rating } }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.preferred_roles.length === 0) {
      toast.error('Pick at least one preferred class');
      return;
    }
    if (formData.availability_days.length === 0) {
      toast.error('Pick at least one day you can play');
      return;
    }

    const availabilityString = DAYS.filter((d) => formData.availability_days.includes(d))
      .map((day) => {
        const times = formData.availability_times[day];
        return times ? `${day}: ${times.start}-${times.end}` : day;
      })
      .join(', ');

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
      ...(showCaptainInterest ? { willing_to_captain: formData.willing_to_captain } : {}),
    });
  };

  const classTile = (role: { key: string; label: string; tag: string }, extraClass = '') => {
    const selected = formData.preferred_roles.includes(role.key);
    return (
      <button
        key={role.key}
        type="button"
        onClick={() => handleRoleToggle(role.key, 'preferred')}
        aria-pressed={selected}
        className={`rounded-lg border px-2 py-2 text-left transition-colors ${selected ? SELECTED_CLASS[role.key] || 'bg-cyan-600 border-cyan-500 text-white' : UNSELECTED_CLASS} ${extraClass}`}
      >
        <div className="text-sm font-semibold leading-tight">{role.label}</div>
        <div className={`text-[10px] uppercase tracking-wide ${selected ? 'opacity-80' : 'text-[#8B98B0]'}`}>{role.tag}</div>
      </button>
    );
  };

  const chip = (role: string, list: 'secondary' | 'try') => {
    const arr = list === 'secondary' ? formData.secondary_roles : formData.classes_to_try;
    const selected = arr.includes(role);
    return (
      <button
        key={role}
        type="button"
        onClick={() => handleRoleToggle(role, list)}
        aria-pressed={selected}
        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${selected ? SELECTED_CLASS[role] || 'bg-cyan-600 border-cyan-500 text-white' : UNSELECTED_CLASS}`}
      >
        {role}
      </button>
    );
  };

  const ratedClasses = [...formData.preferred_roles, ...formData.secondary_roles].filter((r, i, a) => a.indexOf(r) === i);
  const selectedDays = DAYS.filter((d) => formData.availability_days.includes(d));

  const sectionHead = (num: string, title: string, hint?: string, required?: boolean) => (
    <div className="flex items-baseline gap-3 border-b border-white/[0.06] px-5 py-3">
      <span className="font-display text-lg text-[#22D3EE]">{num}</span>
      <h3 className="font-display text-lg text-[#E6EDF7]">{title}</h3>
      {required && <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]">Required</span>}
      {hint && <span className="ml-auto text-xs text-[#8B98B0]">{hint}</span>}
    </div>
  );

  const selectCls = 'rounded-md border border-white/10 bg-[#0B0F1A] px-2 py-1.5 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none';

  const form = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {header}

      {/* 01 — Classes */}
      <div className="rounded-xl bg-[#131A2B]">
        {sectionHead('01', 'Classes', 'Tap to select', true)}
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Preferred — what you want to play</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {ROLE_GROUPS.map((group) => (
                <div key={group.name} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#E6EDF7]/80">{group.name}</div>
                  <div className={`grid gap-1.5 ${group.roles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {group.roles.map((role) => classTile(role))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Secondary — can play if needed</div>
              <div className="flex flex-wrap gap-1.5">{CLASS_OPTIONS.map((r) => chip(r, 'secondary'))}</div>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Want to learn this season</div>
              <div className="flex flex-wrap gap-1.5">{CLASS_OPTIONS.map((r) => chip(r, 'try'))}</div>
            </div>
          </div>

          {ratedClasses.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Rate yourself (1 = learning, 5 = elite)</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ratedClasses.map((role) => (
                  <div key={role} className="flex items-center justify-between rounded-lg bg-[#1B2438] px-3 py-2">
                    <span className="text-sm font-medium text-[#E6EDF7]">{role}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((rating) => {
                        const on = (formData.class_ratings[role] || 0) >= rating;
                        return (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => handleRatingChange(role, rating)}
                            aria-label={`${role} rating ${rating}`}
                            className={`h-6 w-6 rounded text-xs font-bold transition-colors ${on ? 'bg-[#F59E0B] text-[#0B0F1A]' : 'bg-[#0B0F1A] text-[#8B98B0] hover:text-[#F59E0B]'}`}
                          >
                            {rating}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 02 — Availability */}
      <div className="rounded-xl bg-[#131A2B]">
        {sectionHead('02', 'Availability', 'Times are saved in Eastern (EST)', true)}
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[#E6EDF7]">
              <span className="text-[#8B98B0]">Your timezone</span>
              <select value={userTimezone} onChange={(e) => setUserTimezone(e.target.value)} className={selectCls}>
                {TIMEZONE_OPTIONS.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </label>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-[#E6EDF7]">
              <input type="checkbox" checked={syncTimes} onChange={toggleSync} className="text-[#22D3EE]" />
              Same time every day
            </label>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((day) => {
              const on = formData.availability_days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  aria-pressed={on}
                  className={`rounded-lg border py-2 text-xs font-semibold transition-colors ${on ? 'border-[#34D399] bg-[#34D399]/15 text-[#34D399]' : UNSELECTED_CLASS}`}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>

          {syncTimes ? (
            selectedDays.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[#8B98B0]">From</span>
                <select value={masterTime.start} onChange={(e) => handleMasterTimeChange('start', e.target.value)} className={selectCls}>
                  {timeSlots.map((t) => <option key={t} value={t}>{formatTimeForDisplay(t)}</option>)}
                </select>
                <span className="text-[#8B98B0]">to</span>
                <select value={masterTime.end} onChange={(e) => handleMasterTimeChange('end', e.target.value)} className={selectCls}>
                  {timeSlots.map((t) => <option key={t} value={t}>{formatTimeForDisplay(t)}</option>)}
                </select>
              </div>
            )
          ) : (
            <div className="space-y-2">
              {selectedDays.map((day) => (
                <div key={day} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-10 font-semibold text-[#34D399]">{day.slice(0, 3)}</span>
                  <select value={formData.availability_times[day]?.start || '18:00'} onChange={(e) => handleTimeChange(day, 'start', e.target.value)} className={selectCls}>
                    {timeSlots.map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                  </select>
                  <span className="text-[#8B98B0]">to</span>
                  <select value={formData.availability_times[day]?.end || '22:00'} onChange={(e) => handleTimeChange(day, 'end', e.target.value)} className={selectCls}>
                    {timeSlots.map((t) => <option key={t} value={t}>{fmt12(t)}</option>)}
                  </select>
                  <span className="text-xs text-[#8B98B0]">EST</span>
                </div>
              ))}
            </div>
          )}
          {selectedDays.length === 0 && <p className="text-xs text-[#8B98B0]">Pick the days you can usually play, then set a time window.</p>}
        </div>
      </div>

      {/* 03 — Contact & notes */}
      <div className="rounded-xl bg-[#131A2B]">
        {sectionHead('03', 'Contact & notes', 'Optional')}
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {discord ? (
            <div className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Discord</span>
              <div className="flex items-center gap-2 rounded-md bg-[#0B0F1A] px-3 py-2 text-sm">
                <span className="text-[#E6EDF7]">@{discord.username}</span>
                {discord.inGuild ? (
                  <span className="text-xs text-[#8B98B0]">in the CTFPL server{discord.nick ? ` as ${discord.nick}` : ''}</span>
                ) : (
                  <span className="text-xs text-[#F59E0B]">not in the CTFPL server yet</span>
                )}
                <span className="ml-auto rounded bg-[#5865F2]/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#5865F2]">Linked</span>
              </div>
              <span className="mt-1 block text-xs text-[#8B98B0]">Taken from your connected Discord account. Captains reach you here, and the CTFPL server sets up your squad’s channels automatically.</span>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Discord username</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.contact_info}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contact_info: e.target.value }))}
                  placeholder="e.g. soup"
                  className="w-full rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none"
                />
                {onConnectDiscord && (
                  <button type="button" onClick={onConnectDiscord} className="shrink-0 rounded-md bg-[#5865F2] px-3 py-2 text-sm font-medium text-white hover:bg-[#6B76F5]">
                    Connect Discord
                  </button>
                )}
              </div>
              <span className="mt-1 block text-xs text-[#8B98B0]">
                Connect Discord so captains can reach you and the CTFPL server gives you your squad’s channels automatically. Or type your username; leave blank to use site messages only.
              </span>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#8B98B0]">Notes for captains</span>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Experience, past squads, what you're looking for…"
              rows={3}
              className="w-full resize-none rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* 04 — Captain interest (staff-only answer) */}
      {showCaptainInterest && (
        <div className="rounded-xl bg-[#131A2B]">
          {sectionHead('04', 'Captaining', 'Only league staff see this')}
          <label className="flex cursor-pointer items-start gap-3 p-5">
            <input
              type="checkbox"
              checked={formData.willing_to_captain}
              onChange={(e) => setFormData((prev) => ({ ...prev, willing_to_captain: e.target.checked }))}
              className="mt-0.5 text-[#F59E0B]"
            />
            <span>
              <span className="block text-sm font-medium text-[#E6EDF7]">I'm interested in being a captain this season</span>
              <span className="block text-xs text-[#8B98B0]">Staff pick captains from the people who tick this. Other players and captains can't see your answer.</span>
            </span>
          </label>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2.5 text-sm font-medium text-[#E6EDF7] bg-white/5 hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || formData.preferred_roles.length === 0}
          className="rounded-md bg-[#22D3EE] px-5 py-2.5 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving…' : buttonText}
        </button>
      </div>
    </form>
  );

  if (inline) return form;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="ctf-theme w-full max-w-4xl rounded-2xl bg-[#0B0F1A] p-6 shadow-2xl">
        {form}
      </div>
    </div>
  );
}
