using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Net.Http;
using System.Linq;
using System.Text.RegularExpressions;

using InfServer.Game;
using InfServer.Scripting;
using InfServer.Protocol;
using InfServer.Logic;

using Assets;

public class CustomPhrase
{
    public string in_game_alias { get; set; }
    public string custom_phrase { get; set; }
    public DateTime expires_at { get; set; }
    public bool is_active { get; set; }
}

public class PhraseExplosionManager
{
    private static Dictionary<string, string> playerPhrases = new Dictionary<string, string>();
    private static DateTime lastCacheUpdate = DateTime.MinValue;
    private static readonly TimeSpan cacheExpiryTime = TimeSpan.FromMinutes(5);
    
    // Supabase configuration
    private const string SUPABASE_URL = "https://nkinpmqnbcjaftqduujf.supabase.co";
    private const string SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMjA0NzYsImV4cCI6MjA2MzY5NjQ3Nn0.83gXbk6MVOI341RBW7h_SXeSZcIIgI9BOBUX5e0ivv8";
    private const string PHRASES_API_ENDPOINT = SUPABASE_URL + "/rest/v1/rpc/get_simple_player_phrases";
    
    // Static test data for debugging - remove this once HTTP works
    private static Dictionary<string, string> testPhrases = new Dictionary<string, string>
    {
        { "axidus", "60" },
        { "mike", "DADDYCHILLLL" },
        { "soup", "NOSOUP4U" },
        { "test", "HELLO WORLD" }
    };
    
    public static async Task<string> GetPlayerPhrase(string playerAlias)
    {
        try
        {
            Console.WriteLine(String.Format("Getting phrase for player: {0}", playerAlias));
            
            // For now, use test data - we'll enable HTTP once we get basic functionality working
            string testPhrase = GetTestPhrase(playerAlias);
            if (!String.IsNullOrEmpty(testPhrase))
            {
                Console.WriteLine(String.Format("Found test phrase for {0}: {1}", playerAlias, testPhrase));
                return testPhrase;
            }
            
            // Try HTTP request (this is what we're debugging)
            if (DateTime.Now - lastCacheUpdate > cacheExpiryTime)
            {
                Console.WriteLine("Cache expired, attempting HTTP refresh...");
                await RefreshPhrasesCache();
            }
            
            if (playerPhrases.ContainsKey(playerAlias.ToLower()))
            {
                string phrase = playerPhrases[playerAlias.ToLower()];
                Console.WriteLine(String.Format("Found cached phrase for {0}: {1}", playerAlias, phrase));
                return phrase;
            }
            
            Console.WriteLine(String.Format("No phrase found for {0}, using default", playerAlias));
            return "BLOOP!";
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error getting player phrase for {0}: {1}", playerAlias, ex.Message));
            return "BLOOP!";
        }
    }
    
    private static string GetTestPhrase(string playerAlias)
    {
        if (testPhrases.ContainsKey(playerAlias.ToLower()))
        {
            return testPhrases[playerAlias.ToLower()];
        }
        return null;
    }
    
