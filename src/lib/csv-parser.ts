export interface PlayerStatRow {
  PlayerName: string;
  Team: string;
  Kills: number;
  Deaths: number;
  Captures: number;
  CarrierKills: number;
  CarryTimeSeconds: number;
  GameLengthMinutes: number;
  Result: 'Win' | 'Loss';
  MostPlayedClass: string;
  ClassSwaps: number;
  TurretDamage: number;
  GameMode: string;
  Side: 'offense' | 'defense' | 'N/A';
  BaseUsed: string;
  Accuracy: number;
  AvgResourceUnusedPerDeath: number;
  AvgExplosiveUnusedPerDeath: number;
  EBHits: number;
  LeftEarly: 'Yes' | 'No';
}

export interface ProcessedPlayerStat {
  player_name: string;
  team: string;
  kills: number;
  deaths: number;
  captures: number;
  carrier_kills: number;
  carry_time_seconds: number;
  game_length_minutes: number;
  result: 'Win' | 'Loss';
  main_class: string;
  class_swaps: number;
  turret_damage: number;
  game_mode: string;
  side: 'offense' | 'defense' | 'N/A';
  base_used: string;
  accuracy: string;
  avg_resource_unused_per_death: string;
  avg_explosive_unused_per_death: string;
  eb_hits: number;
  left_early: boolean;
  game_date?: string;
  game_id?: string;
  season?: string;
}

