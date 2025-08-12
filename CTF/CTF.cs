using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Net.Http;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Runtime.CompilerServices;
using System.Threading;
using System.IO;
using System.Reflection;
using Microsoft.CSharp;
using CTFGameType;

using InfServer.Game;
using InfServer.Scripting;
using InfServer.Protocol;
using InfServer.Logic;
using InfServer.Bots;
// using InfServer.Script.CTFBot;
// using InfServer.Script.GameType_CTF_TDM;

using Assets;

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
    public class ProductPurchaseManager
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private static Dictionary<string, List<string>> playerPurchases = new Dictionary<string, List<string>>();
        private static DateTime lastCacheUpdate = DateTime.MinValue;
        private static readonly TimeSpan cacheExpiryTime = TimeSpan.FromMinutes(10); // Cache for 10 minutes
        
        // Your Supabase configuration (same as phrase manager)
        private const string SUPABASE_URL = "https://nkinpmqnbcjaftqduujf.supabase.co";
        private const string SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4";
        private const string PURCHASES_API_ENDPOINT = SUPABASE_URL + "/rest/v1/rpc/get_player_product_purchases";
        
        /// <summary>
        /// Item alias mappings - maps short names to full item names
        /// </summary>
        private static readonly Dictionary<string, string> ITEM_ALIASES = new Dictionary<string, string>
        {
            { "caw", "Kuchler A6 CAW" },
            { "ar", "Assault Rifle" },
            { "rpg", "RPG" },
            // Add more aliases as needed
        };

        /// <summary>
        /// Product conversion mappings - add new products here
        /// </summary>
        private static readonly Dictionary<string, Dictionary<string, string>> PRODUCT_CONVERSIONS = new Dictionary<string, Dictionary<string, string>>
        {
            {
                "rainbow_caw", new Dictionary<string, string>
                {
                    { "Kuchler A6 CAW", "Rainbow CAW" },
                    { "kuchler a6 caw", "Rainbow CAW" },
                    { "caw", "Rainbow CAW" }
                }
            }
            // Add more products here as needed:
            // {
            //     "premium_rifle", new Dictionary<string, string>
            //     {
            //         { "Assault Rifle", "Premium AR" }
            //     }
            // }
        };

        public static async Task<List<string>> GetPlayerProducts(string playerAlias)
        {
            try
            {
                // Check if cache needs refreshing
                if (DateTime.Now - lastCacheUpdate > cacheExpiryTime)
                {
                    await RefreshPurchasesCache();
                }
                
                // Return products if found, otherwise return empty list
                if (playerPurchases.ContainsKey(playerAlias.ToLower()))
                {
                    return playerPurchases[playerAlias.ToLower()];
                }
                
                return new List<string>(); // No products found
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error getting player products for {0}: {1}", playerAlias, ex.Message));
                return new List<string>(); // Return empty list on error
            }
        }

        public static async Task<bool> HasPlayerPurchased(string playerAlias, string productName)
        {
            var products = await GetPlayerProducts(playerAlias);
            return products.Any(p => p.Equals(productName, StringComparison.OrdinalIgnoreCase));
        }

        private static async Task RefreshPurchasesCache()
        {
            try
            {
                using (var handler = new HttpClientHandler())
                {
                    handler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                    handler.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;
                    
                    using (var client = new HttpClient(handler))
                    {
                        client.Timeout = TimeSpan.FromSeconds(30);
                        
                        client.DefaultRequestHeaders.Add("User-Agent", "CTF-Game/1.0");
                        client.DefaultRequestHeaders.Add("apikey", SUPABASE_SERVICE_ROLE_KEY);
                        client.DefaultRequestHeaders.Add("Authorization", string.Format("Bearer {0}", SUPABASE_SERVICE_ROLE_KEY));
                        
                        var content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
                        
                        Console.WriteLine(string.Format("Refreshing product purchases cache from: {0}", PURCHASES_API_ENDPOINT));
                        
                        var response = await client.PostAsync(PURCHASES_API_ENDPOINT, content);
                        
                        if (response.IsSuccessStatusCode)
                        {
                            string jsonResponse = await response.Content.ReadAsStringAsync();
                            var purchases = ParsePurchasesJson(jsonResponse);
                            
                            // Update cache
                            playerPurchases.Clear();
                            foreach (var purchase in purchases)
                            {
                                if (!string.IsNullOrEmpty(purchase.PlayerAlias) && !string.IsNullOrEmpty(purchase.ProductName))
                                {
                                    string playerKey = purchase.PlayerAlias.ToLower();
                                    if (!playerPurchases.ContainsKey(playerKey))
                                        playerPurchases[playerKey] = new List<string>();
                                    
                                    playerPurchases[playerKey].Add(purchase.ProductName);
                                }
                            }
                            
                            lastCacheUpdate = DateTime.Now;
                            Console.WriteLine(string.Format("Product purchases cache refreshed: {0} players with purchases", playerPurchases.Count));
                        }
                        else
                        {
                            string errorContent = await response.Content.ReadAsStringAsync();
                            Console.WriteLine(string.Format("HTTP Error {0}: {1}", response.StatusCode, errorContent));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error refreshing purchases cache: {0}", ex.Message));
            }
        }

        private static List<ProductPurchase> ParsePurchasesJson(string json)
        {
            var purchases = new List<ProductPurchase>();
            
            try
            {
                // Simple JSON parsing similar to phrase manager
                json = json.Trim();
                if (json.StartsWith("[") && json.EndsWith("]"))
                {
                    json = json.Substring(1, json.Length - 2); // Remove array brackets
                    
                    var objects = SplitJsonObjects(json);
                    foreach (var obj in objects)
                    {
                        var purchase = ParseSinglePurchase(obj);
                        if (purchase != null)
                            purchases.Add(purchase);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error parsing purchases JSON: {0}", ex.Message));
            }
            
            return purchases;
        }

        private static List<string> SplitJsonObjects(string json)
        {
            var objects = new List<string>();
            int depth = 0;
            int startIndex = 0;
            
            for (int i = 0; i < json.Length; i++)
            {
                if (json[i] == '{')
                    depth++;
                else if (json[i] == '}')
                {
                    depth--;
                    if (depth == 0)
                    {
                        objects.Add(json.Substring(startIndex, i - startIndex + 1));
                        // Skip comma and whitespace
                        while (i + 1 < json.Length && (json[i + 1] == ',' || char.IsWhiteSpace(json[i + 1])))
                            i++;
                        startIndex = i + 1;
                    }
                }
            }
            
            return objects;
        }

        private static ProductPurchase ParseSinglePurchase(string json)
        {
            try
            {
                var purchase = new ProductPurchase();
                
                // Extract player_alias
                purchase.PlayerAlias = ExtractJsonValue(json, "player_alias");
                if (string.IsNullOrEmpty(purchase.PlayerAlias))
                    purchase.PlayerAlias = ExtractJsonValue(json, "in_game_alias");
                
                // Extract product_name
                purchase.ProductName = ExtractJsonValue(json, "product_name");
                if (string.IsNullOrEmpty(purchase.ProductName))
                    purchase.ProductName = ExtractJsonValue(json, "product");
                
                return purchase;
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error parsing single purchase: {0}", ex.Message));
                return null;
            }
        }

        private static string ExtractJsonValue(string json, string key)
        {
            try
            {
                string pattern = "\"" + key + "\"";
                int keyIndex = json.IndexOf(pattern);
                if (keyIndex == -1)
                    return null;
                
                int colonIndex = json.IndexOf(':', keyIndex);
                if (colonIndex == -1)
                    return null;
                
                int valueStart = colonIndex + 1;
                while (valueStart < json.Length && char.IsWhiteSpace(json[valueStart]))
                    valueStart++;
                
                if (valueStart >= json.Length)
                    return null;
                
                if (json[valueStart] == '"')
                {
                    // String value
                    valueStart++;
                    int valueEnd = valueStart;
                    while (valueEnd < json.Length && json[valueEnd] != '"')
                        valueEnd++;
                    
                    if (valueEnd < json.Length)
                        return json.Substring(valueStart, valueEnd - valueStart);
                }
                
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error extracting JSON value for key {0}: {1}", key, ex.Message));
                return null;
            }
        }

        /// <summary>
        /// Gets the converted item name if player has purchased the product
        /// </summary>
        public static async Task<string> GetConvertedItemName(string playerAlias, string originalItemName)
        {
            try
            {
                var playerProducts = await GetPlayerProducts(playerAlias);
                
                // Check each product the player has purchased
                foreach (var product in playerProducts)
                {
                    if (PRODUCT_CONVERSIONS.ContainsKey(product.ToLower()))
                    {
                        var conversions = PRODUCT_CONVERSIONS[product.ToLower()];
                        if (conversions.ContainsKey(originalItemName))
                        {
                            return conversions[originalItemName];
                        }
                    }
                }
                
                return originalItemName; // No conversion found
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error getting converted item for {0}: {1}", playerAlias, ex.Message));
                return originalItemName; // Return original on error
            }
        }

        public static async Task ForceRefreshCache()
        {
            lastCacheUpdate = DateTime.MinValue;
            await RefreshPurchasesCache();
        }
    }

    public class ProductPurchase
    {
        public string PlayerAlias { get; set; }
        public string ProductName { get; set; }
    }

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
    
    public static void CreateRogueExplosion(Arena arena, Player killer, short x, short y, short z)
    {
        try
        {
            // Get the projectile with ID 1374
            ItemInfo.Projectile rogueWep = AssetManager.Manager.getItemByID(1374) as ItemInfo.Projectile;
            
            if (rogueWep != null)
            {
                // Create the explosion projectile
                SC_Projectile rogueExplosion = new SC_Projectile
                {
                    projectileID = (short)rogueWep.id,
                    playerID = (ushort)killer._id,
                    posX = x,
                    posY = y,
                    posZ = z,
                    yaw = killer._state.yaw
                };
                
                // Send the explosion to all players
                foreach (Player p in arena.Players)
                {
                    p._client.sendReliable(rogueExplosion);
                }
                
                // Optional: Log the explosion for debugging
                //Console.WriteLine(String.Format("Rogue kill explosion triggered at ({0}, {1}, {2})", x, y, z));
            }
            else
            {
                //Console.WriteLine("Error: Could not find projectile with ID 1374 for Rogue explosion");
            }
        }
        catch (Exception ex)
        {
            //Console.WriteLine(String.Format("Error creating Rogue explosion: {0}", ex.Message));
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
            // NEW: Validate game before sending data - but only log, don't block completely
            var players = arena.Players.ToList();
            bool isValidGame = IsValidGameForStats(players);
            
            if (!isValidGame)
            {
                Console.WriteLine("[WebIntegration] Game does not meet full criteria (4+ per team), but sending basic data anyway.");
                // Continue anyway for basic tracking - full validation only for end-game stats
            }
            
            // Determine game type based on arena name
            string gameType = DetermineGameType(arena._name);
            
            // Get all players in the arena
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
    
    public static string DetermineGameType(string arenaName)
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
    
    public static bool DetermineOffenseTeam(List<Player> players, Arena arena)
    {
        // NEW LOGIC: Defense owns the Bridge3 flag, other team is offense
        Arena.FlagState bridge3Flag = arena.getFlag("Bridge3");
        if (bridge3Flag != null && bridge3Flag.team != null)
        {
            string flagOwnerTeamName = bridge3Flag.team._name;
            
            // If Bridge3 flag is owned by a team containing " C", then Collective is defense (Titan is offense)
            if (flagOwnerTeamName.Contains(" C"))
                return true; // Titan is offense
            // If Bridge3 flag is owned by a team containing " T", then Titan is defense (Collective is offense)
            else if (flagOwnerTeamName.Contains(" T"))
                return false; // Titan is defense
        }
        
        // Fallback: First, try to find the team with a Squad Leader - that team is offense
        foreach (Player player in players)
        {
            // Get the player's primary skill name instead of vehicle type
            string primarySkill = "";
            if (player._skills.Count > 0)
            {
                primarySkill = player._skills.First().Value.skill.Name;
            }
            
            if (primarySkill == "Squad Leader")
            {
                return player._team._name.Contains(" T"); // Return true if Titan has Squad Leader
            }
        }
        
        // If no Squad Leader found, use a consistent fallback based on team balance
        // Count players on each team type (excluding Dueler players)
        int titanCount = 0;
        int collectiveCount = 0;
        
        foreach (Player player in players)
        {
            // Skip Dueler players from team counting
            string primarySkill = "";
            if (player._skills.Count > 0)
            {
                primarySkill = player._skills.First().Value.skill.Name;
            }
            if (primarySkill == "Dueler") continue;
            
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
    
    /// <summary>
    /// Validates if a game meets the criteria for stats export:
    /// - Two teams that have 4 or more players each
    /// - Only 1 team containing " C" and 1 team containing " T"
    /// </summary>
    public static bool IsValidGameForStats(List<Player> players)
    {
        if (players == null || players.Count < 8) // Minimum 8 total players (4v4)
            return false;
            
        // Count teams and their player counts
        var teamCounts = new Dictionary<string, int>();
        var cTeams = new List<string>();
        var tTeams = new List<string>();
        
        foreach (Player player in players)
        {
            if (player._team == null || player._team.IsSpec || player.IsSpectator)
                continue;
                
            // Skip Dueler players from validation
            string primarySkill = "";
            if (player._skills.Count > 0)
            {
                primarySkill = player._skills.First().Value.skill.Name;
            }
            if (primarySkill == "Dueler") continue;
                
            string teamName = player._team._name;
            
            // Count players per team
            if (!teamCounts.ContainsKey(teamName))
                teamCounts[teamName] = 0;
            teamCounts[teamName]++;
            
            // Track C and T teams
            if (teamName.Contains(" C") && !cTeams.Contains(teamName))
                cTeams.Add(teamName);
            else if (teamName.Contains(" T") && !tTeams.Contains(teamName))
                tTeams.Add(teamName);
        }
        
        // Must have exactly 1 C team and 1 T team
        if (cTeams.Count != 1 || tTeams.Count != 1)
            return false;
            
        // Both teams must have 4+ players
        string cTeamName = cTeams[0];
        string tTeamName = tTeams[0];
        
        if (!teamCounts.ContainsKey(cTeamName) || !teamCounts.ContainsKey(tTeamName))
            return false;
            
        if (teamCounts[cTeamName] < 4 || teamCounts[tTeamName] < 4)
            return false;
            
        return true;
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
    
    public static string GetSpecialWeapon(Player player)
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

// INTEGRATION INSTRUCTIONS:
//
// Add these command handlers to your existing CTF.cs or main game script:
//
// In your command processing method, add:
/*
public override bool playerChatCommand(Player player, Player recipient, string command, string payload)
{
    // Your existing command handling...
    
    switch (command.ToLower())
    {
        case "register":
            _ = InGameRegistration.HandleRegisterCommand(player, command, payload);
            return true;
            
        case "checkregistration":
        case "regstatus":
            _ = InGameRegistration.HandleCheckRegistrationCommand(player, command, payload);
            return true;
            
        // Your other commands...
    }
    
    return base.playerChatCommand(player, recipient, command, payload);
}
*/

// USAGE EXAMPLES:
//
// Players can use these commands in-game:
// ?register john.doe@gmail.com     - Register with email
// ?checkregistration               - Check registration info
// ?regstatus                       - Same as checkregistration
//
// The system will:
// 1. Validate the email format
// 2. Send registration request to your web API
// 3. Create a pending user account
// 4. Send verification email
// 5. Allow user to complete registration via web interface 

public class BuildManager
{
    /// <summary>
    /// Converts a list of ?buy commands into a dictionary format.
    /// </summary>
    public Dictionary<string, Tuple<List<Tuple<string, ushort>>, string, string, string, string>> ConvertBuyCommandsToDictionary(
        List<Tuple<string, string, string, string, string>> buildInputs)
    {
        var buildSets = new Dictionary<string, Tuple<List<Tuple<string, ushort>>, string, string, string, string>>();

        foreach (var buildInput in buildInputs)
        {
            string buildName = buildInput.Item1.ToLower();
            string buyCommand = buildInput.Item2;
            string description = buildInput.Item3;
            string classType = buildInput.Item4;
            string contributedBy = buildInput.Item5;

            // Convert the ?buy command into the dictionary item format
            var items = ParseBuyCommand(buyCommand);

            // Create a tuple including the items, description, the original buy command, class, and contributedBy
            Tuple<List<Tuple<string, ushort>>, string, string, string, string> buildData = 
                new Tuple<List<Tuple<string, ushort>>, string, string, string, string>(items, description, buyCommand, classType, contributedBy);

            buildSets.Add(buildName, buildData);
        }

        return buildSets;
    }

    /// <summary>
    /// Parses a single ?buy command string and converts it into a list of item tuples.
    /// </summary>
    private List<Tuple<string, ushort>> ParseBuyCommand(string buyCommand)
    {
        var items = new List<Tuple<string, ushort>>();
        var parts = buyCommand.Replace("?buy ", "").Split(',');

        foreach (var part in parts)
        {
            string itemName;
            ushort itemCount = 1;

            var itemParts = part.Split(':');
            itemName = itemParts[0].Trim().ToLower(); // Normalize item name

            if (itemParts.Length > 1)
            {
                string quantitySpecifier = itemParts[1].Trim();
                ushort count;
                if (ushort.TryParse(quantitySpecifier.TrimStart('#'), out count))

                {
                    itemCount = count;
                }
            }

            items.Add(new Tuple<string, ushort>(itemName, itemCount));
        }

        return items;
    }
}

namespace InfServer.Script.GameType_CTF
{
    using MapFlagEntry = Tuple<string, int, int>; // <Flag ID, Tile X, Tile Y>

    /// <summary>
    /// Proxies the Player object to provide CTF-oriented stats.
    /// 
    /// This list of stats maps over to the config file `Name0` through `Name6`
    /// list of stats.
    /// </summary>
    /// 
    /// <remarks>
    /// The player object is proxied because the stats are contained in variables
    /// named `ZoneStat1` through `ZoneStat7`. We want better names that match
    /// what the actual stat is, so we will hide it behind this proxy.
    /// 
    /// Note that we only create one instance for this proxy and then we reassign
    /// the player whenever we want to update; otherwise we'd be doing needless
    /// allocations for a stat update.
    /// 
    /// Ensure after you're  done updating the stat that you set player to null,
    /// that will help to guard any accidental writes.
    /// </remarks>
    class CTFPlayerStatsProxy
    {
        public Player player {get;set;}

        /// <summary>
        /// Gets or sets the number of games this player has won.
        /// </summary>
        public int GamesWon
        {
            get { return player.ZoneStat1; }
            set { player.ZoneStat1 = value; }
        }

        /// <summary>
        /// Gets or esets the number of games this player has lost.
        /// </summary>
        public int GamesLost
        {
            get { return player.ZoneStat2; }
            set { player.ZoneStat2 = value; }
        }

        /// <summary>
        /// Time in seconds that the player has carried at least one flag for.
        /// </summary>
        public int CarryTimeSeconds
        {
            get { return player.ZoneStat3; }
            set { player.ZoneStat3 = value; }
        }

        /// <summary>
        /// Cumulative time in seconds that the player has carried flags.
        /// </summary>
        public int CarryTimeSecondsPlus
        {
            get { return player.ZoneStat4; }
            set { player.ZoneStat4 = value; }
        }

        /// <summary>
        /// Number of times that a player has captured a flag - from actual pickup/killing a carrier and picking their flag up.
        /// </summary>
        public int Captures
        {
            get { return player.ZoneStat5; }
            set { player.ZoneStat5 = value; }
        }

        /// <summary>
        /// Amount of times a flag carrier gets a kill.
        /// </summary>
        public int CarryKills
        {
            get { return player.ZoneStat6; }
            set { player.ZoneStat6 = value; }
        }

        /// <summary>
        /// Amount of times a player kills a flag carrier.
        /// </summary>
        public int CarrierKills
        {
            get { return player.ZoneStat7; }
            set { player.ZoneStat7 = value; }
        }
    }

    /// <summary>
    /// Models a single CTF map (i.e. playable area) with specific teams and flag coordinates.
    /// </summary>
    /// <remarks>
    /// Consider doing this properly and loading it from a file you lazy bums.
    /// </remarks>
    class CTFMap
    {
        public string MapName { get; set; }

        /// <summary>
        /// If set to true, the coordinates of the flags are randomized and the given positions are ignored and only the Flag ID
        /// is used.
        /// </summary>
        public bool RandomizeFlagLocations = false;

        public List<string> TeamNames = new List<string>();

        /// <summary>
        /// List of flags for this map. coordinates must be multiplied by 16 as per the actual in-game coordinates (coord specified * 16).
        /// </summary>
        public List<MapFlagEntry> Flags = new List<MapFlagEntry>();
    }

    //////////////////////////////////////////////////////
    // Script class
    // Provides the interface between the script and arena
    //////////////////////////////////////////////////////
    partial class Script_CTF : Scripts.IScript
    {
        #region Member Variables
        //////////////////////////////////////////////////
        // Member Variables
        //////////////////////////////////////////////////
        internal Arena arena;
        public CfgInfo CFG;
        private int lastGameCheck;
        private int lastStatsWriteMs;

        private int minPlayers;
        private int preGamePeriod;

        private Team winningTeam;
        private int winningTeamTick;
        private int winningTeamNotify;
        private int victoryHoldTime;
        private bool gameWon;

        private GameState gameState;
        private CTFMode flagMode;

        // Create only one so that we aren't doing needless allocations all the time.
        private CTFPlayerStatsProxy ctfPlayerProxy = new CTFPlayerStatsProxy();

        // GameStats system for advanced stats tracking and win conditions
        private GameStats gameStats;

        private bool isOVD = false;
        private bool is5v5 = false;
        private string winningTeamOVD = "defense";
        public string baseUsed = "Unknown";
        private bool isSD = false;
        private Team notPlaying;
        private Team playing;
        private Team spec;
        private List<Arena.FlagState> _flags;

        public Dictionary<string, Base> bases;

        private List<CTFMap> availableMaps = new List<CTFMap>();

        private CTFMap currentMap = null;

        public CommandHandler commandHandler = new CommandHandler();
        private bool allowPrivateTeams = false;
        private int overtimeStart = 0;
        private long secondOvertimeStart = 0;
        private bool isSecondOvertime = false;

        private bool isChampEnabled = DateTime.Now.DayOfWeek != DayOfWeek.Sunday;
        
        // Public property for ChampionEffects access
        public bool IsChampEnabled 
        { 
            get { return isChampEnabled; } 
        }

        private int secondOvertimeTimer;
        private Dictionary<Player, bool> disallowClassChange = new Dictionary<Player, bool>();
        private Dictionary<Player, string> queuedClassSwap = new Dictionary<Player, string>();
        private bool _playerStatsEnabled = true;
        private Dictionary<Player, bool> autoBuyEnabled = new Dictionary<Player, bool>();
        private Dictionary<Player, bool> autoDropEnabled = new Dictionary<Player, bool>();
        private Dictionary<Player, bool> summonAutomationEnabled = new Dictionary<Player, bool>();
        private Dictionary<Player, int> pendingSummonRequests = new Dictionary<Player, int>();
        
        // OvD Automation System
        private OvDAutomation _ovdAutomation;

        // Champion Effects System
        private ChampionEffects _championEffects;

        // Dictionary to store vehicles players were in before entering a portal
        // DISABLED: Vehicle tracking through portals
        // private Dictionary<Player, VehicleState> _lastOccupiedVehicle = new Dictionary<Player, VehicleState>();
        public class Base
        {
            public Base(short posX, short posY, short fposX, short fposY)
            {
                x = (short)(posX * 16);
                y = (short)(posY * 16);

                flagX = (short)(fposX * 16);
                flagY = (short)(fposY * 16);

            }
            public short x;
            public short y;
            public short flagX;
            public short flagY;
        }

        /// <summary>
        /// Stores our player streak information
        /// </summary>
        private class PlayerStreak
        {
            public ItemInfo.Projectile lastUsedWeap { get; set; }
            public int lastUsedWepKillCount { get; set; }
            public long lastUsedWepTick { get; set; }
            public int lastKillerCount { get; set; }
            public int deathCount { get; set; }
            public int killCount { get; set; }
        }

        public enum EventType
        {
            None,
            Standard,
            KOTH,
            Zombie,
            Gladiator,
            CTFX,
            MiniTP,
            SUT
            // TDM
            // Add other event types as needed
        }

        // If arena 1, MiniTP, otherwise None   
        private EventType currentEventType = EventType.None;
        // private TDM _tdmInstance = null; // TDM game mode instance
        
        // CTFBot spawning for TDM events
        // private List<Bot> _ctfBots = new List<Bot>();              // List of active CTF bots
        private int _tickLastBotSpawn = 0;                         // Last time we spawned a bot
        private const int BOT_SPAWN_MIN_INTERVAL = 2000;           // 2 seconds minimum
        private const int BOT_SPAWN_MAX_INTERVAL = 4000;           // 4 seconds maximum 
        private const int MAX_BOTS_PER_TEAM = 5;                   // Maximum 5 bots per team (10 total)
        
        // CTFBot spawn coordinates for TDM
        // CTFBot spawning constants (tile coordinates converted to pixels)
        private const int COLLECTIVE_SPAWN_X = 1428 * 16;     // Tile 1428 = 22,848 pixels
        private const int COLLECTIVE_SPAWN_Y = 538 * 16;      // Tile 538 = 8,608 pixels
        private const byte COLLECTIVE_SPAWN_YAW = 177;
        private const int TITAN_SPAWN_X = 1371 * 16;          // Tile 1371 = 21,936 pixels
        private const int TITAN_SPAWN_Y = 538 * 16;           // Tile 538 = 8,608 pixels
        private const byte TITAN_SPAWN_YAW = 57;
        
        private List<Player> gladiatorPlayers = new List<Player>();

        // Tile-based voting system
        private Dictionary<Player, string> playerVotes = new Dictionary<Player, string>();
        private bool votingActive = false;
        private int votingStartTick = 0;
        private const int VOTING_TIMEOUT_MS = 30000; // 30 seconds
        private Dictionary<string, Tuple<short, short>> votingTiles = new Dictionary<string, Tuple<short, short>>
        {
            { "CTFX", new Tuple<short, short>(575, 450) },
            { "SUT", new Tuple<short, short>(575, 457) },
            // { "TDM", new Tuple<short, short>(575, 464) },
            { "Gladiator", new Tuple<short, short>(575, 470) },
            { "None", new Tuple<short, short>(594, 450) }, // TP (event none) - warps to dropship
            { "MiniTP", new Tuple<short, short>(594, 457) },
            { "Zombie", new Tuple<short, short>(594, 464) },
            { "Duel", new Tuple<short, short>(594, 470) }
        };
        private bool gladiatorUpgradesEnabled = true; // Toggle for upgrade system
        public Team gladiatorTeamA;
        public Team gladiatorTeamB;
        private int gladiatorKillThreshold = 20;
        private List<int[]> teamASpawnPoints = new List<int[]>
        {
            new int[] { 500, 500 },
            // Add more spawn points for Team A
        };

        private List<int[]> teamBSpawnPoints = new List<int[]>
        {
            new int[] { 510, 510 },
            // Add more spawn points for Team B
        };   

        private void WarpPlayerToSpawn(Player player)
        {
            int[] spawnPoint;

            if (player._team == gladiatorTeamA)
            {
                // Use modulo to ensure we have a matching index
                int index = gladiatorTeamA.ActivePlayerCount % teamASpawnPoints.Count;
                spawnPoint = teamASpawnPoints[index];
            }
            else if (player._team == gladiatorTeamB)
            {
                int index = gladiatorTeamB.ActivePlayerCount % teamBSpawnPoints.Count;
                spawnPoint = teamBSpawnPoints[index];
            }
            else
            {
                // Default spawn point
                spawnPoint = new int[] { 900, 509 };
            }

            // Warp player
            player.warp(spawnPoint[0] * 16, spawnPoint[1] * 16);
        }

        private void StartGladiatorEvent()
        {
            arena.sendArenaMessage("Gladiator event has started! Type ?glad to join.", 1);
            // Initialize any necessary variables
            gladiatorPlayers.Clear();
            
            // Warp all existing players to gladiator arena (excluding Duelers)
            foreach (Player player in arena.PlayersIngame)
            {
                // Skip Duelers
                if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                    continue;
                    
                WarpPlayerToRange(player, 900, 900, 509, 509);
            }
            
            // Determine gladiator mode based on player count
            SetupGladiatorMode();
        }

        private void JoinGladiatorEvent(Player player)
        {
            // Assign player to appropriate gladiator team based on current mode
            AssignGladiatorTeam(player);
            
            // Warp the player to gladiator spawn
            WarpPlayerToSpawn(player);
        }

        /// <summary>
        /// Setup gladiator mode based on player count (1v1 or 2v2)
        /// </summary>
        private void SetupGladiatorMode()
        {
            int playerCount = arena.PlayersIngame.Count(p => !p._skills.Values.Any(s => s.skill.Name == "Dueler"));
            
            if (playerCount >= 4)
            {
                arena.sendArenaMessage("&Gladiator Mode: 2v2 battles! Teams will be assigned automatically.", 1);
                gladiatorKillThreshold = 30; // Higher threshold for 2v2
            }
            else
            {
                arena.sendArenaMessage("&Gladiator Mode: 1v1 battles! Fight solo for glory!", 1);
                gladiatorKillThreshold = 20; // Standard threshold for 1v1
            }
        }

        /// <summary>
        /// Assign player to gladiator team based on current mode and team balance
        /// </summary>
        private void AssignGladiatorTeam(Player player)
        {
            int playerCount = arena.PlayersIngame.Count(p => !p._skills.Values.Any(s => s.skill.Name == "Dueler"));
            
            if (playerCount >= 4) // 2v2 mode
            {
                // Find teams with fewer than 2 players
                for (int i = 2; i <= 33; i++)
                {
                    string teamName = CFG.teams[i].name;
                    Team team = player._arena.getTeamByName(teamName);

                    if (team != null && team.ActivePlayerCount < 2)
                    {
                        AssignPlayerToTeam(player, "Infantry", teamName, false, true);
                        player.sendMessage(0, String.Format("Assigned to {0} for 2v2 gladiator combat!", teamName));
                        return;
                    }
                }
            }
            else // 1v1 mode
            {
                // Find empty teams for 1v1
                for (int i = 2; i <= 33; i++)
                {
                    string teamName = CFG.teams[i].name;
                    Team team = player._arena.getTeamByName(teamName);

                    if (team != null && team.ActivePlayerCount == 0)
                    {
                        AssignPlayerToTeam(player, "Infantry", teamName, false, true);
                        player.sendMessage(0, String.Format("Assigned to {0} for 1v1 gladiator combat!", teamName));
                        return;
                    }
                }
            }
            
            // Fallback if no suitable team found
            player.sendMessage(0, "No available gladiator teams at the moment. Try again in a moment.");
        }

        private void CheckGladiatorVictory()
        {
            // Safety check - don't check victory if event is not active
            if (currentEventType != EventType.Gladiator)
                return;
                
            try
            {
                Player winningPlayer = null;
                foreach (int i in Enumerable.Range(2, 32)) // Teams 2 to 33 inclusive
                {
                    // Additional safety checks to prevent crashes during restarts
                    if (CFG == null || CFG.teams == null || i >= CFG.teams.Count || CFG.teams[i] == null)
                        continue;
                        
                    string teamName = CFG.teams[i].name;
                    if (string.IsNullOrEmpty(teamName))
                        continue;
                        
                    Team team = arena.getTeamByName(teamName);

                    if (team != null && team._currentGameKills >= gladiatorKillThreshold)
                    {
                        // Find a player from the winning team to launch fireworks
                        foreach (Player player in team.ActivePlayers)
                        {
                            winningPlayer = player; // Store the first player found as the winning player
                            break; // Exit the loop after finding the first player
                        }

                        arena.sendArenaMessage(string.Format("{0} has won the Gladiator event!", team._name));
                        if (winningPlayer != null)
                        {
                            LaunchFireworks(winningPlayer); // Launch fireworks for the winning player
                        }
                        EndEvent();
                        return;
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine("[CTF ERROR] Exception in CheckGladiatorVictory: " + e.ToString());
                // Don't end event on error - let it continue safely
            }
        }

        /// <summary>
        /// Clean up all Gladiator event state to prevent crashes during restarts
        /// </summary>
        private void CleanupGladiatorEvent()
        {
            try
            {
                // Clear gladiator player list
                if (gladiatorPlayers != null)
                {
                    gladiatorPlayers.Clear();
                }
                
                // Reset team references safely
                gladiatorTeamA = null;
                gladiatorTeamB = null;
                
                // Reset gladiator settings to defaults
                gladiatorKillThreshold = 20;
                gladiatorUpgradesEnabled = true;
                
                // Log cleanup for debugging
                Console.WriteLine("[CTF] Gladiator event cleaned up successfully");
            }
            catch (Exception e)
            {
                Console.WriteLine("[CTF ERROR] Exception during Gladiator cleanup: " + e.ToString());
            }
        }

        private void CheckSUTVictory()
        {
            foreach (Team team in arena.Teams)
            {
                if (team._currentGameKills >= 50)
                {
                    arena.sendArenaMessage(string.Format("{0} has won the SUT event with {1} kills!", team._name, team._currentGameKills));

                    // Launch fireworks for all players on the winning team
                    foreach (Player player in team.ActivePlayers)
                    {
                        LaunchFireworks(player);
                    }

                    EndEvent();
                    return;
                }
            }
        }

        private Dictionary<int, long> stimPackCooldowns = new Dictionary<int, long>();
        private Dictionary<int, long> energizerCooldowns = new Dictionary<int, long>();
        private const int STIM_PACK_COOLDOWN_MS = 1000; // 1 second cooldown
        private const int ENERGIZER_COOLDOWN_MS = 1000; // 1 second cooldown

        private void UseStimPack(Player player)
        {
            // Check if player is on terrains 1-4
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
            if (terrainID >= 1 && terrainID <= 4)
            {
                player.sendMessage(-1, "Cannot use Stim Pack on this terrain.");
                return;
            }

            // Check cooldown
            if (stimPackCooldowns.ContainsKey(player._id))
            {
                long lastUseTime = stimPackCooldowns[player._id];
                if (Environment.TickCount - lastUseTime < STIM_PACK_COOLDOWN_MS)
                {
                    player.sendMessage(-1, "Stim Pack is still on cooldown.");
                    return;
                }
            }

            // Get the stim pack item info from asset manager
            ItemInfo.RepairItem stimPack = AssetManager.Manager.getItemByName("Stim Pack") as ItemInfo.RepairItem;
            if (stimPack != null)
            {
                // Check if player has stim pack in inventory
                if (player.getInventoryAmount(stimPack.id) > 0)
                {
                    // Create and send reload packet
                    SC_ItemReload reloadPacket = new SC_ItemReload
                    {
                        itemID = (short)stimPack.id
                    };
                    player._client.sendReliable(reloadPacket);

                    // Trigger item use animation
                    Helpers.Player_RouteItemUsed(player, player, player._id, (short)stimPack.id, 
                        player._state.positionX, player._state.positionY, (byte)player._state.yaw);

                    //Remove item from players inventory
                    player.inventoryModify(stimPack.id, -1);
                    // Sync player state
                    player.syncState();

                    // Update cooldown
                    stimPackCooldowns[player._id] = Environment.TickCount;
                }
                else
                {
                    //player.sendMessage(-1, "You don't have any stim packs in your inventory.");
                }
            }
        }

        private void UseEnergizer(Player player)
        {
            // Check if player is on terrains 1-4
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
            if (terrainID >= 1 && terrainID <= 4)
            {
                player.sendMessage(-1, "Cannot use Energizer on this terrain.");
                return;
            }

            // Check if player is in weapon switch animation
            ItemInfo item = AssetManager.Manager.getItemByID(player._lastItemUseID);
            if (item != null)
            {
                int fireDelay = 0;
                
                if (item is ItemInfo.ControlItem)
                {
                    fireDelay = ((ItemInfo.ControlItem)item).fireDelayOther * 10; // Convert to milliseconds
                }
                else if (item is ItemInfo.ItemMaker)
                {
                    fireDelay = ((ItemInfo.ItemMaker)item).fireDelayOther * 10;
                }
                else if (item is ItemInfo.MultiUse)
                {
                    fireDelay = ((ItemInfo.MultiUse)item).fireDelayOther * 10;
                }
                else if (item is ItemInfo.Projectile)
                {
                    fireDelay = ((ItemInfo.Projectile)item).fireDelayOther * 10;
                }
                else if (item is ItemInfo.RepairItem)
                {
                    fireDelay = ((ItemInfo.RepairItem)item).fireDelayOther * 10;
                }
                else if (item is ItemInfo.VehicleMaker)
                {
                    fireDelay = ((ItemInfo.VehicleMaker)item).fireDelayOther * 10;
                }
                else if (item is ItemInfo.WarpItem)
                {
                    fireDelay = ((ItemInfo.WarpItem)item).fireDelayOther * 10;
                }

                // Check if enough time has passed since last weapon use
                long currentTime = Environment.TickCount;
                if (fireDelay > 0 && (currentTime - player._lastMovement) < fireDelay)
                {
                    player.sendMessage(-1, "Cannot use Energizer command while switching weapons or moving/drifting (must come to complete stop).");
                    return;
                }
            }

            // Check cooldown
            if (energizerCooldowns.ContainsKey(player._id))
            {
                long lastUseTime = energizerCooldowns[player._id];
                if (Environment.TickCount - lastUseTime < ENERGIZER_COOLDOWN_MS)
                {
                    player.sendMessage(-1, "Energizer is still on cooldown.");
                    return;
                }
            }

            // Get the energizer item info from asset manager
            ItemInfo.RepairItem energizer = AssetManager.Manager.getItemByName("Energizer") as ItemInfo.RepairItem;
            if (energizer != null)
            {
                // Check if player has energizer in inventory
                if (player.getInventoryAmount(energizer.id) > 0)
                {
                    // Create and send reload packet
                    SC_ItemReload reloadPacket = new SC_ItemReload
                    {
                        itemID = (short)energizer.id
                    };
                    player._client.sendReliable(reloadPacket);

                    // Trigger item use animation
                    Helpers.Player_RouteItemUsed(player, player, player._id, (short)energizer.id, 
                        player._state.positionX, player._state.positionY, (byte)player._state.yaw);

                    // Set the players energy instead. Get their current energy first, then add onto it.
                    // short currentEnergy = player._state.energy;
                    // short newEnergy = (short)Math.Min(1000, currentEnergy + 0);
                    // player.setEnergy(newEnergy);

                    //Remove item from players inventory
                    player.inventoryModify(energizer.id, -1);
                    // Sync player state
                    player.syncState();

                    // Update cooldown
                    energizerCooldowns[player._id] = Environment.TickCount;
                }
            }
        }

        




// SAVE STATE SECTION

// PlayerState moved to CTF.SaveState.cs

// VehicleState moved to CTF.SaveState.cs

// State containers moved to CTF.SaveState.cs

// Save/load state methods moved to CTF.SaveState.cs

        // LoadStatePause moved to CTF.SaveState.cs

        // A simple container for the minimal playbook data for a player.
        private class SimplePlayerState
        {
            public short PosX { get; set; }
            public short PosY { get; set; }
            public byte Yaw { get; set; }
            public char Side { get; set; }   // 'T' for Titan, 'C' for Collective
            public string PrimarySkill { get; set; }
        }

        // minimal record for a turret/computer vehicle
        private class SimpleTurretState
        {
            public short PosX { get; set; }          // tile coords (÷16), just like players
            public short PosY { get; set; }
            public byte  Yaw  { get; set; }
            public char  Side { get; set; }          // 'T' / 'C'   (owner team)
            public int   VehicleTypeId { get; set; } // which turret type to spawn
        }


        // This dictionary stores multiple playbook states, each keyed by a unique stateName and player alias.
        // For each state, we keep a mapping: the key is a tuple of (Side, PrimarySkill)
        // and the value is a queue of SimplePlayerState placements.
        // (A queue is used so that if multiple players share the same key, they are cycled through.)
        private Dictionary<string, Dictionary<string, Dictionary<Tuple<char, string>, Queue<SimplePlayerState>>>> simplePlaybookStates =
            new Dictionary<string, Dictionary<string, Dictionary<Tuple<char, string>, Queue<SimplePlayerState>>>>();

        // turrets saved for each playbook state
        private Dictionary<string, List<SimpleTurretState>> playbookTurrets =
            new Dictionary<string, List<SimpleTurretState>>();


        /// <summary>
        /// Helper: Determines the team side based on the player's team name.
        /// Returns 'T' if the name contains "Titan" or " T", or 'C' if it contains "Collective" or " C".
        /// If no match is found, returns '?'.
        /// </summary>
        private char GetTeamType(string teamName)
        {
            if (string.IsNullOrEmpty(teamName))
                return '?';

            string lower = teamName.ToLower();
            if (lower.Contains("titan") || teamName.Contains(" T"))
                return 'T';
            if (lower.Contains("collective") || teamName.Contains(" C"))
                return 'C';

            return '?'; // Unknown team side
        }

        /// <summary>
        /// Saves a simplified "playbook" state for all active (non-spectator) players in the arena.
        /// Captures each player's posX, posY, yaw, side (based on their team name),
        /// and primary skill (using GetPrimarySkillName(player)).
        /// The resulting state is stored under the provided unique stateName and the player's alias.
        /// </summary>
        /// <param name="stateName">Unique name for this playbook state.</param>
        // Dictionary to store playbook states globally for all players
        private Dictionary<string, Dictionary<Tuple<char, string>, Queue<SimplePlayerState>>> playbookStates =
            new Dictionary<string, Dictionary<Tuple<char, string>, Queue<SimplePlayerState>>>();

        /// <summary>
        /// Saves a simplified "playbook" state for all active (non-spectator) players in the arena.
        /// Captures each player's posX, posY, yaw, side (based on their team name),
        /// and primary skill (using GetPrimarySkillName(player)).
        /// The resulting state is stored under the provided unique stateName.
        /// </summary>
        /// <param name="stateName">Unique name for this playbook state.</param>
        private void SavePlaybook(string stateName)
        {
            if (string.IsNullOrEmpty(stateName))
            {
                arena.sendArenaMessage("Playbook state name cannot be empty.");
                return;
            }

            // Create a mapping for this playbook state.
            var stateMapping = new Dictionary<Tuple<char, string>, Queue<SimplePlayerState>>();

            foreach (Player p in arena.PlayersIngame)
            {
                if (p == null || p.IsSpectator)
                    continue;

                // Determine team side and primary skill.
                char side = GetTeamType(p._team._name);
                string primarySkill = GetPrimarySkillName(p);

                // Create and populate the simple state.
                SimplePlayerState sps = new SimplePlayerState
                {
                    PosX = (short)(p._state.positionX / 16),
                    PosY = (short)(p._state.positionY / 16),
                    Yaw = p._state.yaw,
                    Side = side,
                    PrimarySkill = primarySkill
                };

                // Use a combined key of side and primary skill.
                var key = Tuple.Create(side, primarySkill);
                if (!stateMapping.ContainsKey(key))
                {
                    stateMapping[key] = new Queue<SimplePlayerState>();
                }
                stateMapping[key].Enqueue(sps);
            }

            playbookStates[stateName] = stateMapping;

            var turretList = new List<SimpleTurretState>();


            foreach (Vehicle v in arena.Vehicles)
            {
                if (v == null || !(v is Computer))       // only turrets/AI vehicles
                    continue;
                
                // only record type 400,401,402,408
                int tid = v._type.Id;
                if (tid != 400 && tid != 401 && tid != 402 && tid != 408)
                    continue;

                turretList.Add(new SimpleTurretState
                {
                    PosX          = (short)(v._state.positionX / 16),
                    PosY          = (short)(v._state.positionY / 16),
                    Yaw           = v._state.yaw,
                    Side          = GetTeamType(v._team._name),
                    VehicleTypeId = v._type.Id
                });
            }
            playbookTurrets[stateName] = turretList;
        }

        /// <summary>
        /// Loads a previously saved playbook state (by stateName) by scanning the current players
        /// in arena.PlayersIngame and warping any player that has a matching saved entry.
        /// For each player, we match on the primary skill and side. If there is a saved playbook slot,
        /// the player is warped to that position.
        /// </summary>
        /// <param name="stateName">The name of the saved playbook state to load.</param>
        public void LoadPlaybook(string stateName)
        {
            //--------------------------------------------------------------
            // 0) sanity
            //--------------------------------------------------------------
            if (string.IsNullOrEmpty(stateName))
            {
                arena.sendArenaMessage("Playbook state name cannot be empty.");
                return;
            }

            string playbooksDir = System.IO.Path.Combine(
                                    AppDomain.CurrentDomain.BaseDirectory, "playbooks");
            string filePath = System.IO.Path.Combine(playbooksDir, stateName + ".json");

            if (!System.IO.File.Exists(filePath))
            {
                arena.sendArenaMessage(
                    string.Format("No playbook state found with the name '{0}'.", stateName));
                return;
            }

            //--------------------------------------------------------------
            // 1) --------- read & parse only once (if not cached) ----------
            //--------------------------------------------------------------
            if (!playbookStates.ContainsKey(stateName) ||
                !playbookTurrets.ContainsKey(stateName))
            {
                string jsonContent;
                try
                {
                    jsonContent = System.IO.File.ReadAllText(filePath);
                }
                catch (Exception ex)
                {
                    arena.sendArenaMessage(
                        string.Format("Error reading playbook file: {0}", ex.Message));
                    Log.write(TLog.Error, "Error loading playbook '{0}': {1}\n{2}",
                            stateName, ex.Message, ex.StackTrace);
                    return;
                }

                // --- parsing targets ---
                var playerBuckets = new Dictionary<Tuple<char, string>, List<SimplePlayerState>>();
                var turretList = new List<SimpleTurretState>();

                try
                {
                    // Parse the JSON content
                    var jsonLines = jsonContent.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                    string currentSection = null;
                    string currentKey = null;
                    List<SimplePlayerState> currentPlayerList = null;
                    SimplePlayerState currentPlayer = null;
                    SimpleTurretState currentTurret = null;
                    bool inTurretSection = false;

                    foreach (var line in jsonLines)
                    {
                        string trimmedLine = line.Trim();
                        if (string.IsNullOrEmpty(trimmedLine)) continue;

                        // Check if we're entering the Turrets section
                        if (trimmedLine.Contains("\"Turrets\""))
                        {
                            inTurretSection = true;
                            continue;
                        }

                        // Handle player sections
                        if (!inTurretSection)
                        {
                            // New player key section
                            if (trimmedLine.Contains(":") && trimmedLine.EndsWith("["))
                            {
                                // Finish previous section if any
                                if (currentKey != null && currentPlayerList != null && currentPlayerList.Count > 0)
                                {
                                    string[] keyParts = currentKey.Split(new[] { ',' }, 2);
                                    if (keyParts.Length == 2 && keyParts[0].Length > 0)
                                    {
                                        var tuple = new Tuple<char, string>(keyParts[0][0], keyParts[1]);
                                        playerBuckets[tuple] = new List<SimplePlayerState>(currentPlayerList);
                                    }
                                }

                                // Start new section
                                currentKey = trimmedLine.Substring(0, trimmedLine.IndexOf(':')).Trim().Trim('"');
                                currentPlayerList = new List<SimplePlayerState>();
                                continue;
                            }

                            // Start of player object
                            if (trimmedLine == "{")
                            {
                                currentPlayer = new SimplePlayerState();
                                continue;
                            }

                            // End of player object
                            if (trimmedLine == "}" || trimmedLine == "},")
                            {
                                if (currentPlayer != null && currentPlayerList != null)
                                {
                                    currentPlayerList.Add(currentPlayer);
                                    currentPlayer = null;
                                }
                                continue;
                            }

                            // End of player array
                            if (trimmedLine == "]" || trimmedLine == "],")
                            {
                                if (currentKey != null && currentPlayerList != null && currentPlayerList.Count > 0)
                                {
                                    string[] keyParts = currentKey.Split(new[] { ',' }, 2);
                                    if (keyParts.Length == 2 && keyParts[0].Length > 0)
                                    {
                                        var tuple = new Tuple<char, string>(keyParts[0][0], keyParts[1]);
                                        playerBuckets[tuple] = new List<SimplePlayerState>(currentPlayerList);
                                    }
                                }
                                currentKey = null;
                                currentPlayerList = null;
                                continue;
                            }

                            // Player properties
                            if (currentPlayer != null && trimmedLine.Contains(":"))
                            {
                                string[] parts = trimmedLine.Split(new[] { ':' }, 2);
                                if (parts.Length != 2) continue;

                                string prop = parts[0].Trim().Trim('"');
                                string val = parts[1].Trim().TrimEnd(',').Trim('"');

                                if (prop == "PosX") currentPlayer.PosX = short.Parse(val);
                                else if (prop == "PosY") currentPlayer.PosY = short.Parse(val);
                                else if (prop == "Yaw") currentPlayer.Yaw = byte.Parse(val);
                                else if (prop == "Side") currentPlayer.Side = val[0];
                                else if (prop == "PrimarySkill") currentPlayer.PrimarySkill = val;
                            }
                        }
                        // Handle turret section
                        else
                        {
                            // Start of turret object
                            if (trimmedLine == "{")
                            {
                                currentTurret = new SimpleTurretState();
                                continue;
                            }

                            // End of turret object
                            if (trimmedLine == "}" || trimmedLine == "},")
                            {
                                if (currentTurret != null)
                                {
                                    turretList.Add(currentTurret);
                                    currentTurret = null;
                                }
                                continue;
                            }

                            // End of turrets array
                            if (trimmedLine == "]" || trimmedLine == "],")
                            {
                                break;
                            }

                            // Turret properties
                            if (currentTurret != null && trimmedLine.Contains(":"))
                            {
                                string[] parts = trimmedLine.Split(new[] { ':' }, 2);
                                if (parts.Length != 2) continue;

                                string prop = parts[0].Trim().Trim('"');
                                string val = parts[1].Trim().TrimEnd(',').Trim('"');

                                if (prop == "PosX") currentTurret.PosX = short.Parse(val);
                                else if (prop == "PosY") currentTurret.PosY = short.Parse(val);
                                else if (prop == "Yaw") currentTurret.Yaw = byte.Parse(val);
                                else if (prop == "Side") currentTurret.Side = val[0];
                                else if (prop == "VehicleTypeId") currentTurret.VehicleTypeId = int.Parse(val);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    arena.sendArenaMessage(
                        string.Format("Error parsing playbook file: {0}", ex.Message));
                    Log.write(TLog.Error, "Error parsing playbook '{0}': {1}\n{2}",
                            stateName, ex.Message, ex.StackTrace);
                    return;
                }

                // cache results
                var queuedBuckets = new Dictionary<Tuple<char, string>, Queue<SimplePlayerState>>();
                foreach (KeyValuePair<Tuple<char, string>, List<SimplePlayerState>> kv in playerBuckets)
                    queuedBuckets[kv.Key] = new Queue<SimplePlayerState>(kv.Value);

                playbookStates[stateName] = queuedBuckets;
                playbookTurrets[stateName] = turretList;
            }

            //--------------------------------------------------------------
            // 2) ----------  WARP live players from cached buckets ---------
            //--------------------------------------------------------------
            foreach (Player p in arena.PlayersIngame)
            {
                if (p == null || p.IsSpectator) continue;

                char side = GetTeamType(p._team._name);
                
                // Try to find a playbook entry for any of the player's skills
                Queue<SimplePlayerState> q = null;
                string matchedSkill = null;
                
                foreach (var skillItem in p._skills.Values)
                {
                    string skillName = skillItem.skill.Name;
                    var key = new Tuple<char, string>(side, skillName);
                    
                    if (playbookStates[stateName].TryGetValue(key, out q) && q.Count > 0)
                    {
                        matchedSkill = skillName;
                        break;
                    }
                }
                
                if (q == null || q.Count == 0)
                {
                    string allSkills = string.Join(", ", p._skills.Values.Select(s => s.skill.Name));
                    p.sendMessage(-1,
                        string.Format("No saved playbook position for any skill ({0}) on side '{1}'.",
                                    allSkills, side));
                    continue;
                }

                SimplePlayerState slot = q.Dequeue();
                q.Enqueue(slot);                                 // cyclic

                // Ensure exact positioning by using the exact coordinates without any calculations
                Helpers.ObjectState newState = new Helpers.ObjectState
                {
                    positionX = (short)(slot.PosX * 16),
                    positionY = (short)(slot.PosY * 16),
                    positionZ = 0,
                    yaw = slot.Yaw,
                    velocityX = 0,
                    velocityY = 0,
                    energy = p._state.energy,
                    health = p._state.health
                };

                // Completely reset player state before warping to ensure clean positioning
                p.resetWarp();
                p.resetState(true, true, true);  // Reset all states completely
                
                // Use direct warp with exact coordinates
                p.warp(Helpers.ResetFlags.ResetAll, newState,
                    p._state.health, p._state.energy, slot.Yaw);

                // Ensure vehicle yaw is also set correctly
                Vehicle v = (p._occupiedVehicle != null) ? p._occupiedVehicle : p._baseVehicle;
                if (v != null) 
                {
                    v._state.yaw = slot.Yaw;
                    v._state.positionX = newState.positionX;
                    v._state.positionY = newState.positionY;
                }
                
                // Force an update to ensure client-side position is accurate
                p.syncState();
            }

            //--------------------------------------------------------------
            // 3) ----------  Kill existing computers & spawn turrets -------
            //--------------------------------------------------------------
            foreach (Vehicle v in arena.Vehicles.ToList())
                if (v is Computer) v.kill(null);

            List<SimpleTurretState> savedTurrets;
            if (playbookTurrets.TryGetValue(stateName, out savedTurrets) && savedTurrets.Count > 0)
            {
                foreach (SimpleTurretState t in savedTurrets)
                {
                    VehInfo vi = AssetManager.Manager.getVehicleByID(t.VehicleTypeId);
                    if (vi == null) continue;

                    Team owningTeam = null;
                    foreach (Team te in arena.Teams)
                        if (GetTeamType(te._name) == t.Side && te.ActivePlayerCount > 0)
                        { owningTeam = te; break; }

                    if (owningTeam == null) continue;    // no active team of that side

                    // Use exact coordinates for turrets as well
                    Helpers.ObjectState st = new Helpers.ObjectState
                    {
                        positionX = (short)(t.PosX * 16),
                        positionY = (short)(t.PosY * 16),
                        positionZ = 0,
                        yaw = t.Yaw,
                        velocityX = 0,
                        velocityY = 0
                    };

                    Vehicle newVeh = arena.newVehicle(vi, owningTeam, null, st);
                    Computer c = newVeh as Computer;
                    if (c != null)
                    {
                        c._state.positionX = st.positionX;
                        c._state.positionY = st.positionY;
                        c._state.yaw = t.Yaw;
                        c._sendUpdate = true;
                        c.poll();
                    }
                }
            }

            // arena.sendArenaMessage(string.Format("Playbook state '{0}' loaded with {1} turrets.", 
            //                     stateName, 
            //                     playbookTurrets.ContainsKey(stateName) ? playbookTurrets[stateName].Count : 0));
        }

        //------------------------------------------------------------------
        // helper: commit a completed player list into the dictionary
        //------------------------------------------------------------------
        private static void AddPlayerBucket(
            IDictionary<Tuple<char, string>, List<SimplePlayerState>> dict,
            string keyText, List<SimplePlayerState> list)
        {
            if (string.IsNullOrEmpty(keyText) || list == null || list.Count == 0)
                return;

            string[] parts = keyText.Split(new[] { ',' }, 2);
            if (parts.Length != 2) return;
            if (parts[0].Length == 0) return;                // avoids char[0] crash

            Tuple<char, string> k = new Tuple<char, string>(parts[0][0], parts[1]);
            dict[k] = new List<SimplePlayerState>(list);
        }


                /// <summary>
                /// Exports a saved playbook state to a JSON file.
                /// </summary>
                /// <param name="stateName">The name of the playbook state to export.</param>
                private void ExportPlayBook(string stateName)
                {
                    if (string.IsNullOrEmpty(stateName))
                    {
                        arena.sendArenaMessage("Playbook state name cannot be empty.");
                        return;
                    }

                    if (!playbookStates.ContainsKey(stateName))
                    {
                        arena.sendArenaMessage(string.Format("No playbook state found with the name '{0}'.", stateName));
                        return;
                    }

                    try
                    {
                        // Create the playbooks directory if it doesn't exist
                        string playbooksDir = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "playbooks");
                        if (!System.IO.Directory.Exists(playbooksDir))
                        {
                            System.IO.Directory.CreateDirectory(playbooksDir);
                        }

                        // Save the playbook to a file
                        string filePath = System.IO.Path.Combine(playbooksDir, stateName + ".json");
                        // Serialize the dictionary to JSON manually
                        System.Text.StringBuilder jsonBuilder = new System.Text.StringBuilder();
                        jsonBuilder.AppendLine("{");
                        
                        int keyCount = playbookStates[stateName].Count;
                        int currentKey = 0;
                        
                        foreach (var kvp in playbookStates[stateName])
                        {
                            currentKey++;
                            jsonBuilder.AppendLine(string.Format("  \"{0},{1}\": [", kvp.Key.Item1, kvp.Key.Item2));
                            
                            int queueCount = kvp.Value.Count;
                            var queueItems = kvp.Value.ToArray();
                            
                            for (int i = 0; i < queueItems.Length; i++)
                            {
                                var state = queueItems[i];
                                jsonBuilder.AppendLine("    {");
                                jsonBuilder.AppendLine(string.Format("      \"PosX\": {0},", state.PosX));
                                jsonBuilder.AppendLine(string.Format("      \"PosY\": {0},", state.PosY));
                                jsonBuilder.AppendLine(string.Format("      \"Yaw\": {0},", state.Yaw));
                                jsonBuilder.AppendLine(string.Format("      \"Side\": \"{0}\",", state.Side));
                                jsonBuilder.AppendLine(string.Format("      \"PrimarySkill\": \"{0}\"", state.PrimarySkill));
                                jsonBuilder.Append("    }");
                                
                                if (i < queueItems.Length - 1)
                                    jsonBuilder.AppendLine(",");
                                else
                                    jsonBuilder.AppendLine();
                            }
                            
                            jsonBuilder.Append("  ]");
                            
                            if (currentKey < keyCount)
                                jsonBuilder.AppendLine(",");
                            else
                                jsonBuilder.AppendLine();
                        }
                        
                        // First add turrets to the JSON if they exist
                        List<SimpleTurretState> tlist;
                        if (playbookTurrets.TryGetValue(stateName, out tlist) && tlist.Count > 0)
                        {
                            jsonBuilder.AppendLine("  ,\"Turrets\": [");
                            for (int i = 0; i < tlist.Count; i++)
                            {
                                var t = tlist[i];
                                jsonBuilder.AppendLine("    {");
                                jsonBuilder.AppendLine(string.Format("      \"PosX\": {0},", t.PosX));
                                jsonBuilder.AppendLine(string.Format("      \"PosY\": {0},", t.PosY));
                                jsonBuilder.AppendLine(string.Format("      \"Yaw\": {0},", t.Yaw));
                                jsonBuilder.AppendLine(string.Format("      \"Side\": \"{0}\",", t.Side));
                                jsonBuilder.AppendLine(string.Format("      \"VehicleTypeId\": {0}", t.VehicleTypeId));
                                jsonBuilder.Append("    }");
                                if (i < tlist.Count - 1) jsonBuilder.AppendLine(",");
                                else                     jsonBuilder.AppendLine();
                            }
                            jsonBuilder.AppendLine("  ]");
                        }
                        
                        // Close the JSON object and write to file
                        jsonBuilder.AppendLine("}");
                        System.IO.File.WriteAllText(filePath, jsonBuilder.ToString());
                    }
                    catch (Exception ex)
                    {
                        arena.sendArenaMessage(string.Format("Error exporting playbook: {0}", ex.Message));
                        Log.write(TLog.Error, "Error exporting playbook: " + ex.ToString());
                    }
                }

                // -----------------------------------------------------------------------------
                //  Replace the previous helper with THIS version
                // -----------------------------------------------------------------------------
                private void LoadTurretsFromJson(string stateName)
                {
                    string filePath = System.IO.Path.Combine(
                        AppDomain.CurrentDomain.BaseDirectory, "playbooks", stateName + ".json");

                    if (!System.IO.File.Exists(filePath))
                        return;

                    var turrets = new List<SimpleTurretState>();

                    bool inTurretArray   = false;          // true after we hit  "Turrets": [
                    SimpleTurretState t = null;            // the turret currently being read

                    foreach (string raw in System.IO.File.ReadLines(filePath))
                    {
                        string line = raw.Trim();

                        // --- locate the "Turrets" block --------------------------------------
                        if (!inTurretArray)
                        {
                            if (line.StartsWith("\"Turrets\""))
                                inTurretArray = true;
                            continue;
                        }

                        // --- finished once we see the closing ] ------------------------------
                        if (line.StartsWith("]"))
                            break;

                        // --- start / end of each turret object -------------------------------
                        if (line.StartsWith("{"))
                        {
                            t = new SimpleTurretState();
                            continue;
                        }
                        if (line.StartsWith("}"))
                        {
                            if (t != null) turrets.Add(t);
                            t = null;
                            continue;
                        }

                        if (t == null) continue;           // not inside an object – skip

                        // --- read a single  "PropName": value  line --------------------------
                        int colon = line.IndexOf(':');
                        if (colon == -1) continue;

                        string prop = line.Substring(0, colon).Trim().Trim('\"');
                        string val  = line.Substring(colon + 1).Trim().Trim(',').Trim('\"');

                        switch (prop)
                        {
                            case "PosX":          t.PosX          = short.Parse(val); break;
                            case "PosY":          t.PosY          = short.Parse(val); break;
                            case "Yaw":           t.Yaw           = byte.Parse (val); break;
                            case "Side":          t.Side          = val[0];           break;
                            case "VehicleTypeId": t.VehicleTypeId = int.Parse(val);   break;
                        }
                    }

                    playbookTurrets[stateName] = turrets;
                }

        public void ChangePlayerSkill(Player player, string skillName)
        {
            // Get the skill by name
            SkillInfo newSkill = AssetManager.Manager.getSkillByName(skillName);

            if (newSkill == null)
            {
                player.sendMessage(-1, string.Format("Skill '{0}' not found.", skillName));
                return;
            }

            // Set the player's default vehicle to the vehicle associated with the skill
            if (newSkill.DefaultVehicleId > 0) // Check if the skill has an associated default vehicle
            {
                player.setDefaultVehicle(AssetManager.Manager.getVehicleByID(newSkill.DefaultVehicleId));
            }

            player._skills.Clear();

            // Create a new SkillItem and set its properties
            Player.SkillItem newSkillItem = new Player.SkillItem
            {
                skill = newSkill
            };

            // Add the new skill to the player's skills
            player._skills.Add(newSkill.SkillId, newSkillItem);

            // Synchronize player state to reflect the new skill and vehicle
            player.syncState();
        }

        // Method to update death count and take action
        private void UpdateDeathCount(Player player)
        {
            if (killStreaks.ContainsKey(player._alias))
            {
                killStreaks[player._alias].deathCount++;

                int deathCount = killStreaks[player._alias].deathCount;

                // Check if the death count reaches the threshold
                if (currentEventType == EventType.KOTH && deathCount >= 3)
                {
                    // Move the player to spectator mode
                    player.spec("You have been moved to spectator mode after 3 deaths.");

                    // Optionally, send a global message
                    arena.sendArenaMessage(string.Format("{0} has been moved to spectator mode after reaching 3 deaths.", player._alias));
                }
            }
        }

        private void deprizeMinPremades(Player player, bool applySkillExceptions, bool showMessage = false)
        {
            string playerSkill = GetPrimarySkillName(player);
            
            // First remove all items from the player
            HashSet<int> itemsToDeprive = new HashSet<int> { 2005, 2007, 2009, 2, 9, 10, 11 };
            List<string> deprivedItems = new List<string>();

            foreach (int itemID in itemsToDeprive)
            {
                if (applySkillExceptions)
                {
                    if ((playerSkill == "Combat Engineer" && itemID == 2009) ||
                        (playerSkill == "Field Medic" && (itemID == 2007 || itemID == 2005)))
                    {
                        continue;
                    }
                }

                int currentCount = player.getInventoryAmount(itemID);
                if (currentCount > 0)
                {
                    ItemInfo item = player._server._assets.getItemByID(itemID);
                    if (item != null)
                    {
                        player.inventoryModify(true, item, -currentCount);
                        deprivedItems.Add(string.Format("{0} {1}", currentCount, item.name));
                    }
                }
            }

            if (showMessage)
            {
                if (deprivedItems.Count > 0)
                {
                    string itemsList = string.Join(", ", deprivedItems);
                    arena.sendArenaMessage(string.Format("*{0} deprized {1}.", player._alias, itemsList));
                }
                else
                {
                    //player.sendMessage(0, "No players had minerals or premades to deprize.");
                }
            }
        }

        private void CheckArenaItemProfile(Player sender)
        {
            HashSet<int> itemsToCheck = new HashSet<int> { 2005, 2007, 2009, 2, 9, 10, 11 };
            bool anyFound = false;

            foreach (Player p in arena.Players)
            {
                List<string> itemCounts = new List<string>();
                
                foreach (int itemID in itemsToCheck)
                {
                    int count = p.getInventoryAmount(itemID);
                    if (count > 0)
                    {
                        ItemInfo item = p._server._assets.getItemByID(itemID);
                        if (item != null)
                        {
                            string itemName = item.name;
                            // Add nicknames for specific items
                            if (itemName == "Titanium Oxide")
                                itemName = "TOX";
                            else if (itemName == "Tsolvy Crystals")
                                itemName = "TSO";
                                
                            itemCounts.Add(string.Format("{0} {1}", count, itemName));
                        }
                    }
                }

                if (itemCounts.Count > 0)
                {
                    anyFound = true;
                    // Reorder the items to list TOX before TSO
                    List<string> reorderedItems = new List<string>();
                    string toxItem = itemCounts.FirstOrDefault(item => item.Contains("TOX"));
                    if (toxItem != null)
                    {
                        reorderedItems.Add(toxItem);
                        itemCounts.Remove(toxItem);
                    }
                    reorderedItems.AddRange(itemCounts);
                    
                    string itemsList = string.Join(", ", reorderedItems);
                    
                    // Determine prefix based on team name
                    string prefix = "&";
                    if (p._team != null)
                    {
                        if (p._team._name.Contains(" T"))
                            prefix = "~";
                        else if (p._team._name.Contains(" C"))
                            prefix = "@";
                    }
                    
                    sender.sendMessage(0, string.Format("{0}{1} - {2}", prefix, p._alias, itemsList));
                }
            }
            
            if (!anyFound)
            {
                sender.sendMessage(0, "No minerals or premades were found on any players.");
            }
        }

        // Method to update kill count and reward player
        private void UpdateKillCountAndReward(Player killer)
        {
            if (killStreaks.ContainsKey(killer._alias))
            {
                killStreaks[killer._alias].killCount++;

                int killCount = killStreaks[killer._alias].killCount;

                // Grant a reward every 5 kills
                if (killCount % 5 == 0)
                {
                    ItemInfo rewardItem = AssetManager.Manager.getItemByName("Special Ammo");
                    if (rewardItem != null)
                    {
                        killer.inventoryModify(rewardItem, 10); // Grant 10 units of Special Ammo
                        killer.sendMessage(0, "You have been awarded 10 Special Ammo for 5 kills!");
                    }
                }
            }
        }

        public void StartEvent(EventType eventType)
        {
            if (currentEventType == EventType.None || currentEventType == eventType)
            {
                currentEventType = eventType;

                switch (eventType)
                {
                    case EventType.KOTH:
                        // Initialize King of the Hill
                        //RelocateFlags();
                        break;
                    case EventType.Zombie:
                        InitializeZombie();
                        break;
                    case EventType.Gladiator:
                        StartGladiatorEvent();
                        break;
                    case EventType.CTFX:
                        InitializeCTFXEvent();
                        break;
                    case EventType.MiniTP:
                        InitializeMiniTPEvent();
                        break;
                    case EventType.SUT:
                        InitializeSUTEvent();
                        //RelocateFlags();
                        break;
                    // case EventType.TDM:
                    //     InitializeTDMEvent();
                    //     break;
                    // Add other cases
                }

                arena.sendArenaMessage(string.Format("Event '{0}' has started!", eventType));
            }
        }

        public void EndEvent()
        {
            if (currentEventType == EventType.SUT){
                RestoreStandardTeams();
                arena.gameEnd();
            }
            if (currentEventType == EventType.Gladiator){
                // Clean up gladiator-specific state
                CleanupGladiatorEvent();
                RestoreStandardTeams();
                arena.gameEnd();
            }
            // if (currentEventType == EventType.TDM){
            //     if (_tdmInstance != null)
            //     {
            //         _tdmInstance.EndGame();
            //         _tdmInstance = null;
            //     }
            //     arena.gameEnd();
            // }

            if (currentEventType == EventType.Zombie)
            {
                // Reset zombie players' skills back to "Infantry"
                foreach (Player player in arena.PlayersIngame)
                {
                    // Only change players who are still zombies back to Infantry
                    if (GetPrimarySkillName(player).Equals("Zombie", StringComparison.OrdinalIgnoreCase))
                    {
                        ChangePlayerSkill(player, "Infantry");
                        player.sendMessage(0, "The zombie event has ended. Your skill has been changed back to Infantry.");
                    }
                }
                RestoreStandardTeams();
                arena.gameEnd();
            }
            
            // Reset event type to None
            currentEventType = EventType.None;
            arena.sendArenaMessage("Event has ended.");
            return;
        }

        /// <summary>
        /// Restore players to standard teams (Titan Militia and Collective) after events that use custom teams
        /// </summary>
        private void RestoreStandardTeams()
        {
            try
            {
                Team titanTeam = arena.getTeamByName("Titan Militia");
                Team collectiveTeam = arena.getTeamByName("Collective");

                if (titanTeam == null || collectiveTeam == null)
                {
                    arena.sendArenaMessage("Error: Could not find standard teams for restoration.");
                    return;
                }

                List<Player> playersToRestore = new List<Player>();

                // Gather all players not on standard teams (excluding Duelers)
                foreach (Player player in arena.PlayersIngame)
                {
                    // Skip Duelers - they should stay on their assigned teams
                    if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                        continue;

                    // If player is not on Titan Militia or Collective, add to restoration list
                    if (player._team._name != "Titan Militia" && player._team._name != "Collective")
                    {
                        playersToRestore.Add(player);
                    }
                }

                if (playersToRestore.Count == 0)
                    return;

                // Distribute players evenly between the two standard teams
                for (int i = 0; i < playersToRestore.Count; i++)
                {
                    Player player = playersToRestore[i];
                    Team targetTeam = (i % 2 == 0) ? titanTeam : collectiveTeam;

                    // Move player to the target team
                    if (player._team != targetTeam)
                    {
                        targetTeam.addPlayer(player);
                    }
                }

                arena.sendArenaMessage("Players have been restored to standard teams.");
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in RestoreStandardTeams: {0}", ex.Message));
            }
        }

        /// <summary>
        /// Converts specific mine types in a player's inventory to their alternate versions
        /// </summary>
        /// <summary>
        /// Converts items in player's inventory based on their product purchases
        /// </summary>
        private async Task ConvertProductPurchaseItems(Player player)
        {
            try
            {
                // Get a copy of the inventory to avoid modification during iteration
                var inventoryItems = player._inventory.Values.ToList();
                
                foreach (var inventoryEntry in inventoryItems)
                {
                    string originalItemName = inventoryEntry.item.name;
                    int quantity = inventoryEntry.quantity;
                    
                    // Check if this item can be converted
                    string convertedItemName = await ProductPurchaseManager.GetConvertedItemName(player._alias, originalItemName);
                    
                    if (!convertedItemName.Equals(originalItemName, StringComparison.OrdinalIgnoreCase))
                    {
                        // Item can be converted
                        ItemInfo convertedItem = AssetManager.Manager.getItemByName(convertedItemName);
                        if (convertedItem != null)
                        {
                            // Remove the original item
                            player.inventoryModify(inventoryEntry.item, -quantity);
                            
                            // Add the converted item
                            player.inventoryModify(convertedItem, quantity);
                            
                            //player.sendMessage(0, string.Format("&Converted {0}x {1} to {2}! (Premium Product)", quantity, originalItemName, convertedItemName));
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error in ConvertProductPurchaseItems for {0}: {1}", player._alias, ex.Message));
            }
        }

        private void ConvertChampItems(Player player)
        {
            // Check if the inventory is not empty
            if (player._inventory == null || player._inventory.Count == 0)
            {
                player.sendMessage(0, "Your inventory is empty.");
                return;
            }

            // Get the conversion mapping for the player's champion group.
            Dictionary<string, int> conversions = GetChampionConversionsForPlayer(player);
            if (conversions == null)
            {
                player.sendMessage(0, "No champion item conversion available for you.");
                return;
            }

            // Create a list of items to process to avoid modifying collection during enumeration
            var itemsToProcess = player._inventory.Values
                .Where(entry => conversions.ContainsKey(entry.item.name))
                .ToList();

            // Process each item that needs conversion
            foreach (var inventoryEntry in itemsToProcess)
            {
                string itemName = inventoryEntry.item.name;
                int quantity = inventoryEntry.quantity;

                // Get the new item ID for this mine type
                int newItemId = conversions[itemName];

                if (itemName.Equals("SiG Arms m2 AS", StringComparison.OrdinalIgnoreCase) &&
                    player._alias.Equals("anjro", StringComparison.OrdinalIgnoreCase))
                {
                    newItemId = 3073;
                }

                // Remove old item first
                player.inventoryModify(false, inventoryEntry.item, -quantity);

                // Add converted item
                ItemInfo newItem = AssetManager.Manager.getItemByID(newItemId);
                if (newItem != null)
                {
                    player.inventoryModify(newItem, quantity);
                    player.sendMessage(0, string.Format("Item converted to champ item: {0} x{1} to {2}", itemName, quantity, newItem.name));
                }
            }
        }
        
        #region Champion Group Definitions

        // Season 2 Champions & their item conversion mappings
        private static readonly string[] s2Champs = new[]
        {
            "bonds", "Colossal", "gamefreek321", "Half Cut", "juetnihilia", "kal",
            "MysticGohan~", "Nos", "Pistor", "Rue", "S", "Sov", "stoink", "Tactical", "Verb", 
            "victim", "yosh", "Zmn"
        };

        private static readonly Dictionary<string, int> s2Conversions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            { "Grapeshot Mine", 1276 },
            { "AP Mine", 1274 },
            { "Plasma Mine", 1275 },
            { "Micro Missile Launcher", 3065 },
            { "Tranq", 1264 },
            { "Kuchler A6 CAW", 3069 },
            { "Needler", 1312 },
        };

        private static readonly string[] s3Champs = new[]
        {
            "NewJack", "S", "Sov", "Zmn", "jay", "kal", "spark", "MIGHTS", "MIGHTZ", "Ghost Bomber",
            "Chevelle Rising", "Doris Burke", "juetnihilia", "baal", "Metal", "Sabotage", "Melantho", "Dilatory"
        };

        private static readonly Dictionary<string, int> s3Conversions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            { "Maklov AR mk 606", 3086 },
            { "Maklov RG 2", 1326 },
            { "Stunner", 1323 },
            { "Micro Missile Launcher", 3087 },
            { "Flamethrower", 1337 }
        };

        // OVDL1 Champions & their item conversion mappings
        private static readonly string[] ovdl1Champs = new[]
        {
            "Angelus", "Herthbul", "Designer", "albert", "Ruler", "grump", "knight", "anjro", "CTF[Ref] Designer", "Joe"
        };

        private static readonly Dictionary<string, int> ovdl1Conversions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            { "SiG Arms m2 AS", 3072 },
            { "Mini Missile Launcher", 3081 },
            { "Micro Missile Launcher", 3079 },
            { "Maklov AC mk2", 3080 },
            { "Kuchler A6 CAW", 3071 },
        };

        #endregion

        // Dictionary to store player preferences for automatic conversion
        private Dictionary<Player, bool> _autoConvertEnabled = new Dictionary<Player, bool>();

        /// <summary>
        /// Returns the item conversion dictionary for the champion group the player belongs to.
        /// Returns null if the player isn't in any champion group.
        /// </summary>
        private Dictionary<string, int> GetChampionConversionsForPlayer(Player player)
        {
            if (s2Champs.Any(alias => alias.Equals(player._alias, StringComparison.OrdinalIgnoreCase)))
                return s2Conversions;
            if (ovdl1Champs.Any(alias => alias.Equals(player._alias, StringComparison.OrdinalIgnoreCase)))
                return ovdl1Conversions;
            if (s3Champs.Any(alias => alias.Equals(player._alias, StringComparison.OrdinalIgnoreCase)))
                return s3Conversions;
            return null;
        }

        /// <summary>
        /// Helper method for weapon conversion (moved from removed Player.Update handler)
        /// </summary>
        private bool HandleWeaponConversion(Player player, CS_PlayerUpdate update)
        {
            // Check if the player is firing an item
            if (update.itemID != 0)
            {
                // Get the item info
                ItemInfo info = player._server._assets.getItemByID(update.itemID);
                if (info != null)
                {
                    // Check if the item is "Maklov AC mk2"
                    if (info.name.Equals("Maklov AC mk2", StringComparison.OrdinalIgnoreCase))
                    {
                        // Find the RPG item ID
                        ItemInfo rpgItem = player._server._assets.getItemByName("RPG");
                        if (rpgItem != null)
                        {
                            // Replace the item ID with RPG
                            update.itemID = (short)rpgItem.id;
                            player.sendMessage(0, "Converted Maklov AC mk2 to RPG!");
                        }
                    }
                }
            }
            
            // Return true to allow the update to continue processing
            return true;
        }

        /// <summary>
        /// Triggered when a player buys from either shop or ?buy
        /// </summary>
        [Scripts.Event("Shop.Buy")]
        public bool PlayerShop(Player from, ItemInfo item, int quantity)
        {
            // Check if the player belongs to any champion group.
            Dictionary<string, int> conversions = GetChampionConversionsForPlayer(from);
            // debug print conversions
            //arena.sendArenaMessage("Conversions: " + conversions);
            if (conversions != null)

            {
                // arena debug message
                //arena.sendArenaMessage("Player " + from._alias + " is in a champion group, checking auto-convert flag.");
                bool autoEnabled = false;
                // Only process conversion if the player's auto-convert flag exists and is true.
                if (_autoConvertEnabled.TryGetValue(from, out autoEnabled) && autoEnabled && isChampEnabled)
                {
                    from.sendMessage(0, "Auto-convert is enabled for you, processing champion items.");
                    ConvertChampItems(from);
                }
            }
            return true;
        }

        /// <summary>
        /// Handles the ?champ command to toggle automatic item conversion
        /// </summary>
        private void HandleChampCommand(Player player)
        {
            // Verify that the player is in a champion group.
            Dictionary<string, int> conversions = GetChampionConversionsForPlayer(player);
            if (conversions == null)
            {
                player.sendMessage(-1, "You are not authorized to use this command.");
                return;
            }

            // Toggle the auto-convert setting.
            if (_autoConvertEnabled.ContainsKey(player))
            {
                _autoConvertEnabled[player] = !_autoConvertEnabled[player];
                player.sendMessage(0, string.Format("Automatic item conversion has been {0}.",
                    _autoConvertEnabled[player] ? "enabled" : "disabled"));
            }
            else
            {
                _autoConvertEnabled[player] = true;
                player.sendMessage(0, "Automatic item conversion has been enabled.");
            }

            // Immediately convert items if auto-convert was just enabled.
            if (_autoConvertEnabled[player] && isChampEnabled)
            {
                ConvertChampItems(player);
                //player.sendMessage(0, "Items converted to champion versions.");
            }
        }

        // Actively convert the inverse champ item to restore to normal items function
        private void RemoveChampItems()
        {           
            // Remove all champ items from every player in the arena
            foreach (Player p in arena.Players)
            {
                int totalItemsRemoved = 0;
                
                // Remove champion items by their IDs (the values in the conversion dictionaries)
                foreach (var item in s2Conversions)
                {
                    int champItemID = item.Value; // This gets the champion item ID (e.g., 1276, 1274, 1275)
                    ItemInfo champItem = AssetManager.Manager.getItemByID(champItemID);
                    if (champItem != null)
                    {
                        int currentAmount = p.getInventoryAmount(champItemID);
                        if (currentAmount > 0)
                        {
                            p.inventoryModify(champItem, -currentAmount);
                            totalItemsRemoved += currentAmount;
                        }
                    }
                }
                
                foreach (var item in s3Conversions)
                {
                    int champItemID = item.Value;
                    ItemInfo champItem = AssetManager.Manager.getItemByID(champItemID);
                    if (champItem != null)
                    {
                        int currentAmount = p.getInventoryAmount(champItemID);
                        if (currentAmount > 0)
                        {
                            p.inventoryModify(champItem, -currentAmount);
                            totalItemsRemoved += currentAmount;
                        }
                    }
                }
                
                // Also check for OVDL1 champion items if they exist
                foreach (var item in ovdl1Conversions)
                {
                    int champItemID = item.Value;
                    ItemInfo champItem = AssetManager.Manager.getItemByID(champItemID);
                    if (champItem != null)
                    {
                        int currentAmount = p.getInventoryAmount(champItemID);
                        if (currentAmount > 0)
                        {
                            p.inventoryModify(champItem, -currentAmount);
                            totalItemsRemoved += currentAmount;
                        }
                    }
                }
                
                if (totalItemsRemoved > 0)
                {
                    p.syncInventory();
                }
            }
        }

        private void LaunchFireworks(Player player)
        {
            // Duration of the fireworks display in milliseconds
            int displayDuration = 5000;
            // Interval between each firework launch in milliseconds
            int fireworkInterval = 200;

            // Firework item IDs
            short smallFireworkID = 3041;
            short largeFireworkID = 3040;

            // Random number generator
            Random random = new Random();
            DateTime endTime = DateTime.Now.AddMilliseconds(displayDuration);

            // Declare timer variable first
            System.Threading.Timer fireworkTimer = null;

            // Create timer callback
            fireworkTimer = new System.Threading.Timer((e) =>
            {
                // Check if display time is over
                if (DateTime.Now >= endTime)
                {
                    // Stop the timer
                    fireworkTimer.Dispose();
                    return;
                }

                // Determine if we should launch a small or large firework
                bool launchSmallFirework = random.NextDouble() < 0.7; // 70% chance for small firework

                // Choose the firework item ID based on the random chance
                short fireworkID = launchSmallFirework ? smallFireworkID : largeFireworkID;

                // Generate random positions within a specified radius around the player
                short radius = 100; // Radius around the player
                short angle = (short)(random.Next(360) * 256 / 360); // Random angle in degrees
                short distance = (short)(random.Next(radius + 1)); // Random distance within the radius
                short playerX = player._state.positionX;
                short playerY = player._state.positionY;
                short playerZ = player._state.positionZ;

                // Calculate new position based on angle and distance
                short newX = (short)(playerX + (short)(distance * Math.Cos(angle * Math.PI / 128)));
                short newY = (short)(playerY + (short)(distance * Math.Sin(angle * Math.PI / 128)));
                short newZ = playerZ; // Keep Z position the same

                byte yaw = 0; // Direction, set to 0 if not needed
                ushort creator = 0; // No specific creator, set to 0 or assign as appropriate

                // Send the projectile explosion effect to all players
                Helpers.Player_RouteExplosion(arena.Players, fireworkID, newX, newY, newZ, yaw, creator);

            }, null, 0, fireworkInterval); // Start immediately, repeat every fireworkInterval milliseconds
        }

        private void UpdateTurretOwnership(string flagName, Team newOwner)
        {
            var fs = arena.getFlag(flagName);
            if (fs == null || newOwner == null) return;

            // Identify turrets near the flag location and update ownership
            var turrets = arena.Vehicles.Where(v => v is Computer && 
                                                    Math.Abs(v._state.positionX - fs.posX) < 200 &&
                                                    Math.Abs(v._state.positionY - fs.posY) < 200);

            foreach (var turret in turrets)
            {
                turret._team = newOwner;
                Helpers.Vehicle_ResetState(turret._creator, false, false, false); // Assuming _creator is the player that owns the turret
            }
        }

        public bool InitializeMiniTPEvent()
        {
            BuildMiniTPTurrets();
            if (currentEventType != EventType.MiniTP) return false;
                arena.sendArenaMessage("MiniTP event has started!");

                // Get all flags
                Arena.FlagState flag1 = arena.getFlag("Bridge1");
                Arena.FlagState flag2 = arena.getFlag("Hill201"); 
                Arena.FlagState flag3 = arena.getFlag("Hill86");
                Arena.FlagState flag4 = arena.getFlag("Bridge2");
                Arena.FlagState flag5 = arena.getFlag("Bridge3");
                Arena.FlagState flag6 = arena.getFlag("Flag1");
                Arena.FlagState flag7 = arena.getFlag("Flag2");
                Arena.FlagState flag8 = arena.getFlag("Flag3");
                Arena.FlagState flag9 = arena.getFlag("Flag4");

                // Set Bridge3 flag team and position
                flag5.posX = 1241 * 16;
                flag5.posY = 887 * 16;
                flag5.oldPosX = 1241 * 16;
                flag5.oldPosY = 887 * 16;
                flag5.bActive = true;
                Helpers.Object_Flags(arena.Players, flag5);

                flag1.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Collective"));
                flag1.posX = 986 * 16;  
                flag1.posY = 651 * 16;
                flag1.oldPosX = 986 * 16;
                flag1.oldPosY = 651 * 16;
                flag1.bActive = true;
                Helpers.Object_Flags(arena.Players, flag1);

                flag2.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Collective"));
                flag2.posX = 965 * 16;
                flag2.posY = 651 * 16;
                flag2.oldPosX = 965 * 16;
                flag2.oldPosY = 651 * 16;
                flag2.bActive = true;
                Helpers.Object_Flags(arena.Players, flag2);

                flag3.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Titan Militia"));
                flag3.posX = 1077 * 16;
                flag3.posY = 624 * 16;
                flag3.oldPosX = 1077 * 16;
                flag3.oldPosY = 624 * 16;
                flag3.bActive = true;
                Helpers.Object_Flags(arena.Players, flag3);

                flag4.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Titan Militia"));
                flag4.posX = 1073 * 16;
                flag4.posY = 628 * 16;
                flag4.oldPosX = 1073 * 16;
                flag4.oldPosY = 628 * 16;
                flag4.bActive = true;
                Helpers.Object_Flags(arena.Players, flag4);

                // Set up new Flag1-4
                flag6.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Collective"));
                flag6.posX = 986 * 16;
                flag6.posY = 651 * 16;
                flag6.oldPosX = 986 * 16;
                flag6.oldPosY = 651 * 16;
                flag6.bActive = true;
                Helpers.Object_Flags(arena.Players, flag6);

                flag7.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Collective"));
                flag7.posX = 965 * 16;
                flag7.posY = 651 * 16;
                flag7.oldPosX = 965 * 16;
                flag7.oldPosY = 651 * 16;
                flag7.bActive = true;
                Helpers.Object_Flags(arena.Players, flag7);

                flag8.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Titan Militia"));
                flag8.posX = 1077 * 16;
                flag8.posY = 624 * 16;
                flag8.oldPosX = 1077 * 16;
                flag8.oldPosY = 624 * 16;
                flag8.bActive = true;
                Helpers.Object_Flags(arena.Players, flag8);

                flag9.team = arena.Teams.FirstOrDefault(t => t._name.Equals("Titan Militia"));
                flag9.posX = 1073 * 16;
                flag9.posY = 628 * 16;
                flag9.oldPosX = 1073 * 16;
                flag9.oldPosY = 628 * 16;
                flag9.bActive = true;
                Helpers.Object_Flags(arena.Players, flag9);

                // Spawn all players (excluding Duelers)
                foreach (Player player in arena.PlayersIngame)
                {
                    // Skip Duelers
                    if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                        continue;
                        
                    if (player._team._name.Contains("Titan"))
                        WarpPlayerToRange(player, 654, 654, 518, 518);
                    else if (player._team._name.Contains("Collective"))
                        WarpPlayerToRange(player, 648, 648, 565, 565);
                }

                arena.sendArenaMessage("Game has started!");
                return true;
        }

        public void InitializeCTFXEvent()
        {
            if (currentEventType != EventType.CTFX) return;

            // Spawn CTFX flags
            if (!SpawnCTFXFlags())
            {
                Log.write(TLog.Warning, "Failed to spawn CTFX flags.");
            }

            // Adjust private teams
            AdjustPrivateTeamsBasedOnPlayerCount();
            
            // Warp all existing players to CTFX arena (excluding Duelers)
            foreach (Player player in arena.PlayersIngame)
            {
                // Skip Duelers
                if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                    continue;
                    
                WarpPlayerToRange(player, 985, 997, 1117, 1129);
            }
            
            arena.sendArenaMessage("Game has started!", CFG.flag.resetBong);

            // Initialize turrets near each flag
            // foreach (var flag in arena._flags)
            // {
            //     if (flag.bActive)
            //     {
            //         UpdateTurretOwnership(flag.GeneralData.Name, flag.team);
            //     }
            // }
        }

//SUT
public bool InitializeSUTEvent()
{
    if (currentEventType != EventType.SUT) return false;


    // Get all players who aren't spectating
    List<Player> activePlayers = arena.PlayersIngame.ToList();

    // Assign teams using our new system
    AssignTeamsForSUT(activePlayers);

    // Warp all existing players to SUT arena (excluding Duelers)
    foreach (Player player in arena.PlayersIngame)
    {
        // Skip Duelers
        if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
            continue;
            
        WarpPlayerToRange(player, 679, 686, 608, 618);
    }

    // Give all players crowns
    //Helpers.Player_Crowns(arena, true, activePlayers, null);

    // Enable private teams and
    allowPrivateTeams = true;

    // Set victory conditions
    arena.sendArenaMessage("First team to 50 kills wins!");
    
    return true;
}

        /// <summary>
        /// Initialize TDM (Team Deathmatch) event
        /// </summary>
        // public void InitializeTDMEvent()
        // {
        //     if (currentEventType != EventType.TDM) return;

        //     // Create new TDM instance
        //     _tdmInstance = new TDM(arena);
        //     
        //     // Warp all existing players to TDM spawn areas (excluding Duelers)
        //     if (_tdmInstance != null)
        //     {
        //         foreach (Player player in arena.PlayersIngame)
        //         {
        //             // Skip Duelers
        //             if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
        //                 continue;
        //                 
        //             _tdmInstance.WarpPlayerToTDMSpawn(player);
        //         }
        //     }
        //     
        //     arena.sendArenaMessage("Team Deathmatch mode initialized!", 1);
        //     
        //     // Start the TDM game
        //     _tdmInstance.StartGame();
        // }

        /// <summary>
        /// Start tile-based voting for event selection
        /// </summary>
        public void StartEventVoting()
        {
            if (votingActive)
            {
                arena.sendArenaMessage("Voting is already in progress!");
                return;
            }

            votingActive = true;
            votingStartTick = Environment.TickCount;
            playerVotes.Clear();

            arena.sendArenaMessage("Event voting started! Step on a tile to vote. Voting ends in 30 seconds or when all players vote.");
            arena.sendArenaMessage("Available options: CTFX, SUT, Gladiator, None, MiniTP, Zombie, Duel");
            
            // Warp all players to the voting center (excluding Duelers)
            foreach (Player player in arena.PlayersIngame)
            {
                // Skip Duelers
                if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                    continue;
                    
                WarpPlayerToRange(player, 585, 585, 460, 460, -1);
            }
        }

        /// <summary>
        /// Handle player voting on tiles
        /// </summary>
        private void HandleTileVote(Player player, short tileX, short tileY)
        {
            if (!votingActive)
                return;

            // Use radius-based detection like the dueling system (3x3 grid around center)
            string votedOption = null;
            foreach (var kvp in votingTiles)
            {
                short centerX = kvp.Value.Item1;
                short centerY = kvp.Value.Item2;
                
                // Check if player is within 1 tile radius (forming a 3x3 grid around the center)
                if (Math.Abs(tileX - centerX) <= 1 && Math.Abs(tileY - centerY) <= 1)
                {
                    votedOption = kvp.Key;
                    break;
                }
            }

            if (votedOption != null)
            {
                // Special handling for Duel - call Duel(player) directly instead of voting
                if (votedOption == "Duel")
                {
                    player.sendMessage(0, "Activating duel mode for you...");
                    Duel(player);
                    return; // Don't count this as a vote
                }
                
                // Record the vote for all options (only send message if this is a new/different vote)
                if (!playerVotes.ContainsKey(player) || playerVotes[player] != votedOption)
                {
                    playerVotes[player] = votedOption;
                    player.sendMessage(0, String.Format("You have voted for {0}", votedOption));
                    
                    // Check if voting should end
                    CheckVotingResults();
                }
            }
        }

        /// <summary>
        /// Check if voting should end (all voted or majority reached)
        /// </summary>
        private void CheckVotingResults()
        {
            if (!votingActive)
                return;

            int totalPlayers = arena.PlayersIngame.Count();
            int votedPlayers = playerVotes.Count;

            // If all players have voted, end immediately
            if (votedPlayers >= totalPlayers && totalPlayers > 0)
            {
                EndVoting();
                return;
            }

            // Check for majority (more than 50% voted for the same option)
            var voteCounts = playerVotes.GroupBy(kvp => kvp.Value)
                                       .ToDictionary(g => g.Key, g => g.Count());

            int majorityNeeded = (totalPlayers / 2) + 1;
            var majorityOption = voteCounts.FirstOrDefault(kvp => kvp.Value >= majorityNeeded);

            if (majorityOption.Key != null)
            {
                EndVoting();
            }
        }

        /// <summary>
        /// End voting and execute the winning event
        /// </summary>
        private void EndVoting()
        {
            if (!votingActive)
                return;

            votingActive = false;
            
            // Clear the voting ticker properly
            arena.setTicker(3, 1, 0, "");

            if (playerVotes.Count == 0)
            {
                arena.sendArenaMessage("No votes received. No event started.");
                return;
            }

            // Count votes and determine winner
            var voteCounts = playerVotes.GroupBy(kvp => kvp.Value)
                                       .ToDictionary(g => g.Key, g => g.Count());

            var winner = voteCounts.OrderByDescending(kvp => kvp.Value).First();
            string winningOption = winner.Key;
            int winningVotes = winner.Value;

            arena.sendArenaMessage(String.Format("Voting ended! {0} wins with {1} vote(s).", winningOption, winningVotes));

            // Execute the winning choice (Duel and None are handled directly in HandleTileVote now)
            if (winningOption == "None")
            {
                // None means end current event and warp to dropship (handled in HandleTileVote)
                if (currentEventType != EventType.None)
                {
                    EndEvent();
                }
                arena.sendArenaMessage("Normal CTF gameplay selected. All players warped to dropship.");
                
                // Warp all players to dropship (excluding Duelers)
                foreach (Player player in arena.PlayersIngame)
                {
                    // Skip Duelers
                    if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                        continue;
                        
                    WarpPlayerToRange(player, 679, 686, 608, 618);
                }
            }
            else
            {
                // Parse as event type and start
                EventType eventType;
                if (Enum.TryParse<EventType>(winningOption, true, out eventType))
                {
                    // Stop current event if running
                    if (currentEventType != EventType.None)
                    {
                        EndEvent();
                    }
                    
                    // Start new event
                    StartEvent(eventType);
                }
            }

            // Clear votes
            playerVotes.Clear();
        }

        /// <summary>
        /// Check voting timeout and poll player positions for votes
        /// </summary>
        private void CheckVotingTimeout()
        {
            if (!votingActive)
                return;

            // Poll all players for voting tile positions (same approach as dueling system)
            try
            {
                foreach (Player player in arena.PlayersIngame)
                {
                    if (player == null || player._team == null)
                        continue;

                    // Convert player position to tile coordinates (same as dueling system)
                    short tileX = (short)(player._state.positionX / 16);
                    short tileY = (short)(player._state.positionY / 16);
                    
                    // Check for voting tiles
                    HandleTileVote(player, tileX, tileY);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in voting poll: {0}", ex.Message));
            }

            // Check if voting is still active (it might have ended during HandleTileVote)
            if (!votingActive)
                return;

            // Calculate remaining time and update ticker
            int elapsedTime = Environment.TickCount - votingStartTick;
            int remainingTime = Math.Max(0, VOTING_TIMEOUT_MS - elapsedTime);
            int remainingSeconds = (int)Math.Ceiling(remainingTime / 1000.0); // Use ceiling for more accurate countdown
            
            // Update ticker with remaining time (position 3 to appear below other tickers)
            if (remainingSeconds > 0)
            {
                arena.setTicker(3, 1, 0, String.Format("Voting ends: {0}s left", remainingSeconds));
            }

            // Check timeout
            if (Environment.TickCount - votingStartTick >= VOTING_TIMEOUT_MS)
            {
                arena.sendArenaMessage("Voting timeout reached!");
                EndVoting();
            }
        }

private void AssignTeamsForSUT(List<Player> players)
{
    // Ensure that players list is not empty
    if (players.Count == 0) return;

    // Get the arena from any player
    Arena arena = players[0]._arena;

    // Define team name suffixes
    string[] suffixes = { "Renegades", "Sentinels", "Warriors", "Guardians", "Raiders", 
                         "Vanguards", "Avengers", "Titans", "Commandos", "Strikers" };
    Random rand = new Random();

    // Calculate how many teams we need (max 3 players per team)
    int teamCount = (int)Math.Ceiling(players.Count / 3.0);
    List<List<Player>> teams = new List<List<Player>>();
    for (int i = 0; i < teamCount; i++)
    {
        teams.Add(new List<Player>());
    }

    // Randomly distribute players across teams
    List<Player> allPlayers = new List<Player>(players);
    int currentTeam = 0;

    while (allPlayers.Count > 0)
    {
        // Get a random player
        int index = rand.Next(allPlayers.Count);
        Player player = allPlayers[index];
        allPlayers.RemoveAt(index);

        // Add to current team
        teams[currentTeam].Add(player);

        // Move to next team (round-robin)
        currentTeam = (currentTeam + 1) % teamCount;
    }

    // Create and assign teams
    for (int i = 0; i < teams.Count; i++)
    {
        var teamPlayers = teams[i];
        if (teamPlayers.Count == 0) continue;

        // Generate team name
        string teamName = teamPlayers[0]._alias.Length <= 10 
            ? string.Format("{0} {1}", teamPlayers[0]._alias, suffixes[rand.Next(suffixes.Length)])
            : string.Format("Team {0}", suffixes[rand.Next(suffixes.Length)]);

        // Create team if it doesn't exist
        Team team = arena.getTeamByName(teamName);
        if (team == null)
        {
            team = new Team(arena, arena._server)
            {
                _name = teamName,
                _isPrivate = false,
                _id = (short)arena.Teams.Count()
            };
            arena.createTeam(team);
        }

        // Assign players to team
        foreach (Player player in teamPlayers)
        {
            AssignPlayerToTeam(player, GetPrimarySkillName(player), teamName, true, false);
        }
    }

    // // Announce team assignments
    // arena.sendArenaMessage("&Teams have been assigned!");
    
    // // Display team compositions
    // for (int i = 0; i < teams.Count; i++)
    // {
    //     var teamPlayers = teams[i];
    //     if (teamPlayers.Count == 0) continue;

    //     string teamName = teamPlayers[0]._alias.Length <= 10 
    //         ? string.Format("{0} {1}", teamPlayers[0]._alias, suffixes[rand.Next(suffixes.Length)])
    //         : string.Format("Team {0}", suffixes[rand.Next(suffixes.Length)]);

    //     arena.sendArenaMessage(string.Format("~{0}: {1}/3 players", teamName, teamPlayers.Count));
    //     foreach (var player in teamPlayers)
    //     {
    //         arena.sendArenaMessage(string.Format("   {0} ({1})", player._alias, GetPrimarySkillName(player)));
    //     }
    // }
}

private bool CanSwitchTeamsDuringSUT(Player player, string targetTeamName)
{
    if (currentEventType != EventType.SUT)
        return true;

    Team targetTeam = arena.getTeamByName(targetTeamName);
    if (targetTeam == null)
        return true;

    // Only restrict team size to 3 players maximum
    if (targetTeam.ActivePlayerCount >= 3)
    {
        player.sendMessage(-1, "That team is full (maximum 3 players per team in SUT).");
        return false;
    }

    return true;
}
        private void SpawnVehicle(int posX, int posY, Team team)
        {
            VehInfo supplyVehicle = AssetManager.Manager.getVehicleByID(412);
            Helpers.ObjectState objState = new Helpers.ObjectState
            {
                positionX = (short)(posX * 16),
                positionY = (short)(posY * 16),
                positionZ = 0
            };

            arena.newVehicle(supplyVehicle, team, null, objState);
        }

        private void AdjustPrivateTeamsBasedOnPlayerCount()
        {
            int playerCount = arena.Players.Count();
            int maxPrivateTeamPlayers = 0;

            if (playerCount <= 10)
            {
                allowPrivateTeams = false;
            }
            else if (playerCount <= 30)
            {
                allowPrivateTeams = true;
                maxPrivateTeamPlayers = 5;
            }
            else if (playerCount <= 40)
            {
                maxPrivateTeamPlayers = 8;
            }
            else if (playerCount <= 50)
            {
                maxPrivateTeamPlayers = 10;
            }
            else
            {
                allowPrivateTeams = true;
                maxPrivateTeamPlayers = int.MaxValue; // No restrictions
            }

            // Notify players of changes
            string status = allowPrivateTeams ? string.Format("enabled (max {0} players)", maxPrivateTeamPlayers) : "disabled";
            arena.sendArenaMessage(string.Format("Private teams are now {0}.", status));
        }


        private bool SpawnCTFXFlags()
        {
            // First deactivate all flags
            foreach (var flag in arena._flags.Values)
            {
                flag.bActive = false;
                Helpers.Object_Flags(arena.Players, flag);
            }

            List<MapFlagEntry> ctfxFlags = new List<MapFlagEntry>
            {
                new MapFlagEntry("Flag1", 387, 1256),
                new MapFlagEntry("Flag2", 613, 1349),
                new MapFlagEntry("Flag3", 800, 1457),
                new MapFlagEntry("Flag4", 821, 1676)
            };

            foreach (var flag in ctfxFlags)
            {
                var fs = arena.getFlag(flag.Item1);

                if (fs == null)
                {
                    return false; // Flag not found in arena
                }

                fs.posX = (short)(flag.Item2 * 16);
                fs.posY = (short)(flag.Item3 * 16);
                fs.oldPosX = (short)(flag.Item2 * 16);
                fs.oldPosY = (short)(flag.Item3 * 16);
                fs.bActive = true;
                fs.team = null;
                fs.carrier = null;

                Helpers.Object_Flags(arena.Players, fs);
            }

            return true;
        }


/// <summary>
/// Randomly warps a player within a rectangular tile region. Optionally, 
/// set their energy to a specific value. If you pass -1 for `overrideEnergy`,
/// the player keeps their current energy.
/// </summary>
private void WarpPlayerToRange(Player player, 
                               int tileXMin, int tileXMax, 
                               int tileYMin, int tileYMax,
                               short overrideEnergy = -1)
{
    // Randomize coordinates within the specified range
    Random rnd = new Random();
    int tileX = rnd.Next(tileXMin, tileXMax + 1);
    int tileY = rnd.Next(tileYMin, tileYMax + 1);

    // Convert tile coordinates to game units (pixels * 16)
    short gameX = (short)(tileX * 16);
    short gameY = (short)(tileY * 16);

    // Create an ObjectState with the new position
    Helpers.ObjectState newState = new Helpers.ObjectState
    {
        positionX = gameX,
        positionY = gameY,
        positionZ = 0,          // Typically ground level
        yaw = player._state.yaw // Keep the player's current orientation
    };

    // Decide which energy to use:
    //   - If overrideEnergy == -1, keep the player's current energy
    //   - Otherwise, override the player's energy with the provided value
    short finalEnergy = (overrideEnergy == -1)
        ? player._state.energy // "no change"
        : overrideEnergy;      // "use the specified energy"

    // Keep the player's current health
    short finalHealth = player._state.health;

    // Warp the player with their current health/energy/yaw
    player.warp(Helpers.ResetFlags.ResetNone, newState, finalHealth, finalEnergy, (byte)newState.yaw);
}

        // Define DuelEventState enum
private enum DuelEventState
{
    Inactive,
    SignupPhase,
    PoolPhase,
    KnockoutPhase,
    Completed
}

// Add the duel-related variables in the class
private DuelEventState duelState = DuelEventState.Inactive;
private List<Player> duelParticipants = new List<Player>();
private List<Tuple<Player, Player>> currentMatches = new List<Tuple<Player, Player>>();
private Dictionary<Player, int> playerScores = new Dictionary<Player, int>();

// Alias for the player that we will simulate fake players for
private string simulatedAlias = "Axidus";

// Duel staging and duel pad coordinates (multiplied by 16 for position units)
private readonly int[] duelStagingArea = new int[] { 810 * 16, 535 * 16 };
private readonly List<int[]> duelPads = new List<int[]>
{
    new int[] { 767 * 16, 525 * 16 },
    new int[] { 791 * 16, 525 * 16 },
    new int[] { 765 * 16, 544 * 16 },
    new int[] { 791 * 16, 544 * 16 }
};

// Start the duel event
private void StartDuelEvent(Player initiator)
{
    if (duelState != DuelEventState.Inactive)
    {
        EndDuelEvent();
        return;
    }

    duelState = DuelEventState.SignupPhase;
    duelParticipants.Clear();
    currentMatches.Clear();
    playerScores.Clear();

    arena.sendArenaMessage(string.Format("~Duel event initiated by {0}. Use ?duel to sign up.", initiator._alias));

    // Automatically sign up players with the Dueler skill
    SignUpDuelerPlayers();

    duelParticipants = duelParticipants.OrderBy(p => Guid.NewGuid()).ToList(); // Shuffle participants

    // Send an arena message listing out the duelParticipants foreach
    string participantList = string.Join(", ", duelParticipants.Select(p => p._alias));
    arena.sendArenaMessage(string.Format("~Duel participants: {0}", participantList));

    
    // Start pool phase if there are enough participants
    if (duelParticipants.Count >= 8)
    {
        StartPoolPhase();
        arena.sendArenaMessage("Duel event has started. Players have been paired for the first round.");
    }
    else
    {
        arena.sendArenaMessage("Not enough participants to start the duel event.");
        EndDuelEvent();
    }
    
}

// End the duel event
private void EndDuelEvent()
{
    duelState = DuelEventState.Inactive;
    duelParticipants.Clear();
    currentMatches.Clear();
    playerScores.Clear();

    arena.sendArenaMessage("~Duel event has ended.");
}

// Pair players and start pool phase matches
private void StartPoolPhase()
{
    duelState = DuelEventState.PoolPhase;
    arena.sendArenaMessage("~Starting pool phase.");

    // Shuffle players
    //duelParticipants = duelParticipants.OrderBy(p => Guid.NewGuid()).ToList();
    currentMatches.Clear();

    // Pair players and start matches if we have at least 8 participants

    for (int i = 0; i < duelParticipants.Count; i += 2)
    {
        if (i + 1 < duelParticipants.Count)
        {
            currentMatches.Add(new Tuple<Player, Player>(duelParticipants[i], duelParticipants[i + 1]));
        }
        else
        {
            // Handle odd player
            arena.sendArenaMessage(string.Format("~{0} has no opponent and advances to the next round.", duelParticipants[i]._alias));
        }
    }

    // Start the matches
    StartNextMatches();
}

// Warp players to duel pads and start matches
private void StartNextMatches()
{
    arena.sendArenaMessage("~Warping players and starting matches.");
    for (int i = 0; i < currentMatches.Count && i < duelPads.Count; i++)
    {
        var match = currentMatches[i];
        var pad = duelPads[i];

        // Warp first player if they are real
        if (match.Item1._client != null)
        {
            Helpers.ObjectState newState1 = new Helpers.ObjectState
            {
                positionX = (short)(pad[0]), // Use pad[0] directly
                positionY = (short)(pad[1]), // Use pad[1] directly
                positionZ = 0,
                yaw = match.Item1._state.yaw
            };

            match.Item1.warp(Helpers.ResetFlags.ResetAll, newState1, 0, -1, 0);
        }

        // Warp second player if they are real
        if (match.Item2._client != null)
        {
            Helpers.ObjectState newState2 = new Helpers.ObjectState
            {
                positionX = (short)(pad[0]),
                positionY = (short)(pad[1]),
                positionZ = 0,
                yaw = match.Item2._state.yaw
            };

            match.Item2.warp(Helpers.ResetFlags.ResetAll, newState2, 0, -1, 0);
        }

        // Initialize player scores
        playerScores[match.Item1] = 0;
        playerScores[match.Item2] = 0;

        // Announce the match
        arena.sendArenaMessage(string.Format("@Match: {0} vs {1}", match.Item1._alias, match.Item2._alias));
    }
}

// Set up the pool phase matches
private void SetupPoolPhaseMatches()
{
    currentMatches.Clear();

    // Pair up participants for the pool phase (2 players per match)
    for (int i = 0; i < duelParticipants.Count; i += 2)
    {
        if (i + 1 < duelParticipants.Count)
        {
            // Create a match between two players
            currentMatches.Add(Tuple.Create(duelParticipants[i], duelParticipants[i + 1]));
        }
        else
        {
            // Handle odd player
            arena.sendArenaMessage(string.Format("{0} has no opponent and advances to the next round.", duelParticipants[i]._alias));
            // Optionally add back to participants for next round
        }
    }

    // Inform players about their matches
    foreach (var match in currentMatches)
    {
        //match.Item1.sendMessage(0, string.Format("You are paired against {0} in the pool phase.", match.Item2._alias));
        //match.Item2.sendMessage(0, string.Format("You are paired against {0} in the pool phase.", match.Item1._alias));
    }

    // Announce matches in the arena
    arena.sendArenaMessage("&Duel Tournament Matches:");
    foreach (var match in currentMatches)
    {
        arena.sendArenaMessage(string.Format("*{0} vs {1}", match.Item1._alias, match.Item2._alias));
    }

    // Start the matches
    StartNextMatches();

    if (duelParticipants.Count < 8)
    {
        arena.sendArenaMessage(string.Format("Waiting for more players to sign up. Current count: {0}", duelParticipants.Count));
    }
}

// Adjust the start duel event to sign up all Dueler players
private void StartDuelEvent()
{
    if (duelState != DuelEventState.Inactive)
    {
        EndDuelEvent();
        return;
    }

    // Start the signup phase
    duelState = DuelEventState.SignupPhase;

    duelParticipants.Clear();
    currentMatches.Clear();
    playerScores.Clear();

    // Automatically sign up players with the Dueler skill
    SignUpDuelerPlayers();

    arena.sendArenaMessage("Duel event signup phase has started. Use ?duel to sign up.");

    // Check if we have enough participants to start the pool phase
    if (duelParticipants.Count >= 8)
    {
        StartPoolPhase();
    }
    else
    {
        arena.sendArenaMessage(string.Format("Waiting for more players to sign up. Current count: {0}", duelParticipants.Count));
    }
}

// Simulate fake players if the player alias matches the simulatedAlias
private void SimulateFakePlayers(Player player)
{
    if (player._alias.Equals(simulatedAlias, StringComparison.OrdinalIgnoreCase))
    {
        // Add 7 fake players with incrementing numbers
        for (int i = 1; i <= 7; i++)
        {
            string fakeAlias = simulatedAlias + i;
            Player fakePlayer = CreateFakePlayer(fakeAlias);
            duelParticipants.Add(fakePlayer);
            playerScores[fakePlayer] = 0;
        }
    }
}

// Create a fake player with a given alias
private Player CreateFakePlayer(string alias)
{
    Player fakePlayer = new Player(); // Adjust player creation logic based on your actual instantiation method
    fakePlayer._alias = alias;

    // We don't set the Dueler skill for fake players anymore
    fakePlayer._skills = new Dictionary<int, Player.SkillItem>();

    fakePlayer._team = null; // Set as neutral or assign a team

    return fakePlayer;
}

// Sign up all players and create fake players if necessary
private void SignUpDuelerPlayers()
{
    foreach (var player in arena.Players)
    {
        string skillName = GetPrimarySkillName(player);

        if (skillName.Equals("Dueler", StringComparison.OrdinalIgnoreCase))
        {
            duelParticipants.Add(player);
            playerScores[player] = 0;
            player.sendMessage(0, "You have been automatically signed up for the duel event.");

        // Simulate fake players if necessary
        SimulateFakePlayers(player);
        }
    }
}

// Advance winners and set up next matches
private void AdvanceToNextRound(Player winner)
{
    // Remove the completed match
    var match = currentMatches.FirstOrDefault(m => m.Item1 == winner || m.Item2 == winner);
    if (match != null)
    {
        currentMatches.Remove(match);
    }

    // Add winner to next round participants
    duelParticipants.Add(winner);
    var stagedArea = duelStagingArea;

    Helpers.ObjectState newState = new Helpers.ObjectState
    {
        positionX = (short)(stagedArea[0]),
        positionY = (short)(stagedArea[1]),
        positionZ = 0,
        yaw = winner._state.yaw
    };

    winner.warp(Helpers.ResetFlags.ResetAll, newState, 0, -1, 0);

    // Check if all matches are completed
    if (currentMatches.Count == 0)
    {
        if (duelParticipants.Count == 1)
        {
            // Tournament completed
            Player champion = duelParticipants.First();
            arena.sendArenaMessage(string.Format("Congratulations {0}! You are the Duel Tournament Champion!", champion._alias));
            duelState = DuelEventState.Completed;
            EndDuelEvent();
        }
        else
        {
            // Start next phase
            PrepareNextMatches();
        }
    }
}

// Prepare next matches for the knockout phase
private void PrepareNextMatches()
{
    duelState = DuelEventState.KnockoutPhase;

    // Shuffle participants
    var shuffledPlayers = duelParticipants.OrderBy(p => Guid.NewGuid()).ToList();
    duelParticipants.Clear();
    currentMatches.Clear();

    for (int i = 0; i < shuffledPlayers.Count; i += 2)
    {
        if (i + 1 < shuffledPlayers.Count)
        {
            currentMatches.Add(new Tuple<Player, Player>(shuffledPlayers[i], shuffledPlayers[i + 1]));
        }
        else
        {
            // Odd player advances automatically
            duelParticipants.Add(shuffledPlayers[i]);
            shuffledPlayers[i].sendMessage(0, "You have advanced to the next round by default.");
        }
    }

    // Inform players about their matches
    arena.sendArenaMessage("Next Round Matches:");
    foreach (var match in currentMatches)
    {
        arena.sendArenaMessage(string.Format("{0} vs {1}", match.Item1._alias, match.Item2._alias));
    }

    // Reset player scores
    ResetPlayerScores();

    // Warp players to duel pads and start matches
    StartNextMatches();
}

// Reset player scores to zero
private void ResetPlayerScores()
{
    foreach (var player in duelParticipants)
    {
        playerScores[player] = 0;
    }
}

        public void Duel(Player player)
        {
            List<Player> players = arena.PlayersIngame.ToList();
            if ((arena._name.Contains("Arena 1") || arena._name.Contains("Public1")) && players.Count > 4)
            {
                player.sendMessage(1, "Can only duel with 4 or less players in a public arena, please move to a private arena to duel with more players.");
                return;
            }

            // Get the current terrain ID
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
            
            // Store spectator status
            bool wasSpectator = player.IsSpectator;

            // Check if the player is a spectator
            if (wasSpectator)
            {
                /*    // Reset the player's inventory
                    player.resetInventory(true);
                    
                    // Change the player's skill to "Dueler"
                    ChangePlayerSkill(player, "Dueler");

                // Iterate through teams to find an empty one (teams 2 to 33)
                for (int i = 2; i <= 33; i++)
                {
                    string teamName = CFG.teams[i].name;
                    Team team = player._arena.getTeamByName(teamName);

                    // Check if the team exists and is empty
                    if (team != null && team.ActivePlayerCount == 0)
                    {
                        // Unspecc the player on the empty team
                        player.unspec(team);
                        
                        // Warp the player to the exact coordinates (756, 533) scaled by 16
                        WarpPlayerToExactLocation(player, 756, 533);
                        return; // Exit after unspecing and warping the player
                    }
                }
                */

                // If no empty team was found, notify the player
                player.sendMessage(-1, "Please unspec before attempting to duel.");
            }
            else
            {
                // If the player is not a spectator, check for valid terrain for dueling
                if (terrainID == 4 || terrainID == 3 || terrainID == 1 || terrainID == 2) // Only allow if on valid terrain
                {
                    // Reset the player's inventory
                    player.resetInventory(true);
                    
                    // Change the player's skill to "Dueler"
                    ChangePlayerSkill(player, "Dueler");

                    // Give him item name "AssaultRifle"
                    if (player._alias.Equals("thegreatchompy", StringComparison.OrdinalIgnoreCase) || player._alias.Equals("tgc", StringComparison.OrdinalIgnoreCase))
                    {
                        player.inventoryModify(3088, 1);
                    }
                    else
                    {
                        player.inventoryModify(1162, 1);
                    }

                    // Find all empty teams (teams 2 to 33)
                    List<int> emptyTeams = new List<int>();
                    for (int i = 2; i <= 33; i++)
                    {
                        string teamName = CFG.teams[i].name;
                        Team team = player._arena.getTeamByName(teamName);

                        // Check if the team exists and is empty
                        if (team != null && team.ActivePlayerCount == 0)
                        {
                            emptyTeams.Add(i);
                        }
                    }

                    // If we found empty teams, pick one randomly
                    if (emptyTeams.Count > 0)
                    {
                        Random random = new Random();
                        int randomTeamIndex = emptyTeams[random.Next(emptyTeams.Count)];
                        string randomTeamName = CFG.teams[randomTeamIndex].name;
                        
                        // Assign the player to the random empty team
                        AssignPlayerToTeam(player, "Dueler", randomTeamName, false, true);
                        
                        // Warp the player to the exact coordinates (756, 533) scaled by 16
                        WarpPlayerToExactLocation(player, 756, 533);
                        return; // Exit after assigning and warping the player
                    }

                    // If no empty team was found, notify the player
                    player.sendMessage(0, "No available teams for the duel.");
                }
                else
                {
                    // Notify the player they cannot duel from their current location
                    player.sendMessage(0, "You cannot duel from your current location. Please try from spec or DropShip");
                }
            }
        }

        // Function to schedule overtime for a specific minute mark
            private void ScheduleOvertime(int minutes)
            {
                // Calculate the desired overtime start time in milliseconds
                int overtimeInMilliseconds = minutes * 60000;
                
                // Schedule overtime to start at the specified minute mark from the game start
                overtimeStart = arena._tickGameStarted + overtimeInMilliseconds;
            }

            // Function to toggle overtime mode on/off
            private void ToggleOvertimeMode()
            {
                if (!isSD)
                {
                    // Start first overtime immediately
                    isSD = true;
                    arena.sendArenaMessage("&Overtime triggered. 50% Reduced healing on both Medikits. Engineer Repairs reduced to 50 hp.", 30);

                    // Record the start time of the first overtime
                    overtimeStart = Environment.TickCount;

                    // Schedule the second overtime
                    secondOvertimeStart = overtimeStart + (15 * 60000); // 15 minutes
                }
                else
                {
                    // Turn off overtime modes
                    isSD = false;
                    isSecondOvertime = false;
                    overtimeStart = 0;
                    secondOvertimeStart = 0;
                    arena.sendArenaMessage("&Overtime mode disabled, healing/repair items restored to normal.");
                }
            }

        private void WarpPlayerToExactLocation(Player player, int tileX, int tileY)
        {
            // Convert tile coordinates to game units by multiplying by 16
            short gameX = (short)(tileX * 16);
            short gameY = (short)(tileY * 16);

            // Create an ObjectState with the new position
            Helpers.ObjectState newState = new Helpers.ObjectState
            {
                positionX = gameX,
                positionY = gameY,
                positionZ = 0, // Set to 0 or adjust as needed
                yaw = player._state.yaw // Maintain the player's current orientation
            };
                // Warp the player to the new location
                player.warp(Helpers.ResetFlags.ResetAll, newState, 0, -1, 0);

        }

private void SpawnVehicle(string side, string location)
{
    // Define valid sides
    string[] validSides = { "Titan", "Collective" };

    // Dictionary to store coordinates for main vehicle locations
    Dictionary<string, int[]> mainLocations = new Dictionary<string, int[]>
    {
        { "d8", new int[] { 275, 601 } },
        { "a10", new int[] { 50, 763 } },
        { "c10", new int[] { 210, 703 } }
    };

    // Dictionary to store coordinates for exit vehicle locations
    Dictionary<string, int[]> exitLocations = new Dictionary<string, int[]>
    {
        { "Titan", new int[] { 315, 153 } },      // Titan exit coordinates
        { "Collective", new int[] { 17, 205 } }   // Collective exit coordinates
    };

    // Define vehicle IDs based on side
    int mainVehicleId = side.Equals("Titan", StringComparison.OrdinalIgnoreCase) ? 414 : 416;
    int exitVehicleId = side.Equals("Titan", StringComparison.OrdinalIgnoreCase) ? 441 : 440;

    // Validate location
    if (!mainLocations.ContainsKey(location))
    {
        arena.sendArenaMessage(string.Format("Invalid location: {0}", location), -1);
        return;
    }

    // Validate side
    if (!exitLocations.ContainsKey(side))
    {
        arena.sendArenaMessage(string.Format("Invalid side: {0}", side), -1);
        return;
    }

    // Get main vehicle coordinates
    int mainX = mainLocations[location][0];
    int mainY = mainLocations[location][1];

    // Get exit vehicle coordinates
    int exitX = exitLocations[side][0];
    int exitY = exitLocations[side][1];

    // Retrieve vehicle information
    VehInfo mainVehInfo = arena._server._assets.getVehicleByID(mainVehicleId);
    if (mainVehInfo == null)
    {
        arena.sendArenaMessage(string.Format("Main vehicle ID {0} not found.", mainVehicleId), -1);
        return;
    }

    VehInfo exitVehInfo = arena._server._assets.getVehicleByID(exitVehicleId);
    if (exitVehInfo == null)
    {
        arena.sendArenaMessage(string.Format("Exit vehicle ID {0} not found.", exitVehicleId), -1);
        return;
    }

    // Initialize vehicle states
    Helpers.ObjectState mainState = new Protocol.Helpers.ObjectState
    {
        positionX = (short)(mainX * 16),
        positionY = (short)(mainY * 16)
    };

    Helpers.ObjectState exitState = new Protocol.Helpers.ObjectState
    {
        positionX = (short)(exitX * 16),
        positionY = (short)(exitY * 16)
    };

    // Assign to team
    Team targetTeam = side.Equals("Titan", StringComparison.OrdinalIgnoreCase) ? 
                      arena.Teams.ElementAtOrDefault(0) : 
                      arena.Teams.ElementAtOrDefault(1);
    if (targetTeam == null)
    {
        arena.sendArenaMessage(string.Format("Target team not found for side: {0}", side), -1);
        return;
    }

    try
    {
        // Spawn main vehicle
        arena.newVehicle(mainVehInfo, targetTeam, null, mainState, null);
        arena.sendArenaMessage(string.Format("Spawned main vehicle at {0} for {1}.", location, side));

        // Spawn exit vehicle
        arena.newVehicle(exitVehInfo, targetTeam, null, exitState, null);
        arena.sendArenaMessage(string.Format("Spawned exit vehicle (ID {0}) for {1} at coordinates ({2}, {3}).", exitVehicleId, side, exitX, exitY));
    }
    catch (Exception ex)
    {
        // Log exception details
        Console.WriteLine(string.Format("Error spawning vehicles: {0}", ex.Message));
        arena.sendArenaMessage(string.Format("Failed to set base and exit vehicles."), -1);
    }
}

        //Function to count the total number of drops in the arena
        private int CountDropsInArena(bool detailed = false)
        {
            if (!detailed)
            {
                int dropCount = 0;
                foreach (var item in arena._items.Values)
                {
                    dropCount++;
                }
                return dropCount;
            }
            else
            {
                Dictionary<int, int> itemCounts = new Dictionary<int, int>();
                foreach (var item in arena._items.Values)
                {
                    int itemId = item.item.id;
                    if (!itemCounts.ContainsKey(itemId))
                        itemCounts[itemId] = 0;
                    itemCounts[itemId]++;
                }

                // Print detailed breakdown
                foreach (var kvp in itemCounts)
                {
                    arena.sendArenaMessage(string.Format("Item ID {0}: {1} drops", kvp.Key, kvp.Value));
                }

                return itemCounts.Values.Sum();
            }
        }

        // Function to manage drop piles based on where flags are
        public void ManageFixedDropLocations(bool spreadItems = false)
        {
            // Define the fixed drop locations relative to flag A7
            List<Tuple<short, short>> dropLocations = new List<Tuple<short, short>>
            {
                // A7 base locations
                new Tuple<short, short>((short)(24 * 16), (short)(445 * 16)),
                new Tuple<short, short>((short)(37 * 16), (short)(445 * 16)), 
                new Tuple<short, short>((short)(48 * 16), (short)(445 * 16)),
                new Tuple<short, short>((short)(26 * 16), (short)(456 * 16)),
                new Tuple<short, short>((short)(13 * 16), (short)(444 * 16)),

                // D7 base locations 
                new Tuple<short, short>((short)(275 * 16), (short)(495 * 16)),
                new Tuple<short, short>((short)(279 * 16), (short)(492 * 16)),
                new Tuple<short, short>((short)(286 * 16), (short)(487 * 16)),
                new Tuple<short, short>((short)(289 * 16), (short)(494 * 16)),
                new Tuple<short, short>((short)(284 * 16), (short)(498 * 16)),

                // F5 base locations
                new Tuple<short, short>((short)(414 * 16), (short)(375 * 16)),
                new Tuple<short, short>((short)(410 * 16), (short)(380 * 16)),
                new Tuple<short, short>((short)(398 * 16), (short)(380 * 16)),
                new Tuple<short, short>((short)(407 * 16), (short)(387 * 16)),
                new Tuple<short, short>((short)(419 * 16), (short)(386 * 16)),

                // F6 base locations
                new Tuple<short, short>((short)(445 * 16), (short)(462 * 16)),
                new Tuple<short, short>((short)(435 * 16), (short)(462 * 16)),
                new Tuple<short, short>((short)(453 * 16), (short)(468 * 16)),
                new Tuple<short, short>((short)(453 * 16), (short)(474 * 16)),
                new Tuple<short, short>((short)(459 * 16), (short)(454 * 16)),

                // A5 base locations
                new Tuple<short, short>((short)(39 * 16), (short)(374 * 16)),
                new Tuple<short, short>((short)(42 * 16), (short)(365 * 16)),
                new Tuple<short, short>((short)(55 * 16), (short)(375 * 16)),
                new Tuple<short, short>((short)(65 * 16), (short)(375 * 16)),
                new Tuple<short, short>((short)(56 * 16), (short)(369 * 16)),

                // B8 base locations
                new Tuple<short, short>((short)(149 * 16), (short)(607 * 16)),
                new Tuple<short, short>((short)(149 * 16), (short)(596 * 16)), 
                new Tuple<short, short>((short)(139 * 16), (short)(586 * 16)),
                new Tuple<short, short>((short)(158 * 16), (short)(597 * 16)),
                new Tuple<short, short>((short)(159 * 16), (short)(604 * 16))
            };

            // Define item types and their max quantities
            Dictionary<string, int> itemMaxQuantities = new Dictionary<string, int>
            {
                {"Heavy HE", 20},
                {"Bullet Mine", 20},
                {"AP Mine", 5},
                {"Plasma Mine", 5},
                {"Light HE", 50},
                {"Ammo Pistol", 500},
                {"Ammo MG", 250},
                {"rocket", 40},
                {"tranq", 10},
                {"sentry", 1}
            };

            foreach (var flag in _flags)
            {
                List<Tuple<short, short>> selectedLocations = null;

                // Check which base area the flag is in and select corresponding drop locations
                if (flag.posX >= 3 * 16 && flag.posX <= 73 * 16 && flag.posY >= 432 * 16 && flag.posY <= 514 * 16)
                {
                    selectedLocations = dropLocations.Take(5).ToList(); // A7 locations
                }
                else if (flag.posX >= 255 * 16 && flag.posX <= 324 * 16 && flag.posY >= 419 * 16 && flag.posY <= 506 * 16)
                {
                    selectedLocations = dropLocations.Skip(5).Take(5).ToList(); // D7 locations
                }
                else if (flag.posX >= 368 * 16 && flag.posX <= 434 * 16 && flag.posY >= 321 * 16 && flag.posY <= 399 * 16)
                {
                    selectedLocations = dropLocations.Skip(10).Take(5).ToList(); // F5 locations
                }
                else if (flag.posX >= 379 * 16 && flag.posX <= 479 * 16 && flag.posY >= 439 * 16 && flag.posY <= 508 * 16)
                {
                    selectedLocations = dropLocations.Skip(15).Take(5).ToList(); // F6 locations
                }
                else if (flag.posX >= 3 * 16 && flag.posX <= 76 * 16 && flag.posY >= 315 * 16 && flag.posY <= 385 * 16)
                {
                    selectedLocations = dropLocations.Skip(20).Take(5).ToList(); // A5 locations
                }
                else if (flag.posX >= 128 * 16 && flag.posX <= 212 * 16 && flag.posY >= 556 * 16 && flag.posY <= 628 * 16)
                {
                    selectedLocations = dropLocations.Skip(25).Take(5).ToList(); // B8 locations
                }

                if (selectedLocations != null)
                {
                    foreach (var location in selectedLocations)
                    {
                        short xOffset = 0;
                        foreach (var itemEntry in itemMaxQuantities)
                        {
                            string itemName = itemEntry.Key;
                            int maxQuantity = itemEntry.Value;

                            short actualX = spreadItems ? (short)(location.Item1 + (xOffset * 16)) : location.Item1;

                            arena.itemSpawn(arena._server._assets.getItemByName(itemName),
                                          (ushort)maxQuantity,
                                          actualX,
                                          location.Item2,
                                          0,
                                          null);

                            if (spreadItems)
                            {
                                xOffset++;
                            }
                        }
                    }
                    break; // Exit after spawning for the first valid flag location
                }
            }
        }

        private void changeD7()
        {
            // Retrieve vehicle information for ID 414
            VehInfo vehicleToSpawn = arena._server._assets.getVehicleByID(414);
            if (vehicleToSpawn == null)
            {
                Log.write(TLog.Error, "Vehicle with ID 414 could not be found.");
                return;
            }

            // Initialize vehicle state with scaled coordinates
            Helpers.ObjectState vehicleState = new Protocol.Helpers.ObjectState
            {
                positionX = (short)(275 * 16),
                positionY = (short)(601 * 16)
                // Initialize other necessary properties if required
            };

            // Assign the vehicle to a valid team
            Team targetTeam = arena.Teams.ElementAtOrDefault(1); // Adjust index as needed
            if (targetTeam == null)
            {
                Log.write(TLog.Error, "Team 1 does not exist.");
                return;
            }

            try
            {
                // Spawn the vehicle
                arena.newVehicle(
                    vehicleToSpawn,
                    targetTeam, // Assign to a valid team
                    null,       // Creator player (null if not applicable)
                    vehicleState,
                    null        // Setup callback if needed
                );
            }
            catch (Exception ex)
            {
            }
        }

        // Method to relocate flags
        private void RelocateFlags()
        {
            foreach (var flag in arena._flags.Values)
            {
                // Generate new random positions or set predefined ones
                short newX = (short)(arena._rand.Next(100, 1000) * 16);
                short newY = (short)(arena._rand.Next(100, 1000) * 16);

                flag.posX = newX;
                flag.posY = newY;

                // Update the flag for all players
                Helpers.Object_Flags(arena.Players, flag);
            }

            arena.sendArenaMessage("Flag spawns have been relocated.");
        }

        // Call this method when needed, for example, at the start of a new event
        private void StartNewEvent()
        {
            RelocateFlags();
            // Additional event initialization logic
        }

        internal void AssignPlayerToTeam(Player player, string skillName, string teamName, bool createIfNotExist, bool noMaxSize = false)
        {
            // Check if the player's arena is valid
            if (player == null || player._arena == null)
            {
                Log.write(TLog.Error, "Failed to assign player to a team. Player or arena context is missing.");
                player.sendMessage(0, "Failed to assign you to a team. Arena context is missing.");
                return;
            }

            // Attempt to get the team by name
            Team team = player._arena.getTeamByName(teamName);

            // If the team doesn't exist and creation is allowed, create a new team
            if (team == null && createIfNotExist)
            {
                // Create a new team safely with proper initialization
                team = new Team(player._arena, player._arena._server)
                {
                    _name = teamName,
                    _isPrivate = false,
                    _id = (short)player._arena.Teams.Count()
                };

                player._arena.createTeam(team);
                Log.write(TLog.Normal, string.Format("Created new team '{0}' for {1}.", teamName, player._alias));
            }

            // Ensure the team is properly initialized before proceeding
            if (team != null)
            {
                // Check if the player has any skill that matches the intended skill for the team
                bool hasMatchingSkill = false;
                foreach (var skillItem in player._skills.Values)
                {
                    if (skillItem.skill.Name.Equals(skillName, StringComparison.OrdinalIgnoreCase))
                    {
                        hasMatchingSkill = true;
                        break;
                    }
                }
                
                if (hasMatchingSkill)
                {
                    // Manually check team size to enforce a max of 5 players if not a no-max-size team (e.g., Marines)
                    int maxAllowedPlayers = 5; // Set the max size for Marine teams

                    // Check if the team can accept more players based on custom size logic
                    bool canJoin = noMaxSize || team.ActivePlayerCount < maxAllowedPlayers;

                    // Proceed with adding the player to the team if they can join
                    if (canJoin)
                    {
                        // If the player is a spectator, unspec them before adding to the team
                        if (player.IsSpectator)
                        {
                            player.unspec(team);
                        }
                        else
                        {
                            team.addPlayer(player, true);
                        }
                        player.sendMessage(0, string.Format("{0} has been assigned to {1}.", player._alias, teamName));
                    }
                    else
                    {
                        player.sendMessage(0, string.Format("{0} could not be assigned to {1} as it has reached the maximum number of players ({2}).", player._alias, teamName, maxAllowedPlayers));
                        Log.write(TLog.Warning, string.Format("{0} could not be assigned to {1} because it has reached the maximum number of players ({2}).", player._alias, teamName, maxAllowedPlayers));
                    }
                }
                else
                {
                    player.sendMessage(0, string.Format("{0} does not have the correct skill ({1}) to join {2}.", player._alias, skillName, teamName));
                    Log.write(TLog.Warning, string.Format("{0} attempted to join {1} but does not have the correct skill ({2}).", player._alias, teamName, skillName));
                }
            }
            else
            {
                player.sendMessage(0, string.Format("Failed to assign {0} to {1}. The team does not exist and could not be created.", player._alias, teamName));
                Log.write(TLog.Error, string.Format("Failed to assign {0} to {1}. The team does not exist and could not be created.", player._alias, teamName));
            }
        }



       private void AssignTeamsForZombieEvent(List<Player> players)
        {
            // Ensure that players list is not empty to avoid accessing null properties
            if (players.Count == 0) return;

            // Get the arena from any player, assuming all players belong to the same arena
            Arena arena = players[0]._arena;

            // Lists to hold zombies and marines
            List<Player> zombies = players.Where(p => GetPrimarySkillName(p).Equals("Zombie", StringComparison.OrdinalIgnoreCase)).ToList();
            List<Player> marines = players.Where(p => GetPrimarySkillName(p).Equals("Marine", StringComparison.OrdinalIgnoreCase)).ToList();

            // Assign all zombies to the Zombie Team
            foreach (Player zombie in zombies)
            {
                AssignPlayerToTeam(zombie, "Zombie", "Zombies", true, true); // No max size for Zombie Team
            }

            // Define suffixes for team names
            string[] suffixes = { "Renegades", "Sentinels", "Warriors", "Guardians", "Raiders", "Vanguards", "Avengers", "Titans", "Commandos", "Strikers" };
            Random rand = new Random(); // Create a random object for selecting suffixes

            // Logic to assign Marines to teams with a max of 5 players per team
            int marineTeamCount = (int)Math.Ceiling(marines.Count / 5.0);

            for (int i = 0; i < marineTeamCount; i++)
            {
                // Generate a team name based on the first player's alias if it's 10 characters or less
                string marineTeamName;
                if (marines.Count > 0)
                {
                    string playerAlias = marines[0]._alias;
                    if (playerAlias.Length <= 10)
                    {
                        // Randomly select a suffix from the array
                        string randomSuffix = suffixes[rand.Next(suffixes.Length)];
                        marineTeamName = string.Format("{0} {1}", playerAlias, randomSuffix);
                    }
                    else
                    {
                        // Fallback to default naming if alias is too long
                        marineTeamName = string.Format("Marine {0}", i + 1);
                    }
                }
                else
                {
                    marineTeamName = string.Format("Marine {0}", i + 1);
                }

                Team marineTeam = arena.getTeamByName(marineTeamName);

                // Create the Marine team if it doesn't exist
                if (marineTeam == null)
                {
                    marineTeam = new Team(arena, arena._server)
                    {
                        _name = marineTeamName,
                        _isPrivate = false,
                        _id = (short)arena.Teams.Count()
                    };
                    arena.createTeam(marineTeam);
                }

                // Assign up to 5 players to the current Marine team
                for (int j = 0; j < 5 && marines.Count > 0; j++)
                {
                    Player marine = marines[0];
                    marines.RemoveAt(0);
                    AssignPlayerToTeam(marine, "Marine", marineTeamName, true, false); // Max size of 5 per team
                }
            }
        }
        private void InitializeZombie()
        {
            // Get all players in-game (excluding Duelers)
            List<Player> players = arena.PlayersIngame.Where(p => !p._skills.Values.Any(s => s.skill.Name == "Dueler")).ToList();

            if (players.Count == 0)
            {
                arena.sendArenaMessage("No players are available to start the Zombie event.");
                return;
            }

            // Warp all players to valid random positions within the defined zombie zone
            foreach (Player p in players)
            {
                // Use WarpPlayerToZombieZone to handle warping safely
                WarpPlayerToZombieZone(p);
            }

            // Calculate the number of initial zombies (1 zombie per 5 players, round up)
            int totalPlayers = players.Count;
            int initialZombieCount = (int)Math.Ceiling(totalPlayers / 5.0);

            // Ensure at least 1 initial zombie
            if (initialZombieCount < 1)
                initialZombieCount = 1;

            // Randomly select initial zombies
            List<Player> potentialZombies = new List<Player>(players);
            List<Player> initialZombies = new List<Player>();

            for (int i = 0; i < initialZombieCount; i++)
            {
                if (potentialZombies.Count == 0)
                    break;

                int index = rand.Next(potentialZombies.Count);
                Player selectedZombie = potentialZombies[index];
                potentialZombies.RemoveAt(index);
                initialZombies.Add(selectedZombie);
            }

            // Change initial zombies to "Zombie" skill
            foreach (Player zombie in initialZombies)
            {
                ChangePlayerSkill(zombie, "Zombie");
                zombie.sendMessage(0, String.Format("{0} has become an initial zombie! Infect other players!", zombie._alias));
            }

            // Assign the "Marine" skill to all non-zombie players
            List<Player> marinePlayers = new List<Player>(); // List to collect all Marine players for team assignment
            foreach (Player p in players)
            {
                if (!initialZombies.Contains(p))
                {
                    // Change non-zombies to "Marine" skill
                    ChangePlayerSkill(p, "Marine");
                    marinePlayers.Add(p); // Collect all Marine players
                    p.sendMessage(0, String.Format("{0} must survive the zombie apocalypse!", p._alias));
                }
            }

            // Assign teams based on their roles using the generic function
            AssignTeamsForZombieEvent(players); // Call to assign teams based on Zombie and Marine roles
        }


        private void WarpPlayerToZombieZone(Player player)
        {
            // Define the coordinates for the zombie zone
            int minX = 521, minY = 205;
            int maxX = 840, maxY = 280;
            int maxAttempts = 10; // Maximum attempts to find a valid warp location

            Random rand = new Random();
            bool validLocationFound = false;

            for (int i = 0; i < maxAttempts; i++)
            {
                // Randomly select coordinates within the defined bounds
                short x = (short)rand.Next(minX * 16, maxX * 16);
                short y = (short)rand.Next(minY * 16, maxY * 16);

                // Check if the tile at the selected coordinates is blocked or has physics objects
                if (!player._arena.getTile(x, y).Blocked)
                {
                    // Create an ObjectState for the player's new position
                    Helpers.ObjectState newState = new Helpers.ObjectState
                    {
                        positionX = x,
                        positionY = y,
                        positionZ = 0,
                        yaw = player._state.yaw
                    };

                    // Warp the player if the location is valid
                    player.warp(Helpers.ResetFlags.ResetAll, newState, 0, -1, 0);
                    validLocationFound = true;
                    break;
                }
            }

            if (!validLocationFound)
            {
                player.sendMessage(-1, "Failed to find a valid spawn location. Please try again.");
            }
        }

        private void HandleZombieDeath(Player victim, Player killer)
        {
            // Check if the killer is a zombie
            if (killer != null && killer._skills.Any(s => s.Value.skill.Name.Equals("Zombie", StringComparison.OrdinalIgnoreCase)))
            {
                // Convert the victim into a zombie
                ChangePlayerSkill(victim, "Zombie");

                // Assign them to the Zombies team
                AssignPlayerToTeam(victim, "Zombie", "Zombies", true, true);
                
                // Inform the victim they were turned into a zombie
                victim.sendMessage(0, string.Format("You were killed by a zombie ({0}). You are now a zombie!", killer != null ? killer._alias : "Unknown"));

                // Warp the victim to a valid location in the zombie zone
                WarpPlayerToZombieZone(victim);
            }
            else
            {
                // Handle non-zombie deaths if needed
                victim.sendMessage(0, string.Format("You were killed by {0}.", killer != null ? killer._alias : "Unknown"));
            }

            // Check for victory condition when only one non-zombie player remains
            CheckZombieWinCondition();
        }


        private bool IsPlayerZombie(Player player)
        {
            if (player == null)
                return false;

            // Get the player's current skill name
            string currentSkillName = GetPrimarySkillName(player);

            // Check if the skill is "Zombie"
            return currentSkillName.Equals("Zombie", StringComparison.OrdinalIgnoreCase);
        }

        private void CheckZombieWinCondition()
        {
            // Get all players who are not zombies
            List<Player> nonZombiePlayers = arena.PlayersIngame.Where(p => !IsPlayerZombie(p)).ToList();

            int totalPlayers = arena.PlayersIngame.Count();

            if (totalPlayers >= 4)
            {
                if (nonZombiePlayers.Count == 1)
                {
                    // When 3 or more players, and only 1 non-zombie left, they win
                    Player winner = nonZombiePlayers.First();

                    // Announce the winner
                    arena.sendArenaMessage(string.Format("{0} is the last survivor and wins the Zombie event!", winner._alias));

                    // Prize the winner with the "staff" skill
                    ChangePlayerSkill(winner, "staff");

                    // Optionally end the event
                    EndEvent();
                }
                else if (nonZombiePlayers.Count == 0)
                {
                    // All players have become zombies
                    arena.sendArenaMessage("&All players have become zombies! Zombies win!");

                    // Optionally end the event
                    EndEvent();
                }
            }
            else if (totalPlayers <= 3)
            {
                if (nonZombiePlayers.Count == 0)
                {
                    // All players have become zombies
                    arena.sendArenaMessage("&All players have become zombies!");

                    // Optionally end the event
                    EndEvent();
                }
                // When only 2 players, and one is still not a zombie, continue the game
                // Victory condition is not triggered until both become zombies
            }
        }


        // Private Teams
        public void privateTeams(Player player, Player recipient, string command, string payload)
        {
            // Check if private teams are enabled
            if (!allowPrivateTeams)
            {
                player.sendMessage(-1, "Private teams are currently disabled in this arena.");
                return;
            }

            // Check if the payload is valid
            if (string.IsNullOrEmpty(payload))
            {
                player.sendMessage(-1, "Usage: ?t teamName:password");
                return;
            }

            // Get the current terrain ID at the player's position
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);

            // Check if the terrain allows for team changes only on terrain #4
            if ((terrainID != 1 && terrainID != 2 && terrainID != 3 && terrainID != 4) && !player.IsSpectator)
            {
                player.sendMessage(-1, "Can't change team from this terrain.");
                return;
            }

            // Check if the player has enough energy to switch teams
            int minEnergy = player._server._zoneConfig.arena.teamSwitchMinEnergy / 1000;
            if (player._state.energy < minEnergy)
            {
                player.sendMessage(-1, string.Format("Cannot switch teams unless you have at least {0} energy (you have {1}).", minEnergy, player._state.energy));
                return;
            }

            // Split the payload into team name and password
            string[] parts = payload.Split(':');
            if (parts.Length != 2)
            {
                player.sendMessage(-1, "Invalid format. Correct usage: ?t teamName:password");
                return;
            }

            string teamName = parts[0].Trim();
            string teamPassword = parts[1].Trim();

            // Validate the team name and password
            if (string.IsNullOrEmpty(teamName))
            {
                player.sendMessage(-1, "Team name cannot be empty.");
                return;
            }

            try
            {
                // Check if the team already exists
                Team team = player._arena.getTeamByName(teamName);

                if (team != null)
                {
                    // The team exists, check if it's private and validate the password
                    if (!team.IsSpec && team._password == teamPassword)
                    {
                        // Attempt to add the player to the team
                        if (!team.IsFull)
                        {
                            team.addPlayer(player, true);
                            player.sendMessage(0, string.Format("You have joined the private team '{0}'.", teamName));
                            Log.write(TLog.Normal, string.Format("{0} joined the private team '{1}'.", player._alias, teamName));
                        }
                        else
                        {
                            player.sendMessage(-1, "The team is full.");
                        }
                    }
                    else
                    {
                        player.sendMessage(-1, "Incorrect password or the team is not private.");
                    }
                }
                else
                {

                    // Validate the team name against restricted names
                    string temp = teamName.ToLower();
                    if (temp.Equals("spec") || temp.Equals("spectator") || temp.Contains("bot team"))
                    {
                        player.sendMessage(-1, "You can't use this team name.");
                        return;
                    }

                    if (temp.Length > 32)
                    {
                        player.sendMessage(-1, "The team name cannot be longer than 32 characters.");
                        return;
                    }

                    // Create a new private team
                    Team newTeam = new Team(player._arena, player._arena._server)
                    {
                        _name = teamName,
                        _isPrivate = true,
                        _password = teamPassword,
                        _id = (short)player._arena.Teams.Count(),
                        _owner = player
                    };

                    // Add the new team to the arena
                    player._arena.createTeam(newTeam);
                    newTeam.addPlayer(player, true);
                    player.sendMessage(0, string.Format("You have created and joined the private team '{0}'.", teamName));

                }
            }
            catch (Exception e)
            {
                player.sendMessage(-1, "An error occurred while processing your team request.");
            }
        }

/// <summary>
/// Mix event section
/// </summary>

private Dictionary<Player, bool> playedInPreviousMix = new Dictionary<Player, bool>();

// Dictionaries to track players' role preferences and simulated players for testing
private Dictionary<string, List<string>> playerRolePreferences = new Dictionary<string, List<string>>();
// List of required roles
private readonly List<string> requiredRoles = new List<string> { "med", "eng", "sl" };
// List of preferred roles
private readonly List<string> preferredRolesDefense = new List<string> { "dinf", "dhvy" };
private readonly List<string> preferredRolesOffense = new List<string> { "oinf", "ohvy", "jt", "infil" };
// Variables to keep track of the mix process state
private bool isMixActive = false;
private DateTime lastTeamUpdateMessageTime;

// Function to start the mix process
private void StartMixProcess()
{
    isMixActive = true;
    playerRolePreferences.Clear();
    signUpOrder.Clear();
    lastTeamUpdateMessageTime = DateTime.Now;
    arena.sendArenaMessage("*Mix initiated: pick your preferred roles using ?mix roleName (sl, med, eng, jt, infil, oinf, dinf, ohvy, dhvy)!", 1);
}

// List to hold all role preferences submitted by players
private List<KeyValuePair<string, List<string>>> playerPool = new List<KeyValuePair<string, List<string>>>();
private HashSet<string> assignedPlayersGlobal = new HashSet<string>();
private int aliasCounter = 0;
private bool mixGameActive = true; // True when roles can be selected, false when teams are built

// Declare teams to hold the player assignments
private List<KeyValuePair<string, string>> team1 = new List<KeyValuePair<string, string>>();
private List<KeyValuePair<string, string>> team2 = new List<KeyValuePair<string, string>>();

// Define roles categorized by offense and defense
private static readonly HashSet<string> defenseRoles = new HashSet<string> { "med", "eng", "dinf", "dhvy" };
private static readonly HashSet<string> offenseRoles = new HashSet<string> { "sl", "oinf", "jt", "infil", "ohvy" };
private List<string> signUpOrder = new List<string>();

// Used to give random role based on Infantry/Heavy Weapons class when using *mix auto
private Random rand = new Random();

// Max counts per role per team
private Dictionary<string, int> maxRoleCountsPerTeam = new Dictionary<string, int>
{
    { "med", 1 },
    { "eng", 1 },
    { "sl", 1 },
    { "dhvy", 1 },
    { "ohvy", 1 },
    { "infil", 1 },
    { "jt", 1 },
    { "dinf", 3 },
    { "oinf", 4 }
};

// Handle player role selection
private void HandleRoleSelection(Player player, string roleSelection)
{
    if (!mixGameActive)
    {
        player.sendMessage(0, "Mix teams have already been built. Please wait for the next game.");
        return;
    }

    var alias = player._alias;
    // Handle multiple entries from the same player
    if (alias == "Axidus")
    {
        int testAliasCounter = playerRolePreferences.Count(p => p.Key.StartsWith("Axidus")) + 1;
        alias = "Axidus" + testAliasCounter.ToString();
    }

    var roles = roleSelection.Split(',').Select(r => r.Trim().ToLower()).ToList();

    // Validate roles
    var invalidRoles = roles.Where(r => !defenseRoles.Contains(r) && !offenseRoles.Contains(r)).ToList();
    if (invalidRoles.Any())
    {
        var invalidRolesList = string.Join(", ", invalidRoles);
        player.sendMessage(0, "Invalid role, use ?mix med, eng, sl, jt, infil, dinf, dhvy, oinf, ohvy");
        return; // Stop processing if there are invalid roles
    }

    if (!playerRolePreferences.ContainsKey(alias))
    {
        playerRolePreferences[alias] = new List<string>();
        signUpOrder.Add(alias); // Track sign-up order
    }

    foreach (var role in roles)
    {
        if (!playerRolePreferences[alias].Contains(role))
        {
            playerRolePreferences[alias].Add(role);
        }
    }

    playerPool = playerRolePreferences.ToList();
    arena.sendArenaMessage(string.Format("{0} players in pool.", playerPool.Count));

    if (playerPool.Count >= 20 && AreRequiredRolesFilled())
    {
        BuildTeamsFromPool();
        mixGameActive = false;
    }
    else
    {
        DisplayRequiredRolesMissingMessage();
    }
}

// Used with *mix auto parameter
private void AssignPlayersBasedOnSkills()
{
    // Get all players currently in team spec
    var teamSpec = arena.Players.Where(p => p.IsSpectator && p._team.IsSpec).ToList();
    foreach (var player in teamSpec)
    {
        string skillName = GetPrimarySkillName(player);
        // Map the skill to a role
        string role = MapSkillToRole(skillName);
        if (role != null)
        {
            // Call HandleRoleSelection
            HandleRoleSelection(player, role);
        }
        else
        {
            // Skill not recognized, perhaps send a message
            player.sendMessage(0, "Unable to assign role based on your primary skill.");
        }
    }
}

private string MapSkillToRole(string skillName)
{
    if (skillName == null)
        return null;

    switch (skillName)
    {
        case "Infantry":
            // Randomly pick oinf or dinf
            return RandomPick("oinf", "dinf");
        case "Heavy Weapons":
            // Randomly pick ohvy or dhvy
            return RandomPick("ohvy", "dhvy");
        case "Squad Leader":
            return "sl";
        case "Infiltrator":
            return "infil";
        case "Combat Engineer":
            return "eng";
        case "Field Medic":
            return "med";
        case "Jump Trooper":
            return "jt";
        default:
            return null; // Unknown skill
    }
}

private string RandomPick(string option1, string option2)
{
    return rand.Next(2) == 0 ? option1 : option2;
}

// Display the current player pool
public void DisplayCurrentPlayerPool(Player player)
{
    if (!mixGameActive) return;

    try
    {
        player.sendMessage(0, "*Current Player Pool:");
        foreach (var entry in playerPool) // Renamed player to entry
        {
            var alias = entry.Key;
            var roles = string.Join(", ", entry.Value);
            var priority = DidPlayerPlayInLastMix(alias) ? "Played Last Mix" : "Not Played Last Mix";
            var signUpPosition = signUpOrder.IndexOf(alias) + 1;

            // Sending message to the player passed into the method
            player.sendMessage(0, string.Format("*{0} ({1}) - {2}, Sign-Up Position: {3}", alias, roles, priority, signUpPosition));
        }
        player.sendMessage(0, string.Format("#{0} players in pool.", playerPool.Count));
    }
    catch (Exception ex)
    {
        Console.WriteLine("Error displaying player pool: {0}", ex.Message);
    }
}

// Check if required roles are filled
private bool AreRequiredRolesFilled()
{
    var totalRoles = playerPool.SelectMany(p => p.Value).ToList();
    int medCount = totalRoles.Count(role => role == "med");
    int engCount = totalRoles.Count(role => role == "eng");
    int slCount = totalRoles.Count(role => role == "sl");

    return medCount >= 2 && engCount >= 2 && slCount >= 2;
}

// Display message for missing required roles
private void DisplayRequiredRolesMissingMessage()
{
    var totalRoles = playerPool.SelectMany(p => p.Value).ToList();
    int medCount = totalRoles.Count(role => role == "med");
    int engCount = totalRoles.Count(role => role == "eng");
    int slCount = totalRoles.Count(role => role == "sl");

    int medNeeded = 2 - medCount;
    int engNeeded = 2 - engCount;
    int slNeeded = 2 - slCount;

    List<string> missingRoles = new List<string>();
    if (slNeeded > 0) missingRoles.Add(string.Format("SL: {0}", slNeeded));
    if (medNeeded > 0) missingRoles.Add(string.Format("Med: {0}", medNeeded));
    if (engNeeded > 0) missingRoles.Add(string.Format("Eng: {0}", engNeeded));

    if (missingRoles.Count > 0)
    {
        string missingRolesMessage = string.Join(", ", missingRoles);
        arena.sendArenaMessage(string.Format("#Missing required roles: {0}", missingRolesMessage));
    }

    int defenseSignups = playerPool.Count(p => p.Value.Any(role => defenseRoles.Contains(role)));
    int offenseSignups = playerPool.Count(p => p.Value.Any(role => offenseRoles.Contains(role)));

    //arena.sendArenaMessage(string.Format("{0} of 10 defense signups", defenseSignups));
    //arena.sendArenaMessage(string.Format("{0} of 10 offense signups", offenseSignups));
}

// Build teams from the player pool
private void BuildTeamsFromPool()
{
    // Clear the global tracker before starting new assignments
    assignedPlayersGlobal.Clear();

    arena.sendArenaMessage("&Building teams from the player pool...");

    team1.Clear();
    team2.Clear();

    // Assign required roles first
    if (!AssignRequiredRoles())
    {
        arena.sendArenaMessage("*Failed to assign required roles. Cannot build teams.");
        return;
    }

    // Assign remaining players
    AssignRemainingPlayers();

    // Ensure teams have 5 offense and 5 defense players
    EnsureTeamsAreBalanced();

    // Display team compositions
    DisplayTeamComposition("&Team 1 Composition:", team1);
    DisplayTeamComposition("&Team 2 Composition:", team2);

    // Mark players as having played in the previous mix
    foreach (var player in team1.Concat(team2))
    {
        var playerObject = FindPlayerByAlias(player.Key);
        if (playerObject != null)
        {
            playedInPreviousMix[playerObject] = true; // Mark as played in the previous mix
        }
    }

    // Unspec players to their respective teams
    UnspecPlayersToTeams(team1, team2);

    arena.sendArenaMessage("*Finished building teams.");
}

// Assign required roles to teams, prioritizing players who selected only one role
private bool AssignRequiredRoles()
{
    var assignedPlayers = new HashSet<string>();

    foreach (var role in requiredRoles)
    {
        var playersWithRole = GetPlayersByRoleAndPriority(role)
            .Where(alias => !assignedPlayersGlobal.Contains(alias))
            .ToList();

        if (playersWithRole.Count < 2)
        {
            arena.sendArenaMessage(string.Format("Not enough players for role {0}.", role));
            return false;
        }

        // Assign one player to each team
        var player1 = playersWithRole[0];
        var player2 = playersWithRole[1];

        team1.Add(new KeyValuePair<string, string>(player1, role));
        team2.Add(new KeyValuePair<string, string>(player2, role));

        assignedPlayers.Add(player1);
        assignedPlayers.Add(player2);
        assignedPlayersGlobal.Add(player1);
        assignedPlayersGlobal.Add(player2);
    }

    return true;
}

// Get players by role, prioritizing those who only selected one role and based on sign-up order
private List<string> GetPlayersByRoleAndPriority(string role)
{
    var playersWithRole = playerPool
        .Where(p => p.Value.Contains(role))
        .ToList();

    // First, get players who only selected this role
    var playersOnlyThisRole = playersWithRole
        .Where(p => p.Value.Count == 1)
        .Select(p => p.Key)
        .ToList();

    // Then, get players who selected multiple roles including this role
    var playersMultipleRoles = playersWithRole
        .Where(p => p.Value.Count > 1)
        .Select(p => p.Key)
        .ToList();

    // Prioritize players who only selected this role
    var prioritizedPlayers = playersOnlyThisRole
        .Concat(playersMultipleRoles)
        .ToList();

    // Now, order by sign-up order
    var orderedPlayers = prioritizedPlayers
        .OrderBy(alias => signUpOrder.IndexOf(alias))
        .ToList();

    return orderedPlayers;
}

// Check if a player played in the last mix
private bool DidPlayerPlayInLastMix(string alias)
{
    var playerObject = FindPlayerByAlias(alias);
    if (playerObject != null && playedInPreviousMix.ContainsKey(playerObject))
    {
        return playedInPreviousMix[playerObject];
    }
    return false;
}

// Assign remaining players to teams
private void AssignRemainingPlayers()
{
    var allRoles = maxRoleCountsPerTeam.Keys.ToList();

    var assignedPlayers = new HashSet<string>(assignedPlayersGlobal);

    var team1RoleCounts = maxRoleCountsPerTeam.ToDictionary(kvp => kvp.Key, kvp => 0);
    var team2RoleCounts = maxRoleCountsPerTeam.ToDictionary(kvp => kvp.Key, kvp => 0);

    int team1OffenseCount = team1.Count(p => offenseRoles.Contains(p.Value));
    int team1DefenseCount = team1.Count(p => defenseRoles.Contains(p.Value));
    int team2OffenseCount = team2.Count(p => offenseRoles.Contains(p.Value));
    int team2DefenseCount = team2.Count(p => defenseRoles.Contains(p.Value));

    // Update role counts based on assigned required roles
    foreach (var p in team1)
    {
        if (team1RoleCounts.ContainsKey(p.Value))
            team1RoleCounts[p.Value]++;
    }
    foreach (var p in team2)
    {
        if (team2RoleCounts.ContainsKey(p.Value))
            team2RoleCounts[p.Value]++;
    }

    // Assign remaining players
    var remainingPlayers = playerPool
        .Where(p => !assignedPlayersGlobal.Contains(p.Key))
        .OrderBy(p => p.Value.Count == 1 ? 0 : 1) // Prioritize single-role players
        .ThenBy(p => signUpOrder.IndexOf(p.Key))
        .ToList();

    foreach (var player in remainingPlayers)
    {
        var alias = player.Key;
        var preferences = player.Value;

        bool assigned = false;

        foreach (var role in preferences)
        {
            if (AssignPlayerToTeam(alias, role, team1, team1RoleCounts, ref team1OffenseCount, ref team1DefenseCount))
            {
                assigned = true;
                break;
            }
            else if (AssignPlayerToTeam(alias, role, team2, team2RoleCounts, ref team2OffenseCount, ref team2DefenseCount))
            {
                assigned = true;
                break;
            }
        }

        if (!assigned)
        {
            // Try to assign the player to a default role (oinf or dinf) depending on team needs
            if (AssignPlayerToAnyAvailableRole(alias, team1, team1RoleCounts, ref team1OffenseCount, ref team1DefenseCount))
            {
                assigned = true;
            }
            else if (AssignPlayerToAnyAvailableRole(alias, team2, team2RoleCounts, ref team2OffenseCount, ref team2DefenseCount))
            {
                assigned = true;
            }

            if (!assigned)
            {
                // If still unable to assign, inform the player
                var message = string.Format("*{0}, unable to assign you to any available role.", alias);
                arena.sendArenaMessage(message);
            }
        }
    }
}

// New method to assign player to oinf or dinf based on team needs
private bool AssignPlayerToAnyAvailableRole(string alias, List<KeyValuePair<string, string>> team, Dictionary<string, int> teamRoleCounts, ref int teamOffenseCount, ref int teamDefenseCount)
{
    if (team.Count >= 10)
        return false; // Team is full

    // Decide whether to assign to offense or defense based on team needs
    if (teamOffenseCount < 5)
    {
        // Try to assign as oinf
        if (teamRoleCounts["oinf"] < maxRoleCountsPerTeam["oinf"])
        {
            team.Add(new KeyValuePair<string, string>(alias, "oinf"));
            assignedPlayersGlobal.Add(alias);
            teamRoleCounts["oinf"]++;
            teamOffenseCount++;
            return true;
        }
    }
    if (teamDefenseCount < 5)
    {
        // Try to assign as dinf
        if (teamRoleCounts["dinf"] < maxRoleCountsPerTeam["dinf"])
        {
            team.Add(new KeyValuePair<string, string>(alias, "dinf"));
            assignedPlayersGlobal.Add(alias);
            teamRoleCounts["dinf"]++;
            teamDefenseCount++;
            return true;
        }
    }
    return false; // Unable to assign
}

// Assign player to a team if possible
private bool AssignPlayerToTeam(string alias, string role, List<KeyValuePair<string, string>> team, Dictionary<string, int> teamRoleCounts, ref int teamOffenseCount, ref int teamDefenseCount)
{
    if (teamRoleCounts[role] >= maxRoleCountsPerTeam[role])
        return false; // Role is full on this team

    if (team.Count >= 10)
        return false; // Team is full

    if (offenseRoles.Contains(role))
    {
        if (teamOffenseCount >= 5)
            return false; // Offense is full on this team
    }
    else if (defenseRoles.Contains(role))
    {
        if (teamDefenseCount >= 5)
            return false; // Defense is full on this team
    }

    team.Add(new KeyValuePair<string, string>(alias, role));
    assignedPlayersGlobal.Add(alias);
    teamRoleCounts[role]++;

    if (offenseRoles.Contains(role))
        teamOffenseCount++;
    else if (defenseRoles.Contains(role))
        teamDefenseCount++;

    return true;
}

// Ensure each team has 5 offense and 5 defense players
private void EnsureTeamsAreBalanced()
{
    // Teams are already balanced based on counts during assignment
    // Additional balancing logic can be added here if necessary
}

// Display team compositions
private void DisplayTeamComposition(string header, List<KeyValuePair<string, string>> team)
{
    var defense = team.Where(p => defenseRoles.Contains(p.Value)).ToList();
    var offense = team.Where(p => offenseRoles.Contains(p.Value)).ToList();

    arena.sendArenaMessage(header);

    arena.sendArenaMessage("Defense:");
    foreach (var player in defense)
    {
        arena.sendArenaMessage(string.Format("~{0} ({1})", player.Key, player.Value));
    }

    arena.sendArenaMessage("Offense:");
    foreach (var player in offense)
    {
        arena.sendArenaMessage(string.Format("@{0} ({1})", player.Key, player.Value));
    }
}

// Unspec players to their teams
private void UnspecPlayersToTeams(List<KeyValuePair<string, string>> team1, List<KeyValuePair<string, string>> team2)
{
    var teamCKY = arena.getTeamByName("CKY C");
    var teamPT = arena.getTeamByName("PT T");

    foreach (var player in team1)
    {
        var playerObject = FindPlayerByAlias(player.Key);
        if (playerObject != null)
        {
            playerObject.unspec(teamCKY);
        }
    }

    foreach (var player in team2)
    {
        var playerObject = FindPlayerByAlias(player.Key);
        if (playerObject != null)
        {
            playerObject.unspec(teamPT);
        }
    }
}

// Find player by alias
private Player FindPlayerByAlias(string alias)
{
    if (alias.StartsWith("Axidus"))
    {
        alias = "Axidus";
    }

    foreach (Player player in arena.Players)
    {
        if (player._alias.Equals(alias, StringComparison.OrdinalIgnoreCase))
        {
            return player;
        }
    }
    return null;
}

        public class CommandHandler
        {
            // Dictionary to map aliases to their respective class IDs
            public static readonly Dictionary<string, string> skillAliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "inf", "Infantry" },
                { "infil", "Infiltrator" },
                { "hvy", "Heavy Weapons" },
                { "eng", "Combat Engineer" },
                { "med", "Field Medic" },
                { "jt", "Jump Trooper" },
                { "sl", "Squad Leader" },
                { "oinf", "Infantry Offense Cmp6/PF" },
                { "oinfcara", "Infantry Offense Cara/PF" },
                { "dinf", "Infantry Defense SG" },
                { "dinfcaw", "Infantry Defense CAW" },
                { "ohvy", "Heavy Weapons Offense RPG/AC" },
                { "dhvy", "Heavy Weapons Defense MML/AC" },
                { "hvyMG", "Heavy Weapons Offense MG/AC" },
                { "slbonds", "Squad Leader Standard" },
                { "jtstandard", "Jump Trooper Pack" },
                { "footjt", "Jump Trooper Foot" },
                { "medstandard", "Field Medic Standard" },
                { "engstandard", "Combat Engineer Standard" },
                { "infilstandard", "Infiltrator Standard" }
            };

            /// <summary>
            /// Handles the ?swap command to change the player's class/skill.
            /// </summary>
            /// <param name="player">The player issuing the command.</param>
            /// <param name="skillName">The input string after the ?swap command.</param>
            public void HandleSwapCommand(Player player, string skillName, CfgInfo CFG, Script_CTF script, bool force = false, bool ignoreEnergy = false)
            {
                if (!force && player.IsDead)
                {
                    player.sendMessage(-1, "Your class change will be applied when you respawn.");
                    return;
                }

                // Check if the player is on an occupied vehicle, if so don't allow them to swap
                Vehicle occupiedVehicle = player._arena.Vehicles.FirstOrDefault(v => v._inhabitant == player);
                if (occupiedVehicle != null && occupiedVehicle._type != null && occupiedVehicle._type.Name != null && 
                    (occupiedVehicle._type.Name == "Hoverboard" || occupiedVehicle._type.Name == "Deathboard" || occupiedVehicle._type.Name == "Flight Pack" || 
                     occupiedVehicle._type.Name == "ChUcKdaPaCk" || occupiedVehicle._type.Name == "Jump Pack" || occupiedVehicle._type.Name == "Drop Pack"))
                {
                    player.sendMessage(-1, string.Format("*You cannot swap skills while in a vehicle. Vehicle Name: {0}", occupiedVehicle._type.Name));
                    return;
                } else if (occupiedVehicle != null) {
                    //player.sendMessage(0, string.Format("*Occupied Vehicle: {0} (ID: {1})", occupiedVehicle._type.Name, occupiedVehicle._type.ClassId));
                }

                // Check if the provided skill name is allowed by checking against the skillAliases keys
                if (!skillAliases.ContainsKey(skillName.Trim().ToLower()))
                {
                    player.sendMessage(-1, string.Format("*Skill '{0}' is not allowed. Allowed skills are: inf, infil, jt, sl, med, eng, hvy.", skillName));
                    return;
                }

                // Declare fullSkillName to be used for alias mapping
                string fullSkillName;

                // Normalize the skill name using the alias dictionary
                if (skillAliases.TryGetValue(skillName.Trim().ToLower(), out fullSkillName))
                {
                    skillName = fullSkillName;
                }

                // Attempt to retrieve the skill using the provided or full name
                SkillInfo skill = AssetManager.Manager.getSkillByName(skillName);

                // Check if the skill was found
                if (skill == null)
                {
                    // Notify the player if the skill was not found
                    player.sendMessage(-1, string.Format("*Skill '{0}' not found.", skillName));
                    return;
                }

                // Check if the current terrain allows skill changes or if player in spec
                int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
                if (!CFG.terrains[terrainID].skillEnabled && !player._team.IsSpec && !player.IsDead)
                {
                    player.sendMessage(-1, "*You cannot change your skill on this terrain.");
                    return;
                }

                int energyNeeded = 500;

                // Check if the player has enough energy to change the skill
                if (!ignoreEnergy && player._state.energy < energyNeeded)
                {
                    player.sendMessage(-1, string.Format("*You need {0} energy to change your skill. Current energy: {1}.", energyNeeded, player._state.energy));
                    return;
                }

                // Check if the player already has the skill
                if (player._skills.ContainsKey(skill.SkillId))
                {
                    player.sendMessage(0, string.Format("*You already have the skill: {0}", skill.Name));
                    return;
                }
                // Check if the skill is Infiltrator and limit per team (except in Arena 1)
                if (skill.Name == "Infiltrator" && !player._arena._name.Contains("Arena 1") && !player._arena._name.Contains("Public1"))
                {
                    // Count infiltrators only on the player's team, excluding spectator vehicles
                    int teamInfiltratorCount = player._arena.Players
                        .Where(p => p._team == player._team && 
                                  !p._team.IsSpec && 
                                  !p.IsSpectator &&
                                  p._skills.Any(s => s.Value.skill.Name == "Infiltrator"))
                        .Count();

                    if (teamInfiltratorCount >= 2)
                    {
                        player.sendMessage(-1, "Infiltrator skill purchase not allowed due to 2 infils on the team already.");
                        return;
                    }
                }

                // Infiltrator announcement
                bool withinGracePeriod = script.lastAnnouncementTimes.ContainsKey(player) &&
                                                        (DateTime.Now - script.lastAnnouncementTimes[player]).TotalSeconds < AnnouncementGracePeriod;

                // Announce the player's skill change if it is Infiltrator, not within the grace period, 
                // and the player is not on team "np"
                if (skill.Name == "Infiltrator" && !withinGracePeriod && player._team._name.ToLower() != "np" && !script.arena._name.Contains("Arena 1") && !script.arena._name.Contains("Public1"))
                {
                    // Make the actual announcement
                    if (player._alias == "YAH" || player._alias == "JACKIE"){
                        script.arena.sendArenaMessage("#SWITCHING CLASS IN UPPERCASE ------ TEAM " + player._team._name.ToUpper() + " ------ " + player._alias + ".", 14);
                    } else {
                        script.arena.sendArenaMessage("#CLOAKERS ------ TEAM " + player._team._name + " ------ " + player._alias + ".", 14);
                    }

                    // Update the last announcement time for the player
                    script.lastAnnouncementTimes[player] = DateTime.Now;
                }

                // Update play time for current skill before changing to new skill using inline logic to retrieve the primary skill info
                SkillInfo currentSkill = null;
                if (player._skills != null && player._skills.Count > 0)
                {
                    foreach (var skillItem in player._skills.Values)
                    {
                        currentSkill = skillItem.skill;
                        break;
                    }
                }

                // Update play time for current skill before changing to new skill (now handled by GameStats)
                if (script.gameStats != null)
                    script.gameStats.OnPlayerClassSwap(player);

                // Remove persistent builds from this player
                string dummy;
                script.persistentBuilds.TryRemove(player._alias, out dummy);
                
                // Update class swap count for player
                if (!script.playerClassSwaps.ContainsKey(player))
                    script.playerClassSwaps[player] = 0;
                script.playerClassSwaps[player]++;

                // Always reset the player's inventory when swapping
                player.resetInventory(true);

                // Always clear existing skills when swapping to prevent accumulation
                player._skills.Clear();

                // Add the new skill to the player's skills
                Player.SkillItem newSkill = new Player.SkillItem
                {
                    skill = skill
                };

                // Add the new skill to the player's skill dictionary
                player._skills.Add(skill.SkillId, newSkill);

                // For specialized skills, also add the base skill that corresponds to the vehicle system
                SkillInfo baseSkill = null;
                
                // Check if this is a specialized skill that needs a base skill
                if (skill.Name.Contains("Infantry") && skill.Name != "Infantry")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Infantry");
                }
                else if (skill.Name.Contains("Heavy Weapons") && skill.Name != "Heavy Weapons")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Heavy Weapons");
                }
                else if (skill.Name.Contains("Jump Trooper") && skill.Name != "Jump Trooper")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Jump Trooper");
                }
                else if (skill.Name.Contains("Combat Engineer") && skill.Name != "Combat Engineer")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Combat Engineer");
                }
                else if (skill.Name.Contains("Field Medic") && skill.Name != "Field Medic")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Field Medic");
                }
                else if (skill.Name.Contains("Infiltrator") && skill.Name != "Infiltrator")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Infiltrator");
                }
                else if (skill.Name.Contains("Squad Leader") && skill.Name != "Squad Leader")
                {
                    baseSkill = AssetManager.Manager.getSkillByName("Squad Leader");
                }

                if (baseSkill != null && !player._skills.ContainsKey(baseSkill.SkillId))
                {
                    Player.SkillItem baseSkillItem = new Player.SkillItem
                    {
                        skill = baseSkill
                    };
                    player._skills.Add(baseSkill.SkillId, baseSkillItem);
                }

                // Change the player's vehicle to match the skill's DefaultVehicleId
                if (skill.DefaultVehicleId > 0) // Check if the skill has an associated default vehicle
                {
                    player.setDefaultVehicle(AssetManager.Manager.getVehicleByID(skill.DefaultVehicleId));
                }

                // Deduct the energy required for the skill change
                if (!ignoreEnergy)
                {
                    player._state.energy -= (short)energyNeeded; // Deduct and cast to short to match expected type
                }

                // Synchronize player state to reflect the new skill and vehicle
                // Reset the players warp, but keep their position
                Vehicle vehicle = player._occupiedVehicle ?? player._baseVehicle;
                if (vehicle != null)
                {
                    vehicle._state.positionX = player._state.positionX;
                    vehicle._state.positionY = player._state.positionY;
                    vehicle._state.velocityX = 0;
                    vehicle._state.velocityY = 0;
                    vehicle._state.yaw = player._state.yaw;
                    vehicle._state.direction = Helpers.ObjectState.Direction.None;
                    vehicle._state.energy = 1000;
                    vehicle._state.health = 1000;
                    vehicle._tickDead = 0;
                    vehicle.update(false);
                }
                player.syncState();

                // Setup equipment skills for the new skill
                script.SetupEquipmentSkills(player);

                // Auto-enable summon automation for specific offensive skills
                if (skill.Name == "Infantry Offense Cmp6/PF" || 
                    skill.Name == "Infantry Offense Cara/PF" || 
                    skill.Name == "Heavy Weapons Offense RPG/AC")
                {
                    script.summonAutomationEnabled[player] = true;
                    player.sendMessage(0, String.Format("Summon automation enabled with {0}! Use ?as or ?autosummon to toggle on/off.", skill.Name));
                }

                // Notify the player that the skill has been added and vehicle changed
                //player.sendMessage(0, string.Format("*Your skill has been changed to: {0}", skill.Name));
            }

            /// <summary>
            /// Dictionary to store the key-value pairs for the short command
            /// </summary>
            public Dictionary<string, string> shortCommands = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { "Fuel Canister", "@fc" },
                { "Gas Canister", "@gc" },
                { "Heavy HE", "@hHE" },
                { "Light HE", "@lHE" },
                { "Ammo MG", "@mg" },
                { "Ammo Rifle", "@ri" },
                { "Ammo Shotgun", "@sh" },
                { "Rocket", "@ro" },
                { "Ammo Pistol", "@pi" },
                { "Bullet Mines", "bM" },
                { "PF Generator", "pf" },
                { "IDF Generator", "idf" },
                { "EMP Generator", "emp" },
                { "carapace", "cara" },
                { "CMP6  Assault Armor", "p6" },
                { "Kevlite Combat Armor", "kev" },
                { "Ceramax Combat Armor", "cera" },
                { "CMP4 Combat Armor", "cmp4" },
                { "CMP6 Jump Armor", "cmp6j" },
                { "Drop Armor", "drop" },
                { "Shock Armor", "shock" },
                { "Repulsor Coil", "basic" },
                { "Repulsor Charge", "basic" },
                { "Energizer", "basic" },
                { "Stim Pack", "basic" },
                { "Teleport Beacon", "basic" },
                { "Sentry", "basic" },
                { "Frag Grenade", "nades" },
                { "WP Grenade", "nades" },
                { "EMP Grenade", "nades" },
                { "Haywire Grenade", "nades" },
                { "Maklov AR mk 606", "ar" },
                { "Kuchler AR249", "ar2" },
                { "Titan Arms AR 2mv", "ar3" },
                { "Maklov RG 2", "rgs1" },
                { "Kuchler RG 249", "rgs2" },
                { "Titan Arms RG 2mv", "rgs3" },
                { "SiG Arms m2 AS", "sg" },
                { "Maklov G2 ACW", "sg2" },
                { "Titan Arms mk II CCS", "sg3" },
                { "Titan Arms mk III SG", "sg4" },
                { "Flechette Rifle", "fr" },
                { "Unittech BR2000", "br" },
                { "Titan Arms BR01", "br2" },
                { "Kamenev AKS BR", "br3" },
                { "Kuchler GR790", "gr" },
                { "Maklov GR201g", "gr2" },
                { "Titan Arms 9mm Carbine", "carb" },
                { "Unittech Tech 09 SMG", "smg1" },
                { "Unittech Tech 09 SMG (2)", "smg2" },
                { "Steiner SMG 10a", "smg3" },
                { "Unittech Tech 07m PSMG (2)", "psmg" },
                { "Needler", "n" },
                { "Deathboard", "db" },
                { "Drop Pack", "dp" },
                { "FPack", "fp" },
                { "AP Mine", "aM" },
                { "Plasma Mine", "pM" },
                { "Grapeshot Mine", "gM" },
                { "Gas Mine", "gaM" },
                { "Repulsor Mine", "repM" },
                { "Kamenev SC mk2", "sc" },
                { "Unittech SC 99r", "sc2" },
                { "Gauss Cannon", "gc" },
                { "Kuchler A6 CAW", "caw" },
                { "Maklov LMG mk6", "lmg" },
                { "Kuchler LMG249a", "lmg2" },
                { "Kuchler PC v2", "pc" },
                { "Maklov XVI PC2000", "pc2" },
                { "Maklov AC mk2", "ac" },
                { "Steiner AC 2000k", "ac2" },
                { "Steiner MG94k", "mg" },
                { "Titan Arms MG 101a", "mg2" },
                { "Micro Missile Launcher", "mml" },
                { "Mini Missile Launcher", "mml2" },
                { "Recoiless Rifle", "rr" },
                { "RR Canister", "rrc" },
                { "Maklov GL 8a", "gl" },
                { "Kuchler GL MK II", "gl2" },
                { "Reprogramming Kit", "reprog" },
                { "Engineer Repair Kit", "repair" },
                { "Medikit", "m" },
                { "Deluxe Medikit", "m2" },
                { "Steron Kit", "stk" },
                { "Stim Pack Kit", "spk" },
                { "Teleport Summoner", "ts" },
                { "Teleport Disruptor", "td" },
                { "Suit SuperCharger", "ssc" },
                { "Stealth Sensors", "ss" },
                { "Stealth Coating", "stc" },
                { "Particle Accelerator", "pa" },
                { "Heavy PowerCell", "CellH" },
                { "Medium PowerCell", "CellM" },
                { "Light PowerCell", "CellL" },
                { "Enhanced Sensors", "es" },
                { "Blink Generator", "bg" },
                { "Improved Cloak", "ic" },
                { "Cloaking Unit", "cu" },
                { "SL Beamer", "eb" },
                { "Infil Beamer", "eb" },
                { "Medic Beamer", "eb" },
                { "Engy Beamer", "eb" },
                { "Gravitron", "grav" },
                { "Plasma Bomb", "pb" },
                { "Plasma Projector", "ppr" },
                { "Disruptor", "dis" },
                { "Maklov mk IV PR", "pr" },
                { "Kuchler PR209g", "pr2" },
                { "Pulsar", "pu" },
                { "Stunner", "stun" },
                { "Incinerator", "inc" },
                { "Flamethrower", "ft" },
                { "Kuchler CR 102", "cr" },
                { "Maklov CR mk IV", "cr2" },
                { "Maklov g7 PSMG", "PSMG2" },
                { "Kuchler 201a PSMG", "PSMG3" },
                { "Kamenev AP mk2", "ap" },
                { "Kamenev AP mk2 (2)", "ap2" },
                { "Titan Arms AP101", "ap3" },
                { "Holo-Taunt EZ", "htEZ" },
                { "Holo-Taunt GG", "htGG" },
                { "Turret Box", "tbox" },
                { "Kamenev AC mk2", "ac3" }
                // Add more key-value pairs here as needed
            };

            /// <summary>
            /// Handles the ?short command to output the short versions of given input(s) in a ?buy macro format.
            /// </summary>
            /// <param name="player">The player issuing the command.</param>
            /// <param name="input">The input string after the ?short command.</param>
            public void HandleShortCommand(Player player, string input)
            {
                var validShortForms = new HashSet<string>(); // Use a set to prevent duplicates
                var invalidItems = new List<string>();
                var groupedItems = new Dictionary<string, int>(); // Dictionary to handle occurrences of grouped items

                // Check if input is empty; if so, generate buy macro from current inventory
                if (string.IsNullOrWhiteSpace(input))
                {
                    // Iterate through the player's inventory
                    foreach (var inventoryEntry in player._inventory.Values)
                    {
                        string itemName = inventoryEntry.item.name.ToLower().Trim(); // Normalize item name
                        int quantity = inventoryEntry.quantity;

                        // Check if the inventory item has a shorthand in the shortCommands dictionary
                        string shortForm;

                        // Check for grouped items based on the shortCommands dictionary
                        if (shortCommands.TryGetValue(itemName, out shortForm))
                        {
                            string form = shortForm;

                            // Check if the form is part of any grouped item
                            if (form == "basic" || form == "nades")
                            {
                                if (!groupedItems.ContainsKey(form))
                                    groupedItems[form] = 0;
                                groupedItems[form] += 1; // Increment count for the specific group
                            }
                            else
                            {
                                // Add the shorthand without :1 if quantity is 1
                                validShortForms.Add(quantity == 1 ? form : string.Format("{0}:{1}", form, quantity));
                            }
                        }
                        else if (shortCommands.ContainsValue(itemName)) // Handle direct short form entries
                        {
                            validShortForms.Add(quantity == 1 ? itemName : string.Format("{0}:{1}", itemName, quantity));
                        }
                        else
                        {
                            // Include the full item name with its quantity if no shorthand exists
                            validShortForms.Add(quantity == 1 ? itemName : string.Format("{0}:{1}", itemName, quantity));
                            invalidItems.Add(itemName);
                        }
                    }

                    // Add grouped items to validShortForms if they exist
                    foreach (var group in groupedItems.Keys)
                    {
                        validShortForms.Add(group); // Add each group found
                    }

                    // Notify the player about unmatched items, prefixed with @ to color the message red
                    if (invalidItems.Count > 0)
                    {
                        player.sendMessage(-1, string.Format("@No short form found for: {0}", string.Join(", ", invalidItems)));
                    }

                    // Send the formatted valid short forms as a single output to the player with a space after ?b and no spaces between items
                    if (validShortForms.Count > 0)
                    {
                        player.sendMessage(0, string.Format("?bw {0}", string.Join(",", validShortForms)));
                    }
                    else
                    {
                        player.sendMessage(0, "No items found in inventory with matching short forms.");
                    }

                    return; // Exit the method after processing inventory
                }

                // Split the input string by commas to handle multiple items
                var items = input.Split(',');

                foreach (var item in items)
                {
                    // Trim the item and handle possible quantity or prefix notation
                    var trimmedItem = item.Trim();
                    string quantityPrefix = string.Empty;
                    string cleanedItem = trimmedItem;

                    // Extract quantity or special prefixes like '#', '-'
                    var match = Regex.Match(trimmedItem, @"(:[#-]?\d+)$");
                    if (match.Success)
                    {
                        quantityPrefix = match.Groups[1].Value;
                        cleanedItem = trimmedItem.Substring(0, match.Index).Trim();
                    }

                    string shortForm;

                    // Normalize the cleaned item (trim spaces and convert to lowercase) before lookup
                    string normalizedItem = cleanedItem.Trim().ToLower();

                    // Check if the cleaned item exists in the dictionary as a key or if it is already a short form
                    if (shortCommands.TryGetValue(normalizedItem, out shortForm) || shortCommands.ContainsValue(normalizedItem))
                    {
                        // If it's already a short form (value in the dictionary), use it as is, otherwise, use the mapped short form
                        string form = shortCommands.ContainsValue(normalizedItem) ? normalizedItem : shortForm;

                        // Add without the quantity if it is 1
                        validShortForms.Add(quantityPrefix == ":1" ? form : string.Format("{0}{1}", form, quantityPrefix));
                    }
                    else
                    {
                        // Add the full item if not found or already short
                        validShortForms.Add(string.Format("{0}{1}", cleanedItem, quantityPrefix));
                        invalidItems.Add(cleanedItem);
                    }
                }

                // Notify about invalid items that couldn't be matched to a short form
                if (invalidItems.Count > 0)
                {
                    player.sendMessage(-1, string.Format("@No short form found for: {0}", string.Join(", ", invalidItems)));
                }

                // Send the formatted valid short forms as a single output to the player with a space after ?b
                if (validShortForms.Count > 0)
                {
                    player.sendMessage(0, string.Format("?b {0}", string.Join(",", validShortForms)));
                }
            }
        }

        private Dictionary<string, PlayerStreak> killStreaks;
        private Player lastKiller;

        private Dictionary<string, int> explosives;
        private string[] explosiveList = { "Frag Grenade", "WP Grenade", "EMP Grenade", "Kuchler RG 249", "Maklov RG 2", "Titan Arms RG 2mv", "AP Mine",
                                        "Plasma Mine", "Grapeshot Mine", "RPG", "Micro Missle Launcher", "Recoilless Rifle", "Kuchler PC v2",
                                        "Maklov XVI PC2000" };
        //Note: these corrispond with the weapons above in order
        private int[] explosiveAliveTimes = { 250, 250, 250, 500, 500, 500, 500, 100, 250, 500, 500, 500, 450, 450 };

        private ConcurrentDictionary<string, string> persistentBuilds = new ConcurrentDictionary<string, string>();

        private static readonly HashSet<int> FiniteResourceItemIDs = new HashSet<int> { 2005, 2007, 2009, 2, 9, 10, 11 };

        #endregion

        private void InitializeMaps()
        {
            // Initialize our hardcoded maps. Note that we should really move these into a json file eventually.
            // NOTE: This is to be called _after_ `_flags` is initialized because it depends on whether the
            // arena is OVD or not.

            availableMaps.Clear();

            CTFMap def = new CTFMap();
            def.MapName = "default";
            def.TeamNames.Add(CFG.teams[0].name);
            def.TeamNames.Add(CFG.teams[1].name);

            // For default, we are interested in the original flag placement; so we will extract
            // those. Note that if this code does not work, we will probably have to investigate
            // at what point in time we need to query the flags to get the position.

            // Add dummy flags based on however many flags the arena actually has, because we will be
            // randomizing their positions anyway.
            def.RandomizeFlagLocations = true;

            foreach (var fs in _flags)
            {
                var flagName = fs.flag.GeneralData.Name.ToLower().Trim('\"');

                def.Flags.Add(new MapFlagEntry(flagName, 202, 118));
            }

            availableMaps.Add(def);

            CTFMap full = new CTFMap();
            full.MapName = "full";
            full.TeamNames.Add("Titan Militia");
            full.TeamNames.Add("Collective");
			full.Flags.Add(new MapFlagEntry("Hill201", 54, 32));
            full.Flags.Add(new MapFlagEntry("Bridge1", 202, 120));
            full.Flags.Add(new MapFlagEntry("Bridge2", 202, 202));
            full.Flags.Add(new MapFlagEntry("Bridge3", 202, 286));
			full.Flags.Add(new MapFlagEntry("Hill86", 316, 338));
            full.Flags.Add(new MapFlagEntry("sdFlag", 202, 202));

            availableMaps.Add(full);

            CTFMap bravo = new CTFMap();
            bravo.MapName = "bravo";
            bravo.TeamNames.Add(CFG.teams[0].name); // these _should_ be the default two teams.
            bravo.TeamNames.Add(CFG.teams[1].name);
            bravo.Flags.Add(new MapFlagEntry("flag1", 500, 1333));
            bravo.Flags.Add(new MapFlagEntry("flag2", 500, 1213));
            bravo.Flags.Add(new MapFlagEntry("flag3", 744, 1564));
            bravo.Flags.Add(new MapFlagEntry("flag4", 864, 1564));

            availableMaps.Add(bravo);

            currentMap = full; // Set full map as the ... default ... event.
        }

        #region Game Functions
        //////////////////////////////////////////////////
        // Game Functions
        //////////////////////////////////////////////////
        /// <summary>
        /// Performs script initialization
        /// </summary>
        public bool init(IEventObject invoker)
        {
            arena = invoker as Arena;
            CFG = arena._server._zoneConfig;

            _flags = new List<Arena.FlagState>();
            minPlayers = 2;
            victoryHoldTime = CFG.flag.victoryHoldTime;
            preGamePeriod = CFG.flag.startDelay;

            killStreaks = new Dictionary<string, PlayerStreak>();
            explosives = new Dictionary<string, int>();

            bases = new Dictionary<string, Base>();

            for (int i = 0; i < explosiveList.Length; i++)
            {
                explosives.Add(explosiveList[i], explosiveAliveTimes[i]);
            }

            foreach (Arena.FlagState fs in arena._flags.Values)
            {	//Determine the minimum number of players
                if (fs.flag.FlagData.MinPlayerCount < minPlayers)
                { minPlayers = fs.flag.FlagData.MinPlayerCount; }

                //Register our flag change events
                fs.TeamChange += OnFlagChange;
            }

            gameState = GameState.Init;

            bases["A7"] = new Base(19, 463, 32, 473);
            bases["D7"] = new Base(277, 495, 262, 484);
            bases["F8"] = new Base(450, 610, 466, 626);
            bases["F5"] = new Base(422, 370, 413, 357);
            bases["A5"] = new Base(57, 369, 71, 365);
            bases["B6"] = new Base(153, 445, 133, 456);
            bases["B8"] = new Base(147, 596, 159, 580);
            bases["A8"] = new Base(22, 574, 36, 562);
            bases["A10"] = new Base(100, 733, 107, 749);
            bases["F6"] = new Base(440, 456, 429, 446);
            bases["H4"] = new Base(600, 280, 621, 295);

            if (!arena._name.Contains("Arena 1") && !arena._name.Contains("Public1"))
            {
                foreach (Arena.FlagState fs in arena._flags.Values)
                {
                    if (fs.flag.FlagData.MinPlayerCount == 200)
                        _flags.Add(fs);     
                }

                playing = new Team(arena, arena._server);
                playing._name = "Playing";
                playing._id = (short)arena.Teams.Count();
                playing._password = "";
                playing._owner = null;
                playing._isPrivate = true;
                arena.createTeam(playing);

                isOVD = true;

                _playerStatsEnabled = true;
            }
            else
            {
                //_playerStatsEnabled = false;
                foreach (Arena.FlagState fs in arena._flags.Values)
                {
                    if (fs.flag.FlagData.MinPlayerCount == 0)
                        _flags.Add(fs);
                }
            }

            InitializeMaps();

            // Instantiate the BuildManager
            BuildManager buildManager = new BuildManager();

            // Define build inputs dynamically
            List<Tuple<string, string, string, string, string>> buildInputs = new List<Tuple<string, string, string, string, string>>
            {
                new Tuple<string, string, string, string, string>("ohvy", "?buy kev,pf,ssc,RPG,AC,LMG,ammo mg:40,rocket:20,ammo rifle:40,Basic", 
                                                                "*Base attacking; dueling power, low ammo, designed for pushing defense back then doing turret damage.", 
                                                                "Heavy Weapons", "Axidus"),
                new Tuple<string, string, string, string, string>("ohvy2", "?buy kev,pf,CellH,rpg,smg1,ac,ammo mg:#50,ammo pistol:#70,rocket:#20,frag grenade:#2,emp mine:#3,basic", 
                                                                "Base attacking; SMG instead of LMG allows to carry more AC and a Heavy PowerCell. Weaker dueling power but a full clip of SMG + Demo pack still packs a punch to get them away long enough to finish with RPG", 
                                                                "Heavy Weapons", "Axidus"),                                                                
                new Tuple<string, string, string, string, string>("dhvy", "?buy kev,pf,ssc,MML,AC,ammo mg:125,rocket:26,bullet mine:#5,plasma mine:#1,ap mine:#1,Basic", 
                                                                "2 Weapon Defensive build focused on AOE weapons (high ammo count).", 
                                                                "Heavy Weapons", "Axidus"),
                new Tuple<string, string, string, string, string>("hvyMG", "?buy kev,pf,ac,@mg:250,bullet mine:20,CellM,mg,basic,nades", 
                                                                "MG / AC o hvy build.", 
                                                                "Heavy Weapons", "Axidus"),
                new Tuple<string, string, string, string, string>("oinf", "?buy p6,pf,ssc,ar,ar3,sg,Ammo Rifle:#60,Ammo Shotgun:#60,rgs1:#4,rgs3:#4,nades:4,basic,bullet mine:#5", 
                                                                "Double RG oinf w/ p6+pf+ssc, 8 rgs, 8 grenades, and 50ar/30sg ammo", 
                                                                "Infantry", "Roman Reigns"),
                new Tuple<string, string, string, string, string>("dinf", "?buy cmp6,pf,ssc,es,ar,sg2,rg:4,nades,basic,plasma mine:2,bullet mine:#10,ammo rifle:#140,ammo shotgun:#155", 
                                                                "Shotgun dinf w/ p6+pf+ssc, 100ar/50sg ammo, 4 rgs, 8 grenades, 10 bullet mines, 2 plasma. ", 
                                                                "Infantry", "Roman Reigns"), 
                new Tuple<string, string, string, string, string>("dinfcaw", "?buy cmp6,pf,ssc,caw,ar,es,basic,nades,rg:4,ammo pistol:#300,plasma mine:2,bullet mine:#10,ammo rifle:#100", 
                                                                "CAW dinf w/ p6+pf+ssc, 300pistol/100ar ammo, 4 rgs, 8 grenades, 10 bullet mines, 2 plasma. ", 
                                                                "Infantry", "Axidus"),
                new Tuple<string, string, string, string, string>("dinfcara", "?buy cara,pf,ssc,ar,sg2,nades,basic,rg:4,Ammo Rifle:#90,Ammo Shotgun:#105,Bullet Mine:#10,plasma mine:2", 
                                                                "Cara/PF dinf w/ 120ar/120sg ammo, 4 rgs, 8 grenades", 
                                                                "Infantry", "Roman Reigns"),
                new Tuple<string, string, string, string, string>("oinfcara", "?buy cara,pf,ssc,ar,sg2,nades,basic,rg:4,Ammo Rifle:#120,Ammo Shotgun:#120,Bullet Mine:#10", 
                                                                "Cara/pf oinf w/ 120ar/120sg ammo, 4 rgs, 8 grenades", 
                                                                "Infantry", "metal"), 
                new Tuple<string, string, string, string, string>("slBR", "?buy P6,PF,SSC,EB,TD,BR,CR,nades,basic,Ammo Pistol:#50,Ammo Rifle:#50,Ammo MG:#5,grapeshot mine:5,ap mine:#3", 
                                                                "Weapons: BR/CR/EB. 50ar/50pi ammo, 5 grapeshot mine, 3 ap mine, handful of Ammo MG for dropping to hide mines.", 
                                                                "Squad Leader", "metal"),                                                                                                       
                new Tuple<string, string, string, string, string>("slbonds", "?buy cmp6,emp,ssc,sl beamer,td,kuchler cr 102,unittech br2000,ammo rifle:#35,ammo pistol:#40,basic,nades,emp mine:#4,grapeshot mine:#1,ap mine:#4,ammo mg:#4", 
                                                                "Weapons: BR/CR/EB. Light on ammo, plenty of mines, handful of Ammo MG for dropping to hide mines.", 
                                                                "Squad Leader", "bonds"),
                new Tuple<string, string, string, string, string>("medbonds", "?buy cmp4,emp,medic beamer,ssc,td,teleport summoner,needler,medikit,deluxe medikit,smg1,es,stunner,ammo pistol:#120,basic,frag grenade:4,tranq:10", 
                                                                "*Standard medic build. Weapons: SMG/EB. Utility items (ES, TD).", 
                                                                "Field Medic", "bonds"),
                new Tuple<string, string, string, string, string>("med", "?buy cmp4,emp,medic beamer,ssc,td,teleport summoner,needler,medikit,deluxe medikit,smg1,es,stunner,ammo pistol:#120,basic,frag grenade:4,tranq:10", 
                                                                "*Standard medic build. Weapons: SMG/EB. Utility items (ES, TD).", 
                                                                "Field Medic", "bonds"),
                new Tuple<string, string, string, string, string>("medstandard", "?buy cmp4,emp,medic beamer,ssc,td,teleport summoner,needler,medikit,deluxe medikit,smg1,es,stunner,ammo pistol:#120,basic,frag grenade:4,tranq:10", 
                                                                "*Standard medic build. Weapons: SMG/EB. Utility items (ES, TD).", 
                                                                "Field Medic", "bonds"),
                new Tuple<string, string, string, string, string>("eng", "?buy basic,nades,fr,inc,eb,kev,ssc,pf,hoverboard,tbox,nades,basic,grapeshot mine:5,repair,ammo pistol:500,fuel canister:#50,ammo shotgun:#100", 
                                                                "Standard engineer build. Weapons: Flechette/EB/Incin/Grenades/grapeshot Mines. Utility items (Kevlite, SSC, PF, Hoverboard, Turret box, repair kit).", 
                                                                "Combat Engineer", "default"),
                new Tuple<string, string, string, string, string>("engstandard", "?buy basic,nades,fr,inc,eb,kev,ssc,pf,hoverboard,tbox,nades,basic,grapeshot mine:5,repair,ammo pistol:500,fuel canister:#50,ammo shotgun:#100", 
                                                                "Standard engineer build. Weapons: Flechette/EB/Incin/Grenades/grapeshot Mines. Utility items (Kevlite, SSC, PF, Hoverboard, Turret box, repair kit).", 
                                                                "Combat Engineer", "default"),
                new Tuple<string, string, string, string, string>("jt", "?buy drop,pf,CellH,ar2,ar,ar3,gl,dp,rgs1,rgs2,rgs3,nades,aM,pM,Ammo Rifle:#200,Light HE:#50,Ammo MG:#1,basic", 
                                                                "DropPack JT. Weapons: AR, Maklov GL, 12 RG, nades, mines", 
                                                                "Jump Trooper", "default"),
                new Tuple<string, string, string, string, string>("jtstandard", "?buy drop,pf,CellH,ar2,ar,ar3,gl,dp,rgs1,rgs2,rgs3,nades,aM,pM,Ammo Rifle:#200,Light HE:#50,Ammo MG:#1,basic", 
                                                                "DropPack JT. Weapons: AR, Maklov GL, 12 RG, nades, mines", 
                                                                "Jump Trooper", "default"),
                new Tuple<string, string, string, string, string>("footjt", "?buy drop,pf,CellM,ar,gl,dp,rgs1,nades,Ammo Rifle:#50,Light HE:#50,basic", 
                                                                "Foot JT. Weapons: AR, Maklov GL, 4 RG, nades", 
                                                                "Jump Trooper", "default"),
                new Tuple<string, string, string, string, string>("infil", "?buy pr,dis,blink,eb,ssc,cloak,basic", 
                                                                "Infiltrator Weapons: PR, EB, Disruptor, Blink Gen.  Utility: Cloak/SSC", 
                                                                "Infiltrator", "default"),
                new Tuple<string, string, string, string, string>("infilstandard", "?buy pr,dis,blink,eb,ssc,cloak,basic", 
                                                                "Infiltrator Weapons: PR, EB, Disruptor, Blink Gen.  Utility: Cloak/SSC", 
                                                                "Infiltrator", "default"),
                new Tuple<string, string, string, string, string>("slherth", "?buy p6,emp,CellM,eb,cr,td,inc,ammo pistol:100,gM:5,aM:2,ammo mg:3,fuel canister:40,basic,nades", 
                                                                "P6/EMP/CellM/EB/CR/TD/Inc/100pistol/5GMines/2AMines/3AmmoMG/40fuel",
                                                                "Squad Leader", "Herthbul")
            };

            // Convert ?buy commands to a dictionary format
            buildSets = buildManager.ConvertBuyCommandsToDictionary(buildInputs);
            currentEventType = (arena._name.Contains("Arena 1") || arena._name.Contains("Public1")) ? EventType.MiniTP : EventType.None;

            // Initialize OvD Automation
            _ovdAutomation = new OvDAutomation(this);

            // Initialize Champion Effects System
            _championEffects = new ChampionEffects(arena, this);

            // Auto-start OvD automation if arena name contains "ovd"
            // COMMENTING OUT OVD AUTOMATION BASED ON ARENA NAME FOR NOW
            // if (_ovdAutomation != null && arena._name.ToLower().Contains("ovd"))
            // {
            //     _ovdAutomation.StartOvDAutomation();
            //     arena.sendArenaMessage("&OvD Automation enabled by default for this arena! Use *ovd to toggle on/off.");
            // }

            return true;
        }

        /// <summary>
        /// Retrieves all items from the player's inventory and sends the details to the player.
        /// </summary>
        /// <param name="player">The player whose inventory is to be retrieved and displayed.</param>
        public void DisplayInventoryItems(Player player)
        {
            // Check if the inventory is not empty
            if (player._inventory == null || player._inventory.Count == 0)
            {
                player.sendMessage(0, "Your inventory is empty.");
                return;
            }

            // Iterate through each item in the inventory
            foreach (var inventoryEntry in player._inventory.Values)
            {
                string itemName = inventoryEntry.item.name; // Get the item name
                int quantity = inventoryEntry.quantity; // Get the quantity

                // Send a message to the player with the item details
                player.sendMessage(0, string.Format("Item: {0}, Quantity: {1}", itemName, quantity));
            }
            return;
        }

        /*//////////////////////////////////////////////////
        // List of ?builds to simplify buy macro setups per class
        *///////////////////////////////////////////////////
        // Dictionary to store build sets with items and descriptions

        /* To do: 
            -Implement tags for builds (IE: Sustain, Aggressive, Versatile, Default), 
            -Alias of build creator
            -class
            -randomize function (IE: ?build hvy random)
            -database of builds so players can add/modify/delete and manage ingame    

            done: 
            -mirror ?build to ?buy customBuildName logic (see if its possible)
        */

        private Dictionary<string, Tuple<List<Tuple<string, ushort>>, string, string, string, string>> buildSets;


        private static Dictionary<string, int> maxAmmoQuantities = new Dictionary<string, int>
        {
            { "heavy he", 20 },
            { "light he", 50 },
            //{ "fuel canister", 120 },
            //{ "ammo rifle", 400 },
            { "ammo pistol", 500 },
            { "ammo shotgun", 200 },
            { "ammo mg", 250 },
            { "rocket", 40 },
            { "ap mine", 5 },
            { "plasma mine", 5 },
            { "tranq", 10 },
            { "sentry", 1 }
            // Add other ammo types here
        };

        private bool BuildTurret(Player player, string turretName)
            {
                // Attempt to find the nearest computer
                Computer nearestComputer = null;
                int shortestDistance = int.MaxValue;

                // Iterate over computers in the arena to find the closest one
                foreach (Computer computer in player._arena.Vehicles.OfType<Computer>())
                {
                    int distance = (int)((player._state.position() - computer._state.position()).Length * 100);
                    if (distance < shortestDistance)
                    {
                        shortestDistance = distance;
                        nearestComputer = computer;
                    }
                }

                // Check if a nearest computer was found
                if (nearestComputer == null)
                {
                    player.sendMessage(-1, string.Format("No nearby computers detected."));
                    return false;
                }

                // Access the computer's produce options
                var produceOptions = nearestComputer._type.Products.ToList();

                // Ensure produce options are available
                if (produceOptions == null || produceOptions.Count == 0)
                {
                    player.sendMessage(-1, string.Format("No production options available."));
                    return false;
                }

                // Find the corresponding turret based on the turret name parameter
                var selectedProduct = produceOptions.FirstOrDefault(p => p.Title.Equals(turretName, StringComparison.OrdinalIgnoreCase));

                // Check if the product exists
                if (selectedProduct == null)
                {
                    player.sendMessage(-1, string.Format("Unable to find {0} in the production list.", turretName));
                    return false;
                }

                // Trigger the production logic
                player.sendMessage(0, string.Format("Producing: {0}", selectedProduct.Title));
                player._arena.produceRequest(player, nearestComputer, selectedProduct);

                return true;
            }

        private bool BuildTurretAtLocation(Player player, string turretName, short x, short y)
        {
            // Get the vehicle info for the turret type
            VehInfo turretInfo;
            switch (turretName.ToLower())
            {
                case "mg":
                    turretInfo = AssetManager.Manager.getVehicleByID(400);
                    break;
                case "rocket": 
                    turretInfo = AssetManager.Manager.getVehicleByID(401);
                    break;
                case "plasma":
                    turretInfo = AssetManager.Manager.getVehicleByID(700);
                    break;
                case "sentry":
                    turretInfo = AssetManager.Manager.getVehicleByID(402);
                    break;
                default:
                    player.sendMessage(-1, "Invalid turret type specified.");
                    return false;
            }

            // Create the object state at specified x,y coordinates
            Helpers.ObjectState objState = new Helpers.ObjectState
            {
                positionX = x,
                positionY = y,
                positionZ = 0 // Set to ground level
            };

            // Create the turret directly
            Vehicle turret = player._arena.newVehicle(turretInfo, player._team, player, objState);
            return true;
        }

        private bool BuildServerTurretAtLocation(string turretName, short x, short y, Team team)
        {
            // Get the vehicle info for the turret type
            VehInfo turretInfo = null;
            switch (turretName.ToLower())
            {
                case "mg":
                    turretInfo = AssetManager.Manager.getVehicleByID(429); // 429 or 400
                    break;
                case "rocket": 
                    turretInfo = AssetManager.Manager.getVehicleByID(428); // 428 or 401
                    break;
                case "plasma":
                    turretInfo = AssetManager.Manager.getVehicleByID(427); // 427 or 700
                    break;
                case "sentry":
                    turretInfo = AssetManager.Manager.getVehicleByID(402);
                    break;
                case "homeportal":
                    turretInfo = AssetManager.Manager.getVehicleByID(438);
                    break;
                default:
                    return false;
            }

            if (turretInfo == null)
                return false;

            // Create the object state at specified x,y coordinates
            Helpers.ObjectState objState = new Helpers.ObjectState
            {
                positionX = x,
                positionY = y,
                positionZ = 0
            };
            Vehicle turret = arena.newVehicle(turretInfo, team, null, objState);
            return true;
        }

        private bool BuildMiniTPTurrets()
        {
            // Get the first two teams
            Team team1 = arena.Teams.FirstOrDefault(t => t._name.Equals("Titan Militia"));
            Team team2 = arena.Teams.FirstOrDefault(t => t._name.Equals("Collective"));

            if (team1 == null || team2 == null)
                return false;

            BuildServerTurretAtLocation("MG", (short)(1094 * 16), (short)(627 * 16), team1);
            BuildServerTurretAtLocation("MG", (short)(1077 * 16), (short)(636 * 16), team1);
            BuildServerTurretAtLocation("Rocket", (short)(1089 * 16), (short)(635 * 16), team1);
            BuildServerTurretAtLocation("Plasma", (short)(1076 * 16), (short)(639 * 16), team1);
            BuildServerTurretAtLocation("Sentry", (short)(1081 * 16), (short)(630 * 16), team1);
            BuildServerTurretAtLocation("Sentry", (short)(1101 * 16), (short)(634 * 16), team1);
            BuildServerTurretAtLocation("homeportal", (short)(1077 * 16), (short)(628 * 16), team1);

            BuildServerTurretAtLocation("MG", (short)(977 * 16), (short)(632 * 16), team2);
            BuildServerTurretAtLocation("MG", (short)(977 * 16), (short)(622 * 16), team2);
            BuildServerTurretAtLocation("Rocket", (short)(991 * 16), (short)(628 * 16), team2);
            BuildServerTurretAtLocation("Plasma", (short)(976 * 16), (short)(639 * 16), team2);
            BuildServerTurretAtLocation("Sentry", (short)(1002 * 16), (short)(629 * 16), team2);
            BuildServerTurretAtLocation("Sentry", (short)(985 * 16), (short)(638 * 16), team2);
            BuildServerTurretAtLocation("homeportal", (short)(976 * 16), (short)(649 * 16), team2);

            return true;
        }

        /// <summary>
        /// Example usage of BuildTurretAtLocation
        /// </summary>
        private void BuildTurretExample(Player player)
        {
            // Get player's current position
            short playerX = player._state.positionX;
            short playerY = player._state.positionY;

            // Build different types of turrets around the player
            BuildTurretAtLocation(player, "MG", playerX, playerY); // Build MG turret at player location
            BuildTurretAtLocation(player, "Rocket", (short)(playerX + 100), playerY); // Build rocket turret 100 units to the right
            BuildTurretAtLocation(player, "Plasma", playerX, (short)(playerY + 100)); // Build plasma turret 100 units up
            BuildTurretAtLocation(player, "Sentry", (short)(playerX - 100), playerY); // Build sentry turret 100 units to the left

            player.sendMessage(0, "Built example turrets around your position");
            return;
        }

                    // Dictionary to persist swing data between commands
            private Dictionary<string, string> swingDictionary = new Dictionary<string, string>();

        /// <summary>
        /// Maps full class names to skill aliases expected by the swap command
        /// </summary>
        private string MapClassNameToSkillAlias(string className)
        {
            if (string.IsNullOrEmpty(className))
                return null;

            switch (className)
            {
                case "Infantry":
                    return "inf";
                case "Heavy Weapons":
                    return "hvy";
                case "Field Medic":
                    return "med";
                case "Squad Leader":
                    return "sl";
                case "Combat Engineer":
                    return "eng";
                case "Infiltrator":
                    return "infil";
                case "Jump Trooper":
                    return "jt";
                default:
                    return className.ToLower(); // Fallback for unknown classes
            }
        }

        /// <summary>
        /// Detects the required class for a custom item list based on item combinations
        /// </summary>
        private string DetectRequiredClassForItems(string itemList, string currentClass)
        {
            if (string.IsNullOrWhiteSpace(itemList))
                return null;

            // Split the item list by commas and normalize each item
            string[] items = itemList.Split(',');
            var normalizedItems = new List<string>();
            
            foreach (string item in items)
            {
                // Remove quantity specifiers (e.g., ":250", "#100") and normalize
                string cleanItem = item.Trim().ToLower();
                if (cleanItem.Contains(":"))
                    cleanItem = cleanItem.Substring(0, cleanItem.IndexOf(":"));
                if (cleanItem.Contains("#"))
                    cleanItem = cleanItem.Substring(0, cleanItem.IndexOf("#"));
                if (cleanItem.StartsWith("@"))
                    cleanItem = cleanItem.Substring(1);
                
                normalizedItems.Add(cleanItem.Trim());
            }

            // Infantry Item detection list
            if (normalizedItems.Any(item => item == "kuchler a6 caw" || item == "caw" || 
                item == "flamethrower" || item == "fl" || 
                item == "sig arms m2 as" || item == "sg" || item == "sg2" ||
                (item == "maklov g2 acw" && currentClass != "Captain" && currentClass != "Sergeant")))
            {
                return "Infantry";
            }

            // Heavy Weapons: Item list contains heavy weapons
            if (normalizedItems.Any(item => item == "kamenev ac mk2" || item == "kamenev sc mk2" || 
                item == "kuchler lmg249a" || item == "maklov ac mk2" || 
                item == "maklov lmg mk6" || item == "steiner mg94k" || 
                item == "unittech sc 99r" || item == "micro missile launcher" || 
                item == "mini missile launcher" || item == "mml" ||
                item == "rpg" || item == "ac" || item == "lmg" || item == "mg"))
            {
                return "Heavy Weapons";
            }

            // Field Medic: Item list contains "Medikit"
            if (normalizedItems.Any(item => item == "medikit" || item == "m" || item == "m2" || item == "medic beamer"))
            {
                return "Field Medic";
            }

            // Squad Leader: Item list contains "SL Beamer"
            if (normalizedItems.Any(item => item == "sl beamer" || item == "squad leader"))
            {
                return "Squad Leader";
            }

            // Combat Engineer: Item list contains "Engy Beamer"
            if (normalizedItems.Any(item => item == "engy beamer" || item == "engineer" || 
                item == "tbox" || item == "turret box" || item == "repair" || item == "Engineer Repair Kit"))
            {
                return "Combat Engineer";
            }

            // Infiltrator: Item list contains "Blink Generator"
            if (normalizedItems.Any(item => item == "blink generator" || item == "blink" || 
                item == "cloak" || item == "pr" || item == "pulse rifle"))
            {
                return "Infiltrator";
            }

            // Jump Trooper: Item list contains ("Maklov GL 8a" or "Kuchler GL MK II") and not already Captain or Sergeant
            if (normalizedItems.Any(item => (item == "maklov gl 8a" || item == "kuchler gl mk ii" || 
                 item == "gl" || item == "drop")) && 
                currentClass != "Captain" && currentClass != "Sergeant")
            {
                return "Jump Trooper";
            }

            return null; // No specific class detected
        }

        public async Task HandleBuildCommand(Player player, string buildName, bool ignoreStoreCheck = false)
        {
            // Can you buy from this location?
            if ((player._arena.getTerrain(player._state.positionX, player._state.positionY).storeEnabled) || (player._team.IsSpec && player._server._zoneConfig.arena.spectatorStore) || ignoreStoreCheck)
            {
                // Get the player's current class
                string playerClass = GetPrimarySkillName(player);

                // Auto-switch class logic
                string requiredClass = null;
                
                // Check if it's a preset build
                if (buildSets.ContainsKey(buildName.ToLower()))
                {
                    var buildData = buildSets[buildName.ToLower()];
                    requiredClass = buildData.Item4; // Class is stored in Item4
                }
                else
                {
                    // Check if it's a custom item list
                    requiredClass = DetectRequiredClassForItems(buildName, playerClass);
                }

                // Perform class switch if needed
                if (!string.IsNullOrEmpty(requiredClass) && !playerClass.Equals(requiredClass, StringComparison.OrdinalIgnoreCase))
                {
                    // Map the class name to the skill alias expected by the swap command
                    string skillAlias = MapClassNameToSkillAlias(requiredClass);
                    
                    if (player.IsDead)
                    {
                        // Queue the class swap for when the player respawns
                        queuedClassSwap[player] = skillAlias;
                        player.sendMessage(0, String.Format("You are dead. Your class will be changed to {0} when you respawn.", requiredClass));
                    }
                    else
                    {
                        player.sendMessage(0, String.Format("Auto-switching to {0} class for this build.", requiredClass));
                        commandHandler.HandleSwapCommand(player, skillAlias, CFG, this, true, false);
                        // Update the current player class after the swap
                        playerClass = requiredClass;
                    }
                }

                // Auto-enable autobuy for preset builds (but don't disable it if already enabled)
                if (buildSets.ContainsKey(buildName.ToLower()))
                {
                    // Check if autobuy is currently disabled
                    bool currentlyEnabled = autoBuyEnabled.ContainsKey(player) && autoBuyEnabled[player];
                    
                    if (!currentlyEnabled)
                    {
                        autoBuyEnabled[player] = true;
                        player.sendMessage(0, "AutoBuy has been automatically enabled for this preset build.");
                    }

                    // Auto-enable autodrop for preset builds (compulsory for preset builds)
                    bool dropCurrentlyEnabled = autoDropEnabled.ContainsKey(player) && autoDropEnabled[player];
                    
                    if (!dropCurrentlyEnabled)
                    {
                        autoDropEnabled[player] = true;
                        player.sendMessage(0, "AutoDrop has been automatically enabled for this preset build.");
                    }
                }

                if (string.IsNullOrWhiteSpace(buildName))
                {
                    // List the description of the different payloads available
                    player.sendMessage(0, "#------------------------");
                    player.sendMessage(0, "~?build <buildName> ---- Applies the specified build.");
                    player.sendMessage(0, "~?build list ---- Lists all builds available for your class.");
                    player.sendMessage(0, "~?build <buildName> info ---- Displays information about a specific build.");
                    player.sendMessage(0, "~?build random ---- Selects a random build for your class.");
                    player.sendMessage(0, "#------------------------");
                    player.sendMessage(0, "~?b <buildName> ---- short for ?build");
                    player.sendMessage(0, "~?bw <buildName> ---- wipes inventory, then purchases build");
                    player.sendMessage(0, "~?bwd <buildName> ---- wipes inventory, purchases build + excess ammo for drops (then use command ?d to drop excess ammo)");
                    player.sendMessage(0, "~?d ---- drops excess ammo after using ?bwd <buildName> command");
                    player.sendMessage(0, "#------------------------");
                    return;
                }

                // Check for "list" payload
                if (buildName.Equals("list", StringComparison.OrdinalIgnoreCase))
                {
                    // Handle listing all builds for player's class
                    var buildsForClass = buildSets
                        .Where(b => b.Value.Item4.Equals(playerClass, StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    if (buildsForClass.Count > 0)
                    {
                        player.sendMessage(0, "&Available builds for your class '" + playerClass + "':");
                        foreach (var build in buildsForClass)
                        {
                            string buildNameToDisplay = build.Key;
                            string description = build.Value.Item2;
                            string contributedBy = build.Value.Item5;

                            // Use different starting characters in player.sendMessage to format nicely
                            player.sendMessage(0, "*" + buildNameToDisplay + ": " + description + " (Contributed By: " + contributedBy + ")");
                        }
                    }
                    else
                    {
                        player.sendMessage(-1, "No builds available for your class '" + playerClass + "'.");
                    }
                    return;
                }

                // Check for "info" payload
                if (buildName.EndsWith(" info", StringComparison.OrdinalIgnoreCase))
                {
                    // Get the build name without the " info" suffix
                    string buildNameWithoutInfo = buildName.Substring(0, buildName.Length - 5).Trim();

                    if (buildSets.ContainsKey(buildNameWithoutInfo.ToLower()))
                    {
                        var buildData = buildSets[buildNameWithoutInfo.ToLower()];

                        string description = buildData.Item2;
                        string buyCommand = buildData.Item3;
                        string classType = buildData.Item4;
                        string contributedBy = buildData.Item5;

                        // Display the build information using player.sendMessage and string formatting
                        player.sendMessage(0, "#------------------------");
                        player.sendMessage(0, "Build Name: " + buildNameWithoutInfo + "       Contributed By: " + contributedBy);
                        player.sendMessage(0, "&" + description);
                        player.sendMessage(0, "*" + buyCommand);
                        player.sendMessage(0, "#------------------------");
                    }
                    else
                    {
                        player.sendMessage(-1, "Build '" + buildNameWithoutInfo + "' not found.");
                    }
                    return;
                }

                // Check if the buildName is "random"
                if (buildName.Equals("random", StringComparison.OrdinalIgnoreCase))
                {
                    var availableBuilds = buildSets
                        .Where(b => b.Value.Item4.Equals(playerClass, StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    if (availableBuilds.Count > 0)
                    {
                        // Select a random build
                        var randomBuild = availableBuilds[new Random().Next(availableBuilds.Count)];
                        buildName = randomBuild.Key;
                        player.sendMessage(0, "Selected random build: " + buildName);
                    }
                    else
                    {
                        player.sendMessage(-1, "No available builds for your class.");
                        return;
                    }
                }

                // Now proceed to handle the buildName, which may include multiple items/builds, split by commas
                // Split the buildName by commas to handle multiple items
                string[] itemRequests = buildName.Split(',');

                foreach (string request in itemRequests)
                {
                    // Split each request by colon to separate item name and quantity
                    string[] parts = request.Split(':');
                    string itemName = parts[0].Trim().ToLower(); // Normalize item name
                    string quantitySpecifier = parts.Length > 1 ? parts[1].Trim() : "1"; // Default quantity is additive 1

                    // Check if it's a build
                    if (buildSets.ContainsKey(itemName))
                    {
                        // Handle build logic
                        player.sendMessage(0, "*Found build: " + itemName + ". Processing items...");
                        var buildData = buildSets[itemName];
                        List<Tuple<string, ushort>> buildItems = buildData.Item1;

                        bool containsPowercell = buildItems.Any(item => 
                            item.Item1.Equals("cellh", StringComparison.OrdinalIgnoreCase) ||
                            item.Item1.Equals("cellm", StringComparison.OrdinalIgnoreCase) ||
                            item.Item1.Equals("celll", StringComparison.OrdinalIgnoreCase) ||
                            item.Item1.Equals("heavy powercell", StringComparison.OrdinalIgnoreCase) ||
                            item.Item1.Equals("medium powercell", StringComparison.OrdinalIgnoreCase) ||
                            item.Item1.Equals("light powercell", StringComparison.OrdinalIgnoreCase));

                        // Add to the player's energy the amount from the 'extraCapacity' property on the item based on cell type
                        if (containsPowercell)
                            {
                                // Map shortened names to full names if needed
                                string fullItemName = itemName;
                                if (itemName.Equals("cellh", StringComparison.OrdinalIgnoreCase))
                                    fullItemName = "Heavy PowerCell";
                                else if (itemName.Equals("cellm", StringComparison.OrdinalIgnoreCase))
                                    fullItemName = "Medium PowerCell";
                                else if (itemName.Equals("celll", StringComparison.OrdinalIgnoreCase))
                                    fullItemName = "Light PowerCell";
                                
                                // Get the actual powercell item with the proper name
                                ItemInfo actualItem = AssetManager.Manager.getItemByName(itemName);
                                if (fullItemName != itemName)
                                    actualItem = AssetManager.Manager.getItemByName(fullItemName);
                                
                                // Get the item info for the powercell's extraCapacity property
                                ItemInfo.UtilityItem powercell = actualItem as ItemInfo.UtilityItem;
                                if (powercell != null)
                                {
                                    int energyToAdd = powercell.extraCapacity;
                                    int baseEnergy = player._baseVehicle._type.EnergyMax;
                                    player.setEnergy((short)Math.Min(1000, baseEnergy + energyToAdd));
                                    //player.sendMessage(0, string.Format("~{0} energy added to your energy.", energyToAdd));
                                }
                            }

                        foreach (var item in buildItems)
                        {
                            ItemInfo prize = AssetManager.Manager.getItemByName(item.Item1);
                            if (prize != null)
                            {
                                // Check for product conversions (like Rainbow CAW) in builds too
                                try
                                {
                                    string convertedItemName = await ProductPurchaseManager.GetConvertedItemName(player._alias, prize.name);
                                    
                                    // If conversion happened, get the new item
                                    if (!convertedItemName.Equals(prize.name, StringComparison.OrdinalIgnoreCase))
                                    {
                                        ItemInfo convertedItem = AssetManager.Manager.getItemByName(convertedItemName);
                                        if (convertedItem != null)
                                        {
                                            prize = convertedItem;
                                            //player.sendMessage(0, string.Format("&Converted to {0}! (Premium Product)", convertedItemName));
                                        }
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine(string.Format("Error checking product conversion in build for {0}: {1}", player._alias, ex.Message));
                                    // Continue with original item if conversion fails
                                }

                                if (FiniteResourceItemIDs.Contains(prize.id))
                                {
                                    continue;
                                }

                                int desiredQuantity = item.Item2;
                                int currentQuantity = player.getInventoryAmount(prize.id);

                                // By default, apply fixed quantity logic
                                if (currentQuantity < desiredQuantity)
                                {
                                    // Award the difference to reach the desired quantity
                                    int amountToAdd = desiredQuantity - currentQuantity;
                                    player.inventoryModify(prize, amountToAdd);
                                }
                                else if (currentQuantity > desiredQuantity)
                                {
                                    // Remove the excess to match the desired quantity
                                    int amountToRemove = currentQuantity - desiredQuantity;
                                    player.inventoryModify(prize, -amountToRemove);
                                    player.sendMessage(0, "~" + amountToRemove + "x" + prize.name + " has been removed to match the desired quantity of " + desiredQuantity + ".");
                                }
                            }
                            else
                            {
                                player.sendMessage(-1, "@Failed to find item " + item.Item1 + ".");
                            }
                        }
                    }
                    else
                    {
                        // Handle store item logic
                        // First, try to find the item as-is (this handles Multi-Items like "caw")
                        ItemInfo storeItem = AssetManager.Manager.getItemByName(itemName);
                        
                        // If not found, try to convert short command to full item name
                        if (storeItem == null)
                        {
                            var shortToFullMapping = commandHandler.shortCommands.FirstOrDefault(kvp => 
                                kvp.Value.Equals(itemName, StringComparison.OrdinalIgnoreCase));
                            
                            if (!shortToFullMapping.Equals(default(KeyValuePair<string, string>)))
                            {
                                string fullItemName = shortToFullMapping.Key;
                                storeItem = AssetManager.Manager.getItemByName(fullItemName);
                            }
                        }
                        if (storeItem != null)
                        {
                            // Check for product conversions (like Rainbow CAW)
                            string finalItemName = storeItem.name;
                            try
                            {
                                // Get converted item name based on player's purchases
                                finalItemName = await ProductPurchaseManager.GetConvertedItemName(player._alias, storeItem.name);
                                
                                // If conversion happened, get the new item
                                if (!finalItemName.Equals(storeItem.name, StringComparison.OrdinalIgnoreCase))
                                {
                                    ItemInfo convertedItem = AssetManager.Manager.getItemByName(finalItemName);
                                    if (convertedItem != null)
                                    {
                                        storeItem = convertedItem;
                                        //player.sendMessage(0, string.Format("&Converted to {0}! (Premium Product)", finalItemName));
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine(string.Format("Error checking product conversion for {0}: {1}", player._alias, ex.Message));
                                // Continue with original item if conversion fails
                            }
                                      
                            // Determine if the command specifies fixed quantity or additive quantity
                            bool isFixed = quantitySpecifier.StartsWith("#");
                            int quantity = int.Parse(quantitySpecifier.TrimStart('#'));

                            if (isFixed)
                            {
                                // Fixed quantity logic: Match the exact quantity, removing excess if necessary
                                int currentQuantity = player.getInventoryAmount(storeItem.id);

                                if (currentQuantity < quantity)
                                {
                                    // Award the difference to reach the desired quantity
                                    int amountToAdd = quantity - currentQuantity;
                                    player.inventoryModify(storeItem, amountToAdd);
                                }
                                else if (currentQuantity > quantity)
                                {
                                    // Remove the excess to match the desired quantity
                                    int amountToRemove = currentQuantity - quantity;
                                    player.inventoryModify(storeItem, -amountToRemove);
                                    player.sendMessage(0, "~" + amountToRemove + "x" + storeItem.name + " has been removed to match the desired quantity of " + quantity + ".");
                                }
                            }
                            else
                            {
                                // Additive quantity logic: Just add the amount to inventory
                                player.inventoryModify(storeItem, quantity);
                            }
                            
                            // Check if this is a powercell purchase and handle energy addition
                            bool isPowercell = itemName.Equals("cellh", StringComparison.OrdinalIgnoreCase) ||
                                             itemName.Equals("cellm", StringComparison.OrdinalIgnoreCase) ||
                                             itemName.Equals("celll", StringComparison.OrdinalIgnoreCase) ||
                                             itemName.Equals("heavy powercell", StringComparison.OrdinalIgnoreCase) ||
                                             itemName.Equals("medium powercell", StringComparison.OrdinalIgnoreCase) ||
                                             itemName.Equals("light powercell", StringComparison.OrdinalIgnoreCase);

                            // Add to the player's energy the amount from the 'extraCapacity' property on the item based on cell type
                            if (isPowercell)
                            {
                                // Map shortened names to full names if needed
                                string fullItemName = itemName;
                                if (itemName.Equals("cellh", StringComparison.OrdinalIgnoreCase))
                                    fullItemName = "Heavy PowerCell";
                                else if (itemName.Equals("cellm", StringComparison.OrdinalIgnoreCase))
                                    fullItemName = "Medium PowerCell";
                                else if (itemName.Equals("celll", StringComparison.OrdinalIgnoreCase))
                                    fullItemName = "Light PowerCell";
                                
                                // Get the actual powercell item with the proper name
                                ItemInfo actualItem = storeItem;
                                if (fullItemName != itemName)
                                    actualItem = AssetManager.Manager.getItemByName(fullItemName);
                                
                                // Get the item info for the powercell's extraCapacity property
                                ItemInfo.UtilityItem powercell = actualItem as ItemInfo.UtilityItem;
                                if (powercell != null)
                                {
                                    int energyToAdd = powercell.extraCapacity;
                                    int currentEnergy = player._state.energy;
                                    player.setEnergy((short)Math.Min(1000, currentEnergy + energyToAdd));
                                    //player.sendMessage(0, string.Format("~{0} energy added to your energy.", energyToAdd));
                                }
                            }
                        }
                        else
                        {
                            player.sendMessage(-1, "Item '" + itemName + "' not found.");
                        }
                    }
                }
                Dictionary<string, int> conversions = GetChampionConversionsForPlayer(player);
                if (conversions != null)
                {
                    bool autoEnabled = false;
                    if (_autoConvertEnabled.TryGetValue(player, out autoEnabled) && autoEnabled && isChampEnabled)
                    {
                        // Convert any eligible items in the player's inventory.
                        ConvertChampItems(player);
                    }
                }
                
                // Also check for product purchase conversions (like Rainbow CAW)
                await ConvertProductPurchaseItems(player);
                
                // Save all builds (both preset builds and custom item lists) for auto buy
                // Always update the persistent build with the new one - this allows overwriting previous builds
                string dummy;
                persistentBuilds.TryRemove(player._alias, out dummy);
                persistentBuilds.TryAdd(player._alias, buildName); // Save the build string (preset name or custom items)
            }
            else
            {
                player.sendMessage(-1, "You cannot purchase builds from this location");
            }
            return;
        }

        private void WipeInventory(Player player, string payload)
        {
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
            if (terrainID == 4 || terrainID == 3 || terrainID == 1 || terrainID == 2 || player.IsSpectator){
                player.resetInventory(true);
                player.sendMessage(0, "Your inventory has been wiped.");
            } else {
                player.sendMessage(0, "Cannot wipe inventory from this location.");
            }
            return;
        }

        // Dictionary to remember the last used build for each player
        private Dictionary<Player, string> lastUsedBuild = new Dictionary<Player, string>();

        // Wipes inventory, then buys the build
        private async Task WipeAndBuy(Player player, string buildName, bool ignoreStoreCheck = false)
        {
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
            if (terrainID == 4 || terrainID == 3 || terrainID == 1 || terrainID == 2 || player.IsSpectator || ignoreStoreCheck){
                // Take note of the items and their quantities before resetting the inventory
                Dictionary<int, int> itemsToGiveBack = new Dictionary<int, int>();
                HashSet<int> itemsToDeprive = new HashSet<int> { 2005, 2007, 2009, 9, 10, 11 };
                foreach (int itemID in itemsToDeprive)
                {
                    int currentCount = player.getInventoryAmount(itemID);
                    itemsToGiveBack.Add(itemID, currentCount);
                }

                player.resetInventory(true);
                player.sendMessage(0, "Your inventory has been wiped.");

                // Give back the items and their quantities after resetting the inventory
                foreach (var item in itemsToGiveBack)
                {
                    ItemInfo itemInfo = player._server._assets.getItemByID(item.Key);
                    if (itemInfo != null)
                    {
                        player.inventoryModify(itemInfo, item.Value);
                    }
                }
            } else {
                player.sendMessage(0, "Cannot wipe inventory from this location.");
                return;
            }

            // Handle the case where buildName is "random"
            if (string.IsNullOrWhiteSpace(buildName) || buildName.ToLower() == "random")
            {
                await HandleBuildCommand(player, "random");
                return;
            }

            if (ignoreStoreCheck){
                await HandleBuildCommand(player, buildName, true);
            } else {
                await HandleBuildCommand(player, buildName);
            }
            return;
        }

        // Wipes inventory, buys the build, and fills up all possible ammo types to their maximum
        private async Task WipeBuyAndMaxAmmo(Player player, string buildName)
        {
            int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
            if (terrainID == 4 || terrainID == 3 || terrainID == 1 || terrainID == 2 || player.IsSpectator){
                // Take note of the items and their quantities before resetting the inventory
                Dictionary<int, int> itemsToGiveBack = new Dictionary<int, int>();
                HashSet<int> itemsToDeprive = new HashSet<int> { 2005, 2007, 2009, 2, 9, 10, 11 };
                foreach (int itemID in itemsToDeprive)
                {
                    int currentCount = player.getInventoryAmount(itemID);
                    itemsToGiveBack.Add(itemID, currentCount);
                }

                player.resetInventory(true);
                player.sendMessage(0, "Your inventory has been wiped.");

                // Give back the items and their quantities after resetting the inventory
                foreach (var item in itemsToGiveBack)
                {
                    ItemInfo itemInfo = player._server._assets.getItemByID(item.Key);
                    if (itemInfo != null)
                    {
                        player.inventoryModify(itemInfo, item.Value);
                    }
                }
            } else {
                player.sendMessage(0, "Cannot wipe inventory from this location.");
                return;
            }
            
            // Store build name
            lastUsedBuild[player] = buildName.ToLower();
            //player.sendMessage(0, "~Build name stored: " + buildName.ToLower());

            // Handle the case where buildName is "random"
            if (string.IsNullOrWhiteSpace(buildName) || buildName.ToLower() == "random")
            {

                await HandleBuildCommand(player, "random");
                MaxOutAmmo(player);
                return;
            }

            // Buy the build
            await HandleBuildCommand(player, buildName);

            // Fill up all possible ammo types to their maximum
            MaxOutAmmo(player);
            return;
        }

        // Fill the player's inventory with the maximum allowed ammo for each type in maxAmmoQuantities
        private void MaxOutAmmo(Player player)
        {
            foreach (var ammoType in maxAmmoQuantities)
            {
                string ammoName = ammoType.Key;
                int maxQuantity = ammoType.Value;

                // Get the current quantity the player has for this ammo type
                ItemInfo ammoItem = AssetManager.Manager.getItemByName(ammoName);
                if (ammoItem != null)
                {
                    int currentQuantity = player.getInventoryAmount(ammoItem.id);

                    // Calculate how much more ammo to give to reach the max
                    int amountToAdd = maxQuantity - currentQuantity;

                    if (amountToAdd > 0)
                    {
                        player.inventoryModify(ammoItem, amountToAdd);
                        //player.sendMessage(0, "~Maxed out ammo: Awarded " + amountToAdd + "x" + ammoName + ".");
                    }
                    else
                    {
                        //player.sendMessage(0, "~Ammo already maxed: " + currentQuantity + "x" + ammoName + ".");
                    }
                }
                else
                {
                    player.sendMessage(-1, "@Ammo type '" + ammoName + "' not found.");
                }
            }
            return;
        }

        private void DropUnusedItems(Player player, string buildName)
        {
            // Check if the player is in spectator mode, dead, and not null
            if (player.IsDead || player.IsSpectator)
            {
                player.sendMessage(-1, "Cannot be in spec or dead while attempting to drop items.");
                return;
            }

            // If no build name is provided, use the last used build
            if (string.IsNullOrWhiteSpace(buildName))
            {
                if (lastUsedBuild.ContainsKey(player))
                {
                    // Retrieve the last used build
                    buildName = lastUsedBuild[player];
                }
                else
                {
                    player.sendMessage(-1, "Please specify a build name or use a build first.");
                    return;
                }
            }

            // Convert buildName to lowercase for case-insensitive matching
            buildName = buildName.ToLower();

            // Check if the build exists
            if (buildSets.ContainsKey(buildName))
            {

                var buildData = buildSets[buildName];
                List<Tuple<string, ushort>> buildItems = buildData.Item1;

                // Track the ammo used by the build
                Dictionary<string, int> usedAmmo = new Dictionary<string, int>();

                // Iterate through the build items and record their quantities
                foreach (var item in buildItems)
                {
                    // Normalize the ammo name for case-insensitive matching
                    string ammoName = item.Item1.ToLower();

                    // Only consider items listed in the maxAmmoQuantities dictionary
                    if (maxAmmoQuantities.ContainsKey(ammoName))
                    {
                        usedAmmo[ammoName] = item.Item2;
                    }
                }

                // Collect excess ammo to drop
                List<Tuple<string, int>> itemsToDrop = new List<Tuple<string, int>>();

                // Iterate through all items in maxAmmoQuantities
                foreach (var ammoType in maxAmmoQuantities.Keys)
                {
                    // Normalize the ammo type for case-insensitive matching
                    string normalizedAmmoType = ammoType.ToLower();

                    // Find the item in the player's inventory, if it exists
                    var inventoryItem = player._inventory.Values.FirstOrDefault(i => i.item.name.ToLower() == normalizedAmmoType);

                    // If the item is in the player's inventory
                    if (inventoryItem != null)
                    {
                        int currentQuantity = inventoryItem.quantity;

                        // Get the quantity used by the build, if any
                        int usedQuantity = usedAmmo.ContainsKey(normalizedAmmoType) ? usedAmmo[normalizedAmmoType] : 0;

                        // Calculate excess
                        int excess = currentQuantity - usedQuantity;

                        // If the item is not in the build, drop all of it
                        if (usedQuantity == 0 && currentQuantity > 0)
                        {
                            itemsToDrop.Add(new Tuple<string, int>(normalizedAmmoType, currentQuantity));
                        }
                        // If the item is in the build but there's excess, drop the excess
                        else if (excess > 0)
                        {
                            itemsToDrop.Add(new Tuple<string, int>(normalizedAmmoType, excess));
                        }
                    }
                }

                // Now drop all the collected items
                foreach (var item in itemsToDrop)
                {
                    string ammoType = item.Item1;
                    int excess = item.Item2;

                    // Find the item in the player's inventory
                    var inventoryItem = player._inventory.Values.FirstOrDefault(i => i.item.name.ToLower() == ammoType);

                    if (inventoryItem != null)
                    {
                        // Spawn the item on the map at the player's location
                        if (!player._arena.exists("Player.ItemDrop") || (bool)player._arena.callsync("Player.ItemDrop", false, player, inventoryItem.item, excess))
                        {
                            // Drop the item onto the map based on terrain settings and nearby item stacking
                            //if (player._arena.getTerrain(player._state.positionX, player._state.positionY).prizeExpire > 1)
                            //{
                                if (player._arena.getItemCountInRange(inventoryItem.item, player._state.positionX, player._state.positionY, 150) > 0)
                                {
                                    // Stack with nearby items if present
                                    player._arena.itemStackSpawn(inventoryItem.item, (ushort)excess, player._state.positionX, player._state.positionY, 50, player);
                                }
                                else
                                {
                                    // Spawn a new item drop
                                    player._arena.itemSpawn(inventoryItem.item, (ushort)excess, player._state.positionX, player._state.positionY, 0, (int)player._team._id, player);
                                }

                                // Remove the excess from the player's inventory
                                player.inventoryModify(inventoryItem.item, -excess);
                                // player.sendMessage(0, "~Dropped " + excess + "x" + inventoryItem.item.name + " (excess).");
                            //}
                        }
                    }
                }
            }
            else
            {
                player.sendMessage(-1, "Build not found. Available builds are: " + string.Join(", ", buildSets.Keys));
            }
            return;
        }

        public void CountItemsOnSpecificTerrain(Arena arena)
        {
            // Define item IDs of interest
            HashSet<int> targetItemIDs = new HashSet<int> { 2005, 2009 }; // Tox, Tso, Pandora's

            // Define counters for each dropship area
            Dictionary<string, Dictionary<int, int>> dropshipItemCounts = new Dictionary<string, Dictionary<int, int>>()
            {
                { "Titan Dropship", new Dictionary<int, int> { { 2005, 0 }, { 2009, 0 } } },
                { "Collective Dropship", new Dictionary<int, int> { { 2005, 0 }, { 2009, 0 } } }
            };

            // Iterate through all items currently in the arena
            foreach (var item in arena._items.Values)
            {
                // Fetch the item's current position and multiply by 16
                int itemX = item.positionX;
                int itemY = item.positionY;

                // Check the terrain at the item's position
                int terrainID = arena.getTerrainID(itemX, itemY);

                // Only consider items on terrain ID 4
                if (terrainID == 4 && targetItemIDs.Contains(item.item.id))
                {
                    int itemQuantity = item.quantity; // Assuming quantity holds the correct value

                    // Check if the item is within Titan Dropship boundaries
                    if (itemX >= 608 * 16 && itemX <= 699 * 16 && itemY >= 440 * 16 && itemY <= 478 * 16)
                    {
                        dropshipItemCounts["Titan Dropship"][item.item.id] += itemQuantity;
                    }
                    // Check if the item is within Collective Dropship boundaries
                    else if (itemX >= 607 * 16 && itemX <= 699 * 16 && itemY >= 591 * 16 && itemY <= 633 * 16)
                    {
                        dropshipItemCounts["Collective Dropship"][item.item.id] += itemQuantity;
                    }
                }
            }

            // Send the counts as arena messages
            string titanMessage = string.Format(
                "~Titan Dropship Mineral Counts: TOX: {0}, TSO: {1}",
                dropshipItemCounts["Titan Dropship"][2009],
                dropshipItemCounts["Titan Dropship"][2005]
            );

            string collectiveMessage = string.Format(
                "@Collective Dropship Mineral Counts: TOX: {0}, TSO: {1}",
                dropshipItemCounts["Collective Dropship"][2009],
                dropshipItemCounts["Collective Dropship"][2005]
            );

            // Send the formatted messages to the arena
            arena.sendArenaMessage(titanMessage);
            arena.sendArenaMessage(collectiveMessage);
            return;
        }

        /*//////////////////////////////////////////////////
        // Class change announcement logic
        *///////////////////////////////////////////////////

        // Dictionaries to track the last skill name, last announcement time, and to track if a player has ever been on a non-SPEC team for each player
        private Dictionary<Player, string> playerLastSkillNames = new Dictionary<Player, string>();
        
        private Dictionary<Player, DateTime> lastAnnouncementTimes = new Dictionary<Player, DateTime>();
        Dictionary<Player, bool> playerHasPlayed = new Dictionary<Player, bool>();

        // Grace period for announcements (in seconds)
        private const int AnnouncementGracePeriod = 30;

        // Helper method to retrieve the primary skill name from the player's skills dictionary
        private string GetPrimarySkillName(Player player)
        {
            // Assuming the primary skill is the first entry or has a specific key
            if (player._skills != null && player._skills.Count > 0)
            {
                // Get the first skill from the dictionary
                foreach (var skillItem in player._skills.Values)
                {
                    return skillItem.skill.Name; // Access the Name property from SkillInfo
                }
            }
            return "Unknown"; // Default to "Unknown" if no skill is found
        }
        // Define the non-expiring item IDs
        HashSet<int> nonExpiringItemIDs = new HashSet<int> { 2005, 2007, 2009, 2, 9, 10, 11 }; // Tox, Tso, Steron Injection, AutoGuns (premades)

        public void pollItemExpiration()
        {
            // Iterate through all items currently in the arena that are within the x/y of 610,440 > 700,640 and isn't alright at a tickExpire of 0
            foreach (var item in arena._items.Values.Where(i => nonExpiringItemIDs.Contains(i.item.id) && i.positionX >= (610 * 16) && i.positionX <= (700 * 16) && i.positionY >= (440 * 16) && i.positionY <= (640 * 16) && i.tickExpire != 0)) 
            {
                //debug message and ++ iteration count so I know how many items its having to loop through
                //arena.sendArenaMessage(string.Format("Item ID {0}: {1} drops", item.item.id, item.quantity));
                item.tickExpire = 0;
            }

            // Delete minerals (2005, 2007, 2009) if the quantity stack is less than 4
            // Create a list of items to remove to avoid modifying collection during enumeration
            var itemsToRemove = arena._items.Values
                .Where(i => (i.item.id == 2005 || i.item.id == 2007 || i.item.id == 2009) && i.quantity <= 4)
                .ToList();

            //More items to remove, all items that are quantity of 1 except item ID 23 (Sentry), 15 (Energizer), 47 (Stim Pack), 1 (Hoverboard), Autoguns, repulsor charge, steron injection
            var itemsToRemove2 = arena._items.Values
                .Where(i => i.quantity == 1 && !new[] { 23, 15, 47, 1, 2, 1049, 9, 10, 11 }.Contains(i.item.id))
                .ToList();

            itemsToRemove.AddRange(itemsToRemove2);

            //Next set of items to remove is Ammo MG stacks less than 50
            var itemsToRemove3 = arena._items.Values
                .Where(i => i.item.id == 2001 && i.quantity < 50)
                .ToList();

            itemsToRemove.AddRange(itemsToRemove3);

            // Now safely remove the items
            foreach (var item in itemsToRemove)
            {
                //Update the players of the status..
                Helpers.Object_ItemDropUpdate(arena.Players, item.id, 0);
                arena._items.Remove(item.id);
            }
            return;
        }

        public void pollSkillCheck()
        {
            // Loop through each player in the arena
            if (!arena._name.Contains("Arena 1") && !arena._name.Contains("Public1"))
            {
                foreach (Player player in arena.Players)
                {
                    // Initialize tracking for new players if needed (now handled by GameStats)
                    if (!player.IsSpectator && gameStats != null)
                    {
                        gameStats.OnPlayerClassSwap(player);
                    }

                    // We need to get the current skill name from the player's skills dictionary
                    // string currentSkillName = GetPrimarySkillName(player);

                    // // Get the player's current team name
                    // string currentTeamName = player._team != null ? player._team._name : "SPEC";

                    // // Check if the player's skill name has changed
                    // if (!playerLastSkillNames.ContainsKey(player) || playerLastSkillNames[player] != currentSkillName)
                    // {
                    //     // Check if the player has ever been on a non-SPEC team
                    //     if (!playerHasPlayed.ContainsKey(player))
                    //     {
                    //         playerHasPlayed[player] = false; // Default to false if not tracked yet
                    //     }

                    //     // If the player is currently on a non-SPEC team, mark them as having played
                    //     if (currentTeamName != "spec")
                    //     {
                    //         playerHasPlayed[player] = true; // Mark the player as having played
                    //     }

                    //     // Only announce class changes for players who have ever been on a non-SPEC team
                    //     if (playerHasPlayed[player])
                    //     {
                    //         // Update the dictionary with the new skill name
                    //         playerLastSkillNames[player] = currentSkillName;

                    //         // Check if the player is within the grace period for announcements
                    //         bool withinGracePeriod = lastAnnouncementTimes.ContainsKey(player) &&
                    //                                    (DateTime.Now - lastAnnouncementTimes[player]).TotalSeconds < AnnouncementGracePeriod;

                    //         // Announce the player's skill change if it is Infiltrator, not within the grace period, 
                    //         // and the player is not on team "np"
                    //         if (currentSkillName == "Infiltrator" && !withinGracePeriod && currentTeamName.ToLower() != "np")
                    //         {
                    //             // Make the actual announcement
                    //             if (player._alias == "YAH" || player._alias == "JACKIE"){
                    //                 arena.sendArenaMessage("#SWITCHING CLASS IN UPPERCASE ------ TEAM " + currentTeamName.ToUpper() + " ------ " + player._alias + ".", 14);
                    //             } else {
                    //                 arena.sendArenaMessage("#CLOAKERS ------ TEAM " + currentTeamName + " ------ " + player._alias + ".", 14);
                    //             }

                    //             // Send another arena message 5 times every 1 second
                    //             // for (int i = 0; i < 5; i++)
                    //             // {
                    //             //     arena.sendArenaMessage("#HEY YOU AUTISTIC FUCK, TURN YOUR ES ON", 3);
                    //             //     System.Threading.Thread.Sleep(1000);
                    //             // }

                    //             // Update the last announcement time for the player
                    //             lastAnnouncementTimes[player] = DateTime.Now;
                    //         }
                    //     }
                    // }
                }
            }
            return;
        }

        public void pollFlagBug()
        {
            // Loop through each flag in the current map
            foreach (var flag in currentMap.Flags)
            {
                // Retrieve the flag object from the arena using the flag's nameinf
                var fs = arena.getFlag(flag.Item1);  // flag.Item1 is the flag name

                if (flag.Item1.Equals("sdFlag", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (fs != null)
                {
                    // Check if the flag's current position is (0, 0)
                    // If 0,0, its bugged, lets respawn it to its default position!
                    if (fs.posX == 0 && fs.posY == 0 && fs.carrier == null)
                    {
                        // The player is carrying this flag and its coordinates are (0, 0)
                        // Reset the flag's position to its original coordinates
                        fs.posX = (short)(flag.Item2 * 16);  // flag.Item2 is X coordinate
                        fs.posY = (short)(flag.Item3 * 16);  // flag.Item3 is Y coordinate

                        fs.bActive = true;      // Ensure the flag is active
                        fs.carrier = null;      // Clear the carrier
                        fs.team = null;         // Reset the team if necessary

                        // Update the flag's status for all players
                        Helpers.Object_Flags(arena.Players, fs);

                        // Since a player can carry only one flag, we can exit the loop
                        break;
                    }
                }
            }
            return;
        }

        /// <summary>
        /// Smart polling for dueling tiles - only checks when there are potential duelers
        /// </summary>
        public void pollDuelingTiles()
        {
            try
            {
                // Only check if there are at least 2 players who could potentially duel
                var potentialDuelers = arena.PlayersIngame.Where(p => 
                    !GetPrimarySkillName(p).Equals("Dueler", StringComparison.OrdinalIgnoreCase) || 
                    GetPrimarySkillName(p).Equals("Dueler", StringComparison.OrdinalIgnoreCase)).ToList();
                
                if (potentialDuelers.Count < 2)
                    return; // Not enough players to duel
                
                // Check each player's position for tile proximity
                foreach (var player in potentialDuelers)
                {
                    if (player._state != null)
                    {
                        // Convert player position to tile coordinates
                        short tileX = (short)(player._state.positionX / 16);
                        short tileY = (short)(player._state.positionY / 16);
                        
                        // Use the existing dueling system's tile handling
                        Task.Run(async () => {
                            try
                            {
                                await CTFGameType.DuelingSystem.HandleTileStep(player, tileX, tileY);
                                CTFGameType.DuelingSystem.HandleTileLeave(player, tileX, tileY);
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine(string.Format("Error in pollDuelingTiles for player {0}: {1}", 
                                    player._alias, ex.Message));
                            }
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(string.Format("Error in pollDuelingTiles: {0}", ex.Message));
            }
        }

        private DateTime lastPollCheckTime = DateTime.MinValue;
        private const double pollCheckInterval = 1.0; // Interval in seconds

        /// <summary>
        /// CTF Script poll called by our arena
        /// </summary>
            public bool poll()
            {
            //Log.write(TLog.Error, "Polling arena.");

            int now = Environment.TickCount;
            //int seconds = ((Environment.TickCount - arena._tickGameStarted) / 1000);

            // Check if it's time to run less frequent polling functions
            if ((DateTime.Now - lastPollCheckTime).TotalSeconds >= pollCheckInterval)
            {
                pollItemExpiration();
                pollSkillCheck();
                pollFlagBug();
                pollDuelingTiles(); // Check for players on dueling tiles
                CheckVotingTimeout(); // Check voting timeout
                
                // Check for teleport beacon activations
                if (_championEffects != null)
                    _championEffects.CheckTeleportBeaconActivations();
                
                // Update OvD Automation
                if (_ovdAutomation != null)
                    _ovdAutomation.Update();
                
                // Process pending summon requests
                ProcessPendingSummonRequests();
                    
                lastPollCheckTime = DateTime.Now;
                // Gladiator event polling
                if (currentEventType == EventType.Gladiator)
                {
                    CheckGladiatorVictory();
                }
                if (currentEventType == EventType.SUT)
                {
                    CheckSUTVictory();
                }
                // TDM event polling
                // if (currentEventType == EventType.TDM && _tdmInstance != null)
                // {
                //     // Handle bot spawning for TDM
                //     HandleTDMBotSpawning(now);
                //     
                //     // Manage existing bots
                //     ManageTDMBots(now);
                //     
                //     if (_tdmInstance.HasFinished)
                //     {
                //         arena.sendArenaMessage("Team Deathmatch event has ended. Returning to CTF gameplay.", 1);
                //         EndEvent();
                //     }
                // }
                
                // ADDED: Bot management for regular CTF mode (not just TDM)
                // if (currentEventType == EventType.Standard || currentEventType == EventType.None)
                // {
                //     // Handle bot spawning and management for regular CTF
                //     HandleCTFBotSpawning(now);
                //     ManageCTFBots(now);
                // }
                
                //arena.sendArenaMessage(string.Format("Elapsed game time: {0} seconds", seconds));
            }

            /*//////////////////////////////////////////////////
            // Game state management
            //////////////////////////////////////////////////*/

            // Check if it's time to start the first overtime and if it is not already active
            if (overtimeStart != 0 && Environment.TickCount >= overtimeStart && !isSD)
            {
                isSD = true;
                arena.sendArenaMessage("&Overtime triggered. 50% Reduced healing on both Medikits. Engineer Repairs reduced to 50 hp (unless all 5 flags held)", 30);

                overtimeStart = Environment.TickCount;

                // Schedule second overtime
                //secondOvertimeStart = overtimeStart + 10000; // 10 seconds for testing
                secondOvertimeStart = overtimeStart + (15 * 60000); // 15 minutes

                overtimeStart = 0; // Reset to avoid multiple triggers
            }

            // Check if it's time to start the second overtime
            if (isSD && !isSecondOvertime && secondOvertimeStart != 0 && Environment.TickCount >= secondOvertimeStart)
            {
                isSecondOvertime = true;
                arena.sendArenaMessage("&Second Overtime triggered. 75% Reduced healing on both Medikits. Engineer Repairs reduced to 40 hp (unless all 5 flags held). ", 30);

                secondOvertimeStart = 0; // Reset to avoid multiple triggers
            }

            if (now - lastGameCheck < Arena.gameCheckInterval)
                return true;
            lastGameCheck = now;

            if (gameState == GameState.Init)
            {
                if (arena.PlayersIngame.Count() < minPlayers)
                {
                    gameState = GameState.NotEnoughPlayers;
                }
            }

            switch (gameState)
            {
                case GameState.NotEnoughPlayers:
                    arena.setTicker(1, 3, 0, "Not Enough Players");
                    gameState = GameState.Init;
                    break;
                case GameState.Transitioning:
                    //Do nothing while we wait
                    break;
                case GameState.ActiveGame:
                    PollCTF(now);
                    break;
                case GameState.Init:
                    Initialize();
                    break;
                case GameState.PreGame:
                    PreGame();
                    break;
                case GameState.PostGame:
                    gameState = GameState.Init;
                    break;
            }
            return true;
        }

        private void OnFlagChange(Arena.FlagState flag)
        {
            Team victory = flag.team;

            //Does this team now have all the flags?
            foreach (Arena.FlagState fs in arena._flags.Values)
            {
                if (fs.bActive && fs.team != flag.team)
                {   //Not all flags are captured yet
                    victory = null;
                    break;
                }
            }

            if (!gameWon)
            {   //All flags captured?
                if (victory != null)
                {   //Yep
                    winningTeamTick = (Environment.TickCount + (victoryHoldTime * 10));
                    winningTeamNotify = 0;
                    winningTeam = victory;
                    flagMode = CTFMode.XSeconds;
                }
                else
                {   //Aborted?
                    if (winningTeam != null)
                    {   //Yep
                        winningTeam = null;
                        winningTeamTick = 0;
                        flagMode = CTFMode.Aborted;
                    }
                }
            }
        }



        #endregion

        #region Script Functions

       public static void scrambleSpecificTeams(Arena arena, List<Team> teamsToScramble, bool alertArena, Script_CTF script)
        {
            // Ensure the arena and teams are valid
            if (arena == null || teamsToScramble == null || teamsToScramble.Count != 2)
                throw new ArgumentException("Invalid arena or teams passed.");

            List<Player> playersToScramble = new List<Player>();

            // Manually collect players on the teamsToScramble
            foreach (var player in arena.PlayersIngame) // Assuming PlayersIngame gives all players in the arena
            {
                // Ensure player is on one of the teamsToScramble and is not a Dueler
                if (teamsToScramble.Contains(player._team) && 
                    !script.GetPrimarySkillName(player).Equals("Dueler", StringComparison.OrdinalIgnoreCase))
                {
                    playersToScramble.Add(player); // Add player to the list
                }
            }

            // Shuffle players randomly using arena's random generator
            var shuffledPlayers = playersToScramble.OrderBy(plyr => arena._rand.Next(0, 500)).ToList();

            // Distribute players back into the two teams evenly
            for (int i = 0; i < shuffledPlayers.Count; i++)
            {
                Team team = teamsToScramble[i % teamsToScramble.Count]; // Rotate between teamA and teamB
                if (shuffledPlayers[i]._team != team) // Only move if the player isn't already on the team
                {
                    team.addPlayer(shuffledPlayers[i]);
                }
            }

            foreach (var player in arena.PlayersIngame)
            {
                if (script.currentEventType == EventType.MiniTP){
                    Player playerCopy = player; // Create a copy to use in timer callback
                    System.Threading.Timer timer = null;
                    timer = new System.Threading.Timer((state) =>
                    {
                        if (playerCopy._team._name.Contains("Titan"))
                            script.WarpPlayerToRange(playerCopy, 654, 654, 518, 518);
                        else if (playerCopy._team._name.Contains("Collective"))
                            script.WarpPlayerToRange(playerCopy, 648, 648, 565, 565);
                        timer.Dispose();
                    }, null, 3000, System.Threading.Timeout.Infinite);
                }
            }

            // Notify players of the scramble
            if (alertArena)
            {
                arena.sendArenaMessage("Teams have been scrambled between " + teamsToScramble[0]._name + " and " + teamsToScramble[1]._name + "!");
            }
        }

        private bool SpawnMapPlayers()
        {
            if (currentMap != null)
            {
                // Retrieve teams from the current map
                var teamA = arena.getTeamByName(currentMap.TeamNames[0]);
                var teamB = arena.getTeamByName(currentMap.TeamNames[1]);

                foreach (var player in arena.PlayersIngame)
                {
                    string playerSkill = this.GetPrimarySkillName(player);
                    if (playerSkill.Equals("Dueler", StringComparison.OrdinalIgnoreCase))
                    {
                        continue; // Skip Dueler players
                    } 
                    else 
                    {
                        // Assign players evenly between teamA and teamB
                        if (teamA.ActivePlayerCount < teamB.ActivePlayerCount)
                        {
                            teamA.addPlayer(player);
                        }
                        else
                        {
                            teamB.addPlayer(player);
                        }
                    }
                    // if (currentEventType == EventType.MiniTP){
                    //     if (player._team._name.Contains("Titan"))
                    //         WarpPlayerToRange(player, 654, 654, 518, 518);
                    //     else if (player._team._name.Contains("Collective")) 
                    //         WarpPlayerToRange(player, 648, 648, 565, 565);
                    //     return false;
                    // }
                }

                // Scramble only teamA and teamB, leaving other teams unaffected
                scrambleSpecificTeams(arena, new List<Team> { teamA, teamB }, true, this);

                return true;
            }

            return false; // In case currentMap is null
        }

        private bool SpawnMapFlags()
        {
            foreach(var flag in currentMap.Flags)
            {
                var fs = arena.getFlag(flag.Item1);

                if (fs == null)
                {
                    return false;
                }

                // Check if the flag is "sdFlag" and set it inactive
                if (flag.Item1.Equals("sdFlag", StringComparison.OrdinalIgnoreCase))
                {
                    fs.bActive = false;  // Make sure sdFlag is inactive by default
                    fs.posX = 0;         // You can position it off the map or at a default position
                    fs.posY = 0;
                    continue;            // Skip the rest of the logic for sdFlag
                }

                bool bActive = true;

                if (currentMap.RandomizeFlagLocations)
                {
                    bActive = RandomizeFlagLocation(fs);
                }
                else
                {
                    fs.posX = (short)(flag.Item2 * 16);
                    fs.posY = (short)(flag.Item3 * 16);
                }
                
                fs.bActive = bActive;
                fs.team = null;
                fs.carrier = null;

                Helpers.Object_Flags(arena.Players, fs);
            }

            return true;
        }

        //Spawn first flag
        private bool SpawnMapFlag()
        {
            var flag = currentMap.Flags[0];
            var fs = arena.getFlag(flag.Item1);
                
            if (fs == null)
            {
                return false;
            }

            bool bActive = true;

            if (currentMap.RandomizeFlagLocations)
            {
                bActive = RandomizeFlagLocation(fs);
            }
            else
            {
                fs.posX = (short)(flag.Item2 * 16);
                fs.posY = (short)(flag.Item3 * 16);
            }
               
            fs.bActive = bActive;
            fs.team = null;
            fs.carrier = null;

            Helpers.Object_Flags(arena.Players, fs);
            
            return true;
        }

        ///////////////////////////////////////////////////
        // Script Functions
        ///////////////////////////////////////////////////
        /// <summary>
        /// Resets all variables and initializes a new game state
        /// </summary>
        private void Initialize()
        {
            winningTeamNotify = 0;
            winningTeamTick = 0;
            winningTeam = null;
            gameWon = false;

            //We are officially initialized, pregame it.
            gameState = GameState.PreGame;
        }

        /// <summary>
        /// Our waiting period between games
        /// </summary>
        private void PreGame()
        {
            gameState = GameState.Transitioning;

            //Sit here until timer runs out
            arena.setTicker(1, 3, preGamePeriod * 100, "Next game: ",
                    delegate ()
                    {	//Trigger the game start
                        arena.gameStart();
                    }
            );
        }

        /// <summary>
        /// Resets our tickers and gamestate
        /// </summary>
        private void Reset()
        {
            //Clear any tickers that might be still active
            if (gameState == GameState.Transitioning)
            {
                arena.setTicker(4, 3, 0, ""); //Next game
            }
            arena.setTicker(4, 1, 0, ""); //Victory in x:x

            //Reset
            gameState = GameState.Init;
        }

        /// <summary>
        /// Did someone win yet? If so, set the announcement
        /// </summary>
        private void CheckWinner(int now)
        {
            //See if someone is winning
            if (winningTeam != null)
            {
                //Has XSeconds been called yet?
                if (flagMode == CTFMode.XSeconds)
                { return; }

                int tick = (int)Math.Ceiling((winningTeamTick - now) / 1000.0f);
                switch (tick)
                {
                    case 10:
                        flagMode = CTFMode.TenSeconds;
                        break;
                    case 30:
                        flagMode = CTFMode.ThirtySeconds;
                        break;
                    case 60:
                        flagMode = CTFMode.SixtySeconds;
                        break;
                    default:
                        if (tick <= 0)
                        {
                            flagMode = CTFMode.GameDone;
                        }
                        break;
                }
            }
        }

        private void SetNotifyBypass(int countdown)
        {   //If XSeconds matches one of these, it will bypass that call
            //so there is no duplicate Victory message
            switch (countdown)
            {
                case 10:
                    winningTeamNotify = 1;
                    break;
                case 30:
                    winningTeamNotify = 2;
                    break;
                case 60:
                    winningTeamNotify = 3;
                    break;
            }
        }

        /// <summary>
        /// Poll the flag state while checking for a winner
        /// </summary>
        private void PollCTF(int now)
        {
            //See if we have enough players to keep playing
            if (arena.PlayersIngame.Count() < minPlayers)
            {
                Reset();
            }
            else
            {
                CheckWinner(now);
            }

            // Periodically prepare game data for improved stats reliability (now handled by GameStats)
            if (gameStats != null)
            {
                // GameStats handles this automatically
            }

            int countdown = winningTeamTick > 0 ? (int)Math.Ceiling((winningTeamTick - now) / 1000.0f) : 0;
            switch (flagMode)
            {
                case CTFMode.Aborted:
                    arena.setTicker(4, 1, 0, "");
                    arena.sendArenaMessage("Victory has been aborted.", CFG.flag.victoryAbortedBong);
                    flagMode = CTFMode.None;
                    break;
                case CTFMode.TenSeconds:
                    //10 second win timer
                    if (winningTeamNotify == 1) //Been notified already?
                    { break; }
                    winningTeamNotify = 1;
                    arena.sendArenaMessage(string.Format("Victory for {0} in {1} seconds!", winningTeam._name, countdown), CFG.flag.victoryWarningBong);
                    flagMode = CTFMode.None;
                    break;
                case CTFMode.ThirtySeconds:
                    //30 second win timer
                    if (winningTeamNotify == 2) //Been notified already?
                    { break; }
                    winningTeamNotify = 2;
                    arena.sendArenaMessage(string.Format("Victory for {0} in {1} seconds!", winningTeam._name, countdown), CFG.flag.victoryWarningBong);
                    flagMode = CTFMode.None;
                    break;
                case CTFMode.SixtySeconds:
                    //60 second win timer
                    if (winningTeamNotify == 3) //Been notified already?
                    { break; }
                    winningTeamNotify = 3;
                    arena.sendArenaMessage(string.Format("Victory for {0} in {1} seconds!", winningTeam._name, countdown), CFG.flag.victoryWarningBong);
                    flagMode = CTFMode.None;
                    break;
                case CTFMode.XSeconds:
                    //Initial win timer upon capturing
                    SetNotifyBypass(countdown); //Checks to see if xSeconds matches any other timers
                    arena.setTicker(4, 1, CFG.flag.victoryHoldTime, "Victory in ");
                    arena.sendArenaMessage(string.Format("Victory for {0} in {1} seconds!", winningTeam._name, countdown), CFG.flag.victoryWarningBong);
                    flagMode = CTFMode.None;
                    break;
                case CTFMode.GameDone:
                    //Game is done
                    gameWon = true;
                    
                    // Send improved game end data with most played classes and all participants (now handled by GameStats)
                    if (gameStats != null)
                    {
                        // This is now handled in the EndGame method by GameStats
                    }
                    
                    arena.gameEnd();
                    break;
            }

            UpdateCTFTickers();
            UpdateKillStreaks();
            UpdateFlagCarryStats(now);
        }
        /// <summary>
        /// Handles a player's produce request
        /// </summary>
        [Scripts.Event("Player.Produce")]
        public bool playerProduce(Player player, Computer computer, VehInfo.Computer.ComputerProduct product)
        {
            string[] titlesToCheck = { "SciOps", "Sergeant", "Captain", "BioChem Trooper" };
            if (currentEventType == EventType.CTFX && titlesToCheck.Contains(product.Title)){
                ChangePlayerSkill(player, product.Title);
                player.resetInventory(true);
                WarpPlayerToRange(player, 985, 997, 1117, 1129);
                //return false;
            }
            return true;
        }

        // mined stat dictionary that holds list of teams and the count of TSO and TOX mined
        private Dictionary<string, int> minedStats = new Dictionary<string, int>();

        // Add stat method for tracking per team and per item type ("Tso" for 2005, "Tox" for 2009)
        private void AddStat(int itemId, int quantity, string teamName)
        {
            // Build the key based on item id: 2005 -> "Tso mined", 2009 -> "Tox mined"
            string key = (itemId == 2005) ? teamName + " Tso mined" : teamName + " Tox mined";
            if (!minedStats.ContainsKey(key))
                minedStats[key] = 0;
            minedStats[key] += quantity;
        }

        /// <summary>
        /// Triggered when a player requests to pick up an item
        /// </summary>
        [Scripts.Event("Player.ItemPickup")]
        public bool playerItemPickup(Player player, Arena.ItemDrop drop, ushort quantity)
        {
            var itemId = drop.item.id;
            var itemName = drop.item.name;

            // For item IDs 2005 (Tso) or 2009 (Tox), update the team's stat accordingly.
            if ((itemId == 2005 || itemId == 2009) && quantity == 5)
            {
                int terrainID = player._arena.getTerrainID(player._state.positionX, player._state.positionY);
                if (terrainID == 0 && (player._team._name.Contains("Titan") || player._team._name.Contains("Collective")))
                {
                    AddStat(itemId, quantity, player._team._name);
                    //arena.sendArenaMessage(string.Format("{0} has mined 5 {1}!", player._alias, itemName));
                }
            }

            // If tranq is picked up, and player has Subzero (Tranq) item, give them the Subzero (tranq) item instead (ID 1264)
            if (drop.item.id == 1113 && player._inventory.ContainsKey(1312))
            {
                player.inventoryModify(1264, quantity);
                player.sendMessage(0, "You have been given the Subzero (Tranq) item!");
                // destroy drop from arena
                player._arena._items.Remove(drop.id);
                Helpers.Object_ItemDropUpdate(player._arena.Players, (ushort)drop.item.id, (ushort)0);
                return false;
            }
            return true;
        }

        /// <summary>
        /// Triggered when a player attempts to use a warp item
        /// </summary>
        private Dictionary<ushort, int> summonedCounts = new Dictionary<ushort, int>();

        [Scripts.Event("Player.WarpItem")]
        public bool playerWarpItem(Player player, ItemInfo.WarpItem item, ushort targetPlayerID, short posX, short posY)
        {
            // if (item.warpMode == Assets.ItemInfo.WarpItem.WarpMode.Portal)
            // {

            // }

            // GetPrimarySkillName and if Combat Engineer, update computers to sync turret HP
            // if (GetPrimarySkillName(player) == "Combat Engineer" || 
            //     (arena.getPlayerById(targetPlayerID) != null && GetPrimarySkillName(arena.getPlayerById(targetPlayerID)) == "Combat Engineer"))
            // {
            //     foreach (Vehicle v in arena.Vehicles)
            //     {
            //         if (v is Computer)
            //         {
            //             Computer comp = (Computer)v;
            //             comp._sendUpdate = true;
            //             v.update(false); // Use consistent update method to preserve event system
            //         }
            //     }
            //     // debug message to the player that they're receiving an update on turret hp
            //     //player.sendMessage(0, "Debug: Updating turret hp for player client.");
            // }

            // If player DropShip Recalling and they have a persistent build, perform wipe and buy
            if (item.id == 46){
                // Setup equipment skills for the player
                SetupEquipmentSkills(player);

                string buildString;
                if (autoBuyEnabled.ContainsKey(player) && autoBuyEnabled[player] && persistentBuilds.TryGetValue(player._alias, out buildString))
                {
                    WipeAndBuy(player, buildString, true);
                }
            }

            // Handle champion warp effects
            if (_championEffects != null)
            {
                _championEffects.HandlePlayerWarp(player, posX, posY);
            }

            // Auto-drop system for warping to teammates (summons and teleports)
            if ((item.id == 35 || item.id == 21) && targetPlayerID != 0) // Squad Leader Summon or Suit Teleport
            {
                Player targetPlayer = arena.Players.FirstOrDefault(p => p._id == targetPlayerID);
                
                // Check if target player is on the same team
                if (targetPlayer != null && targetPlayer._team == player._team)
                {
                    if (item.id == 35) // Squad Leader Summon
                    {
                        // Summoning: Player (summoner) summons targetPlayer (summoned player)
                        // Check if targetPlayer (summoned player) has autodrop enabled and hasn't already received auto-drop
                        if (autoDropEnabled.ContainsKey(targetPlayer) && autoDropEnabled[targetPlayer] && !playersWithAutoDrops.Contains(targetPlayer._alias))
                        {
                            // Spawn items at summoner's location (player's location) for the summoned player
                            SpawnSquadLeaderItemsAtLocation(targetPlayer, player._state.positionX, player._state.positionY);
                        }
                    }
                    else if (item.id == 21) // Suit Teleport
                    {
                        // Teleporting: Give items to the teleporting player at target's location
                        // Check if teleporting player has autodrop enabled and hasn't already received auto-drop
                        if (!playersWithAutoDrops.Contains(player._alias))
                        {
                            SpawnAutoDropItemsAtLocation(player, targetPlayer._state.positionX, targetPlayer._state.positionY);
                        }
                    }
                }
            }

            // Redirect DropShip Recall for CTFX Event
            if (currentEventType == EventType.CTFX && item.id == 46){
                WarpPlayerToRange(player, 985, 997, 1117, 1129, 0);
                return false;
            }

            // Redirect DropShip Recall for TDM Event
            // if (currentEventType == EventType.TDM && _tdmInstance != null && item.id == 46){
            //     // Warp to TDM spawn with 0 energy like other events
            //     if (player._team._name.Contains("Collective"))
            //         WarpPlayerToRange(player, 1423, 1423, 541, 541, 0);
            //     else if (player._team._name.Contains("Titan"))
            //         WarpPlayerToRange(player, 1390, 1390, 541, 541, 0);
            //     return false;
            // }

            // Redirect DropShip Recall for Gladiator Event
            if (currentEventType == EventType.Gladiator && item.id == 46){
                WarpPlayerToRange(player, 900, 900, 509, 509, 0);
                return false;
            }

            if (currentEventType == EventType.MiniTP && item.id == 46){
                if (player._team._name.Contains("Titan"))
                    WarpPlayerToRange(player, 654, 654, 518, 518, 0);
                else if (player._team._name.Contains("Collective"))
                    WarpPlayerToRange(player, 648, 648, 565, 565, 0);
                return false;
            }

            var flag = arena.getFlag("Bridge3");
            // Send a message to the arena that they have been summoned if they're carrying a flag
            if (item.id == 35){
                // Get target player once for all operations
                Player targetPlayer = arena.getPlayerById(targetPlayerID);
                
                //If Overtime, Summoning players empowers them with a "Steron Boost OT"
                if (isSD){
                    ItemInfo.UtilityItem steronBoost = AssetManager.Manager.getItemByName("Steron Boost OT") as ItemInfo.UtilityItem;
                    if (steronBoost != null){
                        if (targetPlayer != null){
                            targetPlayer.inventoryModify(steronBoost.id, 1);
                        }
                    }
                }

                //If second overtime, Summoning players empowers them with a "Steron Boost OT2"
                if (isSecondOvertime){
                    ItemInfo.UtilityItem steronBoost10 = AssetManager.Manager.getItemByName("Steron Boost OT2") as ItemInfo.UtilityItem;
                    if (steronBoost10 != null){
                        if (targetPlayer != null){
                            targetPlayer.inventoryModify(steronBoost10.id, 1);
                        }
                    }
                }

                // Track summoned count for target player
                if (!summonedCounts.ContainsKey(targetPlayerID))
                    summonedCounts[targetPlayerID] = 0;
                summonedCounts[targetPlayerID]++;

                // If the target player is not within 100 units on X axis after summoning, refund the energy cost

                if (is5v5){
                    if (targetPlayer != null) {
                        if (flag != null && flag.carrier == targetPlayer && baseUsed != "Unknown" && winningTeamOVD != "offense"){
                            arena.sendArenaMessage(String.Format("Offense wins! {0} has been summoned with a flag!", targetPlayer._alias));
                            winningTeamOVD = "offense";
                        }
                    }
                }
            }

            // Send a message to the arena if a player is carrying a flag and warps to a teammate or blinks
            if (player != null && is5v5) {
                // Check if player's team has a Squad Leader
                bool hasSquadLeader = player._team.ActivePlayers.Any(p => 
                    p._skills.Values.Any(s => s.skill.Name == "Squad Leader"));

                if (hasSquadLeader && flag != null && flag.carrier == player && baseUsed != "Unknown" && winningTeamOVD != "offense")
                {
                    arena.sendArenaMessage(String.Format("Offense wins! {0} has warped with a flag!", player._alias));
                    winningTeamOVD = "offense";
                }
            }

            // Test Teleport Disruptor logic working via Player.WarpItem script event
            // if (item.id == 35 || item.id == 17){ // "Teleport Summoner" and "Squad Leader Summon"
            //     Player targetPlayer = arena.Players.FirstOrDefault(p => p._id == targetPlayerID);
            //     if (targetPlayer != null){
            //         ItemInfo.UtilityItem teleportDisruptor = AssetManager.Manager.getItemByName("Teleport Disruptor") as ItemInfo.UtilityItem;
            //         if (teleportDisruptor != null){
            //             int disruptorRange = teleportDisruptor.antiWarpDistance;
            //             bool isDisrupted = arena.Players.Any(p => 
            //                 p._id != targetPlayer._id && 
            //                 p.activeUtilities.Any(u => u.activateSound != null) && 
            //                 p._state.energy > 0 && 
            //                 Math.Sqrt(
            //                     Math.Pow((p._state.positionX - targetPlayer._state.positionX) / 16, 2) + 
            //                     Math.Pow((p._state.positionY - targetPlayer._state.positionY) / 16, 2)
            //                 ) <= disruptorRange);
            //             if (isDisrupted){
            //                 player.sendMessage(-1, "The player you are trying to summon is currently being teleport disrupted.");
            //                 return false;
            //             }
            //         }
            //     }
            // }
            return true;
        }

        /// <summary>
        /// Handles equipment setup based on player skills
        /// </summary>
        public void SetupEquipmentSkills(Player player)
        {
            // Equipment setup skills
            if (player._skills.Values.Any(s => s.skill.SkillId == 32)) HandleBuildCommand(player, "dinfcaw", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 33)) HandleBuildCommand(player, "dinf", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 31)) HandleBuildCommand(player, "oinfcara", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 29)) HandleBuildCommand(player, "oinf", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 18)) HandleBuildCommand(player, "ohvy", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 20)) HandleBuildCommand(player, "dhvy", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 30)) HandleBuildCommand(player, "hvyMG", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 22)) HandleBuildCommand(player, "slbonds", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 23)) HandleBuildCommand(player, "jtstandard", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 24)) HandleBuildCommand(player, "footjt", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 25)) HandleBuildCommand(player, "medstandard", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 26)) HandleBuildCommand(player, "engstandard", true);
            if (player._skills.Values.Any(s => s.skill.SkillId == 27)) HandleBuildCommand(player, "infilstandard", true);
        }

        // Track players who have already received auto-drops to prevent duplicates
        private HashSet<string> playersWithAutoDrops = new HashSet<string>();

        /// <summary>
        /// Clears auto-drop tracking for a specific player
        /// </summary>
        private void ClearAutoDropTracking(Player player)
        {
            playersWithAutoDrops.Remove(player._alias);
        }

        /// <summary>
        /// Checks if a specific location is within range of any flag owned by the player's team
        /// </summary>
        private bool IsPlayerNearOwnedFlagAtLocation(Player player, short locationX, short locationY, int pixelRange = 700)
        {
            // Check all flags in the arena
            foreach (var flag in arena._flags.Values)
            {
                // Skip flags not owned by player's team
                if (flag.team != player._team)
                    continue;

                // Calculate distance between location and flag
                double distance = Math.Sqrt(Math.Pow(locationX - flag.posX, 2) + Math.Pow(locationY - flag.posY, 2));
                
                // If location is within range of an owned flag, it's on defense
                if (distance <= pixelRange)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Checks if a player is within 700 pixels of any flag owned by their team (for offense/defense detection)
        /// </summary>
        private bool IsPlayerNearOwnedFlag(Player player, int pixelRange = 700)
        {
            var playerX = player._state.positionX;
            var playerY = player._state.positionY;

            // Check all flags in the arena
            foreach (var flag in arena._flags.Values)
            {
                // Skip flags not owned by player's team
                if (flag.team != player._team)
                    continue;

                // Calculate distance between player and flag
                double distance = Math.Sqrt(Math.Pow(playerX - flag.posX, 2) + Math.Pow(playerY - flag.posY, 2));
                
                // If player is within range of an owned flag, they're on defense
                if (distance <= pixelRange)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Checks if a player is within the bounds of a flag owned by their team
        /// </summary>
        private bool IsPlayerInOwnedFlagBounds(Player player)
        {
            // Check if player is within any of the base areas defined in ManageFixedDropLocations
            // and if their team owns a flag in that area
            var playerX = player._state.positionX;
            var playerY = player._state.positionY;

            // Define base boundaries (same as in ManageFixedDropLocations)
            var baseBounds = new[]
            {
                new { Name = "A7", MinX = 3 * 16, MaxX = 73 * 16, MinY = 432 * 16, MaxY = 514 * 16 },
                new { Name = "D7", MinX = 255 * 16, MaxX = 324 * 16, MinY = 419 * 16, MaxY = 506 * 16 },
                new { Name = "F5", MinX = 368 * 16, MaxX = 434 * 16, MinY = 321 * 16, MaxY = 399 * 16 },
                new { Name = "F6", MinX = 379 * 16, MaxX = 479 * 16, MinY = 439 * 16, MaxY = 508 * 16 },
                new { Name = "A5", MinX = 3 * 16, MaxX = 76 * 16, MinY = 315 * 16, MaxY = 385 * 16 },
                new { Name = "B8", MinX = 128 * 16, MaxX = 212 * 16, MinY = 556 * 16, MaxY = 628 * 16 }
            };

            foreach (var bounds in baseBounds)
            {
                // Check if player is within this base area
                if (playerX >= bounds.MinX && playerX <= bounds.MaxX && 
                    playerY >= bounds.MinY && playerY <= bounds.MaxY)
                {
                    // Check if team owns any flag in this area
                    foreach (var flag in arena._flags.Values)
                    {
                        if (flag.posX >= bounds.MinX && flag.posX <= bounds.MaxX &&
                            flag.posY >= bounds.MinY && flag.posY <= bounds.MaxY &&
                            flag.team == player._team)
                        {
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// Checks if a player has Squad Leader skill
        /// </summary>
        private bool IsSquadLeader(Player player)
        {
            return player._skills.Values.Any(s => s.skill.Name == "Squad Leader");
        }

        /// <summary>
        /// Squad Leader specific items with max quantities
        /// </summary>
        private static Dictionary<string, int> squadLeaderItems = new Dictionary<string, int>
        {
            { "stim pack", 1 },
            { "haywire grenade", 4 },
            { "grapeshot mine", 5 },
            { "ap mine", 5 }
        };

        /// <summary>
        /// Spawns Squad Leader items at a specific location
        /// </summary>
        private void SpawnSquadLeaderItemsAtLocation(Player player, short targetX, short targetY)
        {
            // Check if player has autodrop enabled
            if (!autoDropEnabled.ContainsKey(player) || !autoDropEnabled[player])
                return;

            List<Tuple<string, int>> itemsToSpawn = new List<Tuple<string, int>>();
            
            // Always spawn Squad Leader support items for summoners
            foreach (var itemType in squadLeaderItems)
            {
                string itemName = itemType.Key;
                int maxQuantity = itemType.Value;

                // Special condition for stim pack - only drop if HP is 40 or less
                if (itemName == "stim pack" && player._state.health > 40)
                    continue;

                ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                if (item != null)
                {
                    int currentQuantity = player.getInventoryAmount(item.id);
                    int differential = maxQuantity - currentQuantity;

                    if (differential > 0)
                    {
                        itemsToSpawn.Add(new Tuple<string, int>(itemName, differential));
                    }
                }
            }

            // Spawn all calculated items at the target location
            foreach (var itemToSpawn in itemsToSpawn)
            {
                string itemName = itemToSpawn.Item1;
                int quantity = itemToSpawn.Item2;

                ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                if (item != null)
                {
                    // Check if there are existing items nearby to stack with at target location
                    if (arena.getItemCountInRange(item, targetX, targetY, 150) > 0)
                    {
                        arena.itemStackSpawn(item, (ushort)quantity, targetX, targetY, 50, player);
                    }
                    else
                    {
                        arena.itemSpawn(item, (ushort)quantity, targetX, targetY, 0, (int)player._team._id, player);
                    }
                }
            }

            if (itemsToSpawn.Count > 0)
            {
                player.sendMessage(0, String.Format("Auto-drop: Spawned {0} Squad Leader support items at ({1}, {2})", itemsToSpawn.Count, targetX, targetY));
                
                // Mark player as having received auto-drop to prevent duplicates
                playersWithAutoDrops.Add(player._alias);
            }
        }

        /// <summary>
        /// Spawns auto drop items at a specific location based on offense/defense status
        /// </summary>
        private void SpawnAutoDropItemsAtLocation(Player player, short targetX, short targetY)
        {
            // Check if player has autodrop enabled
            if (!autoDropEnabled.ContainsKey(player) || !autoDropEnabled[player])
                return;

            // Determine if the target location is on defense (near owned flag) or offense
            bool isDefense = IsPlayerNearOwnedFlagAtLocation(player, targetX, targetY, 700);
            
            List<Tuple<string, int>> itemsToSpawn = new List<Tuple<string, int>>();
            string dropType;

            if (isDefense)
            {
                // Defense items - use the same ones as BWD system (based on maxAmmoQuantities)
                dropType = "Defensive support";
                
                // Spawn defensive ammo items
                foreach (var ammoType in maxAmmoQuantities)
                {
                    string itemName = ammoType.Key;
                    int maxQuantity = ammoType.Value;

                    ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                    if (item != null)
                    {
                        int currentQuantity = player.getInventoryAmount(item.id);
                        int differential = maxQuantity - currentQuantity;

                        if (differential > 0)
                        {
                            itemsToSpawn.Add(new Tuple<string, int>(itemName, differential));
                        }
                    }
                }
            }
            else
            {
                // Offense items - Squad Leader support items
                dropType = "Squad Leader support";
                
                foreach (var itemType in squadLeaderItems)
                {
                    string itemName = itemType.Key;
                    int maxQuantity = itemType.Value;

                    // Special condition for stim pack - only drop if HP is 40 or less
                    if (itemName == "stim pack" && player._state.health > 40)
                        continue;

                    ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                    if (item != null)
                    {
                        int currentQuantity = player.getInventoryAmount(item.id);
                        int differential = maxQuantity - currentQuantity;

                        if (differential > 0)
                        {
                            itemsToSpawn.Add(new Tuple<string, int>(itemName, differential));
                        }
                    }
                }
            }

            // Spawn all calculated items at the target location
            foreach (var itemToSpawn in itemsToSpawn)
            {
                string itemName = itemToSpawn.Item1;
                int quantity = itemToSpawn.Item2;

                ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                if (item != null)
                {
                    // Check if there are existing items nearby to stack with at target location
                    if (arena.getItemCountInRange(item, targetX, targetY, 150) > 0)
                    {
                        arena.itemStackSpawn(item, (ushort)quantity, targetX, targetY, 50, player);
                    }
                    else
                    {
                        arena.itemSpawn(item, (ushort)quantity, targetX, targetY, 0, (int)player._team._id, player);
                    }
                }
            }

            if (itemsToSpawn.Count > 0)
            {
                player.sendMessage(0, String.Format("Auto-drop: Spawned {0} items ({1}) at warp destination", itemsToSpawn.Count, dropType));
                
                // Mark player as having received auto-drop to prevent duplicates
                playersWithAutoDrops.Add(player._alias);
            }
        }

        /// <summary>
        /// Spawns auto drop items based on player's offense/defense status
        /// </summary>
        private void SpawnAutoDropItems(Player player)
        {
            // Check if player has autodrop enabled
            if (!autoDropEnabled.ContainsKey(player) || !autoDropEnabled[player])
                return;

            // Determine if player is on defense (near owned flag) or offense
            bool isDefense = IsPlayerNearOwnedFlag(player, 700);
            
            List<Tuple<string, int>> itemsToSpawn = new List<Tuple<string, int>>();
            string dropType;

            if (isDefense)
            {
                // Defense items - use the same ones as BWD system (based on maxAmmoQuantities)
                dropType = "Defensive support";
                
                // Spawn defensive ammo items
                foreach (var ammoType in maxAmmoQuantities)
                {
                    string itemName = ammoType.Key;
                    int maxQuantity = ammoType.Value;

                    ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                    if (item != null)
                    {
                        int currentQuantity = player.getInventoryAmount(item.id);
                        int differential = maxQuantity - currentQuantity;

                        if (differential > 0)
                        {
                            itemsToSpawn.Add(new Tuple<string, int>(itemName, differential));
                        }
                    }
                }
            }
            else
            {
                // Offense items - Squad Leader support items
                dropType = "Squad Leader support";
                
                foreach (var itemType in squadLeaderItems)
                {
                    string itemName = itemType.Key;
                    int maxQuantity = itemType.Value;

                    // Special condition for stim pack - only drop if HP is 40 or less
                    if (itemName == "stim pack" && player._state.health > 40)
                        continue;

                    ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                    if (item != null)
                    {
                        int currentQuantity = player.getInventoryAmount(item.id);
                        int differential = maxQuantity - currentQuantity;

                        if (differential > 0)
                        {
                            itemsToSpawn.Add(new Tuple<string, int>(itemName, differential));
                        }
                    }
                }
            }

            // Spawn all calculated items
            foreach (var itemToSpawn in itemsToSpawn)
            {
                string itemName = itemToSpawn.Item1;
                int quantity = itemToSpawn.Item2;

                ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                if (item != null)
                {
                    // Check if there are existing items nearby to stack with
                    if (arena.getItemCountInRange(item, player._state.positionX, player._state.positionY, 150) > 0)
                    {
                        arena.itemStackSpawn(item, (ushort)quantity, player._state.positionX, player._state.positionY, 50, player);
                    }
                    else
                    {
                        arena.itemSpawn(item, (ushort)quantity, player._state.positionX, player._state.positionY, 0, (int)player._team._id, player);
                    }
                }
            }

            if (itemsToSpawn.Count > 0)
            {
                player.sendMessage(0, String.Format("Auto-drop: Spawned {0} items ({1})", itemsToSpawn.Count, dropType));
                
                // Mark player as having received auto-drop to prevent duplicates
                playersWithAutoDrops.Add(player._alias);
            }
        }

        /// <summary>
        /// Calculates and spawns items that would make up the difference between current inventory and max build
        /// </summary>
        private void SpawnBuildDifferentialItems(Player player, bool isSquadLeaderScenario = false)
        {
            List<Tuple<string, int>> itemsToSpawn = new List<Tuple<string, int>>();
            string dropType;

            if (isSquadLeaderScenario)
            {
                // Squad Leader scenario - use specialized items
                dropType = "Squad Leader support";
                
                foreach (var itemType in squadLeaderItems)
                {
                    string itemName = itemType.Key;
                    int maxQuantity = itemType.Value;

                    ItemInfo item = AssetManager.Manager.getItemByName(itemName);
                    if (item != null)
                    {
                        int currentQuantity = player.getInventoryAmount(item.id);
                        int differential = maxQuantity - currentQuantity;

                        if (differential > 0)
                        {
                            itemsToSpawn.Add(new Tuple<string, int>(itemName, differential));
                        }
                    }
                }
            }
            else
            {
                // Normal scenario - calculate build differential
                dropType = "build differential";
                
                // Get player's last used build or current build
                string buildName = "";
                if (lastUsedBuild.ContainsKey(player))
                {
                    buildName = lastUsedBuild[player];
                }
                else
                {
                    // Try to determine build from current skills
                    if (player._skills.Values.Any(s => s.skill.SkillId == 32))
                        buildName = "dinfcaw";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 33))
                        buildName = "dinf";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 31))
                        buildName = "oinfcara";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 29))
                        buildName = "oinf";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 18))
                        buildName = "ohvy";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 20))
                        buildName = "dhvy";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 30))
                        buildName = "hvyMG";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 22))
                        buildName = "slstandard";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 23))
                        buildName = "jtstandard";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 24))
                        buildName = "footjt";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 25))
                        buildName = "medstandard";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 26))
                        buildName = "engstandard";
                    else if (player._skills.Values.Any(s => s.skill.SkillId == 27))
                        buildName = "infilstandard";
                }

                if (!string.IsNullOrEmpty(buildName) && buildSets.ContainsKey(buildName))
                {
                    var buildData = buildSets[buildName];
                    List<Tuple<string, ushort>> buildItems = buildData.Item1;

                    // Track the ammo used by the build
                    Dictionary<string, int> usedAmmo = new Dictionary<string, int>();

                    // Iterate through the build items and record their quantities
                    foreach (var item in buildItems)
                    {
                        string ammoName = item.Item1.ToLower();
                        if (maxAmmoQuantities.ContainsKey(ammoName))
                        {
                            usedAmmo[ammoName] = item.Item2;
                        }
                    }

                    // Calculate what's missing to reach max quantities for items in the build
                    foreach (var ammoType in maxAmmoQuantities.Keys)
                    {
                        string normalizedAmmoType = ammoType.ToLower();
                        
                        // Only consider items that are actually in the player's build
                        if (usedAmmo.ContainsKey(normalizedAmmoType))
                        {
                            int maxQuantity = maxAmmoQuantities[ammoType];
                            
                            ItemInfo ammoItem = AssetManager.Manager.getItemByName(ammoType);
                            if (ammoItem != null)
                            {
                                int currentQuantity = player.getInventoryAmount(ammoItem.id);
                                int differential = maxQuantity - currentQuantity;

                                if (differential > 0)
                                {
                                    itemsToSpawn.Add(new Tuple<string, int>(ammoType, differential));
                                }
                            }
                        }
                    }
                }
            }

            // Spawn the differential items at player location
            foreach (var itemToSpawn in itemsToSpawn)
            {
                ItemInfo item = AssetManager.Manager.getItemByName(itemToSpawn.Item1);
                if (item != null)
                {
                    // Check if there are existing items nearby to stack with
                    if (arena.getItemCountInRange(item, player._state.positionX, player._state.positionY, 150) > 0)
                    {
                        arena.itemStackSpawn(item, (ushort)itemToSpawn.Item2, player._state.positionX, player._state.positionY, 50, player);
                    }
                    else
                    {
                        arena.itemSpawn(item, (ushort)itemToSpawn.Item2, player._state.positionX, player._state.positionY, 0, (int)player._team._id, player);
                    }
                }
            }

            // Mark player as having received auto-drop
            playersWithAutoDrops.Add(player._alias);
            
            // Send feedback about what type of drop was provided
            player.sendMessage(0, string.Format("Auto-drop: Spawned {0} items!", dropType));
        }

        /// <summary>
        /// Handles the spawn of a player
        /// </summary>
        [Scripts.Event("Player.Spawn")]
        public bool playerSpawn(Player player, bool bDeath)
        {
            //  arena.sendArenaMessage(string.Format("Player {0} spawned. Death: {1}, Event Type: {2}", 
            //      player._alias, bDeath, currentEventType));

            // Check if player had a vehicle before going through a portal
            // if (_lastOccupiedVehicle.ContainsKey(player))
            // {
            //     // Get the stored vehicle state
            //     VehicleState vState = _lastOccupiedVehicle[player];
                
            //     // Create the vehicle
            //     VehInfo vInfo = player._server._assets.getVehicleByID(vState.VehicleTypeId);
            //     if (vInfo != null)
            //     {
            //         // Explicitly reset player's death state
            //         player._deathTime = 0;
            //         player.resetState(true, true, true);  // Reset all states completely
                    
            //         // First make sure player's state is properly reset and they're marked as alive
            //         player.resetWarp();
            //         player.resetState(false, false, false);
                    
            //         // Set up player state first
            //         Helpers.ObjectState playerState = new Helpers.ObjectState();
            //         playerState.positionX = player._state.positionX;
            //         playerState.positionY = player._state.positionY;
            //         playerState.positionZ = 0;
            //         playerState.yaw = vState.Yaw;
                    
            //         // Warp player to ensure they're in the right spot
            //         player.warp(Helpers.ResetFlags.ResetAll, playerState, 1000, 1000, vState.Yaw);
                    
            //         // Create vehicle state
            //         Helpers.ObjectState vehState = new Helpers.ObjectState();
            //         vehState.positionX = player._state.positionX;
            //         vehState.positionY = player._state.positionY;
            //         vehState.positionZ = 0;
            //         vehState.yaw = vState.Yaw;
            //         vehState.velocityX = vState.VelocityX;
            //         vehState.velocityY = vState.VelocityY;
            //         vehState.energy = vState.Energy;
            //         vehState.health = vState.Health;
            //         vehState.direction = (Helpers.ObjectState.Direction)vState.Direction;
                    
            //         // Use the arena's newVehicle method to create the vehicle properly
            //         Vehicle vehicle = player._arena.newVehicle(vInfo, player._team, null, vehState);
                    
            //         // Update the vehicle state before entering 
            //         vehicle._tickDead = 0; // Ensure the vehicle is not considered dead
            //         vehicle._state.health = vehState.health;
            //         vehicle._state.energy = vehState.energy;
                    
            //         // Sync player state before entering vehicle
            //         player.syncState();
                    
            //         // Now occupy the vehicle
            //         player.enterVehicle(vehicle);
                    
            //         // Update vehicle state again to ensure synchronization
            //         vehicle._state.positionX = player._state.positionX;
            //         vehicle._state.positionY = player._state.positionY;
            //         vehicle._state.velocityX = vState.VelocityX;
            //         vehicle._state.velocityY = vState.VelocityY;
            //         vehicle._state.yaw = vState.Yaw;
            //         vehicle._state.direction = (Helpers.ObjectState.Direction)vState.Direction;
            //         vehicle._state.energy = vState.Energy;
            //         vehicle._state.health = vState.Health;
                    
            //         // Do multiple updates to ensure everything syncs
            //         vehicle.update(false);
                    
            //         // Create and send state update packet to the client
            //         SC_PlayerUpdate stateUpdate = new SC_PlayerUpdate
            //         {
            //             tickUpdate = Environment.TickCount,
            //             player = player,
            //             vehicle = vehicle,
            //             itemID = 0, // No item used
            //             bBot = false,
            //             activeEquip = null
            //         };
                    
            //         stateUpdate.vehicle._state = vehicle._state;
            //         player._client.sendReliable(stateUpdate);
                    
            //         // Sync player state to make sure changes are visible to the client
            //         player.syncState();
                    
            //         // Warp player again to ensure their state is consistent
            //         player.warp(Helpers.ResetFlags.ResetNone, playerState, 1000, 1000, vState.Yaw);
                    
            //         // Update once more and sync
            //         vehicle.update(false);
            //         player.syncState();
                    
            //         // Remove from the dictionary
            //         _lastOccupiedVehicle.Remove(player);
            //     }
            // }

            //If player skill is Dueler, reset their warp only.
            if (player._skills.Values.Any(s => s.skill.Name == "Dueler")){
                WarpPlayerToRange(player, 756, 756, 536, 536, 1000);
                return true;
            }

            // Handle TDM spawn warping
            // if (currentEventType == EventType.TDM && _tdmInstance != null)
            // {
            //     player.resetWarp();
            //     _tdmInstance.WarpPlayerToTDMSpawn(player);
            //     player.Bounty = CFG.bounty.start;
            //     player.syncState();
            //     return false;
            // }

            if (currentEventType == EventType.CTFX || currentEventType == EventType.SUT){
                player.resetWarp();
                if (currentEventType == EventType.CTFX){
                    WarpPlayerToRange(player, 985, 997, 1117, 1129, 1000);
                } else {
                    WarpPlayerToRange(player, 679, 686, 608, 618, 1000);
                }
                //arena.sendArenaMessage(string.Format("CTFX: Warping {0} to range (985-997, 1117-1129)", player._alias));
                player.Bounty = CFG.bounty.start;
                player.syncState();
                return false;
            }

            if (currentEventType == EventType.MiniTP){
                player.resetWarp();
                if (player._team._name.Contains("Titan")) {
                    WarpPlayerToRange(player, 654, 654, 518, 518, 1000);
                    //arena.sendArenaMessage(string.Format("MiniTP: Warping Titan player {0} to (654, 518)", player._alias));
                }
                else if (player._team._name.Contains("Collective")) {
                    WarpPlayerToRange(player, 648, 648, 565, 565, 1000);
                    //arena.sendArenaMessage(string.Format("MiniTP: Warping Collective player {0} to (648, 565)", player._alias));
                }
                if (bDeath)
                {	//Trigger the appropriate event
                    if (player._bEnemyDeath) {
                        //Logic_Assets.RunEvent(player, CFG.EventInfo.killedByEnemy);
                        //arena.sendArenaMessage(string.Format("{0} was killed by enemy", player._alias));
                    }
                    else {
                        //Logic_Assets.RunEvent(player, CFG.EventInfo.killedByTeam);
                        //arena.sendArenaMessage(string.Format("{0} was killed by team", player._alias));
                    }

                    //Reset flags to unowned state?
                    if (player._arena.getTerrain(player._state.positionX, player._state.positionY).safety
                        && !CFG.flag.allowSafety) {
                        arena.flagResetPlayer(player, true);
                        //arena.sendArenaMessage(string.Format("Resetting flags for {0} in safety zone", player._alias));
                    }

                    //Reset his bounty
                    player.Bounty = CFG.bounty.start;
                    //Bring their energy to full
                    player._state.energy = 1000;
                    //arena.sendArenaMessage(string.Format("Reset bounty for {0} to {1}", player._alias, CFG.bounty.start));
                    //Update his client to reflect bty change
                    player.syncState();
                }
                return false;
            }
            string buildString;
            if (autoBuyEnabled.ContainsKey(player) && autoBuyEnabled[player] && persistentBuilds.TryGetValue(player._alias, out buildString))
            {
                WipeAndBuy(player, buildString, true);
            }

            // Check for queued class swap
            if (queuedClassSwap.ContainsKey(player))
            {
                string skillName = queuedClassSwap[player];
                commandHandler.HandleSwapCommand(player, skillName, CFG, this, true, true);
                queuedClassSwap.Remove(player);
                player.sendMessage(0, string.Format("Your class has been changed to: {0}", skillName));
            }

            // Check if player has summon automation enabled (set automatically when purchasing certain skills)
            bool hasAutomationEnabled = summonAutomationEnabled.ContainsKey(player) && summonAutomationEnabled[player];
            
            // Schedule automated summon if player has automation enabled
            if (hasAutomationEnabled)
            {
                // Send "Requesting Summon" message to all players on the same team
                foreach (Player teammate in player._team.ActivePlayers)
                {
                    SC_Chat pkt = new SC_Chat
                    {
                        chatType = Helpers.Chat_Type.Team,
                        bong = 27,
                        from = player._alias,
                        message = "X"
                    };
                    teammate._client.sendReliable(pkt);
                }
            }

            return true;
        }
        // NOTE: Player class tracking dictionaries removed - now handled by GameStats system
        // (playerClassPlayTimes and playerLastClassSwitch moved to GameStats)

        /// <summary>
        /// Sends ordered class play time messages to the player using GameStats
        /// </summary>
        private void SendOrderedPlayTimes(Player player)
        {
            if (gameStats == null)
            {
                player.sendMessage(-1, "Stats system not available.");
                return;
            }
            
            string mostPlayed = gameStats.GetMostPlayedClass(player);
            var playTimes = gameStats.PlayerClassPlayTimes.ContainsKey(player) ? 
                gameStats.PlayerClassPlayTimes[player] : new Dictionary<string, int>();
                
            player.sendMessage(-1, String.Format("Most played class: {0}", mostPlayed));
            
            foreach (var entry in playTimes.OrderByDescending(x => x.Value))
            {
                double seconds = entry.Value / 1000.0;
                player.sendMessage(0, String.Format("*{0}: {1:F1} seconds", entry.Key, seconds));
            }
        }

        /// <summary>
        /// Process pending summon requests using Environment.TickCount for thread safety
        /// </summary>
        private void ProcessPendingSummonRequests()
        {
            int currentTick = Environment.TickCount;
            var playersToRemove = new List<Player>();

            foreach (var kvp in pendingSummonRequests)
            {
                Player player = kvp.Key;
                int scheduledTick = kvp.Value;

                // Check if it's time to send the summon request
                if (currentTick >= scheduledTick)
                {
                    try
                    {
                        // Check if player is still in the arena and on a team
                        if (player != null && player._arena != null && player._team != null)
                        {
                            // Send "Requesting Summon" message to all players on the same team
                            foreach (Player teammate in player._team.ActivePlayers)
                            {
                                SC_Chat pkt = new SC_Chat
                                {
                                    chatType = Helpers.Chat_Type.Team,
                                    bong = 27,
                                    from = player._alias,
                                    message = "XXXXXXX"
                                };
                                teammate._client.sendReliable(pkt);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(String.Format("Error sending delayed summon request for {0}: {1}", player._alias, ex.Message));
                    }

                    // Mark this player for removal from pending requests
                    playersToRemove.Add(player);
                }
            }

            // Remove processed requests
            foreach (Player player in playersToRemove)
            {
                pendingSummonRequests.Remove(player);
            }
        }

        // Dictionary to track class swaps for each player
        private Dictionary<Player, int> playerClassSwaps = new Dictionary<Player, int>();

        /// <summary>
        /// Triggered when a player's purchase is successful
        /// </summary>
        [Scripts.Event("Shop.SkillPurchase")]
        public bool PlayerShopSkillPurchase(Player from, SkillInfo skill)
        {
            // Setup equipment skills for the player
            SetupEquipmentSkills(from);

            // This removes the ability to abuse teleport beacon bugs during class change
            Vehicle vehicle = from._occupiedVehicle ?? from._baseVehicle;
            if (vehicle != null)
            {
                vehicle._state.positionX = from._state.positionX;
                vehicle._state.positionY = from._state.positionY;
                vehicle._state.velocityX = 0;
                vehicle._state.velocityY = 0;
                vehicle._state.yaw = from._state.yaw;
                vehicle._state.direction = Helpers.ObjectState.Direction.None;
                vehicle._state.energy = 1000;
                vehicle._state.health = 1000;
                vehicle._tickDead = 0;
                vehicle.update(false);
            }
            
            from.warp(Helpers.ResetFlags.ResetAll, from._state, from._state.health, from._state.energy, (byte)from._state.yaw);

            // Remove persistent builds from this player
            string dummy;
            persistentBuilds.TryRemove(from._alias, out dummy);
            
            // Update class swap count for player
            if (!playerClassSwaps.ContainsKey(from))
                playerClassSwaps[from] = 0;
            playerClassSwaps[from]++;

            // Infiltrator announcement
            bool withinGracePeriod = lastAnnouncementTimes.ContainsKey(from) &&
                                                       (DateTime.Now - lastAnnouncementTimes[from]).TotalSeconds < AnnouncementGracePeriod;

            // Announce the player's skill change if it is Infiltrator, not within the grace period, 
            // and the player is not on team "np"
            if (skill.Name == "Infiltrator" && !withinGracePeriod && from._team._name.ToLower() != "np" && !arena._name.Contains("Arena 1") && !arena._name.Contains("Public1"))
            {
                // Make the actual announcement
                if (from._alias == "YAH" || from._alias == "JACKIE"){
                    arena.sendArenaMessage("#SWITCHING CLASS IN UPPERCASE ------ TEAM " + from._team._name.ToUpper() + " ------ " + from._alias + ".", 14);
                } else {
                    arena.sendArenaMessage("#CLOAKERS ------ TEAM " + from._team._name + " ------ " + from._alias + ".", 14);
                }

                // Update the last announcement time for the player
                lastAnnouncementTimes[from] = DateTime.Now;
            }

            if (currentEventType == EventType.CTFX){
                WarpPlayerToRange(from, 985, 997, 1117, 1129);
                return false;
            }
            if (currentEventType == EventType.MiniTP){
                if (from._team._name.Contains("Titan"))
                    WarpPlayerToRange(from, 654, 654, 518, 518);
                else if (from._team._name.Contains("Collective")) 
                    WarpPlayerToRange(from, 648, 648, 565, 565);
                return false;
            }
            
            // Auto-enable summon automation for specific skills
            if (skill.SkillId == 31 || skill.SkillId == 29 || skill.SkillId == 28)
            {
                summonAutomationEnabled[from] = true;
                from.sendMessage(0, String.Format("Summon automation enabled with {0}! Use ?summon to toggle on/off.", skill.Name));
            }
            
            return true;
        }
        /// <summary>
        /// Updates the play time tracking for a player's skill
        /// </summary>
        // NOTE: UpdateSkillPlayTime method removed - now handled by GameStats system

        /// <summary>
        /// Triggered when a player requests to buy a skill
        /// </summary>
        [Scripts.Event("Shop.SkillRequest")]
        public bool PlayerShopSkillRequest(Player from, SkillInfo skill)
        {
            // Handle class swap tracking for real-time most played class calculation
            if (gameStats != null)
                gameStats.OnPlayerClassSwap(from);

            //arena.sendArenaMessage(string.Format("Player {0} requested to buy skill {1}.", from._alias, skillName));
            if (skill.Name == "Infiltrator" && !from._arena._name.Contains("Arena 1") && !from._arena._name.Contains("Public1"))
            {
                // Count infiltrators only on the player's team, excluding spectator vehicles
                int teamInfiltratorCount = arena.Players
                    .Where(p => p._team == from._team && 
                               !p._team.IsSpec && 
                               !p.IsSpectator &&
                               p._skills.Any(s => s.Value.skill.Name == "Infiltrator"))
                    .Count();

                if (teamInfiltratorCount >= 2)
                {
                    from.sendMessage(-1, "Infiltrator skill purchase not allowed due to 2 infils on the team already.");
                    return false;
                }
            }
            return true;
        }
        // Properties to store portal redirect settings
        private string redirectSide = null;
        private string redirectBase = null;

        /// <summary>
        /// Handles a player's portal request
        /// </summary>
        [Scripts.Event("Player.Portal")]
        public bool playerPortal(Player player, LioInfo.Portal portal)
        {
            // Store vehicle state if player is in a vehicle and using specific portals
            // ushort[] portalIdsToTrack = { 66, 67 }; // Add any other portal IDs that should preserve vehicles
            
            // // Only track if the player is in a vehicle and using one of our tracked portals
            // if (player._occupiedVehicle != null && portalIdsToTrack.Any(id => id == portal.PortalData.DestinationWarpGroup))
            // {
            //     Vehicle vehicle = player._occupiedVehicle;
                
            //     // Create a VehicleState to store the important details
            //     VehicleState vehicleState = new VehicleState
            //     {
            //         PosX = player._state.positionX,
            //         PosY = player._state.positionY,
            //         Yaw = player._state.yaw,
            //         VelocityX = player._state.velocityX,
            //         VelocityY = player._state.velocityY,
            //         Energy = vehicle._state.energy,
            //         Health = vehicle._state.health,
            //         Direction = (byte)player._state.direction,
            //         VehicleTypeId = vehicle._type.Id,
            //         Team = vehicle._team
            //     };

            //     _lastOccupiedVehicle[player] = vehicleState;
                
            //     // Also store in tracking dictionary
            //     _occupiedVehicle[player] = vehicle;

            // }

            // Initialize tracking for new players if needed (now handled by GameStats)
            if (gameStats != null)
            {
                gameStats.OnPlayerClassSwap(player);
            }

            // Check if the player's arena and event type are valid
            if (currentEventType == EventType.MiniTP)
            {
                // Replace 'desiredPortalID' with the specific portal ID you want to check
                ushort[] desiredPortalIDs = { 66, 67 }; // Titan DropShip portals

                // Check if the portal used is one of the ones we want to redirect
                if (desiredPortalIDs.Any(id => id == portal.PortalData.DestinationWarpGroup))
                {
                        if (player._team._name.Contains("Titan")) {
                            WarpPlayerToRange(player, 654, 654, 518, 518);
                        }
                        else if (player._team._name.Contains("Collective")) {
                        WarpPlayerToRange(player, 648, 648, 565, 565);
                    }
                    return false;
                }
            }

            // Check if the player's arena and event type are valid
            if (currentEventType == EventType.CTFX)
            {
                // Replace 'desiredPortalID' with the specific portal ID you want to check
                ushort[] desiredPortalIDs = { 66, 67 }; // Titan DropShip portals

                // Check if the portal used is one of the ones we want to redirect
                if (desiredPortalIDs.Any(id => id == portal.PortalData.DestinationWarpGroup))
                {
                    // Define the target position within the same arena
                    Helpers.ObjectState targetPosition = new Helpers.ObjectState();
                    targetPosition.positionX = 502; // Replace with desired X coordinate
                    targetPosition.positionY = 1422; // Replace with desired Y coordinate
                    targetPosition.positionZ = 0;    // Z coordinate, if applicable
                    targetPosition.yaw = 0;          // Facing direction, if applicable

                    // Warp the player to the new position
                    player.warp(targetPosition.positionX * 16, targetPosition.positionY * 16);
                    //WarpPlayerToExactLocation(player, targetPosition.positionX, targetPosition.positionY);

                    // Send a message to the player indicating they used a portal
                    player.sendMessage(0, "You have been redirected through a special portal!");

                    // Return false to prevent the default portal handling
                    return false;
                }
            }
            // Check if the player's arena and event type are valid
            if (currentEventType == EventType.SUT)
            {
                // Replace 'desiredPortalID' with the specific portal ID you want to check
                ushort[] desiredPortalIDs = { 66, 67 }; // Titan DropShip portals

                // Check if the portal used is one of the ones we want to redirect
                if (desiredPortalIDs.Any(id => id == portal.PortalData.DestinationWarpGroup))
                {
                    int totalPlayers = arena.PlayersIngame.Count();

                    if (totalPlayers < 10)
                        WarpPlayerToRange(player, 1180, 1270, 145, 240);

                    if (totalPlayers >= 10 && totalPlayers <= 29)
                        WarpPlayerToRange(player, 1180, 1400, 145, 270);

                    if (totalPlayers >= 30)
                        WarpPlayerToRange(player, 1070, 1540, 60, 310);

                    // Send a message to the player indicating they used a portal
                    //player.sendMessage(0, "You have been redirected to Small Unit Tactics!");

                    // Return false to prevent the default portal handling
                    return false;
                }
            }
            //arena debug message using string.format stating the portal.id
            //arena.sendArenaMessage(string.Format("Portal ID: {0}", portal.PortalData.DestinationWarpGroup));

            // Handle portal redirects based on base locations using value tuples with named elements
            bool isTitanPortal = new[] { 18, 201 }.Contains(portal.PortalData.DestinationWarpGroup);
            bool isCollectivePortal = new[] { 6, 7, 202 }.Contains(portal.PortalData.DestinationWarpGroup);

            bool shouldRedirect = (redirectSide == "titan" && isTitanPortal) || 
                                  (redirectSide == "collective" && isCollectivePortal);

            if (shouldRedirect)
            {
                if (redirectBase.Equals("d8", StringComparison.OrdinalIgnoreCase))
                {
                    WarpPlayerToRange(player, 275, 275, 601, 601);
                    return false;
                }
                else if (redirectBase.Equals("a10", StringComparison.OrdinalIgnoreCase))
                {
                    WarpPlayerToRange(player, 32, 32, 696, 696);
                    return false;
                }
                else if (redirectBase.Equals("a8", StringComparison.OrdinalIgnoreCase))
                {
                    WarpPlayerToRange(player, 28, 28, 611, 611);
                    return false;
                }
                else if (redirectBase.Equals("f8", StringComparison.OrdinalIgnoreCase))
                {
                    WarpPlayerToRange(player, 421, 421, 569, 569);
                    return false;
                }
                else if (redirectBase.Equals("b8", StringComparison.OrdinalIgnoreCase))
                {
                    WarpPlayerToRange(player, 164, 177, 570, 572);
                    return false;
                }
            }

            // Check if it's a victory portal
            bool isVictoryPortal = new[] { 4, 5, 10, 28, 30, 35 }.Contains(portal.PortalData.DestinationWarpGroup);

            // Check if the player is carrying a flag and is5v5, if true winningTeamOVD is set to offense
            bool isCarryingFlag = false;
            foreach (Arena.FlagState fs in arena._flags.Values)
            {
                if (fs.carrier == player)
                {
                    isCarryingFlag = true;
                    break;
                }
            }

            if (is5v5 && isCarryingFlag && isVictoryPortal)
            {
                // Check if there's a squad leader on the player's team
                bool hasSquadLeader = arena.Players.Any(p => 
                    p._team == player._team && 
                    !p._team.IsSpec && 
                    p._skills.Any(s => s.Value.skill.Name == "Squad Leader"));

                if (hasSquadLeader)
                {
                    winningTeamOVD = "offense";
                    arena.sendArenaMessage("Offense wins! Flag carrier has used portal.");
                }
            }

            //IF destination warp group is 200 (enemy portal), check if vehicle is on the map
            if (portal.PortalData.DestinationWarpGroup == 200)
            {
                var enemyPortal = arena.Vehicles.FirstOrDefault(v => 
                    v._type.Type == VehInfo.Types.Computer && 
                    v.relativeID == 292);

                if (enemyPortal != null)
                {
                    // Check team and coordinates for Collective
                    if ((player._team._name == "Collective" || player._team._name == "Collective'") &&
                        enemyPortal._state.positionX >= 1090 * 16 && enemyPortal._state.positionX <= 1140 * 16 &&
                        enemyPortal._state.positionY >= 570 * 16 && enemyPortal._state.positionY <= 620 * 16)
                    {
                        // arena.sendArenaMessage(string.Format("Collective player {0} using portal at X:{1}-{2}, Y:{3}-{4}",
                        //     player._alias, 1090, 1140, 570, 620));
                        player.warp(enemyPortal._state.positionX, enemyPortal._state.positionY);
                        return false;
                    }

                    // Check team and coordinates for Titan Militia
                    if ((player._team._name == "Titan Militia" || player._team._name == "Titan Militia'") &&
                        enemyPortal._state.positionX >= 991 * 16 && enemyPortal._state.positionX <= 1015 * 16 &&
                        enemyPortal._state.positionY >= 630 * 16 && enemyPortal._state.positionY <= 669 * 16)
                    {
                        // arena.sendArenaMessage(string.Format("Titan player {0} using portal at X:{1}-{2}, Y:{3}-{4}",
                        //     player._alias, 991, 1015, 630, 669));
                        player.warp(enemyPortal._state.positionX, enemyPortal._state.positionY);
                        return false;
                    }
                }
            }

            // Proceed with the default portal handling
            return true;
        }



        /// <summary>
        /// Triggered when a player requests to drop an item
        /// </summary>
        // [Scripts.Event("Player.ItemDrop")]
        // public bool playerItemDrop(Player player, ItemInfo item, object quantity)
        // {
        //     // Convert quantity to an int regardless of whether it's a ushort or int.
        //     int qty = Convert.ToInt32(quantity);

        //     // If on terrain 0, and it's 5 tso or tox (item ids 2005 and 2009), subtract 5 from minedStats.
        //     if (player._arena.getTerrainID(player._state.positionX, player._state.positionY) == 0 &&
        //     (item.id == 2005 || item.id == 2009))
        //     {
        //         string key = (item.id == 2005)
        //             ? player._team._name + " Tso mined"
        //             : player._team._name + " Tox mined";
        //         if (minedStats.ContainsKey(key))
        //         {
        //             minedStats[key] -= 5;
        //         }
        //         //player._arena.sendArenaMessage(string.Format("{0} has dropped 5 {1}!", player._alias, item.name));
        //     }
        //     return true;
        // }
        
        [Scripts.Event("Player.Leave")]
        public void playerLeave(Player player)
        {
            // Check if the player is still in the arena's player list
            if (player == null || arena == null || !arena.Players.Contains(player))
                return;

            // Cache player stats before they leave to prevent stat dodging
            if (gameStats != null)
                gameStats.OnPlayerLeave(player);

            try
            {
                int toxCount = player.getInventoryAmount(2009);
                int tsoCount = player.getInventoryAmount(2005);
                int panCount = player.getInventoryAmount(2007);

                // Log.write(TLog.Normal, string.Format("[Debug] Player {0} leaving with Tox:{1} Tso:{2} Pan:{3}", 
                //     player._alias, toxCount, tsoCount, panCount));

                // Keep messages concise to avoid potential string length issues
                if (toxCount > 0 || tsoCount > 0 || panCount > 0)
                {
                    // Build shorter resource messages
                    var resources = new List<string>();
                    if (toxCount > 0) resources.Add(string.Format("{0}Tox", toxCount));
                    if (tsoCount > 0) resources.Add(string.Format("{0}Tso", tsoCount));
                    if (panCount > 0) resources.Add(string.Format("{0}Pan", panCount));

                    // Keep message compact
                    string message = string.Format("&{0}: {1}", player._alias, string.Join("/", resources));
                    if (message.Length <= 128) // Add length check
                    {
                        //arena.sendArenaMessage(message);
                    }
                }

                if (player._team != null)
                {
                    // Log.write(TLog.Normal, string.Format("[Debug] Player {0} team: {1}", 
                    //     player._alias, player._team._name));

                    if (player._team._name.Contains(" T"))
                    {
                        // Log.write(TLog.Normal, "[Debug] Attempting to spawn minerals for Titan player");
                        // Spawn their minerals for any they had in the Titan DropShip fixed coordinate
                        if (toxCount > 0)
                        {
                            ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                            if (item2009 != null)
                            {
                                arena.itemSpawn(item2009, (ushort)toxCount, 689 * 16, 457 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tox at Titan dropship", toxCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tox item info");
                            }
                        }
                        if (tsoCount > 0)
                        {
                            ItemInfo item2005 = arena._server._assets.getItemByID(2005);
                            if (item2005 != null)
                            {
                                arena.itemSpawn(item2005, (ushort)tsoCount, 689 * 16, 462 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tso at Titan dropship", tsoCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tso item info");
                            }
                        }
                        if (panCount > 0)
                        {
                            ItemInfo item2007 = arena._server._assets.getItemByID(2007);
                            if (item2007 != null)
                            {
                                arena.itemSpawn(item2007, (ushort)panCount, 689 * 16, 465 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Pan at Titan dropship", panCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Pan item info");
                            }
                        }
                    }
                    else if (player._team._name.Contains(" C"))
                    {
                        //Log.write(TLog.Normal, "[Debug] Attempting to spawn minerals for Collective player");
                        // Spawn their minerals for any they had in the Collective DropShip fixed coordinate
                        if (toxCount > 0)
                        {
                            ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                            if (item2009 != null)
                            {
                                arena.itemSpawn(item2009, (ushort)toxCount, 689 * 16, 610 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tox at Collective dropship", toxCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tox item info");
                            }
                        }
                        if (tsoCount > 0)
                        {
                            ItemInfo item2005 = arena._server._assets.getItemByID(2005);
                            if (item2005 != null)
                            {
                                arena.itemSpawn(item2005, (ushort)tsoCount, 689 * 16, 615 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tso at Collective dropship", tsoCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tso item info");
                            }
                        }
                        if (panCount > 0)
                        {
                            ItemInfo item2007 = arena._server._assets.getItemByID(2007);
                            if (item2007 != null)
                            {
                                arena.itemSpawn(item2007, (ushort)panCount, 689 * 16, 618 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Pan at Collective dropship", panCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Pan item info");
                            }
                        }

                        // Keep leave message short
                        // string leaveMsg = string.Format("&{0} left", player._alias);
                        // if (leaveMsg.Length <= 128)
                        // {
                        //     arena.sendArenaMessage(leaveMsg);
                        // }
                    }
                    else
                    {
                        //Log.write(TLog.Normal, string.Format("[Debug] Player {0} team name did not match expected patterns", 
                        //    player._alias));
                    }
                }
                else
                {
                    //Log.write(TLog.Normal, string.Format("[Debug] Player {0} has no team", player._alias));
                }
            }
            catch (Exception ex)
            {
                //Log.write(TLog.Error, "Error in playerLeave: " + ex.ToString());
            }
            
            /* DISABLED: Vehicle tracking through portals
            // Also clean up the last occupied vehicle entry
            if (_lastOccupiedVehicle.ContainsKey(player))
                _lastOccupiedVehicle.Remove(player);
            */
                
            // Clear all player specific dictionaries (class tracking now handled by GameStats)
            // playerClassPlayTimes.Remove(player); - removed, handled by GameStats
            // playerLastClassSwitch.Remove(player); - removed, handled by GameStats
            if (gameStats != null && gameStats.PlayerClassSwaps.ContainsKey(player))
                gameStats.PlayerClassSwaps.Remove(player);
            _playerWeaponStats.Remove(player);
            _ebHitStats.Remove(player);
            string dummy;
            persistentBuilds.TryRemove(player._alias, out dummy);
            playerDamageStats.Remove(player._id);
            
            // Stop live data when no players left
            if (arena.Players.Count() == 0)
            {
                try
                {
                    LiveGameDataIntegration.Stop();
                }
                catch (Exception ex)
                {
                    Console.WriteLine(String.Format("[LiveGameData] Error stopping: {0}", ex.Message));
                }
            }
            else
            {
                // Send update with remaining players (async, don't block leave)
                Task.Run(async () => {
                    try
                    {
                        await Task.Delay(500); // Brief delay for clean leave
                        await LiveGameDataIntegration.SendLiveGameData(arena);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(String.Format("[LiveGameData] Error sending leave update: {0}", ex.Message));
                    }
                });
            }
            
            return;
        }

        /// <summary>
        /// Triggered when a player decides to leave the game or spectate.
        /// This ensures that any flags the player was carrying are respawned at their original locations.
        /// </summary>
        [Scripts.Event("Player.LeaveGame")]
        public bool playerLeaveGame(Player player)
        {
            try
            {
                int toxCount = player.getInventoryAmount(2009);
                int tsoCount = player.getInventoryAmount(2005);
                int panCount = player.getInventoryAmount(2007);

                //Log.write(TLog.Normal, string.Format("[Debug] Player {0} leaving with Tox:{1} Tso:{2} Pan:{3}", 
                //    player._alias, toxCount, tsoCount, panCount));

                // Keep messages concise to avoid potential string length issues
                if (toxCount > 0 || tsoCount > 0 || panCount > 0)
                {
                    // Build shorter resource messages
                    var resources = new List<string>();
                    if (toxCount > 0) resources.Add(string.Format("{0} Tox", toxCount));
                    if (tsoCount > 0) resources.Add(string.Format("{0} Tso", tsoCount));
                    if (panCount > 0) resources.Add(string.Format("{0} Pan", panCount));

                    // Keep message compact
                    string message = string.Format("&{0}: {1}", player._alias, string.Join("/", resources));
                    if (message.Length <= 128) // Add length check
                    {
                        arena.sendArenaMessage(message);
                    }
                }

                if (player._team != null)
                {
                    //Log.write(TLog.Normal, string.Format("[Debug] Player {0} team: {1}", 
                    //    player._alias, player._team._name));

                    if (player._team._name.Contains(" T"))
                    {
                        //Log.write(TLog.Normal, "[Debug] Attempting to spawn minerals for Titan player");
                        // Spawn their minerals for any they had in the Titan DropShip fixed coordinate
                        if (toxCount > 0)
                        {
                            ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                            if (item2009 != null)
                            {
                                arena.itemSpawn(item2009, (ushort)toxCount, 689 * 16, 457 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tox at Titan dropship", toxCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tox item info");
                            }
                        }
                        if (tsoCount > 0)
                        {
                            ItemInfo item2005 = arena._server._assets.getItemByID(2005);
                            if (item2005 != null)
                            {
                                arena.itemSpawn(item2005, (ushort)tsoCount, 689 * 16, 462 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tso at Titan dropship", tsoCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tso item info");
                            }
                        }
                        if (panCount > 0)
                        {
                            ItemInfo item2007 = arena._server._assets.getItemByID(2007);
                            if (item2007 != null)
                            {
                                arena.itemSpawn(item2007, (ushort)panCount, 689 * 16, 465 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Pan at Titan dropship", panCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Pan item info");
                            }
                        }
                    }
                    else if (player._team._name.Contains(" C"))
                    {
                        //Log.write(TLog.Normal, "[Debug] Attempting to spawn minerals for Collective player");
                        // Spawn their minerals for any they had in the Collective DropShip fixed coordinate
                        if (toxCount > 0)
                        {
                            ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                            if (item2009 != null)
                            {
                                arena.itemSpawn(item2009, (ushort)toxCount, 689 * 16, 610 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tox at Collective dropship", toxCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tox item info");
                            }
                        }
                        if (tsoCount > 0)
                        {
                            ItemInfo item2005 = arena._server._assets.getItemByID(2005);
                            if (item2005 != null)
                            {
                                arena.itemSpawn(item2005, (ushort)tsoCount, 689 * 16, 615 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Tso at Collective dropship", tsoCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Tso item info");
                            }
                        }
                        if (panCount > 0)
                        {
                            ItemInfo item2007 = arena._server._assets.getItemByID(2007);
                            if (item2007 != null)
                            {
                                arena.itemSpawn(item2007, (ushort)panCount, 689 * 16, 618 * 16, null);
                                //Log.write(TLog.Normal, string.Format("[Debug] Spawned {0} Pan at Collective dropship", panCount));
                            }
                            else
                            {
                                //Log.write(TLog.Error, "[Debug] Failed to get Pan item info");
                            }
                        }

                        // Keep leave message short
                        string leaveMsg = string.Format("&{0} left", player._alias);
                        if (leaveMsg.Length <= 128)
                        {
                            arena.sendArenaMessage(leaveMsg);
                        }
                    }
                    else
                    {
                        //Log.write(TLog.Normal, string.Format("[Debug] Player {0} team name did not match expected patterns", 
                            //player._alias));
                    }
                }
                else
                {
                    //Log.write(TLog.Normal, string.Format("[Debug] Player {0} has no team", player._alias));
                }
            }
            catch (Exception ex)
            {
                //Log.write(TLog.Error, "Error in playerLeave: " + ex.ToString());
            }
            if (!arena._name.Contains("Arena 1"))
                deprizeMinPremades(player, false, false); // Remove items regardless of skill

            // Loop through each flag in the current map
            foreach (var flag in currentMap.Flags)
            {
                // Retrieve the flag object from the arena using the flag's name
                var fs = arena.getFlag(flag.Item1);  // flag.Item1 is the flag name

                if (fs != null && fs.carrier == player)
                {
                    // The player is carrying this flag
                    // Reset the flag's position to its original coordinates
                    fs.posX = (short)(flag.Item2 * 16);  // flag.Item2 is X coordinate
                    fs.posY = (short)(flag.Item3 * 16);  // flag.Item3 is Y coordinate

                    fs.bActive = true;      // Ensure the flag is active
                    fs.carrier = null;      // Clear the carrier
                    fs.team = null;         // Reset the team if necessary

                    // Update the flag's status for all players
                    Helpers.Object_Flags(arena.Players, fs);

                    // Since a player can carry only one flag, we can exit the loop
                    break;
                }
            }

            return true;
        }

        /// <summary>
        /// Called when the game begins
        /// </summary>
        [Scripts.Event("Game.Start")]
        public bool StartGame()
        {

            if (arena._name.Contains("CTFDL") || arena._name.Contains("CTFPL") || arena._name.Contains("OVDL")){
                // Disable champ item conversion for CTFDL or OVDL arenas
                isChampEnabled = false;
            }

            if (!isChampEnabled)
            {
                RemoveChampItems();
            }

            //Reset Flags
            if (currentEventType == EventType.MiniTP)
            {
                InitializeMiniTPEvent();
            } else {
                arena.flagReset();
                SpawnMapFlags();
            }

            if (!isOVD && (currentEventType != EventType.MiniTP))
            {
                // Let's not disturb the teams that OvD uses.
                SpawnMapPlayers();
            }
            
            HealAll();

            gameState = GameState.ActiveGame;
            flagMode = CTFMode.None;

            // Initialize GameStats system for advanced tracking
            if (gameStats == null)
                gameStats = new GameStats(arena, this);

            // Initialize LiveGameDataIntegration for live updates
            if (gameStats != null)
            {
                CTFGameType.LiveGameDataIntegration.Initialize(arena, gameStats.PlayerClassPlayTimes, gameStats.PlayerLastClassSwitch);
            }

            ResetKiller(null);
            killStreaks.Clear();

            //Team team1 = arena.Teams.ElementAtOrDefault(1);
            //Team team2 = arena.Teams.ElementAtOrDefault(2);
            List<Team> teamsWithPlayers = arena.Teams.Where(t => t.ActivePlayers.Count() > 0).ToList();
            Team team1 = teamsWithPlayers.FirstOrDefault(t => t._name.Contains(" T") || t._name.Contains("Titan"));
            Team team2 = teamsWithPlayers.FirstOrDefault(t => t._name.Contains(" C") || t._name.Contains("Collective"));

            // Extra check to make sure everyone is in dropship at game start
            // get all players in arena, if they are not on DropShip terrain 4, warp them back to the dropship by warping them warp group 2
            if (isOVD){
                // Set over time to 30                
                ScheduleOvertime(30);
                foreach (Player p in arena.PlayersIngame)
                {
                    // Skip warping if player is a Dueler
                    if (GetPrimarySkillName(p) == "Dueler")
                        continue;

                    // Get player's current terrain ID
                    int terrainID = arena.getTerrainID(p._state.positionX, p._state.positionY);
                    // If player is not on dropship terrain (ID 4), warp them to warp group 2
                    if (terrainID != 4)
                    {
                        p.sendMessage(0, "You have been warped back to the DropShip for the game start.");
                        // Get warp group 2 coordinates from LIO
                        // Warp players to fixed coordinates based on their team

                        if (p._team == team1)
                        {
                            p.warp(682 * 16, 459 * 16); // Team 1 coordinates
                        }
                        else if (p._team == team2) 
                        {
                            p.warp(682 * 16, 614 * 16); // Team 2 coordinates
                        }
                    }
                }
            }

            //string teamNames = string.Join(", ", teamsWithPlayers.Select(t => t._name));
            //arena.sendArenaMessage(string.Format("Current teams with players: {0}", teamNames), 0);
            
            int team1FieldMedicCount = team1 != null ? arena.Players.Count(p => p._team._name == team1._name && p._skills.Values.Any(s => s.skill.Name == "Field Medic")) : 0;
            int team1CombatEngineerCount = team1 != null ? arena.Players.Count(p => p._team._name == team1._name && p._skills.Values.Any(s => s.skill.Name == "Combat Engineer")) : 0;
            int team2FieldMedicCount = team2 != null ? arena.Players.Count(p => p._team._name == team2._name && p._skills.Values.Any(s => s.skill.Name == "Field Medic")) : 0;
            int team2CombatEngineerCount = team2 != null ? arena.Players.Count(p => p._team._name == team2._name && p._skills.Values.Any(s => s.skill.Name == "Combat Engineer")) : 0;

            // Debug message for team counts
            // arena.sendArenaMessage(string.Format("Team 1: Field Medics - {0}, Combat Engineers - {1}. Team 2: Field Medics - {2}, Combat Engineers - {3}.", team1FieldMedicCount, team1CombatEngineerCount, team2FieldMedicCount, team2CombatEngineerCount));

            foreach (Player p in arena.Players)
            {
                // Setup equipment skills for the player
                SetupEquipmentSkills(p);

                // string buildString;
                // if (persistentBuilds.TryGetValue(p._alias, out buildString))
                // {
                //     WipeAndBuy(p, buildString, true);
                // }

                string skillName = GetPrimarySkillName(p);
                PlayerStreak temp = new PlayerStreak();
                temp.lastKillerCount = 0;
                temp.lastUsedWeap = null;
                temp.lastUsedWepKillCount = 0;
                temp.lastUsedWepTick = -1;
                killStreaks.Add(p._alias, temp);
                if (currentEventType == EventType.Gladiator){
                    WarpPlayerToSpawn(p);
                }
                if (currentEventType == EventType.CTFX){
                    WarpPlayerToRange(p, 985, 997, 1117, 1129);
                    return false;
                }
                // if (currentEventType == EventType.TDM && _tdmInstance != null){
                //     _tdmInstance.WarpPlayerToTDMSpawn(p);
                // }
                if (currentEventType == EventType.MiniTP){
                    if (p._team._name.Contains("Titan"))
                        WarpPlayerToRange(p, 654, 654, 518, 518);
                    else if (p._team._name.Contains("Collective")) 
                        WarpPlayerToRange(p, 648, 648, 565, 565);
                    return false;
                }

                Team playerTeam = p._team;
                if (!arena._name.Contains("Arena 1"))
                {
                    if (playerTeam == team1)
                    {
                        // Handling for Team 1 Field Medics
                        if (team1FieldMedicCount > 1 && skillName == "Field Medic")
                        {
                            deprizeMinPremades(p, false, false);
                            ItemInfo item2005 = arena._server._assets.getItemByID(2005);
                            ItemInfo item2007 = arena._server._assets.getItemByID(2007);
                            //arena.itemSpawn(item2005, 150, 689 * 16, 615 * 16, null);
                            arena.itemSpawn(item2005, 150, 689 * 16, 462 * 16, null);
                            arena.itemSpawn(item2007, 150, 689 * 16, 465 * 16, null);
                        }
                        else //if (skillName == "Field Medic")
                        {
                            deprizeMinPremades(p, true, false);
                        }

                        // Handling for Team 1 Combat Engineers
                        if (team1CombatEngineerCount > 1 && skillName == "Combat Engineer")
                        {
                            deprizeMinPremades(p, false, false);
                            ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                            //arena.itemSpawn(item2009, 150, 689 * 16, 610 * 16, null);
                            arena.itemSpawn(item2009, 150, 689 * 16, 457 * 16, null);
                        }
                        else //if (skillName == "Combat Engineer")
                        {
                            deprizeMinPremades(p, true, false);
                        }
                    }
                    else if (playerTeam == team2)
                    {
                        // Handling for Team 2 Field Medics
                        if (team2FieldMedicCount > 1 && skillName == "Field Medic")
                        {
                            deprizeMinPremades(p, false, false);
                            ItemInfo item2005 = arena._server._assets.getItemByID(2005);
                            ItemInfo item2007 = arena._server._assets.getItemByID(2007);
                            //arena.itemSpawn(item2005, 150, 689 * 16, 615 * 16, null);
                            arena.itemSpawn(item2007, 150, 689 * 16, 618 * 16, null);
                            arena.itemSpawn(item2005, 150, 689 * 16, 615 * 16, null);
                            //arena.itemSpawn(item2005, 150, 689 * 16, 462 * 16, null);
                        }
                        else //if (skillName == "Field Medic")
                        {
                            deprizeMinPremades(p, true, false);
                        }

                        // Handling for Team 2 Combat Engineers
                        if (team2CombatEngineerCount > 1 && skillName == "Combat Engineer")
                        {
                            deprizeMinPremades(p, false, false);
                            ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                            arena.itemSpawn(item2009, 150, 689 * 16, 610 * 16, null);
                            //arena.itemSpawn(item2009, 150, 689 * 16, 457 * 16, null);
                        }
                        else //if (skillName == "Combat Engineer")
                        {
                            deprizeMinPremades(p, true, false);
                        }
                    }
                }
            }
            // Reset auto-drop tracking at game start
            playersWithAutoDrops.Clear();

            //Let everyone know
            arena.sendArenaMessage("Game has started!", CFG.flag.resetBong);
            return true;
        }

        private bool AreAllFlagsCapturedByOneTeam()
        {
            Team potentialWinningTeam = null;

            // Check each flag's status
            foreach (Arena.FlagState fs in arena._flags.Values)
            {
                if (fs.bActive)
                {
                    // If no team has been set yet, use the current flag's team
                    if (potentialWinningTeam == null)
                        potentialWinningTeam = fs.team;
                    else if (fs.team != potentialWinningTeam)
                    {
                        // If a flag is held by a different team, not all flags are captured
                        return false;
                    }
                }
            }

            // All flags are captured by the same team, or no active flags left
            return potentialWinningTeam != null;
        }

        /// <summary>
        /// Attempts to spawn a given flag; returns true if successful, false if no suitable location found.
        /// </summary>
        public bool RandomizeFlagLocation(Arena.FlagState fs)
        {   //Set offsets
            int levelX = arena._server._assets.Level.OffsetX * 16;
            int levelY = arena._server._assets.Level.OffsetY * 16;

            //Give it some valid coordinates
            int attempts = 0;
            do
            {   //Make sure we're not doing this infinitely
                if (attempts++ > 200)
                {
                    Log.write(TLog.Error, "Unable to satisfy flag spawn for '{0}'.", fs.flag);
                    return false;
                }

                fs.posX = (short)(fs.flag.GeneralData.OffsetX - levelX);
                fs.posY = (short)(fs.flag.GeneralData.OffsetY - levelY);
                fs.oldPosX = fs.posX;
                fs.oldPosY = fs.posY;

                //Taken from Math.cs
                //For random flag spawn if applicable
                int lowerX = fs.posX - ((short)fs.flag.GeneralData.Width / 2);
                int higherX = fs.posX + ((short)fs.flag.GeneralData.Width / 2);
                int lowerY = fs.posY - ((short)fs.flag.GeneralData.Height / 2);
                int higherY = fs.posY + ((short)fs.flag.GeneralData.Height / 2);

                //Clamp within the map coordinates
                int mapWidth = (arena._server._assets.Level.Width - 1) * 16;
                int mapHeight = (arena._server._assets.Level.Height - 1) * 16;

                lowerX = Math.Min(Math.Max(0, lowerX), mapWidth);
                higherX = Math.Min(Math.Max(0, higherX), mapWidth);
                lowerY = Math.Min(Math.Max(0, lowerY), mapHeight);
                higherY = Math.Min(Math.Max(0, higherY), mapHeight);

                //Randomly generate some coordinates!
                int tmpPosX = ((short)arena._rand.Next(lowerX, higherX));
                int tmpPosY = ((short)arena._rand.Next(lowerY, higherY));

                //Check for allowable terrain drops
                int terrainID = arena.getTerrainID(tmpPosX, tmpPosY);
                for (int terrain = 0; terrain < 15; terrain++)
                {
                    if (terrainID == terrain && fs.flag.FlagData.FlagDroppableTerrains[terrain] == 1)
                    {
                        fs.posX = (short)tmpPosX;
                        fs.posY = (short)tmpPosY;
                        fs.oldPosX = fs.posX;
                        fs.oldPosY = fs.posY;
                        break;
                    }
                }

                //Check the terrain settings
                if (arena.getTerrain(fs.posX, fs.posY).flagTimerSpeed == 0)
                    continue;

            }
            while (arena.getTile(fs.posX, fs.posY).Blocked);

            return true;
        }

        /// <summary>
        /// Called when the game ends
        /// </summary>
        [Scripts.Event("Game.End")]
        public bool EndGame()
        {
            // Stop auto-save if it's running
            if (isAutoSaving)
            {
                isAutoSaving = false;
                autoSaveTimer.Dispose();
                autoSaveTimer = null;
            }
            if (!isOVD)
            {
                if (winningTeam == null)
                {
                    arena.sendArenaMessage("There was no winner.");
                }
                else
                {
                    UpdateGameEndFlagStats();

                    arena.sendArenaMessage(winningTeam._name + " has won the game!");
                    winningTeam = null;
                }
            }
            else
            {
                arena.sendArenaMessage("&Game has ended, Host may either *reset to spec all, or *restart for a rematch", 3);
            }

            if (isOVD && !arena._name.Contains("#") && arena._name != "Arena 1"){
                // NEW: Validate game before exporting stats
                var allPlayers = arena.Players.ToList();
                bool isValidGame = WebIntegration.IsValidGameForStats(allPlayers);
                
                if (!isValidGame)
                {
                    Console.WriteLine("Game does not meet stats export criteria (need 4+ players per team, exactly 1 C and 1 T team). Skipping stats export.");
                    arena.sendArenaMessage("Game did not meet criteria for stats export (need 4+ per team, 1 C and 1 T team)");
                }
                else
                {
                    // MODIFIED: Use GameStats system for comprehensive stats export
                    try
                    {
                        // Determine game mode based on player count
                        string gameMode = (arena.PlayersIngame.Count() <= 10) ? "OvD" : "Mix";
                        
                        // Export stats using the new GameStats system
                        if (gameStats != null)
                        {
                            gameStats.ExportGameStats(gameMode, baseUsed, winningTeam, winningTeamOVD);
                            
                            // Send player stats to website using the new system
                            var playerStatsForWeb = gameStats.GetPlayerStatsForWebIntegration(gameMode, baseUsed, winningTeam, winningTeamOVD);
                            if (playerStatsForWeb != null && playerStatsForWeb.Count > 0 && this.IsValidGameForStatsExport(arena.Players.ToList()))
                            {
                                string gameId = String.Format("{0}_{1}", arena._name, DateTime.UtcNow.ToString("yyyyMMdd_HHmmss"));
                                Task.Run(async () => {
                                    try
                                    {
                                        await CTFGameType.PlayerStatsIntegration.SendPlayerStatsToWebsite(playerStatsForWeb, gameId);
                                    }
                                    catch (Exception asyncEx)
                                    {
                                        Console.WriteLine(String.Format("Error in async player stats submission: {0}", asyncEx.Message));
                                    }
                                });
                            }
                        }
                        Console.WriteLine("Valid game detected - stats exported to website");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(String.Format("Error in game stats processing: {0}", ex.Message));
                    }
                }
            }
            gameState = GameState.PostGame;
            arena.flagReset();
            isSD = false;
            isSecondOvertime = false;
            overtimeStart = 0;
            
            // Stop live data updates when game ends
            CTFGameType.LiveGameDataIntegration.Stop();
            secondOvertimeStart = 0;
            redirectSide = null;
            redirectBase = null;
            _turretStats.Clear();
            
            // Clean up GameStats system
            if (gameStats != null)
            {
                gameStats.Dispose();
                gameStats = null;
            }
            
            // Create a deep copy of player weapon stats to properly store last game data
            _lastgamePlayerWeaponStats = new Dictionary<Player, Dictionary<int, WeaponStats>>();
            foreach (var playerEntry in _playerWeaponStats)
            {
                Dictionary<int, WeaponStats> weaponCopy = new Dictionary<int, WeaponStats>();
                foreach (var weaponEntry in playerEntry.Value)
                {
                    // Create a new WeaponStats object with the same values
                    WeaponStats statsCopy = new WeaponStats
                    {
                        ShotsFired = weaponEntry.Value.ShotsFired,
                        ShotsLanded = weaponEntry.Value.ShotsLanded,
                        AverageDistance = weaponEntry.Value.AverageDistance,
                        TotalHits = weaponEntry.Value.TotalHits
                    };
                    weaponCopy[weaponEntry.Key] = statsCopy;
                }
                _lastgamePlayerWeaponStats[playerEntry.Key] = weaponCopy;
            }
            _averageItemsUsedPerDeath.Clear();
            _playerWeaponStats.Clear();
            _ebHitStats.Clear();
            minedStats.Clear();
            // playerClassPlayTimes.Clear(); - removed, handled by GameStats
            // playerLastClassSwitch.Clear(); - removed, handled by GameStats
            playerClassSwaps.Clear(); // Keep this one as it's still used
            winningTeamOVD = "defense";
            summonedCounts.Clear();
            is5v5 = false;
            baseUsed = "Unknown";
            killStreaks.Clear();
            mixGameActive = true;
            isMixActive = false;
            playerPool.Clear();
            playerRolePreferences.Clear();
            assignedPlayersGlobal.Clear();
            team1.Clear();
            team2.Clear();
            aliasCounter = 0;
            signUpOrder.Clear();
            disallowClassChange.Clear();
            playerDamageStats.Clear();
            return true;
        }

        /// <summary>
        /// Called to reset the game state
        /// </summary>
        [Scripts.Event("Game.Reset")]
        public bool gameReset()
        {
            gameState = GameState.PostGame;
            arena.flagReset();
            ResetKiller(null);
            killStreaks.Clear();

            // Reset mix state and player pool
            mixGameActive = true;
            isMixActive = false;
            isSD = false;
            isSecondOvertime = false;
            overtimeStart = 0;
            secondOvertimeStart = 0;
            playerPool.Clear();
            playerRolePreferences.Clear();
            assignedPlayersGlobal.Clear();
            team1.Clear();
            team2.Clear();
            aliasCounter = 0;
            signUpOrder.Clear();
            redirectSide = null;
            redirectBase = null;
            is5v5 = false;
            baseUsed = "Unknown";
            minedStats.Clear();
            _turretStats.Clear();
            // Create a deep copy of player weapon stats to properly store last game data
            // _lastgamePlayerWeaponStats = new Dictionary<Player, Dictionary<int, WeaponStats>>();
            // foreach (var playerEntry in _playerWeaponStats)
            // {
            //     Dictionary<int, WeaponStats> weaponCopy = new Dictionary<int, WeaponStats>();
            //     foreach (var weaponEntry in playerEntry.Value)
            //     {
            //         // Create a new WeaponStats object with the same values
            //         WeaponStats statsCopy = new WeaponStats
            //         {
            //             ShotsFired = weaponEntry.Value.ShotsFired,
            //             ShotsLanded = weaponEntry.Value.ShotsLanded,
            //             AverageDistance = weaponEntry.Value.AverageDistance,
            //             TotalHits = weaponEntry.Value.TotalHits
            //         };
            //         weaponCopy[weaponEntry.Key] = statsCopy;
            //     }
            //     _lastgamePlayerWeaponStats[playerEntry.Key] = weaponCopy;
            // }
            // _playerWeaponStats.Clear();
            _ebHitStats.Clear();
            // playerClassPlayTimes.Clear(); - removed, handled by GameStats
            // playerLastClassSwitch.Clear(); - removed, handled by GameStats
            playerClassSwaps.Clear(); // Keep this one as it's still used
            winningTeamOVD = "defense";
            summonedCounts.Clear();
            disallowClassChange.Clear();
            playerDamageStats.Clear();

            // Clean up event-specific state during reset
            if (currentEventType == EventType.Gladiator)
            {
                CleanupGladiatorEvent();
            }
            
            // Reset event type to prevent event conflicts
            currentEventType = EventType.None;

            // Show breakdown for current game stats
            //arena.breakdown(true);

            if (isOVD)
            {
                arena.sendArenaMessage("& ----=[ Please type ?team spec or ?playing or ?p to ready up for the next game! ]=----", 30);

                // Spec all players and show their individual breakdowns
                foreach (Player p in arena.Players)
                {
                    p.spec("np");
                    //arena.individualBreakdown(p, true); // Show current game stats
                }
            }

            return true;
        }


        #endregion

        #region Player Events
        private Dictionary<string, TurretData> _turretStats = new Dictionary<string, TurretData>();
        public class TurretData
        {
            public string TeamName { get; set; }
            public string TurretType { get; set; }
            public int Kills { get; set; }
            public List<int> PlayersKilled { get; set; }
            public Dictionary<int, int> DamageReceived { get; set; } // Player ID to damage amount

            public TurretData(string teamName, string turretType)
            {
                TeamName = teamName;
                TurretType = turretType;
                Kills = 0;
                PlayersKilled = new List<int>();
                DamageReceived = new Dictionary<int, int>();
            }
        }

        /// <summary>
        /// Triggered when a player dies to a computer(E.G. turret)
        /// </summary>
        [Scripts.Event("Player.ComputerKill")]
        public bool ComputerKill(Player victim, Computer vehicle)
        {
            // Get the turret's team name
            string teamName = vehicle._team != null ? vehicle._team._name : "Neutral";

            // Get the turret's type/name
            string turretType = vehicle._type.Name;

            // Create a composite key
            string key = teamName + ":" + turretType;

            // Declare the variable before using it in TryGetValue
            TurretData data;

            // Get or create the turret's data
            if (!_turretStats.TryGetValue(key, out data))
            {
                data = new TurretData(teamName, turretType);
                _turretStats.Add(key, data);
            }

            // Update the turret's stats
            data.Kills++;
            data.PlayersKilled.Add(victim._id);

            int fragCount = victim.getInventoryAmount(1011);
            int wpCount = victim.getInventoryAmount(1176);
            int repCoilCount = victim.getInventoryAmount(2011);
            int repChargeCount = victim.getInventoryAmount(1049);
            int energizerCount = victim.getInventoryAmount(15);
            int stimCount = victim.getInventoryAmount(47);

            // Update average items used per death for this player
            if (!_averageItemsUsedPerDeath.ContainsKey(victim._alias))
            {
                _averageItemsUsedPerDeath[victim._alias] = new Dictionary<string, double>()
                {
                    {"Frag", fragCount},
                    {"WP", wpCount}, 
                    {"RepCoil", repCoilCount},
                    {"RepCharge", repChargeCount},
                    {"Energizer", energizerCount},
                    {"Stim", stimCount}
                };
            }
            else
            {
                var playerStats = _averageItemsUsedPerDeath[victim._alias];
                playerStats["Frag"] = (playerStats["Frag"] + fragCount) / 2;
                playerStats["WP"] = (playerStats["WP"] + wpCount) / 2;
                playerStats["RepCoil"] = (playerStats["RepCoil"] + repCoilCount) / 2;
                playerStats["RepCharge"] = (playerStats["RepCharge"] + repChargeCount) / 2;
                playerStats["Energizer"] = (playerStats["Energizer"] + energizerCount) / 2;
                playerStats["Stim"] = (playerStats["Stim"] + stimCount) / 2;
            }

            // arena message calling out the player for dying to the turret by humiliating them.
            // Send a humiliating message about dying to a turret with different sounds
            if (turretType == "Auto Turret-Rocket" && DateTime.Now.DayOfWeek != DayOfWeek.Sunday){
                Random rand = new Random();
                int soundNum = rand.Next(1, 5); // 1-4
                string message;
                
                switch(soundNum) {
                    case 1:
                        message = string.Format("*BOOM* {0} was blown to bits by a {1}! Better luck next time!", victim._alias, turretType);
                        foreach (Player p in arena.Players)
                            if (p.IsSpectator)
                                p.sendMessage(1, message);
                        break;
                    case 2:
                        message = string.Format("*KABOOM* {0} didn't see that {1} coming! What a rookie mistake!", victim._alias, turretType);
                        foreach (Player p in arena.Players)
                            if (p.IsSpectator)
                                p.sendMessage(2, message);
                        break;
                    case 3:
                        message = string.Format("*SPLAT* {0} became target practice for a {1}! Maybe try dodging next time?", victim._alias, turretType);
                        foreach (Player p in arena.Players)
                            if (p.IsSpectator)
                                p.sendMessage(3, message);
                        break;
                    case 4:
                        message = string.Format("&WOW! {0} just got destroyed by a {1}! How embarrassing!", victim._alias, turretType);
                        foreach (Player p in arena.Players)
                            if (p.IsSpectator)
                                p.sendMessage(4, message);
                        break;
                }
            }

            return true;
        }

        /// <summary>
        /// Called when a player requests to pick up/drop the flag.
        /// </summary>
        /// <param name="from"></param>
        /// <param name="bPickup"></param>
        /// <param name="bSuccess"></param>
        /// <param name="flag"></param>
        /// <returns></returns>
        // Dictionary to track players and the flags they are carrying
        Dictionary<Player, LioInfo.Flag> playerFlagMap = new Dictionary<Player, LioInfo.Flag>();

        [Scripts.Event("Player.FlagAction")]
        public bool playerFlagAction(Player from, bool bPickup, bool bSuccess, LioInfo.Flag flag)
        {
            if (bPickup && bSuccess)
            {
                // Track the flag the player picked up
                if (!playerFlagMap.ContainsKey(from))
                {
                    playerFlagMap[from] = flag;  // Store the flag the player is carrying
                }

                ctfPlayerProxy.player = from;
                ctfPlayerProxy.Captures++;
                ctfPlayerProxy.player = null;
            }
            else if (!bPickup && bSuccess)
            {
                // If the player successfully drops the flag, remove it from the tracking map
                if (playerFlagMap.ContainsKey(from))
                {
                    playerFlagMap.Remove(from);
                }
            }

            return true;
        }

        public void EmulateSwitch(Player player, bool? isOpen = null)
        {
            // Find the associated switch
            LioInfo.Switch sw = player._server._assets.getLioByID(708) as LioInfo.Switch;

            if (sw == null)
            {
                player.sendMessage(0, "Switch not found.");
                return;
            }

            // Get the current switch state
            Arena.SwitchState ss;
            if (!player._arena._switches.TryGetValue(sw.GeneralData.Id, out ss))
            {
                player.sendMessage(0, "Switch state not found.");
                return;
            }

            // Determine the desired state
            bool currentState = ss.bOpen;
            bool desiredState = isOpen ?? !currentState; // If isOpen is null, toggle the state

            // Call the arena's handlePlayerSwitch method via an event
            player._arena.handleEvent(delegate (Arena arena)
            {
                player._arena.handlePlayerSwitch(player, desiredState, sw);
                // Send a message indicating the switch operation was successful
                player.sendMessage(0, string.Format("Switch operation successful. Switch is now {0}.", desiredState ? "open" : "closed"));
            });
        }

        // Arena boolean if ?energizer command is useable or not, starts disabled
        private bool _energizerCommandEnabled = true;

        /// <summary>
        /// Called when a player sends a chat command
        /// </summary>
        [Scripts.Event("Player.ChatCommand")]
        public bool playerChatCommand(Player player, Player recipient, string command, string payload)
        {
            switch (command.ToLower())
            {
                // case "lm":
                //     // server-side alias for loadmacro
                //     string macroName = payload; // whatever the user typed after "?lm"
                //     CS_Chat pkt = new CS_Chat
                //     {
                //         chatType = Helpers.Chat_Type.Macro,
                //         recipient = "",
                //         message = "?loadmacro " + macroName
                //     };
                //     player._client.sendReliable(pkt);
                //     break;
                case "stim":
                    UseStimPack(player);
                    break;
                case "energizer":
                    if (!_energizerCommandEnabled){
                        player.sendMessage(0, "Energizer command is currently disabled.");
                        break;
                    }
                    UseEnergizer(player);
                    break;
                case "register":
                    InGameRegistration.HandleRegisterCommand(player, command, payload);
                    break;
                case "regstatus":
                    InGameRegistration.HandleCheckRegistrationCommand(player, command, payload);
                    break;
                case "playtime":
                    SendOrderedPlayTimes(player);
                    break;
                case "stats":
                    ListPlayerWeaponStats(player, payload);
                    break;
                case "itemusage":
                    ListPlayerItemUsedAverage(player, payload);
                    break;
                case "playing":
                case "p": // Alias for playing
                    player.spec("spec");
                    break;
                case "np":
                    {
                        player.spec();
                    }
                    break;
                case "pool":
                    DisplayCurrentPlayerPool(player);
                    break;
                case "teamJoin":
                case "t":
                    privateTeams(player, recipient, command, payload);
                    break;
                case "build":
                case "b": // Alias for build
                    // Use fire-and-forget to avoid blocking the event handler
                    Task.Run(async () => {
                        try
                        {
                            await HandleBuildCommand(player, payload);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(String.Format("Error handling build command: {0}", ex.Message));
                        }
                    });
                    break;
                case "wipe":
                case "w":  // Alias for wipe
                    WipeInventory(player, payload);
                    break;
                case "bw":
                    // Use fire-and-forget to avoid blocking the event handler
                    Task.Run(async () => {
                        try
                        {
                            await WipeAndBuy(player, payload, false);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(String.Format("Error handling bw command: {0}", ex.Message));
                        }
                    });
                    break;
                case "bwd":
                    // Use fire-and-forget to avoid blocking the event handler
                    Task.Run(async () => {
                        try
                        {
                            await WipeBuyAndMaxAmmo(player, payload);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(String.Format("Error handling bwd command: {0}", ex.Message));
                        }
                    });
                    break;
                case "d":
                    DropUnusedItems(player, payload);
                    break;
                case "short":
                    commandHandler.HandleShortCommand(player, payload);
                    break;
                case "swap":
                    if (player.IsDead)
                    {
                        // Queue the class swap for when the player respawns
                        queuedClassSwap[player] = payload;
                        player.sendMessage(0, "You are dead. Your class change will be applied when you respawn.");
                    }
                    else
                    {
                        commandHandler.HandleSwapCommand(player, payload, CFG, this, true, false);
                        // If MiniTP event, warp player to dropship based on team on.
                        if (currentEventType == EventType.MiniTP){
                            if (player._team._name.Contains("Titan")) {
                                WarpPlayerToRange(player, 654, 654, 518, 518);
                            }
                            else if (player._team._name.Contains("Collective")) {
                                WarpPlayerToRange(player, 648, 648, 565, 565);
                            }
                        }
                    }
                    break;
                case "autosummon":
                case "as":
                    // Toggle summon automation for this player
                    bool currentState = summonAutomationEnabled.ContainsKey(player) ? summonAutomationEnabled[player] : false;
                    summonAutomationEnabled[player] = !currentState;
                    
                    if (summonAutomationEnabled[player])
                    {
                        player.sendMessage(0, "Summon automation enabled. You will automatically request summons when you die.");
                    }
                    else
                    {
                        player.sendMessage(0, "Summon automation disabled. You will need to manually request summons. Use ?summon again to re-enable.");
                    }
                    break;
                case "champ":
                    if (isChampEnabled)
                        HandleChampCommand(player);
                    else
                        player.sendMessage(-1, "The champ command is currently disabled.");
                    break;
                case "reloadchamps":
                case "champconfig":
                    // Reload champion configuration (mod-only command)
                    if (player.PermissionLevel >= Data.PlayerPermission.Mod)
                    {
                        if (_championEffects != null)
                        {
                            _championEffects.ReloadConfiguration();
                            player.sendMessage(0, String.Format("Champion configuration reloaded. Season: {0}, Champions: {1}", 
                                _championEffects.GetCurrentSeason(), _championEffects.GetChampionCount()));
                        }
                        else
                        {
                            player.sendMessage(-1, "Champion effects system is not initialized.");
                        }
                    }
                    else
                    {
                        player.sendMessage(-1, "You do not have permission to reload champion configuration.");
                    }
                    break;
                case "inv":
                    DisplayInventoryItems(player);
                    break;
                case "mg":
                    BuildTurret(player, "MG Turret");
                    break;
                case "rocket":
                    BuildTurret(player, "Rocket Turret");
                    break;
                case "plasma":
                    BuildTurret(player, "Plasma Turret");
                    break;
                case "duel":
                    // Check if this is a new dueling system command with parameters
                    if (!string.IsNullOrEmpty(payload))
                    {
                        // Handle new dueling system commands (challenge, accept, decline, etc.)
                        // Use fire-and-forget to avoid blocking the event handler
                        Task.Run(async () => {
                            try
                            {
                                await CTFGameType.DuelingSystem.HandleDuelCommand(player, command, payload);
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine(String.Format("Error handling duel command: {0}", ex.Message));
                            }
                        });
                    }
                    else
                    {
                        // Handle legacy duel command (just "?duel" with no parameters)
                        Duel(player);
                    }
                    break;
                case "mix":
                    if (isMixActive)
                    {
                        HandleRoleSelection(player, payload);
                    }
                    else
                    {
                        player.sendMessage(-1, "*Mix is not currently active.");
                    }
                    break;
                case "glad":
                    if (currentEventType == EventType.Gladiator)
                    {
                        JoinGladiatorEvent(player);
                    }
                    else
                    {
                        player.sendMessage(-1, "Gladiator event is not currently active.");
                    }
                    break;
                case "autobuy":
                case "ab":
                    bool enabled = false;
                    if (!autoBuyEnabled.ContainsKey(player) || !autoBuyEnabled[player])
                    {
                        autoBuyEnabled[player] = true;
                        enabled = true;
                    }
                    else
                    {
                        autoBuyEnabled[player] = false;
                    }
                    player.sendMessage(0, String.Format("AutoBuy is now {0}. Use ?autobuy (or ?ab) again to toggle.", enabled ? "ENABLED" : "DISABLED"));
                    break;
                case "autodrop":
                case "ad":
                    bool dropEnabled = false;
                    if (!autoDropEnabled.ContainsKey(player) || !autoDropEnabled[player])
                    {
                        autoDropEnabled[player] = true;
                        dropEnabled = true;
                    }
                    else
                    {
                        autoDropEnabled[player] = false;
                    }
                    player.sendMessage(0, String.Format("AutoDrop is now {0}. Use ?autodrop (or ?ad) again to toggle.", dropEnabled ? "ENABLED" : "DISABLED"));
                    break;
                    
                // CTFBot debug commands for TDM events
                // case "botcount":
                //     if (currentEventType == EventType.TDM && _tdmInstance != null && _tdmInstance.IsGameActive)
                //     {
                //         var allActiveTeams = new List<Team>();
                        
                //         // Try common team names first
                //         var botCountTeamNames = new string[] { 
                //             "Collective Military", "Titan Militia", 
                //             "Collective Offense", "Titan Offense",
                //             "Collective", "Titan", 
                //             "Team A", "Team B",
                //             "Red Team", "Blue Team"
                //         };
                        
                //         foreach (string teamName in botCountTeamNames)
                //         {
                //             var team = arena.getTeamByName(teamName);
                //             if (team != null && !allActiveTeams.Contains(team))
                //             {
                //                 allActiveTeams.Add(team);
                //             }
                //         }
                        
                //         // If no teams found using common names, try player teams
                //         if (allActiveTeams.Count == 0)
                //         {
                //             foreach (Player p in arena.PlayersIngame)
                //             {
                //                 if (p._team != null && !allActiveTeams.Contains(p._team))
                //                 {
                //                     allActiveTeams.Add(p._team);
                //                 }
                //             }
                //         }
                        
                //         var botCountTeams = allActiveTeams;
                        
                //         if (botCountTeams.Count > 0)
                //         {
                //             var teamBotCounts = new Dictionary<Team, int>();
                //             int totalBots = 0;
                            
                //             foreach (var team in botCountTeams)
                //             {
                //                 int botCount = _ctfBots.Count(bot => !bot.IsDead && bot._team == team);
                //                 teamBotCounts[team] = botCount;
                //                 totalBots += botCount;
                //             }
                            
                //             player.sendMessage(0, String.Format("TDM Bot Count - Total: {0}", totalBots));
                //             foreach (var kvp in teamBotCounts)
                //             {
                //                 player.sendMessage(0, String.Format("  {0}: {1}/{2}", kvp.Key._name, kvp.Value, MAX_BOTS_PER_TEAM));
                //             }
                //         }
                //         else
                //         {
                //             player.sendMessage(0, "Error: No teams found in arena");
                //         }
                //     }
                //     else
                //     {
                //         player.sendMessage(0, "TDM event must be active to view bot count");
                //     }
                //     break;
                    
                // case "botinfo":
                //     if (currentEventType == EventType.TDM && _tdmInstance != null && _tdmInstance.IsGameActive)
                //     {
                //         var aliveBots = _ctfBots.Where(bot => !bot.IsDead).ToList();
                        
                //         if (aliveBots.Count == 0)
                //         {
                //             player.sendMessage(0, "No active bots in TDM");
                //             break;
                //         }
                        
                //         player.sendMessage(0, String.Format("Active TDM Bots ({0}):", aliveBots.Count));
                        
                //         foreach (var bot in aliveBots.Take(5)) // Show max 5 bots
                //         {
                //             string teamName = bot._team != null ? bot._team._name : "NO TEAM";
                //             string botName = bot._type.Name != null ? bot._type.Name : "CTFBot";
                //             player.sendMessage(0, String.Format("Bot: {0} Team={1} Pos=({2},{3}) Vehicle={4} HP={5}", 
                //                 botName, teamName, bot._state.positionX/16, bot._state.positionY/16, 
                //                 bot._type.Id, bot._state.health));
                //         }
                        
                //         if (aliveBots.Count > 5)
                //         {
                //             player.sendMessage(0, String.Format("... and {0} more bots", aliveBots.Count - 5));
                //         }
                //     }
                //     else
                //     {
                //         player.sendMessage(0, "TDM event must be active to view bot info");
                //     }
                //     break;
                    
                // case "botspawn":
                //     if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                //     {
                //         player.sendMessage(0, "Insufficient permissions");
                //         break;
                //     }
                    
                //     if (currentEventType != EventType.TDM || _tdmInstance == null || !_tdmInstance.IsGameActive)
                //     {
                //         player.sendMessage(0, "TDM event must be active to spawn bots");
                //         break;
                //     }
                    
                //     var allBotSpawnTeams = new List<Team>();
                    
                //     // Try common team names first
                //     var spawnTeamNames = new string[] { 
                //         "Collective Military", "Titan Militia", 
                //         "Collective Offense", "Titan Offense",
                //         "Collective", "Titan", 
                //         "Team A", "Team B",
                //         "Red Team", "Blue Team"
                //     };
                    
                //     foreach (string teamName in spawnTeamNames)
                //     {
                //         var team = arena.getTeamByName(teamName);
                //         if (team != null && !allBotSpawnTeams.Contains(team))
                //         {
                //             allBotSpawnTeams.Add(team);
                //         }
                //     }
                    
                //     // If no teams found using common names, try player teams
                //     if (allBotSpawnTeams.Count == 0)
                //     {
                //         foreach (Player p in arena.PlayersIngame)
                //         {
                //             if (p._team != null && !allBotSpawnTeams.Contains(p._team))
                //             {
                //                 allBotSpawnTeams.Add(p._team);
                //             }
                //         }
                //     }
                    
                //     var spawnTeams = allBotSpawnTeams;
                    
                //     if (spawnTeams.Count == 0)
                //     {
                //         player.sendMessage(0, "No teams found in arena");
                //         break;
                //     }
                    
                //     Team targetTeam = null;
                    
                //     if (string.IsNullOrEmpty(payload))
                //     {
                //         // No team specified - spawn on team with fewest bots
                //         var teamBotCounts = new Dictionary<Team, int>();
                //         foreach (var team in spawnTeams)
                //         {
                //             teamBotCounts[team] = _ctfBots.Count(bot => !bot.IsDead && bot._team == team);
                //         }
                        
                //         targetTeam = teamBotCounts.OrderBy(kvp => kvp.Value).FirstOrDefault().Key;
                //         player.sendMessage(0, String.Format("Usage: ?botspawn [team_name] or leave blank for auto-balance"));
                //         player.sendMessage(0, "Available teams: " + String.Join(", ", spawnTeams.Select(t => t._name)));
                //     }
                //     else
                //     {
                //         // Find team by partial name match
                //         string searchName = payload.ToLower();
                //         targetTeam = spawnTeams.FirstOrDefault(team => team._name.ToLower().Contains(searchName));
                        
                //         if (targetTeam == null)
                //         {
                //             player.sendMessage(0, "Team not found. Available teams: " + String.Join(", ", spawnTeams.Select(t => t._name)));
                //             break;
                //         }
                //     }
                    
                //     if (targetTeam != null)
                //     {
                //         SpawnCTFBotForTDMTeam(targetTeam);
                //         player.sendMessage(0, String.Format("Spawned CTFBot for {0}", targetTeam._name));
                //     }
                //     else
                //     {
                //         player.sendMessage(0, "Could not determine target team");
                //     }
                //     break;
                    
                // case "botkill":
                //     if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                //     {
                //         player.sendMessage(0, "Insufficient permissions");
                //         break;
                //     }
                    
                //     int killedBots = 0;
                //     foreach (var bot in _ctfBots.ToList())
                //     {
                //         if (!bot.IsDead)
                //         {
                //             bot.destroy(false);
                //             killedBots++;
                //         }
                //     }
                //     _ctfBots.Clear();
                //     player.sendMessage(0, String.Format("Killed {0} active bots", killedBots));
                //     break;
                    
                // case "botdebug":
                //     if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                //     {
                //         player.sendMessage(0, "Insufficient permissions");
                //         break;
                //     }
                    
                //     player.sendMessage(0, "=== TDM Bot Debug Info ===");
                //     player.sendMessage(0, String.Format("- TDM Active: {0}", currentEventType == EventType.TDM && _tdmInstance != null && _tdmInstance.IsGameActive));
                //     player.sendMessage(0, String.Format("- Total Bots: {0}", _ctfBots.Count(bot => !bot.IsDead)));
                //     player.sendMessage(0, String.Format("- Spawn Interval: {0}-{1}ms", BOT_SPAWN_MIN_INTERVAL, BOT_SPAWN_MAX_INTERVAL));
                //     player.sendMessage(0, String.Format("- Last Spawn: {0}ms ago", Environment.TickCount - _tickLastBotSpawn));
                    
                //     var debugAllTeams = new List<Team>();
                    
                //     // Try common team names first
                //     var debugTeamNames = new string[] { 
                //         "Collective Military", "Titan Militia", 
                //         "Collective Offense", "Titan Offense",
                //         "Collective", "Titan", 
                //         "Team A", "Team B",
                //         "Red Team", "Blue Team"
                //     };
                    
                //     foreach (string teamName in debugTeamNames)
                //     {
                //         var team = arena.getTeamByName(teamName);
                //         if (team != null && !debugAllTeams.Contains(team))
                //         {
                //             debugAllTeams.Add(team);
                //         }
                //     }
                    
                //     // If no teams found using common names, try player teams
                //     if (debugAllTeams.Count == 0)
                //     {
                //         foreach (Player p in arena.PlayersIngame)
                //         {
                //             if (p._team != null && !debugAllTeams.Contains(p._team))
                //             {
                //                 debugAllTeams.Add(p._team);
                //             }
                //         }
                //     }
                //     player.sendMessage(0, String.Format("- Teams Found: {0}", debugAllTeams.Count));
                    
                //     foreach (var team in debugAllTeams)
                //     {
                //         int teamBots = _ctfBots.Count(bot => !bot.IsDead && bot._team == team);
                //         player.sendMessage(0, String.Format("  {0}: {1}/{2} bots (ID: {3})", team._name, teamBots, MAX_BOTS_PER_TEAM, team._id));
                //     }
                    
                //     player.sendMessage(0, String.Format("- Spawn A: ({0},{1})", COLLECTIVE_SPAWN_X/16, COLLECTIVE_SPAWN_Y/16));
                //     player.sendMessage(0, String.Format("- Spawn B: ({0},{1})", TITAN_SPAWN_X/16, TITAN_SPAWN_Y/16));
                    
                //     // Check vehicle availability
                //     var vehicle301 = AssetManager.Manager.getVehicleByID(301);
                //     var vehicle129 = AssetManager.Manager.getVehicleByID(129);
                //     player.sendMessage(0, String.Format("- Vehicle 301: {0}", vehicle301 != null ? "Available" : "NOT FOUND"));
                //     player.sendMessage(0, String.Format("- Vehicle 129: {0}", vehicle129 != null ? "Available" : "NOT FOUND"));
                //     break;
                    
                // // NEW: Enhanced bot commands for regular CTF mode
                // case "ctfbots":
                //     if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                //     {
                //         player.sendMessage(0, "Insufficient permissions");
                //         break;
                //     }
                    
                //     player.sendMessage(0, "=== CTF Bot System Status ===");
                //     player.sendMessage(0, String.Format("- Current Event: {0}", currentEventType));
                //     player.sendMessage(0, String.Format("- Game State: {0}", gameState));
                //     player.sendMessage(0, String.Format("- Total Active Bots: {0}", _ctfBots.Count(bot => !bot.IsDead)));
                //     player.sendMessage(0, String.Format("- Last Bot Spawn: {0}ms ago", Environment.TickCount - _tickLastBotSpawn));
                    
                //     var ctfTeams = new List<Team>();
                //     foreach (Player p in arena.PlayersIngame)
                //     {
                //         if (p._team != null && !ctfTeams.Contains(p._team))
                //         {
                //             ctfTeams.Add(p._team);
                //         }
                //     }
                    
                //     player.sendMessage(0, String.Format("- Teams with Players: {0}", ctfTeams.Count));
                //     foreach (var team in ctfTeams)
                //     {
                //         int teamBots = _ctfBots.Count(bot => !bot.IsDead && bot._team == team);
                //         int teamPlayers = arena.PlayersIngame.Count(p => p._team == team && !(p._baseVehicle is Bot));
                //         player.sendMessage(0, String.Format("  {0}: {1} bots, {2} players", team._name, teamBots, teamPlayers));
                //     }
                //     break;
                    
                // case "spawnctfbot":
                //     if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                //     {
                //         player.sendMessage(0, "Insufficient permissions");
                //         break;
                //     }
                    
                //     // Manual bot spawn for regular CTF mode
                //     var playerTeams = new List<Team>();
                //     foreach (Player p in arena.PlayersIngame)
                //     {
                //         if (p._team != null && !playerTeams.Contains(p._team))
                //         {
                //             playerTeams.Add(p._team);
                //         }
                //     }
                    
                //     if (playerTeams.Count == 0)
                //     {
                //         player.sendMessage(0, "No active player teams found");
                //         break;
                //     }
                    
                //     // Spawn bot on team with fewest bots
                //     Team ctfTargetTeam = playerTeams
                //         .OrderBy(team => _ctfBots.Count(bot => !bot.IsDead && bot._team == team))
                //         .FirstOrDefault();
                    
                //     if (ctfTargetTeam != null)
                //     {
                //         SpawnCTFBotForTDMTeam(ctfTargetTeam);
                //         _tickLastBotSpawn = Environment.TickCount;
                //         player.sendMessage(0, String.Format("Spawned Enhanced CTFBot for {0}", ctfTargetTeam._name));
                //     }
                //     break;
                    
                // case "killctfbots":
                //     if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                //     {
                //         player.sendMessage(0, "Insufficient permissions");
                //         break;
                //     }
                    
                //     int killedCTFBots = 0;
                //     foreach (var bot in _ctfBots.ToList())
                //     {
                //         if (!bot.IsDead)
                //         {
                //             bot.destroy(false);
                //             killedCTFBots++;
                //         }
                //     }
                //     _ctfBots.Clear();
                //     player.sendMessage(0, String.Format("Destroyed {0} CTF bots", killedCTFBots));
                //     break;

                return false;
            }
            return true;
        }

        private int CalculateExplosionDamage(ItemInfo.Projectile wep, double distance, double damageMultiplier = 1.0)
        {
            double radius = wep.explosiveDamageRadius; // Explosion radius in pixels

            // If the target is outside the explosion radius, no damage is dealt
            if (distance > radius)
                return 0;

            // Damage at the center of the explosion
            int damageInner = wep.explosiveDamageInner;

            // Damage at the edge of the explosion
            int damageOuter = wep.explosiveDamageOuter;

            // Bypass damage at the center
            int bypassDamageInner = wep.bypassDamageInner;

            // Bypass damage at the edge
            int bypassDamageOuter = wep.bypassDamageOuter;

            double damage = 0;
            double bypassDamage = 0;

            // Determine how damage falls off based on the explosiveDamageMode
            switch (wep.explosiveDamageMode)
            {
                case 0:
                    {
                        // Linear falloff for damage and bypass damage
                        double distanceRatio = distance / radius;
                        damage = (int)Math.Ceiling((double)(damageInner - ((damageInner - damageOuter) * distanceRatio)));
                        bypassDamage = (int)Math.Ceiling((double)(bypassDamageInner - ((bypassDamageInner - bypassDamageOuter) * distanceRatio)));
                        break;
                    }
                case 1:
                    {
                        // Constant damage and bypass damage within the radius (no falloff)
                        damage = (int)Math.Ceiling((double)damageInner);
                        bypassDamage = (int)Math.Ceiling((double)bypassDamageInner);
                        break;
                    }
                default:
                    {
                        // Default to linear falloff if mode is unrecognized
                        double distanceRatio = distance / radius;
                        damage = (int)Math.Ceiling(damageInner - ((damageInner - damageOuter) * distanceRatio));
                        bypassDamage = (int)Math.Ceiling(bypassDamageInner - ((bypassDamageInner - bypassDamageOuter) * distanceRatio));
                        break;
                    }
            }

            // Apply damage multiplier only to explosive damage, not bypass damage
            damage *= damageMultiplier;

            // Ensure damage and bypass damage are not negative
            if (damage < 0)
                damage = 0;
            if (bypassDamage < 0)
                bypassDamage = 0;

            // Add bypass damage to the overall damage
            damage += bypassDamage;

            // Always round up to the nearest whole number
            return (int)Math.Ceiling(damage);
        }


        private double CalculateDistance(short x1, short y1, short x2, short y2)
        {
            // Positions are in 1/1000th of a pixel, so divide by 1000.0
            double posX1 = x1 / 1000.0;
            double posY1 = y1 / 1000.0;
            double posX2 = x2 / 1000.0;
            double posY2 = y2 / 1000.0;

            double deltaX = posX1 - posX2;
            double deltaY = posY1 - posY2;
            return Math.Sqrt(deltaX * deltaX + deltaY * deltaY);
        }

        // Dictionary to store player damage stats that can be accessed from other methods
        private Dictionary<int, int> playerDamageStats = new Dictionary<int, int>();
        private List<KeyValuePair<int, int>> orderedPlayerStats = new List<KeyValuePair<int, int>>();

        /// <summary>
        /// Updates the player damage stats based on turret data
        /// </summary>
        private void UpdatePlayerDamageStats()
        {
            playerDamageStats.Clear();
            // Calculate total damage dealt by each player across AutoGun turrets only
            foreach (var turretEntry in _turretStats)
            {
                var turretName = turretEntry.Key;
                var turretData = turretEntry.Value;
                
                // Only include turrets with "AutoGun" in their name
                if (turretName != null && turretName.Contains("AutoGun"))
                {
                    foreach (var damageEntry in turretData.DamageReceived)
                    {
                        if (!playerDamageStats.ContainsKey(damageEntry.Key))
                            playerDamageStats[damageEntry.Key] = 0;
                        playerDamageStats[damageEntry.Key] += damageEntry.Value;
                    }
                }
            }

            // Order players by total damage dealt
            orderedPlayerStats = playerDamageStats
                .OrderByDescending(x => x.Value)
                .Take(3)
                .ToList();
        }

        // Method to list weapon stats for all players or a specific player
        private void ListPlayerWeaponStats(Player requestingPlayer, string alias = null)
        {
            if (string.IsNullOrEmpty(alias))
            {
                // List all players' weapon stats
                requestingPlayer.sendMessage(0, "#All Player Weapon Stats");
                
                // Display last game stats first if available
                if (_lastgamePlayerWeaponStats != null && _lastgamePlayerWeaponStats.Any())
                {
                    requestingPlayer.sendMessage(0, "&Last Game Stats:");
                    foreach (var playerStats in _lastgamePlayerWeaponStats)
                    {
                        Player player = playerStats.Key;
                        requestingPlayer.sendMessage(0, string.Format("@{0}'s Last Game Stats:", player._alias));
                        
                        foreach (var weaponStat in playerStats.Value)
                        {
                            if (weaponStat.Value.ShotsFired > 0)
                            {
                                string weaponName = player._server._assets.getItemByID(weaponStat.Key).name;
                                requestingPlayer.sendMessage(0, string.Format("*Weapon: {0} | Shots: {1}/{2} | Acc: {3:P2}",
                                    weaponName,
                                    weaponStat.Value.ShotsLanded,
                                    weaponStat.Value.ShotsFired,
                                    (double)weaponStat.Value.ShotsLanded / weaponStat.Value.ShotsFired));
                            }
                        }
                    }
                }

                // Only show current game stats if they exist and are different from last game
                if (_playerWeaponStats != null && _playerWeaponStats.Any())
                {
                    requestingPlayer.sendMessage(0, "&Current Game Stats:");
                    foreach (var playerStats in _playerWeaponStats)
                    {
                        Player player = playerStats.Key;
                        requestingPlayer.sendMessage(0, string.Format("@{0}'s Weapon Stats:", player._alias));
                        
                        // Show turret damage if any
                        if (playerDamageStats.ContainsKey(player._id))
                        {
                            requestingPlayer.sendMessage(0, string.Format("*Turret Damage Dealt: {0}", playerDamageStats[player._id]));
                        }

                        foreach (var weaponStat in playerStats.Value)
                        {
                            if (weaponStat.Value.ShotsFired > 0)
                            {
                                string weaponName = player._server._assets.getItemByID(weaponStat.Key).name;
                                requestingPlayer.sendMessage(0, string.Format("*Weapon: {0} | Shots: {1}/{2} | Acc: {3:P2}",
                                    weaponName,
                                    weaponStat.Value.ShotsLanded,
                                    weaponStat.Value.ShotsFired,
                                    (double)weaponStat.Value.ShotsLanded / weaponStat.Value.ShotsFired));
                            }
                        }
                    }
                }
            }
            else
            {
                // List specific player's weapon stats
                var player = arena.Players.FirstOrDefault(p => p._alias.Equals(alias, StringComparison.OrdinalIgnoreCase));
                if (player != null)
                {
                    // Show last game stats first if available
                    if (_lastgamePlayerWeaponStats != null && _lastgamePlayerWeaponStats.ContainsKey(player))
                    {
                        requestingPlayer.sendMessage(0, string.Format("#{0}'s Last Game Stats", player._alias));
                        foreach (var weaponStat in _lastgamePlayerWeaponStats[player])
                        {
                            if (weaponStat.Value.ShotsFired > 0)
                            {
                                string weaponName = player._server._assets.getItemByID(weaponStat.Key).name;
                                requestingPlayer.sendMessage(0, string.Format("*Weapon: {0} | Shots: {1}/{2} | Acc: {3:P2}",
                                    weaponName,
                                    weaponStat.Value.ShotsLanded,
                                    weaponStat.Value.ShotsFired,
                                    (double)weaponStat.Value.ShotsLanded / weaponStat.Value.ShotsFired));
                            }
                        }
                    }

                    // Only show current game stats if they exist
                    if (_playerWeaponStats.ContainsKey(player))
                    {
                        requestingPlayer.sendMessage(0, string.Format("#{0}'s Current Game Stats", player._alias));
                        
                        // Show turret damage if any
                        if (playerDamageStats.ContainsKey(player._id))
                        {
                            requestingPlayer.sendMessage(0, string.Format("&TURRET DMG: {0}", playerDamageStats[player._id]));
                        }

                        foreach (var weaponStat in _playerWeaponStats[player])
                        {
                            if (weaponStat.Value.ShotsFired > 0)
                            {
                                string weaponName = player._server._assets.getItemByID(weaponStat.Key).name;
                                requestingPlayer.sendMessage(0, string.Format("*Weapon: {0} | Shots: {1}/{2} | Acc: {3:P2}",
                                    weaponName,
                                    weaponStat.Value.ShotsLanded,
                                    weaponStat.Value.ShotsFired,
                                    (double)weaponStat.Value.ShotsLanded / weaponStat.Value.ShotsFired));
                            }
                        }
                    }
                    else
                    {
                        requestingPlayer.sendMessage(0, string.Format("No current game stats found for player '{0}'", alias));
                    }
                }
                else
                {
                    requestingPlayer.sendMessage(0, string.Format("No stats found for player '{0}'", alias));
                }
            }
        }

        private void ListPlayerItemUsedAverage(Player requestingPlayer, string alias = null)
        {
            if (string.IsNullOrEmpty(alias))
            {
                requestingPlayer.sendMessage(0, "#Average Resources Left Rankings");

                // Calculate explosive and resource totals per player
                var playerTotals = _averageItemsUsedPerDeath.ToDictionary(
                    kvp => kvp.Key,
                    kvp => new {
                        Name = kvp.Key,
                        ExplosivesLeft = (int)(kvp.Value["Frag"] + kvp.Value["WP"]),
                        ResourcesLeft = (int)(kvp.Value["RepCoil"] + kvp.Value["RepCharge"] + 
                                    kvp.Value["Energizer"] + kvp.Value["Stim"])
                    }
                );

                // Sort and display explosive rankings (lower is better)
                requestingPlayer.sendMessage(0, "*Top Explosive Users (Average Frags + WP left per death):");
                var explosiveRankings = playerTotals.OrderBy(p => p.Value.ExplosivesLeft).Take(5);
                foreach (var player in explosiveRankings)
                {
                    requestingPlayer.sendMessage(0, string.Format("{0} - {1:F1}", 
                        player.Key, player.Value.ExplosivesLeft));
                }

                // Sort and display resource rankings (lower is better)
                requestingPlayer.sendMessage(0, "*Top Resource Users (Average Repcoil, charge, stim, gizer left per death - 7/7 max):");
                var resourceRankings = playerTotals.OrderBy(p => p.Value.ResourcesLeft).Take(5);
                foreach (var player in resourceRankings)
                {
                    requestingPlayer.sendMessage(0, string.Format("{0} - {1:F1}", 
                        player.Key, player.Value.ResourcesLeft));
                }
            }
            else
            {
                // Show specific player stats
                if (_averageItemsUsedPerDeath.ContainsKey(alias))
                {
                    var stats = _averageItemsUsedPerDeath[alias];
                    requestingPlayer.sendMessage(0, string.Format("#{0}'s Resources Left Per Death:", alias));
                    
                    requestingPlayer.sendMessage(0, "*Explosives Left:");
                    requestingPlayer.sendMessage(0, string.Format("  Frags: {0:F1}", (int)stats["Frag"]));
                    requestingPlayer.sendMessage(0, string.Format("  WPs: {0:F1}", (int)stats["WP"]));
                    
                    requestingPlayer.sendMessage(0, "*Resources Left:");
                    requestingPlayer.sendMessage(0, string.Format("  Repulsor Coils: {0:F1}", (int)stats["RepCoil"]));
                    requestingPlayer.sendMessage(0, string.Format("  Repulsor Charge: {0:F1}", (int)stats["RepCharge"]));
                    requestingPlayer.sendMessage(0, string.Format("  Energizers: {0:F1}", (int)stats["Energizer"]));
                    requestingPlayer.sendMessage(0, string.Format("  Stims: {0:F1}", (int)stats["Stim"]));
                }
                else
                {
                    requestingPlayer.sendMessage(0, string.Format("No stats found for player '{0}'", alias));
                }
            }
        }

        // Dictionary to track stats for EB's hit per player (top 3)
        private Dictionary<Player, int> _ebHitStats = new Dictionary<Player, int>();

        /// <summary>
        /// Called when the player uses ?breakdown or end game is called
        /// </summary>
        [Scripts.Event("Player.Breakdown")]
        public bool breakdown(Player from, bool bCurrent)
        {
            // Display players weapon stats if they exist
            if (_playerWeaponStats != null && _playerWeaponStats.Any())
            {
                from.sendMessage(0, "#Top 3 Player Accuracy");
                
                try
                {
                    // Calculate best accuracy per player
                    var playerAccuracies = _playerWeaponStats
                        .Select(playerStats => new {
                            Player = playerStats.Key._alias,
                            WeaponStats = playerStats.Value
                                .Where(w => w.Value != null && w.Value.ShotsFired > 0) // Only consider weapons that were fired
                                .OrderByDescending(w => (double)w.Value.ShotsLanded / w.Value.ShotsFired)
                                .DefaultIfEmpty() // Handle case where no weapons were fired
                                .First(),
                            WeaponId = playerStats.Value
                                .Where(w => w.Value != null && w.Value.ShotsFired > 0)
                                .OrderByDescending(w => (double)w.Value.ShotsLanded / w.Value.ShotsFired)
                                .Select(w => w.Key)
                                .DefaultIfEmpty()
                                .First()
                        })
                        .Where(x => x.WeaponStats.Value != null) // Filter out players with no valid weapon stats
                        .OrderByDescending(x => (double)x.WeaponStats.Value.ShotsLanded / x.WeaponStats.Value.ShotsFired)
                        .Take(3);

                    int rank = 1;
                    foreach (var entry in playerAccuracies)
                    {
                        double accuracy = (double)entry.WeaponStats.Value.ShotsLanded / entry.WeaponStats.Value.ShotsFired;
                        string weaponName = from._server._assets.getItemByID(entry.WeaponId).name;
                        from.sendMessage(0, string.Format("*{0}. {1} - {2:P2} accuracy with {3} ({4}/{5})", 
                            rank++, entry.Player, accuracy,
                            weaponName,
                            entry.WeaponStats.Value.ShotsLanded, 
                            entry.WeaponStats.Value.ShotsFired));
                    }
                }
                catch (Exception ex)
                {
                    from.sendMessage(0, "Error displaying weapon stats.");
                }
            }

            // Show EB's hit stats if any
            if (_ebHitStats != null && _ebHitStats.Any())
            {
                try
                {
                    from.sendMessage(0, "#EB's Hit Stats");
                    var orderedEBStats = _ebHitStats.OrderByDescending(s => s.Value).Take(3).ToList();
                    if (orderedEBStats.Count >= 1)
                    {
                        from.sendMessage(0, string.Format("*1st (HIT={0}): {1}", orderedEBStats[0].Value, orderedEBStats[0].Key._alias));
                    }
                    if (orderedEBStats.Count >= 2)
                    {
                        from.sendMessage(0, string.Format("*2nd (HIT={0}): {1}", orderedEBStats[1].Value, orderedEBStats[1].Key._alias));
                    }
                    if (orderedEBStats.Count >= 3)
                    {
                        from.sendMessage(0, string.Format("*3rd (HIT={0}): {1}", orderedEBStats[2].Value, orderedEBStats[2].Key._alias));
                    }
                }
                catch (Exception ex)
                {
                    from.sendMessage(0, "Error displaying EB hit stats.");
                }
            }
            
            // Show mined stats if any
            if (minedStats != null && minedStats.Any())
            {
                try
                {
                    from.sendMessage(0, "#Mined Stats");
                    
                    // Group stats by team name and calculate totals
                    var teamTotals = minedStats
                        .GroupBy(x => x.Key.Split(' ')[0]) // Group by team name
                        .Select(g => new {
                            Team = g.Key,
                            ToxCount = g.Where(x => x.Key.Contains("Tox")).Sum(x => x.Value),
                            TsoCount = g.Where(x => x.Key.Contains("Tso")).Sum(x => x.Value),
                            Total = g.Sum(x => x.Value)
                        })
                        .OrderByDescending(x => x.Total)
                        .Take(3)
                        .ToList();

                    if (teamTotals.Count >= 1)
                    {
                        from.sendMessage(0, string.Format("*1st {0}: (TOX={1}, TSO={2})", 
                            teamTotals[0].Team, teamTotals[0].ToxCount, teamTotals[0].TsoCount));
                    }
                    if (teamTotals.Count >= 2) 
                    {
                        from.sendMessage(0, string.Format("*2nd {0}: (TOX={1}, TSO={2})",
                            teamTotals[1].Team, teamTotals[1].ToxCount, teamTotals[1].TsoCount));
                    }
                    if (teamTotals.Count >= 3)
                    {
                        from.sendMessage(0, string.Format("*3rd {0}: (TOX={1}, TSO={2})",
                            teamTotals[2].Team, teamTotals[2].ToxCount, teamTotals[2].TsoCount));
                    }
                }
                catch (Exception ex)
                {
                    from.sendMessage(0, "Error displaying mined stats.");
                }
            }
            
            // Only show turret stats if we're doing a breakdown for the current game
            // and there are actually turret stats to show
            if (bCurrent && _turretStats != null && _turretStats.Any())
            {
                from.sendMessage(0, "#Turret Stats");
                
                var orderedStats = _turretStats
                    .OrderByDescending(x => x.Value.Kills)
                    .ToList();

                // Find the top team's stats
                var topTeamStats = orderedStats
                    .GroupBy(x => x.Key.Split(':')[0])
                    .OrderByDescending(g => g.Sum(x => x.Value.Kills))
                    .Take(2)
                    .ToList();

                if (topTeamStats.Count >= 1)
                {
                    from.sendMessage(0, string.Format("*1st (K={0}): {1}", 
                        topTeamStats[0].Sum(x => x.Value.Kills),
                        topTeamStats[0].Key));
                }

                if (topTeamStats.Count >= 2) 
                {
                    from.sendMessage(0, string.Format("*2nd (K={0}): {1}",
                        topTeamStats[1].Sum(x => x.Value.Kills), 
                        topTeamStats[1].Key));
                }

                // Update player damage stats
                UpdatePlayerDamageStats();

                from.sendMessage(0, "#Top Turret Damage Dealers");
                if (orderedPlayerStats.Count >= 1)
                {
                    Player player = arena.getPlayerById((uint)orderedPlayerStats[0].Key);
                    string playerName = player != null ? player._alias : "Unknown";
                    from.sendMessage(0, string.Format("*1st (DMG={0}): {1}", 
                        orderedPlayerStats[0].Value,
                        playerName));
                }

                if (orderedPlayerStats.Count >= 2)
                {
                    Player player = arena.getPlayerById((uint)orderedPlayerStats[1].Key);
                    string playerName = player != null ? player._alias : "Unknown";
                    from.sendMessage(0, string.Format("*2nd (DMG={0}): {1}",
                        orderedPlayerStats[1].Value,
                        playerName));
                }

                if (orderedPlayerStats.Count >= 3)
                {
                    Player player = arena.getPlayerById((uint)orderedPlayerStats[2].Key);
                    string playerName = player != null ? player._alias : "Unknown";
                    from.sendMessage(0, string.Format("*3rd (DMG={0}): {1}",
                        orderedPlayerStats[2].Value,
                        playerName));
                }
            }
            else
            {
                from.sendMessage(0, "No turret stats available for this game.");
            }

            return false;
        }
        // Dictionary to track Freedom AR shot counts per player
        private Dictionary<Player, int> _freedomARShotCount = new Dictionary<Player, int>();
        // New method to handle projectile explosions properly using SC_Projectile
        public void HandleExplosionProjectile(short posX, short posY, short posZ, int projectileId, int shooterId, byte yaw)
        {
            // Use the helper method from Protocol.Helpers.Player instead of manual implementation
            Helpers.Player_RouteExplosion(arena.Players, (short)projectileId, posX, posY, posZ, yaw, (ushort)shooterId);
        }

        private Dictionary<string, Player> _projectileOwners = new Dictionary<string, Player>();
        private HashSet<int> _ignoredExplosionWeaponIds = new HashSet<int>() { 1117, 1199, 1200 };
        private int _lastExplosionTick;
        private Player _lastExplosionShooter;
        private int _lastExplosionWeaponId;
        private short _lastExplosionX, _lastExplosionY, _lastExplosionZ;

        /// <summary>
        /// Triggered when an explosion happens from a projectile a player fired
        /// </summary>
        [Scripts.Event("Player.Explosion")]
        public bool playerExplosion(Player from, ItemInfo.Projectile usedWep, short posX, short posY, short posZ)
        {
            // Explosion occurred at coordinates arena message:
            //arena.sendArenaMessage(string.Format("{0} exploded at {1}, {2}, {3}", usedWep.name, posX, posY, posZ));

            // Handle champion weapon explosion effects
            if (_championEffects != null)
            {
                _championEffects.HandleWeaponExplosion(from, from._occupiedVehicle, usedWep, posX, posY);
            }

            // EB's hit stats for projectiles (IDs 1163 through 1166) or 1246
            if (usedWep.id >= 1163 && usedWep.id <= 1166 || usedWep.id == 1246)
            {
                // Get players within 20 pixels of explosion
                List<Player> playersInRange = arena.getPlayersInRange(posX, posY, 20);
                
                if (playersInRange.Count > 0)
                {
                    if (!_ebHitStats.ContainsKey(from))
                    {
                        _ebHitStats[from] = 0;
                    }
                    _ebHitStats[from]++;
                }
                // Map this explosion to its shooter using a composite key
                string key = string.Format("{0}_{1}_{2}_{3}", usedWep.id, posX, posY, posZ);
                _projectileOwners[key] = from;
            }

            // Stats for weapon damage
            if (_playerStatsEnabled)
            {
                // Only update the global explosion record if this explosion is NOT one of the ignorable ones
                if (!_ignoredExplosionWeaponIds.Contains(usedWep.id))
                {
                    _lastExplosionTick = Environment.TickCount;
                    _lastExplosionShooter = from;
                    _lastExplosionWeaponId = usedWep.id;
                    _lastExplosionX = posX;
                    _lastExplosionY = posY;
                    _lastExplosionZ = posZ;
                }

                // Initialize stats for new players
                if (!_playerWeaponStats.ContainsKey(from))
                {
                    _playerWeaponStats[from] = new Dictionary<int, WeaponStats>();
                }

                // Initialize stats for new weapons
                if (!_playerWeaponStats[from].ContainsKey(usedWep.id))
                {
                    _playerWeaponStats[from][usedWep.id] = new WeaponStats();
                }

                var stats = _playerWeaponStats[from][usedWep.id];

                // Track shots fired for specific weapon types
                switch (usedWep.id)
                {
                    case 1115: // SC
                    case 3032: // AC
                    case 1083: // RPG
                    case 1105: // Maklov LMG
                    case 3027: // Kuchler LMG
                    case 1052: // MML Middle Micro
                    case 1556: // MMl Middle Mini
                    case 5050: // CAW
                    case 1318: // Rifle Grenade
                    case 1326: // Champ RG
                    case 1113: // Tranq
                    case 1163: // EB
                    case 1164: // EB
                    case 1165: // EB
                    case 1166: // EB
                    case 3017: // Maklov AR
                    case 3013: // Kuchler AR
                    case 3018: // Titan AR"
                    case 1162: // Dueler AR
                    case 3086: // Champ ar
                    case 1179: // Haywire (128 radius)
                    case 1073: // Disruptor

                        stats.ShotsFired++;
                        // Map this explosion to its shooter using a composite key
                        string key = string.Format("{0}_{1}_{2}_{3}", usedWep.id, posX, posY, posZ);
                        _projectileOwners[key] = from;
                        // arena.sendArenaMessage(string.Format("{0} fired weapon {1} (Total shots: {2})", 
                        //     from._alias, usedWep.name, stats.ShotsFired));
                        
                        // Track shots fired for dueling system
                        CTFGameType.DuelingSystem.TrackShotFired(from);
                        break;
                }
            }

            //JACKIE's G9
            if (from._alias == "Axidus" && usedWep.name == "Maklov g9 Sniper" && isChampEnabled){
                // Track Jackie's G9 shots for hit detection
                _lastExplosionTick = Environment.TickCount;
                _lastExplosionShooter = from;
                _lastExplosionWeaponId = usedWep.id;
                _lastExplosionX = posX;
                _lastExplosionY = posY;
                _lastExplosionZ = posZ;
            }

            // Joe's Caw
            if ((from._alias == "NewJack") && usedWep.id == 5050 && isChampEnabled)
            {
                // Initialize tracking for Joe's CAW shots if not exists
                if (!_playerWeaponStats.ContainsKey(from))
                {
                    _playerWeaponStats[from] = new Dictionary<int, WeaponStats>();
                }
                
                // Use the CAW weapon ID for tracking
                int cawWeaponId = 5050; // CAW ID from the switch case above
                if (!_playerWeaponStats[from].ContainsKey(cawWeaponId))
                {
                    _playerWeaponStats[from][cawWeaponId] = new WeaponStats();
                }
                
                // Increment shot counter
                _playerWeaponStats[from][cawWeaponId].ShotsFired++;
                
                // Check if this is the 10th shot
                if (_playerWeaponStats[from][cawWeaponId].ShotsFired % 10 == 0)
                {
                    // Display "CAW!" at Joe's location
                    string word = "CAW!";
                    // Define offsets so that "C" is at 0, "A" is at 8, then "W" and "!" maintain a 10 unit spacing relative to "A"
                    int aOffset = 8;
                    int awSpacing = 10;
                    int[] letterOffsets = new int[word.Length];
                    letterOffsets[0] = 0; // "C"
                    for (int i = 1; i < word.Length; i++)
                    {
                        letterOffsets[i] = aOffset + (i - 1) * awSpacing;
                    }

                    for (int i = 0; i < word.Length; i++)
                    {
                        char letter = word[i];
                        ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
                        if (letterWep != null)
                        {
                            short newPosX = (short)(from._state.positionX + letterOffsets[i]);
                            HandleExplosionProjectile(newPosX, from._state.positionY, 48, letterWep.id, from._id, from._state.yaw);
                        }
                    }

                    // Schedule the second "CAW!" after 0.25 seconds using the same offsets
                    Task.Delay(250).ContinueWith(_ =>
                    {
                        for (int i = 0; i < word.Length; i++)
                        {
                            char letter = word[i];
                            ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
                            if (letterWep != null)
                            {
                                short newPosX = (short)(from._state.positionX + letterOffsets[i]);
                                HandleExplosionProjectile(newPosX, from._state.positionY, from._state.positionZ, letterWep.id, from._id, from._state.yaw);
                            }
                        }
                    });

                }
            }

            // Dilatory's Stunner
            if (from._alias == "Dilatory" && usedWep.name == "Stunner Mario" && isChampEnabled){
                // Get players within 20 pixels of explosion
                List<Player> playersInRange = arena.getPlayersInRange(posX, posY, 128);
                
                if (playersInRange.Count > 0)
                {
                    Helpers.Player_RouteExplosion(arena.Players, 1322, posX, posY, posZ, (byte)from._state.yaw, (ushort)from._id);
                    return true;
                }
            }

            // Jay/SMOKA's GG G9
            if (from._alias == "jay" && usedWep.name == "Maklov g9 Sniper" && isChampEnabled){
                // Get players within 20 pixels of explosion
                List<Player> playersInRange = arena.getPlayersInRange(posX, posY, 20);
                
                if (playersInRange.Count > 0)
                {
                    Helpers.Player_RouteExplosion(arena.Players, 1307, posX, posY, posZ, (byte)from._state.yaw, (ushort)from._id);
                    return true;
                }
            }

            // B o o g's RPG
            // if (from._alias.Equals("B o o g", StringComparison.OrdinalIgnoreCase) && usedWep.name.Equals("RPG", StringComparison.OrdinalIgnoreCase) && isChampEnabled)
            // {
            //     // Get players within 20 pixels of explosion
            //     List<Player> playersInRange = arena.getPlayersInRange(posX, posY, 55);
                
            //     if (playersInRange.Count > 0) {
            //         // First display "BRRRT!!"
            //         string firstWord = "BRRRT!";
            //         int xOffset = 10;
            //         for (int i = 0; i < firstWord.Length; i++)
            //         {
            //             char letter = firstWord[i];
            //             ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
            //             if (letterWep != null)
            //             {
            //                 short newPosX = (short)(posX + (i * xOffset));
            //                 HandleExplosionProjectile(newPosX, posY, 40, letterWep.id, from._id, from._state.yaw);
            //             }
            //         }

            //         // Schedule "POWWW!!" after 0.5 seconds
            //         Task.Delay(500).ContinueWith(_ =>
            //         {
            //             string secondWord = "POWWW!";
            //             for (int i = 0; i < secondWord.Length; i++)
            //             {
            //                 char letter = secondWord[i];
            //                 ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
            //                 if (letterWep != null)
            //                 {
            //                     short newPosX = (short)(posX + (i * xOffset));
            //                     HandleExplosionProjectile(newPosX, posY, 40, letterWep.id, from._id, from._state.yaw);
            //                 }
            //             }
            //         });
            //     }
            // }

            // albert's EMP Grenade
            if ((usedWep.name == "EMP Grenade" || usedWep.name == "Haywire Grenade") && (from._alias == "albert") && isChampEnabled)
            {
                // Get players within 20 pixels of explosion
                List<Player> playersInRange = arena.getPlayersInRange(posX, posY, 128);
                
                if (playersInRange.Count > 0)
                {
                    string word = "BLOOP!";
                    int xOffset = 10;
                    for (int i = 0; i < word.Length; i++)
                    {
                        char letter = word[i];
                        ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
                        if (letterWep != null)
                        {
                            short newPosX = (short)(posX + (i * xOffset));
                            HandleExplosionProjectile(newPosX, posY, posZ, letterWep.id, from._id, from._state.yaw);
                        }
                    }
                }
            }
            
            // Herthbul's Tranq
            if (usedWep.name == "Tranq" && (from._alias == "Herthbul") && isChampEnabled)
            {
                // Get players within 20 pixels of explosion
                List<Player> playersInRange = arena.getPlayersInRange(posX, posY, 20);
                
                if (playersInRange.Count > 0)
                {
                    int[] explosionIds = new int[] { 1301, 1306, 1307 };
                    int randomIndex = new Random().Next(explosionIds.Length);
                    int selectedExplosionId = explosionIds[randomIndex];

                    byte yaw = from._state.yaw;
                    SC_Projectile tranqExplosion = new SC_Projectile
                    {
                        projectileID = (short)selectedExplosionId,
                        playerID = (ushort)from._id,
                        posX = posX,
                        posY = posY,
                        posZ = posZ,
                        yaw = yaw
                    };

                    foreach (Player p in arena.Players)
                    {
                        p._client.sendReliable(tranqExplosion);
                    }
                }
            }

            // Check if the weapon is Freedom AR
            if (usedWep.name == "Freedom AR")
            {
                // Get or initialize shot count for this player
                if (!_freedomARShotCount.ContainsKey(from))
                    _freedomARShotCount[from] = 0;

                // Get current shot count and update for next time
                int shotCount = _freedomARShotCount[from];
                _freedomARShotCount[from] = (shotCount + 1) % 3;

                // Additional weapon IDs to fire in sequence
                int[] weaponIds = new int[] { 3017, 3013, 1162 };
                ItemInfo.Projectile newWeapon = (ItemInfo.Projectile)AssetManager.Manager.getItemByID(weaponIds[shotCount]);
                
                if (newWeapon != null)
                {
                    // Create a proper SC_Projectile with player ownership
                    byte yaw = from._state.yaw;
                    SC_Projectile freedomExplosion = new SC_Projectile
                    {
                        projectileID = (short)newWeapon.id,
                        playerID = (ushort)from._id,
                        posX = posX,
                        posY = posY,
                        posZ = posZ,
                        yaw = yaw
                    };

                    // Send the explosion to all players with proper ownership
                    foreach (Player p in arena.Players)
                    {
                        p._client.sendReliable(freedomExplosion);
                    }
                }
                return true;
            }

            if (gameState != GameState.ActiveGame)
            { return true; }

                // Explosion radius in pixels
                double radius = usedWep.explosiveDamageRadius;

                // Adjust positions for scaling (from 1/1000th of a pixel to pixels)
                double explosionPosX = posX;
                double explosionPosY = posY;

                // Get all vehicles (including turrets) within the explosion radius
                List<Vehicle> vehiclesInRange = arena.getVehiclesInRange(posX, posY, (int)(radius));

                foreach (Vehicle v in vehiclesInRange)
                {
                    // Skip sentries
                    if (v._type.Id == 402)
                        continue;

                    // Check if the vehicle is a turret (Computer)
                    Computer turret = v as Computer;
                    if (turret != null)
                    {
                        // Adjust turret positions for scaling
                        double turretPosX = turret._state.positionX;
                        double turretPosY = turret._state.positionY;

                        // Calculate distance from the explosion center to the edge of the turret
                        // Assuming turret's physical radius is 8 (as per the context)
                        double turretRadius = 8; // Turret's physical radius in pixels
                        double distance = Math.Sqrt(Math.Pow(explosionPosX - turretPosX, 2) + Math.Pow(explosionPosY - turretPosY, 2)) - turretRadius;

                        // Skip if out of radius
                        if (distance > radius)
                            continue;
                        // Adjust damage based on turret type before calculating damage
                        double damageMultiplier = 1.0;
                        if (turret._type.Name == "Auto Turret-Rocket")
                            damageMultiplier = 0.6; // 40% reduction
                        else if (turret._type.Name == "Auto Turret-MG")
                            damageMultiplier = 0.8; // 20% reduction
                        else if (turret._type.Name == "Auto Turret-Plasma")
                            damageMultiplier = 0.9; // 10% reduction

                        // Calculate the damage based on weapon properties and distance, applying the damage multiplier
                        int damage = CalculateExplosionDamage(usedWep, distance, damageMultiplier);

                        // Ensure damage is not negative
                        if (damage < 0)
                            damage = 0;
                        // Always round up to the nearest whole number
                        damage = (int)Math.Ceiling((double)damage / 1000.0);

                        if (damage <= 0)
                            continue; // No damage dealt

                        // Update turret stats
                        string teamName = turret._team != null ? turret._team._name : "Neutral";
                        string turretType = turret._type.Name;
                        string key = teamName + ":" + turretType;

                        TurretData data;
                        if (!_turretStats.TryGetValue(key, out data))
                        {
                            data = new TurretData(teamName, turretType);
                            _turretStats.Add(key, data);
                        }

                        // Update DamageReceived
                        if (data.DamageReceived.ContainsKey(from._id))
                            data.DamageReceived[from._id] += damage;
                        else
                            data.DamageReceived[from._id] = damage;

                        // Optionally, send a message or log the damage
                        //arena.sendArenaMessage(string.Format("Player {0} dealt {1} damage to turret {2}.", from._alias, damage, turretType), -1);
                    }
                }

            if (killStreaks.ContainsKey(from._alias))
            {
                if (explosives.ContainsKey(usedWep.name))
                    UpdateWeapon(from, usedWep, explosives[usedWep.name]);
            }
            return true;
        }

        /// <summary>
        /// Triggered when one player has killed another
        /// </summary>
        [Scripts.Event("Player.PlayerKill")]
        public bool playerPlayerKill(Player victim, Player killer)
        {
            // Handle TDM kill if TDM is active
            // if (currentEventType == EventType.TDM && _tdmInstance != null)
            // {
            //     _tdmInstance.HandleKill(victim, killer);
            // }

            if (gameState != GameState.ActiveGame)
            {
                return true;
            }

            UpdateKiller(killer);

            if (killStreaks.ContainsKey(victim._alias))
            {
                long wepTick = killStreaks[victim._alias].lastUsedWepTick;

                if (wepTick != -1)
                {
                    UpdateWeaponKill(killer);
                }
            }

            // Create explosion for Rogue when they get a kill
            if (killer != null && killer._alias.Equals("Rogue", StringComparison.OrdinalIgnoreCase))
            {
                ExplosionHelper.CreateRogueExplosion(arena, killer, victim._state.positionX, victim._state.positionY, victim._state.positionZ);
            }

            // TODO: Remove these unnecessary null checks - killer/victim must be defined objects here.
            if (killer != null && victim != null && victim._bounty >= 300)
            {
                arena.sendArenaMessage(String.Format("{0} has ended {1}'s bounty.", killer._alias, victim._alias), 5);
            }

            bool bVictimCarrier = arena._flags.Values.Any(fs => fs.carrier == victim);
            bool bKillerCarrier = arena._flags.Values.Any(fs => fs.carrier == killer);

            if (bVictimCarrier)
            {
                ctfPlayerProxy.player = killer;
                ctfPlayerProxy.CarrierKills++;
                ctfPlayerProxy.player = null;
            }

            if (bKillerCarrier)
            {
                ctfPlayerProxy.player = killer;
                ctfPlayerProxy.CarryKills++;
                ctfPlayerProxy.player = null;
            }

            return true;
        }

        /// <summary>
        /// Triggered when a player attempts to repair a vehicle or player
        /// </summary>
        [Scripts.Event("Player.Repair")]
        public bool playerRepair(Player player, ItemInfo.RepairItem item, UInt16 targetVehicle, short posX, short posY)
        {
            if (isSD) // Are we in sudden death - reduced healing if so
            {
                // Only apply heal reduction if not all flags are captured by one team
                if (!AreAllFlagsCapturedByOneTeam())
                {
                    // Determine which reduced item to use
                    string reducedItemName = null;

                    // Determine if the item is the Engineer Repair Kit
                    if (item.name == "Engineer Repair Kit")
                    {
                        // Find the computer vehicle the player is attempting to repair
                        Vehicle vehicleTarget = arena.Vehicles.FirstOrDefault(v => v._id == targetVehicle);

                        // Ensure the target vehicle exists and is a computer-controlled vehicle
                        if (vehicleTarget != null && vehicleTarget is Computer)
                        {
                            // Check if the vehicle's health is already full and if the player has enough energy
                            if (vehicleTarget._state.health >= vehicleTarget._type.Hitpoints)
                            {
                                // Notify the player that the vehicle is already fully repaired
                                //player.sendMessage(0, "The target vehicle is already at full health. Repair not needed.");
                                return false; // Prevent resource consumption and further default repair actions
                            }
                            //player.sendMessage(0, string.Format("The target vehicle health is {1}, with a max of {0}", vehicleTarget._type.Hitpoints, vehicleTarget._state.health));

                            // Apply reduced repair during sudden death
                            float percentage = (float)item.repairPercentage / 100;
                            if (item.repairPercentage > 100)
                                percentage = (float)item.repairPercentage / 1000;

                            // Calculate the repair amount
                            double repairAmount = item.repairAmount;

                            // Apply reduced repair amount based on the overtime state
                            if (isSD && !isSecondOvertime)
                            {
                                repairAmount = 50; // Existing 50% reduction
                            }
                            else if (isSecondOvertime)
                            {
                                repairAmount = 40; // Further reduce by 75%
                            }

                            // Adjust the vehicle's health with the calculated repair amount
                            vehicleTarget._state.health = (short)Math.Min(
                                vehicleTarget._type.Hitpoints,
                                (int)(vehicleTarget._state.health + (percentage * vehicleTarget._state.health) + repairAmount));

                            // Mark the vehicle for a state update if it's a computer-controlled vehicle
                            (vehicleTarget as Computer)._sendUpdate = true;

                            // Play the repair sound using Player_RouteItemUsed
                            Helpers.Player_RouteItemUsed(vehicleTarget._inhabitant ?? player, player, targetVehicle, 
                                (short)item.id, player._state.positionX, player._state.positionY, (byte)player._state.yaw);

                            //Reload the players weapon
                            // Send a reload packet to trigger the reload effect
                            SC_ItemReload reloadPacket = new SC_ItemReload
                            {
                                itemID = (short)item.id
                            };
                            player._client.sendReliable(reloadPacket);  // Sending reload packet to trigger reload on the client

                            // Notify the player
                            player.sendMessage(0, string.Format("You repaired {0} for {1} health (reduced in Overtime).",
                                vehicleTarget._type.Name, repairAmount));

                            // remove energy - commenting out as no longer needed
                            // player.inventoryModify(false, AssetManager.Manager.getItemByName("EnergySubtract"), 100);
                            player.syncState();

                            // Prevent further default repair actions
                            return false;
                        }
                        else
                        {
                            // Target vehicle is not valid
                            player.sendMessage(-1, "You can only repair computer-controlled vehicles with this item.");
                            return false;
                        }
                    }

                    if (item.name == "Medikit")
                    {
                        reducedItemName = isSecondOvertime ? "Medikit-R2" : "Medikit-R"; // Use the reduced version of Medikit
                    }
                    else if (item.name == "Deluxe Medikit")
                    {
                        reducedItemName = isSecondOvertime ? "Deluxe Medikit-R2" : "Deluxe Medikit-R"; // Use the reduced version of Deluxe Medikit
                    }

                    if (reducedItemName != null)
                    {
                        // Load the reduced healing item
                        ItemInfo.RepairItem reducedItem = AssetManager.Manager.getItemByName(reducedItemName) as ItemInfo.RepairItem;

                        if (reducedItem != null)
                        {
                            // Get the repair range of the item, using the absolute value
                            int repairRange = Math.Abs((int)reducedItem.repairDistance);
                            // double originalRepairAmount = reducedItem.repairAmount; // Save original amount

                        // // Adjust healing percentage based on the overtime state
                        // if (isSD && !isSecondOvertime)
                        // {
                        //     reducedItem.repairAmount = (int)(reducedItem.repairAmount * 0.5); // 50% reduction
                        // }
                        // else if (isSecondOvertime)
                        // {
                        //     reducedItem.repairAmount = (int)(reducedItem.repairAmount * 0.25); // 75% reduction
                        // }

                        // Heal the player using the medikit
                        //player.heal(reducedItem, player, posX, posY);

                        // remove energy - commenting out no longer needed
                        //player.inventoryModify(false, AssetManager.Manager.getItemByName("EnergySubtract"), 100);

                        //Reload the players weapon
                        // Send a reload packet to trigger the reload effect
                        SC_ItemReload reloadPacket = new SC_ItemReload
                        {
                            itemID = (short)item.id
                        };
                        player._client.sendReliable(reloadPacket);  // Sending reload packet to trigger reload on the client

                        Helpers.Player_RouteItemUsed(player, player, player._id, (short)reducedItem.id, posX, posY, (byte)player._state.yaw);
                        player.syncState();

                        int teammatesHealed = 0;

                        // Heal nearby teammates
                        foreach (Player p in arena.Players)
                        {
                            if (p != player && p._team == player._team)
                            {
                                double distance = Helpers.distanceTo(p._state.positionX, p._state.positionY, posX, posY);
                                
                                // Log distance for debugging
                                // Log.write(TLog.Normal, "Distance between {0} and {1}: {2}", player._alias, p._alias, distance);

                                if (distance <= repairRange)
                                {
                                    p.heal(reducedItem, player, posX, posY);
                                    teammatesHealed++;
                                    //Log.write(TLog.Normal, "Healed player {0}", p._alias);
                                }
                            }
                        }

                        // Send a message confirming the reduced healing
                        player.sendMessage(0, string.Format("Applied reduced healing in Overtime using {0}. Healing amount: {1}. Teammates healed: {2}", 
                            reducedItem.name, reducedItem.repairAmount, teammatesHealed));

                            player.syncState();
                            return false; // Prevent further default repair actions
                            //return true;
                        }
                        else
                        {
                            player.sendMessage(0, string.Format("Error: Could not find {0} item for healing.", reducedItemName));
                        }
                    }
                }
            }
            return true;
        }

        private int _storedPortalX = 0;
        private int _storedPortalY = 0;
        System.Threading.Timer portalTimer = null;  

        // Class to store weapon stats
        private class WeaponStats
        {
            public int ShotsFired { get; set; }
            public int ShotsLanded { get; set; }
            public double AverageDistance { get; set; }
            public int TotalHits { get; set; }

            public WeaponStats()
            {
                ShotsFired = 0;
                ShotsLanded = 0;
                AverageDistance = 0;
                TotalHits = 0;
            }
        }

        // Dictionary to track detailed weapon stats per player
        private Dictionary<Player, Dictionary<int, WeaponStats>> _playerWeaponStats = new Dictionary<Player, Dictionary<int, WeaponStats>>();
        private Dictionary<Player, Dictionary<int, WeaponStats>> _lastgamePlayerWeaponStats = new Dictionary<Player, Dictionary<int, WeaponStats>>();

        /// <summary>
        /// Triggered when a player notifies the server of an explosion
        /// </summary>
        [Scripts.Event("Player.DamageEvent")] 
        public bool playerDamageEvent(Player player, ItemInfo.Projectile weapon, short posX, short posY, short posZ)
        {
            if (weapon == null || player == null)
                return false;

            // arena.sendArenaMessage(string.Format("Last explosion stats: Tick={0}, Shooter={1}, Weapon={2}, X={3}, Y={4}, Z={5}", 
            //     _lastExplosionTick, _lastExplosionShooter._alias, _lastExplosionWeaponId, _lastExplosionX, _lastExplosionY, _lastExplosionZ));

            if (_playerStatsEnabled)
            {
                // Use a tick-based threshold to match the last explosion event.
                int currentTick = Environment.TickCount;
                int tickThreshold = 200; // Acceptable difference in milliseconds

                // Check if the last explosion event matches this weapon and is recent
                if (weapon.id == _lastExplosionWeaponId && (currentTick - _lastExplosionTick) <= tickThreshold)
                {
                    // Use the stored shooter while still keeping 'player' as the victim.
                    Player shooter = _lastExplosionShooter;

                    // Update shooter stats for accuracy tracking
                    if (!_playerWeaponStats.ContainsKey(shooter))
                    {
                        _playerWeaponStats[shooter] = new Dictionary<int, WeaponStats>();
                    }
                    if (!_playerWeaponStats[shooter].ContainsKey(weapon.id))
                    {
                        _playerWeaponStats[shooter][weapon.id] = new WeaponStats();
                    }
                    var shooterStats = _playerWeaponStats[shooter][weapon.id];

                    shooterStats.ShotsLanded++;
                    shooterStats.TotalHits++;

                    // Track shots hit for dueling system
                    CTFGameType.DuelingSystem.TrackShotHit(shooter);
                    
                    // Track damage hit for double/triple hit detection
                    CTFGameType.DuelingSystem.TrackDamageHit(shooter._alias);

                    // Calculate distance from explosion to victim's vehicle
                    if (player._baseVehicle != null)
                    {
                        double distance = CalculateDistance(_lastExplosionX, _lastExplosionY, posX, posY);
                        shooterStats.AverageDistance =
                            ((shooterStats.AverageDistance * (shooterStats.TotalHits - 1)) + distance) / shooterStats.TotalHits;
                    }

                    // Debug message showing all weapon stats for the shooter
                    string statsMessage = string.Format("Weapon Stats for {0}:", shooter._alias);
                    foreach (var weaponStats in _playerWeaponStats[shooter])
                    {
                        ItemInfo weaponInfo = AssetManager.Manager.getItemByID(weaponStats.Key);
                        string weaponName = weaponInfo != null ? weaponInfo.name : string.Format("Weapon {0}", weaponStats.Key);

                        statsMessage += string.Format("\n{0}: Shots={1}, Hits={2}, Avg Distance={3:F2}",
                            weaponName,
                            weaponStats.Value.ShotsFired,
                            weaponStats.Value.ShotsLanded,
                            weaponStats.Value.AverageDistance);
                    }
                    // arena.sendArenaMessage(statsMessage);
                }
            }

            // Jackie's G9 hit effect - display random onomatopoeia near Jackie's head when G9 hits
            if (_lastExplosionShooter != null && _lastExplosionShooter._alias == "Axidus" && 
                weapon.name == "Maklov g9 Sniper" && isChampEnabled)
            {
                // Use a tick-based threshold to match the last explosion event
                int currentTick = Environment.TickCount;
                int tickThreshold = 200; // Acceptable difference in milliseconds
                
                if (weapon.id == _lastExplosionWeaponId && (currentTick - _lastExplosionTick) <= tickThreshold)
                {
                    // Random onomatopoeia for sniper hits
                    string[] sniperSounds = { "CRACK!", "THWACK!", "BANG!", "SNAP!", "WHACK!", "POW!", "BOOM!" };
                    Random random = new Random();
                    string selectedSound = sniperSounds[random.Next(sniperSounds.Length)];
                    
                    // Display the onomatopoeia near Jackie's head (similar positioning to Joe's CAW)
                    int xOffset = 10;
                    for (int i = 0; i < selectedSound.Length; i++)
                    {
                        char letter = selectedSound[i];
                        ItemInfo.Projectile letterWep = AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
                        if (letterWep != null)
                        {
                            short newPosX = (short)(_lastExplosionShooter._state.positionX + (i * xOffset));
                            HandleExplosionProjectile(newPosX, (short)(_lastExplosionShooter._state.positionY - 20), 
                                                    (short)(_lastExplosionShooter._state.positionZ + 48), letterWep.id, 
                                                    _lastExplosionShooter._id, _lastExplosionShooter._state.yaw);
                        }
                    }
                }
            }
                
            if (weapon.id == 1317){
                // Player has entered a portal, use stored coordinates or generate new ones
                if (_storedPortalX == 0 && _storedPortalY == 0) {
                    // First player - generate and store random coordinates
                    Random random = new Random();
                    _storedPortalX = random.Next(0, 1000); 
                    _storedPortalY = random.Next(0, 1000);
                    
                    // Only create a timer if portal coordinates were just generated
                    if (_storedPortalX != 0 && _storedPortalY != 0) {
                        portalTimer = new System.Threading.Timer((state) => {
                            lock(this) {
                                _storedPortalX = 0;
                                _storedPortalY = 0;
                                arena.sendArenaMessage("The portal has closed!");
                            }
                            ((System.Threading.Timer)state).Dispose();
                        }, null, 30000, System.Threading.Timeout.Infinite); // 30000 ms = 30 seconds
                    }
                }

                // Warp player to stored coordinates with small random offset
                Random offsetRandom = new Random();
                int offsetX = offsetRandom.Next(-50, 50);
                int offsetY = offsetRandom.Next(-50, 50);
                player.warp((_storedPortalX * 16) + offsetX, (_storedPortalY * 16) + offsetY);
            }



            // Check if the damage event string is valid
            if (!string.IsNullOrEmpty(weapon.damageEventString))
            {
                // Execute the event, parsing the damage event string
                Logic_Assets.RunEvent(player, weapon.damageEventString);
                return false; // Return false to continue the server-side handling if necessary
            }

            // Default behavior if no event string is specified
            return true; 
        }

        //Dictionary to store average items used per death per player.
        private Dictionary<string, Dictionary<string, double>> _averageItemsUsedPerDeath = new Dictionary<string, Dictionary<string, double>>();

        /// <summary>
        /// Triggered when a player has died, by any means
        /// </summary>
        /// <remarks>killer may be null if it wasn't a player kill</remarks>
        [Scripts.Event("Player.Death")]
        public bool playerDeath(Player victim, Player killer, Helpers.KillType killType, CS_VehicleDeath update)
        {
            // Setup equipment skills for the victim
            SetupEquipmentSkills(victim);

            // Clear auto-drop tracking for the victim (allows them to get auto-drops again)
            ClearAutoDropTracking(victim);

            // Send reminder message about summon automation toggle (only if automation is enabled)
            bool hasAutomationEnabled = summonAutomationEnabled.ContainsKey(victim) && summonAutomationEnabled[victim];
            if (hasAutomationEnabled)
            {
                victim.sendMessage(0, "&You will automatically ask for XXXXXX when you respawn. To toggle off auto summon request, type ?as or ?autosummon, send again to re-enable.");
            }

            // Handle Zombie event deaths
            switch (currentEventType)
            {
                case EventType.Zombie:
                    HandleZombieDeath(victim, killer);
                    return false; // Prevent default respawn
                case EventType.SUT:
                    return true;
            }
            
            // if (is5v5){ // Check if medic dies, if true, check if any players left on defense in base coordinates
            //     string victimSkillName = GetPrimarySkillName(victim);
            //     if (victimSkillName.Equals("Field Medic", StringComparison.OrdinalIgnoreCase))
            //     {
            //         // Set base coordinates based on baseUsed
            //         int startX = 0, endX = 0, startY = 0, endY = 0;
            //         switch (baseUsed)                
            //         {
            //             case "D7":
            //                 startX = 255 * 16; endX = 328 * 16;
            //                 startY = 435 * 16; endY = 505 * 16;
            //                 break;
            //             case "F6":
            //                 startX = 375 * 16; endX = 481 * 16;
            //                 startY = 435 * 16; endY = 509 * 16;
            //                 break;
            //             case "F4":
            //                 startX = 367 * 16; endX = 435 * 16;
            //                 startY = 224 * 16; endY = 306 * 16;
            //                 break;
            //             case "A7":
            //                 startX = 255 * 16; endX = 328 * 16;
            //                 startY = 435 * 16; endY = 505 * 16;
            //                 break;
            //             case "A5":
            //                 startX = 4 * 16; endX = 79 * 16;
            //                 startY = 305 * 16; endY = 377 * 16;
            //                 break;
            //             case "B6":
            //                 startX = 128 * 16; endX = 203 * 16;
            //                 startY = 432 * 16; endY = 515 * 16;
            //                 break;
            //             default:
            //                 startX = 0; endX = 0;
            //                 startY = 0; endY = 0;
            //                 break;
            //         }

            //         // Check if any players from victim's team are still in base coordinates
            //         bool playersInBase = false;
            //         foreach (Player p in arena.Players)
            //         {
            //             if (p._team == victim._team && p != victim)
            //             {
            //                 if (p._state.positionX >= startX && p._state.positionX <= endX &&
            //                     p._state.positionY >= startY && p._state.positionY <= endY)
            //                 {
            //                     playersInBase = true;
            //                     break;
            //                 }
            //             }
            //         }

            //         // If no players left in base, set offense as winner
            //         if (!playersInBase)
            //         {
            //             winningTeamOVD = "offense";
            //             arena.sendArenaMessage("Offense wins! No defenders remain in base!");
            //         }
            //     }
            // }

            // Track items used before death
            int fragCount = victim.getInventoryAmount(1011);
            int wpCount = victim.getInventoryAmount(1176);
            int repCoilCount = victim.getInventoryAmount(2011);
            int repChargeCount = victim.getInventoryAmount(1049);
            int energizerCount = victim.getInventoryAmount(15);
            int stimCount = victim.getInventoryAmount(47);

            // Update average items used per death for this player
            if (!_averageItemsUsedPerDeath.ContainsKey(victim._alias))
            {
                _averageItemsUsedPerDeath[victim._alias] = new Dictionary<string, double>()
                {
                    {"Frag", fragCount},
                    {"WP", wpCount}, 
                    {"RepCoil", repCoilCount},
                    {"RepCharge", repChargeCount},
                    {"Energizer", energizerCount},
                    {"Stim", stimCount}
                };
            }
            else
            {
                var playerStats = _averageItemsUsedPerDeath[victim._alias];
                playerStats["Frag"] = (playerStats["Frag"] + fragCount) / 2;
                playerStats["WP"] = (playerStats["WP"] + wpCount) / 2;
                playerStats["RepCoil"] = (playerStats["RepCoil"] + repCoilCount) / 2;
                playerStats["RepCharge"] = (playerStats["RepCharge"] + repChargeCount) / 2;
                playerStats["Energizer"] = (playerStats["Energizer"] + energizerCount) / 2;
                playerStats["Stim"] = (playerStats["Stim"] + stimCount) / 2;
            }

            string victimSkill = GetPrimarySkillName(victim);

            if (currentEventType == EventType.Gladiator)
            {
                // Player is already in the event, just warp them
                victim.resetWarp();
                WarpPlayerToSpawn(victim);

                //Update normally
                killer.Kills++;
                victim.Deaths++;
                return false; // Prevent default team assignment
            }

            // Only proceed if the game is active
            if (gameState != GameState.ActiveGame)
            {
                return true;
            }

            if (killer != null){
                string killerSkill = GetPrimarySkillName(killer);
                if (killerSkill.Equals("Dueler", StringComparison.OrdinalIgnoreCase))
                {
                    killer.inventoryModify(104, 1);
                }
            }

            // Update death statistics
            UpdateDeath(victim, killer);
            int killerHP = killer != null ? killer._state.health : 0;

            // Check if the victim's primary skill is "Dueler"
            if (victimSkill.Equals("Dueler", StringComparison.OrdinalIgnoreCase))
            {
                victim.resetWarp();
                WarpPlayerToExactLocation(victim, 759, 535);
                // Ensure the duel is in the correct state
                if (duelState == DuelEventState.PoolPhase || duelState == DuelEventState.KnockoutPhase)
                {
                    if (killer != null)
                    {
                        // Ensure the killer is part of the duel participants
                        if (!duelParticipants.Contains(killer))
                        {
                            // Optional: Add the killer to participants or ignore the kill
                            return true;
                        }

                        // Initialize scores if not already done
                        if (!playerScores.ContainsKey(killer))
                            playerScores[killer] = 0;
                        if (!playerScores.ContainsKey(victim))
                            playerScores[victim] = 0;

                        // Update killer's score
                        playerScores[killer]++;

                        string victimMessage = string.Format("You were killed by {0}, who has {1} HP remaining. Score: {2} - {3}", killer._alias, killerHP, playerScores[killer], playerScores[victim]);
                        victim.sendMessage(0, victimMessage);

                        string killerMessage = string.Format("You killed {0}. Score: {1} - {2}", victim._alias, playerScores[killer], playerScores[victim]);
                        killer.sendMessage(0, killerMessage);

                        // Check if the killer has reached the required kills to win
                        if (playerScores[killer] >= 2) // Adjust to 3 if needed
                        {
                            // Killer wins the match
                            victim.sendMessage(0, string.Format("You have lost the duel against {0}.", killer._alias));
                            killer.sendMessage(0, string.Format("You have won the duel against {0}!", victim._alias));

                            // Move loser to spectator
                            victim.spec();

                            // Advance winner to next round
                            AdvanceToNextRound(killer);
                        }
                        else
                        {
                            // Respawn victim at the duel pad
                            var match = currentMatches.FirstOrDefault(m => m.Item1 == victim || m.Item2 == victim);
                            if (match != null)
                            {
                                int padIndex = currentMatches.IndexOf(match);
                                if (padIndex >= 0 && padIndex < duelPads.Count)
                                {
                                    int[] pad = duelPads[padIndex];
                                    victim.warp(pad[0], pad[1]);
                                }
                            }
                        }
                    }
                    else
                    {
                        // Handle cases where the killer is null
                        string message = "You were killed, but the killer's information is unavailable.";
                        victim.sendMessage(0, message);
                    }

                    return false; // Prevent default respawn
                } else {
                    string victimMessage = string.Format("You were killed by {0}, who has {1} HP remaining.", killer._alias, killerHP);
                    victim.sendMessage(0, victimMessage);
                }
            }

            // Track dueling system deaths for unranked dueling (when players have "Dueler" skill)
            if (killer != null && victimSkill.Equals("Dueler", StringComparison.OrdinalIgnoreCase))
            {
                string killerSkill = GetPrimarySkillName(killer);
                if (killerSkill.Equals("Dueler", StringComparison.OrdinalIgnoreCase))
                {
                    // Both players are duelers, track this as unranked dueling
                    // Use fire-and-forget to avoid blocking the event handler
                    Task.Run(async () => {
                        try
                        {
                            await CTFGameType.DuelingSystem.HandlePlayerDeath(victim, killer, arena);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(String.Format("Error tracking dueling death: {0}", ex.Message));
                        }
                    });
                    
                    // Return false to prevent default respawn handling for dueling deaths
                    return false;
                }
            }
            
            // Add custom phrase explosion functionality
            if (killer != null && gameState == GameState.ActiveGame)
            {
                try
                {
                    // Get the killer's custom phrase
                    string killerPhrase = PhraseExplosionManager.GetPlayerPhrase(killer._alias).Result;
                    
                    // Only create explosion if killer has a custom phrase
                    if (!string.IsNullOrEmpty(killerPhrase))
                    {
                        // Create custom explosion at victim's location using killer's phrase
                        // Use async call without awaiting to prevent blocking
                        ExplosionHelper.CreateCustomExplosion(arena, killer, victim._state.positionX, victim._state.positionY, victim._state.positionZ);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine(String.Format("Error triggering custom explosion for {0}: {1}", killer._alias, ex.Message));
                }
            }
            
            // Handle champion effects for player death
            if (_championEffects != null)
            {
                _championEffects.HandlePlayerDeath(victim, killer);
            }
            
            return true;
        }

        /// <summary>
        /// Called when the player successfully joins the game
        /// </summary>
        [Scripts.Event("Player.Enter")]
        public void playerEnter(Player player)
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

            string skillName = GetPrimarySkillName(player);
            if (skillName == "Dueler"){
                ChangePlayerSkill(player, "Infantry");
            }

            // If the Zombie event is active, make the player a zombie
            if (currentEventType == EventType.Zombie)
            {
                // Change the player's skill to the zombie skill
                ChangePlayerSkill(player, "Zombie");
                AssignPlayerToTeam(player, "Zombie", "Zombies", true, true);
                player.sendMessage(0, "You have joined during the Zombie event and are now a zombie!");
            }

            if (currentEventType == EventType.MiniTP){
                if (player._team._name.Contains("Titan"))
                    WarpPlayerToRange(player, 654, 654, 518, 518);
                else if (player._team._name.Contains("Collective")) 
                    WarpPlayerToRange(player, 648, 648, 565, 565);
                return;
            }
        }

        /// <summary>
        /// Called when a player enters the arena
        /// </summary>
        [Scripts.Event("Player.EnterArena")]
        public void playerEnterArena(Player player)
        {
            // Check if the player belongs to any champion group
            Dictionary<string, int> conversions = GetChampionConversionsForPlayer(player);
            if (conversions != null)
            {
                // Enable champ item conversion by default for champion players.
                _autoConvertEnabled[player] = true;

                // Greet the champion and provide instructions
                player.sendMessage(0, "&Welcome, Champion " + player._alias + "!");
                player.sendMessage(0, "*You are eligible for champion item conversions. Champion items can be disabled by a mod just as an FYI.");
                player.sendMessage(0, "*Type ?champ to toggle automatic champion item conversion on/off. They are enabled by default.");
                player.sendMessage(0, "*Use ?b, ?bw, or ?bwd itemName for this to take effect. (?buy will not work!)");
                player.sendMessage(0, "*The following champion items are available to you:");

                // List the available champion conversions based on which group they belong to
                if (s2Champs.Any(alias => alias.Equals(player._alias, StringComparison.OrdinalIgnoreCase)))
                {
                    player.sendMessage(0, "$Season 2 Champion Items:");
                    foreach (var kvp in s2Conversions)
                    {
                        // Get the champion item name from the asset manager if available
                        ItemInfo champItem = AssetManager.Manager.getItemByID(kvp.Value);
                        string champItemName = champItem != null ? champItem.name : "Unknown";
                        player.sendMessage(0, string.Format("~{0}", champItemName));
                    }
                }
                else if (ovdl1Champs.Any(alias => alias.Equals(player._alias, StringComparison.OrdinalIgnoreCase)))
                {
                    player.sendMessage(0, "$OVDL1 Champion Items:");
                    foreach (var kvp in ovdl1Conversions)
                    {
                        ItemInfo champItem = AssetManager.Manager.getItemByID(kvp.Value);
                        string champItemName = champItem != null ? champItem.name : "Unknown";
                        player.sendMessage(0, string.Format("~{0}", champItemName));
                    }
                }
                else if (s3Champs.Any(alias => alias.Equals(player._alias, StringComparison.OrdinalIgnoreCase)))
                {
                    player.sendMessage(0, "$Season 3 Champion Items:");
                    foreach (var kvp in s3Conversions)
                    {
                        ItemInfo champItem = AssetManager.Manager.getItemByID(kvp.Value);
                        string champItemName = champItem != null ? champItem.name : "Unknown";
                        player.sendMessage(0, string.Format("~{0}", champItemName));
                    }
                }   
            }

            if (!arena._name.Contains("Arena 1"))
                deprizeMinPremades(player, false, false); // Remove items regardless of skill
            if (isOVD)
            {
                player.sendMessage(3, "&Welcome to Offense vs Defense. Please type ?playing or ?p if you wish to play!");

                if (player.PermissionLevel > 0 || player._permissionTemp > 0)
                {
                    player.sendMessage(0, "#If you are hosting OvDs, please use *endgame to spec all. This will automatically trigger the playing/not playing scripting");
                }
            }
            //Add them to the list if its not in it
            if (!killStreaks.ContainsKey(player._alias))
            {
                PlayerStreak temp = new PlayerStreak();
                temp.lastKillerCount = 0;
                temp.lastUsedWeap = null;
                temp.lastUsedWepKillCount = 0;
                temp.lastUsedWepTick = -1;
                killStreaks.Add(player._alias, temp);
            }
        }

        /// <summary>
        /// Triggered when a player wants to unspec and join the game
        /// </summary>
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
                killStreaks.Add(player._alias, temp);
            }

            if (currentEventType == EventType.SUT)
            {
                // Skip warping if player is a Dueler
                if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                    return true;
                    
                for (int i = 2; i <= 33; i++)
                {
                    string teamName = CFG.teams[i].name;
                    Team team = player._arena.getTeamByName(teamName);

                    // Check if the team exists and is empty
                    if (team != null && team.ActivePlayerCount == 0)
                    {
                        AssignPlayerToTeam(player, GetPrimarySkillName(player), team._name, true, false);
                        WarpPlayerToRange(player, 679, 686, 608, 618, 1000);
                        break;
                    }                
                    return true;
                }
            }


            if (currentEventType == EventType.Gladiator && gladiatorPlayers != null)
            {
                JoinGladiatorEvent(player);
            }

            // if (currentEventType == EventType.TDM && _tdmInstance != null)
            // {
            //     // Skip warping if player is a Dueler
            //     if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
            //         return true;
            //         
            //     _tdmInstance.WarpPlayerToTDMSpawn(player);
            //     return false;
            // }

            if (currentEventType == EventType.CTFX)
            {
                // Skip warping if player is a Dueler
                if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                    return true;
                    
                var teamA = arena.getTeamByName(currentMap.TeamNames[0]);
                var teamB = arena.getTeamByName(currentMap.TeamNames[1]);

                if (player.IsSpectator)
                {
                    if (teamA.ActivePlayerCount < teamB.ActivePlayerCount)
                    {
                        player.unspec(teamA);
                    }
                    else
                    {
                        player.unspec(teamB);
                    }
                }

                player._lastMovement = Environment.TickCount;
                player._maxTimeCalled = false;
                WarpPlayerToRange(player, 985, 997, 1117, 1129);

                return false;
            }

            if (currentEventType == EventType.MiniTP)
            {
                // Skip warping if player is a Dueler
                if (player._skills.Values.Any(s => s.skill.Name == "Dueler"))
                    return true;
                    
                var teamA = arena.getTeamByName(currentMap.TeamNames[0]);
                var teamB = arena.getTeamByName(currentMap.TeamNames[1]);

                if (player.IsSpectator)
                {
                    if (teamA.ActivePlayerCount < teamB.ActivePlayerCount)
                    {
                        player.unspec(teamA);
                    }
                    else
                    {
                        player.unspec(teamB);
                    }
                }

                player._lastMovement = Environment.TickCount;
                player._maxTimeCalled = false;
                if (player._team._name.Contains("Titan"))
                    WarpPlayerToRange(player, 654, 654, 518, 518);
                else if (player._team._name.Contains("Collective")) 
                    WarpPlayerToRange(player, 648, 648, 565, 565);

                return false;
            }

            // This is what allows Arena 1 to default to Collective/Titan Militia when initially unspeccing
            if (!isOVD)
            {
                // Get the player's primary skill name
                string playerSkill = GetPrimarySkillName(player);

                // Determine the team for the player if they are a spectator
                Team targetTeam = null;

                // Check if the player is a spectator and has the skill "Dueler"
                if (player.IsSpectator && (playerSkill == "Dueler" || currentEventType == EventType.Gladiator))
                {
                    // Iterate through teams to find an appropriate one (teams 2 to 33)
                    for (int i = 2; i <= 33; i++)
                    {
                        string teamName = CFG.teams[i].name;
                        Team team = player._arena.getTeamByName(teamName);

                        // Check if the team exists and is empty
                        if (team != null  && team.ActivePlayerCount == 0)
                        {
                            targetTeam = team; // Store the team for unspec later
                            break;
                        }
                    }

                    // If a suitable team is found, proceed with duel or gladiator logic
                    if (targetTeam != null)
                    {
                        if (currentEventType == EventType.Gladiator)
                        {
                            // Gladiator event specific logic
                            WarpPlayerToSpawn(player);
                        }
                        else
                        {
                            // Call the Duel logic directly
                            Duel(player);
                        }
                    }
                    else
                    {
                        player.sendMessage(0, "No available teams for the duel or gladiator event.");
                    }
                }

                // Obtain spawn coordinates from the current map.
                var teamA = arena.getTeamByName(currentMap.TeamNames[0]);
                var teamB = arena.getTeamByName(currentMap.TeamNames[1]);

                // If they are not a spectator or they didn't need to duel, unspec them
                if (!player.IsSpectator || targetTeam == null)
                {
                    if (teamA.ActivePlayerCount < teamB.ActivePlayerCount)
                    {
                        player.unspec(teamA);
                    }
                    else
                    {
                        player.unspec(teamB);
                    }
                }

                player._lastMovement = Environment.TickCount;
                player._maxTimeCalled = false;

                return false; // Allow other processes to run after joining the game
            }

            // Initialize live data system when first player joins
            if (arena.Players.Count() == 1)
            {
                try
                {
                    // LiveGameDataIntegration.Initialize - now handled by GameStats
                    if (gameStats != null)
                    {
                        // GameStats handles live data integration automatically
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine(String.Format("[LiveGameData] Error initializing: {0}", ex.Message));
                }
            }
            
            // Send immediate live data update for new player (async, don't block join)
            Task.Run(async () => {
                try
                {
                    await Task.Delay(1000); // Wait 1 second for player to fully join
                    await LiveGameDataIntegration.SendLiveGameData(arena);
                }
                catch (Exception ex)
                {
                    Console.WriteLine(String.Format("[LiveGameData] Error sending update: {0}", ex.Message));
                }
            });

            return true;
        }

        // Switch teams function that switches all players between T and C teams
        public void switchTeams()
        {
            int switchCount = 0;
            List<Player> playersToSwitch = new List<Player>();

            // Get all teams with 2+ players that end in C or T
            var teamsToSwitch = arena.Teams.Where(t => 
                (t._name.EndsWith(" C") || t._name.EndsWith(" T")) &&
                t.ActivePlayerCount >= 2
            ).ToList();

            // First gather all players that need to be switched
            foreach (Player p in arena.Players)
            {
                string currentTeam = p._team._name;
                string newTeam = null;

                // Only process if team has 2+ players and ends with " T" or " C"
                if (teamsToSwitch.Contains(p._team))
                {
                    if (currentTeam.EndsWith(" T"))
                        newTeam = currentTeam.Substring(0, currentTeam.Length - 2) + " C";
                    else if (currentTeam.EndsWith(" C"))
                        newTeam = currentTeam.Substring(0, currentTeam.Length - 2) + " T";

                    if (newTeam != null && newTeam != currentTeam)
                    {
                        // Check if newTeam exists in CFG.teams
                        bool teamExists = CFG.teams.Any(t => t.name == newTeam);
                        if (teamExists)
                        {
                            Team targetTeam = arena.getTeamByName(newTeam);
                            if (targetTeam != null)
                            {
                                playersToSwitch.Add(p);
                            }
                        }
                    }
                }
            }

            // Now process all the switches after gathering the complete list
            foreach (Player p in playersToSwitch)
            {
                string currentTeam = p._team._name;
                string newTeam = currentTeam.EndsWith(" T") 
                    ? currentTeam.Substring(0, currentTeam.Length - 2) + " C"
                    : currentTeam.Substring(0, currentTeam.Length - 2) + " T";

                Team targetTeam = arena.getTeamByName(newTeam);
                
                // If player is spectating, just change their team without unspeccing
                if (p.IsSpectator)
                {
                    p.spec(targetTeam);
                }
                else
                {
                    AssignPlayerToTeam(p, GetPrimarySkillName(p), newTeam, true, false);
                }
                switchCount++;
            }

            // Notify arena of the switch
            if (switchCount > 0)
            {
                arena.sendArenaMessage(string.Format("Teams have been switched! ({0} players affected)", switchCount));
            }
        }

        /// <summary>
        /// Called when a player sends a mod command
        /// </summary>
        [Scripts.Event("Player.ModCommand")]
        public bool playerModCommand(Player player, Player recipient, string command, string payload)
        {
            command = (command.ToLower());

            // if (command.Equals("spec2", StringComparison.OrdinalIgnoreCase))
            // {
            //     // Force recipient to spectator mode first
            //     recipient.spec();

            //     // Send initial message
            //     arena.sendArenaMessage(string.Format("{0} has been spec'd by {1}", recipient._alias, player._alias));

            //     // Start a timer for 2 minutes
            //     System.Timers.Timer specTimer = new System.Timers.Timer(120000);
            //     specTimer.AutoReset = false;
                
            //     string recipientName = recipient._alias;
                
            //     specTimer.Elapsed += (sender, e) =>
            //     {
            //         arena.sendArenaMessage(string.Format("{0}'s spec time has expired", recipientName));
            //         specTimer.Dispose();
            //     };
                
            //     specTimer.Start();
                
            //     return false; // Return false to prevent other handlers from processing
                // }

            // test sl steron
            if (command.ToLower() == "testslsteron"){
                player.inventoryModify(360, 1);
                return true;
            }

            // Test the SpawnBuildDifferentialItems functionality
            if (command.ToLower() == "testdrop")
            {
                // If a recipient is specified, test on them; otherwise test on the mod
                Player targetPlayer = recipient ?? player;
                
                // Check if payload specifies squad leader test
                bool testSquadLeader = !string.IsNullOrEmpty(payload) && payload.ToLower() == "sl";
                
                targetPlayer.sendMessage(0, string.Format("Testing SpawnBuildDifferentialItems ({0})...", 
                    testSquadLeader ? "Squad Leader scenario" : "normal scenario"));
                
                // Clear their auto-drop tracking to allow the test
                playersWithAutoDrops.Remove(targetPlayer._alias);
                
                // Call the differential items spawn function
                SpawnBuildDifferentialItems(targetPlayer, testSquadLeader);
                
                targetPlayer.sendMessage(0, "Test drop completed!");
                player.sendMessage(0, string.Format("Executed {0} test drop for {1}", 
                    testSquadLeader ? "Squad Leader" : "normal", targetPlayer._alias));
                
                return true;
            }

            // Test the new auto-drop system that simulates summon/teleport scenario
            if (command.ToLower() == "testautodrop")
            {
                // If a recipient is specified, test on them; otherwise test on the mod
                Player targetPlayer = recipient ?? player;
                
                targetPlayer.sendMessage(0, "Testing SpawnAutoDropItems (simulating summon/teleport)...");
                
                // Clear their auto-drop tracking to allow the test
                playersWithAutoDrops.Remove(targetPlayer._alias);
                
                // Call the new auto-drop function
                SpawnAutoDropItems(targetPlayer);
                
                targetPlayer.sendMessage(0, "Auto-drop test completed!");
                player.sendMessage(0, string.Format("Executed auto-drop test for {0}", targetPlayer._alias));
                
                return true;
            }

            // Toggle Enable/Disable of energizer command
            if (command.ToLower() == "togglegizer"){
                _energizerCommandEnabled = !_energizerCommandEnabled;
                return true;
            }

            // Test phrase instead of testupload

            if (command.ToLower() == "testspawn")
            {
                // If Team contains " T" - Titan Dropship. If " C" - Collective Dropship.
                if (player._team._name.Contains(" T"))
                {
                    ItemInfo item2009 = arena._server._assets.getItemByID(2009);
                    arena.itemSpawn(item2009, 150, 689 * 16, 460 * 16, null);
                }
                else if (player._team._name.Contains(" C"))
                {
                    ItemInfo item2009 = arena._server._assets.getItemByID(2005);
                    arena.itemSpawn(item2009, 150, 689 * 16, 615 * 16, null);
                }
                return true;
            }

            if (command.ToLower() == "testphrase")
            {
                player.sendMessage(0, "Testing phrase system...");
                
                // First test basic connectivity
                bool connectionOk = PhraseExplosionManager.TestConnection(player._alias).Result;
                player.sendMessage(0, string.Format("Connection test: {0}", connectionOk ? "PASSED" : "FAILED"));
                
                if (connectionOk)
                {
                    // Get the player's phrase from cache
                    string playerPhrase = PhraseExplosionManager.GetPlayerPhrase(player._alias).Result;
                    
                    if (!string.IsNullOrEmpty(playerPhrase))
                    {
                        player.sendMessage(0, string.Format("Your custom phrase is: {0}", playerPhrase));
                        ExplosionHelper.CreateCustomExplosion(arena, player, player._state.positionX, player._state.positionY, player._state.positionZ);
                    }
                    else 
                    {
                        player.sendMessage(0, "No custom phrase found for your alias.");
                    }
                    return true;
                }
            }

            // Test command for Rogue explosion
            if (command.ToLower() == "testrogueexplosion")
            {     
                ExplosionHelper.CreateRogueExplosion(arena, player, player._state.positionX, player._state.positionY, player._state.positionZ);
                return true;
            }

            if (command.Equals("flip", StringComparison.OrdinalIgnoreCase))
            {
                switchTeams();
                return true;
            }

            if (command.Equals("spawndrops", StringComparison.OrdinalIgnoreCase))
            {
                // payload is true or false
                bool result;
                bool spreadItems = bool.TryParse(payload, out result) ? result : false;
                ManageFixedDropLocations(spreadItems);
                return true;
            }

            if (command.Equals("dropcount", StringComparison.OrdinalIgnoreCase))
            {
                bool detail = !string.IsNullOrEmpty(payload) && payload.Equals("detail", StringComparison.OrdinalIgnoreCase);
                int dropCount = CountDropsInArena(detail);
                player.sendMessage(0, string.Format("Drop count: {0}", dropCount));
                return true;
            }

            // Command to clear the swing dictionary
            if (command.Equals("clearswing", StringComparison.OrdinalIgnoreCase))
            {
                swingDictionary.Clear();
                player.sendMessage(0, "Swing dictionary cleared");
                return true;
            }

            // Command to add a player to the swing dictionary
            if (command.Equals("addswing", StringComparison.OrdinalIgnoreCase))
            {
                //player.sendMessage(0, string.Format("Debug: Processing addswing command with payload: '{0}'", payload));
                
                // Check if this is a private message to a player
                if (recipient != null)
                {
                    // Payload format: side (T or C)
                    string side = payload.Trim().ToUpper();
                    if (side != "T" && side != "C")
                    {
                        player.sendMessage(0, "Usage: /*addswing <T or C>");
                        return true;
                    }
                    
                    // Add the recipient to the swing dictionary
                    swingDictionary[recipient._alias] = side;
                    //player.sendMessage(0, string.Format("Added {0} to the swing dictionary as {1}", recipient._alias, side));
                    //player.sendMessage(0, string.Format("Debug: Dictionary now contains {0} entries", swingDictionary.Count));
                    return true;
                }
                else
                {
                    // Public command format: alias:side (T or C)
                    string[] parts = payload.Split(new char[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length != 2)
                    {
                        player.sendMessage(0, "Usage: addswing <alias>:<side> (T or C)");
                        return true;
                    }
                    
                    string playerAlias = parts[0].Trim();
                    string side = parts[1].Trim().ToUpper();
                    
                    if (side != "T" && side != "C")
                    {
                        player.sendMessage(0, "Side must be either T or C");
                        return true;
                    }
                    
                    // Add the player to the swing dictionary
                    swingDictionary[playerAlias] = side;
                    //player.sendMessage(0, string.Format("Added {0} to the swing dictionary as {1}", playerAlias, side));
                    //player.sendMessage(0, string.Format("Debug: Dictionary now contains {0} entries", swingDictionary.Count));
                    return true;
                }
            }

            // Command to do a series of actions to a player
            if (command.Equals("swing", StringComparison.OrdinalIgnoreCase))
            {
                player.sendMessage(0, string.Format("Debug: Executing swing command. Dictionary contains {0} entries", swingDictionary.Count));
                
                if (swingDictionary.Count == 0)
                {
                    //player.sendMessage(0, "No players in swing dictionary. Use addswing command first.");
                    return true;
                }
                
                // Process all players in the swing dictionary
                foreach (var entry in swingDictionary)
                {
                    string playerAlias = entry.Key;
                    string targetSide = entry.Value;
                    
                    //player.sendMessage(0, string.Format("Debug: Processing swing for {0} to side {1}", playerAlias, targetSide));
                    
                    // Find the player by alias
                    Player targetPlayer = arena.Players.FirstOrDefault(p => p._alias == playerAlias);
                    if (targetPlayer == null)
                    {
                        //player.sendMessage(0, string.Format("Player {0} not found in arena", playerAlias));
                        continue;
                    }
                    
                    // 1) Unspec the player if they're a spectator
                    if (targetPlayer.IsSpectator)
                    {
                        Team targetTeam = null;
                        
                        // Determine which team to join based on swing dictionary
                        if (targetSide == "T")
                        {
                            // Find a team with "T" in the name that has players on it
                            foreach (Team team in arena.Teams)
                            {
                                if (team._name.Contains("T") && team.ActivePlayerCount > 0)
                                {
                                    targetTeam = team;
                                    break;
                                }
                            }
                        }
                        else
                        {
                            // Find a team with "C" in the name
                            foreach (Team team in arena.Teams)
                            {
                                if (team._name.Contains(" C") && team.ActivePlayerCount > 0)
                                {
                                    targetTeam = team;
                                    break;
                                }
                            }
                        }
                        
                        if (targetTeam != null)
                        {
                            //player.sendMessage(0, string.Format("Debug: Unspeccing {0} to team {1}", targetPlayer._alias, targetTeam._name));
                            targetPlayer.unspec(targetTeam);
                        }
                        else
                        {
                            //player.sendMessage(0, string.Format("Debug: Could not find appropriate team for side {0}", targetSide));
                        }
                    }
                    
                    // 2) Warp the player to a random teammate that is not dead
                    if (!targetPlayer.IsSpectator && targetPlayer._team != null)
                    {
                        // Get all teammates who are not dead
                        var aliveTeammates = targetPlayer._arena.Players
                            .Where(p => p._team == targetPlayer._team && p != targetPlayer && !p.IsDead)
                            .ToList();
                        
                        //player.sendMessage(0, string.Format("Debug: Found {0} alive teammates for {1}", aliveTeammates.Count, targetPlayer._alias));
                        
                        if (aliveTeammates.Count > 0)
                        {
                            // Select a random teammate
                            Random rand = new Random();
                            Player randomTeammate = aliveTeammates[rand.Next(aliveTeammates.Count)];
                            
                            // Warp player to the random teammate's position
                            //player.sendMessage(0, string.Format("Debug: Warping {0} to teammate {1} at position ({2}, {3})", 
                            //    targetPlayer._alias, randomTeammate._alias, randomTeammate._state.positionX, randomTeammate._state.positionY));
                            targetPlayer.warp(randomTeammate._state.positionX, randomTeammate._state.positionY);
                        }
                    }
                    
                    // 3) Set their energy to -500 of their max energy
                    if (!targetPlayer.IsSpectator)
                    {
                        int currentEnergy = targetPlayer._state.energy;
                        int newEnergy = Math.Max(0, currentEnergy - 500);
                        //player.sendMessage(0, string.Format("Debug: Reducing {0}'s energy from {1} to {2}", 
                        //    targetPlayer._alias, currentEnergy, newEnergy));
                        targetPlayer.setEnergy((short)newEnergy);
                    }
                    
                    // Notify the mod who issued the command
                    //player.sendMessage(0, string.Format("Applied swing to player: {0}", targetPlayer._alias));
                }
                
                return true;
            }

            if (command.Equals("summonstats", StringComparison.OrdinalIgnoreCase))
            {
                // Prepare lists for each team
                var collectiveSummonedCounts = new List<Tuple<string, int>>();
                var titanSummonedCounts = new List<Tuple<string, int>>();

                foreach (var entry in summonedCounts)
                {
                    ushort playerId = entry.Key;
                    int count = entry.Value;
                    Player p = arena.getPlayerById(playerId);
                    if (p == null)
                        continue; // Player not found (maybe left the game)

                    string teamName = p._team._name;
                    string alias = p._alias;

                    if ((teamName != null && (teamName.Contains("Collective") || teamName.Contains(" C"))))
                        collectiveSummonedCounts.Add(new Tuple<string, int>(alias, count));
                    else if ((teamName != null && (teamName.Contains("Titan") || teamName.Contains(" T"))))
                        titanSummonedCounts.Add(new Tuple<string, int>(alias, count));
                }

                // Sort by count descending
                collectiveSummonedCounts = collectiveSummonedCounts.OrderByDescending(x => x.Item2).ToList();
                titanSummonedCounts = titanSummonedCounts.OrderByDescending(x => x.Item2).ToList();

                // Print results
                player.sendMessage(0, "!Collective");
                foreach (var item in collectiveSummonedCounts){
                    player.sendMessage(0, string.Format("@{0} {1}", item.Item1, item.Item2));
                }

                player.sendMessage(0, "Titan");
                foreach (var item in titanSummonedCounts){
                    player.sendMessage(0, string.Format("~{0} {1}", item.Item1, item.Item2));
                }

                return true;
            }

            // Toggle playerWeaponStats enable/disable
            if (command.Equals("weaponstats", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrEmpty(payload))
                {
                    _playerStatsEnabled = !_playerStatsEnabled;
                }
                player.sendMessage(0, string.Format("Weapon stats are now {0}", _playerStatsEnabled ? "enabled" : "disabled"));
                return true;
            }

            if (command.Equals("redirect", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(payload))
                {
                    player.sendMessage(-1, "Usage: setredirect <side> <base> (e.g., setredirect titan d8)");
                    return false;
                }
                string[] parts = payload.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length != 2)
                {
                    player.sendMessage(-1, "Invalid parameters. Usage: setredirect <side> <base>");
                    return false;
                }
                string side = parts[0].ToLower();
                string baseStr = parts[1].ToLower();
                if (side != "titan" && side != "collective")
                {
                    player.sendMessage(-1, "Invalid side. Use 'titan' or 'collective'.");
                    return false;
                }
                if (baseStr != "d8" && baseStr != "a10" && baseStr != "a8" && baseStr != "f8" && baseStr != "b8")
                {
                    player.sendMessage(-1, "Invalid base. Use one of: d8, a10, a8, f8, b8.");
                    return false;
                }

                redirectSide = side;
                redirectBase = baseStr;
                player.sendMessage(0, string.Format("Redirect settings updated: side = {0}, base = {1}.", redirectSide, redirectBase));
                return false;
            }

            if (command.Equals("exportstate", StringComparison.OrdinalIgnoreCase))
            {
                ExportStateToCSV(player, payload, payload);
                return true;
            }

            if (command.Equals("autosave", StringComparison.OrdinalIgnoreCase))
            {
                bool enable;
                if (string.IsNullOrEmpty(payload) || !bool.TryParse(payload, out enable))
                {
                    // Toggle current state if no payload or invalid boolean
                    enable = !isAutoSaving;
                }
                ToggleAutoSave(player, enable);
                return true;
            }

            if (command.Equals("saveplaybook", StringComparison.OrdinalIgnoreCase) || command.Equals("sp", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(payload))
                {
                    SavePlaybook(payload);
                    SaveState(payload);
                }
                player.sendMessage(0, string.Format("Playbook state '{0}' saved successfully.", payload));
                return true;
            }

            if (command.Equals("loadplaybook", StringComparison.OrdinalIgnoreCase) || command.Equals("lp", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(payload))
                {
                    LoadPlaybook(payload);
                    SaveState(payload);
                }   
                return true;
            } 

            if (command.Equals("exportplaybook", StringComparison.OrdinalIgnoreCase) || command.Equals("ep", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(payload))
                {
                    ExportPlayBook(payload);
                    player.sendMessage(0, string.Format("Playbook state '{0}' exported successfully.", payload));
                }
                return true;
            }

            if (command.Equals("savestate", StringComparison.OrdinalIgnoreCase) || command.Equals("ss", StringComparison.OrdinalIgnoreCase)){
                if (!string.IsNullOrEmpty(payload))
                {
                    SaveState(payload);
                }
                return true;
            }
            
            if (command.Equals("loadstate", StringComparison.OrdinalIgnoreCase) || command.Equals("ls", StringComparison.OrdinalIgnoreCase)){
                if (!string.IsNullOrEmpty(payload))
                {
                    if (payload.Equals("next", StringComparison.OrdinalIgnoreCase))
                    {
                        LoadNextState(player);
                    }
                    else
                    {
                        LoadState(payload);
                    }
                }
                return true;
            }

            if (command.Equals("loadstatepause", StringComparison.OrdinalIgnoreCase) || command.Equals("lsp", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(payload))
                {
                    LoadStatePause(payload);
                }
                return true;
            }

            if (command.Equals("turrets", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrEmpty(payload))
                    {
                        BuildTurretExample(player);
                    }
                    return true;
                }
            
            if (command.Equals("turret", StringComparison.OrdinalIgnoreCase))
                {
                    if (!string.IsNullOrEmpty(payload))
                        {
                            short playerX = player._state.positionX;
                            short playerY = player._state.positionY;
                            BuildTurretAtLocation(player, payload, playerX, playerY);
                        }
                    return true;
                }

            if (command.Equals("champItems", StringComparison.OrdinalIgnoreCase))
                {
                    bool wasEnabled = isChampEnabled;
                    
                    // Allow disabling champ items any day, but only allow enabling them on non-Sundays
                    if (isChampEnabled || DateTime.Now.DayOfWeek != DayOfWeek.Sunday)
                    {
                        isChampEnabled = !isChampEnabled;
                        
                        // If we're disabling champ items, also remove them
                        if (wasEnabled && !isChampEnabled)
                        {
                            RemoveChampItems();
                        }
                    }
                    else
                    {
                        player.sendMessage(-1, "Champion items cannot be enabled on Sundays.");
                    }
                    arena.sendArenaMessage(string.Format("Champ items are now {0}", isChampEnabled ? "enabled" : "disabled"));
                    return true;
                }

            if (command.Equals("deprize", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (Player p in arena.Players)
                    {
                        deprizeMinPremades(p, false, true);
                    }
                    return true;
                }

            if (command.Equals("arenaprofile", StringComparison.OrdinalIgnoreCase))
            {
                CheckArenaItemProfile(player);
                return true;
            }

            if (command.Equals("switchTest", StringComparison.OrdinalIgnoreCase))
                {
                    // Check if payload is provided
                    if (string.IsNullOrEmpty(payload))
                    {
                        player.sendMessage(0, "Usage: *switchtest true|false");
                        return true; // Command handled
                    }

                    // Try to parse the payload into a boolean
                    bool isOpen;
                    if (bool.TryParse(payload, out isOpen))
                    {
                        EmulateSwitch(player, isOpen);
                    }
                    else
                    {
                        player.sendMessage(0, "Invalid parameter. Use true or false.");
                    }
                    return true; // Command handled
                }

            if (command.Equals("duel", StringComparison.OrdinalIgnoreCase))
            {
                switch (payload.ToLower())
                {
                    case "start":
                        if (duelState == DuelEventState.Inactive)
                        {
                            StartDuelEvent(player);
                            //player.sendMessage(0, "Duel tournament has started! Players can now sign up using ?duel.");
                        }
                        else
                        {
                            EndDuelEvent();
                            player.sendMessage(0, "Duel tournament has been stopped.");
                        }
                        break;
                    case "off":
                    case "end":
                        if (duelState != DuelEventState.Inactive)
                        {
                            EndDuelEvent();
                            player.sendMessage(0, "Duel tournament has been stopped.");
                        }
                        else
                        {
                            player.sendMessage(0, "No duel tournament is active.");
                        }
                        break;
                    case "info":
                        player.sendMessage(0, "Duel tournament pairs players in a best-of-three format. Sign up with ?duel.");
                        break;
                    default:
                        player.sendMessage(0, "Invalid command. Use *duel start, *duel end, or *duel info.");
                        break;
                }
                return true;
            }

            if (command.Equals("vote", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                StartEventVoting();
                return true;
            }

            if (command.Equals("event", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(payload))
                {
                    // Display the list of possible events if no payload is provided
                    player.sendMessage(0, string.Format("Available events: {0}", string.Join(", ", Enum.GetNames(typeof(EventType)))));
                    return true;
                }

                // Check if the input payload matches an event type
                EventType eventType;
                if (Enum.TryParse<EventType>(payload, true, out eventType))
                {
                    // If an event is already running, stop it first
                    if (currentEventType != default(EventType) && currentEventType != EventType.None)
                    {
                        EndEvent();
                        player.sendMessage(0, string.Format("Event '{0}' has been stopped.", currentEventType));
                    }
                    
                    // Now start the new event (regardless of whether we stopped one)
                    if (eventType != EventType.None)
                    {
                        StartEvent(eventType);
                        player.sendMessage(0, string.Format("Event '{0}' has been started.", eventType));
                    }
                    return true;
                }
                else
                {
                    // Inform the player if the provided event type is invalid
                    player.sendMessage(-1, string.Format("Invalid event type. Available events: {0}", string.Join(", ", Enum.GetNames(typeof(EventType)))));
                }
            }

           if (command.Equals("base"))
            {
                string[] args = payload.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

                // Canonical valid sides
                string[] validSides = { "Titan", "Collective" };
                Dictionary<string, int[]> locations = new Dictionary<string, int[]>()
                {
                    { "d8", new int[] { 275, 601 } },
                    { "a10", new int[] { 32, 696 } },
                    { "a8", new int[] { 28, 611 } },
                    { "f8", new int[] { 421, 569 } }
                };

                if (args.Length == 2)
                {
                    string inputSide = args[0].Trim();
                    string inputLocation = args[1].Trim();

                    // Use canonical side casing for SpawnVehicle
                    string side = validSides.FirstOrDefault(s => s.Equals(inputSide));
                    if (side == null)
                    {
                        player.sendMessage(-1, string.Format("Invalid side: {0}", inputSide));
                        player.sendMessage(-1, string.Format("Valid sides: {0}", string.Join(", ", validSides)));
                        return false;
                    }

                    if (!locations.ContainsKey(inputLocation))
                    {
                        player.sendMessage(-1, string.Format("Invalid location: {0}", inputLocation));
                        player.sendMessage(-1, string.Format("Valid locations: {0}", string.Join(", ", locations.Keys)));
                        return false;
                    }

                    SpawnVehicle(side, inputLocation);
                    return true;
                }
                else
                {
                    player.sendMessage(-1, "Usage: *base <side> <location>");
                    player.sendMessage(-1, string.Format("Valid sides: {0}", string.Join(", ", validSides)));
                    player.sendMessage(-1, string.Format("Valid locations: {0}", string.Join(", ", locations.Keys)));
                    return false;
                }
            }

            if (command.Equals("min", StringComparison.OrdinalIgnoreCase))
            {
                // send the message to the player who called the command
                CountItemsOnSpecificTerrain(arena);
                return true;
            }

            // if (command.Equals("min2", StringComparison.OrdinalIgnoreCase))
            // {
            //     InfServer.Game.Arena.ItemDrop item = arena.getItemInRange(arena._server._assets.getItemByName("Titanium Oxide"), (short)650, (short)450, (int)300);
            //     if (item != null)
            //     {
            //         arena.sendArenaMessage(string.Format("Item: {0}, Quantity: {1}", item.item.name, item.quantity));
            //     }
            //     else
            //     {
            //         arena.sendArenaMessage("No Titanium Oxide found in range.");
            //     }
            //     return true;
            // }

            if (command.Equals("privateteams", StringComparison.OrdinalIgnoreCase) || command.Equals("pt", StringComparison.OrdinalIgnoreCase))
            {
                // Toggle the allowPrivateTeams flag
                allowPrivateTeams = !allowPrivateTeams;

                // Notify the moderator and players of the change
                string status = allowPrivateTeams ? "enabled" : "disabled";
                player.sendMessage(0, string.Format("Private teams have been {0} for this arena.", status));
                arena.sendArenaMessage(string.Format("Private teams are now {0}. Use ?t teamName:password to join a private team.", status));
                return true;
            }

            // Modify the command handler for '*mix'
            if (command.Equals("mix", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (!string.IsNullOrEmpty(payload))
                {
                    if (payload.Equals("help", StringComparison.OrdinalIgnoreCase))
                    {
                        // Display help message
                        player.sendMessage(0, "Usage: *mix [auto|end|off|help]");
                        player.sendMessage(0, "*mix: Starts or toggles the mix process.");
                        player.sendMessage(0, "*mix auto: Automatically assigns roles based on pre-selected skills.");
                        player.sendMessage(0, "*mix end/off: Ends the mix process.");
                        return true;
                    }
                    else if (payload.Equals("end", StringComparison.OrdinalIgnoreCase) || payload.Equals("off", StringComparison.OrdinalIgnoreCase))
                    {
                        if (isMixActive)
                        {
                            isMixActive = false;
                            mixGameActive = true;
                            player.sendMessage(0, "Mix process has been ended.");
                            // Additional cleanup if necessary
                        }
                        else
                        {
                            player.sendMessage(0, "Mix process is not active.");
                        }
                        return true;
                    }
                    else if (payload.Equals("auto", StringComparison.OrdinalIgnoreCase))
                    {
                        player.sendMessage(0, "Mix auto initiated");
                        StartMixProcess(); // Start the mix process
                        AssignPlayersBasedOnSkills(); // Automatically assign roles based on pre-selected skill
                        return true;
                    }
                    else
                    {
                        player.sendMessage(0, "Invalid option. Type '*mix help' for usage information.");
                        return true;
                    }
                }
                else
                {
                    // No payload provided; toggle the mix process
                    if (isMixActive)
                    {
                        isMixActive = false;
                        player.sendMessage(0, "Mix process has been ended.");
                        // Additional cleanup if necessary
                    }
                    else
                    {
                        player.sendMessage(0, "Mix initiated");
                        StartMixProcess();
                    }
                    return true;
                }
            }

            if (command.Equals("fireworks"))
            {
                LaunchFireworks(player);
                return true;
            }

            if (command.Equals("setup"))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (!bases.ContainsKey(payload.ToUpper()))
                {
                    player.sendMessage(-1, "That base is not recognized, Options are: ");
                    foreach (string key in bases.Keys)
                        player.sendMessage(0, key);

                    return true;
                }

                isSD = false;
                isSecondOvertime = false;
                overtimeStart = 0;
                secondOvertimeStart = 0;
                is5v5 = true;
                Base defense = bases[payload.ToUpper()];

                // arena.itemSpawn(arena._server._assets.getItemByName("Fuel Canister"), 600, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("Ammo MG"), 1250, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("Light HE"), 250, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("Heavy HE"), 100, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("Ammo Pistol"), 2500, defense.x, defense.y, 0, null);

                // arena.itemSpawn(arena._server._assets.getItemByName("AP Mine"), 25, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("Plasma Mine"), 25, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("Bullet Mine"), 100, defense.x, defense.y, 0, null);

                // arena.itemSpawn(arena._server._assets.getItemByName("rocket"), 200, defense.x, defense.y, 0, null);
                // arena.itemSpawn(arena._server._assets.getItemByName("tranq"), 50, defense.x, defense.y, 0, null);

                // arena.itemSpawn(arena._server._assets.getItemByName("sentry"), 5, defense.x, defense.y, 0, null);

                arena.itemSpawn(arena._server._assets.getItemByID(2005), 150, defense.x, defense.y, 100, null);
                arena.itemSpawn(arena._server._assets.getItemByID(2009), 150, defense.x, defense.y, 100, null);


                

                //arena.itemSpawn(arena._server._assets.getItemByID(23), 2, defense.x, defense.y, 100, null);

                //arena.itemSpawn(arena._server._assets.getItemByID(10), 2, defense.x, defense.y, 100, null);
                //arena.itemSpawn(arena._server._assets.getItemByID(11), 1, defense.x, defense.y, 100, null);
                //arena.itemSpawn(arena._server._assets.getItemByID(9), 1, defense.x, defense.y, 100, null);
                Arena.FlagState flag = arena.getFlag("Bridge3");

                flag.posX = defense.flagX;
                flag.posY = defense.flagY;
                flag.oldPosX = defense.flagX;
                flag.oldPosY = defense.flagY;

                // Set flag ownership based on base location
                string baseKey = payload.ToUpper();
                // Titan Bases
                if (baseKey == "D7" || baseKey == "F6" || baseKey == "F5")
                {
                    // Find active team containing " T" and assign flag
                    flag.team = arena.Teams.FirstOrDefault(t => t._name.Contains(" T") && t.ActivePlayerCount > 0);
                }
                // Collective Bases
                else if (baseKey == "A7" || baseKey == "A5" || baseKey == "B6" || baseKey == "H4" || baseKey == "B8")
                {
                    // Find active team containing " C" and assign flag 
                    flag.team = arena.Teams.FirstOrDefault(t => t._name.Contains(" C") && t.ActivePlayerCount > 0);
                }
                
                // Move all non-Bridge3 flags to coordinates (25,25)
                Arena.FlagState flag1 = arena.getFlag("Bridge1");
                Arena.FlagState flag2 = arena.getFlag("Hill201"); 
                Arena.FlagState flag3 = arena.getFlag("Hill86");
                Arena.FlagState flag4 = arena.getFlag("Bridge2");

                flag1.posX = 50 * 16;
                flag1.posY = 30 * 16;
                Helpers.Object_Flags(arena.Players, flag1);

                flag2.posX = 50 * 16;
                flag2.posY = 30 * 16;
                Helpers.Object_Flags(arena.Players, flag2);

                flag3.posX = 50 * 16;
                flag3.posY = 30 * 16;
                Helpers.Object_Flags(arena.Players, flag3);

                flag4.posX = 50 * 16;
                flag4.posY = 30 * 16;
                Helpers.Object_Flags(arena.Players, flag4);

                Helpers.Object_Flags(arena.Players, flag);
                //Store the base used in a global variable
                baseUsed = payload.ToUpper();
                ManageFixedDropLocations();
                WebIntegration.SendGameDataToWebsite(arena, baseUsed);
                arena.sendArenaMessage(String.Format("&Minerals, flag, and drops spawned at {0}", payload.ToUpper()));
                return true;
            }
            // Trigger command to manually send live game data snapshot
            if (command.StartsWith("sendlive") || command.StartsWith("livedata"))
            {
                if (!player._developer && player.PermissionLevelLocal < InfServer.Data.PlayerPermission.ArenaMod)
                {
                    player.sendMessage(-1, "You don't have permission to use that command.");
                    return true;
                }

                try
                {
                    // Get all players for the snapshot
                    var allPlayers = arena.Players.ToList();
                    var liveGameDataPlayers = new List<CTFGameType.LiveGameDataIntegration.LivePlayerData>();
                    
                    // Determine game type and offense team
                    string gameType = WebIntegration.DetermineGameType(arena._name);
                    bool titanIsOffense = WebIntegration.DetermineOffenseTeam(allPlayers, arena);
                    
                    player.sendMessage(-1, String.Format("&Preparing live data snapshot for {0} players...", allPlayers.Count));
                    
                    // Process ALL players including spectators for the snapshot
                    foreach (Player p in allPlayers)
                    {
                        string actualTeamName = p._team._name;
                        string teamType = "Unknown";
                        string className = "Spectator";
                        bool isOffense = false;
                        string weapon = null;
                        
                        // Determine team type
                        if (p._team.IsSpec || actualTeamName == "spec" || actualTeamName == "Spec")
                        {
                            teamType = "Spectator";
                            className = "Spectator";
                        }
                        else if (actualTeamName.Contains(" T") || actualTeamName.Contains("Titan"))
                        {
                            teamType = "Titan";
                            isOffense = titanIsOffense;
                        }
                        else if (actualTeamName.Contains(" C") || actualTeamName.Contains("Collective"))
                        {
                            teamType = "Collective";
                            isOffense = !titanIsOffense;
                        }
                        else if (actualTeamName.Contains("np") || actualTeamName.Contains("Not Playing"))
                        {
                            teamType = "NotPlaying";
                            className = "NotPlaying";
                        }
                        
                        // Get actual class if not spectating
                        if (!p.IsSpectator && p._baseVehicle != null)
                        {
                            className = p._baseVehicle._type.Name;
                            weapon = WebIntegration.GetSpecialWeapon(p);
                        }
                        
                        // Get player health and energy
                        int currentHealth = p._state.health;
                        int currentEnergy = p._state.energy;
                        bool isAlive = !p.IsDead;
                        
                        var playerData = new CTFGameType.LiveGameDataIntegration.LivePlayerData
                        {
                            alias = p._alias,
                            team = actualTeamName,
                            teamType = teamType,
                            className = className,
                            isOffense = isOffense,
                            weapon = weapon,
                            classPlayTimes = new Dictionary<string, int>(),
                            totalPlayTime = 0,
                            isDueling = false,
                            duelOpponent = null,
                            duelType = null,
                            currentHealth = currentHealth,
                            currentEnergy = currentEnergy,
                            isAlive = isAlive
                        };
                        
                        liveGameDataPlayers.Add(playerData);
                    }
                    
                    // Send the data without validation check
                    player.sendMessage(-1, "&Sending live data snapshot to website...");
                    
                    // Debug info - reduced logging
                    // Console.WriteLine(String.Format("[LiveGameData] Manual command: Sending {0} players", liveGameDataPlayers.Count));
                    // foreach (var p in liveGameDataPlayers)
                    // {
                    //     Console.WriteLine(String.Format("[LiveGameData] Player: {0}, Team: {1}, Type: {2}, Class: {3}", 
                    //         p.alias, p.team, p.teamType, p.className));
                    // }
                    
                    Task.Run(async () => {
                        try
                        {
                            await CTFGameType.LiveGameDataIntegration.SendLiveGameDataManual(arena, baseUsed, liveGameDataPlayers);
                            arena.sendArenaMessage(String.Format("&Live game data snapshot sent! ({0} players)", liveGameDataPlayers.Count));
                        }
                        catch (Exception ex)
                        {
                            arena.sendArenaMessage(String.Format("!Error sending live data: {0}", ex.Message));
                            Console.WriteLine(String.Format("[LiveGameData] Manual command error: {0}", ex.ToString()));
                        }
                    });
                    
                    return true;
                }
                catch (Exception ex)
                {
                    player.sendMessage(-1, String.Format("!Error preparing live data: {0}", ex.Message));
                    return true;
                }
            }
            
            // Trigger command overtime or ot with optional minutes parameter
            if (command.Equals("overtime") || command.Equals("ot"))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod){
                    player.sendMessage(-1, "permissions lacking, cannot trigger overtime.");
                    return false;
                }

                if (!string.IsNullOrEmpty(payload))
                {
                    int minutes;
                    if (int.TryParse(payload, out minutes))
                    {
                        ScheduleOvertime(minutes);
                        player.sendMessage(0, "Overtime scheduled to start at " + minutes + " minutes.");
                    }
                    else
                    {
                        player.sendMessage(-1, "Invalid minutes parameter. Please enter a valid number.");
                        return false;
                    }
                }
                else
                {
                    ToggleOvertimeMode();
                }
                return true;
            }

            if (command.Equals("sd"))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;
                
                arena.flagReset();
                //SpawnMapFlag();
                //Arena.FlagState flag = arena.getFlag("Hill201");
                // Get the "sdFlag" and activate it
                Arena.FlagState flag = arena.getFlag("sdFlag");

                if (flag == null)
                {
                    player.sendMessage(-1, "Sudden death flag not found.");
                    return false;
                }

                // Set the flag to active
                flag.bActive = true;

                Random random = new Random();
                int sdrr = random.Next(5); // Generates a random number between 0 and 4 (inclusive)
                switch (sdrr)
                {
                    case 0:
                        flag.posX = (short)(202 * 16);
                        flag.posY = (short)(120 * 16);
                        break;
                    case 1:
                        flag.posX = (short)(202 * 16);
                        flag.posY = (short)(202 * 16);
                        break;
                    case 2:
                        flag.posX = (short)(202 * 16);
                        flag.posY = (short)(286 * 16);
                        break;
                    case 3:
                        flag.posX = (short)(607 * 16);
                        flag.posY = (short)(166 * 16);
                        break;
                    case 4:
                        flag.posX = (short)(747 * 16);
                        flag.posY = (short)(211 * 16);
                        break;
                }

                Helpers.Object_Flags(arena.Players, flag);

				arena.sendArenaMessage("!+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+", 30);
                arena.sendArenaMessage("&|  S U D D E N   D E A T H  |");
				arena.sendArenaMessage("!+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+");
                arena.sendArenaMessage("&|  S U D D E N   D E A T H  |");
				arena.sendArenaMessage("!+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+");
                arena.sendArenaMessage("&|  S U D D E N   D E A T H  |");
                arena.sendArenaMessage("!+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+", 17);

                return true;
            }


            if (command.Equals("healall"))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                {
                    return false;
                }

                HealAll();
                return true;
            }

            if (command == "map")
            {
                var mapNames = string.Join(", ", availableMaps.Select(x => x.MapName));

                if (string.IsNullOrWhiteSpace(payload))
                {
                    player.sendMessage(-1, "Available map options are: " + mapNames);
                }
                else
                {
                    var requestedEvent = availableMaps.FirstOrDefault(x => x.MapName == payload);

                    if (requestedEvent != null)
                    {
                        player.sendMessage(-1, "Switching to map " + requestedEvent.MapName);
                        currentMap = requestedEvent;

                        SpawnMapPlayers();
                        SpawnMapFlags();
                    }
                    else
                    {
                        player.sendMessage(-1, "Map with that name not found. Available options are: " + mapNames);
                    }
                }
                
                return true;
            }

            // OvD Automation Commands
            if (command.Equals("ovd", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.ToggleOvDAutomation();
                return true;
            }

            // OvD Test Commands
            if (command.Equals("ovdtest1", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestPhase1();
                return true;
            }

            if (command.Equals("ovdend", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestEndPhase();
                return true;
            }

            if (command.Equals("ovdstatus", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestStatus();
                return true;
            }

            if (command.Equals("ovdphase2", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestPhase2();
                return true;
            }

            if (command.Equals("ovdphase3", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestPhase3();
                return true;
            }

            if (command.Equals("ovdphase4", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestPhase4();
                return true;
            }

            if (command.Equals("ovdphase5", StringComparison.OrdinalIgnoreCase))
            {
                if (player.PermissionLevelLocal < Data.PlayerPermission.ArenaMod)
                    return false;

                if (_ovdAutomation == null)
                {
                    player.sendMessage(0, "OvD Automation is not initialized.");
                    return true;
                }

                _ovdAutomation.TestPhase5();
                return true;
            }

            return false;
        }

        #endregion

        #region Updaters

        private void UpdateGameEndFlagStats()
        {
            foreach(var player in arena.PlayersIngame)
            {
                if (player._team == winningTeam)
                {
                    ctfPlayerProxy.player = player;
                    ctfPlayerProxy.GamesWon++;
                    ctfPlayerProxy.player = null;
                }
                else
                {
                    ctfPlayerProxy.player = player;
                    ctfPlayerProxy.GamesLost++;
                    ctfPlayerProxy.player = null;
                }
            }
        }

        /// <summary>
        /// Updates the stats for flag carriers. Not that this is supposed to be
        /// executed once per second.
        /// </summary>
        private void UpdateFlagCarryStats(int nowMs)
        {
            if (nowMs - lastStatsWriteMs < 1000) {
                return;
            }

            lastStatsWriteMs = nowMs;

            var dict = new Dictionary<Player, int>();

            foreach (Arena.FlagState fs in arena._flags.Values)
            {
                if (fs.carrier != null)
                {
                    if (!dict.ContainsKey(fs.carrier))
                    {
                        dict.Add(fs.carrier, 0);
                    }

                    dict[fs.carrier]++;
                }
            }

            foreach(var d in dict)
            {
                ctfPlayerProxy.player = d.Key;
                ctfPlayerProxy.CarryTimeSeconds++; // 1 second.
                ctfPlayerProxy.CarryTimeSecondsPlus += d.Value; // 1 second * number of flags.
                ctfPlayerProxy.player = null;
            }
        }

        private void UpdateCTFTickers()
        {
            List<Player> rankedPlayers = arena.Players.ToList().OrderBy(player => (player.StatsCurrentGame == null ? 0 : player.StatsCurrentGame.deaths)).OrderByDescending(
                player => (player.StatsCurrentGame == null ? 0 : player.StatsCurrentGame.kills)).ToList();
            int idx = 3;
            string format = "";
            foreach (Player p in rankedPlayers)
            {
                if (p.StatsCurrentGame == null)
                { continue; }
                if (idx-- == 0)
                {
                    break;
                }

                switch (idx)
                {
                    case 2:
                        format = string.Format("!1st: {0}(K={1} D={2}) ", p._alias, p.StatsCurrentGame.kills, p.StatsCurrentGame.deaths);
                        break;
                    case 1:
                        format = (format + string.Format("!2nd: {0}(K={1} D={2})", p._alias, p.StatsCurrentGame.kills, p.StatsCurrentGame.deaths));
                        break;
                }
            }
            if (!string.IsNullOrWhiteSpace(format))
            { arena.setTicker(1, 2, 0, format); }

            arena.setTicker(2, 3, 0, delegate (Player p)
            {
                if (p.StatsCurrentGame == null)
                {
                    return "Personal Score: Kills=0 - Deaths=0";
                }
                return string.Format("Personal Score: Kills={0} - Deaths={1}", p.StatsCurrentGame.kills, p.StatsCurrentGame.deaths);
            });
        }

        /// <summary>
        /// Updates our players kill streak timer
        /// </summary>
        private void UpdateKillStreaks()
        {
            foreach (KeyValuePair<string, PlayerStreak> p in killStreaks)
            {
                if (p.Value.lastUsedWepTick == -1)
                    continue;

                if (Environment.TickCount - p.Value.lastUsedWepTick <= 0)
                    ResetWeaponTicker(p.Key);
            }
        }

        /// <summary>
        /// Updates the last killer
        /// </summary>
        private void ResetKiller(Player killer)
        {
            lastKiller = killer;
        }

        /// <summary>
        /// Resets the weapon ticker to default (Time Expired)
        /// </summary>
        private void ResetWeaponTicker(string targetAlias)
        {
            if (killStreaks.ContainsKey(targetAlias))
            {
                killStreaks[targetAlias].lastUsedWeap = null;
                killStreaks[targetAlias].lastUsedWepKillCount = 0;
                killStreaks[targetAlias].lastUsedWepTick = -1;
            }
        }

        /// <summary>
        /// Updates the killer and their kill counter
        /// </summary>
        private void UpdateKiller(Player killer)
        {
            if (killStreaks.ContainsKey(killer._alias))
            {
                killStreaks[killer._alias].lastKillerCount++;
                switch (killStreaks[killer._alias].lastKillerCount)
                {
                    case 6:
                        arena.sendArenaMessage(string.Format("{0} is on fire!", killer._alias), 8);
                        break;
                    case 8:
                        arena.sendArenaMessage(string.Format("Someone kill {0}!", killer._alias), 9);
                        break;
                }
            }
            //Is this first blood?
            if (lastKiller == null)
            {
                //It is, lets make the sound
                arena.sendArenaMessage(string.Format("{0} has drawn first blood.", killer._alias), 7);
            }
            lastKiller = killer;
        }

        /// <summary>
        /// Updates the victim's kill streak and notifies the public
        /// </summary>
        private void UpdateDeath(Player victim, Player killer)
        {
            if (killStreaks.ContainsKey(victim._alias))
            {
                if (killStreaks[victim._alias].lastKillerCount >= 6)
                {
                    arena.sendArenaMessage(string.Format("{0}", killer != null ? killer._alias + " has ended " + victim._alias + "'s kill streak." :
                        victim._alias + "'s kill streak has ended."), 6);
                }
                killStreaks[victim._alias].lastKillerCount = 0;
            }
        }

        /// <summary>
        /// Updates the last fired weapon and its ticker
        /// </summary>
        private void UpdateWeapon(Player from, ItemInfo.Projectile usedWep, int aliveTime)
        {
            if (killStreaks.ContainsKey(from._alias))
            {
                killStreaks[from._alias].lastUsedWeap = usedWep;
                killStreaks[from._alias].lastUsedWepTick = DateTime.Now.AddTicks(aliveTime).Ticks;
            }
        }

        /// <summary>
        /// Updates the last weapon used and kill count then announcing it to the public
        /// </summary>
        private void UpdateWeaponKill(Player from)
        {
            if (killStreaks.ContainsKey(from._alias))
            {
                if (killStreaks[from._alias].lastUsedWeap == null)
                    return;

                killStreaks[from._alias].lastUsedWepKillCount++;
                ItemInfo.Projectile lastUsedWep = killStreaks[from._alias].lastUsedWeap;
                switch (killStreaks[from._alias].lastUsedWepKillCount)
                {
                    case 2:
                        arena.sendArenaMessage(string.Format("{0} just got a double {1} kill.", from._alias, lastUsedWep.name), 17);
                        break;
                    case 3:
                        arena.sendArenaMessage(string.Format("{0} just got a triple {1} kill!", from._alias, lastUsedWep.name), 18);
                        break;
                    case 4:
                        arena.sendArenaMessage(string.Format("A 4 {0} kill by {0}?!?", lastUsedWep.name, from._alias), 19);
                        break;
                    case 5:
                        arena.sendArenaMessage(string.Format("Unbelievable! {0} with the 5 {1} kill?", from._alias, lastUsedWep.name), 20);
                        break;
                }
            }
        }
        #endregion

        /*
        #region CTFBot Spawning for TDM Events
        
        /// <summary>
        /// Handle bot spawning for TDM events
        /// </summary>
        private void HandleTDMBotSpawning(int now)
        {
            // Check spawn cooldown
            if (now - _tickLastBotSpawn < BOT_SPAWN_MIN_INTERVAL)
                return;

            // Check if TDM is active
            if (currentEventType != EventType.TDM || _tdmInstance == null || !_tdmInstance.IsGameActive)
                return;

            // Get all available teams (using public interface)
            var allTeams = new List<Team>();
            
            // Try common team names first
            var possibleTeamNames = new string[] { 
                "Collective Military", "Titan Militia", 
                "Collective Offense", "Titan Offense",
                "Collective", "Titan", 
                "Team A", "Team B",
                "Red Team", "Blue Team"
            };
            
            foreach (string teamName in possibleTeamNames)
            {
                var team = arena.getTeamByName(teamName);
                if (team != null && !allTeams.Contains(team))
                {
                    allTeams.Add(team);
                }
            }
            
            // If no teams found using common names, try spec team workaround
            if (allTeams.Count == 0)
            {
                // Look for any active players and get their teams
                foreach (Player p in arena.PlayersIngame)
                {
                    if (p._team != null && !allTeams.Contains(p._team))
                    {
                        allTeams.Add(p._team);
                    }
                }
            }
            
            if (allTeams.Count == 0)
            {
                Console.WriteLine("[CTF TDM BOT ERROR] No teams found in arena");
                return;
            }

            // Count bots per team
            var teamBotCounts = new Dictionary<Team, int>();
            foreach (var team in allTeams)
            {
                teamBotCounts[team] = _ctfBots.Count(bot => !bot.IsDead && bot._team == team);
            }

            // Find team with fewest bots (or any team if all are below max)
            Team targetTeam = null;
            int minBotCount = int.MaxValue;
            string reason = "";
            
            foreach (var team in allTeams)
            {
                int botCount = teamBotCounts[team];
                if (botCount < MAX_BOTS_PER_TEAM && botCount < minBotCount)
                {
                    targetTeam = team;
                    minBotCount = botCount;
                    reason = String.Format("Team {0} has fewest bots ({1})", team._name, botCount);
                }
            }

            // If no team found or only one team exists, just pick the first available team that's not at max
            if (targetTeam == null && allTeams.Count > 0)
            {
                // Check if all teams are at max capacity
                bool allTeamsAtMax = allTeams.All(team => teamBotCounts[team] >= MAX_BOTS_PER_TEAM);
                if (allTeamsAtMax)
                {
                    return;
                }
                
                // Pick first team that's not at max (spawn bots even on teams with no players)
                targetTeam = allTeams.FirstOrDefault(team => teamBotCounts[team] < MAX_BOTS_PER_TEAM);
                if (targetTeam != null)
                {
                    reason = String.Format("Picked first available team {0} (has {1} bots)", targetTeam._name, teamBotCounts[targetTeam]);
                }
            }

            if (targetTeam != null)
            {
                SpawnCTFBotForTDMTeam(targetTeam);
                _tickLastBotSpawn = now;
                
                var botCountsStr = String.Join(", ", teamBotCounts.Select(kvp => 
                    String.Format("{0}={1}", kvp.Key._name, kvp.Value + (kvp.Key == targetTeam ? 1 : 0))));
                
            }
        }

        /// <summary>
        /// Spawn a CTFBot for the specified team in TDM
        /// </summary>
        // Wrapper function for backward compatibility
        private void SpawnCTFBotForTeam(Team targetTeam)
        {
            SpawnCTFBotForTDMTeam(targetTeam);
        }
        
        private void SpawnCTFBotForTDMTeam(Team targetTeam)
        {
            if (targetTeam == null)
                return;

            try
            {
                // Determine vehicle type based on team (alternate between 301 and 129)
                int vehicleId;
                int existingBots = _ctfBots.Count(bot => !bot.IsDead && bot._team == targetTeam);
                if (existingBots % 2 == 0)
                    vehicleId = 301; // Even bots use vehicle 301
                else
                    vehicleId = 129; // Odd bots use vehicle 129

                VehInfo.Car botVehicle = AssetManager.Manager.getVehicleByID(vehicleId) as VehInfo.Car;
                if (botVehicle == null)
                {
                    Console.WriteLine("[CTF TDM BOT ERROR] Could not find vehicle ID " + vehicleId);
                    return;
                }

                // Create bot spawn state with team-specific coordinates
                InfServer.Protocol.Helpers.ObjectState botState = new InfServer.Protocol.Helpers.ObjectState();
                
                // Use flexible team-based spawn logic
                if (targetTeam._name.Contains("Collective") || targetTeam._name.Contains("Military"))
                {
                    // Collective-style spawn coordinates with randomization (±2 tiles)
                    int randomX = arena._rand.Next(-2, 3) * 16; // ±2 tiles in pixels
                    int randomY = arena._rand.Next(-2, 3) * 16; // ±2 tiles in pixels
                    botState.positionX = (short)(COLLECTIVE_SPAWN_X + randomX);
                    botState.positionY = (short)(COLLECTIVE_SPAWN_Y + randomY);
                    botState.yaw = COLLECTIVE_SPAWN_YAW; // REVERTED: Fixed spawn direction (good)

                }
                else if (targetTeam._name.Contains("Titan") || targetTeam._name.Contains("Militia"))
                {
                    // Titan-style spawn coordinates with randomization (±2 tiles)
                    int randomX = arena._rand.Next(-2, 3) * 16; // ±2 tiles in pixels
                    int randomY = arena._rand.Next(-2, 3) * 16; // ±2 tiles in pixels
                    botState.positionX = (short)(TITAN_SPAWN_X + randomX);
                    botState.positionY = (short)(TITAN_SPAWN_Y + randomY);
                    botState.yaw = TITAN_SPAWN_YAW; // REVERTED: Fixed spawn direction (good)

                }
                else
                {
                    // Generic spawn logic for unknown team names
                    // Alternate between the two spawn locations based on team ID
                    bool useCollectiveSpawn = (targetTeam._id % 2) == 0;
                    
                    int randomX = arena._rand.Next(-2, 3) * 16; // ±2 tiles in pixels
                    int randomY = arena._rand.Next(-2, 3) * 16; // ±2 tiles in pixels
                    
                    if (useCollectiveSpawn)
                    {
                        botState.positionX = (short)(COLLECTIVE_SPAWN_X + randomX);
                        botState.positionY = (short)(COLLECTIVE_SPAWN_Y + randomY);
                        botState.yaw = COLLECTIVE_SPAWN_YAW; // REVERTED: Fixed spawn direction
                    }
                    else
                    {
                        botState.positionX = (short)(TITAN_SPAWN_X + randomX);
                        botState.positionY = (short)(TITAN_SPAWN_Y + randomY);
                        botState.yaw = TITAN_SPAWN_YAW; // REVERTED: Fixed spawn direction
                    }

                }

                // Set bot health and energy
                botState.health = (short)botVehicle.Hitpoints;
                botState.energy = 600; // Default energy

                // Create a simple bot instead of using the CTFBot script directly
                // The CTFBot script will be applied through the vehicle's script settings
                
                Bot newBot = arena.newBot(typeof(InfServer.Script.CTFBot.CTFBot), botVehicle, targetTeam, null, botState, this) as Bot;
                
                if (newBot != null)
                {
                    // FIXED: CTFBot now handles weapon equipping from inventory in constructor
                    // No need to override with hardcoded weapons

                    // Add to our bot list
                    _ctfBots.Add(newBot);

                    // Console.WriteLine(String.Format("[CTF BOT SPAWN] Enhanced CTFBot spawned for {0}", targetTeam._name));
                }
                else
                {
                    Console.WriteLine("[CTF TDM BOT ERROR] Failed to create bot - newBot is null. Check vehicle configuration.");
                    Console.WriteLine(String.Format("[CTF TDM BOT ERROR] Vehicle details - ID: {0}, Name: {1}", 
                        vehicleId, botVehicle.Name));
                }
            }
            catch (Exception e)
            {
                Console.WriteLine("[CTF TDM BOT ERROR] Exception spawning bot: " + e.ToString());
            }
        }

        /// <summary>
        /// Get a suitable vehicle type for CTF bots
        /// </summary>
        private VehInfo.Car GetCTFBotVehicleType()
        {
            // Try vehicle 301 first
            VehInfo.Car vehicle = AssetManager.Manager.getVehicleByID(301) as VehInfo.Car;
            if (vehicle != null)
                return vehicle;
                
            // Fallback to vehicle 129
            vehicle = AssetManager.Manager.getVehicleByID(129) as VehInfo.Car;
            if (vehicle != null)
                return vehicle;
                
            // Last resort - try any basic infantry vehicle
            vehicle = AssetManager.Manager.getVehicleByID(100) as VehInfo.Car;
            if (vehicle != null)
                return vehicle;
                
            Console.WriteLine("[CTF TDM BOT ERROR] No suitable vehicle types found (301, 129, or 100)");
            return null;
        }

        /// <summary>
        /// Manage existing bots and remove dead ones
        /// </summary>
        private void ManageTDMBots(int now)
        {
            if (currentEventType != EventType.TDM || _tdmInstance == null)
            {
                // Clear all bots if TDM is not active
                foreach (var bot in _ctfBots.ToList())
                {
                    if (!bot.IsDead)
                        bot.destroy(false);
                }
                _ctfBots.Clear();
                return;
            }

            // Remove dead bots from our list
            var deadBots = _ctfBots.Where(bot => bot.IsDead).ToList();
            foreach (var deadBot in deadBots)
            {
                _ctfBots.Remove(deadBot);
            }
        }

        /// <summary>
        /// Equip bot with default weapon
        /// </summary>
        private void EquipBotWithDefaultWeapon(Bot bot)
        {
            try
            {
                // Try to equip Maklov AR mk 606 (assault rifle)
                ItemInfo ar = AssetManager.Manager.getItemByID(1096);
                if (ar != null)
                {
                    bot._weapon.equip(ar);
                    return;
                }

                // Fallback to any available weapon from bot's inventory
                if (bot._type.InventoryItems.Count() > 0)
                {
                    ItemInfo fallbackWeapon = AssetManager.Manager.getItemByID(bot._type.InventoryItems[0]);
                    if (fallbackWeapon != null)
                    {
                        bot._weapon.equip(fallbackWeapon);
                        return;
                    }
                }

                Console.WriteLine("[CTF TDM BOT ERROR] No suitable weapon found for bot");
            }
            catch (Exception e)
            {
                Console.WriteLine("[CTF TDM BOT ERROR] Failed to equip bot with default weapons: " + e.Message);
            }
        }

        /// <summary>
        /// Handle CTF bot spawning for regular CTF mode (adapted from TheArena)
        /// </summary>
        private void HandleCTFBotSpawning(int now)
        {
            // Don't spawn too frequently
            if (now - _tickLastBotSpawn < BOT_SPAWN_MIN_INTERVAL)
                return;

            // Only spawn if game is active
            if (gameState != GameState.ActiveGame)
                return;

            // Get human players for reference
            var humanPlayers = arena.PlayersIngame.Where(p => !(p._baseVehicle is Bot)).ToList();
            if (humanPlayers.Count == 0)
                return;

            // Check if we need more bots
            int currentBots = _ctfBots.Count(b => !b.IsDead);
            int maxBots = humanPlayers.Count * MAX_BOTS_PER_TEAM;

            if (currentBots >= maxBots)
                return;

            // Get teams that need bots
            var allTeams = new List<Team>();
            
            // Find active teams from players
            foreach (Player p in arena.PlayersIngame)
            {
                if (p._team != null && !allTeams.Contains(p._team))
                {
                    allTeams.Add(p._team);
                }
            }
            
            if (allTeams.Count == 0)
                return;

            // Count bots per team
            var teamBotCounts = new Dictionary<Team, int>();
            foreach (var team in allTeams)
            {
                teamBotCounts[team] = _ctfBots.Count(bot => !bot.IsDead && bot._team == team);
            }

            // Find team with fewest bots
            Team targetTeam = allTeams
                .Where(team => teamBotCounts[team] < MAX_BOTS_PER_TEAM)
                .OrderBy(team => teamBotCounts[team])
                .FirstOrDefault();

                         if (targetTeam != null)
             {
                 SpawnCTFBotForTDMTeam(targetTeam);
                 _tickLastBotSpawn = now;
             }
        }

        /// <summary>
        /// Manage existing CTF bots (adapted from TheArena)
        /// </summary>
        private void ManageCTFBots(int now)
        {
            // Always allow bots in regular CTF mode - don't destroy them like TDM does
            
            // Remove dead bots from our list
            var deadBots = _ctfBots.Where(bot => bot.IsDead).ToList();
            foreach (var deadBot in deadBots)
            {
                _ctfBots.Remove(deadBot);
            }
            
            // Optional: Log bot status occasionally
            if (now % 30000 == 0 && _ctfBots.Count > 0) // Every 30 seconds
            {
                int aliveBots = _ctfBots.Count(b => !b.IsDead);
                Console.WriteLine(String.Format("[CTF BOT] {0} active bots in CTF mode", aliveBots));
            }
        }

        #endregion
        */

        private void HealAll()
        {
            foreach (Player p in arena.PlayersIngame)
            {
                p.inventoryModify(104, 1);
            }
            
            arena.sendArenaMessage("&All players have been healed");
        }

        private enum GameState
        {
            Init,
            PreGame,
            ActiveGame,
            PostGame,
            NotEnoughPlayers,
            Transitioning,
        }

        private enum CTFMode
        {
            None,
            Aborted,
            TenSeconds,
            ThirtySeconds,
            SixtySeconds,
            XSeconds,
            GameDone,
        }
        
        /// <summary>
        /// Calculate overall accuracy for a player based on weapon stats
        /// </summary>
        public double CalculatePlayerAccuracy(Player player)
        {
            try
            {
                if (_playerWeaponStats == null || !_playerWeaponStats.ContainsKey(player))
                    return 0.0;

                int totalShots = 0;
                int totalHits = 0;

                foreach (var weaponStat in _playerWeaponStats[player])
                {
                    totalShots += weaponStat.Value.ShotsFired;
                    totalHits += weaponStat.Value.ShotsLanded;
                }

                return totalShots > 0 ? (double)totalHits / totalShots : 0.0;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error calculating player accuracy: " + ex.Message);
                return 0.0;
            }
        }

        /// <summary>
        /// Get average resources left per death for a player
        /// </summary>
        public double GetPlayerResourceUnusedPerDeath(string playerAlias)
        {
            try
            {
                if (_averageItemsUsedPerDeath == null || !_averageItemsUsedPerDeath.ContainsKey(playerAlias))
                    return 0.0;

                var stats = _averageItemsUsedPerDeath[playerAlias];
                return stats["RepCoil"] + stats["RepCharge"] + stats["Energizer"] + stats["Stim"];
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error getting resource unused per death: " + ex.Message);
                return 0.0;
            }
        }

        /// <summary>
        /// Get average explosives left per death for a player
        /// </summary>
        public double GetPlayerExplosiveUnusedPerDeath(string playerAlias)
        {
            try
            {
                if (_averageItemsUsedPerDeath == null || !_averageItemsUsedPerDeath.ContainsKey(playerAlias))
                    return 0.0;

                var stats = _averageItemsUsedPerDeath[playerAlias];
                return stats["Frag"] + stats["WP"];
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error getting explosive unused per death: " + ex.Message);
                return 0.0;
            }
        }

        /// <summary>
        /// Add robust game validation to prevent exporting restart/reset games
        /// </summary>
        public bool IsValidGameForStatsExport(List<Player> players)
        {
            try
            {
                if (players == null || players.Count == 0)
                    return false;

                // Filter 1: Must have minimum viable game (4+ players)
                if (players.Count < 4)
                    return false;

                // Filter 2: Check for restart/reset scenarios
                // If more than 50% of players have 0 kills AND 0 deaths, it's likely a restart
                int playersWithNoStats = 0;
                foreach (Player player in players)
                {
                    if (player.StatsLastGame.kills == 0 && player.StatsLastGame.deaths == 0)
                    {
                        playersWithNoStats++;
                    }
                }

                double percentageWithNoStats = (double)playersWithNoStats / players.Count;
                if (percentageWithNoStats > 0.5) // More than 50% have no stats
                {
                    Console.WriteLine(String.Format("[STATS] Rejecting game export - {0}% of players have 0 kills/deaths (likely restart)", 
                        (percentageWithNoStats * 100).ToString("F1")));
                    return false;
                }

                // Filter 3: Game must be long enough (at least 2 minutes)
                double gameLength = (double)(Environment.TickCount - arena._tickGameStarted) / 60000.0; // Convert to minutes
                if (gameLength < 2.0)
                {
                    Console.WriteLine(String.Format("[STATS] Rejecting game export - game too short ({0:F1} minutes)", gameLength));
                    return false;
                }

                Console.WriteLine(String.Format("[STATS] Game validation passed - {0} players, {1:F1} minutes, {2}% with stats", 
                    players.Count, gameLength, ((1.0 - percentageWithNoStats) * 100).ToString("F1")));
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error validating game for stats export: " + ex.Message);
                return false; // Err on the side of caution
            }
        }

        /// <summary>
        /// Dedicated class for managing CTF game statistics, player tracking, and win conditions
        /// </summary>
        public class GameStats
{
    private Arena arena;
    private Script_CTF ctfInstance;
    
    // Player tracking dictionaries
    private Dictionary<Player, Dictionary<string, int>> playerClassPlayTimes;
    private Dictionary<Player, int> playerLastClassSwitch;
    private Dictionary<Player, int> playerClassSwaps;
    private Dictionary<ushort, int> playerDamageStats;
    private Dictionary<Player, WeaponStats> lastGameWeaponStats;
    private Dictionary<string, Dictionary<string, double>> averageItemsUsedPerDeath;
    private Dictionary<Player, int> ebHitStats;
    
    // Cached player data for those who left early
    private Dictionary<string, CachedPlayerData> cachedPlayerStats;
    
    // Polling timer for stats updates
    private Timer statsPollingTimer;
    private readonly int POLLING_INTERVAL_MS = 60000; // 1 minute
    
    // Base coordinate definitions
    private readonly Dictionary<string, BaseCoordinates> baseCoordinates = new Dictionary<string, BaseCoordinates>();
    
    // Exit portal IDs that allow defense to escape
    private readonly HashSet<int> allowedExitPortals;
    
    public GameStats(Arena arena, Script_CTF ctfInstance)
    {
        this.arena = arena;
        this.ctfInstance = ctfInstance;
        
        // Initialize base coordinates
        baseCoordinates.Add("A7", new BaseCoordinates { MinX = 3 * 16, MaxX = 73 * 16, MinY = 432 * 16, MaxY = 514 * 16 });
        baseCoordinates.Add("D7", new BaseCoordinates { MinX = 255 * 16, MaxX = 328 * 16, MinY = 435 * 16, MaxY = 505 * 16 });
        baseCoordinates.Add("F6", new BaseCoordinates { MinX = 375 * 16, MaxX = 481 * 16, MinY = 435 * 16, MaxY = 509 * 16 });
        baseCoordinates.Add("F4", new BaseCoordinates { MinX = 367 * 16, MaxX = 435 * 16, MinY = 224 * 16, MaxY = 306 * 16 });
        baseCoordinates.Add("A5", new BaseCoordinates { MinX = 4 * 16, MaxX = 79 * 16, MinY = 305 * 16, MaxY = 377 * 16 });
        baseCoordinates.Add("B6", new BaseCoordinates { MinX = 128 * 16, MaxX = 203 * 16, MinY = 432 * 16, MaxY = 515 * 16 });
        baseCoordinates.Add("B8", new BaseCoordinates { MinX = 128 * 16, MaxX = 209 * 16, MinY = 554 * 16, MaxY = 628 * 16 });
        
        // Initialize allowed exit portals
        allowedExitPortals = new HashSet<int>();
        allowedExitPortals.Add(1001);
        allowedExitPortals.Add(1002);
        allowedExitPortals.Add(1003);
        
        InitializeDataStructures();
        StartStatsPolling();
    }
    
    private void InitializeDataStructures()
    {
        playerClassPlayTimes = new Dictionary<Player, Dictionary<string, int>>();
        playerLastClassSwitch = new Dictionary<Player, int>();
        playerClassSwaps = new Dictionary<Player, int>();
        playerDamageStats = new Dictionary<ushort, int>();
        lastGameWeaponStats = new Dictionary<Player, WeaponStats>();
        averageItemsUsedPerDeath = new Dictionary<string, Dictionary<string, double>>();
        ebHitStats = new Dictionary<Player, int>();
        cachedPlayerStats = new Dictionary<string, CachedPlayerData>();
    }
    
    /// <summary>
    /// Start the periodic stats polling timer
    /// </summary>
    private void StartStatsPolling()
    {
        statsPollingTimer = new Timer(PollPlayerStats, null, POLLING_INTERVAL_MS, POLLING_INTERVAL_MS);
    }
    
    /// <summary>
    /// Stop the stats polling timer
    /// </summary>
    public void StopStatsPolling()
    {
        if (statsPollingTimer != null)
        {
            statsPollingTimer.Dispose();
            statsPollingTimer = null;
        }
    }
    
    /// <summary>
    /// Periodic callback to update player stats and check win conditions
    /// </summary>
    private void PollPlayerStats(object state)
    {
        try
        {
            // Update all active players' class play times
            UpdateAllPlayerClassTimes();
            
            // Cache stats for all current players in case they leave
            CacheCurrentPlayerStats();
            
            // Check for offense win condition (base clearing)
            CheckOffenseBaseWinCondition();
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error in stats polling: {0}", ex.Message));
        }
    }
    
    /// <summary>
    /// Update class play times for all active players
    /// </summary>
    private void UpdateAllPlayerClassTimes()
    {
        int currentTick = Environment.TickCount;
        
        foreach (Player player in arena.Players.ToList())
        {
            if (player._team.IsSpec || (player._baseVehicle != null && player._baseVehicle._type.Name.Contains("Spectator")))
                continue;
                
            UpdateSkillPlayTime(player, currentTick);
        }
    }
    
    /// <summary>
    /// Cache current stats for all players to prevent loss if they leave
    /// </summary>
    private void CacheCurrentPlayerStats()
    {
        foreach (Player player in arena.Players.ToList())
        {
            if (player._team.IsSpec || (player._baseVehicle != null && player._baseVehicle._type.Name.Contains("Spectator")))
                continue;
                
            string alias = player._alias.ToLower();
            
            // Get current most played class with fresh calculation
            string mostPlayedClass = GetMostPlayedClass(player);
            
            cachedPlayerStats[alias] = new CachedPlayerData
            {
                Alias = player._alias,
                Team = player._team._name,
                MostPlayedClass = mostPlayedClass,
                ClassPlayTimes = playerClassPlayTimes.ContainsKey(player) ? 
                    new Dictionary<string, int>(playerClassPlayTimes[player]) : new Dictionary<string, int>(),
                ClassSwaps = playerClassSwaps.ContainsKey(player) ? playerClassSwaps[player] : 0,
                LastSeen = DateTime.Now,
                StatsSnapshot = player.StatsLastGame != null ? new PlayerStatsSnapshot
                {
                    Kills = player.StatsLastGame.kills,
                    Deaths = player.StatsLastGame.deaths,
                    Captures = player.StatsLastGame.zonestat5,
                    CarrierKills = player.StatsLastGame.zonestat7,
                    CarryTime = player.StatsLastGame.zonestat3
                } : null
            };
        }
    }
    
    /// <summary>
    /// Check if offense should win by clearing defenders from base
    /// </summary>
    private void CheckOffenseBaseWinCondition()
    {
        if (!ctfInstance.isOVD)
            return;
            
        // Check if game is active by using reflection to access private gameState
        try
        {
            var gameStateField = ctfInstance.GetType().GetField("gameState", 
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                
            if (gameStateField != null)
            {
                var gameStateValue = gameStateField.GetValue(ctfInstance);
                // Check if gameState is "ActiveGame" (value 2 in the enum)
                if (gameStateValue == null || !gameStateValue.ToString().Equals("ActiveGame"))
                    return;
            }
            else
            {
                return; // Can't access gameState, skip check
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error accessing gameState: {0}", ex.Message));
            return;
        }
            
        string currentBase = ctfInstance.baseUsed;
        if (currentBase == "Unknown" || !baseCoordinates.ContainsKey(currentBase))
            return;
            
        BaseCoordinates baseCoords = baseCoordinates[currentBase];
        
        // Find defenders (non-Squad Leader players) in the base
        var defendersInBase = arena.Players.Where(p => 
            !p._team.IsSpec && 
            GetPrimarySkillName(p) != "Squad Leader" &&
            GetPrimarySkillName(p) != "Dueler" &&
            IsPlayerInBaseArea(p, baseCoords)).ToList();
            
        // Find offense players (Squad Leaders or summoned players) in the base
        var offenseInBase = arena.Players.Where(p =>
            !p._team.IsSpec &&
            (GetPrimarySkillName(p) == "Squad Leader" || HasBeenSummoned(p)) &&
            IsPlayerInBaseArea(p, baseCoords)).ToList();
            
        // Check if offense should win: no defenders in base AND at least one offense player in base
        if (defendersInBase.Count == 0 && offenseInBase.Count > 0)
        {
            // Check if any defenders recently used allowed exit portals
            bool validDefenseEscape = CheckRecentPortalUsage();
            
            if (!validDefenseEscape)
            {
                // Offense wins by clearing the base
                ctfInstance.winningTeamOVD = "offense";
                var axidusPlayer = arena.Players.FirstOrDefault(p => p._alias == "Axidus");
                if (axidusPlayer != null)
                    axidusPlayer.sendMessage(-1, "&Offense wins by clearing all defenders from the base!");
                
                // // Set gameState to PostGame using reflection
                // try
                // {
                //     var gameStateField = ctfInstance.GetType().GetField("gameState", 
                //         System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                        
                //     if (gameStateField != null)
                //     {
                //         // Set to PostGame (value 3 in the enum)
                //         var postGameValue = Enum.ToObject(gameStateField.FieldType, 3);
                //         gameStateField.SetValue(ctfInstance, postGameValue);
                //     }
                // }
                // catch (Exception ex)
                // {
                //     Console.WriteLine(String.Format("Error setting gameState: {0}", ex.Message));
                // }
                
                // // Trigger end game logic
                // Task.Run(() => {
                //     try
                //     {
                //         var endGameMethod = ctfInstance.GetType().GetMethod("EndGame", 
                //             System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public);
                //         if (endGameMethod != null)
                //         {
                //             endGameMethod.Invoke(ctfInstance, null);
                //         }
                //     }
                //     catch (Exception ex)
                //     {
                //         Console.WriteLine(String.Format("Error calling EndGame: {0}", ex.Message));
                //     }
                // });
            }
        }
    }
    
    /// <summary>
    /// Check if a player is within the specified base area
    /// </summary>
    private bool IsPlayerInBaseArea(Player player, BaseCoordinates coords)
    {
        return player._state.positionX >= coords.MinX && 
               player._state.positionX <= coords.MaxX &&
               player._state.positionY >= coords.MinY && 
               player._state.positionY <= coords.MaxY;
    }
    
    /// <summary>
    /// Check if any defenders recently used allowed exit portals
    /// </summary>
    private bool CheckRecentPortalUsage()
    {
        // Implementation would track recent portal usage
        // For now, return false (no valid escape)
        // You can enhance this by tracking portal events
        return false;
    }
    
    /// <summary>
    /// Update skill play time for a specific player
    /// </summary>
    public void UpdateSkillPlayTime(Player player, int? customTick = null)
    {
        if (player._team.IsSpec || (player._baseVehicle != null && player._baseVehicle._type.Name.Contains("Spectator")))
            return;

        if (!playerClassPlayTimes.ContainsKey(player))
        {
            playerClassPlayTimes[player] = new Dictionary<string, int>();
            playerLastClassSwitch[player] = Environment.TickCount;
        }

        int currentTick = customTick ?? Environment.TickCount;
        string currentSkill = GetPrimarySkillName(player);

        if (currentSkill != null && currentSkill != "Unknown")
        {
            int startTime = playerLastClassSwitch[player];
            int sessionPlayTime = Math.Max(0, currentTick - startTime);

            if (!playerClassPlayTimes[player].ContainsKey(currentSkill))
            {
                playerClassPlayTimes[player][currentSkill] = 0;
            }
            playerClassPlayTimes[player][currentSkill] += sessionPlayTime;
        }

        playerLastClassSwitch[player] = currentTick;
    }
    
    /// <summary>
    /// Get the most played class for a player with real-time calculation
    /// </summary>
    public string GetMostPlayedClass(Player player)
    {
        try
        {
            if (!playerClassPlayTimes.ContainsKey(player))
            {
                return GetPrimarySkillName(player);
            }
            
            // Get current time and update current session
            int currentTick = Environment.TickCount;
            var playTimes = new Dictionary<string, int>(playerClassPlayTimes[player]);
            
            // Add current session time
            string currentSkill = GetPrimarySkillName(player);
            if (currentSkill != null && currentSkill != "Unknown" && playerLastClassSwitch.ContainsKey(player))
            {
                int sessionTime = Math.Max(0, currentTick - playerLastClassSwitch[player]);
                if (!playTimes.ContainsKey(currentSkill))
                    playTimes[currentSkill] = 0;
                playTimes[currentSkill] += sessionTime;
            }
            
            if (playTimes.Count > 0)
            {
                var mostPlayed = playTimes.OrderByDescending(x => x.Value).First();
                return mostPlayed.Key;
            }
            
            return GetPrimarySkillName(player);
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error getting most played class for {0}: {1}", player._alias, ex.Message));
            return GetPrimarySkillName(player);
        }
    }
    
    /// <summary>
    /// Get primary skill name for a player
    /// </summary>
    private string GetPrimarySkillName(Player player)
    {
        if (player._skills.Count > 0)
        {
            return player._skills.First().Value.skill.Name;
        }
        if (player._baseVehicle != null && player._baseVehicle._type != null)
            return player._baseVehicle._type.Name;
        return "Unknown";
    }
    
    /// <summary>
    /// Check if a player has been summoned (has summon count > 0)
    /// </summary>
    private bool HasBeenSummoned(Player player)
    {
        // Access summonedCounts through reflection or direct property access
        try
        {
            var summonedCountsField = ctfInstance.GetType().GetField("summonedCounts", 
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public);
                
            if (summonedCountsField != null)
            {
                var summonedCounts = summonedCountsField.GetValue(ctfInstance) as Dictionary<ushort, int>;
                return summonedCounts != null && summonedCounts.ContainsKey(player._id) && summonedCounts[player._id] > 0;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error accessing summonedCounts: {0}", ex.Message));
        }
        
        return false;
    }
    
    /// <summary>
    /// Handle player leaving to cache their stats
    /// </summary>
    public void OnPlayerLeave(Player player)
    {
        try
        {
            // Final update of class play time
            UpdateSkillPlayTime(player);
            
            // Cache the player's final stats
            string alias = player._alias.ToLower();
            string mostPlayedClass = GetMostPlayedClass(player);
            
            cachedPlayerStats[alias] = new CachedPlayerData
            {
                Alias = player._alias,
                Team = player._team._name,
                MostPlayedClass = mostPlayedClass,
                ClassPlayTimes = playerClassPlayTimes.ContainsKey(player) ? 
                    new Dictionary<string, int>(playerClassPlayTimes[player]) : new Dictionary<string, int>(),
                ClassSwaps = playerClassSwaps.ContainsKey(player) ? playerClassSwaps[player] : 0,
                LastSeen = DateTime.Now,
                StatsSnapshot = player.StatsLastGame != null ? new PlayerStatsSnapshot
                {
                    Kills = player.StatsLastGame.kills,
                    Deaths = player.StatsLastGame.deaths,
                    Captures = player.StatsLastGame.zonestat5,
                    CarrierKills = player.StatsLastGame.zonestat7,
                    CarryTime = player.StatsLastGame.zonestat3
                } : null
            };
            
            Console.WriteLine(String.Format("Cached stats for leaving player {0} - Most played: {1}", 
                player._alias, mostPlayedClass));
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error caching stats for leaving player {0}: {1}", 
                player._alias, ex.Message));
        }
    }
    
    /// <summary>
    /// Handle player class swap
    /// </summary>
    public void OnPlayerClassSwap(Player player)
    {
        try
        {
            UpdateSkillPlayTime(player);
            
            if (!playerClassSwaps.ContainsKey(player))
                playerClassSwaps[player] = 0;
                
            playerClassSwaps[player]++;
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error handling class swap for {0}: {1}", player._alias, ex.Message));
        }
    }
    
    /// <summary>
    /// Export comprehensive game stats to CSV
    /// </summary>
    public void ExportGameStats(string gameMode, string baseUsed, Team winningTeam, string winningTeamOVD)
    {
        try
        {
            string baseStatsDir = "playerStats";
            if (!Directory.Exists(baseStatsDir))
            {
                Directory.CreateDirectory(baseStatsDir);
            }
            
            string gameStatsPath = Path.Combine(baseStatsDir, 
                String.Format("game_stats_{0}_{1}.csv", DateTime.Now.ToString("MM_dd_yyyy_HH_mm_ss"), 
                arena._name.Replace(" ", "_")));
                
            using (StreamWriter writer = new StreamWriter(gameStatsPath))
            {
                writer.WriteLine("PlayerName,Team,Kills,Deaths,Captures,CarrierKills,CarryTimeSeconds,GameLengthMinutes,Result,MostPlayedClass,ClassSwaps,TurretDamage,GameMode,Side,BaseUsed,Accuracy,AvgResourceUnusedPerDeath,AvgExplosiveUnusedPerDeath,EBHits,LeftEarly");
                
                var playerStatsForWeb = new List<PlayerStatData>();
                double gameLengthMinutes = (arena._tickGameEnded - arena._tickGameStarted) / (1000.0 * 60.0);
                
                // Process current players
                foreach (Player p in arena.Players.ToList())
                {
                    if (ShouldIncludePlayerInStats(p))
                    {
                        WritePlayerStats(writer, p, gameMode, baseUsed, winningTeam, winningTeamOVD, gameLengthMinutes, false);
                    }
                }
                
                // Process cached players who left early
                foreach (var cachedEntry in cachedPlayerStats.Values)
                {
                    if (cachedEntry.StatsSnapshot != null && 
                        (cachedEntry.StatsSnapshot.Kills > 0 || cachedEntry.StatsSnapshot.Deaths > 0))
                    {
                        WritePlayerStatsFromCache(writer, cachedEntry, gameMode, baseUsed, winningTeam, winningTeamOVD, gameLengthMinutes);
                    }
                }
            }
            
            Console.WriteLine(String.Format("Exported game stats to: {0}", gameStatsPath));
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error exporting game stats: {0}", ex.Message));
        }
    }
    
    /// <summary>
    /// Check if a player should be included in stats
    /// </summary>
    private bool ShouldIncludePlayerInStats(Player player)
    {
        if (player == null || player.StatsLastGame == null || player._team == null)
            return false;
            
        if (!player._team._name.Contains(" T") && !player._team._name.Contains(" C"))
            return false;
            
        string mostPlayedClass = GetMostPlayedClass(player);
        return mostPlayedClass != "Dueler";
    }
    
    /// <summary>
    /// Write player stats to CSV
    /// </summary>
    private void WritePlayerStats(StreamWriter writer, Player player, string gameMode, string baseUsed, 
        Team winningTeam, string winningTeamOVD, double gameLengthMinutes, bool leftEarly)
    {
        try
        {
            string mostPlayedClass = GetMostPlayedClass(player);
            string result = DeterminePlayerResult(player, winningTeam, winningTeamOVD, gameMode);
            string side = DeterminePlayerSide(player, gameMode);
            int classSwaps = playerClassSwaps.ContainsKey(player) ? playerClassSwaps[player] : 0;
            int turretDamage = playerDamageStats.ContainsKey(player._id) ? playerDamageStats[player._id] : 0;
            int ebHits = ebHitStats.ContainsKey(player) ? ebHitStats[player] : 0;
            
            writer.WriteLine(String.Format("{0},{1},{2},{3},{4},{5},{6},{7:F2},{8},{9},{10},{11},{12},{13},{14},{15:F3},{16:F2},{17:F2},{18},{19}",
                player._alias.Replace(",", ""),
                player._team._name ?? "None",
                player.StatsLastGame.kills,
                player.StatsLastGame.deaths,
                player.StatsLastGame.zonestat5,
                player.StatsLastGame.zonestat7,
                player.StatsLastGame.zonestat3,
                gameLengthMinutes,
                result,
                mostPlayedClass,
                classSwaps,
                turretDamage,
                gameMode,
                side,
                baseUsed,
                0.0, // Accuracy - would need weapon stats integration
                0.0, // AvgResourcePerDeath - would need item usage integration
                0.0, // AvgExplosivePerDeath - would need item usage integration
                ebHits,
                leftEarly ? "Yes" : "No"));
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error writing stats for player {0}: {1}", player._alias, ex.Message));
        }
    }
    
    /// <summary>
    /// Write cached player stats to CSV
    /// </summary>
    private void WritePlayerStatsFromCache(StreamWriter writer, CachedPlayerData cachedData, string gameMode, 
        string baseUsed, Team winningTeam, string winningTeamOVD, double gameLengthMinutes)
    {
        try
        {
            string result = "Loss"; // Default for players who left early
            string side = "N/A";
            
            writer.WriteLine(String.Format("{0},{1},{2},{3},{4},{5},{6},{7:F2},{8},{9},{10},{11},{12},{13},{14},{15:F3},{16:F2},{17:F2},{18},{19}",
                cachedData.Alias.Replace(",", ""),
                cachedData.Team ?? "None",
                cachedData.StatsSnapshot.Kills,
                cachedData.StatsSnapshot.Deaths,
                cachedData.StatsSnapshot.Captures,
                cachedData.StatsSnapshot.CarrierKills,
                cachedData.StatsSnapshot.CarryTime,
                gameLengthMinutes,
                result,
                cachedData.MostPlayedClass,
                cachedData.ClassSwaps,
                0, // turretDamage
                gameMode,
                side,
                baseUsed,
                0.0, // Accuracy
                0.0, // AvgResourcePerDeath
                0.0, // AvgExplosivePerDeath
                0, // ebHits
                "Yes")); // leftEarly
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error writing cached stats for player {0}: {1}", cachedData.Alias, ex.Message));
        }
    }
    
    /// <summary>
    /// Determine player result (Win/Loss)
    /// </summary>
    private string DeterminePlayerResult(Player player, Team winningTeam, string winningTeamOVD, string gameMode)
    {
        if (gameMode == "OvD")
        {
            string side = DeterminePlayerSide(player, gameMode);
            return (side == "offense" && winningTeamOVD == "offense") || 
                   (side == "defense" && winningTeamOVD != "offense") ? "Win" : "Loss";
        }
        else
        {
            return (winningTeam != null && player._team == winningTeam) ? "Win" : "Loss";
        }
    }
    
    /// <summary>
    /// Determine player side (offense/defense)
    /// </summary>
    private string DeterminePlayerSide(Player player, string gameMode)
    {
        string skill = GetPrimarySkillName(player);
        
        if (gameMode == "OvD")
        {
            return (HasBeenSummoned(player) || skill == "Squad Leader") ? "offense" : "defense";
        }
        else if (gameMode == "Mix")
        {
            // Use team-based logic for Mix mode
            var teamSummonedCount = arena.Players
                .Where(p => p._team == player._team && HasBeenSummoned(p))
                .Count();
                
            return teamSummonedCount > 2 ? "offense" : "defense";
        }
        
        return "N/A";
    }
    
    /// <summary>
    /// Get player stats formatted for web integration
    /// </summary>
    public List<PlayerStatData> GetPlayerStatsForWebIntegration(string gameMode, string baseUsed, Team winningTeam, string winningTeamOVD)
    {
        var playerStatsForWeb = new List<PlayerStatData>();
        double gameLengthMinutes = (arena._tickGameEnded - arena._tickGameStarted) / (1000.0 * 60.0);
        
        try
        {
            // Process current players
            foreach (Player p in arena.Players.ToList())
            {
                if (ShouldIncludePlayerInStats(p))
                {
                    var playerData = CreatePlayerStatData(p, gameMode, baseUsed, winningTeam, winningTeamOVD, gameLengthMinutes, false);
                    if (playerData != null)
                        playerStatsForWeb.Add(playerData);
                }
            }
            
            // Process cached players who left early
            foreach (var cachedEntry in cachedPlayerStats.Values)
            {
                if (cachedEntry.StatsSnapshot != null && 
                    (cachedEntry.StatsSnapshot.Kills > 0 || cachedEntry.StatsSnapshot.Deaths > 0))
                {
                    var playerData = CreatePlayerStatDataFromCache(cachedEntry, gameMode, baseUsed, winningTeam, winningTeamOVD, gameLengthMinutes);
                    if (playerData != null)
                        playerStatsForWeb.Add(playerData);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error creating web integration data: {0}", ex.Message));
        }
        
        return playerStatsForWeb;
    }
    




    /// <summary>
    /// Create PlayerStatData from current player
    /// </summary>
    private PlayerStatData CreatePlayerStatData(Player player, string gameMode, string baseUsed, Team winningTeam, string winningTeamOVD, double gameLengthMinutes, bool leftEarly)
    {
        try
        {
            string mostPlayedClass = GetMostPlayedClass(player);
            string result = DeterminePlayerResult(player, winningTeam, winningTeamOVD, gameMode);
            string side = DeterminePlayerSide(player, gameMode);
            int classSwaps = playerClassSwaps.ContainsKey(player) ? playerClassSwaps[player] : 0;
            int turretDamage = playerDamageStats.ContainsKey(player._id) ? playerDamageStats[player._id] : 0;
            int ebHits = ebHitStats.ContainsKey(player) ? ebHitStats[player] : 0;
            
            return new PlayerStatData
            {
                PlayerName = player._alias.Replace(",", ""),
                Team = player._team._name ?? "None",
                GameMode = gameMode,
                ArenaName = arena._name,
                BaseUsed = baseUsed,
                Side = side,
                Result = result,
                MainClass = mostPlayedClass,
                Kills = player.StatsLastGame.kills,
                Deaths = player.StatsLastGame.deaths,
                Captures = player.StatsLastGame.zonestat5,
                CarrierKills = player.StatsLastGame.zonestat7,
                CarryTimeSeconds = player.StatsLastGame.zonestat3,
                ClassSwaps = classSwaps,
                TurretDamage = turretDamage,
                EBHits = ebHits,
                Accuracy = ctfInstance.CalculatePlayerAccuracy(player),
                AvgResourceUnusedPerDeath = ctfInstance.GetPlayerResourceUnusedPerDeath(player._alias),
                AvgExplosiveUnusedPerDeath = ctfInstance.GetPlayerExplosiveUnusedPerDeath(player._alias),
                GameLengthMinutes = gameLengthMinutes
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error creating PlayerStatData for {0}: {1}", player._alias, ex.Message));
            return null;
        }
    }
    
    /// <summary>
    /// Create PlayerStatData from cached data
    /// </summary>
    private PlayerStatData CreatePlayerStatDataFromCache(CachedPlayerData cachedData, string gameMode, string baseUsed, Team winningTeam, string winningTeamOVD, double gameLengthMinutes)
    {
        try
        {
            return new PlayerStatData
            {
                PlayerName = cachedData.Alias.Replace(",", ""),
                Team = cachedData.Team ?? "None",
                GameMode = gameMode,
                ArenaName = arena._name,
                BaseUsed = baseUsed,
                Side = "N/A", // Default for players who left early
                Result = "Loss", // Default for players who left early
                MainClass = cachedData.MostPlayedClass,
                Kills = cachedData.StatsSnapshot.Kills,
                Deaths = cachedData.StatsSnapshot.Deaths,
                Captures = cachedData.StatsSnapshot.Captures,
                CarrierKills = cachedData.StatsSnapshot.CarrierKills,
                CarryTimeSeconds = cachedData.StatsSnapshot.CarryTime,
                ClassSwaps = cachedData.ClassSwaps,
                TurretDamage = 0,
                EBHits = 0,
                Accuracy = 0.0,
                AvgResourceUnusedPerDeath = 0.0,
                AvgExplosiveUnusedPerDeath = 0.0,
                GameLengthMinutes = gameLengthMinutes
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine(String.Format("Error creating PlayerStatData from cache for {0}: {1}", cachedData.Alias, ex.Message));
            return null;
        }
    }
    
    /// <summary>
    /// Clean up resources
    /// </summary>
    public void Dispose()
    {
        StopStatsPolling();
        
        // Clear all data structures
        if (playerClassPlayTimes != null)
            playerClassPlayTimes.Clear();
        if (playerLastClassSwitch != null)
            playerLastClassSwitch.Clear();
        if (playerClassSwaps != null)
            playerClassSwaps.Clear();
        if (playerDamageStats != null)
            playerDamageStats.Clear();
        if (lastGameWeaponStats != null)
            lastGameWeaponStats.Clear();
        if (averageItemsUsedPerDeath != null)
            averageItemsUsedPerDeath.Clear();
        if (ebHitStats != null)
            ebHitStats.Clear();
        if (cachedPlayerStats != null)
            cachedPlayerStats.Clear();
    }
    
    // Expose data for CTF instance access
    public Dictionary<Player, Dictionary<string, int>> PlayerClassPlayTimes 
    { 
        get { return playerClassPlayTimes; } 
    }
    
    public Dictionary<Player, int> PlayerLastClassSwitch 
    { 
        get { return playerLastClassSwitch; } 
    }
    
    public Dictionary<Player, int> PlayerClassSwaps 
    { 
        get { return playerClassSwaps; } 
    }
    
    public Dictionary<ushort, int> PlayerDamageStats 
    { 
        get { return playerDamageStats; } 
    }
    
    public Dictionary<Player, int> EBHitStats 
    { 
        get { return ebHitStats; } 
    }
    
    public Dictionary<string, CachedPlayerData> CachedPlayerStats 
    { 
        get { return cachedPlayerStats; } 
    }
        }
        
        /// <summary>
        /// Base coordinates structure
        /// </summary>
        public class BaseCoordinates
        {
            public int MinX { get; set; }
            public int MaxX { get; set; }
            public int MinY { get; set; }
            public int MaxY { get; set; }
        }

        /// <summary>
        /// Cached player data for players who left early
        /// </summary>
        public class CachedPlayerData
        {
            public string Alias { get; set; }
            public string Team { get; set; }
            public string MostPlayedClass { get; set; }
            public Dictionary<string, int> ClassPlayTimes { get; set; }
            public int ClassSwaps { get; set; }
            public DateTime LastSeen { get; set; }
            public PlayerStatsSnapshot StatsSnapshot { get; set; }
        }

        /// <summary>
        /// Snapshot of player stats at a point in time
        /// </summary>
        public class PlayerStatsSnapshot
        {
            public int Kills { get; set; }
            public int Deaths { get; set; }
            public int Captures { get; set; }
            public int CarrierKills { get; set; }
            public int CarryTime { get; set; }
        }


    }
}

public static class ArenaExtensions
{
    /// <summary>
    /// Spawns the given item randomly in the specified area
    /// </summary>
    public static void spawnItemInArea(this Arena arena, ItemInfo item, ushort quantity, short x, short y, short radius)
    {       //Sanity
        if (quantity <= 0)
            return;

        int blockedAttempts = 30;

        short pX;
        short pY;
        while (true)
        {
            pX = x;
            pY = y;
            Helpers.randomPositionInArea(arena, radius, ref pX, ref pY);
            if (arena.getTile(pX, pY).Blocked)
            {
                blockedAttempts--;
                if (blockedAttempts <= 0)
                    //Consider the spawn to be blocked
                    return;
                continue;
            }
            arena.itemSpawn(item, quantity, pX, pY, null);
            break;
        }
    }
}