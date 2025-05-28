using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

// This script should be integrated into your Infantry Online server-side scripting
// Replace the Arena, Player, and other classes with your actual game objects

public class PlayerData
{
    public string alias;
    public string team;
    public string className;
    public bool isOffense;
    public string weapon;
}

public class GameDataSender
{
    private static readonly HttpClient httpClient = new HttpClient();
    private const string API_ENDPOINT = "http://localhost:3000/api/game-data"; // Change to your actual domain in production
    
    public static async Task SendGameData(Arena arena)
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
                titanIsOffense = DetermineOffenseTeam(players);
            }
            
            // Process each player
            foreach (Player player in players)
            {
                string team = DeterminePlayerTeam(player);
                string className = GetPrimarySkillName(player);
                bool isOffense = DetermineIsOffense(team, titanIsOffense, gameType);
                string weapon = GetSpecialWeapon(player);
                
                // Store player data as a simple object
                gameDataPlayers.Add(new PlayerData
                {
                    alias = player._alias,
                    team = team,
                    className = className,
                    isOffense = isOffense,
                    weapon = weapon
                });
            }
            
            // Get base information (you'll need to implement this based on your game)
            string baseUsed = GetCurrentBase(arena); // Implement this method
            
            // Create the data payload
            var gameData = new
            {
                arenaName = arena._name,
                gameType = gameType,
                baseUsed = baseUsed,
                players = gameDataPlayers
            };
            
            // Manually construct JSON string (no external libraries needed)
            string jsonData = BuildJsonString(arena._name, gameType, baseUsed, gameDataPlayers);
            
            // Send to API
            var content = new StringContent(jsonData, Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(API_ENDPOINT, content);
            
            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine("Game data sent successfully to website");
            }
            else
            {
                Console.WriteLine($"Failed to send game data: {response.StatusCode}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error sending game data: {ex.Message}");
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
    
    private static bool DetermineOffenseTeam(List<Player> players)
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
        // This is a placeholder - implement based on your weapon detection system
        // You might need to check player inventory, current weapon, or other game state
        
        // Example implementation (replace with your actual weapon detection):
        /*
        if (player.HasWeapon("CAW") || player.CurrentWeapon == "CAW")
            return "CAW";
        else if (player.HasWeapon("SG") || player.CurrentWeapon == "SG")
            return "SG";
        */
        
        return null; // Return null if no special weapon
    }
    
    private static string GetCurrentBase(Arena arena)
    {
        // Implement this based on how your game tracks the current base/map
        // This might be stored in arena properties, map name, or other game state
        
        // Example implementation:
        // return arena.CurrentMap?.Name ?? "Unknown Base";
        
        return "Sample Base"; // Placeholder - replace with actual implementation
    }
    
    // You'll need to implement this method based on your skill system
    public static string GetPrimarySkillName(Player player)
    {
        // This is a placeholder - replace with your actual skill detection logic
        // Example implementation might look like:
        /*
        var primarySkill = player.GetPrimarySkill();
        switch (primarySkill.ID)
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
        */
        
        return "Infantry"; // Placeholder - replace with actual implementation
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

// Usage example - call this method when you want to update the website
// This could be called on game events like: player join/leave, round start, etc.
/*
public static void OnGameStateChanged(Arena arena)
{
    // Send updated game data to website
    _ = GameDataSender.SendGameData(arena);
}
*/ 