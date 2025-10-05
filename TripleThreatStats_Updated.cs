using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text;
using System.Linq;

using InfServer.Game;
using InfServer.Logic;
using InfServer.Scripting;
using InfServer.Protocol;
using InfServer.Bots;

using Assets;

namespace InfServer.Script.GameType_USL
{
    /// <summary>
    /// Triple Threat stat tracking system for MoloTeamFights.lvl only
    /// Tracks game wins/losses and series wins/losses for best-of series matches
    /// </summary>
    public class TripleThreatStats
    {
        private static readonly HttpClient httpClient = new HttpClient();
        
        // API Configuration - Change USE_LOCAL_API to switch between local and production
        private const bool USE_LOCAL_API = true; // Set to false for production
        private const string LOCAL_API_ENDPOINT = "http://localhost:3000/api/triple-threat/game-stats";
        private const string PRODUCTION_API_ENDPOINT = "https://freeinf.org/api/triple-threat/game-stats";
        
        // Supabase configuration for authentication (matching CTFUtilities.cs)
        private const string SUPABASE_URL = "https://nkinpmqnbcjaftqduujf.supabase.co";
        private const string SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4";
        
        private static string API_ENDPOINT
        {
            get
            {
                return USE_LOCAL_API ? LOCAL_API_ENDPOINT : PRODUCTION_API_ENDPOINT;
            }
        }
        
        /// <summary>
        /// Check if the current map is MoloTeamFights.lvl
        /// </summary>
        public static bool IsMoloTeamFights(string levelFileName)
        {
            if (string.IsNullOrEmpty(levelFileName))
                return false;
                
            return levelFileName.Equals("MoloTeamFights.lvl", StringComparison.OrdinalIgnoreCase);
        }
        
