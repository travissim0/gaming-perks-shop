using System;
using System.Linq;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

using InfServer.Logic;
using InfServer.Game;
using InfServer.Scripting;
using InfServer.Bots;
using InfServer.Protocol;
using InfServer.Script.CTFBot;

using Assets;

namespace InfServer.Script.GameType_CTF_TDM
{
    /// <summary>
    /// TDM (Team Deathmatch) game mode implementation
    /// </summary>
    class TDM
    {
        private Arena _arena;
        private int _killLimit = 50; // Default kill limit for TDM
        private bool _gameActive = false;
        private Dictionary<Team, int> _teamKills = new Dictionary<Team, int>();

        // TDM spawn coordinates (updated to correct locations)
        private const int COLLECTIVE_SPAWN_X = 1428;
        private const int COLLECTIVE_SPAWN_Y = 538;
        private const byte COLLECTIVE_SPAWN_YAW = 177;
        
        private const int TITAN_SPAWN_X = 1371;
        private const int TITAN_SPAWN_Y = 538;
        private const byte TITAN_SPAWN_YAW = 57;

        /// <summary>
        /// Constructor for TDM game mode
        /// </summary>
        /// <param name="arena">The arena object</param>
        public TDM(Arena arena)
        {
            _arena = arena;
            Initialize();
        }

        /// <summary>
        /// Initialize the TDM game mode
        /// </summary>
        private void Initialize()
        {
            _gameActive = false;
            _teamKills.Clear();
            
            // Initialize kill tracking for all teams
            foreach (Team team in _arena.Teams)
            {
                if (team.ActivePlayerCount > 0)
                {
                    _teamKills[team] = 0;
                }
            }
        }

        /// <summary>
        /// Start the TDM game
        /// </summary>
        public void StartGame()
        {
            _gameActive = true;
            _arena.sendArenaMessage("Team Deathmatch started! First team to " + _killLimit + " kills wins!", 1);
            
            // Reset all team kill counts
            foreach (Team team in _arena.Teams)
            {
                if (team.ActivePlayerCount > 0)
                {
                    _teamKills[team] = 0;
                }
            }

            // Warp all players to TDM spawn locations
            WarpAllPlayersToTDMSpawns();
        }

        /// <summary>
        /// End the TDM game
        /// </summary>
        public void EndGame()
        {
            _gameActive = false;
            _arena.sendArenaMessage("Team Deathmatch ended!", 1);
        }

        /// <summary>
        /// Handle a player kill in TDM mode
        /// </summary>
        /// <param name="victim">The player who was killed</param>
        /// <param name="killer">The player who made the kill</param>
        public void HandleKill(Player victim, Player killer)
        {
            if (!_gameActive || killer == null || killer._team == null)
                return;

            // Increment team kill count
            if (_teamKills.ContainsKey(killer._team))
            {
                _teamKills[killer._team]++;
            }
            else
            {
                _teamKills[killer._team] = 1;
            }

            // Check for victory condition
            if (_teamKills[killer._team] >= _killLimit)
            {
                _arena.sendArenaMessage(String.Format("{0} wins Team Deathmatch with {1} kills!", killer._team._name, _teamKills[killer._team]), 1);
                EndGame();
                // Don't call _arena.gameEnd() - let the CTF system handle event transitions
            }
        }

        /// <summary>
        /// Get current team scores
        /// </summary>
        /// <returns>Formatted string with team scores</returns>
        public string GetScores()
        {
            string scores = "TDM Scores: ";
            foreach (var kvp in _teamKills)
            {
                scores += String.Format("{0}: {1} ", kvp.Key._name, kvp.Value);
            }
            return scores;
        }

        /// <summary>
        /// Set the kill limit for the game
        /// </summary>
        /// <param name="limit">New kill limit</param>
        public void SetKillLimit(int limit)
        {
            _killLimit = limit;
        }

