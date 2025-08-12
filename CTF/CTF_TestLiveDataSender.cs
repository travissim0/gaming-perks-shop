// CTF Test Live Data Sender
// Compile this as a simple console app to test your live data integration
// Usage: CTFTestSender.exe [local|production]

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;

namespace CTFTestSender
{
    class Program
    {
        private static readonly HttpClient httpClient = new HttpClient();
        
        // Configure endpoints
        private const string LOCAL_ENDPOINT = "http://localhost:3001/api/test-live-data";
        private const string PRODUCTION_ENDPOINT = "https://freeinf.org/api/test-live-data";
        
        static void Main(string[] args)
        {
            Console.WriteLine("CTF Live Data Test Sender");
            Console.WriteLine("========================");
            
            // Determine endpoint
            bool useLocal = args.Length == 0 || args[0].ToLower() == "local";
            string endpoint = useLocal ? LOCAL_ENDPOINT : PRODUCTION_ENDPOINT;
            
            Console.WriteLine("Target: " + endpoint);
            Console.WriteLine("Mode: " + (useLocal ? "LOCAL" : "PRODUCTION"));
            Console.WriteLine();
            
            // Test connectivity first
            TestConnectivity(endpoint);
            
            Console.WriteLine("Starting live data simulation...");
            Console.WriteLine("Press Ctrl+C to stop");
            Console.WriteLine();
            
            // Start sending test data
            SimulateLiveGameData(endpoint);
        }
        
