using System;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// Configuration helper for loading Supabase credentials from external config file
/// This keeps sensitive keys out of the main CTF.cs file
/// </summary>
public static class SupabaseConfig
{
    private static JObject _config;
    private static readonly object _lock = new object();
    
    /// <summary>
    /// Load configuration from supabase-config.json file
    /// The file should be in the same directory as the executable
    /// </summary>
    private static void LoadConfig()
    {
        if (_config != null) return;
        
        lock (_lock)
        {
            if (_config != null) return;
            
            try
            {
                // Try multiple possible paths for the config file
                string[] possiblePaths = {
                    "supabase-config.json",                    // Same directory as executable
                    "./supabase-config.json",                 // Current working directory
                    "../supabase-config.json",                // Parent directory
                    "../../supabase-config.json",             // Two levels up
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "supabase-config.json") // App directory
                };
                
                string configPath = null;
                foreach (string path in possiblePaths)
                {
                    if (File.Exists(path))
                    {
                        configPath = path;
                        break;
                    }
                }
                
                if (configPath == null)
                {
                    throw new FileNotFoundException("supabase-config.json not found in any expected location");
                }
                
                string jsonContent = File.ReadAllText(configPath);
                _config = JObject.Parse(jsonContent);
                
                Console.WriteLine($"✅ Loaded Supabase config from: {Path.GetFullPath(configPath)}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error loading Supabase config: {ex.Message}");
                throw new InvalidOperationException("Failed to load Supabase configuration", ex);
            }
        }
    }
    
    /// <summary>
    /// Get the Supabase URL
    /// </summary>
    public static string Url
    {
        get
        {
            LoadConfig();
            return _config["supabase"]["url"]?.ToString() ?? 
                   throw new InvalidOperationException("Supabase URL not found in config");
        }
    }
    
    /// <summary>
    /// Get the Supabase Anonymous Key
    /// </summary>
    public static string AnonKey
    {
        get
        {
            LoadConfig();
            return _config["supabase"]["anon_key"]?.ToString() ?? 
                   throw new InvalidOperationException("Supabase anon key not found in config");
        }
    }
    
    /// <summary>
    /// Get the Supabase Service Role Key
    /// </summary>
    public static string ServiceRoleKey
    {
        get
        {
            LoadConfig();
            return _config["supabase"]["service_role_key"]?.ToString() ?? 
                   throw new InvalidOperationException("Supabase service role key not found in config");
        }
    }
    
    /// <summary>
    /// Get the full Phrases API endpoint URL
    /// </summary>
    public static string PhrasesApiEndpoint
    {
        get
        {
            LoadConfig();
            string endpoint = _config["api"]["phrases_endpoint"]?.ToString() ?? "/rest/v1/rpc/get_simple_player_phrases";
            return Url + endpoint;
        }
    }
    
    /// <summary>
    /// Test if the configuration is loaded and accessible
    /// </summary>
    public static bool TestConfig()
    {
        try
        {
            LoadConfig();
            bool hasUrl = !string.IsNullOrEmpty(Url);
            bool hasAnonKey = !string.IsNullOrEmpty(AnonKey);
            bool hasServiceKey = !string.IsNullOrEmpty(ServiceRoleKey);
            
            Console.WriteLine($"Config Test Results:");
            Console.WriteLine($"  URL: {(hasUrl ? "✅" : "❌")} {(hasUrl ? Url : "Missing")}");
            Console.WriteLine($"  Anon Key: {(hasAnonKey ? "✅" : "❌")} {(hasAnonKey ? "Present" : "Missing")}");
            Console.WriteLine($"  Service Key: {(hasServiceKey ? "✅" : "❌")} {(hasServiceKey ? "Present" : "Missing")}");
            Console.WriteLine($"  Phrases Endpoint: {PhrasesApiEndpoint}");
            
            return hasUrl && hasAnonKey && hasServiceKey;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Config test failed: {ex.Message}");
            return false;
        }
    }
} 