        /// <summary>
        /// Warp player to TDM spawn location based on their team
        /// </summary>
        /// <param name="player">Player to warp</param>
        public void WarpPlayerToTDMSpawn(Player player)
        {
            if (!_gameActive || player == null || player._team == null)
                return;

            // Determine spawn location based on team name
            bool isCollective = player._team._name.Contains("Collective");
            bool isTitan = player._team._name.Contains("Titan");

            if (isCollective)
            {
                // Create an ObjectState with the spawn position and yaw
                InfServer.Protocol.Helpers.ObjectState newState = new InfServer.Protocol.Helpers.ObjectState
                {
                    positionX = (short)(COLLECTIVE_SPAWN_X * 16),
                    positionY = (short)(COLLECTIVE_SPAWN_Y * 16),
                    positionZ = 0,
                    yaw = COLLECTIVE_SPAWN_YAW
                };
                
                player.warp(InfServer.Protocol.Helpers.ResetFlags.ResetNone, newState, player._state.health, 1000, COLLECTIVE_SPAWN_YAW);
            }
            else if (isTitan)
            {
                // Create an ObjectState with the spawn position and yaw
                InfServer.Protocol.Helpers.ObjectState newState = new InfServer.Protocol.Helpers.ObjectState
                {
                    positionX = (short)(TITAN_SPAWN_X * 16),
                    positionY = (short)(TITAN_SPAWN_Y * 16),
                    positionZ = 0,
                    yaw = TITAN_SPAWN_YAW
                };
                
                player.warp(InfServer.Protocol.Helpers.ResetFlags.ResetNone, newState, player._state.health, 1000, TITAN_SPAWN_YAW);
            }
        }

        /// <summary>
        /// Warp all players to their TDM spawn locations
        /// </summary>
        public void WarpAllPlayersToTDMSpawns()
        {
            if (!_gameActive)
                return;

            foreach (Player player in _arena.PlayersIngame)
            {
                WarpPlayerToTDMSpawn(player);
            }
        }

        /// <summary>
        /// Check if the game is currently active
        /// </summary>
        public bool IsGameActive
        {
            get { return _gameActive; }
        }

        /// <summary>
        /// Check if TDM has finished (victory achieved)
        /// </summary>
        public bool HasFinished
        {
            get 
            { 
                return !_gameActive && _teamKills.Values.Any(kills => kills >= _killLimit);
            }
        }
    }

    class Script_TDM : Scripts.IScript
    {
        ///////////////////////////////////////////////////
        // Member Variables
        ///////////////////////////////////////////////////
        private Arena _arena;                   //Pointer to our arena class
        private CfgInfo _config;                //The zone config
        private TDM _tdm;                       //TDM game mode instance

        private int _jackpot;                   //The game's jackpot so far
        private Team _victoryTeam;              //The team currently winning!
        private int _tickVictoryStart;          //The tick at which the victory countdown began
        private int _tickNextVictoryNotice;     //The tick at which we will next indicate imminent victory
        private int _victoryNotice;             //The number of victory notices we've done

        private int _lastGameCheck;             //The tick at which we last checked for game viability
        private int _tickGameStarting;          //The tick at which the game began starting (0 == not initiated)
        private int _tickGameStart;             //The tick at which the game started (0 == stopped)

        // CTFBot spawning system adapted from TheArena
        public List<Bot> _ctfBots;              //List of active CTF bots
        private int _tickLastBotSpawn;          //Last time we spawned a bot
        private Random _rand;                   //Random number generator
        private const int BOT_SPAWN_MIN_INTERVAL = 2000;   // 2 seconds minimum
        private const int BOT_SPAWN_MAX_INTERVAL = 4000;   // 4 seconds maximum 
        private const int MAX_BOTS_PER_TEAM = 5;           // Maximum 5 bots per team (10 total)
        
        // TDM spawn coordinates (copied from TDM class for Script_TDM access)
        private const int COLLECTIVE_SPAWN_X = 1428;
        private const int COLLECTIVE_SPAWN_Y = 538;
        private const byte COLLECTIVE_SPAWN_YAW = 177;
        private const int TITAN_SPAWN_X = 1371;
        private const int TITAN_SPAWN_Y = 538;
        private const byte TITAN_SPAWN_YAW = 57;
        
        // Bot skill levels adapted from TheArena
        public enum BotSkillLevel
        {
            Weak = 1,
            Average = 2,
            Strong = 3,
            Elite = 4
        }

        ///////////////////////////////////////////////////
        // Member Functions
        ///////////////////////////////////////////////////
        /// <summary>
        /// Performs script initialization
        /// </summary>
        public bool init(IEventObject invoker)
        {
            //Populate our variables
            _arena = invoker as Arena;
            _config = _arena._server._zoneConfig;

            //Initialize TDM
            _tdm = new TDM(_arena);

            //Initialize bot spawning system
            _ctfBots = new List<Bot>();
            _rand = new Random();
            _tickLastBotSpawn = 0;

            return true;
        }

