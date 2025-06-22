// CTF Class Tracking and Stat Validation Fixes
// This file contains the improved logic to fix class detection and stat recording issues

// ===============================================
// 1. IMPROVED CLASS TRACKING INITIALIZATION
// ===============================================

/// <summary>
/// Enhanced method to initialize class tracking for players who are manually unspecced
/// This should be called whenever a player joins a team (including via mod commands)
/// </summary>
private void InitializePlayerClassTracking(Player player)
{
    if (player == null || player.IsSpectator) return;
    
    // Skip if already initialized and player has existing class time data
    if (playerClassPlayTimes.ContainsKey(player) && playerClassPlayTimes[player].Count > 0)
        return;

    // Initialize tracking dictionaries
    if (!playerClassPlayTimes.ContainsKey(player))
    {
        playerClassPlayTimes[player] = new Dictionary<string, int>();
    }
    
    if (!playerLastClassSwitch.ContainsKey(player))
    {
        playerLastClassSwitch[player] = Environment.TickCount;
    }
    
    if (!playerClassSwaps.ContainsKey(player))
    {
        playerClassSwaps[player] = 0;
    }

    // Get the player's current class and initialize it with some time
    string currentClass = GetPrimarySkillName(player);
    if (currentClass != "Unknown" && !playerClassPlayTimes[player].ContainsKey(currentClass))
    {
        // Give them a small initial time (1 second) so they have a tracked class
        playerClassPlayTimes[player][currentClass] = 1000; // 1 second in milliseconds
    }

    // Debug message for testing
    // arena.sendArenaMessage(string.Format("Initialized class tracking for {0} as {1}", player._alias, currentClass));
}

/// <summary>
/// Enhanced method to determine the most played class with better fallback logic
/// </summary>
private string GetMostPlayedClass(Player player)
{
    if (player == null) return "Unknown";

    string mostPlayedClass = "Unknown";
    
    // First priority: Use playerClassPlayTimes if available
    if (playerClassPlayTimes.ContainsKey(player))
    {
        var playTimes = new Dictionary<string, int>(playerClassPlayTimes[player]);
        
        // Add current class time if player has one
        string currentClass = GetPrimarySkillName(player);
        if (currentClass != "Unknown")
        {
            int currentTick = Environment.TickCount;
            int sessionTime = Math.Max(0, currentTick - (playerLastClassSwitch.ContainsKey(player) ? playerLastClassSwitch[player] : currentTick));
            
            if (!playTimes.ContainsKey(currentClass))
                playTimes[currentClass] = 0;
            playTimes[currentClass] += sessionTime;
        }
        
        // Get the class with the most play time
        if (playTimes.Any())
        {
            var mostPlayed = playTimes.OrderByDescending(x => x.Value).First();
            // Only use this if they played it for at least 5 seconds
            if (mostPlayed.Value >= 5000) // 5 seconds minimum
            {
                mostPlayedClass = mostPlayed.Key;
            }
        }
    }
    
    // Fallback to current class if no significant play time recorded
    if (mostPlayedClass == "Unknown")
    {
        mostPlayedClass = GetPrimarySkillName(player);
    }
    
    return mostPlayedClass;
}

// ===============================================
// 2. ENHANCED PLAYER JOIN/UNSPEC HANDLING
// ===============================================

/// <summary>
/// This should be added to the playerJoinGame method to ensure proper initialization
/// </summary>
private void EnhancedPlayerJoinGame(Player player)
{
    // Initialize class tracking when player joins game
    InitializePlayerClassTracking(player);
    
    // Force an update of skill play time to capture their initial class
    UpdateSkillPlayTime(player);
}

