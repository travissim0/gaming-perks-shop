'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import DiscordLinkCard from '@/components/ctf/DiscordLinkCard';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import AvatarSelector from '@/components/AvatarSelector';
import { getDefaultAvatarUrl } from '@/utils/supabaseHelpers';
import { getClassColorStyle } from '@/utils/classColors';
import type { EloTier } from '@/utils/eloTiers';

// ---------- Types ----------

interface Squad {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  is_legacy: boolean;
  is_active?: boolean;
}

interface SquadMember {
  squads: Squad;
}

interface RecordedGamePlayer {
  player_name: string;
  main_class: string;
  side: string;
  team: string;
  kills: number;
  deaths: number;
  flag_captures?: number;
  carrier_kills?: number;
  result: string;
}

interface RecordedGame {
  gameId: string;
  gameDate: string;
  gameMode: string;
  mapName: string;
  duration: number;
  totalPlayers: number;
  players: RecordedGamePlayer[];
  videoInfo: {
    has_video: boolean;
    youtube_url?: string;
    vod_url?: string;
    video_title?: string;
    thumbnail_url?: string;
  };
  winningInfo?: {
    type: string;
    side: string;
    winner: string;
  };
  userStats?: {
    kills: number;
    deaths: number;
    captures: number;
    carrier_kills: number;
    team: string;
    class: string;
    result: string;
    side: string;
  };
}

interface ProfileApiResponse {
  profile: {
    id: string;
    in_game_alias: string | null;
    avatar_url: string | null;
    created_at: string;
    is_league_banned: boolean;
    ctf_role: string | null;
  } | null;
  aliases: string[];
  squad: {
    id: string;
    name: string;
    tag: string;
    banner_url: string | null;
    role: string;
  } | null;
  freeAgent: {
    preferred_roles: string[];
    skill_level: string;
    availability: string | null;
  } | null;
  elo: {
    weighted_elo: number;
    elo_rating: number;
    elo_peak: number;
    elo_confidence: number;
    total_games: number;
    win_rate: number;
    kill_death_ratio: number;
    tier: EloTier;
  } | null;
  isRegistered: boolean;
}