        /// <summary>
        /// Allows the script to maintain itself
        /// </summary>
        public bool poll()
        {
            //Should we check game state yet?
            int now = Environment.TickCount;

            if (now - _lastGameCheck <= Arena.gameCheckInterval)
                return true;
            _lastGameCheck = now;

            //Do we have enough players ingame?
            int playing = _arena.PlayerCount;

            //Is the game running?
            if (_arena._bGameRunning)
            {
                //Check for victory conditions if TDM is active
                if (_tdm.IsGameActive)
                {
                    // Victory checking is handled in HandleKill
                    
                    // Handle CTFBot spawning and management
                    handleBotSpawning(now);
                    manageBots(now);
                }

                return true;
            }

            //Check to see if we're ready to start a game
            if (!_arena._bGameRunning)
                return true;

            //Start a game!
            _arena.gameStart();
            return true;
        }

        /// <summary>
        /// Called when the game begins
        /// </summary>
        [Scripts.Event("Game.Start")]
        public bool gameStart()
        {
            //We've started!
            _tickGameStart = Environment.TickCount;
            _tickGameStarting = 0;

            //Let everyone know
            _arena.sendArenaMessage("Game has started!", 1);

            //Start TDM mode
            _tdm.StartGame();

            return true;
        }

        /// <summary>
        /// Called when the game ends
        /// </summary>
        [Scripts.Event("Game.End")]
        public bool gameEnd()
        {
            //Game finished, perhaps start a new one
            _tickGameStart = 0;
            _tickGameStarting = 0;
            _tickVictoryStart = 0;

            //End TDM mode
            _tdm.EndGame();

            return true;
        }

        /// <summary>
        /// Called when a player dies
        /// </summary>
        [Scripts.Event("Player.PlayerKill")]
        public bool playerPlayerKill(Player victim, Player killer)
        {
            //Handle the kill in TDM mode
            _tdm.HandleKill(victim, killer);

            return true;
        }

