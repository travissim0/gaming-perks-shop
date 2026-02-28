'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import PlayerProfileHero from '@/components/PlayerProfileHero';
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
      const { data: activeSquads } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id, name, tag, description, is_legacy
          )
        `)
        .eq('player_id', user.id)
        .eq('status', 'active')
        .eq('squads.is_legacy', false)
        .limit(1) as { data: SquadMember[] | null; error: any };

      const { data: legacySquads } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id, name, tag, description, is_legacy
          )
        `)
        .eq('player_id', user.id)
        .eq('squads.is_legacy', true)
        .limit(1) as { data: SquadMember[] | null; error: any };

      const squadsProfile: Squad[] = [];
      if (activeSquads?.length && activeSquads[0].squads) {
        squadsProfile.push(activeSquads[0].squads);
      }
      if (
        legacySquads?.length && legacySquads[0].squads &&
        (!activeSquads?.length || !activeSquads[0].squads || legacySquads[0].squads.id !== activeSquads[0].squads.id)
      ) {
        squadsProfile.push(legacySquads[0].squads);
      }
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />

      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">

          {/* ===== ZONE 1: Profile Overview (read-only) ===== */}

          {/* Profile Hero */}
          <PlayerProfileHero
            playerName={inGameAlias || 'Player'}
            profile={heroData?.profile ?? null}
            aliases={heroData?.aliases ?? []}
            squad={heroData?.squad ?? null}
            freeAgent={heroData?.freeAgent ?? null}
            elo={heroData?.elo ?? null}
            isRegistered={heroData?.isRegistered ?? true}
            loading={heroLoading || profileLoading}
          />

          {/* View Public Profile link */}
          {inGameAlias && (
            <div className="flex justify-center -mt-4 mb-6">
              <Link
                href={`/stats/player/${encodeURIComponent(inGameAlias)}`}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                View Public Profile &rarr;
              </Link>
            </div>
          )}

          {/* Squad Section (read-only) */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/20 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-cyan-400 mb-4 tracking-wide">Squad</h2>
            {userSquad.length > 0 ? (
              userSquad.filter(squad => squad && squad.id).map((squad) => (
                <div key={squad.id} className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4 mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-cyan-400">
                      [{squad.tag || 'N/A'}] {squad.name || 'Unknown Squad'}
                    </h3>
                    <Link
                      href={`/squads/${squad.id}`}
                      className="bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded text-sm font-medium transition-colors duration-300 text-white"
                    >
                      Manage Squad
                    </Link>
                  </div>
                  {squad.description && (
                    <p className="text-gray-300 text-sm">{squad.description}</p>
                  )}
                  {squad.is_legacy && (
                    <span className="text-xs text-yellow-400 font-mono">Legacy Squad</span>
                  )}
                </div>
              ))
            ) : (
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 text-center">
                <p className="text-gray-400 mb-3">You are not currently in a squad</p>
                <Link
                  href="/squads"
                  className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-medium transition-colors duration-300 text-white"
                >
                  Join or Create Squad
                </Link>
              </div>
            )}
          </div>

          {/* ===== ZONE 2: Account Settings (editable) ===== */}

          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/20 rounded-lg p-8 mb-6">
            <h2 className="text-2xl font-bold text-cyan-400 mb-6 tracking-wide">Account Settings</h2>

            {profileLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-24 w-24 bg-gray-700 rounded-full mx-auto" />
                <div className="h-12 bg-gray-700 rounded" />
                <div className="h-12 bg-gray-700 rounded" />
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="space-y-8">
                {/* Avatar */}
                <div className="text-center">
                  <div className="relative inline-block">
                    <div className="h-32 w-32 rounded-full overflow-hidden mx-auto bg-gray-700 border-4 border-cyan-500 shadow-lg shadow-cyan-500/25">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-3xl text-cyan-400 font-bold">
                          {inGameAlias ? inGameAlias.charAt(0).toUpperCase() : '?'}
                        </div>
                      )}
                    </div>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 rounded-full">
                        <div className="text-cyan-400 font-bold text-lg">{uploadProgress}%</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6">
                    <label className="block text-sm font-bold text-gray-400 mb-3 tracking-wide uppercase">
                      Upload Profile Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <label
                      htmlFor="avatar-upload"
                      className="inline-block bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 px-6 py-3 rounded-lg cursor-pointer text-white font-medium tracking-wide border border-gray-500 hover:border-cyan-500 transition-all duration-300"
                    >
                      Choose File
                    </label>
                    {avatarFile && (
                      <p className="mt-3 text-sm text-cyan-300 font-mono">
                        {avatarFile.name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Preset Avatars */}
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                  <AvatarSelector
                    selectedAvatar={avatarUrl}
                    onAvatarSelect={(url) => {
                      setAvatarUrl(url);
                      setAvatarFile(null);
                    }}
                    showLabel={true}
                    size="medium"
                  />
                </div>

                {/* Email + Display Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label htmlFor="email" className="block text-sm font-bold text-gray-400 mb-3 tracking-wide uppercase">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Email verification required for changes
                    </p>
                  </div>

                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label htmlFor="inGameAlias" className="block text-sm font-bold text-gray-400 mb-3 tracking-wide uppercase">
                      Display Name / Main Alias
                    </label>
                    <input
                      id="inGameAlias"
                      type="text"
                      value={inGameAlias}
                      onChange={handleAliasChange}
                      onBlur={handleAliasBlur}
                      required
                      className={`w-full px-4 py-3 bg-gray-800 border rounded-lg text-white focus:outline-none focus:ring-2 transition-all duration-300 font-mono ${
                        aliasError
                          ? 'border-red-500 focus:border-red-400 focus:ring-red-500/20'
                          : 'border-gray-600 focus:border-cyan-500 focus:ring-cyan-500/20'
                      }`}
                      placeholder="Enter your combat alias..."
                    />
                    {aliasError && (
                      <p className="mt-2 text-sm text-red-400">{aliasError}</p>
                    )}
                    {!aliasError && (
                      <p className="mt-2 text-xs text-gray-500">
                        Must contain at least 1 valid character
                      </p>
                    )}
                  </div>
                </div>

                {/* AKA Aliases */}
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                  <label className="block text-sm font-bold text-gray-400 mb-3 tracking-wide uppercase">
                    Also Known As (AKA)
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {aliases
                      .filter(alias => alias.trim().toLowerCase() !== inGameAlias.trim().toLowerCase())
                      .map(alias => (
                        <span
                          key={alias}
                          className="flex items-center bg-cyan-800 text-cyan-100 px-3 py-1 rounded-full font-mono text-sm"
                        >
                          {alias}
                          <button
                            type="button"
                            onClick={() => removeAlias(alias)}
                            className="ml-2 text-cyan-300 hover:text-red-400 font-bold focus:outline-none"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    <input
                      type="text"
                      value={aliasInput}
                      onChange={e => setAliasInput(e.target.value)}
                      onKeyDown={handleAliasInput}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white font-mono focus:outline-none"
                      placeholder="Add alias and press space..."
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Press space or enter to add each alias. Main alias is automatically included.
                  </p>
                </div>

                {/* Update Button */}
                <div className="flex justify-center pt-4">
                  <button
                    type="submit"
                    disabled={updateLoading}
                    className={`px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold text-lg tracking-wider border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-2xl hover:shadow-cyan-500/25 ${
                      updateLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {updateLoading ? 'Updating...' : 'Update Profile'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* ===== ZONE 3: Recorded Games (read-only, outside form) ===== */}

          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/20 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-cyan-400 tracking-wide">
                My Recorded Games
              </h2>
              {userGames.length > 0 && (
                <button
                  onClick={() => setShowAllGames(!showAllGames)}
                  className="text-sm text-cyan-400 hover:text-cyan-300 underline"
                >
                  {showAllGames ? 'Show Less' : `View All ${userGames.length} Games`}
                </button>
              )}
            </div>

            {gamesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500" />
                <span className="ml-3 text-cyan-400">Loading your games...</span>
              </div>
            ) : userGames.length === 0 ? (
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 text-center">
                <p className="text-gray-400 mb-3">No recorded games found</p>
                <p className="text-sm text-gray-500">Your games will appear here once they&apos;ve been recorded with video</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(showAllGames ? userGames : userGames.slice(0, 5)).map((game) => (
                  <div
                    key={game.gameId}
                    className="bg-gray-800 border border-gray-600 rounded-lg p-4 hover:border-cyan-500/50 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-bold text-white">
                            {game.gameMode} - {game.mapName}
                          </h4>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            game.userStats?.result === 'win'
                              ? 'bg-green-500/20 text-green-400'
                              : game.userStats?.result === 'loss'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {game.userStats?.result === 'win' ? 'Win' :
                             game.userStats?.result === 'loss' ? 'Loss' : 'Unknown'}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-300 mb-2">
                          <span>{formatGameDate(game.gameDate)}</span>
                          <span>{formatGameDuration(game.duration)}</span>
                          <span>{game.totalPlayers} players</span>
                        </div>

                        {game.userStats && (
                          <div className="flex items-center gap-4 text-sm">
                            <span className="font-medium" style={getClassColorStyle(game.userStats.class)}>
                              {game.userStats.class}
                            </span>
                            <span className="text-yellow-400">
                              {game.userStats.kills}K/{game.userStats.deaths}D
                            </span>
                            {game.userStats.captures > 0 && (
                              <span className="text-blue-400">
                                {game.userStats.captures} caps
                              </span>
                            )}
                            {game.userStats.carrier_kills > 0 && (
                              <span className="text-purple-400">
                                {game.userStats.carrier_kills} carrier kills
                              </span>
                            )}
                            <span className="text-gray-400">
                              Team: {game.userStats.team}
                            </span>
                          </div>
                        )}
                      </div>

                      {game.videoInfo.has_video && (
                        <div className="flex gap-2 ml-4">
                          {game.videoInfo.youtube_url && (
                            <button
                              onClick={() => setVideoModal({ isOpen: true, game })}
                              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 flex items-center gap-1"
                            >
                              YouTube
                            </button>
                          )}
                          {game.videoInfo.vod_url && (
                            <a
                              href={game.videoInfo.vod_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 flex items-center gap-1"
                            >
                              VOD
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Player details toggle */}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300 text-sm font-medium">
                        View All Players ({game.players.length})
                      </summary>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(
                          game.players.reduce((acc: any, player) => {
                            if (!acc[player.team]) acc[player.team] = [];
                            acc[player.team].push(player);
                            return acc;
                          }, {})
                        ).map(([team, players]: [string, any]) => (
                          <div key={team} className="bg-gray-700 rounded p-3">
                            <h5 className="font-bold text-cyan-400 mb-2">{team}</h5>
                            <div className="space-y-1">
                              {players.map((player: RecordedGamePlayer, idx: number) => (
                                <div key={idx} className="flex justify-between text-xs">
                                  <span className="font-medium" style={getClassColorStyle(player.main_class)}>
                                    {player.player_name === inGameAlias ? '* ' : ''}{player.player_name}
                                  </span>
                                  <span className="text-gray-300">
                                    {player.kills}K/{player.deaths}D
                                    {player.flag_captures ? ` ${player.flag_captures}C` : ''}
                                  </span>
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
