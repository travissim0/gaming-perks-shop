using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Text.RegularExpressions;
using System.Text.Json;

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

public class CustomPhrase
{
    public string player_alias { get; set; }
    public string phrase { get; set; }
    public DateTime expires_at { get; set; }
    public bool is_active { get; set; }
}

public class PhraseExplosionManager
{
    private static readonly HttpClient httpClient = new HttpClient();
    private static Dictionary<string, string> playerPhrases = new Dictionary<string, string>();
    private static DateTime lastCacheUpdate = DateTime.MinValue;
    private static readonly TimeSpan cacheExpiryTime = TimeSpan.FromMinutes(5); // Cache for 5 minutes
    
    // Your Supabase configuration
    private const string SUPABASE_URL = "https://nkinpmqnbcjaftqduujf.supabase.co"; // Replace with your Supabase URL
    private const string SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMjA0NzYsImV4cCI6MjA2MzY5NjQ3Nn0.83gXbk6MVOI341RBW7h_SXeSZcIIgI9BOBUX5e0ivv8"; // Replace with your anon key
    private const string PHRASES_API_ENDPOINT = SUPABASE_URL + "/rest/v1/rpc/get_player_phrases";
    
    public static async Task<string> GetPlayerPhrase(string playerAlias)
    {
        try
        {
            // Check if cache needs refreshing
            if (DateTime.Now - lastCacheUpdate > cacheExpiryTime)
            {
                await RefreshPhrasesCache();
            }
            
            // Return custom phrase if found, otherwise return default
            if (playerPhrases.ContainsKey(playerAlias.ToLower()))
            {
                return playerPhrases[playerAlias.ToLower()];
            }
            
            return "BLOOP"; // Default explosion text
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error getting player phrase for {0}: {1}", playerAlias, ex.Message));
            return "BLOOP"; // Fallback to default
        }
    }
    