/// <summary>
/// Enhanced version of UpdateSkillPlayTime with better initialization handling
/// </summary>
private void EnhancedUpdateSkillPlayTime(Player player, SkillInfo newSkill = null)
{
    // Don't update play time for spectators
    if (player._team.IsSpec || (player._baseVehicle != null && player._baseVehicle._type.Name.Contains("Spectator")))
        return;

    // Ensure player is initialized (handles manual unspec cases)
    InitializePlayerClassTracking(player);

    // Get current time
    int currentTick = Environment.TickCount;

    // Get current skill name if it exists
    string currentSkill = player._skills.Count > 0 ? player._skills.First().Value.skill.Name : null;

    if (currentSkill != null)
    {
        // Calculate time played in current session
        int startTime = playerLastClassSwitch.ContainsKey(player) ? playerLastClassSwitch[player] : currentTick;
        int sessionPlayTime = Math.Max(0, currentTick - startTime);

        // Add session time to accumulated time for current skill
        if (!playerClassPlayTimes[player].ContainsKey(currentSkill))
        {
            playerClassPlayTimes[player][currentSkill] = 0;
        }
        playerClassPlayTimes[player][currentSkill] += sessionPlayTime;
    }

    // Reset the last switch time for the new skill
    playerLastClassSwitch[player] = currentTick;

    // Initialize play time for new skill if provided
    if (newSkill != null && !playerClassPlayTimes[player].ContainsKey(newSkill.Name))
    {
        playerClassPlayTimes[player][newSkill.Name] = 0;
    }
}

// ===============================================
// 3. TURRET DAMAGE VALIDATION FOR STAT RECORDING
// ===============================================