// ---------- Component ----------

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Profile form state
  const [inGameAlias, setInGameAlias] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Hero data state
  const [heroData, setHeroData] = useState<ProfileApiResponse | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);

  // Squad state (read-only display)
  const [userSquad, setUserSquad] = useState<Squad[]>([]);

  // Avatar panel (upload + presets) lives inside the Account card, opened from the header avatar
  const [showAvatarPanel, setShowAvatarPanel] = useState(false);

  // This season: the running league's open season and my registration (from /api/league/register)
  const [seasonCtx, setSeasonCtx] = useState<{
    league: { slug: string; name: string; format: string | null } | null;
    season: { season_number: number; season_name: string | null; status: string } | null;
    registration: { preferred_roles?: string[] } | null;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setSeasonCtx({ league: null, season: null, registration: null }); return; }
        const res = await fetch('/api/league/register', { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setSeasonCtx({ league: json?.league || null, season: json?.season || null, registration: json?.registration || null });
      } catch {
        if (!cancelled) setSeasonCtx({ league: null, season: null, registration: null });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Games state
  const [userGames, setUserGames] = useState<RecordedGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  const [videoModal, setVideoModal] = useState<{ isOpen: boolean; game: RecordedGame | null }>({
    isOpen: false,
    game: null
  });

  // ---------- Auth guard ----------

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  // ---------- Data fetching ----------

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) throw error;

          if (data) {
            setInGameAlias(data.in_game_alias || '');
            setAvatarUrl(data.avatar_url || null);
          }

          // Fetch aliases
          const { data: aliasData, error: aliasErr } = await supabase
            .from('profile_aliases')
            .select('alias')
            .eq('profile_id', user.id);

          if (aliasErr) {
            toast.error('Error loading aliases: ' + aliasErr.message);
            setAliases([]);
          } else {
            setAliases(aliasData?.map(a => a.alias) || []);
          }

          setEmail(user.email || '');

          await loadUserSquad();
          await loadUserGames();

          if (!data.avatar_url) {
            setAvatarUrl(getDefaultAvatarUrl());
          }
        } catch (error: any) {
          toast.error('Error loading profile: ' + error.message);
        } finally {
          setProfileLoading(false);
        }
      }
    };

    fetchProfile();
  }, [user]);

  // Fetch hero data (ELO, free agent, etc.) once alias is available
  useEffect(() => {
    const fetchHeroData = async () => {
      if (!inGameAlias || profileLoading) return;
      try {
        setHeroLoading(true);
        const response = await fetch(
          `/api/player-stats/player/${encodeURIComponent(inGameAlias)}/profile`
        );
        if (response.ok) {
          const data: ProfileApiResponse = await response.json();
          setHeroData(data);
        }
      } catch (err) {
        console.error('Failed to fetch hero data:', err);
      } finally {
        setHeroLoading(false);
      }
    };
    fetchHeroData();
  }, [inGameAlias, profileLoading]);

  // ---------- Squad loading ----------

  const loadUserSquad = async () => {
    if (!user) return;

    try {
      // Current squad = active membership in a squad that is itself active and not legacy.
      const { data: activeSquads } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id, name, tag, description, is_legacy, is_active
          )
        `)
        .eq('player_id', user.id)
        .eq('status', 'active')
        .eq('squads.is_legacy', false)
        .eq('squads.is_active', true)
        .limit(1) as { data: SquadMember[] | null; error: any };

      // Past squads = legacy, or archived (inactive) from an earlier season.
      const { data: pastSquads } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id, name, tag, description, is_legacy, is_active
          )
        `)
        .eq('player_id', user.id)
        .or('is_legacy.eq.true,is_active.eq.false', { referencedTable: 'squads' })
        .limit(3) as { data: SquadMember[] | null; error: any };

      const squadsProfile: Squad[] = [];
      if (activeSquads?.length && activeSquads[0].squads) {
        squadsProfile.push(activeSquads[0].squads);
      }
      (pastSquads || []).forEach((m) => {
        if (m.squads && !squadsProfile.some((s) => s.id === m.squads.id)) squadsProfile.push(m.squads);
      });
      setUserSquad(squadsProfile);
    } catch (error) {
      console.error('Error loading user squad:', error);
    }
  };

  // ---------- Games loading ----------

  const loadUserGames = async () => {
    if (!user) return;

    setGamesLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch('/api/player-stats/user-games?limit=20', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.games) {
          setUserGames(data.games);
        }
      }
    } catch (error) {
      console.error('Error loading user games:', error);
    } finally {
      setGamesLoading(false);
    }
  };

  // ---------- Alias handling ----------

  const handleAliasInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === ' ' || e.key === 'Enter') && aliasInput.trim()) {
      e.preventDefault();
      if (!aliases.includes(aliasInput.trim())) {
        setAliases([...aliases, aliasInput.trim()]);
      }
      setAliasInput('');
    }
  };

  const removeAlias = (alias: string) => {
    setAliases(aliases.filter(a => a !== alias));
  };

  const validateAlias = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Display Name / Main Alias cannot be blank or empty.';
    if (!/\S/.test(trimmed)) return 'Display Name / Main Alias must contain at least one valid character.';
    return null;
  };

  const handleAliasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInGameAlias(e.target.value);
    if (aliasError) setAliasError(null);
  };

  const handleAliasBlur = () => {
    setAliasError(validateAlias(inGameAlias));
  };

  // ---------- Profile update ----------

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const aliasValidationError = validateAlias(inGameAlias);
    if (aliasValidationError) {
      toast.error(aliasValidationError);
      setAliasError(aliasValidationError);
      return;
    }

    setUpdateLoading(true);

    try {
      let newAvatarUrl = avatarUrl;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in again to update your profile');
        return;
      }

      // Upload avatar file if one was selected
      if (avatarFile) {
        try {
          const fileExt = avatarFile.name.split('.').pop();
          const fileName = `${user.id}-${Date.now()}.${fileExt}`;
          const filePath = `user-uploads/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, avatarFile, { upsert: true });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

          newAvatarUrl = publicUrl;
        } catch (uploadError: any) {
          if (uploadError.message?.includes('Bucket not found')) {
            toast.error('Avatar storage not set up yet. Please contact support.');
            return;
          }
          throw uploadError;
        }
      }

      // Update aliases
      await supabase.from('profile_aliases').delete().eq('profile_id', user.id);

      let allAliases = [...aliases];
      if (
        inGameAlias.trim() &&
        !allAliases.some(a => a.trim().toLowerCase() === inGameAlias.trim().toLowerCase())
      ) {
        allAliases.unshift(inGameAlias.trim());
      }
      allAliases = Array.from(new Set(allAliases.map(a => a.trim())));

      const aliasRows = allAliases.map(alias => ({
        profile_id: user.id,
        alias,
        is_primary: alias.toLowerCase() === inGameAlias.trim().toLowerCase(),
        added_by: 'system'
      }));
      await supabase.from('profile_aliases').insert(aliasRows);

      // Update profile
      const { error } = await supabase
        .from('profiles')
        .update({
          in_game_alias: inGameAlias,
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      // Update email if changed
      if (email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) throw emailError;
        toast.success('Profile updated! Please check your new email for a confirmation link.');
      } else {
        toast.success('Profile updated successfully!');
      }

      setAvatarFile(null);
      setUploadProgress(0);
    } catch (error: any) {
      toast.error('Error updating profile: ' + error.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  // ---------- File handling ----------

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
      const maxSize = 2 * 1024 * 1024;

      if (!validTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload a JPEG, PNG, or GIF image.');
        return;
      }
      if (file.size > maxSize) {
        toast.error('File is too large. Maximum size is 2MB.');
        return;
      }

      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setAvatarUrl(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // ---------- Game helpers ----------

  const formatGameDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatGameDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getYouTubeVideoId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : null;
  };

  // ---------- Loading / auth states ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4" />
          <p className="text-cyan-400 font-mono">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="ctf-theme min-h-screen">
      <Navbar user={user} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div>

          {/* ===== Header: identity at a glance ===== */}
          <div className="mb-4 rounded-xl bg-[#131A2B] p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setShowAvatarPanel((v) => !v)}
                className="group relative h-16 w-16 flex-none overflow-hidden rounded-xl bg-[#1B2438]"
                title="Change avatar"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-display text-2xl text-[#22D3EE]">{inGameAlias ? inGameAlias.charAt(0).toUpperCase() : '?'}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[#E6EDF7] opacity-0 transition-opacity group-hover:opacity-100">Change</span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl leading-none text-[#E6EDF7] md:text-3xl">{inGameAlias || 'Player'}</h1>
                  {heroData?.elo && (
                    <span className="rounded bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F59E0B]" title={`Peak ${Math.round(heroData.elo.elo_peak)}`}>
                      {heroData.elo.tier?.name || 'Rated'} · {Math.round(heroData.elo.weighted_elo)}
                    </span>
                  )}
                  {seasonCtx?.registration && seasonCtx.league && seasonCtx.season && (
                    <span className="rounded bg-[#34D399]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#34D399]">Registered · {seasonCtx.league.name} S{seasonCtx.season.season_number}</span>
                  )}
                  {heroData?.profile?.ctf_role && (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8B98B0]">{heroData.profile.ctf_role.replace('ctf_', 'CTF ')}</span>
                  )}
                  {heroData?.profile?.is_league_banned && (
                    <span className="rounded bg-[#F87171]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F87171]">League ban</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[#8B98B0]">
                  {heroData?.profile?.created_at && <span>Member since {new Date(heroData.profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>}
                  {(seasonCtx?.registration?.preferred_roles?.length || heroData?.freeAgent?.preferred_roles?.length) ? (
                    <span>Plays <span className="text-[#E6EDF7]">{(seasonCtx?.registration?.preferred_roles || heroData?.freeAgent?.preferred_roles || []).join(', ')}</span></span>
                  ) : null}
                  {userGames[0]?.gameDate && <span>Last recorded game {new Date(userGames[0].gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
                </div>
              </div>
              {inGameAlias && (
                <Link href={`/stats/player/${encodeURIComponent(inGameAlias)}`} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">
                  Public profile
                </Link>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            {/* ===== Left: account + recorded games ===== */}
            <div className="space-y-4">
              <form onSubmit={handleUpdateProfile} className="rounded-xl bg-[#131A2B] p-4 md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Account</h2>
                  <button
                    type="submit"
                    disabled={updateLoading || profileLoading}
                    className="rounded-md bg-[#22D3EE] px-3 py-1.5 text-sm font-semibold text-[#0B0F1A] hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updateLoading ? 'Saving…' : 'Save changes'}
                  </button>
                </div>

                {profileLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-9 rounded bg-[#1B2438]" />
                    <div className="h-9 rounded bg-[#1B2438]" />
                    <div className="h-9 w-2/3 rounded bg-[#1B2438]" />
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">In-game alias (display name)</span>
                      <input
                        id="inGameAlias"
                        type="text"
                        value={inGameAlias}
                        onChange={handleAliasChange}
                        onBlur={handleAliasBlur}
                        required
                        className={`w-full rounded-md border bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] focus:outline-none ${aliasError ? 'border-[#F87171]' : 'border-white/10 focus:border-[#22D3EE]'}`}
                        placeholder="Your alias"
                      />
                      {aliasError && <span className="mt-1 block text-xs text-[#F87171]">{aliasError}</span>}
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">Email</span>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full rounded-md border border-white/10 bg-[#0B0F1A] px-3 py-2 text-sm text-[#E6EDF7] focus:border-[#22D3EE] focus:outline-none"
                      />
                      <span className="mt-1 block text-xs text-[#8B98B0]">Changing it sends a confirmation link to the new address.</span>
                    </label>
                    <div className="md:col-span-2">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">Also known as</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {aliases
                          .filter((alias) => alias.trim().toLowerCase() !== inGameAlias.trim().toLowerCase())
                          .map((alias) => (
                            <span key={alias} className="inline-flex items-center gap-1 rounded-md bg-[#1B2438] px-2 py-1 text-xs text-[#E6EDF7]">
                              {alias}
                              <button type="button" onClick={() => removeAlias(alias)} className="text-[#8B98B0] hover:text-[#F87171]" aria-label={`Remove ${alias}`}>✕</button>
                            </span>
                          ))}
                        <input
                          type="text"
                          value={aliasInput}
                          onChange={(e) => setAliasInput(e.target.value)}
                          onKeyDown={handleAliasInput}
                          className="min-w-[10rem] rounded-md border border-dashed border-white/15 bg-transparent px-2 py-1 text-xs text-[#E6EDF7] placeholder-[#8B98B0]/70 focus:border-[#22D3EE] focus:outline-none"
                          placeholder="Add an old alias, press Enter"
                        />
                      </div>
                      <span className="mt-1 block text-xs text-[#8B98B0]">Old names you've played under, so your stats link up. Your main alias is included automatically.</span>
                    </div>

                    {showAvatarPanel && (
                      <div className="md:col-span-2 rounded-lg bg-[#0B0F1A] p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-[#8B98B0]">Avatar</span>
                          <div className="flex items-center gap-2">
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="avatar-upload" />
                            <label htmlFor="avatar-upload" className="cursor-pointer rounded-md bg-white/5 px-2.5 py-1 text-xs text-[#E6EDF7] hover:bg-white/10">Upload image</label>
                            {avatarFile && <span className="text-xs text-[#22D3EE]">{avatarFile.name}</span>}
                            <button type="button" onClick={() => setShowAvatarPanel(false)} className="text-xs text-[#8B98B0] hover:text-[#E6EDF7]">Close</button>
                          </div>
                        </div>
                        <AvatarSelector
                          selectedAvatar={avatarUrl}
                          onAvatarSelect={(url) => { setAvatarUrl(url); setAvatarFile(null); }}
                          showLabel={false}
                          size="small"
                        />
                        <p className="mt-2 text-xs text-[#8B98B0]">JPEG, PNG or GIF up to 2MB. Pick one, then Save changes.</p>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {/* Discord link (feeds registration + the CTFPL server automation) */}
              {user && <DiscordLinkCard userId={user.id} />}

              {/* Recorded games */}
              <div className="rounded-xl bg-[#131A2B] p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-lg text-[#E6EDF7]">Recorded games <span className="text-sm text-[#8B98B0]">· {userGames.length}</span></h2>
                  {userGames.length > 5 && (
                    <button onClick={() => setShowAllGames(!showAllGames)} className="text-xs text-[#22D3EE] hover:underline">
                      {showAllGames ? 'Show fewer' : `Show all ${userGames.length}`}
                    </button>
                  )}
                </div>

                {gamesLoading ? (
                  <p className="py-6 text-center text-sm text-[#8B98B0]">Loading your games…</p>
                ) : userGames.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[#8B98B0]">No recorded games yet. Games appear here once they've been recorded with video.</p>
                ) : (
                  <div className="space-y-2">
                    {(showAllGames ? userGames : userGames.slice(0, 5)).map((game) => (
                      <div key={game.gameId} className="rounded-lg bg-[#0B0F1A] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-[#E6EDF7]">{game.gameMode} · {game.mapName}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${game.userStats?.result === 'win' ? 'bg-[#34D399]/15 text-[#34D399]' : game.userStats?.result === 'loss' ? 'bg-[#F87171]/15 text-[#F87171]' : 'bg-white/5 text-[#8B98B0]'}`}>
                                {game.userStats?.result === 'win' ? 'Win' : game.userStats?.result === 'loss' ? 'Loss' : '—'}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#8B98B0]">
                              <span>{formatGameDate(game.gameDate)}</span>
                              <span>{formatGameDuration(game.duration)}</span>
                              <span>{game.totalPlayers} players</span>
                              {game.userStats && (
                                <>
                                  <span style={getClassColorStyle(game.userStats.class)}>{game.userStats.class}</span>
                                  <span className="text-[#E6EDF7]">{game.userStats.kills}K / {game.userStats.deaths}D</span>
                                  {game.userStats.captures > 0 && <span>{game.userStats.captures} caps</span>}
                                  {game.userStats.carrier_kills > 0 && <span>{game.userStats.carrier_kills} carrier kills</span>}
                                  <span>Team {game.userStats.team}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {game.videoInfo.has_video && (
                            <div className="flex gap-1.5">
                              {game.videoInfo.youtube_url && (
                                <button onClick={() => setVideoModal({ isOpen: true, game })} className="rounded-md bg-[#22D3EE] px-2.5 py-1 text-xs font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Watch</button>
                              )}
                              {game.videoInfo.vod_url && (
                                <a href={game.videoInfo.vod_url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-[#E6EDF7] hover:bg-white/10">VOD</a>
                              )}
                            </div>
                          )}
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-[#8B98B0] hover:text-[#E6EDF7]">All players ({game.players.length})</summary>
                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {Object.entries(
                              game.players.reduce((acc: any, player) => {
                                if (!acc[player.team]) acc[player.team] = [];
                                acc[player.team].push(player);
                                return acc;
                              }, {})
                            ).map(([team, players]: [string, any]) => (
                              <div key={team} className="rounded-md bg-[#131A2B] p-2">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8B98B0]">{team}</div>
                                <div className="space-y-0.5">
                                  {players.map((player: RecordedGamePlayer, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs">
                                      <span style={getClassColorStyle(player.main_class)}>{player.player_name === inGameAlias ? '★ ' : ''}{player.player_name}</span>
                                      <span className="text-[#8B98B0]">{player.kills}K/{player.deaths}D{player.flag_captures ? ` ${player.flag_captures}C` : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ===== Right: stats, season, squad ===== */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Games', value: heroData?.elo?.total_games ?? '—' },
                  { label: 'Win rate', value: heroData?.elo ? `${(heroData.elo.win_rate * (heroData.elo.win_rate <= 1 ? 100 : 1)).toFixed(1)}%` : '—' },
                  { label: 'K/D', value: heroData?.elo ? heroData.elo.kill_death_ratio.toFixed(2) : '—' },
                  { label: 'Peak ELO', value: heroData?.elo ? Math.round(heroData.elo.elo_peak) : '—' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-[#131A2B] px-3 py-3 text-center">
                    <div className="font-display text-2xl text-[#E6EDF7]">{s.value}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[#8B98B0]">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-[#131A2B] p-4">
                <h2 className="mb-2 font-display text-lg text-[#E6EDF7]">This season</h2>
                {!seasonCtx ? (
                  <p className="text-sm text-[#8B98B0]">Loading…</p>
                ) : !seasonCtx.league || !seasonCtx.season ? (
                  <p className="text-sm text-[#8B98B0]">No season is open for registration right now.</p>
                ) : (
                  <>
                    <p className="text-sm text-[#E6EDF7]">
                      {seasonCtx.league.name} Season {seasonCtx.season.season_number}
                      <span className="text-[#8B98B0]"> · {seasonCtx.registration ? 'registered' : 'not registered'}</span>
                    </p>
                    {seasonCtx.registration?.preferred_roles?.length ? (
                      <p className="mt-0.5 text-xs text-[#8B98B0]">Preferred: {seasonCtx.registration.preferred_roles.join(', ')}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href="/league/register" className={`rounded-md px-3 py-1.5 text-sm ${seasonCtx.registration ? 'bg-white/5 text-[#E6EDF7] hover:bg-white/10' : 'bg-[#22D3EE] font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]'}`}>
                        {seasonCtx.registration ? 'Edit registration' : 'Register'}
                      </Link>
                      <Link href="/free-agents" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Pool</Link>
                      {seasonCtx.league.slug === 'ctfdl' && <Link href="/league/ctfdl/draft" className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[#E6EDF7] hover:bg-white/10">Draft lobby</Link>}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl bg-[#131A2B] p-4">
                <h2 className="mb-2 font-display text-lg text-[#E6EDF7]">Squad</h2>
                {(() => {
                  const current = userSquad.find((s) => s && !s.is_legacy && s.is_active !== false);
                  const past = userSquad.filter((s) => s && s.id !== current?.id);
                  return (
                    <>
                      {current ? (
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/squads/${current.id}`} className="font-display text-base text-[#E6EDF7] hover:text-[#22D3EE]">[{current.tag}] {current.name}</Link>
                          <Link href={`/squads/${current.id}`} className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-[#E6EDF7] hover:bg-white/10">Manage</Link>
                        </div>
                      ) : seasonCtx?.league?.format && seasonCtx.league.format !== 'squad' ? (
                        // Draft / OvD season: the draft (or staff) places you; only captains create squads.
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-[#8B98B0]">
                            No squad yet — {seasonCtx.registration ? `the ${seasonCtx.league.name} draft places you on one.` : `register and the ${seasonCtx.league.name} draft places you on one.`}
                          </span>
                          <Link href="/squads" className="text-xs text-[#8B98B0] hover:text-[#E6EDF7]">Captains: create your squad</Link>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-[#8B98B0]">Not on a current squad</span>
                          <Link href="/squads" className="rounded-md bg-[#22D3EE] px-2.5 py-1 text-xs font-semibold text-[#0B0F1A] hover:bg-[#67E8F9]">Join or create</Link>
                        </div>
                      )}
                      {past.length > 0 && (
                        <div className="mt-2 text-xs text-[#8B98B0]">
                          Past:{' '}
                          {past.map((s, i) => (
                            <span key={s.id}>
                              {i > 0 ? ', ' : ''}
                              <Link href={`/squads/${s.id}`} className="hover:text-[#E6EDF7]">[{s.tag}] {s.name}</Link>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Video Modal */}
      {videoModal.isOpen && videoModal.game && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white">
                {videoModal.game.gameMode} - {videoModal.game.mapName}
              </h3>
              <button
                onClick={() => setVideoModal({ isOpen: false, game: null })}
                className="text-gray-400 hover:text-white text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {videoModal.game.videoInfo.youtube_url && (
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeVideoId(videoModal.game.videoInfo.youtube_url)}`}
                    title="Game Video"
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-bold text-cyan-400 mb-2">Game Info</h4>
                  <div className="space-y-1 text-gray-300">
                    <p>{formatGameDate(videoModal.game.gameDate)}</p>
                    <p>Duration: {formatGameDuration(videoModal.game.duration)}</p>
                    <p>Players: {videoModal.game.totalPlayers}</p>
                    {videoModal.game.winningInfo && (
                      <p>Winner: {videoModal.game.winningInfo.winner}</p>
                    )}
                  </div>
                </div>

                {videoModal.game.userStats && (
                  <div>
                    <h4 className="font-bold text-cyan-400 mb-2">Your Performance</h4>
                    <div className="space-y-1 text-gray-300">
                      <p style={getClassColorStyle(videoModal.game.userStats.class)}>
                        Class: {videoModal.game.userStats.class}
                      </p>
                      <p>K/D: {videoModal.game.userStats.kills}/{videoModal.game.userStats.deaths}</p>
                      {videoModal.game.userStats.captures > 0 && (
                        <p>Flag Captures: {videoModal.game.userStats.captures}</p>
                      )}
                      {videoModal.game.userStats.carrier_kills > 0 && (
                        <p>Carrier Kills: {videoModal.game.userStats.carrier_kills}</p>
                      )}
                      <p>Team: {videoModal.game.userStats.team}</p>
                      <p className={`font-medium ${
                        videoModal.game.userStats.result === 'win' ? 'text-green-400' :
                        videoModal.game.userStats.result === 'loss' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        Result: {videoModal.game.userStats.result === 'win' ? 'Victory' :
                                videoModal.game.userStats.result === 'loss' ? 'Defeat' : 'Unknown'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {videoModal.game.videoInfo.vod_url && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <a
                    href={videoModal.game.videoInfo.vod_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-medium transition-colors duration-300"
                  >
                    Watch Full VOD
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