        /// <summary>
        /// Handles a player's chat command
        /// </summary>
        [Scripts.Event("Player.ChatCommand")]
        public bool playerChatCommand(Player player, Player recipient, string command, string payload)
        {
            if (command.ToLower() == "tdmscore" || command.ToLower() == "score")
            {
                player.sendMessage(0, _tdm.GetScores());
                return true;
            }

            if (command.ToLower() == "tdmlimit" && player.PermissionLevelLocal >= Data.PlayerPermission.ArenaMod)
            {
                int limit;
                if (int.TryParse(payload, out limit) && limit > 0)
                {
                    _tdm.SetKillLimit(limit);
                    _arena.sendArenaMessage("TDM kill limit set to " + limit, 1);
                }
                else
                {
                    player.sendMessage(0, "Usage: ?tdmlimit [number]");
                }
                return true;
            }

            // ===== BOT DEBUGGING COMMANDS =====
            if (command.ToLower() == "botcount")
            {
                var aliveBots = _ctfBots.Where(b => !b.IsDead).ToList();
                var collectiveBots = aliveBots.Where(b => b._team != null && (b._team._name.Contains("Collective") || b._team._name.Contains("- C"))).Count();
                var titanBots = aliveBots.Where(b => b._team != null && (b._team._name.Contains("Titan") || b._team._name.Contains("- T"))).Count();
                
                player.sendMessage(0, String.Format("CTFBots: Collective={0}, Titan={1}, Total={2}/{3}", 
                    collectiveBots, titanBots, aliveBots.Count, _ctfBots.Count));
                return true;
            }

            if (command.ToLower() == "botinfo")
            {
                var aliveBots = _ctfBots.Where(b => !b.IsDead).ToList();
                if (aliveBots.Count == 0)
                {
                    player.sendMessage(0, "No active CTFBots found");
                    return true;
                }

                foreach (var bot in aliveBots.Take(5)) // Show max 5 bots
                {
                    string teamName = bot._team != null ? bot._team._name : "NO TEAM";
                    string botName = bot._type.Name != null ? bot._type.Name : "CTFBot";
                    player.sendMessage(0, String.Format("Bot: {0} Team={1} Pos=({2},{3}) Vehicle={4} HP={5}", 
                        botName, teamName, bot._state.positionX/16, bot._state.positionY/16, 
                        bot._type.Id, bot._state.health));
                }
                return true;
            }

            if (command.ToLower() == "botspawn" && player.PermissionLevelLocal >= Data.PlayerPermission.ArenaMod)
            {
                if (!_tdm.IsGameActive)
                {
                    player.sendMessage(0, "TDM game must be active to spawn bots");
                    return true;
                }

                // Manually spawn a bot for testing
                var collectiveTeam = getTeamByName("Collective");
                var titanTeam = getTeamByName("Titan");
                
                Team targetTeam = null;
                if (payload.ToLower().Contains("collective") && collectiveTeam != null)
                {
                    targetTeam = collectiveTeam;
                }
                else if (payload.ToLower().Contains("titan") && titanTeam != null)
                {
                    targetTeam = titanTeam;
                }
                else
                {
                    targetTeam = getTeamWithFewestBots();
                }

                if (targetTeam != null)
                {
                    spawnCTFBotForTeam(targetTeam);
                    player.sendMessage(0, "Manually spawned CTFBot for team: " + targetTeam._name);
                }
                else
                {
                    player.sendMessage(0, "No valid team found for bot spawning");
                }
                return true;
            }

            if (command.ToLower() == "botkill" && player.PermissionLevelLocal >= Data.PlayerPermission.ArenaMod)
            {
                int killed = 0;
                foreach (var bot in _ctfBots.Where(b => !b.IsDead).ToList())
                {
                    bot.kill(null);
                    killed++;
                }
                player.sendMessage(0, String.Format("Killed {0} CTFBots", killed));
                return true;
            }

            if (command.ToLower() == "botdebug" && player.PermissionLevelLocal >= Data.PlayerPermission.ArenaMod)
            {
                player.sendMessage(0, String.Format("Bot Debug Info:"));
                player.sendMessage(0, String.Format("- TDM Active: {0}", _tdm.IsGameActive));
                player.sendMessage(0, String.Format("- Last Bot Spawn: {0}ms ago", Environment.TickCount - _tickLastBotSpawn));
                player.sendMessage(0, String.Format("- Spawn Interval: {0}-{1}ms", BOT_SPAWN_MIN_INTERVAL, BOT_SPAWN_MAX_INTERVAL));
                player.sendMessage(0, String.Format("- Max Bots Per Team: {0}", MAX_BOTS_PER_TEAM));
                player.sendMessage(0, String.Format("- Collective Spawn: ({0}, {1})", COLLECTIVE_SPAWN_X, COLLECTIVE_SPAWN_Y));
                player.sendMessage(0, String.Format("- Titan Spawn: ({0}, {1})", TITAN_SPAWN_X, TITAN_SPAWN_Y));
                
                // Check if vehicles exist
                var vehicle301 = _arena._server._assets.getVehicleByID(301);
                var vehicle129 = _arena._server._assets.getVehicleByID(129);
                player.sendMessage(0, String.Format("- Vehicle 301: {0}", vehicle301 != null ? "FOUND" : "NOT FOUND"));
                player.sendMessage(0, String.Format("- Vehicle 129: {0}", vehicle129 != null ? "FOUND" : "NOT FOUND"));
                
                return true;
            }

            return false;
        }

        ///////////////////////////////////////////////////
        // CTFBot Spawning System (adapted from TheArena)
        ///////////////////////////////////////////////////
        
