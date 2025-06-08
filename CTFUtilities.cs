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
                    json.AppendFormat("\"weapon\":\"{0}\"", player.weapon);
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