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
    public string className;
    public bool isOffense;
    public string weapon;
}

public class WebIntegration
{
    private static readonly HttpClient httpClient = new HttpClient();
    private const string API_ENDPOINT = "http://localhost:3000/api/game-data"; // Change to your actual domain in production
    
    public static async Task SendGameDataToWebsite(Arena arena)
    {
        try
        {
            // Determine game type based on arena name
            string gameType = DetermineGameType(arena._name);
            
            // Get all players in the arena
            var players = arena.Players.ToList();
            var gameDataPlayers = new List<PlayerData>();
            
            // Determine which team is offense/defense for OvD games
            bool titanIsOffense = false;
            if (gameType == "OvD")
            {
                titanIsOffense = DetermineOffenseTeam(players, arena);
            }
            
            // Process each player
            foreach (Player player in players)
            {
                string team = DeterminePlayerTeam(player);
                string className = GetPrimarySkillName(player);
                bool isOffense = DetermineIsOffense(team, titanIsOffense, gameType);
                string weapon = GetSpecialWeapon(player);
                
                gameDataPlayers.Add(new PlayerData
                {
                    alias = player._alias,
                    team = team,
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
            var content = new StringContent(jsonData, Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(API_ENDPOINT, content);
            
            if (response.IsSuccessStatusCode)
            {
                Log.write("Game data sent successfully to website");
            }
            else
            {
                Log.write(String.Format("Failed to send game data: {0}", response.StatusCode));
            }
        }
        catch (Exception ex)
        {
            Log.write(String.Format("Error sending game data: {0}", ex.Message));
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
    
    private static string DeterminePlayerTeam(Player player)
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
        // Find the team with a Squad Leader - that team is offense
        foreach (Player player in players)
        {
            string className = GetPrimarySkillName(player);
            if (className == "Squad Leader")
            {
                return player._team._name.Contains(" T"); // Return true if Titan has Squad Leader
            }
        }
        return false; // Default to Titan = defense if no Squad Leader found
    }
    
    private static bool DetermineIsOffense(string team, bool titanIsOffense, string gameType)
    {
        if (gameType != "OvD")
            return true; // For non-OvD games, everyone can be considered "offense"
            
        if (team == "Titan")
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
        // Try to get the current map/base name
        // Adapt this based on how your arena stores map information
        
        if (arena._server != null && arena._server._config != null)
        {
            return arena._server._config.name ?? "Unknown Base";
        }
        
        return "Unknown Base";
    }
    
    public static string GetPrimarySkillName(Player player)
    {
        // Implement based on your actual skill system
        // This is adapted for typical Infantry Online skill detection
        
        if (player._skills == null || player._skills.Count == 0)
            return "Infantry";
            
        // Find the skill with the highest level or primary skill
        var primarySkill = player._skills.Values.OrderByDescending(s => s.Level).FirstOrDefault();
        
        if (primarySkill != null)
        {
            switch (primarySkill.SkillId)
            {
                case 1: return "Infantry";
                case 2: return "Heavy Weapons"; 
                case 3: return "Jump Trooper";
                case 4: return "Infiltrator";
                case 5: return "Squad Leader";
                case 6: return "Field Medic";
                case 7: return "Combat Engineer";
                default: return "Infantry";
            }
        }
        
        return "Infantry";
    }
    
    private static string BuildJsonString(string arenaName, string gameType, string baseUsed, List<PlayerData> players)
    {
        var json = new StringBuilder();
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