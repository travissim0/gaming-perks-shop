using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Text.RegularExpressions;

// Add these classes and methods to your existing CTF.cs script
// This provides web integration functionality for your Infantry Online server

public class PlayerData
{
    public string alias;
    public string team;
    public string teamType; // "Titan" or "Collective" for logic
    public string className;
    public bool isOffense;
    public string weapon;
}

public class WebIntegration
{
    private static readonly HttpClient httpClient = new HttpClient();
    private const string API_ENDPOINT = "https://freeinf.org/api/game-data";
    
    public static async Task SendGameDataToWebsite(Arena arena)
    {
        try
        {
            // Determine game type based on arena name
            string gameType = DetermineGameType(arena._name);
            
            // Get all players in the arena
            var players = arena.Players.ToList();
            var gameDataPlayers = new List<PlayerData>();
            
            // Determine which team is offense/defense for all games
            bool titanIsOffense = DetermineOffenseTeam(players, arena);
            
            // Process each player
            foreach (Player player in players)
            {
                string actualTeamName = player._team._name; // Keep the actual team name like "WC C" or "PT T"
                string teamType = DeterminePlayerTeamType(player); // "Titan" or "Collective" for logic
                string className = player._baseVehicle._type.Name; // Get class name directly from vehicle type
                bool isOffense = DetermineIsOffense(teamType, titanIsOffense, gameType);
                string weapon = GetSpecialWeapon(player);
                
                gameDataPlayers.Add(new PlayerData
                {
                    alias = player._alias,
                    team = actualTeamName, // Use actual team name
                    teamType = teamType, // Add team type for logic
                    className = className,
                    isOffense = isOffense,
                    weapon = weapon
                });
            }
            
            // Get base information
            string baseUsed = GetCurrentBase(arena);
            
            // Manually construct JSON string (no external libraries needed)
            string jsonData = BuildJsonString(arena._name, gameType, baseUsed, gameDataPlayers);
            
            // Send to API
            var content = new StringContent(jsonData, System.Text.Encoding.UTF8, "application/json");
            
            var response = await httpClient.PostAsync(API_ENDPOINT, content);
            
            if (response.IsSuccessStatusCode)
            {
                //Console.WriteLine("Game data sent successfully to website");
            }
            else
            {
                //Console.WriteLine(String.Format("Failed to send game data: {0}", response.StatusCode));
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error sending game data: {0}", ex.Message));
        }
    }
    
    private static string DetermineGameType(string arenaName)
    {
        if (arenaName.Contains("OvD"))
            return "OvD";
        else if (arenaName.Contains("Arena 1"))
            return "Pub";
        else if (arenaName.Contains("Mix"))
            return "Mix";
        else if (arenaName.Contains("Duel"))
            return "Dueling";
        else if (arenaName.Contains("CTF"))
            return "CTF";
        else
            return "Unknown";
    }
    
    private static string DeterminePlayerTeamType(Player player)
    {
        if (player._team._name.Contains(" T"))
            return "Titan";
        else if (player._team._name.Contains(" C"))
            return "Collective";
        else
            return "Unknown";
    }
    
    private static bool DetermineOffenseTeam(List<Player> players, Arena arena)
    {
        // First, try to find the team with a Squad Leader - that team is offense
        foreach (Player player in players)
        {
            string className = player._baseVehicle._type.Name;
            if (className == "Squad Leader")
            {
                return player._team._name.Contains(" T"); // Return true if Titan has Squad Leader
            }
        }
        
        // If no Squad Leader found, use a consistent fallback based on team balance
        // Count players on each team type
        int titanCount = 0;
        int collectiveCount = 0;
        
        foreach (Player player in players)
        {
            if (player._team._name.Contains(" T"))
                titanCount++;
            else if (player._team._name.Contains(" C"))
                collectiveCount++;
        }
        
        // Make the larger team defense (more common in OvD), smaller team offense
        // If equal, default to Titan = offense
        if (titanCount > collectiveCount)
            return false; // Titan = defense (larger team)
        else
            return true;  // Titan = offense (smaller or equal team)
    }
    
    private static bool DetermineIsOffense(string teamType, bool titanIsOffense, string gameType)
    {
        // For OvD games, use the Squad Leader logic
        if (gameType == "OvD")
        {
            if (teamType == "Titan")
                return titanIsOffense;
            else
                return !titanIsOffense;
        }
        
        // For CTF games, assume teams alternate offense/defense
        if (gameType == "CTF")
        {
            if (teamType == "Titan")
                return titanIsOffense;
            else
                return !titanIsOffense;
        }
        
        // For other game types (Pub, Mix, Duel, Unknown), still try to separate teams
        // Don't default everyone to offense - use the same logic
        if (teamType == "Titan")
            return titanIsOffense;
        else
            return !titanIsOffense;
    }
    
    private static string GetSpecialWeapon(Player player)
    {
        // Check for special weapons based on player's current equipment
        // You may need to adapt this based on your specific weapon detection system
        
        if (player._baseVehicle != null && player._baseVehicle._type != null)
        {
            string vehicleType = player._baseVehicle._type.Name;
            if (vehicleType.Contains("CAW"))
                return "CAW";
            else if (vehicleType.Contains("SG"))
                return "SG";
        }
        
        // Alternative: Check player's inventory or equipped items
        // You may need to implement this based on your specific system
        
        return null; // Return null if no special weapon
    }
    
    private static string GetCurrentBase(Arena arena)
    {
        // Try to get the current map/base name from arena configuration
        try
        {
            // Check if arena has a map or zone configuration
            if (arena._info != null && !string.IsNullOrEmpty(arena._info.name))
            {
                return arena._info.name;
            }
            
            // Fallback to arena name if no specific base info
            if (!string.IsNullOrEmpty(arena._name))
            {
                return arena._name;
            }
            
            return "Unknown Base";
        }
        catch (Exception)
        {
            return "Unknown Base";
        }
    }
    
    private static string BuildJsonString(string arenaName, string gameType, string baseUsed, List<PlayerData> players)
    {
        var json = new System.Text.StringBuilder();
        json.Append("{");
        
        // Add basic properties
        json.AppendFormat("\"arenaName\":\"{0}\",", EscapeJsonString(arenaName));
        json.AppendFormat("\"gameType\":\"{0}\",", EscapeJsonString(gameType));
        json.AppendFormat("\"baseUsed\":\"{0}\",", EscapeJsonString(baseUsed));
        
        // Add players array
        json.Append("\"players\":[");
        
        for (int i = 0; i < players.Count; i++)
        {
            var player = players[i];
            json.Append("{");
            json.AppendFormat("\"alias\":\"{0}\",", EscapeJsonString(player.alias));
            json.AppendFormat("\"team\":\"{0}\",", EscapeJsonString(player.team));
            json.AppendFormat("\"teamType\":\"{0}\",", EscapeJsonString(player.teamType));
            json.AppendFormat("\"class\":\"{0}\",", EscapeJsonString(player.className));
            json.AppendFormat("\"isOffense\":{0},", player.isOffense.ToString().ToLower());
            
            if (string.IsNullOrEmpty(player.weapon))
            {
                json.Append("\"weapon\":null");
            }
            else
            {
                json.AppendFormat("\"weapon\":\"{0}\"", EscapeJsonString(player.weapon));
            }
            
            json.Append("}");
            
            if (i < players.Count - 1)
            {
                json.Append(",");
            }
        }
        
        json.Append("]");
        json.Append("}");
        
        return json.ToString();
    }
    
    private static string EscapeJsonString(string input)
    {
        if (string.IsNullOrEmpty(input))
            return "";
            
        return input.Replace("\\", "\\\\")
                   .Replace("\"", "\\\"")
                   .Replace("\n", "\\n")
                   .Replace("\r", "\\r")
                   .Replace("\t", "\\t");
    }
}

// INTEGRATION INSTRUCTIONS:
// 
// 1. Add the above classes and methods to your existing CTF.cs file
// 
// 2. In your CTF class, add calls to send data at appropriate times:
//
// Example integration points in your CTF class:
/*
public override void playerEnter(Player player)
{
    // Your existing playerEnter code...
    base.playerEnter(player);
    
    // Send updated game data to website
    _ = WebIntegration.SendGameDataToWebsite(_arena);
}

public override void playerLeave(Player player)
{
    // Your existing playerLeave code...
    base.playerLeave(player);
    
    // Send updated game data to website  
    _ = WebIntegration.SendGameDataToWebsite(_arena);
}

public override bool gameStart()
{
    // Your existing gameStart code...
    bool result = base.gameStart();
    
    // Send updated game data to website
    _ = WebIntegration.SendGameDataToWebsite(_arena);
    
    return result;
}

public override bool gameEnd()
{
    // Your existing gameEnd code...
    bool result = base.gameEnd();
    
    // Send updated game data to website
    _ = WebIntegration.SendGameDataToWebsite(_arena);
    
    return result;
}
*/ 