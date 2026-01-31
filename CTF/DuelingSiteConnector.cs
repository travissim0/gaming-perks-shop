using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text;
using System.IO;
using Newtonsoft.Json.Linq;

namespace InfServer.Script.GameType_USL
{
    /// <summary>
    /// Authentication method for a site endpoint
    /// </summary>
    public enum SiteAuthMethod
    {
        /// <summary>Supabase-style: Authorization Bearer + apikey headers</summary>
        HeaderBased,
        /// <summary>Auth key sent in the JSON body as auth_key field</summary>
        BodyBased,
        /// <summary>Simple API key sent as x-api-key header</summary>
        ApiKey
    }

    /// <summary>
    /// Configuration for a single site that receives dueling stats
    /// </summary>
    public class SiteConfig
    {
        public string Name { get; set; }
        public string ApiEndpointLocal { get; set; }
        public string ApiEndpointProduction { get; set; }
        public bool UseLocal { get; set; }
        public SiteAuthMethod AuthMethod { get; set; }
        public string AuthKeySource { get; set; }
        public string AuthKey { get; set; }
        public bool Enabled { get; set; }
        public string UserAgent { get; set; }

        /// <summary>
        /// Returns the active endpoint URL based on UseLocal toggle
        /// </summary>
        public string ActiveEndpoint
        {
            get { return UseLocal ? ApiEndpointLocal : ApiEndpointProduction; }
        }

        /// <summary>
        /// Returns the resolved auth key - either from SupabaseConfig or the direct value
        /// </summary>
        public string ResolvedAuthKey
        {
            get
            {
                if (!string.IsNullOrEmpty(AuthKeySource) &&
                    AuthKeySource.Equals("supabase_config", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        return SupabaseConfig.ServiceRoleKey;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(String.Format("DuelingSiteConnector: Failed to load key from SupabaseConfig for {0}: {1}", Name, ex.Message));
                        return null;
                    }
                }
                return AuthKey;
            }
        }
    }

    /// <summary>
    /// Multi-site connector for pushing dueling stats to multiple websites.
    /// Each site has independent configuration (URL, auth method, enabled toggle).
    /// </summary>
    public class DuelingSiteConnector
    {
        private static readonly HttpClient httpClient = new HttpClient();
        private List<SiteConfig> _sites;
        private bool _loaded;
        private static readonly object _loadLock = new object();

        public DuelingSiteConnector()
        {
            _sites = new List<SiteConfig>();
            _loaded = false;
        }

        /// <summary>
        /// Load site configurations from dueling-sites-config.json
        /// </summary>
        public void LoadSiteConfigs()
        {
            if (_loaded) return;

            lock (_loadLock)
            {
                if (_loaded) return;

                try
                {
                    string[] possiblePaths = {
                        "dueling-sites-config.json",
                        "./dueling-sites-config.json",
                        "../dueling-sites-config.json",
                        "../../dueling-sites-config.json",
                        Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dueling-sites-config.json")
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
                        Console.WriteLine("DuelingSiteConnector: dueling-sites-config.json not found, using defaults");
                        SetupDefaultConfig();
                        _loaded = true;
                        return;
                    }

                    string jsonContent = File.ReadAllText(configPath);
                    JObject config = JObject.Parse(jsonContent);
                    JArray sitesArray = config["sites"] as JArray;

                    if (sitesArray == null)
                    {
                        Console.WriteLine("DuelingSiteConnector: No 'sites' array in config, using defaults");
                        SetupDefaultConfig();
                        _loaded = true;
                        return;
                    }

                    _sites.Clear();
                    foreach (JToken siteToken in sitesArray)
                    {
                        var site = new SiteConfig
                        {
                            Name = siteToken["name"]?.ToString() ?? "Unknown",
                            ApiEndpointLocal = siteToken["api_endpoint_local"]?.ToString() ?? "",
                            ApiEndpointProduction = siteToken["api_endpoint_production"]?.ToString() ?? "",
                            UseLocal = siteToken["use_local"]?.Value<bool>() ?? false,
                            AuthKeySource = siteToken["auth_key_source"]?.ToString() ?? "",
                            AuthKey = siteToken["auth_key"]?.ToString() ?? "",
                            Enabled = siteToken["enabled"]?.Value<bool>() ?? false,
                            UserAgent = siteToken["user_agent"]?.ToString() ?? "USL-Dueling/1.0"
                        };

                        // Parse auth method
                        string authMethodStr = siteToken["auth_method"]?.ToString() ?? "header_based";
                        switch (authMethodStr.ToLower())
                        {
                            case "body_based":
                                site.AuthMethod = SiteAuthMethod.BodyBased;
                                break;
                            case "api_key":
                                site.AuthMethod = SiteAuthMethod.ApiKey;
                                break;
                            default:
                                site.AuthMethod = SiteAuthMethod.HeaderBased;
                                break;
                        }

                        _sites.Add(site);
                    }

                    Console.WriteLine(String.Format("DuelingSiteConnector: Loaded {0} site(s) from {1}", _sites.Count, Path.GetFullPath(configPath)));
                    foreach (var site in _sites)
                    {
                        Console.WriteLine(String.Format("  - {0}: {1} (enabled={2})", site.Name, site.ActiveEndpoint, site.Enabled));
                    }

                    _loaded = true;
                }
                catch (Exception ex)
                {
                    Console.WriteLine(String.Format("DuelingSiteConnector: Error loading config: {0}", ex.Message));
                    SetupDefaultConfig();
                    _loaded = true;
                }
            }
        }

