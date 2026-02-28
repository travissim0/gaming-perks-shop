'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import UserAvatar from '@/components/UserAvatar';
import type { EloTier } from '@/utils/eloTiers';

interface PlayerProfileData {
  id: string;
  in_game_alias: string | null;
  avatar_url: string | null;
  created_at: string;
  is_league_banned: boolean;
  ctf_role: string | null;
}

interface PlayerSquadData {
  id: string;
  name: string;
  tag: string;
  banner_url: string | null;
  role: string;
}

interface PlayerFreeAgentData {
  preferred_roles: string[];
  skill_level: string;
  availability: string | null;
}

interface PlayerEloData {
  weighted_elo: number;
  elo_rating: number;
  elo_peak: number;
  elo_confidence: number;
  total_games: number;
  win_rate: number;
  kill_death_ratio: number;
  tier: EloTier;
}

interface PlayerProfileHeroProps {
  playerName: string;
  profile: PlayerProfileData | null;
  aliases: string[];
  squad: PlayerSquadData | null;
  freeAgent: PlayerFreeAgentData | null;
  elo: PlayerEloData | null;
  isRegistered: boolean;
  loading?: boolean;
  // Stats data passed from the page
  stats?: {
    totalGames?: number;
    winRate?: number;
    killDeathRatio?: number;
    avgAccuracy?: number;
    totalKills?: number;
    totalCaptures?: number;
  } | null;
}