        /// <summary>
        /// Handles CTFBot spawning logic
        /// </summary>
        private void handleBotSpawning(int now)
        {
            // Don't spawn too frequently
            int timeSinceLastSpawn = now - _tickLastBotSpawn;
            if (timeSinceLastSpawn < BOT_SPAWN_MIN_INTERVAL)
            {
                // Only log occasionally to avoid spam
                if (timeSinceLastSpawn % 5000 == 0) // Every 5 seconds
                {
                    Console.WriteLine(String.Format("[TDM BOT DEBUG] Spawn cooldown: {0}ms remaining", 
                        BOT_SPAWN_MIN_INTERVAL - timeSinceLastSpawn));
                }
                return;
            }

            // Check if TDM is active
            if (!_tdm.IsGameActive)
            {
                Console.WriteLine("[TDM BOT DEBUG] TDM not active, skipping bot spawn");
                return;
            }

            // Count alive bots per team
            var aliveBots = _ctfBots.Where(b => !b.IsDead).ToList();
            var collectiveBots = aliveBots.Where(b => b._team != null && (b._team._name.Contains("Collective") || b._team._name.Contains("- C"))).Count();
            var titanBots = aliveBots.Where(b => b._team != null && (b._team._name.Contains("Titan") || b._team._name.Contains("- T"))).Count();
            
            Console.WriteLine(String.Format("[TDM BOT DEBUG] Bot count check - Collective: {0}/{1}, Titan: {2}/{3}, Total: {4}", 
                collectiveBots, MAX_BOTS_PER_TEAM, titanBots, MAX_BOTS_PER_TEAM, aliveBots.Count));

            // Determine which team needs more bots
            Team targetTeam = null;
            string reason = "";
            
            if (collectiveBots < MAX_BOTS_PER_TEAM)
            {
                targetTeam = getTeamByName("Collective");
                reason = String.Format("Collective needs bots ({0}/{1})", collectiveBots, MAX_BOTS_PER_TEAM);
            }
            else if (titanBots < MAX_BOTS_PER_TEAM)
            {
                targetTeam = getTeamByName("Titan");
                reason = String.Format("Titan needs bots ({0}/{1})", titanBots, MAX_BOTS_PER_TEAM);
            }

            // If no team needs bots, we're done
            if (targetTeam == null)
            {
                Console.WriteLine(String.Format("[TDM BOT DEBUG] No team needs bots - both at max ({0} each)", MAX_BOTS_PER_TEAM));
                return;
            }

            Console.WriteLine(String.Format("[TDM BOT DEBUG] Spawning bot for team '{0}' - Reason: {1}", targetTeam._name, reason));

            // Spawn bot for the team that needs one
            spawnCTFBotForTeam(targetTeam);
            
            _tickLastBotSpawn = now;
        }

        /// <summary>
        /// Gets team by name (supports partial matching)
        /// </summary>
        private Team getTeamByName(string teamName)
        {
            foreach (Team team in _arena.Teams)
            {
                if (team._name.Contains(teamName))
                    return team;
            }
            return null;
        }

        /// <summary>
        /// Spawns a CTFBot for specific team
        /// </summary>
        private void spawnCTFBotForTeam(Team targetTeam)
        {
            try
            {
                // Determine bot skill level (use default for now)
                BotSkillLevel skillLevel = BotSkillLevel.Average;

                // Find safe spawn location based on team spawn points
                InfServer.Protocol.Helpers.ObjectState botState = new InfServer.Protocol.Helpers.ObjectState();
                
                // Use team-specific spawn locations
                if (targetTeam._name.Contains("Collective") || targetTeam._name.Contains("- C"))
                {
                    // Collective spawn area with some randomization
                    int randomX = _rand.Next(-100, 100); // Reduced randomization to stay closer to spawn
                    int randomY = _rand.Next(-100, 100);
                    botState.positionX = (short)(COLLECTIVE_SPAWN_X * 16 + randomX);
                    botState.positionY = (short)(COLLECTIVE_SPAWN_Y * 16 + randomY);
                    botState.yaw = COLLECTIVE_SPAWN_YAW; // REVERTED: Fixed spawn direction (good)
                    Console.WriteLine(String.Format("[TDM BOT DEBUG] Collective bot spawn: ({0},{1}) = pixel ({2},{3})", 
                        COLLECTIVE_SPAWN_X, COLLECTIVE_SPAWN_Y, botState.positionX, botState.positionY));
                }
                else if (targetTeam._name.Contains("Titan") || targetTeam._name.Contains("- T"))
                {
                    // Titan spawn area with some randomization
                    int randomX = _rand.Next(-100, 100); // Reduced randomization to stay closer to spawn
                    int randomY = _rand.Next(-100, 100);
                    botState.positionX = (short)(TITAN_SPAWN_X * 16 + randomX);
                    botState.positionY = (short)(TITAN_SPAWN_Y * 16 + randomY);
                    botState.yaw = TITAN_SPAWN_YAW; // REVERTED: Fixed spawn direction (good)
                    Console.WriteLine(String.Format("[TDM BOT DEBUG] Titan bot spawn: ({0},{1}) = pixel ({2},{3})", 
                        TITAN_SPAWN_X, TITAN_SPAWN_Y, botState.positionX, botState.positionY));
                }
                else
                {
                    // Fallback to center of map
                    botState.positionX = (short)(200 * 16 + _rand.Next(-400, 400));
                    botState.positionY = (short)(200 * 16 + _rand.Next(-400, 400));
                    botState.yaw = (byte)_rand.Next(0, 360);
                    Console.WriteLine(String.Format("[TDM BOT DEBUG] Fallback bot spawn: center map at pixel ({0},{1})", 
                        botState.positionX, botState.positionY));
                }

                // Get CTFBot vehicle (alternating between 301 and 129)
                VehInfo.Car botVehicle = getCTFBotVehicleType(skillLevel);
                if (botVehicle == null) 
                {
                    _arena.sendArenaMessage("&CTFBot spawn failed: Vehicle not found", 1);
                    return;
                }

                // Create the CTFBot using the CTF bot script
                Bot bot = _arena.newBot(typeof(InfServer.Script.CTFBot.CTFBot), botVehicle, targetTeam, null, botState, null) as Bot;
                
                if (bot != null)
                {
                    // Give bot full health and energy
                    bot._state.health = (short)bot._type.Hitpoints;
                    bot._state.energy = (short)600; // Default energy amount
                    
                    // Equip bot with default weapon
                    equipBotWithDefaultWeapon(bot);
                    
                    _ctfBots.Add(bot);
                    
                    Console.WriteLine("[TDM BOT DEBUG] Successfully spawned CTFBot for team " + targetTeam._name + " at (" + botState.positionX + ", " + botState.positionY + ")");
                    _arena.sendArenaMessage(String.Format("&CTFBot spawned for {0} team! Active bots: {1}", targetTeam._name, _ctfBots.Count(b => !b.IsDead)), 1);
                }
                else
                {
                    _arena.sendArenaMessage("&Failed to create CTFBot - bot is null!", 1);
                }
            }
            catch (Exception e)
            {
                _arena.sendArenaMessage(String.Format("Error spawning CTFBot: {0}", e.Message), 1);
                Console.WriteLine("[TDM BOT ERROR] Exception spawning bot: " + e.ToString());
            }
        }

