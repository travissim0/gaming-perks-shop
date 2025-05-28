using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

// Simple test program to send sample game data to your website
// Run this to test the integration before implementing with real game data

public class TestGameData
{
    private static readonly HttpClient httpClient = new HttpClient();
    private const string API_ENDPOINT = "http://localhost:3000/api/game-data";
    
    public static async Task Main(string[] args)
    {
        Console.WriteLine("Sending test game data to website...");
        
        try
        {
            // Manually construct JSON string (no external libraries needed)
            string jsonData = BuildTestJsonString();
            Console.WriteLine("Sending data:");
            Console.WriteLine(jsonData);
            
            // Send to API
            var content = new StringContent(jsonData, Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(API_ENDPOINT, content);
            
            if (response.IsSuccessStatusCode)
            {
                string responseContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine(string.Format("✅ Success! Server response: {0}", responseContent));
                Console.WriteLine("Check your website at http://localhost:3000 to see the updated player list!");
            }
            else
            {
                string errorContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine(string.Format("❌ Failed to send data. Status: {0}", response.StatusCode));
                Console.WriteLine(string.Format("Error: {0}", errorContent));
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine(string.Format("❌ Exception occurred: {0}", ex.Message));
        }
        
        Console.WriteLine("\nPress any key to exit...");
        Console.ReadKey();
    }
    
    private static string BuildTestJsonString()
    {
        var json = new StringBuilder();
        json.Append("{");
        json.Append("\"arenaName\":\"OvD Arena\",");
        json.Append("\"gameType\":\"OvD\",");
        json.Append("\"baseUsed\":\"Test Base Alpha\",");
        json.Append("\"players\":[");
        
        // Offense Team (Titan)
        json.Append("{\"alias\":\"Herthbul\",\"team\":\"Titan\",\"class\":\"Squad Leader\",\"isOffense\":true,\"weapon\":null},");
        json.Append("{\"alias\":\"Dinobot\",\"team\":\"Titan\",\"class\":\"Heavy Weapons\",\"isOffense\":true,\"weapon\":null},");
        json.Append("{\"alias\":\"jay\",\"team\":\"Titan\",\"class\":\"Infantry\",\"isOffense\":true,\"weapon\":null},");
        json.Append("{\"alias\":\"iron\",\"team\":\"Titan\",\"class\":\"Infantry\",\"isOffense\":true,\"weapon\":null},");
        json.Append("{\"alias\":\"Angelus\",\"team\":\"Titan\",\"class\":\"Infantry\",\"isOffense\":true,\"weapon\":null},");
        
        // Defense Team (Collective)
        json.Append("{\"alias\":\"Dilatory\",\"team\":\"Collective\",\"class\":\"Field Medic\",\"isOffense\":false,\"weapon\":null},");
        json.Append("{\"alias\":\"albert\",\"team\":\"Collective\",\"class\":\"Combat Engineer\",\"isOffense\":false,\"weapon\":null},");
        json.Append("{\"alias\":\"Axidus\",\"team\":\"Collective\",\"class\":\"Heavy Weapons\",\"isOffense\":false,\"weapon\":null},");
        json.Append("{\"alias\":\"Greed\",\"team\":\"Collective\",\"class\":\"Infantry\",\"isOffense\":false,\"weapon\":\"CAW\"},");
        json.Append("{\"alias\":\"Silly Wanker\",\"team\":\"Collective\",\"class\":\"Infantry\",\"isOffense\":false,\"weapon\":\"SG\"}");
        
        json.Append("]}");
        
        return json.ToString();
    }
}