        /// <summary>
        /// Default configuration when no config file is found
        /// </summary>
        private void SetupDefaultConfig()
        {
            _sites.Clear();
            _sites.Add(new SiteConfig
            {
                Name = "FreeInf",
                ApiEndpointLocal = "http://localhost:3000/api/dueling/bo9-stats",
                ApiEndpointProduction = "https://freeinf.org/api/dueling/bo9-stats",
                UseLocal = true,
                AuthMethod = SiteAuthMethod.HeaderBased,
                AuthKeySource = "supabase_config",
                Enabled = true,
                UserAgent = "USL-Dueling/1.0"
            });

            Console.WriteLine("DuelingSiteConnector: Using default FreeInf configuration");
        }

        /// <summary>
        /// Send a JSON payload to all enabled sites
        /// </summary>
        public async Task SendToAllSites(string jsonPayload, string statType)
        {
            LoadSiteConfigs();

            var tasks = new List<Task>();
            foreach (var site in _sites)
            {
                if (!site.Enabled)
                {
                    Console.WriteLine(String.Format("DuelingSiteConnector: Skipping disabled site: {0}", site.Name));
                    continue;
                }

                if (string.IsNullOrEmpty(site.ActiveEndpoint))
                {
                    Console.WriteLine(String.Format("DuelingSiteConnector: Skipping site with no endpoint: {0}", site.Name));
                    continue;
                }

                tasks.Add(SendToSite(site, jsonPayload, statType));
            }

            if (tasks.Count > 0)
            {
                await Task.WhenAll(tasks);
            }
            else
            {
                Console.WriteLine("DuelingSiteConnector: No enabled sites to send to");
            }
        }

