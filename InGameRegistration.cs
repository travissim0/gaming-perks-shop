using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Text.RegularExpressions;

// Add this class to your Infantry Online server code
// This provides in-game registration functionality

public class InGameRegistration
{
    private static readonly HttpClient httpClient = new HttpClient();
    private const string REGISTRATION_API_ENDPOINT = "http://localhost:3000/api/in-game-register"; // Change to your actual domain in production
    
    /// <summary>
    /// Handles the ?register command for in-game registration
    /// Usage: ?register email@example.com
    /// </summary>
    public static async Task HandleRegisterCommand(Player player, string command, string payload)
    {
        try
        {
            // Parse the email from the command
            string email = payload?.Trim();
            
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
            if (alias.Length < 2)
            {
                player.sendMessage(-1, "Your alias is too short for registration. Please use a longer alias.");
                return;
            }
            
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
                Log.write(String.Format("Player {0} initiated registration with email {1}", alias, email));
            }
            else
            {
                player.sendMessage(-1, "Registration failed. Please try again later.");
                player.sendMessage(-1, "If the problem persists, contact an administrator.");
            }
        }
        catch (Exception ex)
        {
            Log.write(String.Format("Error in HandleRegisterCommand: {0}", ex.Message));
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
            
            var content = new StringContent(jsonData, Encoding.UTF8, "application/json");
            var response = await httpClient.PostAsync(REGISTRATION_API_ENDPOINT, content);
            
            if (response.IsSuccessStatusCode)
            {
                string responseContent = await response.Content.ReadAsStringAsync();
                Log.write(String.Format("Registration API response: {0}", responseContent));
                return true;
            }
            else
            {
                string errorContent = await response.Content.ReadAsStringAsync();
                Log.write(String.Format("Registration API error ({0}): {1}", response.StatusCode, errorContent));
                return false;
            }
        }
        catch (Exception ex)
        {
            Log.write(String.Format("Error sending registration request: {0}", ex.Message));
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
            
            player.sendMessage(-1, "=== REGISTRATION STATUS ===");
            player.sendMessage(-1, String.Format("Current Alias: {0}", alias));
            player.sendMessage(-1, "");
            player.sendMessage(-1, "To register for the donation system:");
            player.sendMessage(-1, "1. Use: ?register your-email@example.com");
            player.sendMessage(-1, "2. Check your email for verification link");
            player.sendMessage(-1, "3. Set your password to complete registration");
            player.sendMessage(-1, "4. Access your dashboard at the website");
            player.sendMessage(-1, "");
            player.sendMessage(-1, "Benefits of registering:");
            player.sendMessage(-1, "• Purchase exclusive donation perks");
            player.sendMessage(-1, "• Custom kill messages");
            player.sendMessage(-1, "• Special weapons and abilities");
            player.sendMessage(-1, "• Support server development");
        }
        catch (Exception ex)
        {
            Log.write(String.Format("Error in HandleCheckRegistrationCommand: {0}", ex.Message));
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