        /// <summary>
        /// Spawns a CTFBot for TDM combat using vehicles 301 and 129 (legacy method)
        /// </summary>
        private void spawnCTFBotForCombat(Player referencePlayer)
        {
            try
            {
                // Determine bot skill level based on player
                int playerLevel = getPlayerWeaponLevel(referencePlayer);
                BotSkillLevel skillLevel = determineBotSkillLevel(playerLevel);

                // Get team with fewest bots for balance
                Team botTeam = getTeamWithFewestBots();
                if (botTeam == null)
                    return;

                // Find safe spawn location
                InfServer.Protocol.Helpers.ObjectState botState = new InfServer.Protocol.Helpers.ObjectState();
                bool safeSpawnFound = false;
                int attempts = 0;
                int maxAttempts = 10;
                
                while (!safeSpawnFound && attempts < maxAttempts)
                {
                    int spawnRadius = 300 + (attempts * 50);
                    short spawnX = (short)(referencePlayer._state.positionX + _rand.Next(-spawnRadius, spawnRadius));
                    short spawnY = (short)(referencePlayer._state.positionY + _rand.Next(-spawnRadius, spawnRadius));
                    
                    // Check if spawn location is safe
                    bool locationSafe = true;
                    foreach (var existingVehicle in _arena.Vehicles)
                    {
                        if (existingVehicle != null && !existingVehicle.IsDead)
                        {
                            double distance = InfServer.Protocol.Helpers.distanceTo(spawnX, spawnY, existingVehicle._state.positionX, existingVehicle._state.positionY);
                            if (distance < 150)
                            {
                                locationSafe = false;
                                break;
                            }
                        }
                    }
                    
                    if (locationSafe)
                    {
                        botState.positionX = spawnX;
                        botState.positionY = spawnY;
                        safeSpawnFound = true;
                    }
                    
                    attempts++;
                }
                
                // Fallback spawn location
                if (!safeSpawnFound)
                {
                    botState.positionX = (short)(referencePlayer._state.positionX + _rand.Next(-200, 200));
                    botState.positionY = (short)(referencePlayer._state.positionY + _rand.Next(-200, 200));
                }

                // Get CTFBot vehicle (alternating between 301 and 129)
                VehInfo.Car botVehicle = getCTFBotVehicleType(skillLevel);
                if (botVehicle == null) 
                {
                    _arena.sendArenaMessage("&CTFBot spawn failed: Vehicle not found", 1);
                    return;
                }

                // Create the CTFBot using the CTF bot script
                Bot bot = _arena.newBot(typeof(InfServer.Script.CTFBot.CTFBot), botVehicle, botTeam, null, botState, null) as Bot;
                
                if (bot != null)
                {
                    // Give bot full health
                    bot._state.health = (short)bot._type.Hitpoints;
                    
                    // Equip bot with weapon
                    equipBotWithMatchingWeapon(bot, referencePlayer);
                    
                    _ctfBots.Add(bot);
                    
                    // Show spawn message occasionally
                    if (_ctfBots.Count % 3 == 1)
                    {
                        _arena.sendArenaMessage(String.Format("&CTFBots active: {0}", _ctfBots.Count(b => !b.IsDead)), 1);
                    }
                }
                else
                {
                    _arena.sendArenaMessage("&Failed to create CTFBot - bot is null!", 1);
                }
            }
            catch (Exception e)
            {
                _arena.sendArenaMessage(String.Format("Error spawning CTFBot: {0}", e.Message), 1);
            }
        }

