using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

using InfServer.Logic;
using InfServer.Game;
using InfServer.Scripting;
using InfServer.Bots;
using InfServer.Protocol;

using Assets;
using Axiom.Math;

namespace InfServer.Script.GameType_CTF
{
    /// <summary>
    /// OvD Automation System - Handles automated setup of Offense vs Defense matches
    /// </summary>
    class OvDAutomation
    {
        #region Members
        private Script_CTF _ctf;
        private Arena _arena;
        
        // Phase tracking
        public enum OvDPhase
        {
            Inactive,
            PlayerSelection,     // Phase 1: Who wants to play
            TransitionCountdown, // Transition: 5-second countdown for corrections
            ClassSideSelection,  // Phase 2: Class and side picking
            BuildSelection,      // Phase 3: Build picking
            BaseSelection,       // Phase 4: Base selection
            MatchSetup,          // Phase 5: Final setup and start
            MatchActive          // Phase 6: Match is running with timer
        }
        
        private OvDPhase _currentPhase = OvDPhase.Inactive;
        private bool _ovdEnabled = false; // Tracks if *ovd toggle is active
        private int _phaseStartTime = 0;
        private int _phaseTimeLimit = 0;
        
        // ADDED: Grace period to prevent race conditions
        private const int UNSPEC_GRACE_PERIOD_MS = 3000; // 3 seconds grace period after unspeccing
        
        // ADDED: Transition countdown settings
        private const int TRANSITION_COUNTDOWN_MS = 5000; // 5 seconds for corrections
        
        // Player tracking
        private HashSet<Player> _participatingPlayers = new HashSet<Player>();
        private HashSet<Player> _notPlayingPlayers = new HashSet<Player>();
        private Dictionary<Player, Tuple<short, short>> _playerStartingPositions = new Dictionary<Player, Tuple<short, short>>();
        
        // ADDED: Last round tracking for fair playtime
        private HashSet<string> _lastRoundParticipants = new HashSet<string>(); // Store player aliases from last round
        
        // ADDED: Phase 2 tracking
        private Dictionary<Player, string> _playerTeamChoices = new Dictionary<Player, string>();
        private Dictionary<Player, string> _playerClassChoices = new Dictionary<Player, string>();
        
        // ADDED: Phase 3 tracking
        private Dictionary<Player, string> _playerBuildChoices = new Dictionary<Player, string>();
        
        // ADDED: Phase 4 tracking
        private Dictionary<Player, string> _playerBaseChoices = new Dictionary<Player, string>();

        // ADDED: Team assignment tracking to consolidate players on same team per faction
        private Team _assignedTitanTeam = null;
        private Team _assignedCollectiveTeam = null;

        // ADDED: Phase 5 & 6 - Match timer variables
        private int _matchStartTime = 0;
        private const int MATCH_DURATION_MS = 16 * 60 * 1000; // 16 minutes
        private const int WARNING_TIME_MS = 45 * 1000; // 0:45 elapsed (at 15:15 remaining)
        private bool _warningMessageSent = false;
        
        // ADDED: Countdown tracking for 15:00 go sequence
        private bool _countdownThreeSent = false;
        private bool _countdownTwoSent = false;
        private bool _countdownOneSent = false;
        private bool _countdownGoSent = false;
        
        // Coordinates (multiply by 16 for pixel coords)
        private const int COORD_MULTIPLIER = 16;
        
        // Phase 1 coordinates in tiles (will be converted to pixels)
        private const int PLAYING_WARP_X = 553;
        private const int PLAYING_WARP_Y = 529;
        private const int NOT_PLAYING_X = 553;
        private const int NOT_PLAYING_Y = 525;
        
        // UPDATED: Phase 2 coordinates - class and side selection area
        private const int PHASE2_WARP_X = 584;
        private const int PHASE2_WARP_Y = 547;
        
        // UPDATED: Defense class tile coordinates (Y = 542)
        private const int DEFENSE_FIELD_MEDIC_X = 576;
        private const int DEFENSE_COMBAT_ENGINEER_X = 580;
        private const int DEFENSE_INFANTRY_X = 584;
        private const int DEFENSE_HEAVY_WEAPONS_X = 588;
        private const int DEFENSE_JUMP_TROOPER_X = 592;
        private const int DEFENSE_CLASS_Y = 542;
        
        // UPDATED: Offense class tile coordinates (Y = 551)
        private const int OFFENSE_INFILTRATOR_X = 576;
        private const int OFFENSE_SQUAD_LEADER_X = 580;
        private const int OFFENSE_INFANTRY_X = 584;
        private const int OFFENSE_HEAVY_WEAPONS_X = 588;
        private const int OFFENSE_JUMP_TROOPER_X = 592;
        private const int OFFENSE_CLASS_Y = 551;
        
        // ADDED: Phase 3 coordinates - build selection area
        private const int PHASE3_WARP_X = 582;
        private const int PHASE3_WARP_Y = 527;
        
        // ADDED: Build selection tile coordinates (class-specific builds)
        // Infantry builds
        private const int BUILD_DINFCAW_X = 575;
        private const int BUILD_DINFCAW_Y = 519;
        private const int BUILD_DINF_X = 575;
        private const int BUILD_DINF_Y = 521;
        private const int BUILD_OINF_X = 575;
        private const int BUILD_OINF_Y = 523;
        
        // Heavy Weapons builds
        private const int BUILD_OHVY_X = 575;
        private const int BUILD_OHVY_Y = 525;
        private const int BUILD_HVY_MG_X = 575;
        private const int BUILD_HVY_MG_Y = 527;
        private const int BUILD_HVY_MML_X = 575;
        private const int BUILD_HVY_MML_Y = 529;
        
        // Squad Leader builds
        private const int BUILD_SLBONDS_X = 575;
        private const int BUILD_SLBONDS_Y = 531;
        private const int BUILD_SLBR_X = 575;
        private const int BUILD_SLBR_Y = 533;
        
        // Jump Trooper builds
        private const int BUILD_JTSTANDARD_X = 583;
        private const int BUILD_JTSTANDARD_Y = 519;
        private const int BUILD_FOOTJT_X = 583;
        private const int BUILD_FOOTJT_Y = 521;
        
        // Single-class builds
        private const int BUILD_MEDSTANDARD_X = 583;
        private const int BUILD_MEDSTANDARD_Y = 533;
        private const int BUILD_ENGSTANDARD_X = 586;
        private const int BUILD_ENGSTANDARD_Y = 533;
        private const int BUILD_INFILTRATOR_X = 589;
        private const int BUILD_INFILTRATOR_Y = 533;
        
        // Customize (opt-out) build
        private const int BUILD_CUSTOMIZE_X = 593;
        private const int BUILD_CUSTOMIZE_Y = 526;
        
        // Phase 4 - Base Selection coordinates
        private const int PHASE4_WARP_X = 585;
        private const int PHASE4_WARP_Y = 506;

        // Base selection tiles
        private const int BASE_A5_X = 575;
        private const int BASE_A5_Y = 506;
        private const int BASE_B8_X = 575;
        private const int BASE_B8_Y = 509;
        private const int BASE_A7_X = 575;
        private const int BASE_A7_Y = 512;
        private const int BASE_F5_X = 593;
        private const int BASE_F5_Y = 506;
        private const int BASE_F6_X = 593;
        private const int BASE_F6_Y = 509;
        private const int BASE_D7_X = 593;
        private const int BASE_D7_Y = 512;

        // ADDED: Offense dropship/staging area coordinates
        private const int OFFENSE_DROPSHIP_X = 600;
        private const int OFFENSE_DROPSHIP_Y = 520;

        // Movement thresholds
        private const int MOVEMENT_THRESHOLD_PIXELS = 1;
        private const int NOT_PLAYING_TILE_RADIUS_PIXELS = 32; // 2 tiles worth for "not playing" detection
        private const int CLASS_TILE_RADIUS_PIXELS = 24; // 1.5 tiles for class selection
        private const int BUILD_TILE_RADIUS_PIXELS = 24; // 1.5 tiles for build selection
        private const int BASE_TILE_RADIUS_PIXELS = 24; // 1.5 tiles for base selection
        
        #endregion

        #region Constructor
        public OvDAutomation(Script_CTF ctf)
        {
            _ctf = ctf;
            _arena = ctf.arena;
        }
        #endregion

        #region Public Methods
        
        /// <summary>
        /// Gets whether OvD automation is enabled (toggled on)
        /// </summary>
        public bool IsOvDEnabled
        {
            get { return _ovdEnabled; }
        }
        
        /// <summary>
        /// Gets the current OvD phase
        /// </summary>
        public OvDPhase CurrentPhase
        {
            get { return _currentPhase; }
        }
        
        /// <summary>
        /// Starts the OvD automation process
        /// </summary>
        public void StartOvDAutomation()
        {
            if (_currentPhase != OvDPhase.Inactive)
            {
                _arena.sendArenaMessage("OvD automation is already running!");
                return;
            }
            
            _ovdEnabled = true; // Enable OvD automation
            ClearAllVariables(); // Clear variables for clean start
            StartPhase1_PlayerSelection();
        }
        
        /// <summary>
        /// Clear all tracking variables for clean game start
        /// </summary>
        private void ClearAllVariables()
        {
            // Clear ticker
            _arena.setTicker(3, 1, 0, "");
            
            // Clear player tracking
            _participatingPlayers.Clear();
            _notPlayingPlayers.Clear();
            _playerStartingPositions.Clear();
            _playerTeamChoices.Clear();
            _playerClassChoices.Clear();
            _playerBuildChoices.Clear();
            _playerBaseChoices.Clear(); // Also clear base choices
            
            // Reset team assignments for clean state
            _assignedTitanTeam = null;
            _assignedCollectiveTeam = null;
            
            // Reset match tracking
            _matchStartTime = 0;
            _warningMessageSent = false;
            
            // Reset countdown flags
            _countdownThreeSent = false;
            _countdownTwoSent = false;
            _countdownOneSent = false;
            _countdownGoSent = false;
        }
        
        /// <summary>
        /// Stops the OvD automation process (when *ovd is toggled off)
        /// </summary>
        public void StopOvDAutomation()
        {
            _ovdEnabled = false;
            _currentPhase = OvDPhase.Inactive;
            
            // Clear ticker
            _arena.setTicker(3, 1, 0, "");
            
            _arena.sendArenaMessage("&OvD automation disabled!");
        }
        
        /// <summary>
        /// Toggles the OvD automation on/off
        /// </summary>
        public void ToggleOvDAutomation()
        {
            if (_ovdEnabled && _currentPhase != OvDPhase.Inactive)
            {
                // Currently enabled - turn it off
                _arena.sendArenaMessage("&Turning OFF OvD automation...");
                StopOvDAutomation();
            }
            else
            {
                // Currently disabled - turn it on
                _arena.sendArenaMessage("&Turning ON OvD automation...");
                StartOvDAutomation();
            }
        }
        
        /// <summary>
        /// Checks if players have joined and restarts automation if enabled
        /// Call this when a player joins the game
        /// </summary>
        public void CheckAutoRestart()
        {
            // Only auto-restart if OvD is enabled but currently inactive due to insufficient players
            if (_ovdEnabled && _currentPhase == OvDPhase.Inactive)
            {
                var activePlayers = _arena.Players.Where(p => !p.IsSpectator).ToList();
                if (activePlayers.Count >= 1)
                {
                    _arena.sendArenaMessage("~Player joined! Restarting OvD automation...");
                    StartPhase1_PlayerSelection();
                }
            }
        }
        