    private static async Task RefreshPhrasesCache()
    {
        try
        {
            Console.WriteLine("=== Starting HTTP request to Supabase ===");
            
            using (var handler = new HttpClientHandler())
            {
                // Disable SSL validation for testing
                handler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                
                using (var client = new HttpClient(handler))
                {
                    client.Timeout = TimeSpan.FromSeconds(10); // Shorter timeout for testing
                    
                    Console.WriteLine(String.Format("Setting headers for request to: {0}", PHRASES_API_ENDPOINT));
                    client.DefaultRequestHeaders.Add("apikey", SUPABASE_ANON_KEY);
                    client.DefaultRequestHeaders.Add("Authorization", String.Format("Bearer {0}", SUPABASE_ANON_KEY));
                    client.DefaultRequestHeaders.Add("User-Agent", "CTF-Test/1.0");
                    
                    var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
                    
                    Console.WriteLine("Sending POST request...");
                    var response = await client.PostAsync(PHRASES_API_ENDPOINT, content);
                    
                    Console.WriteLine(String.Format("Response Status: {0}", response.StatusCode));
                    
                    if (response.IsSuccessStatusCode)
                    {
                        string jsonResponse = await response.Content.ReadAsStringAsync();
                        Console.WriteLine(String.Format("Response received: {0} characters", jsonResponse.Length));
                        Console.WriteLine(String.Format("Response preview: {0}", jsonResponse.Substring(0, Math.Min(200, jsonResponse.Length))));
                        
                        var phrases = ParsePhrasesJson(jsonResponse);
                        Console.WriteLine(String.Format("Parsed {0} phrases", phrases.Count));
                        
                        playerPhrases.Clear();
                        foreach (var phrase in phrases)
                        {
                            if (!String.IsNullOrEmpty(phrase.in_game_alias) && !String.IsNullOrEmpty(phrase.custom_phrase))
                            {
                                playerPhrases[phrase.in_game_alias.ToLower()] = phrase.custom_phrase;
                                Console.WriteLine(String.Format("Cached: {0} -> {1}", phrase.in_game_alias, phrase.custom_phrase));
                            }
                        }
                        
                        lastCacheUpdate = DateTime.Now;
                        Console.WriteLine(String.Format("Cache updated with {0} phrases", playerPhrases.Count));
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
            Console.WriteLine(String.Format("Request timeout: {0}", tcEx.Message));
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("General error: {0}", ex.Message));
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
            json = json.Trim();
            if (json.StartsWith("[") && json.EndsWith("]"))
            {
                json = json.Substring(1, json.Length - 2);
                
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
            Console.WriteLine(String.Format("Error parsing JSON: {0}", ex.Message));
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
            phrase.in_game_alias = ExtractJsonValue(json, "in_game_alias");
            phrase.custom_phrase = ExtractJsonValue(json, "custom_phrase");
            phrase.is_active = true;
            phrase.expires_at = DateTime.MaxValue;
            
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
        
        if (json[start] == '"')
        {
            start++;
            int end = json.IndexOf('"', start);
            if (end == -1) return "";
            return json.Substring(start, end - start);
        }
        
        int valueEnd = json.IndexOfAny(new char[] { ',', '}' }, start);
        if (valueEnd == -1) valueEnd = json.Length;
        
        return json.Substring(start, valueEnd - start).Trim();
    }
    
    public static Dictionary<string, string> GetCachedPhrases()
    {
        return new Dictionary<string, string>(playerPhrases);
    }
    
    public static void AddTestPhrase(string alias, string phrase)
    {
        testPhrases[alias.ToLower()] = phrase;
        Console.WriteLine(String.Format("Added test phrase: {0} -> {1}", alias, phrase));
    }
}

public static class ExplosionHelper
{
    public static async Task CreateCustomExplosion(Arena arena, Player killerPlayer, short posX, short posY, short posZ)
    {
        try
        {
            Console.WriteLine(String.Format("Creating custom explosion for killer: {0} at position {1},{2}", killerPlayer._alias, posX, posY));
            
            string customPhrase = await PhraseExplosionManager.GetPlayerPhrase(killerPlayer._alias);
            Console.WriteLine(String.Format("Using phrase: {0}", customPhrase));
            
            CreateTextExplosion(arena, customPhrase, posX, posY, posZ, killerPlayer);
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error creating custom explosion: {0}", ex.Message));
            CreateTextExplosion(arena, "BLOOP!", posX, posY, posZ, killerPlayer);
        }
    }
    
    private static void CreateTextExplosion(Arena arena, string text, short x, short y, short z, Player from)
    {
        Console.WriteLine(String.Format("Creating text explosion: '{0}'", text));
        
        int xOffset = 10;
        
        for (int i = 0; i < text.Length; i++)
        {
            char letter = text[i];
            if (letter == ' ') continue;
            
            ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
            if (letterWep != null)
            {
                short newPosX = (short)(x + (i * xOffset));
                
                SC_Projectile letterExplosion = new SC_Projectile
                {
                    projectileID = (short)letterWep.id,
                    playerID = (ushort)from._id,
                    posX = newPosX,
                    posY = y,
                    posZ = z,
                    yaw = from._state.yaw
                };
                
                foreach (Player p in arena.Players)
                {
                    p._client.sendReliable(letterExplosion);
                }
                
                Console.WriteLine(String.Format("Spawned letter '{0}' at {1},{2}", letter, newPosX, y));
            }
            else
            {
                Console.WriteLine(String.Format("Could not find asset for letter: {0}", letter));
            }
        }
    }
}

class Script_CTF : Scripts.IScript
{
    private Arena arena;
    
    public bool init(IEventObject invoker)
    {
        arena = invoker as Arena;
        return true;
    }
    
    [Scripts.Event("Player.Death")]
    public bool playerDeath(Player victim, Player killer, Helpers.KillType killType, CS_VehicleDeath update)
    {
        if (killer != null)
        {
            Console.WriteLine(String.Format("Player death: {0} killed {1}", killer._alias, victim._alias));
            
            try
            {
                ExplosionHelper.CreateCustomExplosion(arena, killer, victim._state.positionX, victim._state.positionY, victim._state.positionZ);
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in death handler: {0}", ex.Message));
            }
        }
        
        return true;
    }
    
    [Scripts.Event("Player.PlayerMessage")]
    public bool playerMessage(Player player, CS_ChatQuery query)
    {
        string message = query.payload.Trim();
        
        if (message.StartsWith("?"))
        {
            string[] parts = message.Substring(1).Split(' ');
            string command = parts[0].ToLower();
            
            if (command == "testphrase")
            {
                TestPhraseCommand(player);
                return false;
            }
            
            if (command == "addphrase" && parts.Length >= 3)
            {
                string alias = parts[1];
                string phrase = String.Join(" ", parts.Skip(2));
                PhraseExplosionManager.AddTestPhrase(alias, phrase);
                player.sendMessage(0, String.Format("Added test phrase for {0}: {1}", alias, phrase));
                return false;
            }
            
            if (command == "testexplosion")
            {
                TestExplosion(player);
                return false;
            }
        }
        
        return true;
    }
    
    private async void TestPhraseCommand(Player player)
    {
        try
        {
            player.sendMessage(0, "=== Testing Phrase System ===");
            
            // Test getting player's phrase
            string phrase = await PhraseExplosionManager.GetPlayerPhrase(player._alias);
            player.sendMessage(0, String.Format("Your phrase: '{0}'", phrase));
            
            // Show cached phrases
            var cached = PhraseExplosionManager.GetCachedPhrases();
            player.sendMessage(0, String.Format("Cached phrases: {0}", cached.Count));
            
            if (cached.Count > 0)
            {
                player.sendMessage(0, "Sample phrases:");
                int count = 0;
                foreach (var kvp in cached)
                {
                    if (count >= 3) break;
                    player.sendMessage(0, String.Format("  {0}: {1}", kvp.Key, kvp.Value));
                    count++;
                }
            }
        }
        catch (Exception ex)
        {
            player.sendMessage(0, String.Format("Error: {0}", ex.Message));
        }
    }
    
    private async void TestExplosion(Player player)
    {
        try
        {
            player.sendMessage(0, "Creating test explosion...");
            await ExplosionHelper.CreateCustomExplosion(arena, player, player._state.positionX, player._state.positionY, player._state.positionZ);
        }
        catch (Exception ex)
        {
            player.sendMessage(0, String.Format("Explosion error: {0}", ex.Message));
        }
    }
} 