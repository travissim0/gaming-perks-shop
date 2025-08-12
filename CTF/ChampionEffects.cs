using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using InfServer.Game;
using InfServer.Protocol;
using Assets;

namespace InfServer.Script.GameType_CTF
{
    /// <summary>
    /// Champion Effects System - Handles player-specific cosmetic effects
    /// </summary>
    class ChampionEffects
    {
        #region Members
        private Arena _arena;
        private Script_CTF _script;
        private Dictionary<string, ChampionConfig> _championsByAlias;
        private string _currentSeason;
        private bool _enabled;
        
        // Teleport beacon tracking
        private Dictionary<Player, TeleportBeaconTracker> _activeBeacons;
        private const int BEACON_DURATION_MS = 60000; // 60 seconds
        private const int MAX_WALKING_SPEED_PER_SECOND = 200; // Approximate max walking speed in pixels/second
        private const int POSITION_CHECK_INTERVAL_MS = 100; // Check every 100ms
        
        // Effect Types
        public enum EffectType
        {
            Explosion,  // Text on weapon explosion/contact
            Death,      // Text on kill
            Warp        // Text on warp
        }
        
        // Teleport beacon tracking class
        private class TeleportBeaconTracker
        {
            public int BeaconSetTime { get; set; }
            public short LastKnownX { get; set; }
            public short LastKnownY { get; set; }
            public int LastPositionCheckTime { get; set; }
            
            public TeleportBeaconTracker(short x, short y)
            {
                BeaconSetTime = Environment.TickCount;
                LastKnownX = x;
                LastKnownY = y;
                LastPositionCheckTime = Environment.TickCount;
            }
            
            public bool IsExpired()
            {
                return (Environment.TickCount - BeaconSetTime) > BEACON_DURATION_MS;
            }
        }
        #endregion

        #region Configuration Classes
        class ChampionConfig
        {
            public string PlayerName { get; set; }
            public List<string> Aliases { get; set; }
            public string WeaponName { get; set; }  // null for non-weapon effects
            public string TextPhrase { get; set; }
            public string EffectType { get; set; }  // "Explosion", "Death", "Warp"
        }
        #endregion

        #region Initialization
        public ChampionEffects(Arena arena, Script_CTF script, string season = "CTFDL4")
        {
            _arena = arena;
            _script = script;
            _currentSeason = season;
            _championsByAlias = new Dictionary<string, ChampionConfig>(StringComparer.OrdinalIgnoreCase);
            _activeBeacons = new Dictionary<Player, TeleportBeaconTracker>();
            _enabled = true;
            
            LoadSeasonConfiguration();
        }

