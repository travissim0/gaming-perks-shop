# 🔐 Supabase Configuration System

This system separates sensitive Supabase credentials from the main CTF.cs source code to prevent accidental exposure in version control.

## 📁 Files

- `SupabaseConfig.cs` - Configuration loader class
- `supabase-config.json` - **ACTUAL** credentials (not in git)
- `supabase-config-template.json` - Template file (safe for git)

## 🚀 Setup Instructions

### 1. Copy Template to Create Config
```bash
cp supabase-config-template.json supabase-config.json
```

### 2. Edit the Config File
Edit `supabase-config.json` with your actual Supabase credentials:

```json
{
  "supabase": {
    "url": "https://nkinpmqnbcjaftqduujf.supabase.co",
    "anon_key": "your_actual_anon_key_here",
    "service_role_key": "your_actual_service_role_key_here"
  },
  "api": {
    "phrases_endpoint": "/rest/v1/rpc/get_simple_player_phrases"
  }
}
```

### 3. Update Your CTF.cs File

Replace the hardcoded constants with:

```csharp
// OLD (remove these lines):
// private const string SUPABASE_URL = "https://...";
// private const string SUPABASE_ANON_KEY = "eyJ...";
// private const string SUPABASE_SERVICE_ROLE_KEY = "eyJ...";

// NEW (add these lines):
private static string SUPABASE_URL => SupabaseConfig.Url;
private static string SUPABASE_ANON_KEY => SupabaseConfig.AnonKey;
private static string SUPABASE_SERVICE_ROLE_KEY => SupabaseConfig.ServiceRoleKey;
private static string PHRASES_API_ENDPOINT => SupabaseConfig.PhrasesApiEndpoint;
```

### 4. Add Config Test to Initialization

```csharp
public override bool Initialize(Game game, IDictionary<string, string> attributes)
{
    // Test configuration loading
    if (!SupabaseConfig.TestConfig())
    {
        Log.write(TLog.Error, "Failed to load Supabase configuration. Check supabase-config.json file.");
        return false;
    }
    
    // Your existing initialization code...
    return true;
}
```

## 📂 File Placement

The config file will be automatically found if placed in any of these locations relative to your CTF executable:

1. Same directory as executable: `./supabase-config.json`
2. Current working directory: `./supabase-config.json`
3. Parent directory: `../supabase-config.json`
4. Two levels up: `../../supabase-config.json`
5. Application base directory

## 🛡️ Security Notes

- ✅ `supabase-config.json` is in `.gitignore` and won't be committed
- ✅ Template file can be safely committed to help others set up
- ✅ Configuration is loaded once and cached for performance
- ✅ Clear error messages if config file is missing or invalid

## 🔧 Server Deployment

1. Copy `SupabaseConfig.cs` and `supabase-config.json` to your server
2. Place them in the same directory as your CTF executable
3. The configuration will be automatically loaded at startup

## 🧪 Testing

Test your configuration with:

```csharp
if (SupabaseConfig.TestConfig())
{
    Console.WriteLine("✅ Configuration loaded successfully!");
}
else
{
    Console.WriteLine("❌ Configuration failed to load!");
}
```

## 🔄 Migration from Hardcoded Keys

1. Create `supabase-config.json` with your credentials
2. Replace hardcoded constants with the new property accessors
3. Add configuration test to your initialization
4. Remove the old hardcoded keys from CTF.cs
5. Commit the updated CTF.cs (without secrets!)

## ⚠️ Important Notes

- Never commit `supabase-config.json` to version control
- Always use the template file for new setups
- Keep backups of your config file in a secure location
- Regenerate keys if they were accidentally exposed 