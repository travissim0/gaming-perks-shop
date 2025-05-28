using System;
using System.Threading.Tasks;
using InfServer.Game;
using InfServer.Protocol;
using InfServer.Logic;
using Assets;

namespace InfServer.Script.GameType_CTF
{
    // Example integration for CTF.cs script
    public partial class Script_CTF : Scripts.IScript
    {
        // Add this field to your existing CTF script
        private DonationDisplay _donationDisplay;

        // Add this to your existing poll() method or create a new timer
        private int _donationAnnouncementTimer = 0;
        private const int DONATION_ANNOUNCEMENT_INTERVAL = 300000; // 5 minutes in milliseconds

        /// <summary>
        /// Initialize donation display (call this in your script initialization)
        /// </summary>
        public void InitializeDonationDisplay()
        {
            _donationDisplay = new DonationDisplay(_arena);
        }

        /// <summary>
        /// Add this to your existing poll() method
        /// </summary>
        public void PollDonationAnnouncements()
        {
            _donationAnnouncementTimer += 100; // Assuming poll() is called every 100ms

            // Announce recent donations every 5 minutes
            if (_donationAnnouncementTimer >= DONATION_ANNOUNCEMENT_INTERVAL)
            {
                _donationAnnouncementTimer = 0;
                
                // Run async method without blocking
                Task.Run(async () =>
                {
                    try
                    {
                        await _donationDisplay.DisplayRecentDonations();
                    }
                    catch (Exception ex)
                    {
                        Log.write(TLog.Error, $"Error displaying donations: {ex.Message}");
                    }
                });
            }
        }

        /// <summary>
        /// Add this to your existing playerModCommand method
        /// </summary>
        public override bool playerModCommand(Player player, Player recipient, string command, string payload)
        {
            // Handle donation-related mod commands
            switch (command.ToLower())
            {
                case "donations":
                case "showdonations":
                    Task.Run(async () =>
                    {
                        try
                        {
                            await _donationDisplay.HandleDonationsCommand(player, payload);
                        }
                        catch (Exception ex)
                        {
                            Log.write(TLog.Error, $"Error in donations command: {ex.Message}");
                            player.sendMessage(-1, "Error displaying donations.");
                        }
                    });
                    return true;

                case "announcedonations":
                    if (!player._developer && !player._admin)
                    {
                        player.sendMessage(-1, "Access denied.");
                        return true;
                    }
                    
                    Task.Run(async () =>
                    {
                        try
                        {
                            await _donationDisplay.DisplayRecentDonations();
                            player.sendMessage(0, "Recent donations announced to arena.");
                        }
                        catch (Exception ex)
                        {
                            Log.write(TLog.Error, $"Error announcing donations: {ex.Message}");
                            player.sendMessage(-1, "Error announcing donations.");
                        }
                    });
                    return true;
            }

            // Continue with your existing mod command handling
            return false; // or call base.playerModCommand(player, recipient, command, payload);
        }

        /// <summary>
        /// Add this to your existing playerEnter method
        /// </summary>
        public override void playerEnter(Player player)
        {
            // Your existing playerEnter code here...

            // Optionally show recent donations to new players after a delay
            Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(5000); // Wait 5 seconds after player enters
                    
                    var donations = await _donationDisplay.GetRecentDonations(24, 3); // Last 24 hours, max 3
                    if (donations.Count > 0)
                    {
                        player.sendMessage(0, "=== RECENT TACTICAL SUPPORT ===");
                        foreach (var donation in donations)
                        {
                            player.sendMessage(0, $"💰 {donation.DisplayText}");
                        }
                        player.sendMessage(0, "Visit our website to support the server!");
                    }
                }
                catch (Exception ex)
                {
                    Log.write(TLog.Error, $"Error showing donations to new player: {ex.Message}");
                }
            });
        }

        /// <summary>
        /// Example of showing donations when a game starts
        /// </summary>
        public void OnGameStart()
        {
            // Your existing game start code...

            // Show recent donations at game start
            Task.Run(async () =>
            {
                try
                {
                    await _donationDisplay.DisplayRecentDonations();
                }
                catch (Exception ex)
                {
                    Log.write(TLog.Error, $"Error displaying donations at game start: {ex.Message}");
                }
            });
        }

        /// <summary>
        /// Example of a public command for players to see donations
        /// </summary>
        public override bool playerChatCommand(Player player, Player recipient, string command, string payload)
        {
            switch (command.ToLower())
            {
                case "donations":
                case "support":
                    Task.Run(async () =>
                    {
                        try
                        {
                            await _donationDisplay.DisplayRecentDonations(player);
                        }
                        catch (Exception ex)
                        {
                            Log.write(TLog.Error, $"Error in player donations command: {ex.Message}");
                            player.sendMessage(-1, "Error displaying donations.");
                        }
                    });
                    return true;
            }

            // Continue with your existing chat command handling
            return false; // or call base.playerChatCommand(player, recipient, command, payload);
        }
    }
} 