/// <summary>
/// Enhanced stat processing with turret damage validation
/// This replaces the existing stat processing logic in the game end handling
/// </summary>
private void ProcessGameStatsWithValidation()
{
    try 
    {
        // Check if this game had any meaningful turret damage
        bool hasSignificantTurretDamage = playerDamageStats.Values.Any(damage => damage > 0);
        
        if (!hasSignificantTurretDamage)
        {
            arena.sendArenaMessage("&Game stats not recorded - no turret damage detected (likely reset without gameplay)");
            return; // Don't process stats for games without turret damage
        }

        // Initialize the list for web stats
        List<CTFGameType.PlayerStatData> playerStatsForWeb = new List<CTFGameType.PlayerStatData>();
        
        // Determine game mode and other necessary variables
        string gameMode = "CTF"; // Default
        string baseUsed = "Unknown";
        
        // Your existing game mode detection logic here...
        // (This would include the OvD/Mix/CTF detection code from the original)
        
        var players = arena.Players.ToList();
        foreach (Player p in players)
        {
            // Guard clauses to skip invalid players
            if (p == null || p.StatsLastGame == null || p._team == null) continue;
            if (!p._team._name.Contains(" T") && !p._team._name.Contains(" C")) continue;

            // Use the enhanced most played class detection
            string mainClass = GetMostPlayedClass(p);
            
            // Skip players with Dueler class
            if (mainClass == "Dueler") continue;

            // Only include players who have some recorded play time or turret damage
            int turretDamage = playerDamageStats.ContainsKey(p._id) ? playerDamageStats[p._id] : 0;
            bool hasPlayTime = playerClassPlayTimes.ContainsKey(p) && playerClassPlayTimes[p].Values.Sum() > 5000; // At least 5 seconds
            
            // Skip players who didn't really participate (no turret damage and minimal play time)
            if (turretDamage == 0 && !hasPlayTime)
            {
                continue;
            }

            // Calculate other stats (accuracy, resources, etc.)
            double gameLengthMinutes = (arena._tickGameEnded - arena._tickGameStarted) / (1000.0 * 60.0);
            string result = "Loss";
            string side = "N/A";
            
            // Your existing result/side determination logic here...
            
            int classSwaps = playerClassSwaps.ContainsKey(p) ? playerClassSwaps[p] : 0;

            // Calculate Accuracy
            double accuracy = 0.0;
            if (_lastgamePlayerWeaponStats != null && _lastgamePlayerWeaponStats.ContainsKey(p))
            {
                var weaponAccuracies = _lastgamePlayerWeaponStats[p]
                    .Where(w => w.Value != null && w.Value.ShotsFired > 0)
                    .Select(w => (double)w.Value.ShotsLanded / w.Value.ShotsFired);
                
                if (weaponAccuracies.Any())
                {
                    accuracy = weaponAccuracies.Max();
                }
            }

            // Calculate resource stats
            double avgResourcePerDeath = 0.0;
            double avgExplosivePerDeath = 0.0;
            if (_averageItemsUsedPerDeath != null && _averageItemsUsedPerDeath.ContainsKey(p._alias))
            {
                var stats = _averageItemsUsedPerDeath[p._alias];
                avgResourcePerDeath = (stats.ContainsKey("RepCoil") ? stats["RepCoil"] : 0) +
                                     (stats.ContainsKey("RepCharge") ? stats["RepCharge"] : 0) +
                                     (stats.ContainsKey("Energizer") ? stats["Energizer"] : 0) +
                                     (stats.ContainsKey("Stim") ? stats["Stim"] : 0);
                                     
                avgExplosivePerDeath = (stats.ContainsKey("Frag") ? stats["Frag"] : 0) +
                                      (stats.ContainsKey("WP") ? stats["WP"] : 0);
            }

            // Get EBHits
            int ebHits = 0;
            if (_ebHitStats != null && _ebHitStats.ContainsKey(p))
            {
                ebHits = _ebHitStats[p];
            }

            // Add to web integration data
            playerStatsForWeb.Add(new CTFGameType.PlayerStatData
            {
                PlayerName = p._alias.Replace(",", ""),
                Team = p._team._name ?? "None",
                GameMode = gameMode,
                ArenaName = arena._name,
                BaseUsed = baseUsed,
                Side = side,
                Result = result,
                MainClass = mainClass,
                Kills = p.StatsLastGame.kills,
                Deaths = p.StatsLastGame.deaths,
                Captures = p.StatsLastGame.zonestat5,
                CarrierKills = p.StatsLastGame.zonestat7,
                CarryTimeSeconds = p.StatsLastGame.zonestat3,
                ClassSwaps = classSwaps,
                TurretDamage = turretDamage,
                EBHits = ebHits,
                Accuracy = accuracy,
                AvgResourceUnusedPerDeath = avgResourcePerDeath,
                AvgExplosiveUnusedPerDeath = avgExplosivePerDeath,
                GameLengthMinutes = gameLengthMinutes
            });
        }

        // Send player stats to website
        if (playerStatsForWeb.Count > 0)
        {
            try
            {
                string gameId = string.Format("{0}_{1}", arena._name, DateTime.UtcNow.ToString("yyyyMMdd_HHmmss"));
                Task.Run(async () => {
                    try
                    {
                        await CTFGameType.PlayerStatsIntegration.SendPlayerStatsToWebsite(playerStatsForWeb, gameId);
                        // Success message could be sent here
                    }
                    catch (Exception asyncEx)
                    {
                        // Log the error appropriately
                        Console.WriteLine($"Error sending stats to website: {asyncEx.Message}");
                    }
                });
                
                arena.sendArenaMessage(string.Format("&Game stats recorded for {0} players with turret damage validation", playerStatsForWeb.Count));
            }
            catch (Exception ex)
            {
                arena.sendArenaMessage("&Error processing game stats: " + ex.Message);
            }
        }
        else
        {
            arena.sendArenaMessage("&No valid player stats to record (no turret damage or significant play time)");
        }
    }
    catch (Exception ex)
    {
        arena.sendArenaMessage("&Error in stat processing: " + ex.Message);
    }
}

// ===============================================
// 4. INTEGRATION POINTS
// ===============================================

/*
To integrate these fixes into your existing CTF.cs file:

1. Replace the existing UpdateSkillPlayTime method with EnhancedUpdateSkillPlayTime
2. Add InitializePlayerClassTracking calls to:
   - playerJoinGame method
   - Any mod commands that unspec players
   - playerEnter method
3. Replace the existing mainClass determination logic (lines 10157-10170) with:
   string mainClass = GetMostPlayedClass(p);
4. Replace the stat processing section with ProcessGameStatsWithValidation()
5. Consider adding a periodic class tracking update in your polling methods

Example integration in playerJoinGame:
```csharp
[Scripts.Event("Player.JoinGame")]
public bool playerJoinGame(Player player)
{
    // Existing code...
    
    // Add this line to fix class tracking for manually unspecced players
    InitializePlayerClassTracking(player);
    
    // Existing code continues...
    return true;
}
```

Example integration for mod commands that unspec players:
```csharp
// In any mod command that moves players to teams
private void UnspecPlayer(Player player, Team targetTeam)
{
    player.unspec(targetTeam);
    InitializePlayerClassTracking(player); // Add this line
}
```
*/ 