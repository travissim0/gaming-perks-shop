// Add this method to your existing CTF class in CTF.cs
// This allows players to trigger the web upload using the command "*testupload"

public override bool playerModCommand(Player player, Player recipient, string command, string payload)
{
    // Handle the testupload command
    if (command.ToLower() == "testupload")
    {
        // Check if player has permission (optional - you can remove this check if you want anyone to test)
        if (player._developer || player._admin)
        {
            player.sendMessage(0, "Sending game data to website...");
            
            // Send the game data to website using the WebIntegration class
            _ = WebIntegration.SendGameDataToWebsite(_arena);
            
            player.sendMessage(0, "Game data upload triggered! Check the website for updates.");
            
            // Log the command usage
            Log.write(String.Format("Player {0} triggered testupload command", player._alias));
            
            return true; // Command handled
        }
        else
        {
            player.sendMessage(0, "You don't have permission to use this command.");
            return true;
        }
    }
    
    // If it's not our command, let the base class handle it
    return base.playerModCommand(player, recipient, command, payload);
}

// Alternative version without permission check (anyone can use it):
/*
public override bool playerModCommand(Player player, Player recipient, string command, string payload)
{
    // Handle the testupload command
    if (command.ToLower() == "testupload")
    {
        player.sendMessage(0, "Sending game data to website...");
        
        // Send the game data to website using the WebIntegration class
        _ = WebIntegration.SendGameDataToWebsite(_arena);
        
        player.sendMessage(0, "Game data upload triggered! Check the website for updates.");
        
        // Log the command usage
        Log.write(String.Format("Player {0} triggered testupload command", player._alias));
        
        return true; // Command handled
    }
    
    // If it's not our command, let the base class handle it
    return base.playerModCommand(player, recipient, command, payload);
}
*/

// USAGE INSTRUCTIONS:
// 
// 1. Add the playerModCommand method above to your CTF class
// 2. Start your website with: npm run dev
// 3. Join your Infantry Online server
// 4. Type in chat: *testupload
// 5. Check your website at http://localhost:3000 to see the live player data!
//
// The command will:
// - Use arena._name to determine game type
// - Loop through arena.Players to get all current players
// - Use player._alias for player names
// - Use player._team._name.Contains(" T") to determine teams
// - Use GetPrimarySkillName(player) to get class colors
// - Detect Squad Leaders for offense/defense determination
// - Send all this data to your website in real-time! 