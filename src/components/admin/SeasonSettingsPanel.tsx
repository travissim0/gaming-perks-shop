'use client';

import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  getLeagues,
  pickFeatured,
  getOpenSeason,
  getLatestSeason,
  getSeasonDraft,
  seasonPhase,
  type LeagueInfo,
  type LeagueSeason,
} from '@/lib/leagues';
import { inputCls, labelCls, btnPrimary, btnQuiet } from '@/components/ctf/FormBits';

type DateKey = 'registration_closes_on' | 'draft_on' | 'start_date' | 'playoffs_start_on' | 'end_date';

const FIELDS: { key: DateKey; label: string; hint: string; draftOnly?: boolean }[] = [
  { key: 'registration_closes_on', label: 'Registration closes', hint: 'Hero switches from "Register" to "Player pool" after this day.' },
  { key: 'draft_on', label: 'Draft day', hint: 'Shown as the next milestone while recruiting.', draftOnly: true },
  { key: 'start_date', label: 'Season starts', hint: 'Week 1 begins here; weeks are 7 days.' },
  { key: 'playoffs_start_on', label: 'Playoffs start', hint: 'Replaces the week counter with "Playoffs".' },
  { key: 'end_date', label: 'Season ends', hint: 'Informational.' },
];

/**
 * Staff panel: milestone dates for the featured league's open (or latest)
 * season plus the league's Discord invite. Both feed the /league hero.
 * Writes go through /api/league/season (service role).
 */
export default function SeasonSettingsPanel() {
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [season, setSeason] = useState<LeagueSeason | null>(null);
  const [dates, setDates] = useState<Record<DateKey, string>>({
    registration_closes_on: '', draft_on: '', start_date: '', playoffs_start_on: '', end_date: '',
  });
  const [discord, setDiscord] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'dates' | 'discord' | null>(null);
  // Draft leagues read "Recruiting" until the draft has run, same as the public strip.
  const [draftDone, setDraftDone] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const L = pickFeatured(await getLeagues());
        if (!L) return;
        setLeague(L);
        setDiscord(L.discord_url || '');
        const S = (await getOpenSeason(L)) || (await getLatestSeason(L));
        setSeason(S);
        if (S && L.format === 'draft') {
          const d = await getSeasonDraft(S.id).catch(() => null);
          setDraftDone(d?.status === 'complete');
        }
        if (S) {
          setDates({
            registration_closes_on: S.registration_closes_on || '',
            draft_on: S.draft_on || '',
            start_date: S.start_date || '',
            playoffs_start_on: S.playoffs_start_on || '',
            end_date: S.end_date || '',
          });
        }
      } catch (e) {
        console.error('SeasonSettingsPanel: load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const call = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not signed in');
    const res = await fetch('/api/league/season', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  };

  const saveDates = async () => {
    if (!league || !season) return;
    setSaving('dates');
    try {
      await call({ action: 'season_dates', league_slug: league.slug, season_id: season.id, ...dates });
      setSeason({ ...season, ...Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, v || null])) });
      toast.success('Season dates saved');
    } catch (e: any) {
      toast.error(e.message || 'Could not save dates');
    } finally {
      setSaving(null);
    }
  };

  const saveDiscord = async () => {
    if (!league) return;
    setSaving('discord');
    try {
      const json = await call({ action: 'league_discord', league_slug: league.slug, discord_url: discord });
      setLeague({ ...league, discord_url: json.discord_url });
      toast.success(json.discord_url ? 'Discord invite saved' : 'Discord invite cleared');
    } catch (e: any) {
      toast.error(e.message || 'Could not save Discord invite');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="rounded-xl bg-[#131A2B] px-5 py-4 text-sm text-[#8B98B0]">Loading season settings…</div>;
  if (!league) return null;

  const preview = season
    ? seasonPhase(
        league,
        { ...season, ...Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, v || null])) },
        season.status === 'active' ? 'active' : season.status === 'upcoming' ? 'upcoming' : 'off-season',
        { draftDone },
      )
    : null;
  const isDraft = league.format === 'draft';
  const next = preview?.milestones.find((m) => !m.past);

  return (
    <section className="rounded-xl bg-[#131A2B]">
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06]">
        <div>
          <h2 className="font-display text-lg text-[#E6EDF7]">
            Season dates{season ? ` · ${league.name} Season ${season.season_number}` : ` · ${league.name}`}
          </h2>
          <div className="text-xs text-[#8B98B0]">
            Drives the strip at the top of the league page. Leave anything blank that isn’t decided yet.
            {preview && (
              <>
                {' '}Right now it reads <span className="text-[#F59E0B]">{preview.label}</span>
                {next && <> · next: {next.label} {next.date}</>}.
              </>
            )}
          </div>
        </div>
        {season && (
          <button onClick={saveDates} disabled={saving !== null} className={btnPrimary}>
            {saving === 'dates' ? 'Saving…' : 'Save season dates'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {season ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {FIELDS.filter((f) => !f.draftOnly || isDraft).map((f) => (
              <label key={f.key} className="block">
                <span className={labelCls}>{f.label}</span>
                <input
                  type="date"
                  value={dates[f.key]}
                  onChange={(e) => setDates((d) => ({ ...d, [f.key]: e.target.value }))}
                  className={inputCls}
                  style={{ colorScheme: 'dark' }}
                />
                <span className="block text-[11px] text-[#8B98B0]/70 mt-1">{f.hint}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[#8B98B0]">No season found for {league.name}. Create the season first, then set its dates here.</div>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-white/[0.06] pt-4">
          <label className="block flex-1 min-w-[260px]">
            <span className={labelCls}>{league.name} Discord invite</span>
            <input
              type="url"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="https://discord.gg/…"
              className={inputCls}
            />
            <span className="block text-[11px] text-[#8B98B0]/70 mt-1">Shown as the “Join the Discord” button in the league page community box.</span>
          </label>
          <button onClick={saveDiscord} disabled={saving !== null} className={`${btnQuiet} mb-5 disabled:opacity-50`}>
            {saving === 'discord' ? 'Saving…' : 'Save invite'}
          </button>
        </div>
      </div>
    </section>
  );
}
