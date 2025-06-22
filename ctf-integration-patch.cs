// CTF.cs Integration Patch
// Apply these specific changes to your existing CTF.cs file

// ===============================================
// CHANGE 1: Add these new methods after line 8940 (near other private methods)
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
// CHANGE 2: Modify the UpdateSkillPlayTime method (around line 9063)
// ===============================================

// REPLACE the existing UpdateSkillPlayTime method with this enhanced version:
private void UpdateSkillPlayTime(Player player, SkillInfo newSkill = null)
{
    // Don't update play time for spectators (either on spec team or in spec vehicle)
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

        // Send message showing total accumulated play time in seconds
        double totalSeconds = Math.Min(playerClassPlayTimes[player][currentSkill] / 1000.0,
            (currentTick - arena._tickGameStarted) / 1000.0); // Cap at game duration
    }

    // Reset the last switch time for the new skill
    playerLastClassSwitch[player] = currentTick;

    // Initialize play time for new skill if provided and not exists
    if (newSkill != null && !playerClassPlayTimes[player].ContainsKey(newSkill.Name))
    {
        playerClassPlayTimes[player][newSkill.Name] = 0;
    }
}

// ===============================================
// CHANGE 3: Modify playerJoinGame method (around line 12550)
// ===============================================

// ADD this line after the existing killStreaks initialization in playerJoinGame:
[Scripts.Event("Player.JoinGame")]
public bool playerJoinGame(Player player)
{
    if (!arena._name.Contains("Arena 1"))
        deprizeMinPremades(player, false, false); // Remove items regardless of skill
    
    //Add them to the list if its not in it
    if (!killStreaks.ContainsKey(player._alias))
    {
        PlayerStreak temp = new PlayerStreak();
        temp.lastKillerCount = 0;
        temp.lastUsedWeap = null;
        temp.lastUsedWepKillCount = 0;
        temp.lastUsedWepTick = -1;
        temp.deathCount = 0;
        temp.killCount = 0;
        killStreaks.Add(player._alias, temp);
    }

    // ADD THIS LINE to fix class tracking for manually unspecced players
    InitializePlayerClassTracking(player);

    // Rest of existing playerJoinGame code continues...
}

// ===============================================
// CHANGE 4: Modify the stat processing logic (around line 10157)
// ===============================================

// REPLACE lines 10157-10170 with this:
string mainClass = GetMostPlayedClass(p);
if (mainClass == "Dueler") continue;

// ===============================================
// CHANGE 5: Add turret damage validation (around line 10130)
// ===============================================

// ADD this check at the beginning of your stat processing section:
// Check if this game had any meaningful turret damage
bool hasSignificantTurretDamage = playerDamageStats.Values.Any(damage => damage > 0);

if (!hasSignificantTurretDamage)
{
    arena.sendArenaMessage("&Game stats not recorded - no turret damage detected (likely reset without gameplay)");
    return; // Don't process stats for games without turret damage
}

// ===============================================
// CHANGE 6: Enhance player filtering in stat processing
// ===============================================

// REPLACE the existing player loop section with enhanced filtering:
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

    // Rest of existing stat processing code continues...
}

// ===============================================
// CHANGE 7: Add success message after stats are sent
// ===============================================

// REPLACE the existing success handling with:
if (playerStatsForWeb.Count > 0)
{
    try
    {
        string gameId = string.Format("{0}_{1}", arena._name, DateTime.UtcNow.ToString("yyyyMMdd_HHmmss"));
        Task.Run(async () => {
            try
            {
                await CTFGameType.PlayerStatsIntegration.SendPlayerStatsToWebsite(playerStatsForWeb, gameId);
            }
            catch (Exception asyncEx)
            {
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

// ===============================================
// CHANGE 8: Add class tracking to pollSkillCheck (around line 7925)
// ===============================================

// ADD this line in the pollSkillCheck method where players are initialized:
if (!player.IsSpectator && !playerClassPlayTimes.ContainsKey(player))
{
    InitializePlayerClassTracking(player); // ADD THIS LINE
    playerClassPlayTimes[player] = new Dictionary<string, int>();
    playerLastClassSwitch[player] = Environment.TickCount;
    playerClassSwaps[player] = 0;
}

// ===============================================
// SUMMARY OF CHANGES
// ===============================================

/*
These changes will fix:

1. **Class Detection Issues**:
   - Players manually unspecced via mod commands will have proper class tracking
   - The system will use actual play time data instead of just current class
   - Minimum 5-second play time threshold prevents brief class switches from being recorded as main class

2. **Turret Damage Validation**:
   - Only games with turret damage > 0 will have stats recorded
   - This prevents stats from games that were reset without actual gameplay
   - Clear messages inform players when stats are/aren't recorded

3. **Better Player Filtering**:
   - Players must have either turret damage OR significant play time to be included
   - This prevents "ghost" players who briefly joined from cluttering stats

4. **Improved Initialization**:
   - Class tracking is initialized whenever players join teams
   - Handles both normal joins and mod-commanded unspecs
   - Provides fallback to current class if no play time data exists

Apply these changes to your CTF.cs file to resolve the class detection and stat recording issues.
*/ 