        /// <summary>
        /// Manages existing bots and removes dead ones
        /// </summary>
        private void manageBots(int now)
        {
            // Remove dead bots
            var deadBots = _ctfBots.Where(bot => bot.IsDead).ToList();
            foreach (var deadBot in deadBots)
            {
                _ctfBots.Remove(deadBot);
            }

            // Check for bots with invalid states
            var aliveBots = _ctfBots.Where(bot => !bot.IsDead).ToList();
            foreach (var bot in aliveBots)
            {
                if (bot._state.health <= 0)
                {
                    bot.kill(null);
                }
            }
        }

        /// <summary>
        /// Gets CTFBot vehicle type using vehicles 301 and 129
        /// </summary>
        private VehInfo.Car getCTFBotVehicleType(BotSkillLevel skillLevel)
        {
            // Alternate between vehicles 301 and 129 based on current bot count
            int vehicleId = (_ctfBots.Count % 2 == 0) ? 301 : 129;
            
            return _arena._server._assets.getVehicleByID(vehicleId) as VehInfo.Car;
        }

        /// <summary>
        /// Determines bot skill level based on player level
        /// </summary>
        private BotSkillLevel determineBotSkillLevel(int playerLevel)
        {
            if (playerLevel <= 2)
                return BotSkillLevel.Weak;
            else if (playerLevel <= 5)
                return BotSkillLevel.Average;
            else if (playerLevel <= 8)
                return BotSkillLevel.Strong;
            else
                return BotSkillLevel.Elite;
        }

        /// <summary>
        /// Gets player weapon level (simplified version)
        /// </summary>
        private int getPlayerWeaponLevel(Player player)
        {
            try
            {
                if (player._inventory != null)
                {
                    foreach (var item in player._inventory)
                    {
                        if (item.Value != null && item.Value.item != null && item.Value.item is ItemInfo.Projectile)
                        {
                            var weaponInfo = item.Value.item as ItemInfo.Projectile;
                            int level = extractWeaponLevelFromName(weaponInfo.name);
                            return level;
                        }
                    }
                }
                return 1; // Default to level 1
            }
            catch (Exception)
            {
                return 1; // Default to level 1 on error
            }
        }

        /// <summary>
        /// Extract level number from weapon name
        /// </summary>
        private int extractWeaponLevelFromName(string weaponName)
        {
            if (String.IsNullOrEmpty(weaponName))
                return 1;
                
            var parts = weaponName.Split(' ');
            if (parts.Length >= 2)
            {
                int level;
                if (int.TryParse(parts[parts.Length - 1], out level))
                {
                    return Math.Max(1, Math.Min(10, level));
                }
            }
            
            return 1;
        }