        /// <summary>
        /// Handle ?p command to join the game during player selection phase if there's room
        /// Returns true if player was added to the game, false otherwise
        /// </summary>
        public bool HandlePlayerJoinRequest(Player player)
        {
            // Only handle during player selection phase
            if (_currentPhase != OvDPhase.PlayerSelection)
            {
                return false;
            }
            
            // Check if player is already participating or opted out
            if (_participatingPlayers.Contains(player) || _notPlayingPlayers.Contains(player))
            {
                return false;
            }
            
            // Check if there's room (assuming 10 player limit)
            if (_participatingPlayers.Count >= 10)
            {
                player.sendMessage(-1, "!OvD game is full (10 players max)");
                return false;
            }
            
            // Add player to participating players
            _participatingPlayers.Add(player);
            
            // Make sure player is unspecced to the same team as others
            Team titanTeam = _arena.getTeamByName("Titan Militia");
            if (titanTeam != null)
            {
                player.unspec(titanTeam);
            }
            
            // Warp player to playing area
            short playingX = (short)(PLAYING_WARP_X * COORD_MULTIPLIER);
            short playingY = (short)(PLAYING_WARP_Y * COORD_MULTIPLIER);
            player.warp(playingX, playingY);
            
            // Store starting position
            _playerStartingPositions[player] = new Tuple<short, short>(player._state.positionX, player._state.positionY);
            
            // Show different messages based on priority status
            bool hasPriority = !_lastRoundParticipants.Contains(player._alias);
            if (_lastRoundParticipants.Count == 0)
            {
                _arena.sendArenaMessage(String.Format("&{0} joined the OvD game!", player._alias)); // Orange for participation
            }
            else if (hasPriority)
            {
                _arena.sendArenaMessage(String.Format("${0} joined the OvD game! (PRIORITY)", player._alias)); // Purple for priority
            }
            else
            {
                _arena.sendArenaMessage(String.Format("#{0} joined the OvD game (played last round)", player._alias)); // Yellow for last round player
            }
            
            CheckPhase1Complete();
            return true;
        }
        
        /// <summary>
        /// Main update method called from CTF poll
        /// </summary>
        public void Update()
        {
            if (_currentPhase == OvDPhase.Inactive)
                return;
                
            int now = Environment.TickCount;
            
            // FIXED: Poll player positions every update (like voting system does)
            if (_currentPhase == OvDPhase.PlayerSelection)
            {
                // FIXED: Only start polling after grace period to prevent race conditions
                int timeSincePhaseStart = now - _phaseStartTime;
                if (timeSincePhaseStart >= UNSPEC_GRACE_PERIOD_MS)
                {
                    PollPlayerPositionsForPhase1();
                CheckPlayerMovementBasedCompletion();
                }
                else
                {
                    // During grace period, show different ticker message
                    int gracePeriodRemaining = (UNSPEC_GRACE_PERIOD_MS - timeSincePhaseStart) / 1000;
                    _arena.setTicker(3, 1, 0, String.Format("OvD Phase 1: Preparing... {0}s", gracePeriodRemaining + 1));
                }
                
                // Always update ticker with remaining time (but only after grace period for normal countdown)
                if (timeSincePhaseStart >= UNSPEC_GRACE_PERIOD_MS)
                {
                    UpdatePhase1Ticker(now);
                }
            }
            else if (_currentPhase == OvDPhase.TransitionCountdown)
            {
                // ADDED: Continue polling for "Not Playing" selections during countdown
                PollPlayerPositionsForTransition();
                UpdateTransitionTicker(now);
            }
            else if (_currentPhase == OvDPhase.ClassSideSelection)
            {
                // ADDED: Poll for team/side selections in Phase 2
                PollPlayerPositionsForPhase2();
                UpdatePhase2Ticker(now);
            }
            else if (_currentPhase == OvDPhase.BuildSelection)
            {
                // ADDED: Poll for build selections in Phase 3
                PollPlayerPositionsForPhase3();
                UpdatePhase3Ticker(now);
            }
            else if (_currentPhase == OvDPhase.BaseSelection)
            {
                // ADDED: Poll for base selections in Phase 4
                PollPlayerPositionsForPhase4();
                UpdatePhase4Ticker(now);
            }
            else if (_currentPhase == OvDPhase.MatchSetup)
            {
                // Phase 5 has no polling - it's just setup
                UpdatePhase5Ticker(now);
            }
            else if (_currentPhase == OvDPhase.MatchActive)
            {
                // Phase 6 - match is running with timer
                UpdateMatchTimer(now);
            }
            
            // Check if phase time limit has expired
            if (now - _phaseStartTime >= _phaseTimeLimit)
            {
                switch (_currentPhase)
                {
                    case OvDPhase.PlayerSelection:
                        EndPhase1_PlayerSelection();
                        break;
                    case OvDPhase.TransitionCountdown:
                        EndTransitionCountdown();
                        break;
                    case OvDPhase.ClassSideSelection:
                        EndPhase2_ClassSideSelection();
                        break;
                    case OvDPhase.BuildSelection:
                        EndPhase3_BuildSelection();
                        break;
                    case OvDPhase.BaseSelection:
                        EndPhase4_BaseSelection();
                        break;
                    case OvDPhase.MatchSetup:
                        // Phase 5 shouldn't timeout, but if it does, start the match anyway
                        StartMatchActive();
                        break;
                }
            }
        }
        
        #endregion

        #region Phase 1 - Player Selection
        