    private static async Task RefreshPhrasesCache()
    {
        try
        {
            // Set headers for Supabase
            httpClient.DefaultRequestHeaders.Clear();
            httpClient.DefaultRequestHeaders.Add("apikey", SUPABASE_ANON_KEY);
            httpClient.DefaultRequestHeaders.Add("Authorization", String.Format("Bearer {0}", SUPABASE_ANON_KEY));
            
            var response = await httpClient.PostAsync(PHRASES_API_ENDPOINT, new StringContent("", Encoding.UTF8, "application/json"));
            
            if (response.IsSuccessStatusCode)
            {
                string jsonResponse = await response.Content.ReadAsStringAsync();
                var phrases = ParsePhrasesJson(jsonResponse);
                
                // Update cache
                playerPhrases.Clear();
                foreach (var phrase in phrases)
                {
                    if (phrase.is_active && (phrase.expires_at == DateTime.MinValue || phrase.expires_at > DateTime.Now))
                    {
                        playerPhrases[phrase.player_alias.ToLower()] = phrase.phrase;
                    }
                }
                
                lastCacheUpdate = DateTime.Now;
                Console.WriteLine(String.Format("Phrases cache refreshed: {0} active phrases loaded", playerPhrases.Count));
            }
            else
            {
                Console.WriteLine(String.Format("Failed to refresh phrases cache: {0}", response.StatusCode));
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error refreshing phrases cache: {0}", ex.Message));
        }
    }
    
    private static List<CustomPhrase> ParsePhrasesJson(string json)
    {
        var phrases = new List<CustomPhrase>();
        
        try
        {
            // Simple JSON parsing without external dependencies
            json = json.Trim();
            if (json.StartsWith("[") && json.EndsWith("]"))
            {
                json = json.Substring(1, json.Length - 2); // Remove array brackets
                
                var objects = SplitJsonObjects(json);
                foreach (var obj in objects)
                {
                    var phrase = ParseSinglePhrase(obj);
                    if (phrase != null)
                        phrases.Add(phrase);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error parsing phrases JSON: {0}", ex.Message));
        }
        
        return phrases;
    }
    
    private static List<string> SplitJsonObjects(string json)
    {
        var objects = new List<string>();
        int depth = 0;
        int start = 0;
        
        for (int i = 0; i < json.Length; i++)
        {
            if (json[i] == '{')
                depth++;
            else if (json[i] == '}')
            {
                depth--;
                if (depth == 0)
                {
                    objects.Add(json.Substring(start, i - start + 1));
                    start = i + 1;
                    // Skip comma and whitespace
                    while (start < json.Length && (json[start] == ',' || char.IsWhiteSpace(json[start])))
                        start++;
                    i = start - 1;
                }
            }
        }
        
        return objects;
    }
    
    private static CustomPhrase ParseSinglePhrase(string json)
    {
        try
        {
            var phrase = new CustomPhrase();
            
            // Extract fields using simple string parsing
            phrase.player_alias = ExtractJsonValue(json, "player_alias");
            phrase.phrase = ExtractJsonValue(json, "phrase");
            
            string expiresStr = ExtractJsonValue(json, "expires_at");
            if (!string.IsNullOrEmpty(expiresStr) && expiresStr != "null")
            {
                DateTime.TryParse(expiresStr, out phrase.expires_at);
            }
            
            string activeStr = ExtractJsonValue(json, "is_active");
            phrase.is_active = activeStr == "true";
            
            return phrase;
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error parsing single phrase: {0}", ex.Message));
            return null;
        }
    }
    
    private static string ExtractJsonValue(string json, string key)
    {
        string pattern = String.Format("\"{0}\"\\s*:\\s*", key);
        var match = Regex.Match(json, pattern);
        if (!match.Success) return "";
        
        int start = match.Index + match.Length;
        if (start >= json.Length) return "";
        
        // Handle string values (quoted)
        if (json[start] == '"')
        {
            start++; // Skip opening quote
            int end = json.IndexOf('"', start);
            if (end == -1) return "";
            return json.Substring(start, end - start);
        }
        
        // Handle other values (boolean, null, etc.)
        int valueEnd = json.IndexOfAny(new char[] { ',', '}' }, start);
        if (valueEnd == -1) valueEnd = json.Length;
        
        return json.Substring(start, valueEnd - start).Trim();
    }
    
    // Method to manually refresh cache (call this from admin commands if needed)
    public static async Task ForceRefreshPhrases()
    {
        await RefreshPhrasesCache();
    }
    
    // Method to get all cached phrases (for debugging)
    public static Dictionary<string, string> GetCachedPhrases()
    {
        return new Dictionary<string, string>(playerPhrases);
    }
}

// Extension method to create custom explosion text
public static class ExplosionHelper
{
    public static async Task CreateCustomExplosion(Player killerPlayer, Player victimPlayer, short posX, short posY)
    {
        try
        {
            // Get the killer's custom phrase
            string customPhrase = await PhraseExplosionManager.GetPlayerPhrase(killerPlayer._alias);
            
            // Create the explosion with custom text
            CreateTextExplosion(killerPlayer._arena, customPhrase, posX, posY, killerPlayer._team);
            
            // Optional: Log the explosion for debugging
            // Console.WriteLine(String.Format("{0} triggered explosion with phrase: {1}", killerPlayer._alias, customPhrase));
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error creating custom explosion: {0}", ex.Message));
            // Fallback to default explosion
            CreateTextExplosion(killerPlayer._arena, "BLOOP", posX, posY, killerPlayer._team);
        }
    }
    
    private static void CreateTextExplosion(Arena arena, string text, short x, short y, Team team)
    {
        // This method should match your existing explosion creation logic
        // Adapt this to your specific Infantry Online server implementation
        
        // Example implementation (you'll need to adapt this):
        /*
        Helpers.Player_RouteExplosion(
            arena.Players,
            724, // Explosion type ID - adjust as needed
            x, y,
            0, 0, // Velocity
            0     // Duration
        );
        
        // Create text overlay
        arena.sendArenaMessage(text, team._id);
        */
    }
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