        /// <summary>
        /// Equips bot with default weapon setup
        /// </summary>
        private void equipBotWithDefaultWeapon(Bot bot)
        {
            try
            {
                // Give bot a basic assault rifle as primary weapon
                var ar = findWeaponByName("Maklov AR mk 606");
                if (ar != null)
                {
                    bot._weapon.equip(ar);
                    Console.WriteLine("[TDM BOT DEBUG] Equipped bot with " + ar.name);
                }
                else
                {
                    // Try alternative weapon names
                    var fallbackWeapon = findWeaponByName("Projectile 1");
                    if (fallbackWeapon != null)
                    {
                        bot._weapon.equip(fallbackWeapon);
                        Console.WriteLine("[TDM BOT DEBUG] Equipped bot with fallback weapon: " + fallbackWeapon.name);
                    }
                    else
                    {
                        Console.WriteLine("[TDM BOT ERROR] No suitable weapon found for bot");
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine("[TDM BOT ERROR] Failed to equip bot with default weapons: " + e.Message);
            }
        }

        /// <summary>
        /// Equip bot with basic weapon
        /// </summary>
        private void equipBotWithMatchingWeapon(Bot bot, Player referencePlayer)
        {
            try
            {
                // Get player's weapon level
                int playerWeaponLevel = getPlayerWeaponLevel(referencePlayer);
                
                // Calculate bot weapon level (±1 level from player)
                int minLevel = Math.Max(1, playerWeaponLevel - 1);
                int maxLevel = Math.Min(10, playerWeaponLevel + 1);
                int selectedLevel = _rand.Next(minLevel, maxLevel + 1);
                
                // Simple weapon types for TDM
                string[] weaponTypes = { "Projectile", "Psionic" };
                string selectedType = weaponTypes[_rand.Next(weaponTypes.Length)];
                
                string weaponName = String.Format("{0} {1}", selectedType, selectedLevel);
                
                // Find and equip weapon
                var weaponItem = findWeaponByName(weaponName);
                if (weaponItem != null)
                {
                    bot._weapon.equip(weaponItem);
                }
                else
                {
                    // Fallback to basic weapon
                    var fallbackWeapon = findWeaponByName("Projectile 1");
                    if (fallbackWeapon != null)
                    {
                        bot._weapon.equip(fallbackWeapon);
                    }
                }
            }
            catch (Exception)
            {
                // Silently handle weapon equip errors
            }
        }

        /// <summary>
        /// Find weapon item by name
        /// </summary>
        private ItemInfo findWeaponByName(string weaponName)
        {
            try
            {
                var allItems = AssetManager.Manager.getItems;
                foreach (var item in allItems)
                {
                    if (item.name.Equals(weaponName, StringComparison.OrdinalIgnoreCase))
                    {
                        return item;
                    }
                }
                return null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>
        /// Gets the team with fewest bots for balance
        /// </summary>
        private Team getTeamWithFewestBots()
        {
            var availableTeams = _arena.Teams.Where(t => !t.IsSpec && t._name != "spec").ToList();
            
            if (availableTeams.Count == 0)
                return _arena.getTeamByName("spec");
            
            // Count bots on each team
            var teamBotCounts = availableTeams.ToDictionary(
                team => team, 
                team => _ctfBots.Count(b => !b.IsDead && b._team == team)
            );
            
            int minBotCount = teamBotCounts.Values.Min();
            
            var teamsWithFewestBots = teamBotCounts
                .Where(kvp => kvp.Value == minBotCount)
                .Select(kvp => kvp.Key)
                .ToList();
            
            return teamsWithFewestBots[_rand.Next(teamsWithFewestBots.Count)];
        }

        #region Unused Events
        [Scripts.Event("Game.Reset")]
        public bool gameReset()
        {
            return true;
        }

        [Scripts.Event("Player.Enter")]
        public bool playerEnter(Player player)
        {
            return true;
        }

        [Scripts.Event("Player.Leave")]
        public bool playerLeave(Player player)
        {
            return true;
        }

        [Scripts.Event("Player.JoinGame")]
        public bool playerJoinGame(Player player)
        {
            return true;
        }

        [Scripts.Event("Player.LeaveGame")]
        public bool playerLeaveGame(Player player)
        {
            return true;
        }

        [Scripts.Event("Player.Spawn")]
        public bool playerSpawn(Player player, bool bDeath)
        {
            // Warp player to TDM spawn if TDM is active
            if (_tdm.IsGameActive)
            {
                _tdm.WarpPlayerToTDMSpawn(player);
            }
            return true;
        }

        [Scripts.Event("Player.Death")]
        public bool playerDeath(Player victim, Player killer, InfServer.Protocol.Helpers.KillType killType, CS_VehicleDeath update)
        {
            return true;
        }

        [Scripts.Event("Player.WarpItem")]
        public bool playerWarpItem(Player player, ItemInfo.WarpItem item, ushort targetPlayerID, short posX, short posY)
        {
            // Handle dropship recall - warp player to TDM spawn if TDM is active
            if (_tdm.IsGameActive)
            {
                _tdm.WarpPlayerToTDMSpawn(player);
            }
            return true;
        }
        #endregion
    }
} 