        /// <summary>
        /// FIXED: Poll player positions for phase 1 using PIXEL coordinates for sensitivity
        /// </summary>
        private void PollPlayerPositionsForPhase1()
        {
            try
            {
                // FIXED: Only poll players who are actually unspecced and in-game (not spectators)
                foreach (Player player in _arena.PlayersIngame)
                {
                    if (player == null || player._team == null)
                        continue;
                    
                    // FIXED: Skip spectators - only track movement of active players
                    if (player.IsSpectator)
                        continue;

                    // FIXED: Use PIXEL coordinates directly instead of converting to tiles
                    short playerPixelX = player._state.positionX;
                    short playerPixelY = player._state.positionY;
                    
                    // Check for selection using pixel coordinates
                    CheckPlayerSelectionPixels(player, playerPixelX, playerPixelY);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in OvD player position polling: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// FIXED: Update ticker with remaining time (properly accounts for grace period)
        /// </summary>
        private void UpdatePhase1Ticker(int now)
        {
            // FIXED: Calculate remaining time ONLY for the actual selection phase (exclude grace period)
            int elapsedSincePhaseStart = now - _phaseStartTime;
            int elapsedSinceSelectionStart = elapsedSincePhaseStart - UNSPEC_GRACE_PERIOD_MS; // Time since selection actually began
            int selectionTimeLimit = _phaseTimeLimit - UNSPEC_GRACE_PERIOD_MS; // Pure selection time (2 minutes)
            int remainingTime = Math.Max(0, selectionTimeLimit - elapsedSinceSelectionStart);
            int remainingSeconds = (int)Math.Ceiling(remainingTime / 1000.0); // Use ceiling for more accurate countdown
            
            // Update ticker with remaining time (position 3 to appear below other tickers)
            if (remainingTime > 0)
            {
                int minutes = remainingSeconds / 60;
                int seconds = remainingSeconds % 60;
                _arena.setTicker(3, 1, 0, String.Format("OvD Phase 1: Player Selection - {0}:{1:00} remaining", minutes, seconds));
            }
            else
            {
                _arena.setTicker(3, 1, 0, "OvD Phase 1: Time expired!");
            }
        }
        
        /// <summary>
        /// Starts Phase 1: Player selection
        /// </summary>
        private void StartPhase1_PlayerSelection()
        {
            _currentPhase = OvDPhase.PlayerSelection;
            _phaseStartTime = Environment.TickCount;
            _phaseTimeLimit = 10 * 1000; // 10 seconds for Phase 1
            
            // Clear previous session data
            _participatingPlayers.Clear();
            _notPlayingPlayers.Clear();
            _playerStartingPositions.Clear();
            _playerTeamChoices.Clear();
            _playerClassChoices.Clear();
            _playerBuildChoices.Clear();
            _playerBaseChoices.Clear(); // Also clear base choices
            
            // FIXED: Get all players (including spectators) to unspec everyone to same team
            var allPlayers = _arena.Players.ToList();
            
            // Unspec and warp all players to the same team
            short playingX = (short)(PLAYING_WARP_X * COORD_MULTIPLIER);
            short playingY = (short)(PLAYING_WARP_Y * COORD_MULTIPLIER);
            
            Team titanTeam = _arena.getTeamByName("Titan Militia");
            
            foreach (Player player in allPlayers)
            {
                // Unspec everyone to the same team (including spectators)
                if (titanTeam != null)
                {
                    player.unspec(titanTeam);
                }
                else
                {
                    player.spec(); // Fallback to generic spec
                }
                
                player.warp(playingX, playingY);
                
                // Store starting position in pixels
                _playerStartingPositions[player] = new Tuple<short, short>(player._state.positionX, player._state.positionY);
            }
            
            // UPDATED: Consolidated and colored messages
            _arena.sendArenaMessage("@=== OvD Phase 1: Player Selection ==="); // Blue header
            _arena.sendArenaMessage("~TAP any direction to play!"); // Red for action
            _arena.sendArenaMessage("Don't move or step on 'Not Playing' tile (north) if not playing."); // Pink for alternative
            _arena.sendArenaMessage("#10 seconds to decide | Movement tracking starts in 3 seconds"); // Yellow for timing
            
            // ADDED: Show fair playtime priority information
            if (_lastRoundParticipants.Count > 0)
            {
                var currentPlayers = _arena.Players.Where(p => !p.IsSpectator).ToList();
                var priorityPlayers = currentPlayers.Where(p => !_lastRoundParticipants.Contains(p._alias)).ToList();
                var lastRoundPlayers = currentPlayers.Where(p => _lastRoundParticipants.Contains(p._alias)).ToList();
                
                if (priorityPlayers.Any())
                {
                    var priorityNames = priorityPlayers.Select(p => p._alias);
                    _arena.sendArenaMessage(String.Format("$PRIORITY (didn't play last round): {0}", String.Join(", ", priorityNames))); // Purple for priority
                    _arena.sendArenaMessage("!Priority players - please consider joining for fair playtime!"); // Red encouragement
                }
                
                if (lastRoundPlayers.Any())
                {
                    var lastRoundNames = lastRoundPlayers.Select(p => p._alias);
                    _arena.sendArenaMessage(String.Format("#Last round players: {0}", String.Join(", ", lastRoundNames))); // Yellow for last round
                }
            }
            else
            {
                _arena.sendArenaMessage("#First round - all players have equal priority!"); // Yellow for first round
            }
        }
        
        /// <summary>
        /// Check player selections based on pixel-perfect movement and tile stepping
        /// </summary>
        private void CheckPlayerSelectionPixels(Player player, short playerPixelX, short playerPixelY)
        {
            // Convert "Not Playing" tile coordinates to pixels for comparison
            short notPlayingPixelX = (short)(NOT_PLAYING_X * COORD_MULTIPLIER);
            short notPlayingPixelY = (short)(NOT_PLAYING_Y * COORD_MULTIPLIER);
            
            // Check if player stepped on "Not Playing" tile
            double distanceToNotPlayingTile = Math.Sqrt(
                Math.Pow(playerPixelX - notPlayingPixelX, 2) + 
                Math.Pow(playerPixelY - notPlayingPixelY, 2)
            );
            
            if (distanceToNotPlayingTile <= NOT_PLAYING_TILE_RADIUS_PIXELS)
            {
                if (!_notPlayingPlayers.Contains(player))
                {
                    _notPlayingPlayers.Add(player);
                    _participatingPlayers.Remove(player);
                    
                    // Spec to team NP if it exists
                    Team npTeam = _arena.getTeamByName("np");
                    if (npTeam != null)
                        player.spec(npTeam);
                    else
                        player.spec();
                    
                    _arena.sendArenaMessage(String.Format("${0} opted out of OvD", player._alias)); // Purple for opt-out
                    CheckPhase1Complete();
                }
            }
            else if (!_participatingPlayers.Contains(player) && !_notPlayingPlayers.Contains(player))
            {
                // FIXED: Use PIXEL-based movement detection from stored starting position
                if (_playerStartingPositions.ContainsKey(player))
                {
                    var startingPos = _playerStartingPositions[player];
                    double distanceFromStart = Math.Sqrt(
                        Math.Pow(playerPixelX - startingPos.Item1, 2) + 
                        Math.Pow(playerPixelY - startingPos.Item2, 2)
                    );
                    
                    if (distanceFromStart >= MOVEMENT_THRESHOLD_PIXELS)
                    {
                        _participatingPlayers.Add(player);
                        
                        // ADDED: Show different messages based on priority status
                        bool hasPriority = !_lastRoundParticipants.Contains(player._alias);
                        if (_lastRoundParticipants.Count == 0)
                        {
                            // First round - no priority distinction
                            //_arena.sendArenaMessage(String.Format("&{0} wants to play OvD!", player._alias)); // Orange for participation
                        }
                        else if (hasPriority)
                        {
                            // Priority player (didn't play last round)
                            _arena.sendArenaMessage(String.Format("${0} wants to play! (PRIORITY)", player._alias)); // Purple for priority
                        }
                        else
                        {
                            // Played last round
                            _arena.sendArenaMessage(String.Format("#{0} wants to play (played last round)", player._alias)); // Yellow for last round player
                        }
                        
                        CheckPhase1Complete();
                    }
                }
            }
        }
        
        /// <summary>
        /// Checks if Phase 1 can end early (all players made selection)
        /// </summary>
        private void CheckPhase1Complete()
        {
            // FIXED: Use IsSpectator consistently instead of team name check
            var activePlayers = _arena.Players.Where(p => !p.IsSpectator).ToList();
            int totalSelections = _participatingPlayers.Count + _notPlayingPlayers.Count;
            
            if (totalSelections >= activePlayers.Count)
            {
                //_arena.sendArenaMessage("~All players have made their selection!"); // Green for completion
                StartTransitionCountdown();
            }
        }
        
        /// <summary>
        /// Ends Phase 1 and processes final selections
        /// </summary>
        private void EndPhase1_PlayerSelection()
        {
            // Process any remaining players who haven't made a selection
            var activePlayers = _arena.Players.Where(p => !p.IsSpectator).ToList(); // FIXED: Use IsSpectator instead of team name check
            int cutoffTime = Environment.TickCount - (2 * 60 * 1000); // 2 minutes ago in ticks
            
            foreach (Player player in activePlayers)
            {
                // If player hasn't made a selection and hasn't moved recently, spec them
                bool hasntMadeSelection = !_participatingPlayers.Contains(player) && !_notPlayingPlayers.Contains(player);
                
                if (hasntMadeSelection)
                {
                    if (player._lastMovement < cutoffTime)
                    {
                        _notPlayingPlayers.Add(player);
                        
                        Team npTeam = _arena.getTeamByName("np");
                        if (npTeam != null)
                            player.spec(npTeam);
                        else
                            player.spec();
                        
                        _arena.sendArenaMessage(String.Format("#{0} didn't move and has been spectated.", player._alias)); // Yellow for auto-action
                    }
                    else
                    {
                        // Default inactive players to participating
                        _participatingPlayers.Add(player);
                        //_arena.sendArenaMessage(String.Format("#{0} defaulted to participating.", player._alias)); // Yellow for auto-action
                    }
                }
            }
            
            // CHANGED: Start transition countdown instead of going inactive
            StartTransitionCountdown();
        }
        
        #endregion

        #region Transition Countdown
        
        /// <summary>
        /// Starts the 5-second transition countdown where players can still opt out
        /// </summary>
        private void StartTransitionCountdown()
        {
            _currentPhase = OvDPhase.TransitionCountdown;
            _phaseStartTime = Environment.TickCount;
            _phaseTimeLimit = TRANSITION_COUNTDOWN_MS;
            
            //_arena.sendArenaMessage("@=== Phase 1 Complete ==="); // Blue header
            //_arena.sendArenaMessage(String.Format("~Playing: {0} | Not Playing: {1}", _participatingPlayers.Count, _notPlayingPlayers.Count)); // Green for stats
            //_arena.sendArenaMessage("!LAST CHANCE: 5 seconds to move to 'Not Playing' tile to opt out!"); // Red for urgency
        }
        
        /// <summary>
        /// Poll for "Not Playing" selections during transition countdown
        /// </summary>
        private void PollPlayerPositionsForTransition()
        {
            try
            {
                // Only check for "Not Playing" tile movements during countdown
                foreach (Player player in _participatingPlayers.ToList()) // Use ToList to avoid modification during iteration
                {
                    if (player == null || player._team == null || player.IsSpectator)
                        continue;
                    
                    short playerPixelX = player._state.positionX;
                    short playerPixelY = player._state.positionY;
                    
                    // Convert "Not Playing" tile coordinates to pixels for comparison
                    short notPlayingPixelX = (short)(NOT_PLAYING_X * COORD_MULTIPLIER);
                    short notPlayingPixelY = (short)(NOT_PLAYING_Y * COORD_MULTIPLIER);
                    
                    // Check if player stepped on "Not Playing" tile
                    double distanceToNotPlayingTile = Math.Sqrt(
                        Math.Pow(playerPixelX - notPlayingPixelX, 2) + 
                        Math.Pow(playerPixelY - notPlayingPixelY, 2)
                    );
                    
                    if (distanceToNotPlayingTile <= NOT_PLAYING_TILE_RADIUS_PIXELS)
                    {
                        // Move player from participating to not playing
                        _participatingPlayers.Remove(player);
                        _notPlayingPlayers.Add(player);
                        
                        // Spec to team NP
                        Team npTeam = _arena.getTeamByName("np");
                        if (npTeam != null)
                            player.spec(npTeam);
                        else
                            player.spec();
                        
                        _arena.sendArenaMessage(String.Format("!{0} changed their mind and opted out!", player._alias)); // Red for last-minute change
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in transition polling: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Update ticker during transition countdown
        /// </summary>
        private void UpdateTransitionTicker(int now)
        {
            int elapsed = now - _phaseStartTime;
            int remaining = Math.Max(0, _phaseTimeLimit - elapsed);
            int remainingSeconds = (int)Math.Ceiling(remaining / 1000.0);
            
            if (remaining > 0)
            {
                _arena.setTicker(3, 1, 0, String.Format("Starting Phase 2 in {0} seconds... (Move to 'Not Playing' to opt out!)", remainingSeconds));
            }
            else
            {
                _arena.setTicker(3, 1, 0, "Starting Phase 2...");
            }
        }
        
        /// <summary>
        /// End transition countdown and start Phase 2
        /// </summary>
        private void EndTransitionCountdown()
        {
            //_arena.sendArenaMessage("@=== Transition Complete ==="); // Blue header
            //_arena.sendArenaMessage(String.Format("~Final participating players: {0}", _participatingPlayers.Count)); // Green for stats
            
            // Check if we have enough players to continue
            if (_participatingPlayers.Count < 1)
            {
                _arena.sendArenaMessage("!Not enough players to continue OvD. Automation cancelled."); // Red for error
                if (_ovdEnabled)
                {
                    _arena.sendArenaMessage("*Automation will restart when players join the game!"); // Pink for info
                }
                _currentPhase = OvDPhase.Inactive;
                _arena.setTicker(3, 1, 0, "");
                return;
            }
            
            // ADDED: Limit to 10 players with priority system
            SelectFinalParticipants();
            
            StartPhase2_ClassSideSelection();
        }
        
        /// <summary>
        /// Select final participants with 10 player limit and priority system
        /// </summary>
        private void SelectFinalParticipants()
        {
            const int MAX_PLAYERS = 10;
            
            if (_participatingPlayers.Count <= MAX_PLAYERS)
            {
                // No need to limit - we have 10 or fewer players
                _arena.sendArenaMessage(String.Format("~{0} players selected for OvD match!", _participatingPlayers.Count)); // Green for success
                return;
            }
            
            // Separate priority and non-priority players
            var priorityPlayers = new List<Player>();
            var nonPriorityPlayers = new List<Player>();
            
            foreach (Player player in _participatingPlayers)
            {
                bool hasPriority = !_lastRoundParticipants.Contains(player._alias);
                if (hasPriority)
                    priorityPlayers.Add(player);
                else
                    nonPriorityPlayers.Add(player);
            }
            
            // Select up to 10 players with priority preference
            var selectedPlayers = new List<Player>();
            
            // First, add all priority players (up to 10)
            int priorityCount = Math.Min(priorityPlayers.Count, MAX_PLAYERS);
            selectedPlayers.AddRange(priorityPlayers.Take(priorityCount));
            
            // If we still have room, add non-priority players
            int remainingSlots = MAX_PLAYERS - selectedPlayers.Count;
            if (remainingSlots > 0 && nonPriorityPlayers.Count > 0)
            {
                selectedPlayers.AddRange(nonPriorityPlayers.Take(remainingSlots));
            }
            
            // Spec players who didn't make the cut
            var rejectedPlayers = _participatingPlayers.Except(selectedPlayers).ToList();
            foreach (Player player in rejectedPlayers)
            {
                _participatingPlayers.Remove(player);
                _notPlayingPlayers.Add(player);
                
                Team npTeam = _arena.getTeamByName("np");
                if (npTeam != null)
                    player.spec(npTeam);
                else
                    player.spec();
                
                bool hadPriority = !_lastRoundParticipants.Contains(player._alias);
                if (hadPriority)
                {
                    //_arena.sendArenaMessage(String.Format("!{0} (priority) didn't make the 10-player cut", player._alias)); // Red for disappointment
                }
                else
                {
                    //_arena.sendArenaMessage(String.Format("#{0} didn't make the 10-player cut (played last round)", player._alias)); // Yellow for expected
                }
            }
            
            // Update participating players to final selection
            _participatingPlayers.Clear();
            _participatingPlayers.UnionWith(selectedPlayers);
            
            // Show final selection summary
            _arena.sendArenaMessage(String.Format("~{0} players selected for OvD match (priority system applied)!", selectedPlayers.Count)); // Green for success
            
            if (priorityPlayers.Count > 0)
            {
                int prioritySelected = selectedPlayers.Count(p => !_lastRoundParticipants.Contains(p._alias));
                _arena.sendArenaMessage(String.Format("${0} priority players selected", prioritySelected)); // Purple for priority
            }
            
            if (selectedPlayers.Count(p => _lastRoundParticipants.Contains(p._alias)) > 0)
            {
                int nonPrioritySelected = selectedPlayers.Count(p => _lastRoundParticipants.Contains(p._alias));
                _arena.sendArenaMessage(String.Format("#{0} last-round players selected", nonPrioritySelected)); // Yellow for last round
            }
        }
        
        #endregion

        #region Phase 2 - Class and Side Selection
        
        /// <summary>
        /// Starts Phase 2: Class and side selection
        /// </summary>
        private void StartPhase2_ClassSideSelection()
        {
            _currentPhase = OvDPhase.ClassSideSelection;
            _phaseStartTime = Environment.TickCount;
            _phaseTimeLimit = 20 * 1000; // 20 seconds for Phase 2
            
            _playerTeamChoices.Clear();
            _playerClassChoices.Clear();
            
            // UPDATED: Warp all participating players to Phase 2 area
            short phase2X = (short)(PHASE2_WARP_X * COORD_MULTIPLIER);
            short phase2Y = (short)(PHASE2_WARP_Y * COORD_MULTIPLIER);
            
            foreach (Player player in _participatingPlayers)
            {
                player.warp(phase2X, phase2Y);
            }
            
            _arena.sendArenaMessage("@=== Phase 2: Class Selection ==="); // Blue header
            _arena.sendArenaMessage("!Choose your class by stepping on tiles:"); // Red for action
            _arena.sendArenaMessage("&DEFENSE (North): Field Medic | Combat Engineer | Infantry | Heavy Weapons | Jump Trooper"); // Orange for defense
            _arena.sendArenaMessage("*OFFENSE (South): Infiltrator | Squad Leader | Infantry | Heavy Weapons | Jump Trooper"); // Pink for offense
            _arena.sendArenaMessage("#20 seconds to choose!"); // Yellow for timing
        }
        
        /// <summary>
        /// Poll for class and team selections in Phase 2
        /// </summary>
        private void PollPlayerPositionsForPhase2()
        {
            try
            {
                foreach (Player player in _participatingPlayers)
                {
                    if (player == null || player._team == null || player.IsSpectator)
                        continue;
                    
                    short playerPixelX = player._state.positionX;
                    short playerPixelY = player._state.positionY;
                    
                    string previousTeamChoice = _playerTeamChoices.ContainsKey(player) ? _playerTeamChoices[player] : null;
                    string previousClassChoice = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : null;
                    
                    // Check all Defense class tiles (Y = 542)
                    string newTeam = null;
                    string newClass = null;
                    
                    // Defense tiles
                    if (CheckClassTile(playerPixelX, playerPixelY, DEFENSE_FIELD_MEDIC_X, DEFENSE_CLASS_Y))
                    {
                        newTeam = "Defense";
                        newClass = "Field Medic";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, DEFENSE_COMBAT_ENGINEER_X, DEFENSE_CLASS_Y))
                    {
                        newTeam = "Defense";
                        newClass = "Combat Engineer";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, DEFENSE_INFANTRY_X, DEFENSE_CLASS_Y))
                    {
                        newTeam = "Defense";
                        newClass = "Infantry";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, DEFENSE_HEAVY_WEAPONS_X, DEFENSE_CLASS_Y))
                    {
                        newTeam = "Defense";
                        newClass = "Heavy Weapons";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, DEFENSE_JUMP_TROOPER_X, DEFENSE_CLASS_Y))
                    {
                        newTeam = "Defense";
                        newClass = "Jump Trooper";
                    }
                    // Offense tiles
                    else if (CheckClassTile(playerPixelX, playerPixelY, OFFENSE_INFILTRATOR_X, OFFENSE_CLASS_Y))
                    {
                        newTeam = "Offense";
                        newClass = "Infiltrator";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, OFFENSE_SQUAD_LEADER_X, OFFENSE_CLASS_Y))
                    {
                        newTeam = "Offense";
                        newClass = "Squad Leader";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, OFFENSE_INFANTRY_X, OFFENSE_CLASS_Y))
                    {
                        newTeam = "Offense";
                        newClass = "Infantry";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, OFFENSE_HEAVY_WEAPONS_X, OFFENSE_CLASS_Y))
                    {
                        newTeam = "Offense";
                        newClass = "Heavy Weapons";
                    }
                    else if (CheckClassTile(playerPixelX, playerPixelY, OFFENSE_JUMP_TROOPER_X, OFFENSE_CLASS_Y))
                    {
                        newTeam = "Offense";
                        newClass = "Jump Trooper";
                    }
                    
                    // Update choices if player made a new selection
                    if (newTeam != null && newClass != null)
                    {
                        bool isNewChoice = (previousTeamChoice != newTeam || previousClassChoice != newClass);
                        
                        if (isNewChoice)
                        {
                            _playerTeamChoices[player] = newTeam;
                            _playerClassChoices[player] = newClass;
                            
                            // ADDED: Change player's actual skill using CTF script function
                            _ctf.ChangePlayerSkill(player, newClass);
                            
                            //_arena.sendArenaMessage(String.Format("~{0} selected {1} {2}!", player._alias, newTeam, newClass)); // Green for selection
                            CheckPhase2Complete();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in Phase 2 polling: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Helper method to check if player is on a specific class tile
        /// </summary>
        private bool CheckClassTile(short playerPixelX, short playerPixelY, int tileX, int tileY)
        {
            short tilePixelX = (short)(tileX * COORD_MULTIPLIER);
            short tilePixelY = (short)(tileY * COORD_MULTIPLIER);
            
            double distance = Math.Sqrt(
                Math.Pow(playerPixelX - tilePixelX, 2) + 
                Math.Pow(playerPixelY - tilePixelY, 2)
            );
            
            return distance <= CLASS_TILE_RADIUS_PIXELS;
        }
        
        /// <summary>
        /// Update ticker for Phase 2
        /// </summary>
        private void UpdatePhase2Ticker(int now)
        {
            int elapsed = now - _phaseStartTime;
            int remaining = Math.Max(0, _phaseTimeLimit - elapsed);
            int remainingSeconds = (int)Math.Ceiling(remaining / 1000.0);
            
            if (remaining > 0)
            {
                int minutes = remainingSeconds / 60;
                int seconds = remainingSeconds % 60;
                _arena.setTicker(3, 1, 0, String.Format("OvD Phase 2: Class Selection - {0}:{1:00} remaining", minutes, seconds));
            }
            else
            {
                _arena.setTicker(3, 1, 0, "OvD Phase 2: Time expired!");
            }
        }
        
        /// <summary>
        /// Check if Phase 2 can complete early
        /// </summary>
        private void CheckPhase2Complete()
        {
            if (_playerTeamChoices.Count >= _participatingPlayers.Count)
            {
                //_arena.sendArenaMessage("~All players have selected their teams!"); // Green for completion
                EndPhase2_ClassSideSelection();
            }
        }
        
        /// <summary>
        /// End Phase 2 and process team selections
        /// </summary>
        private void EndPhase2_ClassSideSelection()
        {
            _arena.setTicker(3, 1, 0, "");
            
            //_arena.sendArenaMessage("@=== Phase 2 Complete ==="); // Blue header
            
            // Process any players who didn't make a selection
            foreach (Player player in _participatingPlayers)
            {
                if (!_playerTeamChoices.ContainsKey(player) || !_playerClassChoices.ContainsKey(player))
                {
                    // Auto-assign to team with fewer players, default class Infantry
                    int offenseCount = _playerTeamChoices.Values.Count(v => v == "Offense");
                    int defenseCount = _playerTeamChoices.Values.Count(v => v == "Defense");
                    
                    string autoTeam = offenseCount <= defenseCount ? "Offense" : "Defense";
                    string autoClass = "Infantry"; // Default class
                    
                    _playerTeamChoices[player] = autoTeam;
                    _playerClassChoices[player] = autoClass;
                    _arena.sendArenaMessage(String.Format("#{0} auto-assigned to {1} {2}", player._alias, autoTeam, autoClass)); // Yellow for auto-assignment
                }
            }
            
            // Display final team and class assignments (consolidated)
            var offensePlayers = _participatingPlayers.Where(p => _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Offense");
            var defensePlayers = _participatingPlayers.Where(p => _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense");
            
            if (offensePlayers.Any())
            {
                var offenseList = offensePlayers.Select(p => String.Format("{0}({1})", p._alias, _playerClassChoices.ContainsKey(p) ? _playerClassChoices[p] : "Infantry"));
                _arena.sendArenaMessage(String.Format("*OFFENSE: {0}", String.Join(", ", offenseList))); // Pink for offense
            }
            
            if (defensePlayers.Any())
            {
                var defenseList = defensePlayers.Select(p => String.Format("{0}({1})", p._alias, _playerClassChoices.ContainsKey(p) ? _playerClassChoices[p] : "Infantry"));
                _arena.sendArenaMessage(String.Format("&DEFENSE: {0}", String.Join(", ", defenseList))); // Orange for defense
            }
            
            // SKIP Phase 3 (Build Selection) and go directly to Phase 4 (Base Selection)
            StartPhase4_BaseSelection();
        }
        
        #endregion

        #region Phase 3 - Build Selection
        
        /// <summary>
        /// Starts Phase 3: Build selection
        /// </summary>
        private void StartPhase3_BuildSelection()
        {
            _currentPhase = OvDPhase.BuildSelection;
            _phaseStartTime = Environment.TickCount;
            _phaseTimeLimit = 90 * 1000; // 1.5 minutes for Phase 3
            
            _playerBuildChoices.Clear();
            
            // Warp players to class-specific locations near their build tiles
            foreach (Player player in _participatingPlayers)
            {
                string playerClass = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : "Infantry";
                short warpX, warpY;
                
                switch (playerClass)
                {
                    case "Infantry":
                        // Warp to the right of Infantry build tiles
                        warpX = (short)((BUILD_DINF_X + 4) * COORD_MULTIPLIER);
                        warpY = (short)(BUILD_DINF_Y * COORD_MULTIPLIER);
                        break;
                    case "Jump Trooper":
                        // Warp to the right of Jump Trooper build tiles
                        warpX = (short)((BUILD_JTSTANDARD_X + 4) * COORD_MULTIPLIER);
                        warpY = (short)(BUILD_JTSTANDARD_Y * COORD_MULTIPLIER);
                        break;
                    case "Heavy Weapons":
                        // Warp to the right of Heavy Weapons build tiles
                        warpX = (short)((BUILD_HVY_MML_X + 4) * COORD_MULTIPLIER);
                        warpY = (short)(BUILD_HVY_MML_Y * COORD_MULTIPLIER);
                        break;
                    case "Squad Leader":
                        // Warp to the right of Squad Leader build tiles
                        warpX = (short)((BUILD_SLBONDS_X + 4) * COORD_MULTIPLIER);
                        warpY = (short)(BUILD_SLBONDS_Y * COORD_MULTIPLIER);
                        break;
                    case "Combat Engineer":
                        // Warp slightly above Engineer build tile
                        warpX = (short)(BUILD_ENGSTANDARD_X * COORD_MULTIPLIER);
                        warpY = (short)((BUILD_ENGSTANDARD_Y - 4) * COORD_MULTIPLIER);
                        break;
                    case "Field Medic":
                        // Warp slightly above Field Medic build tile
                        warpX = (short)(BUILD_MEDSTANDARD_X * COORD_MULTIPLIER);
                        warpY = (short)((BUILD_MEDSTANDARD_Y - 4) * COORD_MULTIPLIER);
                        break;
                    case "Infiltrator":
                        // Warp slightly above Infiltrator build tile
                        warpX = (short)(BUILD_INFILTRATOR_X * COORD_MULTIPLIER);
                        warpY = (short)((BUILD_INFILTRATOR_Y - 4) * COORD_MULTIPLIER);
                        break;
                    default:
                        // Fallback to generic Phase 3 location
                        warpX = (short)(PHASE3_WARP_X * COORD_MULTIPLIER);
                        warpY = (short)(PHASE3_WARP_Y * COORD_MULTIPLIER);
                        break;
                }
                
                player.warp(warpX, warpY);
            }
            
            _arena.sendArenaMessage("@=== Phase 3: Build Selection ==="); // Blue header
            _arena.sendArenaMessage("!Choose your build by stepping on tiles (class-specific builds available)"); // Red for action
            _arena.sendArenaMessage("*Step on 'Customize' tile to choose your own build later"); // Pink for alternative
            _arena.sendArenaMessage("#1.5 minutes to choose!"); // Yellow for timing
        }
        
        /// <summary>
        /// Poll for build selections in Phase 3
        /// </summary>
        private void PollPlayerPositionsForPhase3()
        {
            try
            {
                foreach (Player player in _participatingPlayers)
                {
                    if (player == null || player._team == null || player.IsSpectator)
                        continue;
                    
                    short playerPixelX = player._state.positionX;
                    short playerPixelY = player._state.positionY;
                    
                    string previousBuildChoice = _playerBuildChoices.ContainsKey(player) ? _playerBuildChoices[player] : null;
                    string playerClass = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : "Infantry";
                    
                    string newBuild = null;
                    bool isValidForClass = false;
                    
                    // Check for Customize (opt-out) tile first - available to all classes
                    if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_CUSTOMIZE_X, BUILD_CUSTOMIZE_Y))
                    {
                        newBuild = "Customize";
                        isValidForClass = true;
                    }
                    // Check Infantry builds
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_DINFCAW_X, BUILD_DINFCAW_Y))
                    {
                        newBuild = "dinfcaw";
                        isValidForClass = (playerClass == "Infantry");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_DINF_X, BUILD_DINF_Y))
                    {
                        newBuild = "dinf";
                        isValidForClass = (playerClass == "Infantry");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_OINF_X, BUILD_OINF_Y))
                    {
                        newBuild = "oinf";
                        isValidForClass = (playerClass == "Infantry");
                    }
                    // Check Heavy Weapons builds
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_OHVY_X, BUILD_OHVY_Y))
                    {
                        newBuild = "ohvy";
                        isValidForClass = (playerClass == "Heavy Weapons");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_HVY_MG_X, BUILD_HVY_MG_Y))
                    {
                        newBuild = "hvyMG";
                        isValidForClass = (playerClass == "Heavy Weapons");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_HVY_MML_X, BUILD_HVY_MML_Y))
                    {
                        newBuild = "dhvy";
                        isValidForClass = (playerClass == "Heavy Weapons");
                    }
                    // Check Squad Leader builds
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_SLBONDS_X, BUILD_SLBONDS_Y))
                    {
                        newBuild = "slbonds";
                        isValidForClass = (playerClass == "Squad Leader");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_SLBR_X, BUILD_SLBR_Y))
                    {
                        newBuild = "slbr";
                        isValidForClass = (playerClass == "Squad Leader");
                    }
                    // Check Jump Trooper builds
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_JTSTANDARD_X, BUILD_JTSTANDARD_Y))
                    {
                        newBuild = "jtstandard";
                        isValidForClass = (playerClass == "Jump Trooper");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_FOOTJT_X, BUILD_FOOTJT_Y))
                    {
                        newBuild = "footjt";
                        isValidForClass = (playerClass == "Jump Trooper");
                    }
                    // Check single-class builds
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_MEDSTANDARD_X, BUILD_MEDSTANDARD_Y))
                    {
                        newBuild = "medstandard";
                        isValidForClass = (playerClass == "Field Medic");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_ENGSTANDARD_X, BUILD_ENGSTANDARD_Y))
                    {
                        newBuild = "engstandard";
                        isValidForClass = (playerClass == "Combat Engineer");
                    }
                    else if (CheckBuildTile(playerPixelX, playerPixelY, BUILD_INFILTRATOR_X, BUILD_INFILTRATOR_Y))
                    {
                        newBuild = "infilstandard";
                        isValidForClass = (playerClass == "Infiltrator");
                    }
                    
                    // Process build selection
                    if (newBuild != null)
                    {
                        if (!isValidForClass && newBuild != "Customize")
                        {
                            // Invalid build for this class
                            player.sendMessage(-1, String.Format("!That build is not available for {0} class!", playerClass)); // Red for error
                        }
                        else if (previousBuildChoice != newBuild)
                        {
                            // Valid new build selection
                            _playerBuildChoices[player] = newBuild;
                            
                            if (newBuild == "Customize")
                            {
                                _arena.sendArenaMessage(String.Format("${0} chose to customize their build!", player._alias)); // Purple for customize
                            }
                            else
                            {
                                // Apply the build using CTF script function
                                ApplyBuildToPlayer(player, newBuild);
                                _arena.sendArenaMessage(String.Format("~{0} selected {1} build!", player._alias, newBuild)); // Green for build selection
                            }
                            
                            CheckPhase3Complete();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error in Phase 3 polling: {0}", ex.Message));
            }
        }
        
        /// <summary>
        /// Helper method to check if player is on a specific build tile
        /// </summary>
        private bool CheckBuildTile(short playerPixelX, short playerPixelY, int tileX, int tileY)
        {
            short tilePixelX = (short)(tileX * COORD_MULTIPLIER);
            short tilePixelY = (short)(tileY * COORD_MULTIPLIER);
            
            double distance = Math.Sqrt(
                Math.Pow(playerPixelX - tilePixelX, 2) + 
                Math.Pow(playerPixelY - tilePixelY, 2)
            );
            
            return distance <= BUILD_TILE_RADIUS_PIXELS;
        }
        
        /// <summary>
        /// Apply build to player by manually replicating ?swap command logic
        /// </summary>
        private async void ApplyBuildToPlayer(Player player, string buildName)
        {
            try
            {
                string specializedSkillName = GetSpecializedSkillNameForBuild(buildName);
                if (!string.IsNullOrEmpty(specializedSkillName))
                {
                    // Debug: Log what skills player has before
                    var skillsBefore = string.Join(", ", player._skills.Values.Select(s => s.skill.Name));
                    Console.WriteLine(String.Format("[OVD BUILD DEBUG] {0} skills before: {1}", player._alias, skillsBefore));
                    
                                                                                   // FIXED: Manually replicate ?swap command logic instead of calling HandleSwapCommand
                     
                     // 1. Clear inventory
                     player.resetInventory(true);
                     
                     // 2. Clear existing skills 
                     player._skills.Clear();
                     
                     // 3. Add the specialized skill
                     SkillInfo specializedSkill = AssetManager.Manager.getSkillByName(specializedSkillName);
                     if (specializedSkill != null)
                     {
                         Player.SkillItem specializedSkillItem = new Player.SkillItem
                         {
                             skill = specializedSkill
                         };
                         player._skills.Add(specializedSkill.SkillId, specializedSkillItem);
                         
                         // 4. Add the base skill (same logic as HandleSwapCommand)
                         SkillInfo baseSkill = null;
                         if (specializedSkill.Name.Contains("Infantry") && specializedSkill.Name != "Infantry")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Infantry");
                         }
                         else if (specializedSkill.Name.Contains("Heavy Weapons") && specializedSkill.Name != "Heavy Weapons")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Heavy Weapons");
                         }
                         else if (specializedSkill.Name.Contains("Jump Trooper") && specializedSkill.Name != "Jump Trooper")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Jump Trooper");
                         }
                         else if (specializedSkill.Name.Contains("Combat Engineer") && specializedSkill.Name != "Combat Engineer")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Combat Engineer");
                         }
                         else if (specializedSkill.Name.Contains("Field Medic") && specializedSkill.Name != "Field Medic")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Field Medic");
                         }
                         else if (specializedSkill.Name.Contains("Infiltrator") && specializedSkill.Name != "Infiltrator")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Infiltrator");
                         }
                         else if (specializedSkill.Name.Contains("Squad Leader") && specializedSkill.Name != "Squad Leader")
                         {
                             baseSkill = AssetManager.Manager.getSkillByName("Squad Leader");
                         }
                         
                         if (baseSkill != null && !player._skills.ContainsKey(baseSkill.SkillId))
                         {
                             Player.SkillItem baseSkillItem = new Player.SkillItem
                             {
                                 skill = baseSkill
                             };
                             player._skills.Add(baseSkill.SkillId, baseSkillItem);
                         }
                         
                                                  // 5. Set default vehicle
                         if (specializedSkill.DefaultVehicleId > 0)
                         {
                             player.setDefaultVehicle(AssetManager.Manager.getVehicleByID(specializedSkill.DefaultVehicleId));
                         }
                     }
                     
                     // 6. Sync state
                     player.syncState();
                     
                     // Debug: Log what skills player has after
                     var skillsAfter = string.Join(", ", player._skills.Values.Select(s => s.skill.Name));
                     Console.WriteLine(String.Format("[OVD BUILD DEBUG] {0} skills after: {1}", player._alias, skillsAfter));
                     
                     // 7. Apply build equipment
                     _ctf.SetupEquipmentSkills(player);
                     
                     // Debug: Log equipment applied
                     var equipment = string.Join(", ", player._inventory.Values.Select(e => e.item.name + " x" + e.quantity));
                     Console.WriteLine(String.Format("[OVD BUILD DEBUG] {0} equipment: {1}", player._alias, equipment));
                }
                else
                {
                    // For "Customize" builds, just clear inventory - no automatic build
                    player._inventory.Clear();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(String.Format("Error applying build {0} to player {1}: {2}", buildName, player._alias, ex.Message));
                player.sendMessage(-1, String.Format("!Error applying build: {0}", ex.Message)); // Red for error
            }
        }
        
        /// <summary>
        /// Maps build names to their corresponding specialized skill names for proper skill ID assignment
        /// </summary>
        private string GetSpecializedSkillNameForBuild(string buildName)
        {
            switch (buildName.ToLower())
            {
                case "dinfcaw":
                    return "Infantry Defense CAW";
                case "dinf":
                    return "Infantry Defense SG";
                case "oinf":
                    return "Infantry Offense Cmp6/PF";
                case "oinfcara":
                    return "Infantry Offense Cara/PF";
                case "ohvy":
                    return "Heavy Weapons Offense RPG/AC";
                case "dhvy":
                    return "Heavy Weapons Defense MML/AC";
                case "hvyMG":
                    return "Heavy Weapons Offense MG/AC";
                case "slbonds":
                    return "Squad Leader Standard";
                case "slbr":
                    return "Squad Leader Standard"; // Both slbonds and slbr use same specialized skill
                case "jtstandard":
                    return "Jump Trooper Pack";
                case "footjt":
                    return "Jump Trooper Foot";
                case "medstandard":
                    return "Field Medic Standard";
                case "engstandard":
                    return "Combat Engineer Standard";
                case "infilstandard":
                    return "Infiltrator Standard";
                default:
                    return null; // For "Customize" or unknown builds
            }
        }
        
        /// <summary>
        /// Update ticker for Phase 3
        /// </summary>
        private void UpdatePhase3Ticker(int now)
        {
            int elapsed = now - _phaseStartTime;
            int remaining = Math.Max(0, _phaseTimeLimit - elapsed);
            int remainingSeconds = (int)Math.Ceiling(remaining / 1000.0);
            
            if (remaining > 0)
            {
                int minutes = remainingSeconds / 60;
                int seconds = remainingSeconds % 60;
                _arena.setTicker(3, 1, 0, String.Format("OvD Phase 3: Build Selection - {0}:{1:00} remaining", minutes, seconds));
            }
            else
            {
                _arena.setTicker(3, 1, 0, "OvD Phase 3: Time expired!");
            }
        }
        
        /// <summary>
        /// Check if Phase 3 can complete early
        /// </summary>
        private void CheckPhase3Complete()
        {
            if (_playerBuildChoices.Count >= _participatingPlayers.Count)
            {
                _arena.sendArenaMessage("~All players have selected their builds!"); // Green for completion
                EndPhase3_BuildSelection();
            }
        }
        
        /// <summary>
        /// End Phase 3 and process build selections
        /// </summary>
        private void EndPhase3_BuildSelection()
        {
            _arena.setTicker(3, 1, 0, "");
            
            _arena.sendArenaMessage("@=== Phase 3 Complete ==="); // Blue header
            
            // Process any players who didn't make a build selection
            foreach (Player player in _participatingPlayers)
            {
                if (!_playerBuildChoices.ContainsKey(player))
                {
                    // Auto-assign Customize for players who didn't choose
                    _playerBuildChoices[player] = "Customize";
                    //_arena.sendArenaMessage(String.Format("#{0} auto-assigned to Customize (no preset build)", player._alias)); // Yellow for auto-assignment
                }
            }
            
            // Display final build assignments (consolidated by team)
            var offensePlayers = _participatingPlayers.Where(p => _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Offense");
            var defensePlayers = _participatingPlayers.Where(p => _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense");
            
            if (offensePlayers.Any())
            {
                var offenseBuilds = offensePlayers.Select(p => String.Format("{0}({1})", p._alias, _playerBuildChoices.ContainsKey(p) ? _playerBuildChoices[p] : "Customize"));
                //_arena.sendArenaMessage(String.Format("*OFFENSE BUILDS: {0}", String.Join(", ", offenseBuilds))); // Pink for offense
            }
            
            if (defensePlayers.Any())
            {
                var defenseBuilds = defensePlayers.Select(p => String.Format("{0}({1})", p._alias, _playerBuildChoices.ContainsKey(p) ? _playerBuildChoices[p] : "Customize"));
                //_arena.sendArenaMessage(String.Format("&DEFENSE BUILDS: {0}", String.Join(", ", defenseBuilds))); // Orange for defense
            }
            
            // Transition to Phase 4 - Base Selection
            //_arena.sendArenaMessage("~Proceeding to Phase 4: Base Selection..."); // Green for transition
            StartPhase4_BaseSelection();
        }
        
        #endregion

        #region Phase 4 - Base Selection

        /// <summary>
        /// Start Phase 4 - Base Selection
        /// </summary>
        private void StartPhase4_BaseSelection()
        {
            _currentPhase = OvDPhase.BaseSelection;
            _phaseStartTime = Environment.TickCount;
            _phaseTimeLimit = 20000; // 20 seconds

            // Clear previous base choices
            _playerBaseChoices.Clear();

            _arena.sendArenaMessage("@=== Phase 4: Base Selection ==="); // Blue header
            _arena.sendArenaMessage("&DEFENSE: Select your base by moving to it:"); // Orange for defense
            _arena.sendArenaMessage("&A5, B8, A7 (left side) | F5, F6, D7 (right side)"); // Orange for defense bases
            _arena.sendArenaMessage("*OFFENSE: Waiting at dropship staging area"); // Pink for offense
            _arena.sendArenaMessage("#20 seconds to choose!"); // Yellow for timing

            // Separate defense and offense players
            var defensePlayers = _participatingPlayers.Where(p => 
                _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense").ToList();
            var offensePlayers = _participatingPlayers.Where(p => 
                _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Offense").ToList();

            // Warp defense players to base selection area
            foreach (Player player in defensePlayers)
            {
                if (player != null && !player.IsSpectator)
                {
                    player.warp(PHASE4_WARP_X * COORD_MULTIPLIER, PHASE4_WARP_Y * COORD_MULTIPLIER);
                }
            }

            // Warp offense players to dropship staging area
            foreach (Player player in offensePlayers)
            {
                if (player != null && !player.IsSpectator)
                {
                    player.warp(OFFENSE_DROPSHIP_X * COORD_MULTIPLIER, OFFENSE_DROPSHIP_Y * COORD_MULTIPLIER);
                }
            }

            _arena.setTicker(3, 1, 0, "OvD Phase 4: Defense Base Selection - 20s remaining");
        }

        /// <summary>
        /// Poll player positions for Phase 4 base selections
        /// </summary>
        private void PollPlayerPositionsForPhase4()
        {
            try
            {
                // Only poll defense players for base selection
                var defensePlayers = _participatingPlayers.Where(p => 
                    _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense").ToList();

                foreach (Player player in defensePlayers)
                {
                    if (player == null || player.IsSpectator)
                        continue;

                    short playerPixelX = player._state.positionX;
                    short playerPixelY = player._state.positionY;

                    // Check each base tile
                    string selectedBase = null;

                    if (CheckBaseTile(playerPixelX, playerPixelY, BASE_A5_X, BASE_A5_Y))
                        selectedBase = "A5";
                    else if (CheckBaseTile(playerPixelX, playerPixelY, BASE_B8_X, BASE_B8_Y))
                        selectedBase = "B8";
                    else if (CheckBaseTile(playerPixelX, playerPixelY, BASE_A7_X, BASE_A7_Y))
                        selectedBase = "A7";
                    else if (CheckBaseTile(playerPixelX, playerPixelY, BASE_F5_X, BASE_F5_Y))
                        selectedBase = "F5";
                    else if (CheckBaseTile(playerPixelX, playerPixelY, BASE_F6_X, BASE_F6_Y))
                        selectedBase = "F6";
                    else if (CheckBaseTile(playerPixelX, playerPixelY, BASE_D7_X, BASE_D7_Y))
                        selectedBase = "D7";

                    if (selectedBase != null)
                    {
                        // Update or confirm base choice
                        if (!_playerBaseChoices.ContainsKey(player) || _playerBaseChoices[player] != selectedBase)
                        {
                            _playerBaseChoices[player] = selectedBase;
                            string playerClass = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : "Unknown";
                            string build = _playerBuildChoices.ContainsKey(player) ? _playerBuildChoices[player] : "Unknown";
                            
                            _arena.sendArenaMessage(String.Format("&{0} (Defense {1}, {2}) selected Base {3}", 
                                player._alias, playerClass, build, selectedBase)); // Orange for defense selection
                        }
                    }
                }

                // Check if phase can complete early
                CheckPhase4Complete();
            }
            catch (Exception ex)
            {
                _arena.sendArenaMessage(String.Format("!Error in Phase 4 polling: {0}", ex.Message)); // Red for error
            }
        }

        /// <summary>
        /// Check if player is on a base tile
        /// </summary>
        private bool CheckBaseTile(short playerPixelX, short playerPixelY, int tileX, int tileY)
        {
            int tilePixelX = tileX * COORD_MULTIPLIER;
            int tilePixelY = tileY * COORD_MULTIPLIER;

            double distance = Math.Sqrt(Math.Pow(playerPixelX - tilePixelX, 2) + Math.Pow(playerPixelY - tilePixelY, 2));
            return distance <= BASE_TILE_RADIUS_PIXELS;
        }

        /// <summary>
        /// Update Phase 4 ticker with remaining time
        /// </summary>
        private void UpdatePhase4Ticker(int now)
        {
            int timeRemaining = (_phaseTimeLimit - (now - _phaseStartTime)) / 1000;
            if (timeRemaining < 0) timeRemaining = 0;

            // Count only defense players for selection tracking
            var defensePlayers = _participatingPlayers.Where(p => 
                _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense").ToList();
            int defensePlayersSelected = _playerBaseChoices.Count;
            int totalDefensePlayers = defensePlayers.Count;

            _arena.setTicker(3, 1, 0, String.Format("OvD Phase 4: Defense Base Selection - {0}s remaining ({1}/{2} selected)", 
                timeRemaining, defensePlayersSelected, totalDefensePlayers));
        }

        /// <summary>
        /// Check if Phase 4 can complete early
        /// </summary>
        private void CheckPhase4Complete()
        {
            // Only check if all defense players have selected bases
            var defensePlayers = _participatingPlayers.Where(p => 
                _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense").ToList();
                
            if (_playerBaseChoices.Count >= defensePlayers.Count)
            {
                //_arena.sendArenaMessage("~All defense players have selected their bases!"); // Green for completion
                EndPhase4_BaseSelection();
            }
        }

        /// <summary>
        /// End Phase 4 and process base selections
        /// </summary>
        private void EndPhase4_BaseSelection()
        {
            _arena.setTicker(3, 1, 0, "");

            //_arena.sendArenaMessage("@=== Phase 4 Complete ==="); // Blue header

            // Get defense and offense players
            var defensePlayers = _participatingPlayers.Where(p => 
                _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense").ToList();
            var offensePlayers = _participatingPlayers.Where(p => 
                _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Offense").ToList();

            // Process any defense players who didn't make a base selection
            string[] availableBases = { "A5", "B8", "A7", "F5", "F6", "D7" };
            foreach (Player player in defensePlayers)
            {
                if (!_playerBaseChoices.ContainsKey(player))
                {
                    // Auto-assign first available base to defense players
                    var usedBases = _playerBaseChoices.Values.ToHashSet();
                    string autoBase = availableBases.FirstOrDefault(b => !usedBases.Contains(b)) ?? "A5";
                    _playerBaseChoices[player] = autoBase;
                    _arena.sendArenaMessage(String.Format("&{0} (Defense) auto-assigned to Base {1}", player._alias, autoBase)); // Orange for defense auto-assignment
                }
            }

            // Offense players don't select bases - they attack whatever base(s) defense selected
            string selectedBases = string.Join(", ", _playerBaseChoices.Values.Distinct());
            _arena.sendArenaMessage(String.Format("&DEFENSE selected base(s): {0}", selectedBases)); // Orange for defense
            _arena.sendArenaMessage("*OFFENSE will attack the selected base(s)"); // Pink for offense

            // Display base assignments for defense only
            if (defensePlayers.Any())
            {
                var defenseBases = defensePlayers.Where(p => _playerBaseChoices.ContainsKey(p))
                    .Select(p => String.Format("{0}({1})", p._alias, _playerBaseChoices[p]));
                //_arena.sendArenaMessage(String.Format("&DEFENSE BASES: {0}", String.Join(", ", defenseBases))); // Orange for defense
            }

            // Display offense players (no base assignments)
            if (offensePlayers.Any())
            {
                var offenseList = offensePlayers.Select(p => p._alias);
                //_arena.sendArenaMessage(String.Format("*OFFENSE TEAM: {0}", String.Join(", ", offenseList))); // Pink for offense
            }

            // Transition to Phase 5 - Match Setup
            //_arena.sendArenaMessage("~Proceeding to Phase 5: Match Setup..."); // Green for transition
            StartPhase5_MatchSetup();
        }

        #endregion

        #region Phase 5 - Match Setup

        /// <summary>
        /// Start Phase 5 - Match Setup
        /// </summary>
        private void StartPhase5_MatchSetup()
        {
            _currentPhase = OvDPhase.MatchSetup;
            _phaseStartTime = Environment.TickCount;
            _phaseTimeLimit = 30000; // 30 seconds for setup

            _arena.sendArenaMessage("@=== Phase 5: Match Setup ==="); // Blue header
            //_arena.sendArenaMessage("~Setting up teams, arena, and positions..."); // Green progress

            // Step 1: Assign players to teams based on base selections
            AssignPlayersToTeamsByBase();

            // Step 2: Mirror setup command logic (flags, drops, etc.)
            PerformArenaSetup();

            // Step 3: Use LoadPlaybook for base-specific positions and turrets
            LoadPlaybookForBases();

            // Step 4: Start the match with timer
            //_arena.sendArenaMessage("~Match setup complete! Starting game with 18-minute timer..."); // Green for completion
            StartMatchActive();
        }

        /// <summary>
        /// Assign players to teams based on base selections with consolidated team assignment per faction
        /// </summary>
        private void AssignPlayersToTeamsByBase()
        {
            //_arena.sendArenaMessage("~Assigning players to teams based on base selection..."); // Green progress

            // Reset assigned teams at start of each match
            _assignedTitanTeam = null;
            _assignedCollectiveTeam = null;

            foreach (Player player in _participatingPlayers)
            {
                if (!_playerBaseChoices.ContainsKey(player))
                    continue;

                string selectedBase = _playerBaseChoices[player];
                Team targetTeam = null;

                // Determine faction based on base selection and assign to consolidated team
                if (selectedBase == "D7" || selectedBase == "F6" || selectedBase == "F5")
                {
                    // Titan bases - use already assigned Titan team or find one
                    if (_assignedTitanTeam == null)
                    {
                        _assignedTitanTeam = FindRandomAvailableTeam(" T");
                    }
                    targetTeam = _assignedTitanTeam;
                }
                else if (selectedBase == "A5" || selectedBase == "A7" || selectedBase == "B8")
                {
                    // Collective bases - use already assigned Collective team or find one
                    if (_assignedCollectiveTeam == null)
                    {
                        _assignedCollectiveTeam = FindRandomAvailableTeam(" C");
                    }
                    targetTeam = _assignedCollectiveTeam;
                }

                if (targetTeam != null)
                {
                    // Use CTF's team assignment method
                    string playerClass = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : "Infantry";
                    _ctf.AssignPlayerToTeam(player, playerClass, targetTeam._name, false, true);
                    
                    _arena.sendArenaMessage(String.Format("#{0} assigned to {1} (Base {2})", 
                        player._alias, targetTeam._name, selectedBase)); // Yellow for assignment
                }
                else
                {
                    _arena.sendArenaMessage(String.Format("!Warning: Could not find available team for {0} (Base {1})", 
                        player._alias, selectedBase)); // Red for error
                }
            }
        }

        /// <summary>
        /// Find a random available team with the specified suffix pattern
        /// </summary>
        private Team FindRandomAvailableTeam(string teamSuffix)
        {
            List<Team> availableTeams = new List<Team>();
            
            // Collect all available teams with the specified suffix
            for (int i = 2; i <= 33; i++)
            {
                var cfgTeam = _arena._server._zoneConfig.teams[i];
                if (cfgTeam == null) continue;

                string teamName = cfgTeam.name;
                
                // Check if team name contains the desired suffix and is available
                if (teamName.Contains(teamSuffix))
                {
                    Team team = _arena.getTeamByName(teamName);
                    if (team != null)
                    {
                        // Check if team is available (not interfering with duel system)
                        bool hasNonDuelers = team.ActivePlayers.Any(p => 
                            !p._skills.Values.Any(s => s.skill.Name == "Dueler"));
                        
                        if (!hasNonDuelers)
                        {
                            availableTeams.Add(team); // Team is available
                        }
                    }
                }
            }
            
            // If we found available teams, pick one randomly
            if (availableTeams.Count > 0)
            {
                Random random = new Random();
                int randomIndex = random.Next(availableTeams.Count);
                return availableTeams[randomIndex];
            }
            
            return null; // No available team found
        }

        /// <summary>
        /// Perform arena setup similar to the setup command
        /// </summary>
        private void PerformArenaSetup()
        {
            _arena.sendArenaMessage("~Setting up arena flags and drops..."); // Green progress

            try
            {
                // Get the primary base used (first player's base or most common base)
                string primaryBase = GetPrimaryBaseUsed();
                
                if (String.IsNullOrEmpty(primaryBase))
                {
                    _arena.sendArenaMessage("!Warning: No base selected, using default setup"); // Red warning
                    primaryBase = "A5"; // Default fallback
                }

                // Mirror the setup command logic from CTF.cs
                var baseInfo = GetBaseInfo(primaryBase);
                if (baseInfo != null)
                {
                    // Get the main flag (Bridge3)
                    var mainFlag = _arena.getFlag("Bridge3");
                    if (mainFlag != null)
                    {
                        // FIXED: Use CTF.cs bases dictionary to get correct flag coordinates
                        var baseDefense = _ctf.bases[primaryBase];
                        
                        // Set flag position using flagX, flagY (not base x, y)
                        mainFlag.posX = baseDefense.flagX;
                        mainFlag.posY = baseDefense.flagY;
                        mainFlag.oldPosX = mainFlag.posX;
                        mainFlag.oldPosY = mainFlag.posY;
                        mainFlag.bActive = true;

                        // Assign flag to appropriate team based on base type
                        if (primaryBase == "D7" || primaryBase == "F6" || primaryBase == "F5")
                        {
                            // Titan base - assign to team with " T"
                            mainFlag.team = _arena.Teams.FirstOrDefault(t => t._name.Contains(" T") && t.ActivePlayerCount > 0);
                        }
                        else
                        {
                            // Collective base - assign to team with " C"
                            mainFlag.team = _arena.Teams.FirstOrDefault(t => t._name.Contains(" C") && t.ActivePlayerCount > 0);
                        }

                        Helpers.Object_Flags(_arena.Players, mainFlag);
                    }

                    // Move other flags out of the way (like setup command does)
                    MoveOtherFlagsAway();

                    // FIXED: Use exact same logic as CTF.cs setup command
                    // Set global baseUsed variable for CTF script compatibility
                    _ctf.baseUsed = primaryBase;
                    
                    // Spawn initial base items (like setup command does)
                    _arena.itemSpawn(_arena._server._assets.getItemByID(2005), 150, (short)(baseInfo.Item1 * 16), (short)(baseInfo.Item2 * 16), 100, null);
                    _arena.itemSpawn(_arena._server._assets.getItemByID(2009), 50, (short)(baseInfo.Item1 * 16), (short)(baseInfo.Item2 * 16), 100, null);
                    
                    // Use CTF.cs ManageFixedDropLocations method to spawn proper drop piles
                    _ctf.ManageFixedDropLocations();
                    
                    _arena.sendArenaMessage(String.Format("~Arena setup complete for base {0}", primaryBase)); // Green success
                }
            }
            catch (Exception ex)
            {
                _arena.sendArenaMessage(String.Format("!Error during arena setup: {0}", ex.Message)); // Red error
            }
        }

        /// <summary>
        /// Get the primary base used by players
        /// </summary>
        private string GetPrimaryBaseUsed()
        {
            if (_playerBaseChoices.Count == 0)
                return null;

            // Return the most commonly selected base
            return _playerBaseChoices.Values
                .GroupBy(b => b)
                .OrderByDescending(g => g.Count())
                .FirstOrDefault().Key;
        }

        /// <summary>
        /// Get base coordinates from CTF's bases dictionary
        /// </summary>
        private Tuple<int, int> GetBaseInfo(string baseName)
        {
            // These coordinates match CTF.cs bases dictionary
            switch (baseName.ToUpper())
            {
                case "A7": return Tuple.Create(19, 463);
                case "D7": return Tuple.Create(277, 495);
                case "F8": return Tuple.Create(450, 610);
                case "F5": return Tuple.Create(422, 370);
                case "A5": return Tuple.Create(57, 369);
                case "B6": return Tuple.Create(153, 445);
                case "B8": return Tuple.Create(147, 596);
                case "A8": return Tuple.Create(22, 574);
                case "A10": return Tuple.Create(100, 733);
                case "F6": return Tuple.Create(440, 456);
                case "H4": return Tuple.Create(600, 280);
                default: return Tuple.Create(57, 369); // Default to A5
            }
        }

        /// <summary>
        /// Move other flags away from play area
        /// </summary>
        private void MoveOtherFlagsAway()
        {
            var flagsToMove = new string[] { "Bridge1", "Hill201", "Hill86", "Bridge2" };
            
            foreach (string flagName in flagsToMove)
            {
                var flag = _arena.getFlag(flagName);
                if (flag != null)
                {
                    flag.posX = 50 * 16;
                    flag.posY = 30 * 16;
                    flag.oldPosX = flag.posX;
                    flag.oldPosY = flag.posY;
                    Helpers.Object_Flags(_arena.Players, flag);
                }
            }
        }



        /// <summary>
        /// Load playbook for base-specific positions and turrets
        /// </summary>
        private void LoadPlaybookForBases()
        {
            //_arena.sendArenaMessage("~Loading playbook positions and turrets..."); // Green progress

            try
            {
                // Get all unique bases selected by players
                var selectedBases = _playerBaseChoices.Values.Distinct().ToList();
                
                foreach (string baseName in selectedBases)
                {
                    // Call CTF's LoadPlaybook method for each base
                    _ctf.LoadPlaybook(baseName);
                    //_arena.sendArenaMessage(String.Format("~Loaded playbook for base {0}", baseName)); // Green success
                }
                
                if (selectedBases.Count == 0)
                {
                    // Fallback to default base
                    _ctf.LoadPlaybook("A5");
                    //_arena.sendArenaMessage("~Loaded default playbook (A5)"); // Green fallback
                }
            }
            catch (Exception ex)
            {
                //_arena.sendArenaMessage(String.Format("!Error loading playbooks: {0}", ex.Message)); // Red error
            }
        }

        /// <summary>
        /// Update Phase 5 ticker (brief setup phase)
        /// </summary>
        private void UpdatePhase5Ticker(int now)
        {
            int timeRemaining = (_phaseTimeLimit - (now - _phaseStartTime)) / 1000;
            if (timeRemaining < 0) timeRemaining = 0;

            _arena.setTicker(3, 1, 0, String.Format("OvD Phase 5: Match Setup - {0}s", timeRemaining));
        }

        #endregion

        #region Phase 6 - Match Active (Timer Management)

        /// <summary>
        /// Start the active match with 18-minute timer
        /// </summary>
        private void StartMatchActive()
        {
            _currentPhase = OvDPhase.MatchActive;
            _matchStartTime = Environment.TickCount;
            _warningMessageSent = false;
            
            // Reset countdown flags
            _countdownThreeSent = false;
            _countdownTwoSent = false;
            _countdownOneSent = false;
            _countdownGoSent = false;

            _arena.sendArenaMessage("~16-minute timer set, go on 15:00!", 4);

            // Start the match ticker
            UpdateMatchTimer(_matchStartTime);
        }

        /// <summary>
        /// Update the match timer ticker and check for end conditions
        /// </summary>
        private void UpdateMatchTimer(int now)
        {
            if (_matchStartTime == 0) return;

            int elapsed = now - _matchStartTime;
            int remaining = MATCH_DURATION_MS - elapsed;
            
            // Check for warning message at 45 seconds elapsed (15:15 remaining)
            if (!_warningMessageSent && elapsed >= WARNING_TIME_MS)
            {
                _warningMessageSent = true;
                _arena.sendArenaMessage("@Both teams get ready, go on 15:00!"); // Blue announcement
            }
            
            if (remaining <= 0)
            {
                // Match time expired
                EndMatch();
                return;
            }

            // Calculate minutes and seconds remaining
            int totalSecondsRemaining = remaining / 1000;
            int minutesRemaining = totalSecondsRemaining / 60;
            int secondsRemaining = totalSecondsRemaining % 60;

            // Check for countdown messages at exactly 15:03, 15:02, 15:01, and 15:00
            if (minutesRemaining == 15)
            {
                if (secondsRemaining == 3 && !_countdownThreeSent)
                {
                    _arena.sendArenaMessage("3..", 1);
                    _countdownThreeSent = true;
                }
                else if (secondsRemaining == 2 && !_countdownTwoSent)
                {
                    _arena.sendArenaMessage("2..", 1);
                    _countdownTwoSent = true;
                }
                else if (secondsRemaining == 1 && !_countdownOneSent)
                {
                    _arena.sendArenaMessage("1..", 1);
                    _countdownOneSent = true;
                }
                else if (secondsRemaining == 0 && !_countdownGoSent)
                {
                    _arena.sendArenaMessage("GO!!!", 4);
                    _countdownGoSent = true;
                }
            }

            // Update ticker with time remaining
            _arena.setTicker(3, 1, 0, String.Format("Match Time: {0}:{1:00} remaining", 
                minutesRemaining, secondsRemaining));
        }



        /// <summary>
        /// End the match and restart automation from Phase 1
        /// </summary>
        private void EndMatch()
        {
            // ADDED: Save current participants as last round participants for fair playtime tracking
            _lastRoundParticipants.Clear();
            foreach (Player player in _participatingPlayers)
            {
                if (player != null)
                {
                    _lastRoundParticipants.Add(player._alias);
                }
            }
            

            
            // Clear ticker
            _arena.setTicker(3, 1, 0, "");
            
            _arena.sendArenaMessage("@=== MATCH ENDED ==="); // Blue header
            _arena.sendArenaMessage("~Starting new OvD automation round!"); // Green for restart
            
            // Show fair playtime info for next round
            if (_lastRoundParticipants.Count > 0)
            {
                _arena.sendArenaMessage(String.Format("#Last round players: {0}", String.Join(", ", _lastRoundParticipants))); // Yellow info
                _arena.sendArenaMessage("*Priority for next round goes to players who didn't play!"); // Pink priority info
            }
            
            // Reset current round tracking data (but keep _lastRoundParticipants for next round)
            _participatingPlayers.Clear();
            _notPlayingPlayers.Clear();
            _playerStartingPositions.Clear();
            _playerTeamChoices.Clear();
            _playerClassChoices.Clear();
            _playerBuildChoices.Clear();
            _playerBaseChoices.Clear();
            _matchStartTime = 0;
            _warningMessageSent = false;
            
            // Reset countdown flags
            _countdownThreeSent = false;
            _countdownTwoSent = false;
            _countdownOneSent = false;
            _countdownGoSent = false;
            
            // Automatically restart from Phase 1
            StartPhase1_PlayerSelection();
        }
        
        #endregion

        #region Movement Tracking
        
        /// <summary>
        /// Checks if players have moved and if phase can complete early
        /// </summary>
        private void CheckPlayerMovementBasedCompletion()
        {
            // FIXED: Use IsSpectator consistently instead of team name check
            var activePlayers = _arena.Players.Where(p => !p.IsSpectator).ToList();
            
            // For single player, if they've made a selection, complete immediately
            if (activePlayers.Count == 1 && (_participatingPlayers.Count > 0 || _notPlayingPlayers.Count > 0))
            {
                //_arena.sendArenaMessage("Only one player - completing phase immediately!");
                EndPhase1_PlayerSelection();
                return;
            }
            
            // Process any players who haven't moved recently using _lastMovement
            int twoMinutesAgo = Environment.TickCount - (2 * 60 * 1000); // 2 minutes ago in ticks
            foreach (Player player in activePlayers)
            {
                // Check if player hasn't moved in the last 2 minutes and hasn't made a selection
                bool hasntMadeSelection = !_participatingPlayers.Contains(player) && !_notPlayingPlayers.Contains(player);
                
                if (hasntMadeSelection && player._lastMovement < twoMinutesAgo)
                {
                    // Auto-spectate inactive players
                    _notPlayingPlayers.Add(player);
                    
                    Team npTeam = _arena.getTeamByName("np");
                    if (npTeam != null)
                        player.spec(npTeam);
                    else
                        player.spec();
                    
                    _arena.sendArenaMessage(String.Format("{0} hasn't moved and was spectated.", player._alias));
                }
            }
            
            // Check if all players have made selections
            CheckPhase1Complete();
        }
        
        #endregion

        #region Helper Methods
        
        // No helper methods needed - using direct pixel calculations now
        
        #endregion

        #region Test Commands
        
        /// <summary>
        /// Test command to start Phase 1
        /// </summary>
        public void TestPhase1()
        {
            StartPhase1_PlayerSelection();
        }
        
        /// <summary>
        /// Test command to stop OvD automation
        /// </summary>
        public void TestStopOvD()
        {
            StopOvDAutomation();
        }
        
        /// <summary>
        /// Test command to check auto-restart functionality
        /// </summary>
        public void TestAutoRestart()
        {
            CheckAutoRestart();
        }
        
        /// <summary>
        /// Test command to end current phase
        /// </summary>
        public void TestEndPhase()
        {
            switch (_currentPhase)
            {
                case OvDPhase.PlayerSelection:
                    EndPhase1_PlayerSelection();
                    break;
                case OvDPhase.TransitionCountdown:
                    EndTransitionCountdown();
                    break;
                case OvDPhase.ClassSideSelection:
                    EndPhase2_ClassSideSelection();
                    break;
                case OvDPhase.BuildSelection:
                    EndPhase3_BuildSelection();
                    break;
                case OvDPhase.BaseSelection:
                    EndPhase4_BaseSelection();
                    break;
                case OvDPhase.MatchSetup:
                    StartMatchActive();
                    break;
                case OvDPhase.MatchActive:
                    EndMatch();
                    break;
                case OvDPhase.Inactive:
                    // FIXED: Clear ticker when manually ending
                    _arena.setTicker(3, 1, 0, "");
                    _arena.sendArenaMessage("OvD automation is already inactive.");
                    break;
                default:
                    _arena.sendArenaMessage(String.Format("Current phase: {0}", _currentPhase));
                    break;
            }
        }
        
        /// <summary>
        /// Test command to check current status
        /// </summary>
        public void TestStatus()
        {
            _arena.sendArenaMessage(String.Format("OvD Enabled: {0}", _ovdEnabled ? "Yes" : "No"));
            _arena.sendArenaMessage(String.Format("Current Phase: {0}", _currentPhase));
            if (_currentPhase != OvDPhase.Inactive)
            {
                int timeElapsed = (Environment.TickCount - _phaseStartTime) / 1000;
                int timeLimit = _phaseTimeLimit / 1000;
                _arena.sendArenaMessage(String.Format("Time: {0}/{1} seconds", timeElapsed, timeLimit));
            }
            _arena.sendArenaMessage(String.Format("Participating: {0}", _participatingPlayers.Count));
            _arena.sendArenaMessage(String.Format("Not Playing: {0}", _notPlayingPlayers.Count));
            
            // ADDED: Show fair playtime priority information
            if (_lastRoundParticipants.Count > 0)
            {
                _arena.sendArenaMessage(String.Format("Last round participants: {0}", String.Join(", ", _lastRoundParticipants)));
                
                var activePlayers = _arena.Players.Where(p => !p.IsSpectator).ToList();
                var priorityPlayers = activePlayers.Where(p => !_lastRoundParticipants.Contains(p._alias)).ToList();
                
                if (priorityPlayers.Any())
                {
                    var priorityNames = priorityPlayers.Select(p => p._alias);
                    _arena.sendArenaMessage(String.Format("Priority players (didn't play last): {0}", String.Join(", ", priorityNames)));
                }
                else
                {
                    _arena.sendArenaMessage("No priority players currently online");
                }
            }
            else
            {
                _arena.sendArenaMessage("No previous round data - first round");
            }
            
            // Show additional Phase 2 info if applicable
            if (_currentPhase == OvDPhase.ClassSideSelection && (_playerTeamChoices.Count > 0 || _playerClassChoices.Count > 0))
            {
                int offenseCount = _playerTeamChoices.Values.Count(v => v == "Offense");
                int defenseCount = _playerTeamChoices.Values.Count(v => v == "Defense");
                _arena.sendArenaMessage(String.Format("Team Selections - Offense: {0}, Defense: {1}", offenseCount, defenseCount));
                
                // Show individual class selections
                foreach (Player player in _participatingPlayers)
                {
                    if (_playerTeamChoices.ContainsKey(player) && _playerClassChoices.ContainsKey(player))
                    {
                        _arena.sendArenaMessage(String.Format("  {0}: {1} {2}", player._alias, _playerTeamChoices[player], _playerClassChoices[player]));
                    }
                }
            }
            
            // Show additional Phase 3 info if applicable
            if (_currentPhase == OvDPhase.BuildSelection && _playerBuildChoices.Count > 0)
            {
                _arena.sendArenaMessage(String.Format("Build Selections: {0}/{1}", _playerBuildChoices.Count, _participatingPlayers.Count));
                
                // Show individual build selections
                foreach (Player player in _participatingPlayers)
                {
                    if (_playerBuildChoices.ContainsKey(player))
                    {
                        string playerClass = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : "Unknown";
                        _arena.sendArenaMessage(String.Format("  {0} ({1}): {2}", player._alias, playerClass, _playerBuildChoices[player]));
                    }
                }
            }
            
            // Show additional Phase 4 info if applicable
            if (_currentPhase == OvDPhase.BaseSelection && _playerBaseChoices.Count > 0)
            {
                var defensePlayers = _participatingPlayers.Where(p => 
                    _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Defense").ToList();
                var offensePlayers = _participatingPlayers.Where(p => 
                    _playerTeamChoices.ContainsKey(p) && _playerTeamChoices[p] == "Offense").ToList();
                    
                _arena.sendArenaMessage(String.Format("Base Selections: {0}/{1} defense players selected", _playerBaseChoices.Count, defensePlayers.Count));
                
                // Show defense base selections
                foreach (Player player in defensePlayers)
                {
                    if (_playerBaseChoices.ContainsKey(player))
                    {
                        string playerClass = _playerClassChoices.ContainsKey(player) ? _playerClassChoices[player] : "Unknown";
                        _arena.sendArenaMessage(String.Format("  {0} (Defense {1}): Base {2}", player._alias, playerClass, _playerBaseChoices[player]));
                    }
                }
                
                // Show offense players (no base selection)
                if (offensePlayers.Any())
                {
                    var offenseList = offensePlayers.Select(p => p._alias);
                    _arena.sendArenaMessage(String.Format("  OFFENSE (no base selection): {0}", String.Join(", ", offenseList)));
                }
            }
            
            // Show Phase 5 info if applicable
            if (_currentPhase == OvDPhase.MatchSetup)
            {
                _arena.sendArenaMessage("Match Setup in progress...");
            }
            
            // Show Phase 6 info if applicable
            if (_currentPhase == OvDPhase.MatchActive && _matchStartTime > 0)
            {
                int elapsed = (Environment.TickCount - _matchStartTime) / 1000;
                int elapsedMinutes = elapsed / 60;
                int elapsedSeconds = elapsed % 60;
                
                int remaining = (MATCH_DURATION_MS - (Environment.TickCount - _matchStartTime)) / 1000;
                int remainingMinutes = Math.Max(0, remaining / 60);
                int remainingSecondsDisplay = Math.Max(0, remaining % 60);
                
                _arena.sendArenaMessage(String.Format("Match Active: {0}:{1:00} elapsed, {2}:{3:00} remaining", 
                    elapsedMinutes, elapsedSeconds, remainingMinutes, remainingSecondsDisplay));
                _arena.sendArenaMessage(String.Format("Warning sent: {0}", _warningMessageSent ? "Yes" : "No"));
            }
        }
        
        /// <summary>
        /// Test command to start Phase 2 directly
        /// </summary>
        public void TestPhase2()
        {
            if (_participatingPlayers.Count < 1)
            {
                _arena.sendArenaMessage("Need at least 1 participating player for Phase 2 test!");
                return;
            }
            StartPhase2_ClassSideSelection();
        }
        
        /// <summary>
        /// Test command to start Phase 3 directly
        /// </summary>
        public void TestPhase3()
        {
            if (_participatingPlayers.Count < 1)
            {
                _arena.sendArenaMessage("Need at least 1 participating player for Phase 3 test!");
                return;
            }
            StartPhase3_BuildSelection();
        }
        
        /// <summary>
        /// Test command to start Phase 4 directly
        /// </summary>
        public void TestPhase4()
        {
            if (_participatingPlayers.Count < 1)
            {
                _arena.sendArenaMessage("Need at least 1 participating player for Phase 4 test!");
                return;
            }
            StartPhase4_BaseSelection();
        }
        
        /// <summary>
        /// Test command to start Phase 5 directly
        /// </summary>
        public void TestPhase5()
        {
            if (_participatingPlayers.Count < 1)
            {
                _arena.sendArenaMessage("Need at least 1 participating player for Phase 5 test!");
                return;
            }
            StartPhase5_MatchSetup();
        }
        
        /// <summary>
        /// Test command to clear last round participants (reset priority)
        /// </summary>
        public void TestClearLastRound()
        {
            int previousCount = _lastRoundParticipants.Count;
            _lastRoundParticipants.Clear();
            _arena.sendArenaMessage(String.Format("Cleared {0} last round participants - all players now have equal priority", previousCount));
        }
        
        /// <summary>
        /// Test command to manually set current participating players as last round (for testing priority)
        /// </summary>
        public void TestSetLastRound()
        {
            _lastRoundParticipants.Clear();
            foreach (Player player in _participatingPlayers)
            {
                if (player != null)
                {
                    _lastRoundParticipants.Add(player._alias);
                }
            }
            
            if (_lastRoundParticipants.Count > 0)
            {
                _arena.sendArenaMessage(String.Format("Set last round participants: {0}", String.Join(", ", _lastRoundParticipants)));
                _arena.sendArenaMessage("Other players now have priority for next round");
            }
            else
            {
                _arena.sendArenaMessage("No participating players to set as last round");
            }
        }
        
        #endregion
    }
} 