        /// <summary>
        /// Send a JSON payload to a specific site
        /// </summary>
        public async Task SendToSite(SiteConfig site, string jsonPayload, string statType)
        {
            try
            {
                string endpoint = site.ActiveEndpoint;
                string authKey = site.ResolvedAuthKey;

                // For body-based auth, inject auth_key into the JSON payload
                string finalPayload = jsonPayload;
                if (site.AuthMethod == SiteAuthMethod.BodyBased && !string.IsNullOrEmpty(authKey))
                {
                    finalPayload = InjectAuthKeyIntoJson(jsonPayload, authKey);
                }

                var content = new StringContent(finalPayload, Encoding.UTF8, "application/json");
                var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Content = content;

                // Set User-Agent
                request.Headers.Add("User-Agent", site.UserAgent ?? "USL-Dueling/1.0");

                // Apply authentication based on method
                switch (site.AuthMethod)
                {
                    case SiteAuthMethod.HeaderBased:
                        if (!string.IsNullOrEmpty(authKey))
                        {
                            request.Headers.Add("apikey", authKey);
                            request.Headers.Add("Authorization", String.Format("Bearer {0}", authKey));
                        }
                        break;

                    case SiteAuthMethod.ApiKey:
                        if (!string.IsNullOrEmpty(authKey))
                        {
                            request.Headers.Add("x-api-key", authKey);
                        }
                        break;

                    case SiteAuthMethod.BodyBased:
                        // Auth key already injected into payload above
                        break;
                }

                Console.WriteLine(String.Format("DuelingSiteConnector: Sending {0} to {1} ({2})", statType, site.Name, endpoint));

                var response = await httpClient.SendAsync(request);
                string responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    Console.WriteLine(String.Format("DuelingSiteConnector: {0} -> {1} sent successfully", site.Name, statType));
                }
                else
                {
                    Console.WriteLine(String.Format("DuelingSiteConnector: {0} -> {1} failed: {2} - {3}",
                        site.Name, statType, response.StatusCode, responseContent));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("DuelingSiteConnector: Error sending to {0}: {1}", site.Name, ex.Message));
            }
        }

        /// <summary>
        /// Test connectivity to all enabled sites
        /// </summary>
        public async Task TestAllConnections()
        {
            LoadSiteConfigs();

            Console.WriteLine("DuelingSiteConnector: Testing all site connections...");

            string testPayload = BuildJsonString(new
            {
                action = "test",
                source = "DuelingSiteConnector",
                timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
            });

            await SendToAllSites(testPayload, "connection test");
        }

        /// <summary>
        /// Inject an auth_key field into an existing JSON string
        /// </summary>
        private string InjectAuthKeyIntoJson(string json, string authKey)
        {
            if (string.IsNullOrEmpty(json) || json.Length < 2)
                return json;

            // Insert auth_key right after the opening brace
            string authField = String.Format("\"auth_key\":\"{0}\",", EscapeJsonString(authKey));
            return "{" + authField + json.Substring(1);
        }

        /// <summary>
        /// Build JSON string manually (no external library dependency for game server compatibility)
        /// Supports: strings, numbers, booleans, string arrays, object arrays, null
        /// </summary>
        public static string BuildJsonString(object payload)
        {
            if (payload == null)
                return "{}";

            var sb = new StringBuilder();
            sb.Append("{");

            var properties = payload.GetType().GetProperties();
            for (int i = 0; i < properties.Length; i++)
            {
                if (i > 0)
                    sb.Append(",");

                var prop = properties[i];
                var value = prop.GetValue(payload);

                sb.Append(String.Format("\"{0}\":", prop.Name));

                if (value == null)
                {
                    sb.Append("null");
                }
                else if (value is string)
                {
                    sb.Append(String.Format("\"{0}\"", EscapeJsonString(value.ToString())));
                }
                else if (value is int || value is long || value is double || value is float || value is decimal)
                {
                    sb.Append(value.ToString());
                }
                else if (value is bool)
                {
                    sb.Append(value.ToString().ToLower());
                }
                else if (value is string[])
                {
                    var stringArray = value as string[];
                    sb.Append("[");
                    for (int j = 0; j < stringArray.Length; j++)
                    {
                        if (j > 0)
                            sb.Append(",");
                        sb.Append(String.Format("\"{0}\"", EscapeJsonString(stringArray[j] ?? "")));
                    }
                    sb.Append("]");
                }
                else
                {
                    sb.Append(String.Format("\"{0}\"", EscapeJsonString(value.ToString())));
                }
            }

            sb.Append("}");
            return sb.ToString();
        }

        /// <summary>
        /// Escape special characters in JSON strings
        /// </summary>
        public static string EscapeJsonString(string input)
        {
            if (string.IsNullOrEmpty(input))
                return string.Empty;

            return input
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\b", "\\b")
                .Replace("\f", "\\f")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r")
                .Replace("\t", "\\t");
        }
    }
}
