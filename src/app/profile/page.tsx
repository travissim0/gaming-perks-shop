'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import AvatarSelector from '@/components/AvatarSelector';
import { getDefaultAvatarUrl } from '@/utils/supabaseHelpers';

// Interfaces for squad data
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

// Interfaces for recorded games
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

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [inGameAlias, setInGameAlias] = useState('');
  const [email, setEmail] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userSquad, setUserSquad] = useState<Squad[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  
  // Game-related state
  const [userGames, setUserGames] = useState<RecordedGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  const [videoModal, setVideoModal] = useState<{ isOpen: boolean; game: RecordedGame | null }>({
    isOpen: false,
    game: null
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        try {
          // Fetch the user's profile
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) {
            throw error;
          }

          if (data) {
            setInGameAlias(data.in_game_alias || '');
            setAvatarUrl(data.avatar_url || null);
          }

          // Fetch aliases from profile_aliases
          const { data: aliasData, error: aliasError } = await supabase
            .from('profile_aliases')
            .select('alias')
            .eq('profile_id', user.id);
        
          if (aliasError) {
            toast.error('Error loading aliases: ' + aliasError.message);
            setAliases([]);
          } else {
            setAliases(aliasData?.map(a => a.alias) || []);
          }
          
          // Get current email from user object
          setEmail(user.email || '');

          // Fetch user's squad information
          await loadUserSquad();

          // Fetch user's recorded games
          await loadUserGames();

          // Set default avatar if none exists
          if (!data.avatar_url) {
            const defaultAvatar = getDefaultAvatarUrl();
            setAvatarUrl(defaultAvatar);
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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    // Prevent blank display name
    if (!inGameAlias.trim()) {
      toast.error('Display Name / Main Alias cannot be blank.');
      return;
    }
    
    setUpdateLoading(true);
    
    try {
      let newAvatarUrl = avatarUrl;
      
      // Get the user's access token for API calls
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('Please sign in again to update your profile');
        return;
      }
      
      // If there's a file to upload, upload it first
      if (avatarFile) {
        try {
          const fileExt = avatarFile.name.split('.').pop();
          const fileName = `${user.id}-${Date.now()}.${fileExt}`;
          const filePath = `user-uploads/${fileName}`;
          
          const { error: uploadError, data } = await supabase.storage
            .from('avatars')
            .upload(filePath, avatarFile, {
              upsert: true
            });
            
          if (uploadError) {
            throw uploadError;
          }
          
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
            
          newAvatarUrl = publicUrl;
        } catch (uploadError: any) {
          if (uploadError.message?.includes('Bucket not found')) {
            toast.error('Avatar storage not set up yet. Please contact support.');
            return;
          } else {
            throw uploadError;
          }
        }
      }

      await supabase
      .from('profile_aliases')
      .delete()
      .eq('profile_id', user.id);

      // Before inserting aliases, ensure main alias is included
      let allAliases = [...aliases];
      if (
        inGameAlias.trim() &&
        !allAliases.some(a => a.trim().toLowerCase() === inGameAlias.trim().toLowerCase())
      ) {
        allAliases.unshift(inGameAlias.trim());
      }
      
      // Remove duplicates just in case
      allAliases = Array.from(new Set(allAliases.map(a => a.trim())));
      
      const aliasRows = allAliases.map(alias => ({
        profile_id: user.id,
        alias,
        is_primary: alias.toLowerCase() === inGameAlias.trim().toLowerCase(),
        added_by: 'system' // Optionally mark as primary
      }));
      await supabase.from('profile_aliases').insert(aliasRows);
      
      // Update the profile
      const { error } = await supabase
        .from('profiles')
        .update({
          in_game_alias: inGameAlias,
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
        
      if (error) {
        throw error;
      }
      
      // Update email if changed
      if (email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: email
        });
        
        if (emailError) {
          throw emailError;
        }
        
        toast.success('Profile updated successfully! Please check your new email for a confirmation link.');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file type and size
      const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
      const maxSize = 2 * 1024 * 1024; // 2MB
      
      if (!validTypes.includes(file.type)) {
        toast.error('Invalid file type. Please upload a JPEG, PNG, or GIF image.');
        return;
      }
      
      if (file.size > maxSize) {
        toast.error('File is too large. Maximum size is 2MB.');
        return;
      }
      
      setAvatarFile(file);
      
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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

  const loadUserSquad = async () => {
    if (!user) return;
    
    try {
      console.log('Loading squad for user:', user.id);
      // Fetch all active squads for the user (could be more than one)
      const { data: activeSquads, error: activeSquadsError } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id,
            name,
            tag,
            description,
            is_legacy
          )
        `)
        .eq('player_id', user.id)
        .eq('status', 'active')
        .eq('squads.is_legacy', false)
        .limit(1) as { data: SquadMember[] | null; error: any };
      
      // Fetch all legacy squads for the user (could be more than one)
      const { data: legacySquads, error: legacySquadsError } = await supabase
        .from('squad_members')
        .select(`
          squads!inner(
            id,
            name,
            tag,
            description,
            is_legacy
          )
        `)
        .eq('player_id', user.id)
        .eq('squads.is_legacy', true)
        .limit(1) as { data: SquadMember[] | null; error: any };
      
      console.log('Active squads data:', activeSquads);
      console.log('Legacy squads data:', legacySquads);
      
      // Merge results, filter out duplicates (by squad id)
      const squadsProfile = [];
      if (activeSquads && activeSquads.length > 0 && activeSquads[0].squads) {
        squadsProfile.push(activeSquads[0].squads);
      }
      if (
        legacySquads && legacySquads.length > 0 && legacySquads[0].squads 
        && (!activeSquads || !activeSquads[0].squads || legacySquads[0].squads.id !== activeSquads[0].squads.id)
      ) {
        squadsProfile.push(legacySquads[0].squads);
      }
      setUserSquad(squadsProfile);
      console.log('Squads for rendering:', squadsProfile);
      
    } catch (error) {
      console.error('Error loading user squad:', error);
    }
  };

  // Helper functions for game display
  const getClassColor = (className: string) => {
    const colors: { [key: string]: string } = {
      'Warrior': 'text-red-400',
      'Engineer': 'text-yellow-400',
      'Duelist': 'text-purple-400',
      'Sniper': 'text-green-400',
      'Bomber': 'text-orange-400',
      'Juggernaut': 'text-blue-400',
      'Spy': 'text-pink-400',
      'Medic': 'text-emerald-400'
    };
    return colors[className] || 'text-gray-400';
  };

  const formatGameDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatGameDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getYouTubeVideoId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    return match ? match[1] : null;
  };

  const getBestYouTubeThumbnail = (url: string) => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  };

  const openVideoModal = (game: RecordedGame) => {
    setVideoModal({ isOpen: true, game });
  };

  const closeVideoModal = () => {
    setVideoModal({ isOpen: false, game: null });
  };

  // Show loading spinner only while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  // If not loading and no user, redirect will happen via useEffect
  // But we shouldn't render anything while redirect is happening
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-cyan-400 font-mono">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      <Navbar user={user} />
      
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-cyan-400 mb-4 tracking-wider">👤 Account Details</h1>
          </div>

          <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-cyan-500/30 rounded-lg p-8 shadow-2xl">
          
            {profileLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-24 w-24 bg-gray-700 rounded-full mx-auto"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded"></div>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="space-y-8">
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
                          {inGameAlias ? inGameAlias.charAt(0).toUpperCase() : 'S'}
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
                    <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                      📸 UPLOAD PROFILE IMAGE
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
                      CHOOSE FILE
                    </label>
                    {avatarFile && (
                      <p className="mt-3 text-sm text-cyan-300 font-mono">
                        📁 {avatarFile.name}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Avatar Selection */}
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                  <AvatarSelector 
                    selectedAvatar={avatarUrl}
                    onAvatarSelect={(url) => {
                      setAvatarUrl(url);
                      setAvatarFile(null); // Clear any uploaded file
                    }}
                    showLabel={true}
                    size="medium"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label htmlFor="email" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                      📧 E-mail
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-2 font-mono">
                      ⚠️ Email verification required for changes
                    </p>
                  </div>
                  
                  <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                    <label htmlFor="inGameAlias" className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                      🎮 Display Name / Main Alias
                    </label>
                    <input
                      id="inGameAlias"
                      type="text"
                      value={inGameAlias}
                      onChange={(e) => setInGameAlias(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-300 font-mono"
                      placeholder="Enter your combat alias..."
                    />
                  </div>
                </div>

                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6 mt-6">
                  <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                    🏷️ Also Known As (AKA)
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
                            ×
                          </button>
                        </span>
                    ))}
                    <input
                      type="text"
                      value={aliasInput}
                      onChange={e => setAliasInput(e.target.value)}
                      onKeyDown={handleAliasInput}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white font-mono focus:outline-none"
                      placeholder="Add alias and press space…"
                    />
                  </div>
                  <p className="text-xs text-gray-400 font-mono">
                    Add all your known aliases. Press space or enter to add each one.
                    <br />(Main Alias will be excluded from this list, but is a part of your aliases list.)
                  </p>
                </div>
              
                {/* Squad Information */}
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                  <label className="block text-lg font-bold text-cyan-400 mb-3 tracking-wide">
                    🏆 Squad
                  </label>
                  {userSquad.length > 0 ? (
                    userSquad.filter(squad => squad && squad.id).map((squad) => (
                      <div key={squad.id} className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-bold text-cyan-400">
                            [{squad.tag || 'N/A'}] {squad.name || 'Unknown Squad'}
                          </h3>
                          <Link
                            href={`/squads/${squad.id}`}
                            className="bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded text-sm font-medium transition-colors duration-300"
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
                        className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded font-medium transition-colors duration-300"
                      >
                        Join or Create Squad
                      </Link>
                    </div>
                  )}
                </div>

                {/* Recorded Games Section */}
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-6">
                    <label className="block text-lg font-bold text-cyan-400 tracking-wide">
                      🎬 My Recorded Games
                    </label>
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
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
                      <span className="ml-3 text-cyan-400">Loading your games...</span>
                    </div>
                  ) : userGames.length === 0 ? (
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 text-center">
                      <p className="text-gray-400 mb-3">No recorded games found</p>
                      <p className="text-sm text-gray-500">Your games will appear here once they've been recorded with video</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(showAllGames ? userGames : userGames.slice(0, 5)).map((game, index) => (
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
                                  {game.userStats?.result === 'win' ? '🏆 Win' : 
                                   game.userStats?.result === 'loss' ? '💀 Loss' : '⚖️ Unknown'}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-4 text-sm text-gray-300 mb-2">
                                <span>📅 {formatGameDate(game.gameDate)}</span>
                                <span>⏱️ {formatGameDuration(game.duration)}</span>
                                <span>👥 {game.totalPlayers} players</span>
                              </div>

                              {game.userStats && (
                                <div className="flex items-center gap-4 text-sm">
                                  <span className={`font-medium ${getClassColor(game.userStats.class)}`}>
                                    {game.userStats.class}
                                  </span>
                                  <span className="text-yellow-400">
                                    ⚔️ {game.userStats.kills}K/{game.userStats.deaths}D
                                  </span>
                                  {game.userStats.captures > 0 && (
                                    <span className="text-blue-400">
                                      🏃 {game.userStats.captures} caps
                                    </span>
                                  )}
                                  {game.userStats.carrier_kills > 0 && (
                                    <span className="text-purple-400">
                                      🎯 {game.userStats.carrier_kills} carrier kills
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
                                    onClick={() => openVideoModal(game)}
                                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 flex items-center gap-1"
                                  >
                                    📺 YouTube
                                  </button>
                                )}
                                {game.videoInfo.vod_url && (
                                  <a
                                    href={game.videoInfo.vod_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 flex items-center gap-1"
                                  >
                                    🎥 VOD
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Game Details Toggle */}
                          <details className="mt-3">
                            <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300 text-sm font-medium">
                              👁️ View All Players ({game.players.length})
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
                                        <span className={`${getClassColor(player.main_class)} font-medium`}>
                                          {player.player_name === inGameAlias ? '⭐ ' : ''}{player.player_name}
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
                
                <div className="flex justify-center pt-6">
                  <button
                    type="submit"
                    disabled={updateLoading}
                    className={`px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold text-lg tracking-wider border border-cyan-500 hover:border-cyan-400 transition-all duration-300 shadow-2xl hover:shadow-cyan-500/25 ${
                      updateLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {updateLoading ? '🔄 UPDATING...' : '🚀 UPDATE'}
                  </button>
                </div>
              </form>
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
                🎬 {videoModal.game.gameMode} - {videoModal.game.mapName}
              </h3>
              <button
                onClick={closeVideoModal}
                className="text-gray-400 hover:text-white text-xl font-bold"
              >
                ✕
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
                    <p>📅 {formatGameDate(videoModal.game.gameDate)}</p>
                    <p>⏱️ Duration: {formatGameDuration(videoModal.game.duration)}</p>
                    <p>👥 Players: {videoModal.game.totalPlayers}</p>
                    {videoModal.game.winningInfo && (
                      <p>🏆 Winner: {videoModal.game.winningInfo.winner}</p>
                    )}
                  </div>
                </div>
                
                {videoModal.game.userStats && (
                  <div>
                    <h4 className="font-bold text-cyan-400 mb-2">Your Performance</h4>
                    <div className="space-y-1 text-gray-300">
                      <p className={getClassColor(videoModal.game.userStats.class)}>
                        Class: {videoModal.game.userStats.class}
                      </p>
                      <p>⚔️ K/D: {videoModal.game.userStats.kills}/{videoModal.game.userStats.deaths}</p>
                      {videoModal.game.userStats.captures > 0 && (
                        <p>🏃 Flag Captures: {videoModal.game.userStats.captures}</p>
                      )}
                      {videoModal.game.userStats.carrier_kills > 0 && (
                        <p>🎯 Carrier Kills: {videoModal.game.userStats.carrier_kills}</p>
                      )}
                      <p>Team: {videoModal.game.userStats.team}</p>
                      <p className={`font-medium ${
                        videoModal.game.userStats.result === 'win' ? 'text-green-400' : 
                        videoModal.game.userStats.result === 'loss' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        Result: {videoModal.game.userStats.result === 'win' ? '🏆 Victory' : 
                                videoModal.game.userStats.result === 'loss' ? '💀 Defeat' : '⚖️ Unknown'}
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
                    🎥 Watch Full VOD
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