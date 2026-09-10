'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import FreeAgentJoinForm, { type FreeAgentFormData } from '@/components/FreeAgentJoinForm';
import { DISCORD_COLS, startDiscordLink } from '@/components/ctf/DiscordLinkCard';
import {
  getLeagues,
  pickFeatured,
  getOpenSeason,
  seasonLabel,
  poolBlurb,
  leagueRulesHref,
  type LeagueInfo,
  type LeagueSeason,
} from '@/lib/leagues';

/**
 * League registration = joining the free-agent pool for the featured league's
 * open season, with the same questions the pool always asked plus a
 * staff-only "interested in captaining" box. Submitting forwards to the pool.
 */
export default function LeagueRegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [season, setSeason] = useState<LeagueSeason | null>(null);
  const [loadingLeague, setLoadingLeague] = useState(true);

  const [banned, setBanned] = useState(false);
  const [existing, setExisting] = useState<Partial<FreeAgentFormData> | null>(null);
  const [discord, setDiscord] = useState<{ username: string; nick: string | null; inGuild: boolean } | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const leagues = await getLeagues();
        const featured = pickFeatured(leagues);
        if (cancelled) return;
        setLeague(featured);
        if (featured) {
          const open = await getOpenSeason(featured);
          if (!cancelled) setSeason(open);
        }
      } catch (e) {
        console.error('register: failed to load league', e);
      } finally {
        if (!cancelled) setLoadingLeague(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Signed in → load ban flag + any existing registration to pre-fill.
  useEffect(() => {
    if (!user) { setExisting(null); return; }
    let cancelled = false;
    (async () => {
      setLoadingMine(true);
      try {
        const [{ data: profile }, { data: { session } }] = await Promise.all([
          supabase.from('profiles').select('is_league_banned').eq('id', user.id).maybeSingle(),
          supabase.auth.getSession(),
        ]);
        if (cancelled) return;
        setBanned(!!profile?.is_league_banned);

        // Linked Discord (columns arrive with add-discord-link.sql; ignore if missing).
        const { data: dc } = await supabase.from('profiles').select(DISCORD_COLS).eq('id', user.id).maybeSingle();
        if (!cancelled && dc && (dc as any).discord_id) {
          const d = dc as any;
          setDiscord({ username: d.discord_username, nick: d.discord_guild_nick ?? null, inGuild: !!d.discord_in_guild });
        }

        if (session) {
          const res = await fetch('/api/league/register', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const json = await res.json();
            if (cancelled) return;
            const r = json.registration;
            if (r) {
              setExisting({
                preferred_roles: r.preferred_roles || [],
                secondary_roles: r.secondary_roles || [],
                availability: r.availability || '',
                availability_days: r.availability_days || [],
                availability_times: r.availability_times || {},
                skill_level: r.skill_level || 'intermediate',
                class_ratings: r.class_ratings || {},
                classes_to_try: r.classes_to_try || [],
                notes: r.notes || '',
                contact_info: r.contact_info || '',
                timezone: r.timezone || 'America/New_York',
                willing_to_captain: !!json.willing_to_captain,
              });
            }
          }
        }
      } catch (e) {
        console.error('register: failed to load your registration', e);
      } finally {
        if (!cancelled) setLoadingMine(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleSubmit = async (data: FreeAgentFormData) => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Your session expired. Please sign in again.');
        return;
      }
      const res = await fetch('/api/league/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Registration failed');
      toast.success(json.mode === 'updated' ? 'Registration updated' : `You're registered for ${json.league?.name || 'the league'}`);
      router.push(`/free-agents?${json.mode === 'updated' ? 'updated' : 'registered'}=1`);
    } catch (e: any) {
      console.error('register: submit failed', e);
      toast.error(e.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const title = league ? seasonLabel(league, season) : 'League registration';
  const isEdit = !!existing;

  const shell = (children: React.ReactNode) => (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );

  if (loadingLeague || authLoading || loadingMine) {
    return shell(
      <div className="py-16 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-[#22D3EE]" />
        <p className="text-[#8B98B0]">Loading registration…</p>
      </div>,
    );
  }

  // No league or no open season → closed.
  if (!league || !season) {
    return shell(
      <div className="rounded-xl bg-[#131A2B] p-8 text-center">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">Registration</div>
        <h1 className="font-display text-4xl text-[#E6EDF7]">No season open right now</h1>
        <p className="mx-auto mt-3 max-w-md text-[#8B98B0]">
          {league ? `${league.name} isn't taking registrations at the moment.` : 'No league is set up for registration.'} Check back when the next season is announced.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/league" className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Back to CTF</Link>
          <Link href="/free-agents" className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Free agent pool</Link>
        </div>
      </div>,
    );
  }

  const contextHeader = (
    <div className="rounded-xl bg-[#131A2B] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-[#8B98B0]">{isEdit ? 'Your registration' : 'Register'}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${season.status === 'active' ? 'bg-[#34D399]/15 text-[#34D399]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'}`}>
              {season.status === 'active' ? 'Season live' : 'Registration open'}
            </span>
          </div>
          <h1 className="font-display text-3xl leading-none text-[#E6EDF7] md:text-4xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-[#8B98B0]">
            {poolBlurb(league)} Fill this out once and you're in the pool; you can come back and edit it any time.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={leagueRulesHref(league)} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Rules</Link>
          <Link href="/free-agents" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">View pool</Link>
        </div>
      </div>
    </div>
  );

  if (!user) {
    return shell(
      <div className="space-y-4">
        {contextHeader}
        <div className="rounded-xl bg-[#131A2B] p-8 text-center">
          <h2 className="font-display text-2xl text-[#E6EDF7]">Sign in to register</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#8B98B0]">
            Registration is tied to your Free Infantry account so captains can find you and staff can build teams.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/auth/login?redirect=/league/register" className="rounded-md bg-[#22D3EE] px-4 py-2 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Sign in</Link>
            <Link href="/auth/register" className="rounded-md bg-white/5 px-4 py-2 text-sm text-[#E6EDF7] hover:bg-white/10">Create account</Link>
          </div>
        </div>
      </div>,
    );
  }

  if (banned) {
    return shell(
      <div className="space-y-4">
        {contextHeader}
        <div className="rounded-xl bg-[#131A2B] p-8 text-center">
          <h2 className="font-display text-2xl text-[#F87171]">You can't register right now</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#8B98B0]">
            Your account is currently banned from CTF leagues. Contact league staff if you think this is a mistake.
          </p>
        </div>
      </div>,
    );
  }

  return shell(
    <FreeAgentJoinForm
      inline
      showCaptainInterest
      header={contextHeader}
      initialData={existing ? { ...existing, contact_info: discord ? discord.username : existing.contact_info } : discord ? { contact_info: discord.username } : undefined}
      discord={discord}
      onConnectDiscord={() => startDiscordLink('/league/register')}
      submitLabel={isEdit ? 'Save changes' : `Register for ${league.name}`}
      submitting={submitting}
      onSubmit={(data) => handleSubmit(discord ? { ...data, contact_info: discord.username } : data)}
      onCancel={() => router.push('/free-agents')}
    />,
  );
}
