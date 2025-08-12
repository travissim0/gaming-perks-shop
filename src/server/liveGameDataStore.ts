// Shared in-memory store for live game data across multiple route handlers

export interface LivePlayerData {
  alias: string;
  team: string;
  teamType: string;
  className: string;
  isOffense: boolean;
  weapon: string;
  classPlayTimes?: Record<string, number>;
  totalPlayTime?: number;
  isDueling?: boolean;
  duelOpponent?: string | null;
  duelType?: string | null;
  currentHealth?: number;
  currentEnergy?: number;
  isAlive?: boolean;
}

export interface LiveGameData {
  arenaName: string | null;
  gameType: string | null;
  baseUsed: string | null;
  players: LivePlayerData[];
  lastUpdated: string | null;
  winningTeam?: string | null;
  gameStartTime?: string | null;
  gameDurationMs?: number;
  participantData?: any[];
  serverStatus?: 'active' | 'idle' | 'unknown';
  totalPlayers?: number;
  playingPlayers?: number;
  spectators?: number;
}

let currentLiveGameData: LiveGameData | null = null;

export function setLiveGameData(data: LiveGameData) {
  currentLiveGameData = data;
}

export function getLiveGameData(): LiveGameData | null {
  return currentLiveGameData;
}

