// ===========================================
// REPLACE THIS SECTION IN YOUR CTF.CS FILE
// ===========================================

// OLD CODE TO REMOVE:
/*
// Your Supabase configuration
private const string SUPABASE_URL = "https://nkinpmqnbcjaftqduujf.supabase.co"; // Replace with your Supabase URL

private const string SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMjA0NzYsImV4cCI6MjA2MzY5NjQ3Nn0.83gXbk6MVOI341";
private const string SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2ND";
private const string PHRASES_API_ENDPOINT = SUPABASE_URL + "/rest/v1/rpc/get_simple_player_phrases";
*/

// NEW CODE TO ADD:
// ✅ Configuration is now loaded from external supabase-config.json file
// This keeps sensitive credentials out of the source code
private static string SUPABASE_URL => SupabaseConfig.Url;
private static string SUPABASE_ANON_KEY => SupabaseConfig.AnonKey;
private static string SUPABASE_SERVICE_ROLE_KEY => SupabaseConfig.ServiceRoleKey;
private static string PHRASES_API_ENDPOINT => SupabaseConfig.PhrasesApiEndpoint;

// ===========================================
// ALSO UPDATE YOUR INITIALIZATION CODE
// ===========================================

// In your Initialize() method or wherever you set up the game, add this test:
public override bool Initialize(Game game, IDictionary<string, string> attributes)
{
    // Test configuration loading
    if (!SupabaseConfig.TestConfig())
    {
        Log.write(TLog.Error, "Failed to load Supabase configuration. Check supabase-config.json file.");
        return false;
    }
    
    // Your existing initialization code here...
    
    return true;
}

// ===========================================
// USAGE EXAMPLES
// ===========================================

// All your existing code will work the same way:
// client.DefaultRequestHeaders.Add("apikey", SUPABASE_SERVICE_ROLE_KEY);
// client.DefaultRequestHeaders.Add("Authorization", String.Format("Bearer {0}", SUPABASE_SERVICE_ROLE_KEY));

// The variables now pull from the config file instead of being hardcoded! 