        static void TestConnectivity(string endpoint)
        {
            try
            {
                Console.WriteLine("Testing connectivity...");
                
                // Test GET request first
                var getResponse = httpClient.GetAsync(endpoint).Result;
                if (getResponse.IsSuccessStatusCode)
                {
                    var content = getResponse.Content.ReadAsStringAsync().Result;
                    Console.WriteLine("✓ GET request successful");
                    Console.WriteLine("  Response: " + content.Substring(0, Math.Min(100, content.Length)) + "...");
                }
                else
                {
                    Console.WriteLine("✗ GET request failed: " + getResponse.StatusCode);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("✗ Connectivity test failed: " + ex.Message);
            }
            
            Console.WriteLine();
        }
        
        static void SimulateLiveGameData(string endpoint)
        {
            int updateCount = 0;
            int lastUpdateTick = Environment.TickCount;
            
            while (true)
            {
                int currentTick = Environment.TickCount;
                
                // Only send update every 15 seconds (15000 milliseconds)
                if (currentTick - lastUpdateTick >= 15000)
                {
                    try
                    {
                        updateCount++;
                        
                        // Create test game data
                        var testData = CreateTestGameData(updateCount);
                        string jsonData = BuildJsonString(testData);
                        
                        // Send to endpoint
                        var content = new StringContent(jsonData, Encoding.UTF8, "application/json");
                        var response = httpClient.PostAsync(endpoint, content).Result;
                        
                        if (response.IsSuccessStatusCode)
                        {
                            var responseContent = response.Content.ReadAsStringAsync().Result;
                            Console.WriteLine("✓ Update #" + updateCount + " sent successfully");
                            Console.WriteLine("  Arena: " + testData.arenaName + ", Players: " + testData.players.Count);
                        }
                        else
                        {
                            var errorContent = response.Content.ReadAsStringAsync().Result;
                            Console.WriteLine("✗ Update #" + updateCount + " failed: " + response.StatusCode);
                            Console.WriteLine("  Error: " + errorContent);
                        }
                        
                        lastUpdateTick = currentTick;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("✗ Error sending update #" + updateCount + ": " + ex.Message);
                    }
                }
                
                // Small sleep to prevent 100% CPU usage
                System.Threading.Thread.Sleep(100);
            }
        }
        
        static TestGameData CreateTestGameData(int updateCount)
        {
            // Simulate dynamic game state
            bool duelActive = (updateCount % 4) == 0; // Duel every 4th update
            
            return new TestGameData
            {
                arenaName = "CTF_TestArena",
                gameType = "OvD",
                baseUsed = updateCount % 2 == 0 ? "North Base" : "South Base",
                players = new List<TestPlayer>
                {
                    // Titan Team (Offense)
                    new TestPlayer
                    {
                        alias = "TestTitan1",
                        team = "WC T",
                        teamType = "Titan",
                        className = GetRotatingClass(updateCount, 0),
                        isOffense = true,
                        weapon = "Standard",
                        classPlayTimes = CreateClassPlayTimes(updateCount, 0),
                        totalPlayTime = updateCount * 15000, // 15 seconds per update
                        isDueling = duelActive,
                        duelOpponent = duelActive ? "TestCollective1" : null,
                        duelType = duelActive ? "Bo3" : null,
                        currentHealth = 60 - (updateCount % 25), // Simulate damage
                        currentEnergy = 600 - (updateCount % 100),
                        isAlive = true
                    },
                    new TestPlayer
                    {
                        alias = "TestTitan2",
                        team = "WC T",
                        teamType = "Titan",
                        className = GetRotatingClass(updateCount, 1),
                        isOffense = true,
                        weapon = "Mortar",
                        classPlayTimes = CreateClassPlayTimes(updateCount, 1),
                        totalPlayTime = updateCount * 15000,
                        isDueling = false,
                        duelOpponent = null,
                        duelType = null,
                        currentHealth = 60,
                        currentEnergy = 600,
                        isAlive = true
                    },
                    
                    // Collective Team (Defense)
                    new TestPlayer
                    {
                        alias = "TestCollective1",
                        team = "PT C",
                        teamType = "Collective",
                        className = GetRotatingClass(updateCount, 2),
                        isOffense = false,
                        weapon = "Standard",
                        classPlayTimes = CreateClassPlayTimes(updateCount, 2),
                        totalPlayTime = updateCount * 15000,
                        isDueling = duelActive,
                        duelOpponent = duelActive ? "TestTitan1" : null,
                        duelType = duelActive ? "Bo3" : null,
                        currentHealth = 45,
                        currentEnergy = 550,
                        isAlive = true
                    },
                    new TestPlayer
                    {
                        alias = "TestCollective2",
                        team = "PT C",
                        teamType = "Collective",
                        className = GetRotatingClass(updateCount, 3),
                        isOffense = false,
                        weapon = "Standard",
                        classPlayTimes = CreateClassPlayTimes(updateCount, 3),
                        totalPlayTime = updateCount * 15000,
                        isDueling = false,
                        duelOpponent = null,
                        duelType = null,
                        currentHealth = 60,
                        currentEnergy = 600,
                        isAlive = true
                    },
                    
                    // Spectator
                    new TestPlayer
                    {
                        alias = "TestSpectator",
                        team = "Team Spec",
                        teamType = "Spectator",
                        className = "Spectator",
                        isOffense = false,
                        weapon = "Standard",
                        classPlayTimes = new Dictionary<string, int>(),
                        totalPlayTime = 0,
                        isDueling = false,
                        duelOpponent = null,
                        duelType = null,
                        currentHealth = 60,
                        currentEnergy = 600,
                        isAlive = true
                    }
                }
            };
        }
        
        static string GetRotatingClass(int updateCount, int playerOffset)
        {
            string[] classes = { "Infantry", "Heavy Weapons", "Squad Leader", "Combat Engineer", "Field Medic", "Infiltrator", "Jump Trooper" };
            int index = (updateCount + playerOffset) % classes.Length;
            return classes[index];
        }
        
        static Dictionary<string, int> CreateClassPlayTimes(int updateCount, int playerOffset)
        {
            var playTimes = new Dictionary<string, int>();
            
            // Simulate accumulated play time across multiple classes
            playTimes["Infantry"] = (updateCount + playerOffset) * 5000;
            playTimes["Heavy Weapons"] = Math.Max(0, (updateCount - 2 + playerOffset) * 3000);
            playTimes["Squad Leader"] = Math.Max(0, (updateCount - 4 + playerOffset) * 2000);
            
            return playTimes;
        }
        
        static string BuildJsonString(TestGameData data)
        {
            var json = new StringBuilder();
            json.Append("{");
            json.AppendFormat("\"arenaName\":\"{0}\",", EscapeJsonString(data.arenaName));
            json.AppendFormat("\"gameType\":\"{0}\",", EscapeJsonString(data.gameType));
            json.AppendFormat("\"baseUsed\":\"{0}\",", EscapeJsonString(data.baseUsed));
            json.Append("\"players\":[");
            
            for (int i = 0; i < data.players.Count; i++)
            {
                var player = data.players[i];
                json.Append("{");
                json.AppendFormat("\"alias\":\"{0}\",", EscapeJsonString(player.alias));
                json.AppendFormat("\"team\":\"{0}\",", EscapeJsonString(player.team));
                json.AppendFormat("\"teamType\":\"{0}\",", EscapeJsonString(player.teamType));
                json.AppendFormat("\"className\":\"{0}\",", EscapeJsonString(player.className));
                json.AppendFormat("\"isOffense\":{0},", player.isOffense.ToString().ToLower());
                json.AppendFormat("\"weapon\":\"{0}\",", EscapeJsonString(player.weapon));
                json.AppendFormat("\"totalPlayTime\":{0},", player.totalPlayTime);
                json.AppendFormat("\"isDueling\":{0},", player.isDueling.ToString().ToLower());
                json.AppendFormat("\"currentHealth\":{0},", player.currentHealth);
                json.AppendFormat("\"currentEnergy\":{0},", player.currentEnergy);
                json.AppendFormat("\"isAlive\":{0},", player.isAlive.ToString().ToLower());
                
                if (player.duelOpponent != null)
                    json.AppendFormat("\"duelOpponent\":\"{0}\",", EscapeJsonString(player.duelOpponent));
                else
                    json.Append("\"duelOpponent\":null,");
                    
                if (player.duelType != null)
                    json.AppendFormat("\"duelType\":\"{0}\",", EscapeJsonString(player.duelType));
                else
                    json.Append("\"duelType\":null,");
                
                // Add class play times
                json.Append("\"classPlayTimes\":{");
                if (player.classPlayTimes != null && player.classPlayTimes.Count > 0)
                {
                    var classTimes = new List<KeyValuePair<string, int>>(player.classPlayTimes);
                    for (int j = 0; j < classTimes.Count; j++)
                    {
                        json.AppendFormat("\"{0}\":{1}", EscapeJsonString(classTimes[j].Key), classTimes[j].Value);
                        if (j < classTimes.Count - 1) json.Append(",");
                    }
                }
                json.Append("}");
                
                json.Append("}");
                if (i < data.players.Count - 1) json.Append(",");
            }
            
            json.Append("]}");
            return json.ToString();
        }
        
        static string EscapeJsonString(string input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            
            return input.Replace("\\", "\\\\")
                       .Replace("\"", "\\\"")
                       .Replace("\n", "\\n")
                       .Replace("\r", "\\r")
                       .Replace("\t", "\\t");
        }
    }
    
    class TestGameData
    {
        public string arenaName { get; set; }
        public string gameType { get; set; }
        public string baseUsed { get; set; }
        public List<TestPlayer> players { get; set; }
    }
    
    class TestPlayer
    {
        public string alias { get; set; }
        public string team { get; set; }
        public string teamType { get; set; }
        public string className { get; set; }
        public bool isOffense { get; set; }
        public string weapon { get; set; }
        public Dictionary<string, int> classPlayTimes { get; set; }
        public int totalPlayTime { get; set; }
        public bool isDueling { get; set; }
        public string duelOpponent { get; set; }
        public string duelType { get; set; }
        public int currentHealth { get; set; }
        public int currentEnergy { get; set; }
        public bool isAlive { get; set; }
    }
}