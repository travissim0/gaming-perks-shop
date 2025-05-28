using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using InfServer.Game;
using InfServer.Protocol;
using InfServer.Logic;
using Assets;

namespace InfServer.Script.GameType_CTF
{
    public class DonationDisplay
    {
        private Arena _arena;
        private static readonly HttpClient httpClient = new HttpClient();
        private const string WEBSITE_URL = "http://localhost:3000"; // Change to your website URL
        
        public DonationDisplay(Arena arena)
        {
            _arena = arena;
        }

        /// <summary>
        /// Fetches recent donations from the website API
        /// </summary>
        public async Task<List<DonationInfo>> GetRecentDonations(int hours = 24, int limit = 10)
        {
            try
            {
                string url = $"{WEBSITE_URL}/api/recent-donations?hours={hours}&limit={limit}";
                
                HttpResponseMessage response = await httpClient.GetAsync(url);
                
                if (!response.IsSuccessStatusCode)
                {
                    Log.write(TLog.Warning, $"Failed to fetch donations: {response.StatusCode}");
                    return new List<DonationInfo>();
                }

                string jsonResponse = await response.Content.ReadAsStringAsync();
                return ParseDonationsJson(jsonResponse);
            }
            catch (Exception ex)
            {
                Log.write(TLog.Error, $"Error fetching donations: {ex.Message}");
                return new List<DonationInfo>();
            }
        }

        /// <summary>
        /// Parses the JSON response manually (no external JSON library needed)
        /// </summary>
        private List<DonationInfo> ParseDonationsJson(string json)
        {
            List<DonationInfo> donations = new List<DonationInfo>();
            
            try
            {
                // Find the donations array in the JSON
                int donationsStart = json.IndexOf("\"donations\":[");
                if (donationsStart == -1) return donations;
                
                donationsStart = json.IndexOf('[', donationsStart);
                int donationsEnd = json.IndexOf(']', donationsStart);
                
                if (donationsEnd == -1) return donations;
                
                string donationsArray = json.Substring(donationsStart + 1, donationsEnd - donationsStart - 1);
                
                // Split by donation objects
                string[] donationObjects = donationsArray.Split(new string[] { "},{" }, StringSplitOptions.RemoveEmptyEntries);
                
                foreach (string donationObj in donationObjects)
                {
                    string cleanObj = donationObj.Trim('{', '}', ' ');
                    DonationInfo donation = ParseSingleDonation(cleanObj);
                    if (donation != null)
                    {
                        donations.Add(donation);
                    }
                }
            }
            catch (Exception ex)
            {
                Log.write(TLog.Error, $"Error parsing donations JSON: {ex.Message}");
            }
            
            return donations;
        }

        /// <summary>
        /// Parses a single donation object from JSON
        /// </summary>
        private DonationInfo ParseSingleDonation(string donationJson)
        {
            try
            {
                DonationInfo donation = new DonationInfo();
                
                // Extract fields using simple string parsing
                donation.Amount = ExtractJsonValue(donationJson, "amount");
                donation.Currency = ExtractJsonValue(donationJson, "currency");
                donation.Alias = ExtractJsonValue(donationJson, "alias");
                donation.Message = ExtractJsonValue(donationJson, "message");
                donation.DisplayText = ExtractJsonValue(donationJson, "displayText");
                
                return donation;
            }
            catch (Exception ex)
            {
                Log.write(TLog.Error, $"Error parsing single donation: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Extracts a value from JSON string manually
        /// </summary>
        private string ExtractJsonValue(string json, string key)
        {
            string searchKey = $"\"{key}\":";
            int keyIndex = json.IndexOf(searchKey);
            if (keyIndex == -1) return "";
            
            int valueStart = keyIndex + searchKey.Length;
            
            // Skip whitespace
            while (valueStart < json.Length && char.IsWhiteSpace(json[valueStart]))
                valueStart++;
            
            if (valueStart >= json.Length) return "";
            
            // Handle null values
            if (json.Substring(valueStart).StartsWith("null"))
                return "";
            
            // Handle string values
            if (json[valueStart] == '"')
            {
                valueStart++; // Skip opening quote
                int valueEnd = json.IndexOf('"', valueStart);
                if (valueEnd == -1) return "";
                return json.Substring(valueStart, valueEnd - valueStart);
            }
            
            // Handle numeric values
            int valueEnd2 = valueStart;
            while (valueEnd2 < json.Length && 
                   (char.IsDigit(json[valueEnd2]) || json[valueEnd2] == '.' || json[valueEnd2] == '-'))
            {
                valueEnd2++;
            }
            
            return json.Substring(valueStart, valueEnd2 - valueStart);
        }

        /// <summary>
        /// Displays recent donations to all players in the arena
        /// </summary>
        public async Task DisplayRecentDonations()
        {
            List<DonationInfo> donations = await GetRecentDonations(24, 5); // Last 24 hours, max 5 donations
            
            if (donations.Count == 0)
            {
                _arena.sendArenaMessage("No recent donations to display.");
                return;
            }
            
            _arena.sendArenaMessage("=== RECENT TACTICAL SUPPORT ===", 0);
            
            foreach (DonationInfo donation in donations)
            {
                string message = $"💰 {donation.DisplayText}";
                _arena.sendArenaMessage(message, 0);
            }
            
            _arena.sendArenaMessage("Thank you for supporting the war effort!", 0);
        }

        /// <summary>
        /// Displays recent donations to a specific player
        /// </summary>
        public async Task DisplayRecentDonations(Player player)
        {
            List<DonationInfo> donations = await GetRecentDonations(24, 10); // Last 24 hours, max 10 donations
            
            if (donations.Count == 0)
            {
                player.sendMessage(-1, "No recent donations to display.");
                return;
            }
            
            player.sendMessage(0, "=== RECENT TACTICAL SUPPORT ===");
            
            foreach (DonationInfo donation in donations)
            {
                string message = $"💰 {donation.DisplayText}";
                player.sendMessage(0, message);
            }
            
            player.sendMessage(0, "Thank you for supporting the war effort!");
        }

        /// <summary>
        /// Mod command to display recent donations
        /// </summary>
        public async Task HandleDonationsCommand(Player player, string payload)
        {
            // Check if player has permission (optional)
            if (!player._developer && !player._admin)
            {
                player.sendMessage(-1, "Access denied.");
                return;
            }

            await DisplayRecentDonations(player);
        }
    }

    /// <summary>
    /// Data structure to hold donation information
    /// </summary>
    public class DonationInfo
    {
        public string Amount { get; set; } = "";
        public string Currency { get; set; } = "";
        public string Alias { get; set; } = "";
        public string Message { get; set; } = "";
        public string DisplayText { get; set; } = "";
    }
} 