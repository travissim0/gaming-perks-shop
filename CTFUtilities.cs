using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Linq;
using System.Text.RegularExpressions;
using System.Runtime.CompilerServices;
using Microsoft.CSharp;

using InfServer.Game;
using InfServer.Scripting;
using InfServer.Protocol;
using InfServer.Logic;

using Assets;

namespace CTFGameType
{
    public class PlayerData
    {
        public string alias;
        public string team;
        public string teamType;
        public string className;
        public bool isOffense;
        public string weapon;
    }

    public class CustomPhrase
    {
        public string in_game_alias { get; set; }  // Changed from player_alias to match the working function
        public string custom_phrase { get; set; }  // Changed from phrase to match the working function
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
        private const string SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4"; // Service role key
        private const string PHRASES_API_ENDPOINT = SUPABASE_URL + "/rest/v1/rpc/get_simple_player_phrases";
        
        public static async Task<string> GetPlayerPhrase(string playerAlias)
        {
            try
            {
                // Check if cache needs refreshing
                if (DateTime.Now - lastCacheUpdate > cacheExpiryTime)
                {
                    await RefreshPhrasesCache();
                }
                
                // Return custom phrase if found, otherwise return null
                if (playerPhrases.ContainsKey(playerAlias.ToLower()))
                {
                    return playerPhrases[playerAlias.ToLower()];
                }
                
                return null; // No phrase found
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error getting player phrase for {0}: {1}", playerAlias, ex.Message));
                return null; // Return null on error
            }
        }
        private static async Task RefreshPhrasesCache()
        {
            try
            {
                // Create a new HttpClient for each request to avoid connection issues
                using (var handler = new HttpClientHandler())
                {
                    // Configure SSL settings for Supabase - match the TestConnection method
                    handler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                    handler.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;
                    
                    using (var client = new HttpClient(handler))
                    {
                        client.Timeout = TimeSpan.FromSeconds(30);
                        
                        // Set headers exactly like the working JavaScript version
                        client.DefaultRequestHeaders.Add("User-Agent", "CTF-Game/1.0");
                        client.DefaultRequestHeaders.Add("apikey", SUPABASE_SERVICE_ROLE_KEY);
                        client.DefaultRequestHeaders.Add("Authorization", String.Format("Bearer {0}", SUPABASE_SERVICE_ROLE_KEY));
                        
                        // Use empty JSON object as request body (matching JavaScript)
                        var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
                        
                        Console.WriteLine(String.Format("Attempting to connect to: {0}", PHRASES_API_ENDPOINT));
                        
                        var response = await client.PostAsync(PHRASES_API_ENDPOINT, content);
                        
                        Console.WriteLine(String.Format("Response status: {0}", response.StatusCode));
                        
                        if (response.IsSuccessStatusCode)
                        {
                            string jsonResponse = await response.Content.ReadAsStringAsync();
                            Console.WriteLine(String.Format("Response length: {0} characters", jsonResponse.Length));
                            
                            // Add some debug output to see what we're getting
                            if (jsonResponse.Length < 500) // Only log short responses
                            {
                                Console.WriteLine(String.Format("Response content: {0}", jsonResponse));
                            }
                            
                            var phrases = ParsePhrasesJson(jsonResponse);
                            
                            // Update cache
                            playerPhrases.Clear();
                            foreach (var phrase in phrases)
                            {
                                // Since we're using get_simple_player_phrases, all returned phrases are active
                                if (!String.IsNullOrEmpty(phrase.in_game_alias) && !String.IsNullOrEmpty(phrase.custom_phrase))
                                {
                                    playerPhrases[phrase.in_game_alias.ToLower()] = phrase.custom_phrase;
                                }
                            }
                            
                            lastCacheUpdate = DateTime.Now;
                            Console.WriteLine(String.Format("Phrases cache refreshed: {0} active phrases loaded", playerPhrases.Count));
                            
                            // Log the loaded phrases for debugging
                            foreach (var kvp in playerPhrases)
                            {
                                Console.WriteLine(String.Format("Loaded phrase: {0} -> {1}", kvp.Key, kvp.Value));
                            }
                        }
                        else
                        {
                            string errorContent = await response.Content.ReadAsStringAsync();
                            Console.WriteLine(String.Format("HTTP Error {0}: {1}", response.StatusCode, errorContent));
                        }
                    }
                }
            }
            catch (HttpRequestException httpEx)
            {
                Console.WriteLine(String.Format("HTTP Request Error: {0}", httpEx.Message));
                if (httpEx.InnerException != null)
                {
                    Console.WriteLine(String.Format("Inner exception: {0}", httpEx.InnerException.Message));
                }
            }
            catch (TaskCanceledException tcEx)
            {
                if (tcEx.CancellationToken.IsCancellationRequested)
                {
                    Console.WriteLine("Request was cancelled (likely due to timeout)");
                }
                else
                {
                    Console.WriteLine(String.Format("Request timed out: {0}", tcEx.Message));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error refreshing phrases cache: {0}", ex.Message));
                if (ex.InnerException != null)
                {
                    Console.WriteLine(String.Format("Inner exception: {0}", ex.InnerException.Message));
                }
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
                
                // Extract fields using simple string parsing - updated field names
                phrase.in_game_alias = ExtractJsonValue(json, "in_game_alias");
                phrase.custom_phrase = ExtractJsonValue(json, "custom_phrase");
                
                // For the simple function, we assume active phrases
                phrase.is_active = true;
                phrase.expires_at = DateTime.MaxValue; // No expiration from simple function
                
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
        
        // Method to test basic connectivity to Supabase
        public static async Task<bool> TestConnection(string alias)
        {
            try
            {
                //Console.WriteLine("Testing connection to Supabase...");
                
                using (var handler = new HttpClientHandler())
                {
                    // Configure SSL settings properly
                    handler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                    handler.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;
                    
                    using (var client = new HttpClient(handler))
                    {
                        client.Timeout = TimeSpan.FromSeconds(30); // Increased timeout
                        
                        // Use the same headers as the working RefreshPhrasesCache method
                        client.DefaultRequestHeaders.Add("User-Agent", "CTF-Game/1.0");
                        client.DefaultRequestHeaders.Add("apikey", SUPABASE_SERVICE_ROLE_KEY);
                        client.DefaultRequestHeaders.Add("Authorization", String.Format("Bearer {0}", SUPABASE_SERVICE_ROLE_KEY));
                        
                        // Test the actual RPC endpoint that we use, not the base URL
                        var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
                        
                        //Console.WriteLine(String.Format("Testing RPC endpoint: {0}", PHRASES_API_ENDPOINT));
                        
                        var response = await client.PostAsync(PHRASES_API_ENDPOINT, content);
                        
                        //Console.WriteLine(String.Format("RPC test - Status: {0}", response.StatusCode));
                        
                        if (response.IsSuccessStatusCode)
                        {
                            string responseContent = await response.Content.ReadAsStringAsync();
                            //Console.WriteLine(String.Format("RPC test successful! Response length: {0} characters", responseContent.Length));
                            //responseContent should contain alias and the associated custom_phrase
                            string extractedAlias = ExtractJsonValue(responseContent, "in_game_alias");
                            string custom_phrase = ExtractJsonValue(responseContent, "custom_phrase");
                            //Console.WriteLine(String.Format("Player alias: {0}", extractedAlias));
                            //Console.WriteLine(String.Format("Player custom_phrase: {0}", custom_phrase));
                            return true;
                        }
                        else
                        {
                            string errorContent = await response.Content.ReadAsStringAsync();
                            Console.WriteLine(String.Format("RPC test failed - HTTP {0}: {1}", response.StatusCode, errorContent));
                            return false;
                        }
                    }
                }
            }
            catch (HttpRequestException httpEx)
            {
                Console.WriteLine(String.Format("HTTP Request Error during test: {0}", httpEx.Message));
                if (httpEx.InnerException != null)
                {
                    Console.WriteLine(String.Format("Inner exception: {0}", httpEx.InnerException.Message));
                }
                return false;
            }
            catch (TaskCanceledException tcEx)
            {
                if (tcEx.CancellationToken.IsCancellationRequested)
                {
                    Console.WriteLine("Connection test was cancelled");
                }
                else
                {
                    Console.WriteLine(String.Format("Connection test timed out: {0}", tcEx.Message));
                }
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Connection test failed: {0}", ex.Message));
                if (ex.InnerException != null)
                {
                    Console.WriteLine(String.Format("Inner exception: {0}", ex.InnerException.Message));
                }
                return false;
            }
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
        public static async Task CreateCustomExplosion(Arena arena, Player killerPlayer, short posX, short posY, short posZ)
        {
            try
            {
                // Get the killer's custom phrase
                string customPhrase = await PhraseExplosionManager.GetPlayerPhrase(killerPlayer._alias);
                
                // Create the explosion with custom text at victim's location
                CreateTextExplosion(arena, customPhrase, posX, posY, posZ, killerPlayer);
                
                // Optional: Log the explosion for debugging
                // Console.WriteLine(String.Format("{0} triggered explosion with phrase: {1}", killerPlayer._alias, customPhrase));
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error creating custom explosion: {0}", ex.Message));
                // Fallback to default explosion
                CreateTextExplosion(arena, "BLOOP!", posX, posY, posZ, killerPlayer);
            }
        }
        
        private static void CreateTextExplosion(Arena arena, string text, short x, short y, short z, Player from)
        {
            // Create letter explosions similar to Albert's EMP grenade
            // Each letter is spawned as a separate projectile at the explosion location
            int xOffset = 10; // Space between letters
            
            for (int i = 0; i < text.Length; i++)
            {
                char letter = text[i];
                if (letter == ' ') continue; // Skip spaces
                
                // Get the letter projectile from assets
                ItemInfo.Projectile letterWep;
                
                // Special case for N since we know its exact ID
                if (letter == 'N' || letter == 'n')
                {
                    letterWep = AssetManager.Manager.getItemByID(1341) as ItemInfo.Projectile;
                }
                // letter m is 1356
                else if (letter == 'M' || letter == 'm')
                {
                    letterWep = AssetManager.Manager.getItemByID(1356) as ItemInfo.Projectile;
                }
                // Handle numbers by getting their spelled out names
                else if (char.IsDigit(letter))
                {
                    string[] numberNames = { "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine" };
                    int digit = letter - '0';
                    letterWep = AssetManager.Manager.getItemByName(numberNames[digit]) as ItemInfo.Projectile;
                }
                else
                {
                    letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
                }
                
                if (letterWep != null)
                {
                    short newPosX = (short)(x + (i * xOffset));
                    
                    // Create the explosion projectile using the same method as Albert's EMP
                    SC_Projectile letterExplosion = new SC_Projectile
                    {
                        projectileID = (short)letterWep.id,
                        playerID = (ushort)from._id,
                        posX = newPosX,
                        posY = y,
                        posZ = z,
                        yaw = from._state.yaw
                    };
                    
                    // Send the explosion to all players
                    foreach (Player p in arena.Players)
                    {
                        p._client.sendReliable(letterExplosion);
                    }
                }
                else
                {
                    // Debug logging for missing letters
                    Console.WriteLine(String.Format("Could not find weapon for letter: {0}", letter));
                }
            }
        }
    }

    public class WebIntegration
    {
        private static readonly HttpClient httpClient = new HttpClient();
        //private const string API_ENDPOINT = "http://localhost:3000/api/game-data";
        private const string API_ENDPOINT = "https://freeinf.org/api/game-data";
        
        public static async Task SendGameDataToWebsite(Arena arena, string baseUsed)
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
                //if (gameType == "OvD")
                //{
                    titanIsOffense = DetermineOffenseTeam(players, arena);
                //}
                
                // Process each player
                foreach (Player player in players)
                {
                    string actualTeamName = player._team._name;
                    string teamType = DeterminePlayerTeamType(player);
                    string className = player._baseVehicle._type.Name;
                    bool isOffense = DetermineIsOffense(teamType, titanIsOffense, gameType);
                    string weapon = GetSpecialWeapon(player);
                    
                    gameDataPlayers.Add(new PlayerData
                    {
                        alias = player._alias,
                        team = actualTeamName,
                        teamType = teamType,
                        className = className,
                        isOffense = isOffense,
                        weapon = weapon
                    });
                }
                
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
                    json.AppendFormat("\"weapon\":\"{0}\"", WebIntegration.EscapeJsonString(player.weapon));
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
        
        public static string EscapeJsonString(string input)
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

    // Simple test program to send sample game data to your website
    // Run this to test the integration before implementing with real game data

    public class TestGameData
    {
        private static readonly HttpClient httpClient = new HttpClient();
        //private const string API_ENDPOINT = "http://localhost:3000/api/game-data";
        private const string API_ENDPOINT = "https://freeinf.org/api/game-data";
        
        public static async Task Main(string[] args)
        {
            Console.WriteLine("Sending test game data to website...");
            
            // Create sample game data similar to what your actual game would send
            var testGameData = new
            {
                arenaName = "OvD Arena",
                gameType = "OvD",
                baseUsed = "Test Base Alpha",
                players = new[]
                {
                    // Offense Team (Titan)
                    new { alias = "Herthbul", team = "Titan", @class = "Squad Leader", isOffense = true, weapon = (string)null },
                    new { alias = "Dinobot", team = "Titan", @class = "Heavy Weapons", isOffense = true, weapon = (string)null },
                    new { alias = "jay", team = "Titan", @class = "Infantry", isOffense = true, weapon = (string)null },
                    new { alias = "iron", team = "Titan", @class = "Infantry", isOffense = true, weapon = (string)null },
                    new { alias = "Angelus", team = "Titan", @class = "Infantry", isOffense = true, weapon = (string)null },
                    
                    // Defense Team (Collective)
                    new { alias = "Dilatory", team = "Collective", @class = "Field Medic", isOffense = false, weapon = (string)null },
                    new { alias = "albert", team = "Collective", @class = "Combat Engineer", isOffense = false, weapon = (string)null },
                    new { alias = "Axidus", team = "Collective", @class = "Heavy Weapons", isOffense = false, weapon = (string)null },
                    new { alias = "Greed", team = "Collective", @class = "Infantry", isOffense = false, weapon = "CAW" },
                    new { alias = "Silly Wanker", team = "Collective", @class = "Infantry", isOffense = false, weapon = "SG" }
                }
            };
            
            try
            {
                // Convert to JSON using our manual JSON builder
                string jsonData = BuildJsonString(testGameData);
                Console.WriteLine("Sending data:");
                Console.WriteLine(jsonData);
                
                // Send to API
                var content = new StringContent(jsonData, System.Text.Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync(API_ENDPOINT, content);
                
                if (response.IsSuccessStatusCode)
                {
                    string responseContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("✅ Success! Server response: {0}", responseContent));
                    Console.WriteLine("Check your website at http://localhost:3000 to see the updated player list!");
                }
                else
                {
                    string errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("❌ Failed to send data. Status: {0}", response.StatusCode));
                    Console.WriteLine(String.Format("Error: {0}", errorContent));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("❌ Exception occurred: {0}", ex.Message));
            }
            
            Console.WriteLine("\nPress any key to exit...");
            Console.ReadKey();
        }

        private static string BuildJsonString(object testGameData)
        {
            var json = new System.Text.StringBuilder();
            json.Append("{");
            json.AppendFormat("\"arenaName\":\"{0}\",", ((TestGameDataObject)testGameData).arenaName);
            json.AppendFormat("\"gameType\":\"{0}\",", ((TestGameDataObject)testGameData).gameType);
            json.AppendFormat("\"baseUsed\":\"{0}\",", ((TestGameDataObject)testGameData).baseUsed);
            json.Append("\"players\":[");

            var players = ((TestGameDataObject)testGameData).players;
            for (int i = 0; i < players.Length; i++)
            {
                var player = players[i];
                json.Append("{");
                json.AppendFormat("\"alias\":\"{0}\",", player.alias);
                json.AppendFormat("\"team\":\"{0}\",", player.team);
                json.AppendFormat("\"class\":\"{0}\",", player.@class);
                json.AppendFormat("\"isOffense\":{0},", player.isOffense.ToString().ToLower());
                
                if (player.weapon == null)
                {
                    json.Append("\"weapon\":null");
                }
                else
                {
                    json.AppendFormat("\"weapon\":\"{0}\"", WebIntegration.EscapeJsonString(player.weapon));
                }
                
                json.Append("}");
                
                if (i < players.Length - 1)
                {
                    json.Append(",");
                }
            }
            
            json.Append("]");
            json.Append("}");
            
            return json.ToString();
        }
    }

    public class TestGameDataObject
    {
        public string arenaName { get; set; }
        public string gameType { get; set; }
        public string baseUsed { get; set; }
        public TestPlayerObject[] players { get; set; }
    }

    public class TestPlayerObject
    {
        public string alias { get; set; }
        public string team { get; set; }
        public string @class { get; set; }
        public bool isOffense { get; set; }
        public string weapon { get; set; }
    }

    // =============================================================================
    // DUELING SYSTEM CLASSES
    // =============================================================================

    public enum DuelType
    {
        Unranked,
        RankedBo3,
        RankedBo5
    }

    public enum DuelStatus
    {
        Challenged,
        InProgress,
        Completed,
        Abandoned
    }

    public class DuelMatch
    {
        public int MatchId { get; set; }
        public DuelType MatchType { get; set; }
        public string Player1Name { get; set; }
        public string Player2Name { get; set; }
        public string Player1Id { get; set; }  // Player 1 ID (null if unregistered)
        public string Player2Id { get; set; }  // Player 2 ID (null if unregistered)
        public string WinnerName { get; set; }
        public string WinnerId { get; set; }   // Winner ID (null if unregistered)
        public int Player1RoundsWon { get; set; }
        public int Player2RoundsWon { get; set; }
        public int TotalRounds { get; set; }
        public DuelStatus Status { get; set; }
        public string ArenaName { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public List<DuelRound> Rounds { get; set; }

        public DuelMatch()
        {
            Rounds = new List<DuelRound>();
            // Initialize IDs as null (will be populated if players are registered)
            Player1Id = null;
            Player2Id = null;
            WinnerId = null;
        }
    }

    public class DuelRound
    {
        public int RoundNumber { get; set; }
        public string WinnerName { get; set; }
        public string LoserName { get; set; }
        public int WinnerHpLeft { get; set; }
        public int LoserHpLeft { get; set; }
        public int DurationSeconds { get; set; }
        public DateTime StartedAt { get; set; }
        public DateTime CompletedAt { get; set; }
        public List<DuelKill> Kills { get; set; }

        public DuelRound()
        {
            Kills = new List<DuelKill>();
        }
    }

    public class DuelKill
    {
        public string KillerName { get; set; }
        public string VictimName { get; set; }
        public string WeaponUsed { get; set; }
        public int DamageDealt { get; set; }
        public int VictimHpBefore { get; set; }
        public int VictimHpAfter { get; set; }
        public int ShotsFired { get; set; }
        public int ShotsHit { get; set; }
        public bool IsDoubleHit { get; set; }
        public bool IsTripleHit { get; set; }
        public DateTime KillTimestamp { get; set; }
    }

    public class DuelChallenge
    {
        public string ChallengerName { get; set; }
        public string ChallengeName { get; set; }
        public DuelType DuelType { get; set; }
        public DateTime ChallengeTime { get; set; }
        public bool IsActive { get { return DateTime.Now.Subtract(ChallengeTime).TotalMinutes < 2; } } // 2 minute timeout
    }

    public class TileWaitingPlayer
    {
        public string PlayerName { get; set; }
        public DuelType DuelType { get; set; }
        public DateTime WaitStartTime { get; set; }
        public bool IsActive { get { return DateTime.Now.Subtract(WaitStartTime).TotalSeconds < 30; } } // 30 second timeout
    }

    public class DuelSideAssignment
    {
        public string Player1Name { get; set; }
        public string Player2Name { get; set; }
        public string Player1Side { get; set; } // "player1" or "player2"
        public string Player2Side { get; set; } // "player1" or "player2"
        public int RoundNumber { get; set; }
    }

    public class PlayerShotStats
    {
        public string PlayerName { get; set; }
        public int ShotsFired { get; set; }
        public int ShotsHit { get; set; }
        public DateTime LastReset { get; set; }
        public int MatchId { get; set; }

        public PlayerShotStats()
        {
            ShotsFired = 0;
            ShotsHit = 0;
            LastReset = DateTime.Now;
        }

        public double Accuracy
        {
            get
            {
                if (ShotsFired == 0) return 0.0;
                return (double)ShotsHit / ShotsFired * 100.0;
            }
        }
    }

    public static class DuelingSystem
    {
        private static readonly HttpClient httpClient = new HttpClient();
        
        // API Configuration - Change USE_LOCAL_API to switch between local and production
        private const bool USE_LOCAL_API = true; // Set to false for production
        private const string LOCAL_DUELING_API_ENDPOINT = "http://localhost:3000/api/dueling/stats";
        private const string PRODUCTION_DUELING_API_ENDPOINT = "https://freeinf.org/api/dueling/stats";
        private static string DUELING_API_ENDPOINT
        {
            get
            {
                return USE_LOCAL_API ? LOCAL_DUELING_API_ENDPOINT : PRODUCTION_DUELING_API_ENDPOINT;
            }
        }

        // Thread-safe collections and locks
        private static readonly ConcurrentDictionary<string, DuelMatch> activeDuels = new ConcurrentDictionary<string, DuelMatch>();
        private static readonly List<DuelChallenge> activeChallenges = new List<DuelChallenge>();
        private static readonly ConcurrentDictionary<string, DateTime> lastDamageTime = new ConcurrentDictionary<string, DateTime>();
        private static readonly ConcurrentDictionary<string, List<DateTime>> recentDamageHits = new ConcurrentDictionary<string, List<DateTime>>();
        
        // Locks for critical sections
        private static readonly object challengeLock = new object();
        private static readonly object duelLock = new object();

        // Dueling tiles coordinates (to be updated based on your map)
        private static readonly Dictionary<string, Tuple<short, short>> DUELING_TILES = new Dictionary<string, Tuple<short, short>>
        {
            { "ranked_bo3", new Tuple<short, short>(775, 517) },   // Bo3 tile location
            { "ranked_bo5", new Tuple<short, short>(784, 517) }    // Bo5 tile location
        };

        // Dueling spawn positions (scaled to 16x16 pixels)
        private static readonly Dictionary<string, Tuple<short, short, byte>> DUEL_SPAWN_POSITIONS = new Dictionary<string, Tuple<short, short, byte>>
        {
            { "player1", new Tuple<short, short, byte>(763, 534, 0) },   // Player 1 facing down (yaw 0)
            { "player2", new Tuple<short, short, byte>(795, 534, 128) }  // Player 2 facing up (yaw 128)
        };

        // Track players waiting on tiles
        private static readonly ConcurrentDictionary<string, TileWaitingPlayer> playersOnTiles = new ConcurrentDictionary<string, TileWaitingPlayer>();

        // Track current side assignments for active duels (for side swapping)
        private static readonly ConcurrentDictionary<string, DuelSideAssignment> duelSideAssignments = new ConcurrentDictionary<string, DuelSideAssignment>();

        // Track shot statistics for dueling players
        private static readonly ConcurrentDictionary<string, PlayerShotStats> playerShotStats = new ConcurrentDictionary<string, PlayerShotStats>();

        public static async Task HandleDuelCommand(Player player, string command, string payload)
        {
            try
            {
                string[] parts = payload.Split(' ');
                string subCommand = parts.Length > 0 ? parts[0].ToLower() : "help";

                switch (subCommand)
                {
                    case "challenge":
                        if (parts.Length < 2)
                        {
                            player.sendMessage(-1, "Usage: ?duel challenge <player> [type]");
                            return;
                        }
                        string targetName = parts[1];
                        string duelTypeStr = parts.Length > 2 ? parts[2] : "unranked";
                        DuelType duelType = ParseDuelType(duelTypeStr);
                        await ChallengeToDuel(player, targetName, duelType);
                        break;

                    case "accept":
                        await AcceptDuelChallenge(player);
                        break;

                    case "decline":
                        DeclineDuelChallenge(player);
                        break;

                    case "forfeit":
                        await ForfeitDuel(player);
                        break;

                    case "stats":
                        string statsTarget = parts.Length > 1 ? parts[1] : player._alias;
                        await ShowPlayerDuelStats(player, statsTarget);
                        break;

                    case "help":
                    default:
                        ShowDuelHelp(player);
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in HandleDuelCommand: {0}", ex.Message));
                player.sendMessage(-1, "An error occurred processing your duel command.");
            }
        }

        private static void ShowDuelHelp(Player player)
        {
            player.sendMessage(-1, "!== DUELING SYSTEM ==");
            player.sendMessage(-1, "@?duel challenge <player> [type] - Challenge a player to duel");
            player.sendMessage(-1, "?duel accept - Accept a duel challenge");
            player.sendMessage(-1, "?duel decline - Decline a duel challenge");
            player.sendMessage(-1, "!?duel forfeit - Forfeit current duel");
            player.sendMessage(-1, "@?duel stats [player] - View dueling statistics");
            player.sendMessage(-1, "");
            player.sendMessage(-1, "!Duel Types: unranked, bo3 (ranked), bo5 (ranked)");
            player.sendMessage(-1, "@RANKED TILES: Step on Bo3 (775,517) or Bo5 (784,517) tiles!");
            player.sendMessage(-1, "!Auto-match when 2 players step on same tile type!");
            player.sendMessage(-1, "@Players swap sides after each round in tile duels!");
        }

        private static DuelType ParseDuelType(string type)
        {
            string lowerType = type.ToLower();
            if (lowerType == "bo3" || lowerType == "ranked_bo3")
                return DuelType.RankedBo3;
            else if (lowerType == "bo5" || lowerType == "ranked_bo5")
                return DuelType.RankedBo5;
            else
                return DuelType.Unranked;
        }

        private static async Task ChallengeToDuel(Player challenger, string targetName, DuelType duelType)
        {
            // Find target player
            Player target = challenger._arena.Players.FirstOrDefault(p => 
                p._alias.Equals(targetName, StringComparison.OrdinalIgnoreCase));

            if (target == null)
            {
                challenger.sendMessage(-1, String.Format("Player '{0}' not found in arena.", targetName));
                return;
            }

            if (target == challenger)
            {
                challenger.sendMessage(-1, "You cannot challenge yourself to a duel.");
                return;
            }

            // Thread-safe challenge processing
            lock (challengeLock)
            {
                // Check if players are already in a duel
                if (IsPlayerInDuel(challenger._alias) || IsPlayerInDuel(target._alias))
                {
                    challenger.sendMessage(-1, "One of the players is already in a duel.");
                    return;
                }

                // Remove old challenges
                RemoveExpiredChallenges();

                // Check if there's already an active challenge between these players
                var existingChallenge = activeChallenges.FirstOrDefault(c => 
                    c.IsActive && (
                        (c.ChallengerName == challenger._alias && c.ChallengeName == target._alias) ||
                        (c.ChallengerName == target._alias && c.ChallengeName == challenger._alias)
                    ));

                if (existingChallenge != null)
                {
                    challenger.sendMessage(-1, "There's already an active challenge between you and this player.");
                    return;
                }

                // Create new challenge
                var challenge = new DuelChallenge
                {
                    ChallengerName = challenger._alias,
                    ChallengeName = target._alias,
                    DuelType = duelType,
                    ChallengeTime = DateTime.Now
                };

                activeChallenges.Add(challenge);

                // Notify both players with colors
                string duelTypeStr = GetDuelTypeString(duelType);

                challenger.sendMessage(-1, String.Format("@Challenge sent to {0} for {1} duel!", target._alias, duelTypeStr));
                target.sendMessage(-1, String.Format("!{0} challenges you to a {1} duel!", challenger._alias, duelTypeStr));
                target.sendMessage(-1, "Type ?duel accept to accept or ?duel decline to decline");
                target.sendMessage(-1, "Challenge expires in 2 minutes");
            }
        }

        private static async Task AcceptDuelChallenge(Player player)
        {
            DuelChallenge challengeToAccept = null;
            Player challenger = null;

            // Thread-safe challenge acceptance
            lock (challengeLock)
            {
                challengeToAccept = activeChallenges.FirstOrDefault(c => 
                    c.ChallengeName == player._alias && c.IsActive);

                if (challengeToAccept == null)
                {
                    player.sendMessage(-1, "No active challenge found.");
                    return;
                }

                challenger = player._arena.Players.FirstOrDefault(p => 
                    p._alias.Equals(challengeToAccept.ChallengerName, StringComparison.OrdinalIgnoreCase));

                if (challenger == null)
                {
                    player.sendMessage(-1, "Challenger is no longer in the arena.");
                    // Mark challenge as processed by creating a new list without it
                    var newChallenges = activeChallenges.Where(c => c != challengeToAccept).ToList();
                    activeChallenges.Clear();
                    foreach (var c in newChallenges) activeChallenges.Add(c);
                    return;
                }

                // Check if either player is now in a duel (double-check for race conditions)
                if (IsPlayerInDuel(challenger._alias) || IsPlayerInDuel(player._alias))
                {
                    player.sendMessage(-1, "One of the players is already in a duel.");
                    return;
                }
            }

            // Start the duel outside the lock (async operation)
            await StartDuel(challenger, player, challengeToAccept.DuelType);

            // Remove the challenge after duel starts
            lock (challengeLock)
            {
                var newChallenges = activeChallenges.Where(c => c != challengeToAccept).ToList();
                activeChallenges.Clear();
                foreach (var c in newChallenges) activeChallenges.Add(c);
            }
        }

        private static void DeclineDuelChallenge(Player player)
        {
            DuelChallenge challengeToDecline = null;
            Player challenger = null;

            // Thread-safe challenge decline
            lock (challengeLock)
            {
                challengeToDecline = activeChallenges.FirstOrDefault(c => 
                    c.ChallengeName == player._alias && c.IsActive);

                if (challengeToDecline == null)
                {
                    player.sendMessage(-1, "No active challenge found.");
                    return;
                }

                // Find the challenger to notify them
                challenger = player._arena.Players.FirstOrDefault(p => 
                    p._alias.Equals(challengeToDecline.ChallengerName, StringComparison.OrdinalIgnoreCase));

                // Remove the challenge
                var newChallenges = activeChallenges.Where(c => c != challengeToDecline).ToList();
                activeChallenges.Clear();
                foreach (var c in newChallenges) activeChallenges.Add(c);
            }

            player.sendMessage(-1, "Challenge declined.");
            
            if (challenger != null)
            {
                challenger.sendMessage(-1, String.Format("{0} declined your duel challenge.", player._alias));
            }
        }

        private static async Task StartDuel(Player player1, Player player2, DuelType duelType)
        {
            string matchKey = String.Format("{0}_{1}", player1._alias, player2._alias);

            // Thread-safe duel creation
            lock (duelLock)
            {
                // Double-check that neither player is in a duel
                if (IsPlayerInDuel(player1._alias) || IsPlayerInDuel(player2._alias))
                {
                    player1.sendMessage(-1, "One of the players is already in a duel.");
                    player2.sendMessage(-1, "One of the players is already in a duel.");
                    return;
                }

                var duelMatch = new DuelMatch
                {
                    MatchType = duelType,
                    Player1Name = player1._alias,
                    Player2Name = player2._alias,
                    Status = DuelStatus.InProgress,
                    ArenaName = player1._arena._name,
                    StartedAt = DateTime.Now
                };

                // Initialize player IDs (will be resolved by the API)
                PopulatePlayerIds(duelMatch);

                activeDuels.TryAdd(matchKey, duelMatch);

                // Announce duel start
                string duelTypeStr = GetDuelTypeString(duelType);

                // Send message to all players in arena with colors
                foreach (Player p in player1._arena.Players)
                {
                    p.sendMessage(-1, String.Format("!DUEL STARTED: {0} vs {1}! ({2})", player1._alias, player2._alias, duelTypeStr));
                }

                // Reset shot stats for both players
                ResetPlayerShotStats(player1);
                ResetPlayerShotStats(player2);

                // Reset player states and start countdown with positioning
                ResetSinglePlayerDeathState(player1);
                ResetSinglePlayerDeathState(player2);
                
                // Start countdown and positioning sequence immediately (async)
                Task.Run(async () => {
                    try
                    {
                        await StartDuelCountdown(player1, player2, player1._arena);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(String.Format("Error during duel start countdown: {0}", ex.Message));
                    }
                });
                
                // Start first round
                StartDuelRound(duelMatch, 1);
            }
        }

        private static async Task StartTileBasedDuel(Player player1, Player player2, DuelType duelType)
        {
            string matchKey = String.Format("{0}_{1}", player1._alias, player2._alias);

            // Thread-safe duel creation
            lock (duelLock)
            {
                // Double-check that neither player is in a duel
                if (IsPlayerInDuel(player1._alias) || IsPlayerInDuel(player2._alias))
                {
                    player1.sendMessage(-1, "One of the players is already in a duel.");
                    player2.sendMessage(-1, "One of the players is already in a duel.");
                    return;
                }

                var duelMatch = new DuelMatch
                {
                    MatchType = duelType,
                    Player1Name = player1._alias,
                    Player2Name = player2._alias,
                    Status = DuelStatus.InProgress,
                    ArenaName = player1._arena._name,
                    StartedAt = DateTime.Now
                };

                // Initialize player IDs (will be resolved by the API)
                PopulatePlayerIds(duelMatch);

                activeDuels.TryAdd(matchKey, duelMatch);

                // Set up initial side assignments
                var sideAssignment = new DuelSideAssignment
                {
                    Player1Name = player1._alias,
                    Player2Name = player2._alias,
                    Player1Side = "player1", // player1 starts on left side
                    Player2Side = "player2", // player2 starts on right side
                    RoundNumber = 1
                };
                duelSideAssignments.TryAdd(matchKey, sideAssignment);

                // Announce duel start
                string duelTypeStr = GetDuelTypeString(duelType);

                // Send message to all players in arena with colors
                foreach (Player p in player1._arena.Players)
                {
                    p.sendMessage(-1, String.Format("!TILE DUEL STARTED: {0} vs {1}! ({2})", player1._alias, player2._alias, duelTypeStr));
                }

                // Reset shot stats for both players
                ResetPlayerShotStats(player1);
                ResetPlayerShotStats(player2);

                // Reset player states and start countdown with positioning
                ResetSinglePlayerDeathState(player1);
                ResetSinglePlayerDeathState(player2);
                
                // Start countdown and positioning sequence (async)
                Task.Run(async () => {
                    try
                    {
                        await StartDuelCountdown(player1, player2, player1._arena);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(String.Format("Error during match start countdown: {0}", ex.Message));
                    }
                });
                
                // Start first round
                StartDuelRound(duelMatch, 1);
            }
        }

        private static void StartDuelRound(DuelMatch match, int roundNumber)
        {
            var round = new DuelRound
            {
                RoundNumber = roundNumber,
                StartedAt = DateTime.Now.AddSeconds(4) // Will be updated when countdown finishes
            };

            match.Rounds.Add(round);
            Console.WriteLine(String.Format("Created round {0} for duel: {1} vs {2}", roundNumber, match.Player1Name, match.Player2Name));
        }

        private static void WarpPlayersToStartingPositions(Player player1, Player player2, DuelSideAssignment sideAssignment)
        {
            try
            {
                // Get spawn positions based on side assignments
                var player1Spawn = DUEL_SPAWN_POSITIONS[sideAssignment.Player1Side];
                var player2Spawn = DUEL_SPAWN_POSITIONS[sideAssignment.Player2Side];

                // Warp player 1 with exact positioning using Helpers.ObjectState
                WarpPlayerToExactPosition(player1, player1Spawn.Item1, player1Spawn.Item2, player1Spawn.Item3);
                
                // Warp player 2 with exact positioning using Helpers.ObjectState
                WarpPlayerToExactPosition(player2, player2Spawn.Item1, player2Spawn.Item2, player2Spawn.Item3);

                Console.WriteLine(String.Format("Warped {0} to side {1} at ({2},{3}) facing {4}", 
                    player1._alias, sideAssignment.Player1Side, player1Spawn.Item1, player1Spawn.Item2, player1Spawn.Item3));
                Console.WriteLine(String.Format("Warped {0} to side {1} at ({2},{3}) facing {4}", 
                    player2._alias, sideAssignment.Player2Side, player2Spawn.Item1, player2Spawn.Item2, player2Spawn.Item3));
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error warping players: {0}", ex.Message));
            }
        }

        private static void WarpPlayerToExactPosition(Player p, short posX, short posY, byte yaw)
        {
            try
            {
                // Use the same approach as CTF.cs for proper yaw direction
                Helpers.ObjectState newState = new Helpers.ObjectState
                {
                    positionX = (short)(posX * 16),
                    positionY = (short)(posY * 16),
                    positionZ = (short)0,
                    yaw = yaw,
                    velocityX = 0,
                    velocityY = 0,
                    energy = p._state.energy,
                    health = p._state.health,
                    direction = (Helpers.ObjectState.Direction)yaw
                };

                // Reset warp and state first (like CTF.cs example)
                p.resetWarp();
                p.resetState(false, false, false);

                // Warp the player to restore position and state with proper yaw
                p.warp(Helpers.ResetFlags.ResetAll, newState, p._state.health, p._state.energy, yaw);
                
                // Reset death timer to ensure immediate respawn
                p._deathTime = 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error warping player {0} to exact position: {1}", p._alias, ex.Message));
            }
        }

        private static void SwapSidesAndWarp(DuelMatch match, Player player1, Player player2, int newRoundNumber)
        {
            string matchKey = String.Format("{0}_{1}", match.Player1Name, match.Player2Name);
            
            DuelSideAssignment sideAssignment;
            if (duelSideAssignments.TryGetValue(matchKey, out sideAssignment))
            {
                // Swap the sides
                string tempSide = sideAssignment.Player1Side;
                sideAssignment.Player1Side = sideAssignment.Player2Side;
                sideAssignment.Player2Side = tempSide;
                sideAssignment.RoundNumber = newRoundNumber;

                // Announce side swap
                foreach (Player p in player1._arena.Players)
                {
                    p.sendMessage(-1, String.Format("@Round {0}: Players switching sides!", newRoundNumber));
                }

                // Warp players to their new positions
                WarpPlayersToStartingPositions(player1, player2, sideAssignment);
            }
        }

        public static async Task HandlePlayerDeath(Player victim, Player killer, Arena arena)
        {
            try
            {
                // Check if this death is part of a duel
                string matchKey1 = String.Format("{0}_{1}", victim._alias, killer._alias);
                string matchKey2 = String.Format("{0}_{1}", killer._alias, victim._alias);

                DuelMatch duel = null;
                if (activeDuels.TryGetValue(matchKey1, out duel) || activeDuels.TryGetValue(matchKey2, out duel))
                {
                    if (duel.Status == DuelStatus.InProgress)
                    {
                        // Get current round
                        var currentRound = duel.Rounds.LastOrDefault();
                        if (currentRound != null)
                        {
                            // Record the kill with proper HP tracking
                            var kill = new DuelKill
                            {
                                KillerName = killer._alias,
                                VictimName = victim._alias,
                                WeaponUsed = GetPlayerWeapon(killer),
                                DamageDealt = 60, // Assuming full damage for death
                                VictimHpBefore = GetPlayerHealth(victim),
                                VictimHpAfter = 0,
                                ShotsFired = GetShotsFired(killer),
                                ShotsHit = GetShotsHit(killer),
                                IsDoubleHit = CheckForDoubleHit(killer._alias),
                                IsTripleHit = CheckForTripleHit(killer._alias),
                                KillTimestamp = DateTime.Now
                            };

                            currentRound.Kills.Add(kill);

                            // Complete the round with killer's current HP
                            await CompleteRound(duel, currentRound, killer._alias, victim._alias, 
                                GetPlayerHealth(killer), 0, arena);
                        }

                        // Reset death state for victim only (no countdown here)
                        ResetSinglePlayerDeathState(victim);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in HandlePlayerDeath: {0}", ex.Message));
            }
        }



        private static void ResetSinglePlayerDeathState(Player player)
        {
            try
            {
                // Immediately reset the player's death state to prevent double-warp issues
                // This follows the same pattern as Gladiator mode for immediate respawn
                player.resetWarp();
                
                // Complete state reset like Gladiator mode does
                player.resetState(true, true, true);  // Reset all states completely
                
                // Reset health and energy to full for next round
                player._state.health = 60;  // Dueling max health
                player._state.energy = 600;
                
                // Reset death timer to 0 for immediate respawn (like Gladiator mode)
                player._deathTime = 0;
                
                // Force state synchronization to ensure client updates
                player.syncState();
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error resetting single player death state for {0}: {1}", player._alias, ex.Message));
            }
        }

        private static async Task StartDuelCountdown(Player player1, Player player2, Arena arena)
        {
            try
            {
                // Warp both players to their starting positions
                var player1Pos = DUEL_SPAWN_POSITIONS["player1"];
                var player2Pos = DUEL_SPAWN_POSITIONS["player2"];
                
                WarpPlayerToExactPosition(player1, player1Pos.Item1, player1Pos.Item2, player1Pos.Item3);
                WarpPlayerToExactPosition(player2, player2Pos.Item1, player2Pos.Item2, player2Pos.Item3);
                
                // Calculate center position for countdown text (between the two players)
                short centerX = (short)((player1Pos.Item1 + player2Pos.Item1) / 2);
                short centerY = (short)((player1Pos.Item2 + player2Pos.Item2) / 2);
                
                // Countdown sequence: 3, 2, 1, Go!
                string[] countdownTexts = { "3", "2", "1", "Go!" };
                
                for (int i = 0; i < countdownTexts.Length; i++)
                {
                    // Create countdown text explosion
                    CreateDuelCountdownExplosion(arena, countdownTexts[i], centerX, centerY, 16, player1);
                    
                    // Send countdown message to both players
                    if (countdownTexts[i] == "Go!")
                    {
                        player1.sendMessage(-1, String.Format("~{0}", countdownTexts[i]));
                        player2.sendMessage(-1, String.Format("~{0}", countdownTexts[i]));
                        
                        // Update the round start time when "Go!" is called
                        UpdateRoundStartTime(player1, player2);
                    }
                    else
                    {
                        player1.sendMessage(-1, String.Format("${0}", countdownTexts[i]));
                        player2.sendMessage(-1, String.Format("${0}", countdownTexts[i]));
                    }
                    
                    // Wait 1 second between countdown numbers
                    if (i < countdownTexts.Length - 1)
                    {
                        await Task.Delay(1000);
                    }
                }
                
                Console.WriteLine(String.Format("Completed duel countdown for {0} vs {1}", player1._alias, player2._alias));
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error during duel countdown: {0}", ex.Message));
            }
        }

        private static void UpdateRoundStartTime(Player player1, Player player2)
        {
            try
            {
                // Find the active duel for these players
                string matchKey1 = String.Format("{0}_{1}", player1._alias, player2._alias);
                string matchKey2 = String.Format("{0}_{1}", player2._alias, player1._alias);

                DuelMatch duel = null;
                if (activeDuels.TryGetValue(matchKey1, out duel) || activeDuels.TryGetValue(matchKey2, out duel))
                {
                    if (duel.Status == DuelStatus.InProgress)
                    {
                        // Get the current round and update its start time
                        var currentRound = duel.Rounds.LastOrDefault();
                        if (currentRound != null)
                        {
                            currentRound.StartedAt = DateTime.Now;
                            Console.WriteLine(String.Format("Updated round {0} start time for duel: {1} vs {2}", 
                                currentRound.RoundNumber, duel.Player1Name, duel.Player2Name));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error updating round start time: {0}", ex.Message));
            }
        }

        private static void CreateDuelCountdownExplosion(Arena arena, string text, short x, short y, short z, Player from)
        {
            try
            {
                // Create countdown text using the same method as CreateTextExplosion
                // For numbers, get the spelled out projectile names
                ItemInfo.Projectile countdownProjectile = null;
                
                // Handle countdown numbers
                if (text == "3")
                {
                    countdownProjectile = AssetManager.Manager.getItemByName("three") as ItemInfo.Projectile;
                }
                else if (text == "2")
                {
                    countdownProjectile = AssetManager.Manager.getItemByName("two") as ItemInfo.Projectile;
                }
                else if (text == "1")
                {
                    countdownProjectile = AssetManager.Manager.getItemByName("one") as ItemInfo.Projectile;
                }
                else if (text == "Go!")
                {
                    // For "Go!" create letter explosions for G and O
                    CreateLetterExplosion(arena, 'G', (short)(x - 20), y, z, from);
                    CreateLetterExplosion(arena, 'o', (short)(x + 20), y, z, from);
                    return;
                }
                
                if (countdownProjectile != null)
                {
                    // Create the explosion projectile using SC_Projectile
                    SC_Projectile countdownExplosion = new SC_Projectile
                    {
                        projectileID = (short)countdownProjectile.id,
                        playerID = (ushort)from._id,
                        posX = x,
                        posY = y,
                        posZ = z,
                        yaw = from._state.yaw
                    };
                    
                    // Send the explosion to all players
                    foreach (Player p in arena.Players)
                    {
                        p._client.sendReliable(countdownExplosion);
                    }
                    
                    Console.WriteLine(String.Format("Created countdown explosion: '{0}' at ({1}, {2})", text, x, y));
                }
                else
                {
                    Console.WriteLine(String.Format("Could not find projectile for countdown text: {0}", text));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error creating countdown explosion: {0}", ex.Message));
            }
        }

        private static void CreateLetterExplosion(Arena arena, char letter, short x, short y, short z, Player from)
        {
            try
            {
                ItemInfo.Projectile letterWep = null;
                
                // Get letter projectile
                if (letter == 'G' || letter == 'g')
                {
                    letterWep = AssetManager.Manager.getItemByName("G") as ItemInfo.Projectile;
                }
                else if (letter == 'O' || letter == 'o')
                {
                    letterWep = AssetManager.Manager.getItemByName("O") as ItemInfo.Projectile;
                }
                
                if (letterWep != null)
                {
                    SC_Projectile letterExplosion = new SC_Projectile
                    {
                        projectileID = (short)letterWep.id,
                        playerID = (ushort)from._id,
                        posX = x,
                        posY = y,
                        posZ = z,
                        yaw = from._state.yaw
                    };
                    
                    // Send the explosion to all players
                    foreach (Player p in arena.Players)
                    {
                        p._client.sendReliable(letterExplosion);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error creating letter explosion for '{0}': {1}", letter, ex.Message));
            }
        }

        private static async Task CompleteRound(DuelMatch match, DuelRound round, 
            string winnerName, string loserName, int winnerHp, int loserHp, Arena arena)
        {
            round.WinnerName = winnerName;
            round.LoserName = loserName;
            round.WinnerHpLeft = winnerHp;
            round.LoserHpLeft = loserHp;
            round.CompletedAt = DateTime.Now;
            round.DurationSeconds = (int)(round.CompletedAt - round.StartedAt).TotalSeconds;

            // Update match scores
            if (winnerName == match.Player1Name)
                match.Player1RoundsWon++;
            else
                match.Player2RoundsWon++;

            // Announce round result with colors and current score
            string currentScore = String.Format("({0}-{1})", match.Player1RoundsWon, match.Player2RoundsWon);
            foreach (Player p in arena.Players)
            {
                p.sendMessage(-1, String.Format("@Round {0}: {1} defeats {2} ({3}HP left)", 
                    round.RoundNumber, winnerName, loserName, winnerHp));
                p.sendMessage(-1, String.Format("Current Score: {0} {1}", currentScore, GetDuelTypeString(match.MatchType)));
            }

            // Check if match is complete
            int roundsToWin = GetRoundsToWin(match.MatchType);
            if (match.Player1RoundsWon >= roundsToWin || match.Player2RoundsWon >= roundsToWin)
            {
                match.WinnerName = match.Player1RoundsWon >= roundsToWin ? match.Player1Name : match.Player2Name;
                await CompleteDuel(match, arena);
            }
            else
            {
                // Get players for next round
                Player player1 = arena.Players.FirstOrDefault(p => p._alias == match.Player1Name);
                Player player2 = arena.Players.FirstOrDefault(p => p._alias == match.Player2Name);

                if (player1 != null && player2 != null)
                {
                    // Reset both players' states for next round
                    ResetSinglePlayerDeathState(player1);
                    ResetSinglePlayerDeathState(player2);

                    // Check if this is a tile-based duel (has side assignments)
                    string matchKey = String.Format("{0}_{1}", match.Player1Name, match.Player2Name);
                    if (duelSideAssignments.ContainsKey(matchKey))
                    {
                        // Swap sides for next round
                        int nextRoundNumber = match.Rounds.Count + 1;
                        SwapSidesAndWarp(match, player1, player2, nextRoundNumber);
                    }

                    // Start countdown for next round (async)
                    Task.Run(async () => {
                        try
                        {
                            await StartDuelCountdown(player1, player2, arena);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(String.Format("Error during next round countdown: {0}", ex.Message));
                        }
                    });
                }

                // Start next round
                StartDuelRound(match, match.Rounds.Count + 1);
            }
        }

        private static int GetRoundsToWin(DuelType duelType)
        {
            if (duelType == DuelType.RankedBo3)
                return 2; // Best of 3
            else if (duelType == DuelType.RankedBo5)
                return 3; // Best of 5 (first to 3)
            else
                return 1; // Unranked (single round)
        }

        private static async Task CompleteDuel(DuelMatch match, Arena arena)
        {
            // Thread-safe duel completion
            lock (duelLock)
            {
                match.Status = DuelStatus.Completed;
                match.CompletedAt = DateTime.Now;

                // Set winner ID based on winner name
                if (match.WinnerName == match.Player1Name)
                    match.WinnerId = match.Player1Id;
                else if (match.WinnerName == match.Player2Name)
                    match.WinnerId = match.Player2Id;

                // Announce match result with special victory formatting
                string loserName = match.WinnerName == match.Player1Name ? match.Player2Name : match.Player1Name;
                string finalScore = String.Format("({0}-{1})", match.Player1RoundsWon, match.Player2RoundsWon);
                
                foreach (Player p in arena.Players)
                {
                    p.sendMessage(-1, String.Format("● {0} WINS the {1} duel against {2}! {3}", 
                        match.WinnerName, GetDuelTypeString(match.MatchType), loserName, finalScore));
                    p.sendMessage(-1, String.Format("!{0} has drawn first blood.", match.WinnerName));
                }

                // Remove from active duels and clean up side assignments
                string matchKey = String.Format("{0}_{1}", match.Player1Name, match.Player2Name);
                DuelMatch removedMatch;
                activeDuels.TryRemove(matchKey, out removedMatch);
                
                // Clean up side assignments for tile-based duels
                DuelSideAssignment removedSideAssignment;
                duelSideAssignments.TryRemove(matchKey, out removedSideAssignment);

                // Clean up shot stats for both players
                PlayerShotStats removedStats1, removedStats2;
                playerShotStats.TryRemove(match.Player1Name, out removedStats1);
                playerShotStats.TryRemove(match.Player2Name, out removedStats2);
            }

            // Send match data to website (outside lock for async operation)
            await SendDuelMatchToWebsite(match);
        }

        private static async Task ForfeitDuel(Player player)
        {
            string playerName = player._alias;
            DuelMatch duel = null;

            // Find the player's active duel
            foreach (var kvp in activeDuels)
            {
                if ((kvp.Value.Player1Name == playerName || kvp.Value.Player2Name == playerName) && 
                    kvp.Value.Status == DuelStatus.InProgress)
                {
                    duel = kvp.Value;
                    break;
                }
            }

            if (duel == null)
            {
                player.sendMessage(-1, "You are not currently in a duel.");
                return;
            }

            string opponentName = duel.Player1Name == playerName ? duel.Player2Name : duel.Player1Name;
            
            duel.WinnerName = opponentName;
            duel.Status = DuelStatus.Abandoned;
            duel.CompletedAt = DateTime.Now;

            foreach (Player p in player._arena.Players)
            {
                p.sendMessage(-1, String.Format("{0} forfeits the duel. {1} wins by forfeit!", playerName, opponentName));
            }

            // Send match data to website (as abandoned)
            await SendDuelMatchToWebsite(duel);

            // Remove from active duels
            string matchKey = String.Format("{0}_{1}", duel.Player1Name, duel.Player2Name);
            DuelMatch removedMatch;
            activeDuels.TryRemove(matchKey, out removedMatch);
        }

        public static async Task HandleTileStep(Player player, short x, short y)
        {
            try
            {
                // Check if player stepped on a ranked dueling tile (with radius detection)
                foreach (var tile in DUELING_TILES)
                {
                    short tileX = tile.Value.Item1;
                    short tileY = tile.Value.Item2;
                    
                    // Check if player is within 1 tile radius (forming a 3x3 grid around the center)
                    if (Math.Abs(x - tileX) <= 1 && Math.Abs(y - tileY) <= 1)
                    {
                        DuelType duelType = tile.Key == "ranked_bo3" ? DuelType.RankedBo3 : DuelType.RankedBo5;
                        await HandleRankedTileStep(player, duelType);
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in HandleTileStep: {0}", ex.Message));
            }
        }

        private static async Task HandleRankedTileStep(Player player, DuelType duelType)
        {
            // Check if player is already in a duel
            if (IsPlayerInDuel(player._alias))
            {
                player.sendMessage(-1, "You are already in a duel.");
                return;
            }

            string tileKey = duelType == DuelType.RankedBo3 ? "ranked_bo3" : "ranked_bo5";
            string duelTypeStr = GetDuelTypeString(duelType);

            // Remove expired waiting players
            CleanupExpiredTileWaiters();

            // Check if there's already someone waiting on this tile type
            var waitingPlayer = playersOnTiles.Values.FirstOrDefault(w => 
                w.DuelType == duelType && w.IsActive && w.PlayerName != player._alias);

            if (waitingPlayer != null)
            {
                // Found a match! Start the duel immediately
                Player opponent = player._arena.Players.FirstOrDefault(p => 
                    p._alias.Equals(waitingPlayer.PlayerName, StringComparison.OrdinalIgnoreCase));

                if (opponent != null && !IsPlayerInDuel(opponent._alias))
                {
                    // Remove both players from waiting
                    TileWaitingPlayer removedPlayer;
                    playersOnTiles.TryRemove(waitingPlayer.PlayerName, out removedPlayer);
                    playersOnTiles.TryRemove(player._alias, out removedPlayer);

                    // Announce the match
                    foreach (Player p in player._arena.Players)
                    {
                        p.sendMessage(-1, String.Format("!AUTO-MATCH: {0} vs {1} ({2})!", 
                            player._alias, opponent._alias, duelTypeStr));
                    }

                    // Start the duel with proper warping
                    await StartTileBasedDuel(player, opponent, duelType);
                }
                else
                {
                    // Opponent left, remove them and add current player to waiting
                    TileWaitingPlayer removedPlayer;
                    playersOnTiles.TryRemove(waitingPlayer.PlayerName, out removedPlayer);
                    AddPlayerToTileWaiting(player, duelType, duelTypeStr);
                }
            }
            else
            {
                // No one waiting, add this player to waiting list
                AddPlayerToTileWaiting(player, duelType, duelTypeStr);
            }
        }

        private static void AddPlayerToTileWaiting(Player player, DuelType duelType, string duelTypeStr)
        {
            var waitingPlayer = new TileWaitingPlayer
            {
                PlayerName = player._alias,
                DuelType = duelType,
                WaitStartTime = DateTime.Now
            };

            playersOnTiles.AddOrUpdate(player._alias, waitingPlayer, (key, existing) => waitingPlayer);

            player.sendMessage(-1, String.Format("@Waiting for opponent for {0}...", duelTypeStr));
            player.sendMessage(-1, "Step off the tile to cancel or wait for another player to join.");
        }

        private static void CleanupExpiredTileWaiters()
        {
            var expiredPlayers = playersOnTiles.Where(kvp => !kvp.Value.IsActive).Select(kvp => kvp.Key).ToList();
            foreach (var playerName in expiredPlayers)
            {
                TileWaitingPlayer removedPlayer;
                playersOnTiles.TryRemove(playerName, out removedPlayer);
            }
        }

        private static bool IsPlayerInDuel(string playerName)
        {
            foreach (var duel in activeDuels.Values)
            {
                if ((duel.Player1Name == playerName || duel.Player2Name == playerName) && 
                    duel.Status == DuelStatus.InProgress)
                {
                    return true;
                }
            }
            return false;
        }

        public static void HandleTileLeave(Player player, short x, short y)
        {
            try
            {
                // Check if player was waiting on a tile and is now leaving
                TileWaitingPlayer waitingPlayer;
                if (playersOnTiles.TryGetValue(player._alias, out waitingPlayer))
                {
                    // Check if they're moving away from their tile
                    bool stillOnTile = false;
                    foreach (var tile in DUELING_TILES)
                    {
                        if (waitingPlayer.DuelType == (tile.Key == "ranked_bo3" ? DuelType.RankedBo3 : DuelType.RankedBo5))
                        {
                            short tileX = tile.Value.Item1;
                            short tileY = tile.Value.Item2;
                            
                            // Check if still within radius
                            if (Math.Abs(x - tileX) <= 1 && Math.Abs(y - tileY) <= 1)
                            {
                                stillOnTile = true;
                                break;
                            }
                        }
                    }

                    if (!stillOnTile)
                    {
                        // Player left the tile, remove them from waiting
                        TileWaitingPlayer removedPlayer;
                        playersOnTiles.TryRemove(player._alias, out removedPlayer);
                        player.sendMessage(-1, "!Cancelled waiting for ranked duel.");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in HandleTileLeave: {0}", ex.Message));
            }
        }

        private static bool IsOnRankedTile(Player player)
        {
            // Check if player is currently on any ranked tile
            short x = (short)(player._state.positionX / 16);
            short y = (short)(player._state.positionY / 16);

            foreach (var tile in DUELING_TILES)
            {
                short tileX = tile.Value.Item1;
                short tileY = tile.Value.Item2;
                
                if (Math.Abs(x - tileX) <= 1 && Math.Abs(y - tileY) <= 1)
                {
                    return true;
                }
            }
            return false;
        }

        private static string GetDuelTypeString(DuelType duelType)
        {
            if (duelType == DuelType.RankedBo3)
                return "Ranked Bo3";
            else if (duelType == DuelType.RankedBo5)
                return "Ranked Bo5";
            else
                return "Unranked";
        }

        private static string GetPlayerWeapon(Player player)
        {
            // Dueling is always done with assault rifles
            return "Assault Rifle";
        }

        private static int GetShotsFired(Player player)
        {
            // Get shots fired from our custom tracking system
            try
            {
                PlayerShotStats stats;
                if (playerShotStats.TryGetValue(player._alias, out stats))
                {
                    return stats.ShotsFired;
                }
                
                return 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error getting shots fired for {0}: {1}", player._alias, ex.Message));
                return 0;
            }
        }

        private static int GetShotsHit(Player player)
        {
            // Get shots hit from our custom tracking system
            try
            {
                PlayerShotStats stats;
                if (playerShotStats.TryGetValue(player._alias, out stats))
                {
                    return stats.ShotsHit;
                }
                
                return 0;
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error getting shots hit for {0}: {1}", player._alias, ex.Message));
                return 0;
            }
        }

        private static int GetPlayerHealth(Player player)
        {
            // Return actual player health, capped at 60 for dueling
            return Math.Min((int)player._state.health, 60);
        }

        private static bool CheckForDoubleHit(string playerName)
        {
            List<DateTime> hits;
            if (!recentDamageHits.TryGetValue(playerName, out hits))
                return false;

            var now = DateTime.Now;
            
            // Get recent hits (within 2 seconds)
            var recentHits = hits.Where(hit => now.Subtract(hit).TotalSeconds <= 2).ToList();
            
            // Check for rapid successive hits (within 500ms)
            if (recentHits.Count >= 2)
            {
                var lastTwoHits = recentHits.Skip(Math.Max(0, recentHits.Count - 2)).ToList();
                return lastTwoHits.All(hit => now.Subtract(hit).TotalMilliseconds <= 500);
            }
            return false;
        }

        private static bool CheckForTripleHit(string playerName)
        {
            List<DateTime> hits;
            if (!recentDamageHits.TryGetValue(playerName, out hits))
                return false;

            var now = DateTime.Now;
            
            // Get recent hits (within 2 seconds)
            var recentHits = hits.Where(hit => now.Subtract(hit).TotalSeconds <= 2).ToList();
            
            // Check for rapid successive hits (within 750ms)
            if (recentHits.Count >= 3)
            {
                var lastThreeHits = recentHits.Skip(Math.Max(0, recentHits.Count - 3)).ToList();
                return lastThreeHits.All(hit => now.Subtract(hit).TotalMilliseconds <= 750);
            }
            return false;
        }

        public static void TrackDamageHit(string playerName)
        {
            // Thread-safe damage hit tracking
            recentDamageHits.AddOrUpdate(
                playerName,
                new List<DateTime> { DateTime.Now },
                (key, existingList) => 
                {
                    existingList.Add(DateTime.Now);
                    return existingList;
                }
            );
        }

        public static void TrackShotFired(Player player)
        {
            // Track shots fired for dueling players
            try
            {
                if (IsPlayerInDuel(player._alias))
                {
                    PlayerShotStats stats;
                    if (!playerShotStats.TryGetValue(player._alias, out stats))
                    {
                        stats = new PlayerShotStats { PlayerName = player._alias };
                        playerShotStats[player._alias] = stats;
                    }
                    stats.ShotsFired++;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error tracking shot fired for {0}: {1}", player._alias, ex.Message));
            }
        }

        public static void TrackShotHit(Player player)
        {
            // Track shots hit for dueling players
            try
            {
                if (IsPlayerInDuel(player._alias))
                {
                    PlayerShotStats stats;
                    if (!playerShotStats.TryGetValue(player._alias, out stats))
                    {
                        stats = new PlayerShotStats { PlayerName = player._alias };
                        playerShotStats[player._alias] = stats;
                    }
                    stats.ShotsHit++;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error tracking shot hit for {0}: {1}", player._alias, ex.Message));
            }
        }

        public static void ResetPlayerShotStats(Player player)
        {
            // Reset shot stats for a player (called at start of duel)
            try
            {
                var stats = new PlayerShotStats { PlayerName = player._alias };
                playerShotStats[player._alias] = stats;
                Console.WriteLine(String.Format("Reset shot stats for {0}", player._alias));
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error resetting shot stats for {0}: {1}", player._alias, ex.Message));
            }
        }

        private static void RemoveExpiredChallenges()
        {
            // Note: This should be called within challengeLock
            var validChallenges = activeChallenges.Where(c => c.IsActive).ToList();
            
            activeChallenges.Clear();
            foreach (var challenge in validChallenges)
            {
                activeChallenges.Add(challenge);
            }
        }

        private static void PopulatePlayerIds(DuelMatch match)
        {
            try
            {
                // For now, just set IDs to null - they will be resolved by the API
                // This avoids async/await compatibility issues with older C# versions
                match.Player1Id = null;
                match.Player2Id = null;
                match.WinnerId = null;

                Console.WriteLine(String.Format("Player ID resolution: {0}(will be resolved by API) vs {1}(will be resolved by API)", 
                    match.Player1Name ?? "unknown",
                    match.Player2Name ?? "unknown"));
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in PopulatePlayerIds: {0}", ex.Message));
            }
        }



        private static async Task ShowPlayerDuelStats(Player requestingPlayer, string targetName)
        {
            // TODO: Fetch stats from website API
            requestingPlayer.sendMessage(-1, String.Format("Fetching duel stats for {0}...", targetName));
            requestingPlayer.sendMessage(-1, "Visit https://freeinf.org/dueling for detailed statistics!");
        }

        private static async Task SendDuelMatchToWebsite(DuelMatch match)
        {
            try
            {
                string jsonString = BuildMatchJsonString(match);
                Console.WriteLine(String.Format("Sending duel match to {0} ({1})", 
                    USE_LOCAL_API ? "LOCAL" : "PRODUCTION", DUELING_API_ENDPOINT));
                Console.WriteLine(String.Format("JSON Length: {0}", jsonString.Length));
                Console.WriteLine(String.Format("JSON: {0}", jsonString));
                Console.WriteLine(String.Format("First 50 chars: {0}", jsonString.Length > 50 ? jsonString.Substring(0, 50) : jsonString));

                var content = new StringContent(jsonString, System.Text.Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync(DUELING_API_ENDPOINT, content);

                if (response.IsSuccessStatusCode)
                {
                    string responseText = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("Duel match data sent successfully for {0} vs {1}: {2}", match.Player1Name, match.Player2Name, responseText));
                }
                else
                {
                    string errorText = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("Failed to send duel match data ({0}): {1}", response.StatusCode, errorText));
                    Console.WriteLine(String.Format("Request JSON was: {0}", jsonString));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error sending duel match data: {0}", ex.Message));
            }
        }

        private static string BuildMatchJsonString(DuelMatch match)
        {
            // Manual JSON serialization for older C# versions
            try
            {
                if (match == null) return "{}";
                
                var sb = new System.Text.StringBuilder();
                sb.Append("{");
                
                // Add match type
                string matchType = match.MatchType.ToString().ToLower().Replace("ranked", "ranked_");
                sb.AppendFormat("\"matchType\":\"{0}\",", EscapeJsonString(matchType));
                
                // Add player names and IDs (IDs will be null for unregistered players)
                sb.AppendFormat("\"player1Name\":\"{0}\",", EscapeJsonString(match.Player1Name ?? ""));
                sb.AppendFormat("\"player2Name\":\"{0}\",", EscapeJsonString(match.Player2Name ?? ""));
                sb.AppendFormat("\"player1_id\":{0},", match.Player1Id == null ? "null" : String.Format("\"{0}\"", EscapeJsonString(match.Player1Id)));
                sb.AppendFormat("\"player2_id\":{0},", match.Player2Id == null ? "null" : String.Format("\"{0}\"", EscapeJsonString(match.Player2Id)));
                sb.AppendFormat("\"winnerName\":\"{0}\",", EscapeJsonString(match.WinnerName ?? ""));
                sb.AppendFormat("\"winner_id\":{0},", match.WinnerId == null ? "null" : String.Format("\"{0}\"", EscapeJsonString(match.WinnerId)));
                sb.AppendFormat("\"arenaName\":\"{0}\",", EscapeJsonString(match.ArenaName ?? ""));
                
                // Add rounds array
                sb.Append("\"rounds\":[");
                
                // Track overall match stats for both players
                int player1ShotsFired = 0, player1ShotsHit = 0, player1DoubleHits = 0, player1TripleHits = 0;
                int player2ShotsFired = 0, player2ShotsHit = 0, player2DoubleHits = 0, player2TripleHits = 0;
                
                if (match.Rounds != null && match.Rounds.Count > 0)
                {
                    for (int i = 0; i < match.Rounds.Count; i++)
                    {
                        if (i > 0) sb.Append(",");
                        
                        var round = match.Rounds[i];
                        sb.Append("{");
                        sb.AppendFormat("\"round_number\":{0},", round.RoundNumber);
                        sb.AppendFormat("\"winner_name\":\"{0}\",", EscapeJsonString(round.WinnerName ?? ""));
                        sb.AppendFormat("\"loser_name\":\"{0}\",", EscapeJsonString(round.LoserName ?? ""));
                        sb.AppendFormat("\"winner_hp\":{0},", round.WinnerHpLeft);
                        sb.AppendFormat("\"loser_hp\":{0},", round.LoserHpLeft);
                        sb.AppendFormat("\"duration_seconds\":{0},", round.DurationSeconds);
                        
                        // Add kills array
                        sb.Append("\"kills\":[");
                        if (round.Kills != null && round.Kills.Count > 0)
                        {
                            for (int j = 0; j < round.Kills.Count; j++)
                            {
                                if (j > 0) sb.Append(",");
                                
                                var kill = round.Kills[j];
                                sb.Append("{");
                                sb.AppendFormat("\"killerName\":\"{0}\",", EscapeJsonString(kill.KillerName ?? ""));
                                sb.AppendFormat("\"victimName\":\"{0}\",", EscapeJsonString(kill.VictimName ?? ""));
                                sb.AppendFormat("\"weaponUsed\":\"{0}\",", EscapeJsonString(kill.WeaponUsed ?? ""));
                                sb.AppendFormat("\"damageDealt\":{0},", kill.DamageDealt);
                                sb.AppendFormat("\"victimHpBefore\":{0},", kill.VictimHpBefore);
                                sb.AppendFormat("\"victimHpAfter\":{0},", kill.VictimHpAfter);
                                sb.AppendFormat("\"shotsFired\":{0},", kill.ShotsFired);
                                sb.AppendFormat("\"shotsHit\":{0},", kill.ShotsHit);
                                sb.AppendFormat("\"isDoubleHit\":{0},", kill.IsDoubleHit.ToString().ToLower());
                                sb.AppendFormat("\"isTripleHit\":{0}", kill.IsTripleHit.ToString().ToLower());
                                sb.Append("}");
                                
                                // Accumulate stats for overall match totals
                                if (kill.KillerName == match.Player1Name)
                                {
                                    player1ShotsFired += kill.ShotsFired;
                                    player1ShotsHit += kill.ShotsHit;
                                    if (kill.IsDoubleHit) player1DoubleHits++;
                                    if (kill.IsTripleHit) player1TripleHits++;
                                }
                                else if (kill.KillerName == match.Player2Name)
                                {
                                    player2ShotsFired += kill.ShotsFired;
                                    player2ShotsHit += kill.ShotsHit;
                                    if (kill.IsDoubleHit) player2DoubleHits++;
                                    if (kill.IsTripleHit) player2TripleHits++;
                                }
                            }
                        }
                        sb.Append("]}");
                    }
                }
                
                sb.Append("],");
                
                // Add overall match statistics
                sb.Append("\"match_stats\":{");
                
                double player1Accuracy = player1ShotsFired > 0 ? (double)player1ShotsHit / player1ShotsFired : 0.0;
                double player2Accuracy = player2ShotsFired > 0 ? (double)player2ShotsHit / player2ShotsFired : 0.0;
                
                sb.AppendFormat("\"player1_accuracy\":{0},", player1Accuracy.ToString("F4", System.Globalization.CultureInfo.InvariantCulture));
                sb.AppendFormat("\"player1_shots_fired\":{0},", player1ShotsFired);
                sb.AppendFormat("\"player1_shots_hit\":{0},", player1ShotsHit);
                sb.AppendFormat("\"player1_double_hits\":{0},", player1DoubleHits);
                sb.AppendFormat("\"player1_triple_hits\":{0},", player1TripleHits);
                sb.AppendFormat("\"player2_accuracy\":{0},", player2Accuracy.ToString("F4", System.Globalization.CultureInfo.InvariantCulture));
                sb.AppendFormat("\"player2_shots_fired\":{0},", player2ShotsFired);
                sb.AppendFormat("\"player2_shots_hit\":{0},", player2ShotsHit);
                sb.AppendFormat("\"player2_double_hits\":{0},", player2DoubleHits);
                sb.AppendFormat("\"player2_triple_hits\":{0}", player2TripleHits);
                
                sb.Append("}}");
                
                return sb.ToString();
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error building match JSON: {0}", ex.Message));
                return "{}";
            }
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

    public class InGameRegistration
    {
        private static readonly HttpClient httpClient = new HttpClient();
        //private const string REGISTRATION_API_ENDPOINT = "http://localhost:3000/api/in-game-register"; // Change to your actual domain in production
        private const string REGISTRATION_API_ENDPOINT = "https://freeinf.org/api/in-game-register";
        
        /// <summary>
        /// Handles the ?register command for in-game registration
        /// Usage: ?register email@example.com
        /// </summary>
        public static async Task HandleRegisterCommand(Player player, string command, string payload)
        {
            try
            {
                // Parse the email from the command
                string email = payload.Trim();
                
                if (string.IsNullOrEmpty(email))
                {
                    player.sendMessage(-1, "Usage: ?register your-email@example.com");
                    player.sendMessage(-1, "Example: ?register john.doe@gmail.com");
                    return;
                }
                
                // Validate email format
                if (!IsValidEmail(email))
                {
                    player.sendMessage(-1, "Invalid email format. Please use a valid email address.");
                    player.sendMessage(-1, "Example: ?register john.doe@gmail.com");
                    return;
                }
                
                // Get player's current alias
                string alias = player._alias;
                
                if (string.IsNullOrEmpty(alias))
                {
                    player.sendMessage(-1, "Error: Could not determine your in-game alias.");
                    return;
                }
                
                // Validate alias (basic checks)
                // if (alias.Length < 2)
                // {
                //     player.sendMessage(-1, "Your alias is too short for registration. Please use a longer alias.");
                //     return;
                // }
                
                if (alias.Length > 20)
                {
                    player.sendMessage(-1, "Your alias is too long for registration. Please use a shorter alias.");
                    return;
                }
                
                // Send registration request to web API
                player.sendMessage(-1, "Processing registration request...");
                
                bool success = await SendRegistrationRequest(alias, email);
                
                if (success)
                {
                    player.sendMessage(-1, "=== REGISTRATION INITIATED ===");
                    player.sendMessage(-1, String.Format("Alias: {0}", alias));
                    player.sendMessage(-1, String.Format("Email: {0}", email));
                    player.sendMessage(-1, "");
                    player.sendMessage(-1, "Check your email to complete registration!");
                    player.sendMessage(-1, "You'll receive a verification link to set your password.");
                    player.sendMessage(-1, "");
                    player.sendMessage(-1, "After completing registration, you can:");
                    player.sendMessage(-1, "• Purchase donation perks");
                    player.sendMessage(-1, "• Access your dashboard");
                    player.sendMessage(-1, "• View your donation history");
                    
                    // Log the registration attempt
                    Console.WriteLine(String.Format("Player {0} initiated registration with email {1}", alias, email));
                }
                else
                {
                    player.sendMessage(-1, "Registration failed. Please try again later.");
                    player.sendMessage(-1, "If the problem persists, contact an administrator.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in HandleRegisterCommand: {0}", ex.Message));
                player.sendMessage(-1, "An error occurred during registration. Please try again later.");
            }
        }
        
        /// <summary>
        /// Sends registration request to the web API
        /// </summary>
        private static async Task<bool> SendRegistrationRequest(string alias, string email)
        {
            try
            {
                // Create JSON payload
                string jsonData = String.Format("{{\"alias\":\"{0}\",\"email\":\"{1}\"}}", 
                    EscapeJsonString(alias), 
                    EscapeJsonString(email));
                
                var content = new StringContent(jsonData, System.Text.Encoding.UTF8, "application/json");
                var response = await httpClient.PostAsync(REGISTRATION_API_ENDPOINT, content);
                
                if (response.IsSuccessStatusCode)
                {
                    string responseContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("Registration API response: {0}", responseContent));
                    return true;
                }
                else
                {
                    string errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("Registration API error ({0}): {1}", response.StatusCode, errorContent));
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error sending registration request: {0}", ex.Message));
                return false;
            }
        }
        
        /// <summary>
        /// Validates email format using regex
        /// </summary>
        private static bool IsValidEmail(string email)
        {
            if (string.IsNullOrEmpty(email))
                return false;
                
            try
            {
                // Basic email validation regex
                string pattern = @"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$";
                return Regex.IsMatch(email, pattern);
            }
            catch
            {
                return false;
            }
        }
        
        /// <summary>
        /// Escapes special characters for JSON
        /// </summary>
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
        
        /// <summary>
        /// Handles the ?checkregistration command to check registration status
        /// </summary>
        public static async Task HandleCheckRegistrationCommand(Player player, string command, string payload)
        {
            try
            {
                string alias = player._alias;
                
                player.sendMessage(0, "=== REGISTRATION STATUS ===");
                player.sendMessage(0, String.Format("Current Alias: {0}", alias));
                player.sendMessage(0, "");
                player.sendMessage(0, "To register for the donation system:");
                player.sendMessage(0, "1. Use: ?register your-email@example.com");
                player.sendMessage(0, "2. Check your email for verification link");
                player.sendMessage(0, "3. Set your password to complete registration");
                player.sendMessage(0, "4. Access your dashboard at the website");
                // player.sendMessage(0, "");
                // player.sendMessage(0, "Benefits of registering:");
                // player.sendMessage(0, "• Purchase exclusive donation perks");
                // player.sendMessage(0, "• Custom kill messages");
                // player.sendMessage(0, "• Special weapons and abilities");
                // player.sendMessage(0, "• Support server development");
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in HandleCheckRegistrationCommand: {0}", ex.Message));
                player.sendMessage(-1, "An error occurred. Please try again later.");
            }
        }
    }

    public class PlayerStatsIntegration
    {
        private static readonly HttpClient httpClient = new HttpClient();
        // Use localhost for development, production URL for live server
        private const string STATS_API_ENDPOINT = "http://localhost:3000/api/player-stats";
        // If you need to use production: "https://freeinf.org/api/player-stats"
        
        public static async Task SendPlayerStatsToWebsite(List<PlayerStatData> playerStats, string gameId = null)
        {
            try
            {
                if (playerStats == null || playerStats.Count == 0)
                {
                    Console.WriteLine("No player stats to send");
                    return;
                }

                // Console.WriteLine(String.Format("Attempting to send stats for {0} players to {1}", playerStats.Count, STATS_API_ENDPOINT));

                // Create the payload
                var payload = new
                {
                    gameId = gameId,
                    gameDate = DateTime.UtcNow.ToString("O"), // ISO 8601 format
                    players = playerStats.Select(p => new
                    {
                        playerName = p.PlayerName,
                        team = p.Team,
                        gameMode = p.GameMode,
                        arenaName = p.ArenaName,
                        baseUsed = p.BaseUsed,
                        side = p.Side,
                        result = p.Result,
                        mainClass = p.MainClass,
                        kills = p.Kills,
                        deaths = p.Deaths,
                        captures = p.Captures,
                        carrierKills = p.CarrierKills,
                        carryTimeSeconds = p.CarryTimeSeconds,
                        classSwaps = p.ClassSwaps,
                        turretDamage = p.TurretDamage,
                        ebHits = p.EBHits,
                        accuracy = p.Accuracy,
                        avgResourceUnusedPerDeath = p.AvgResourceUnusedPerDeath,
                        avgExplosiveUnusedPerDeath = p.AvgExplosiveUnusedPerDeath,
                        gameLengthMinutes = p.GameLengthMinutes
                    }).ToList()
                };

                // Manually construct JSON string (no external libraries needed)
                string jsonData = BuildPlayerStatsJsonString(payload);
                // Console.WriteLine(String.Format("JSON payload length: {0} characters", jsonData.Length));
                // Console.WriteLine(String.Format("JSON payload preview: {0}...", jsonData.Substring(0, Math.Min(200, jsonData.Length))));
                
                // Send to API
                var content = new StringContent(jsonData, System.Text.Encoding.UTF8, "application/json");
                
                // Console.WriteLine("Sending HTTP POST request...");
                var response = await httpClient.PostAsync(STATS_API_ENDPOINT, content);
                
                if (response.IsSuccessStatusCode)
                {
                    string responseContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("✓ Player stats sent successfully for {0} players. Response: {1}", playerStats.Count, responseContent));
                }
                else
                {
                    string responseContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine(String.Format("✗ Failed to send player stats: {0} ({1}) - {2}", (int)response.StatusCode, response.StatusCode, responseContent));
                }
            }
            catch (System.Net.Http.HttpRequestException httpEx)
            {
                Console.WriteLine(String.Format("✗ HTTP Error sending player stats: {0}", httpEx.Message));
                if (httpEx.InnerException != null)
                {
                    Console.WriteLine(String.Format("  Inner Exception: {0}", httpEx.InnerException.Message));
                }
            }
            catch (System.Threading.Tasks.TaskCanceledException tcEx)
            {
                Console.WriteLine(String.Format("✗ Timeout error sending player stats: {0}", tcEx.Message));
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("✗ Unexpected error sending player stats: {0}", ex.Message));
                Console.WriteLine(String.Format("  Exception Type: {0}", ex.GetType().Name));
                if (ex.InnerException != null)
                {
                    Console.WriteLine(String.Format("  Inner Exception: {0}", ex.InnerException.Message));
                }
            }
        }
        
        private static string BuildPlayerStatsJsonString(object payload)
        {
            var json = new System.Text.StringBuilder();
            json.Append("{");
            
            // Add gameId if available
            var payloadType = payload.GetType();
            var gameIdProp = payloadType.GetProperty("gameId");
            var gameId = gameIdProp.GetValue(payload);
            if (gameId != null)
            {
                json.AppendFormat("\"gameId\":\"{0}\",", EscapeJsonString(gameId.ToString()));
            }
            
            // Add gameDate
            var gameDateProp = payloadType.GetProperty("gameDate");
            var gameDate = gameDateProp.GetValue(payload);
            if (gameDate != null)
            {
                json.AppendFormat("\"gameDate\":\"{0}\",", EscapeJsonString(gameDate.ToString()));
            }
            
            // Add players array
            var playersProp = payloadType.GetProperty("players");
            var players = playersProp.GetValue(payload) as System.Collections.IEnumerable;
            
            json.Append("\"players\":[");
            
            if (players != null)
            {
                bool isFirst = true;
                foreach (var player in players)
                {
                    if (!isFirst) json.Append(",");
                    isFirst = false;
                    
                    json.Append("{");
                    
                    // Add all player properties
                    var playerType = player.GetType();
                    var properties = playerType.GetProperties();
                    
                    bool isFirstProp = true;
                    foreach (var prop in properties)
                    {
                        if (!isFirstProp) json.Append(",");
                        isFirstProp = false;
                        
                        var value = prop.GetValue(player);
                        string jsonValue;
                        
                        if (value == null)
                        {
                            jsonValue = "null";
                        }
                        else if (value is string)
                        {
                            jsonValue = String.Format("\"{0}\"", EscapeJsonString(value.ToString()));
                        }
                        else if (value is bool)
                        {
                            jsonValue = value.ToString().ToLower();
                        }
                        else if (value is int || value is double || value is decimal || value is float)
                        {
                            jsonValue = value.ToString();
                        }
                        else
                        {
                            jsonValue = String.Format("\"{0}\"", EscapeJsonString(value.ToString()));
                        }
                        
                        json.AppendFormat("\"{0}\":{1}", prop.Name, jsonValue);
                    }
                    
                    json.Append("}");
                }
            }
            
            json.Append("]}");
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
        
        // Test method to verify the integration works
        public static async Task TestPlayerStatsIntegration()
        {
            Console.WriteLine("Testing Player Stats Integration...");
            
            var testStats = new List<PlayerStatData>
            {
                new PlayerStatData
                {
                    PlayerName = "TestPlayer",
                    Team = "0",
                    GameMode = "CTF",
                    ArenaName = "TestArena",
                    BaseUsed = "TestBase",
                    Side = "Titan",
                    Result = "Win",
                    MainClass = "Warrior",
                    Kills = 5,
                    Deaths = 2,
                    Captures = 1,
                    CarrierKills = 0,
                    CarryTimeSeconds = 30,
                    ClassSwaps = 1,
                    TurretDamage = 100,
                    EBHits = 3,
                    Accuracy = 75.5,
                    AvgResourceUnusedPerDeath = 2.5,
                    AvgExplosiveUnusedPerDeath = 1.2,
                    GameLengthMinutes = 10.5
                }
            };
            
            await SendPlayerStatsToWebsite(testStats, "TEST_GAME_" + DateTime.UtcNow.ToString("yyyyMMdd_HHmmss"));
        }
    }

    // New data class for player stats
    public class PlayerStatData
    {
        public string PlayerName { get; set; }
        public string Team { get; set; }
        public string GameMode { get; set; }
        public string ArenaName { get; set; }
        public string BaseUsed { get; set; }
        public string Side { get; set; }
        public string Result { get; set; }
        public string MainClass { get; set; }
        public int Kills { get; set; }
        public int Deaths { get; set; }
        public int Captures { get; set; }
        public int CarrierKills { get; set; }
        public int CarryTimeSeconds { get; set; }
        public int ClassSwaps { get; set; }
        public int TurretDamage { get; set; }
        public int EBHits { get; set; }
        public double Accuracy { get; set; }
        public double AvgResourceUnusedPerDeath { get; set; }
        public double AvgExplosiveUnusedPerDeath { get; set; }
        public double GameLengthMinutes { get; set; }
    }
} 