        private void LoadSeasonConfiguration()
        {
            try
            {
                string configPath = String.Format("scripts/GameTypes/CTF/Seasons/{0}.cfg", _currentSeason);
                
                if (!File.Exists(configPath))
                {
                    Console.WriteLine(String.Format("[ChampionEffects] Season config not found: {0}", configPath));
                    return;
                }

                string[] lines = File.ReadAllLines(configPath);
                List<ChampionConfig> champions = new List<ChampionConfig>();

                // Parse simple config format: PlayerName|Alias1,Alias2|WeaponName|TextPhrase|EffectType
                foreach (string line in lines)
                {
                    if (String.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
                        continue; // Skip empty lines and comments

                    string[] parts = line.Split('|');
                    if (parts.Length != 5)
                        continue; // Skip invalid lines

                    var champion = new ChampionConfig
                    {
                        PlayerName = parts[0].Trim(),
                        Aliases = parts[1].Split(',').Select(a => a.Trim()).ToList(),
                        WeaponName = String.IsNullOrWhiteSpace(parts[2]) ? null : parts[2].Trim(),
                        TextPhrase = parts[3].Trim(),
                        EffectType = parts[4].Trim()
                    };

                    champions.Add(champion);
                }

                // Build alias lookup dictionary
                _championsByAlias.Clear();
                foreach (var champion in champions)
                {
                    if (champion.Aliases != null)
                    {
                        foreach (string alias in champion.Aliases)
                        {
                            _championsByAlias[alias] = champion;
                        }
                    }
                }

                Console.WriteLine(String.Format("[ChampionEffects] Loaded {0} champions for season {1}", 
                    champions.Count, _currentSeason));
                    
                // Debug: List loaded champions
                foreach (var kvp in _championsByAlias)
                {
                    Console.WriteLine(String.Format("[ChampionEffects] {0} -> {1} ({2}) [{3}]", 
                        kvp.Key, kvp.Value.PlayerName, kvp.Value.WeaponName ?? "Any", kvp.Value.EffectType));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("[ChampionEffects] Error loading season config: {0}", ex.Message));
            }
        }
        #endregion

        #region Public Methods
        public void ReloadConfiguration()
        {
            LoadSeasonConfiguration();
        }

        public string GetCurrentSeason()
        {
            return _currentSeason;
        }

        public int GetChampionCount()
        {
            return _championsByAlias.Values.Distinct().Count();
        }

        public void SetEnabled(bool enabled)
        {
            _enabled = enabled;
        }
        #endregion

        #region Event Handlers
        /// <summary>
        /// Handle weapon explosion effects
        /// </summary>
        public void HandleWeaponExplosion(Player from, Vehicle vehicle, ItemInfo.Projectile weapon, short posX, short posY)
        {
            if (!_enabled || !_script.IsChampEnabled || from == null || weapon == null)
                return;
                
            //Console.WriteLine(String.Format("[ChampionEffects] Explosion: {0} using {1}", from._alias, weapon.name));
            
            ChampionConfig config;
            if (!_championsByAlias.TryGetValue(from._alias, out config))
            {
                //Console.WriteLine(String.Format("[ChampionEffects] No config found for player: {0}", from._alias));
                return;
            }

            Console.WriteLine(String.Format("[ChampionEffects] Config found: {0} -> {1} ({2})", from._alias, config.WeaponName, config.EffectType));

            if (config.EffectType != "Explosion")
            {
                Console.WriteLine(String.Format("[ChampionEffects] Not an explosion effect: {0}", config.EffectType));
                return;
            }

            // Check if weapon matches (if specified)
            if (!String.IsNullOrEmpty(config.WeaponName) && 
                !weapon.name.Equals(config.WeaponName, StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine(String.Format("[ChampionEffects] Weapon mismatch: {0} vs {1}", weapon.name, config.WeaponName));
                return;
            }

            Console.WriteLine(String.Format("[ChampionEffects] Creating text explosion: {0}", config.TextPhrase));
            // Create text explosion at weapon impact location
            CreateTextExplosion(config.TextPhrase, posX, posY, 48, from);
        }

        /// <summary>
        /// Handle player death effects
        /// </summary>
        public void HandlePlayerDeath(Player victim, Player killer)
        {
            if (!_enabled || !_script.IsChampEnabled || killer == null)
                return;

            ChampionConfig config;
            if (!_championsByAlias.TryGetValue(killer._alias, out config))
                return;

            if (config.EffectType != "Death")
                return;

            // Create text explosion at victim's death location
            CreateTextExplosion(config.TextPhrase, victim._state.positionX, victim._state.positionY, 48, killer);
        }

        /// <summary>
        /// Handle player warp effects - detects teleport beacon setting and starts tracking
        /// </summary>
        public void HandlePlayerWarp(Player player, short posX, short posY)
        {
            if (!_enabled || !_script.IsChampEnabled || player == null)
                return;
                
            // Check if this player has a warp champion effect configured
            ChampionConfig config;
            if (!_championsByAlias.TryGetValue(player._alias, out config) || config.EffectType != "Warp")
                return;

            // This method is called when a warp item is used, which includes teleport beacon setting
            // Start tracking this player for dramatic position changes over the next 60 seconds
            Console.WriteLine(String.Format("[ChampionEffects] Starting teleport beacon tracking for {0} at ({1}, {2})", 
                player._alias, player._state.positionX, player._state.positionY));
                
            // Store current position and start tracking
            _activeBeacons[player] = new TeleportBeaconTracker(player._state.positionX, player._state.positionY);
        }
        
        /// <summary>
        /// Check all players with active teleport beacons for dramatic position changes
        /// This should be called periodically from the main script's poll method
        /// </summary>
        public void CheckTeleportBeaconActivations()
        {
            if (!_enabled || !_script.IsChampEnabled)
                return;
                
            var playersToRemove = new List<Player>();
            
            foreach (var kvp in _activeBeacons)
            {
                Player player = kvp.Key;
                TeleportBeaconTracker tracker = kvp.Value;
                
                // Remove expired trackers
                if (tracker.IsExpired())
                {
                    playersToRemove.Add(player);
                    Console.WriteLine(String.Format("[ChampionEffects] Teleport beacon tracking expired for {0}", player._alias));
                    continue;
                }
                
                // Skip if not enough time has passed since last check
                if (Environment.TickCount - tracker.LastPositionCheckTime < POSITION_CHECK_INTERVAL_MS)
                    continue;
                    
                // Check if player is still in game
                if (player == null || player.IsSpectator)
                {
                    playersToRemove.Add(player);
                    continue;
                }
                
                // Calculate distance moved since last check
                short currentX = player._state.positionX;
                short currentY = player._state.positionY;
                int deltaX = currentX - tracker.LastKnownX;
                int deltaY = currentY - tracker.LastKnownY;
                double distanceMoved = Math.Sqrt(deltaX * deltaX + deltaY * deltaY);
                
                // Calculate time elapsed since last position check (in seconds)
                double timeElapsedSeconds = (Environment.TickCount - tracker.LastPositionCheckTime) / 1000.0;
                
                // Calculate max possible distance at walking speed
                double maxWalkingDistance = MAX_WALKING_SPEED_PER_SECOND * timeElapsedSeconds;
                
                // If distance moved is significantly more than possible by walking, it's a teleport
                if (distanceMoved > maxWalkingDistance * 2) // Using 2x as threshold to account for running/vehicles
                {
                    Console.WriteLine(String.Format("[ChampionEffects] Teleport detected for {0}: moved {1:F1} pixels in {2:F2}s (max walking: {3:F1})", 
                        player._alias, distanceMoved, timeElapsedSeconds, maxWalkingDistance));
                        
                    // Get the champion config for this player
                    ChampionConfig config;
                    if (_championsByAlias.TryGetValue(player._alias, out config) && config.EffectType == "Warp")
                    {
                        // Create text explosion at teleport destination
                        CreateTextExplosion(config.TextPhrase, currentX, currentY, 48, player);
                    }
                    
                    // Remove this player from tracking since they've teleported
                    playersToRemove.Add(player);
                }
                else
                {
                    // Update last known position and check time
                    tracker.LastKnownX = currentX;
                    tracker.LastKnownY = currentY;
                    tracker.LastPositionCheckTime = Environment.TickCount;
                }
            }
            
            // Remove expired or completed trackers
            foreach (Player player in playersToRemove)
            {
                _activeBeacons.Remove(player);
            }
        }
        #endregion

        #region Private Methods
        /// <summary>
        /// Create text explosion effect using letter projectiles
        /// </summary>
        private void CreateTextExplosion(string text, short x, short y, short z, Player from)
        {
            if (String.IsNullOrEmpty(text))
                return;

            try
            {
                // Limit text length and convert to uppercase
                if (text.Length > 20)
                    text = text.Substring(0, 20);
                    
                text = text.ToUpper();

                // Create letter-by-letter explosion
                int xOffset = 10;
                for (int i = 0; i < text.Length; i++)
                {
                    char letter = text[i];
                    if (letter == ' ')
                        continue; // Skip spaces

                    ItemInfo.Projectile letterWep = GetLetterProjectile(letter);
                    if (letterWep != null)
                    {
                        short newPosX = (short)(x + (i * xOffset));
                        _script.HandleExplosionProjectile(newPosX, y, z, letterWep.id, from._id, from._state.yaw);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("[ChampionEffects] Error creating text explosion: {0}", ex.Message));
            }
        }

        /// <summary>
        /// Get letter projectile for text explosions
        /// </summary>
        private ItemInfo.Projectile GetLetterProjectile(char letter)
        {
            // Special cases for known letter IDs
            if (letter == 'N')
                return AssetManager.Manager.getItemByID(1341) as ItemInfo.Projectile;
            else if (letter == 'M')
                return AssetManager.Manager.getItemByID(1356) as ItemInfo.Projectile;
            else if (char.IsDigit(letter))
            {
                // Handle numbers by getting their spelled out names
                string[] numberNames = { "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine" };
                int digit = letter - '0';
                return AssetManager.Manager.getItemByName(numberNames[digit]) as ItemInfo.Projectile;
            }
            else
            {
                return AssetManager.Manager.getItemByName(letter.ToString()) as ItemInfo.Projectile;
            }
        }
        #endregion
    }
}