export default function PlayerProfileHero({
  playerName,
  profile,
  aliases,
  squad,
  freeAgent,
  elo,
  isRegistered,
  loading = false,
  stats,
}: PlayerProfileHeroProps) {
  const tierColor = elo?.tier?.color || '#6B7280';
  const tierName = elo?.tier?.name || 'Unranked';

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  const formatPercentage = (num: number) => {
    return `${(num * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-8 mb-8"
      >
        <div className="flex items-center gap-6">
          <div className="w-28 h-28 rounded-2xl bg-gray-700/50 animate-pulse" />
          <div className="flex-1 space-y-3">
            <div className="h-8 w-48 bg-gray-700/50 rounded animate-pulse" />
            <div className="h-4 w-32 bg-gray-700/50 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-700/50 rounded animate-pulse" />
          </div>
        </div>
      </motion.div>
    );
  }

  // Build stat highlights from available data
  const statHighlights: { label: string; value: string; color: string }[] = [];

  if (stats?.totalGames != null) {
    statHighlights.push({ label: 'Games Played', value: stats.totalGames.toLocaleString(), color: 'text-cyan-400' });
  } else if (elo?.total_games != null) {
    statHighlights.push({ label: 'Games Played', value: elo.total_games.toLocaleString(), color: 'text-cyan-400' });
  }

  if (stats?.winRate != null) {
    statHighlights.push({ label: 'Win Rate', value: formatPercentage(stats.winRate), color: 'text-green-400' });
  } else if (elo?.win_rate != null) {
    statHighlights.push({ label: 'Win Rate', value: formatPercentage(elo.win_rate), color: 'text-green-400' });
  }

  if (stats?.killDeathRatio != null) {
    statHighlights.push({ label: 'K/D Ratio', value: stats.killDeathRatio.toFixed(2), color: 'text-purple-400' });
  } else if (elo?.kill_death_ratio != null) {
    statHighlights.push({ label: 'K/D Ratio', value: elo.kill_death_ratio.toFixed(2), color: 'text-purple-400' });
  }

  if (stats?.avgAccuracy != null && stats.avgAccuracy > 0) {
    statHighlights.push({ label: 'Avg Accuracy', value: formatPercentage(stats.avgAccuracy), color: 'text-blue-400' });
  }

  if (elo && tierName !== 'Unranked') {
    statHighlights.push({ label: 'ELO Rating', value: elo.weighted_elo.toString(), color: '' });
  }

  if (stats?.totalKills != null) {
    statHighlights.push({ label: 'Total Kills', value: stats.totalKills.toLocaleString(), color: 'text-red-400' });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl mb-8"
    >
      {/* Background gradient with tier color accent */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `radial-gradient(ellipse at top left, ${tierColor} 0%, transparent 60%)`,
        }}
      />
      <div className="absolute inset-0 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl" />

      <div className="relative p-6 md:p-8">
        {/* Main profile section */}
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar with tier-colored ring */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="relative flex-shrink-0"
          >
            <div
              className="rounded-2xl p-[3px]"
              style={{
                background: elo && tierName !== 'Unranked'
                  ? `linear-gradient(135deg, ${tierColor}, ${tierColor}88, ${tierColor}44)`
                  : 'linear-gradient(135deg, #374151, #4B5563)',
              }}
            >
              <UserAvatar
                user={{
                  avatar_url: profile?.avatar_url || null,
                  in_game_alias: profile?.in_game_alias || playerName,
                }}
                size="3xl"
                className="!rounded-xl"
              />
            </div>
            {/* ELO tier badge on avatar */}
            {elo && tierName !== 'Unranked' && (
              <div
                className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-lg text-xs font-bold shadow-lg border"
                style={{
                  backgroundColor: `${tierColor}22`,
                  borderColor: `${tierColor}66`,
                  color: tierColor,
                }}
              >
                {tierName}
              </div>
            )}
          </motion.div>

          {/* Player info */}
          <div className="flex-1 min-w-0">
            {/* Player name */}
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="text-3xl md:text-4xl font-bold text-white mb-1 truncate"
            >
              {playerName}
            </motion.h1>

            {/* Badges row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap items-center gap-2 mb-3"
            >
              {/* Squad badge */}
              {squad && (
                <Link
                  href={`/squads/${squad.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-colors text-sm font-medium"
                >
                  <span className="font-bold text-blue-400">[{squad.tag}]</span>
                  <span>{squad.name}</span>
                  {squad.role === 'captain' && (
                    <span className="text-yellow-400 text-xs">Captain</span>
                  )}
                </Link>
              )}

              {/* ELO tier badge */}
              {elo && tierName !== 'Unranked' && (
                <Link
                  href="/stats/elo"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: `${tierColor}15`,
                    borderColor: `${tierColor}30`,
                    color: tierColor,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tierColor }}
                  />
                  <span className="font-bold">{tierName}</span>
                  <span className="opacity-70">{elo.weighted_elo}</span>
                  {elo.elo_peak > elo.weighted_elo && (
                    <span className="text-xs opacity-50">
                      (Peak: {elo.elo_peak})
                    </span>
                  )}
                </Link>
              )}

              {/* Free agent badge */}
              {freeAgent && (
                <Link
                  href="/free-agents"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 hover:bg-green-500/25 transition-colors text-sm font-medium"
                >
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Free Agent
                </Link>
              )}

              {/* League banned badge */}
              {profile?.is_league_banned && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium">
                  League Banned
                </span>
              )}

              {/* CTF Role badge */}
              {profile?.ctf_role && (
                <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-500/15 border border-gray-500/30 text-gray-300 text-sm">
                  {profile.ctf_role}
                </span>
              )}
            </motion.div>

            {/* Meta info row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400"
            >
              {profile?.created_at && (
                <span>
                  Member since {formatDate(profile.created_at)}
                </span>
              )}

              {!isRegistered && (
                <span className="text-gray-500 italic">Unregistered Player</span>
              )}

              {aliases.length > 0 && (
                <span className="text-gray-500">
                  Also known as:{' '}
                  <span className="text-gray-400">
                    {aliases.slice(0, 5).join(', ')}
                    {aliases.length > 5 && ` +${aliases.length - 5} more`}
                  </span>
                </span>
              )}

              {freeAgent?.preferred_roles && freeAgent.preferred_roles.length > 0 && (
                <span className="text-gray-500">
                  Plays:{' '}
                  <span className="text-gray-400">
                    {freeAgent.preferred_roles.join(', ')}
                  </span>
                </span>
              )}
            </motion.div>
          </div>
        </div>

        {/* Stat highlights bar */}
        {statHighlights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-6 pt-5 border-t border-white/10"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {statHighlights.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.05 }}
                  className="text-center"
                >
                  <div
                    className={`text-xl md:text-2xl font-bold ${stat.color}`}
                    style={!stat.color && elo ? { color: tierColor } : undefined}
                  >
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