export function parseCSV(csvText: string): PlayerStatRow[] {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const expectedHeaders = [
    'PlayerName', 'Team', 'Kills', 'Deaths', 'Captures', 'CarrierKills',
    'CarryTimeSeconds', 'GameLengthMinutes', 'Result', 'MostPlayedClass',
    'ClassSwaps', 'TurretDamage', 'GameMode', 'Side', 'BaseUsed', 'Accuracy',
    'AvgResourceUnusedPerDeath', 'AvgExplosiveUnusedPerDeath', 'EBHits', 'LeftEarly'
  ];

  // Validate headers
  const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing CSV headers: ${missingHeaders.join(', ')}`);
  }

  const data: PlayerStatRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length === headers.length) {
      const row: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index];
        
        // Type conversion based on expected data types
        switch (header) {
          case 'Kills':
          case 'Deaths':
          case 'Captures':
          case 'CarrierKills':
          case 'CarryTimeSeconds':
          case 'ClassSwaps':
          case 'TurretDamage':
          case 'EBHits':
            row[header] = parseInt(value) || 0;
            break;
          case 'GameLengthMinutes':
          case 'Accuracy':
          case 'AvgResourceUnusedPerDeath':
          case 'AvgExplosiveUnusedPerDeath':
            row[header] = parseFloat(value) || 0;
            break;
          case 'Result':
            row[header] = value === 'Win' ? 'Win' : 'Loss';
            break;
          case 'Side':
            if (value.toLowerCase() === 'offense') row[header] = 'offense';
            else if (value.toLowerCase() === 'defense') row[header] = 'defense';
            else row[header] = 'N/A';
            break;
          case 'LeftEarly':
            row[header] = value === 'Yes' ? 'Yes' : 'No';
            break;
          default:
            row[header] = value;
        }
      });
      
      data.push(row);
    }
  }
  
  return data;
}

export function processPlayerStats(
  csvData: PlayerStatRow[], 
  gameId?: string, 
  gameDate?: Date,
  customSeason?: string,
  customArena?: string
): ProcessedPlayerStat[] {
  const currentDate = gameDate || new Date();
  const generatedGameId = gameId || `Tournament_${currentDate.toISOString().split('T')[0].replace(/-/g, '')}_${Math.floor(currentDate.getTime() / 1000)}`;
  
  // Apply team-based result correction logic
  const correctedData = applyTeamBasedResults(csvData);
  
  return correctedData.map(row => ({
    player_name: row.PlayerName,
    team: row.Team,
    kills: row.Kills,
    deaths: row.Deaths,
    captures: row.Captures,
    carrier_kills: row.CarrierKills,
    carry_time_seconds: row.CarryTimeSeconds,
    game_length_minutes: row.GameLengthMinutes,
    result: row.Result,
    main_class: row.MostPlayedClass,
    class_swaps: row.ClassSwaps,
    turret_damage: row.TurretDamage,
    game_mode: 'Tournament', // Force Tournament mode as requested
    side: row.Side,
    base_used: row.BaseUsed || 'Unknown',
    arena_name: customArena || 'Unknown',
    accuracy: row.Accuracy.toFixed(3),
    avg_resource_unused_per_death: row.AvgResourceUnusedPerDeath.toFixed(2),
    avg_explosive_unused_per_death: row.AvgExplosiveUnusedPerDeath.toFixed(2),
    eb_hits: row.EBHits,
    left_early: row.LeftEarly === 'Yes',
    game_date: currentDate.toISOString(),
    game_id: generatedGameId,
    season: customSeason || getCurrentSeason(currentDate)
  }));
}

function getCurrentSeason(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  
  if (month >= 1 && month <= 3) return `Q1-${year}`;
  if (month >= 4 && month <= 6) return `Q2-${year}`;
  if (month >= 7 && month <= 9) return `Q3-${year}`;
  return `Q4-${year}`;
}

// Function to apply team-based result correction
// Teams ending with ' T' or ' C' are considered on the same team
function applyTeamBasedResults(csvData: PlayerStatRow[]): PlayerStatRow[] {
  // Create a map to track team base names and their results
  const teamResults = new Map<string, 'Win' | 'Loss'>();
  
  // First pass: identify team base names and their results
  csvData.forEach(row => {
    const teamBase = getTeamBaseName(row.Team);
    if (teamBase && row.Result) {
      // If we already have a result for this team base, check for consistency
      const existingResult = teamResults.get(teamBase);
      if (!existingResult) {
        teamResults.set(teamBase, row.Result);
      } else if (existingResult !== row.Result) {
        // Inconsistent results - use the most recent one (Win takes priority)
        if (row.Result === 'Win') {
          teamResults.set(teamBase, 'Win');
        }
      }
    }
  });
  
  // Second pass: apply consistent results to all team members
  return csvData.map(row => {
    const teamBase = getTeamBaseName(row.Team);
    if (teamBase && teamResults.has(teamBase)) {
      return {
        ...row,
        Result: teamResults.get(teamBase)!
      };
    }
    return row;
  });
}

// Extract team base name from team string
// Examples: "AP T" -> "AP", "Apex C" -> "Apex", "BDS T" -> "BDS"
function getTeamBaseName(teamName: string): string | null {
  const team = teamName.trim();
  
  // Check if team ends with " T" or " C"
  if (team.endsWith(' T') || team.endsWith(' C')) {
    return team.slice(0, -2).trim();
  }
  
  return null;
}

export function validatePlayerStats(stats: ProcessedPlayerStat[]): string[] {
  const errors: string[] = [];
  
  stats.forEach((stat, index) => {
    const rowNum = index + 1;
    
    if (!stat.player_name?.trim()) {
      errors.push(`Row ${rowNum}: Player name is required`);
    }
    
    if (!stat.team?.trim()) {
      errors.push(`Row ${rowNum}: Team is required`);
    }
    
    if (stat.kills < 0 || stat.deaths < 0) {
      errors.push(`Row ${rowNum}: Kills and deaths cannot be negative`);
    }
    
    if (!['Win', 'Loss'].includes(stat.result)) {
      errors.push(`Row ${rowNum}: Result must be 'Win' or 'Loss'`);
    }
    
    if (!['offense', 'defense', 'N/A'].includes(stat.side)) {
      errors.push(`Row ${rowNum}: Side must be 'offense', 'defense', or 'N/A'`);
    }
    
    if (stat.game_length_minutes <= 0) {
      errors.push(`Row ${rowNum}: Game length must be positive`);
    }
  });
  
  return errors;
}