        /// <summary>
        /// Send game win/loss stats to the website
        /// Called when a single game/round is completed
        /// </summary>
        public static async Task SendGameStats(string winnerTeam, string loserTeam, Arena arena, List<Player> players, string levelFileName)
        {
            if (!IsMoloTeamFights(levelFileName))
                return;
                
            try
            {
                Console.WriteLine(String.Format("TripleThreatStats: Processing game result - {0} vs {1}", winnerTeam, loserTeam));
                
                // Get all players from winning and losing teams
                var winningPlayers = GetPlayersFromTeam(winnerTeam, players);
                var losingPlayers = GetPlayersFromTeam(loserTeam, players);
                
                if (winningPlayers.Count == 0 || losingPlayers.Count == 0)
                {
                    Console.WriteLine("TripleThreatStats: Could not find players for game stats");
                    return;
                }
                
                Console.WriteLine(String.Format("TripleThreatStats: Found {0} winning players and {1} losing players", winningPlayers.Count, losingPlayers.Count));
                
                // Create the payload with all players
                var payload = new
                {
                    action = "game_result",
                    winner_team = winnerTeam,
                    loser_team = loserTeam,
                    winner_players = winningPlayers.Select(p => p._alias).ToArray(),
                    loser_players = losingPlayers.Select(p => p._alias).ToArray(),
                    arena_name = arena._name,
                    timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTH:mm:ssZ")
                };
                
                // Send to API with proper authentication headers
                await SendStatsToAPI(payload, "game");
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("TripleThreatStats: Error sending game stats: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Send series win/loss stats to the website
        /// Called when a best-of series is completed
        /// </summary>
        public static async Task SendSeriesStats(string winnerTeam, string loserTeam, Arena arena, List<Player> players, int seriesLength, string levelFileName)
        {
            if (!IsMoloTeamFights(levelFileName))
                return;
                
            try
            {
                Console.WriteLine(String.Format("TripleThreatStats: Processing series result - {0} vs {1} (best of {2})", winnerTeam, loserTeam, seriesLength));
                
                // Get all players from winning and losing teams
                var winningPlayers = GetPlayersFromTeam(winnerTeam, players);
                var losingPlayers = GetPlayersFromTeam(loserTeam, players);
                
                if (winningPlayers.Count == 0 || losingPlayers.Count == 0)
                {
                    Console.WriteLine("TripleThreatStats: Could not find players for series stats");
                    return;
                }
                
                Console.WriteLine(String.Format("TripleThreatStats: Found {0} winning players and {1} losing players", winningPlayers.Count, losingPlayers.Count));
                
                // Create the payload with all players
                var payload = new
                {
                    action = "series_result",
                    winner_team = winnerTeam,
                    loser_team = loserTeam,
                    winner_players = winningPlayers.Select(p => p._alias).ToArray(),
                    loser_players = losingPlayers.Select(p => p._alias).ToArray(),
                    series_length = seriesLength,
                    arena_name = arena._name,
                    timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
                };
                
                // Send to API with proper authentication headers
                await SendStatsToAPI(payload, "series");
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("TripleThreatStats: Error sending series stats: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Send stats payload to API with proper authentication
        /// </summary>
        private static async Task SendStatsToAPI(object payload, string statType)
        {
            try
            {
                string jsonData = BuildJsonString(payload);
                var content = new StringContent(jsonData, Encoding.UTF8, "application/json");
                
                // Create request with proper authentication headers for service-to-service communication
                var request = new HttpRequestMessage(HttpMethod.Post, API_ENDPOINT);
                request.Content = content;
                
                // Add required headers for game server authentication
                request.Headers.Add("User-Agent", "USL-Game/1.0");
                request.Headers.Add("apikey", SUPABASE_SERVICE_ROLE_KEY);
                request.Headers.Add("Authorization", String.Format("Bearer {0}", SUPABASE_SERVICE_ROLE_KEY));
                
                Console.WriteLine(String.Format("TripleThreatStats: Sending {0} stats to {1}", statType, API_ENDPOINT));
                
                var response = await httpClient.SendAsync(request);
                string responseContent = await response.Content.ReadAsStringAsync();
                
                if (response.IsSuccessStatusCode)
                {
                    Console.WriteLine(String.Format("TripleThreatStats: {0} stats sent successfully! Response: {1}", 
                        char.ToUpper(statType[0]) + statType.Substring(1), responseContent));
                }
                else
                {
                    Console.WriteLine(String.Format("TripleThreatStats: Failed to send {0} stats: {1} - {2}", 
                        statType, response.StatusCode, responseContent));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("TripleThreatStats: Error in SendStatsToAPI: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Get all active players from a given team
        /// </summary>
        private static List<Player> GetPlayersFromTeam(string teamName, List<Player> players)
        {
            if (players == null || string.IsNullOrEmpty(teamName))
                return new List<Player>();
                
            // Find all players on the specified team (including dead players - they still participated in the game)
            var result = players.Where(p => 
                p != null && 
                p._team != null && 
                p._team._name.Equals(teamName, StringComparison.OrdinalIgnoreCase)).ToList();
            
            return result;
        }
        
        /// <summary>
        /// Build JSON string manually (no external libraries needed for compatibility)
        /// </summary>
        private static string BuildJsonString(object payload)
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
        private static string EscapeJsonString(string input)
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
        
        /// <summary>
        /// Test the API connection
        /// </summary>
        public static async Task TestConnection()
        {
            try
            {
                Console.WriteLine("TripleThreatStats: Testing API connection...");
                
                var testPayload = new
                {
                    action = "test",
                    timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
                };
                
                await SendStatsToAPI(testPayload, "connection test");
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("TripleThreatStats: API connection test error: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Send test stats data to verify API connectivity
        /// </summary>
        public static async Task SendTestStats()
        {
            try
            {
                Console.WriteLine("TripleThreatStats: Sending test game stats...");
                
                // Create fake test data for game result
                var testGamePayload = new
                {
                    action = "game_result",
                    winner_team = "TestTeam1",
                    loser_team = "TestTeam2",
                    winner_players = new string[] { "TestPlayer1", "TestPlayer2" },
                    loser_players = new string[] { "TestPlayer3", "TestPlayer4" },
                    arena_name = "TestArena",
                    timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
                };
                
                await SendStatsToAPI(testGamePayload, "test game");
                
                // Wait a moment then test series stats
                await Task.Delay(1000);
                
                Console.WriteLine("TripleThreatStats: Sending test series stats...");
                
                var testSeriesPayload = new
                {
                    action = "series_result",
                    winner_team = "TestTeam1",
                    loser_team = "TestTeam2",
                    winner_players = new string[] { "TestPlayer1", "TestPlayer2" },
                    loser_players = new string[] { "TestPlayer3", "TestPlayer4" },
                    series_length = 3,
                    arena_name = "TestArena",
                    timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
                };
                
                await SendStatsToAPI(testSeriesPayload, "test series");
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("TripleThreatStats: Test stats error: {0}", ex.Message));
            }
        }
    }
}
