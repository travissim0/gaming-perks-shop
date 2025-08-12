using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.IO;
using InfServer.Game;
using InfServer.Protocol;
using Assets;

namespace InfServer.Script.GameType_CTF
{
    // Save/load state logic for Script_CTF extracted into a partial class
    partial class Script_CTF
    {
        // SAVE STATE SECTION

        // Class to store player state information
        private class PlayerState
        {
            public short PosX { get; set; }
            public short PosY { get; set; }
            public byte Yaw { get; set; }
            public ushort Direction { get; set; }
            public short VelocityX { get; set; }
            public short VelocityY { get; set; }
            public short Energy { get; set; }
            public short Health { get; set; }
            public Dictionary<string, int> ItemCounts { get; set; }
            public long DeathTime { get; set; }
            public bool IsOnVehicle { get; set; }
            public int VehicleId { get; set; }
            public string Skill { get; set; }

            public PlayerState()
            {
                ItemCounts = new Dictionary<string, int>();
                Skill = "";
            }
        }

        // Class to store vehicle state information
        private class VehicleState
        {
            public short PosX { get; set; }
            public short PosY { get; set; }
            public byte Yaw { get; set; }
            public short VelocityX { get; set; }
            public short VelocityY { get; set; }
            public short Energy { get; set; }
            public short Health { get; set; }
            public ushort Direction { get; set; }
            public bool IsDestroyed { get; set; } // Track if the vehicle was destroyed
            public int VehicleTypeId { get; set; } // Store the vehicle type ID
            public Team Team { get; set; } // Store the team
        }

        // Dictionary to store multiple saved game states
        // Key: state name, Value: Dictionary of player states
        private Dictionary<string, Dictionary<string, PlayerState>> savedGameStates = new Dictionary<string, Dictionary<string, PlayerState>>();
        // Dictionary to store multiple saved flag states
        // Key: state name, Value: Dictionary of flag states
        private Dictionary<string, Dictionary<int, Arena.FlagState>> savedFlagStates = new Dictionary<string, Dictionary<int, Arena.FlagState>>();

        // Dictionary to store multiple saved vehicle states
        // Key: state name, Value: Dictionary of vehicle states
        private Dictionary<string, Dictionary<int, VehicleState>> savedVehicleStates = new Dictionary<string, Dictionary<int, VehicleState>>();

        // Dictionary to store previously loaded vehicles to prevent recreation
        private Dictionary<Tuple<string, int>, Vehicle> loadedVehicles = new Dictionary<Tuple<string, int>, Vehicle>();

        // Variables for auto-save functionality
        private int lastAutoSaveTime = 0;
        private const int AUTO_SAVE_INTERVAL = 30000; // 30 seconds in milliseconds

        private bool isAutoSaving = false;
        private System.Threading.Timer autoSaveTimer;

        private string currentLoadedState = null;

        /// <summary>
        /// Loads the next available state in chronological order
        /// </summary>
        private void LoadNextState(Player player)
        {
            if (savedGameStates.Count == 0)
            {
                player.sendMessage(-1, "No saved states available.");
                return;
            }

            // Get all state names and sort them chronologically
            var states = savedGameStates.Keys.OrderBy(s =>
            {
                string[] parts = s.Split(':');
                int min = 0;
                int sec = 0;
                if (parts.Length == 2 && int.TryParse(parts[0], out min) && int.TryParse(parts[1], out sec))
                {
                    return min * 60 + sec;
                }
                return 0;
            }).ToList();

            // Find index of current state
            int currentIndex = currentLoadedState == null ? -1 : states.IndexOf(currentLoadedState);
            
            // Get next state (wrap around to beginning if at end)
            int nextIndex = (currentIndex + 1) % states.Count;
            string nextState = states[nextIndex];
            
            // Load the next state
            LoadState(nextState);
            currentLoadedState = nextState;

            // Get the state that would be next after this one
            string followingState = states[(nextIndex + 1) % states.Count];
            
            // Notify player
            player.sendMessage(0, string.Format("Loaded state '{0}'. Next available state: '{1}'", nextState, followingState));
        }

        /// <summary>
        /// Checks if it's time for an auto-save and performs it if needed
        /// </summary>
        private void CheckAutoSave()
        {
            if (!isAutoSaving)
                return;

            // Calculate game time in milliseconds
            int gameTimeMs = Environment.TickCount - arena._tickGameStarted;
            
            // Calculate minutes and seconds based on game time
            int totalSeconds = gameTimeMs / 1000;
            int minutes = totalSeconds / 60;
            int seconds = totalSeconds % 60;
            
            // Round down to nearest 30 second mark
            seconds = (seconds / 30) * 30;
            
            // Format the save state name (e.g., "2:30" for 2 minutes 30 seconds)
            string stateName = string.Format("{0}:{1:D2}", minutes, seconds);
            
            // Perform the save
            SaveState(stateName);
        }

        /// <summary>
        /// Starts or stops the auto-save timer based on command
        /// </summary>
        private void ToggleAutoSave(Player player, bool enable)
        {
            if (enable && !isAutoSaving)
            {
                // Start the auto-save timer
                isAutoSaving = true;
                lastAutoSaveTime = Environment.TickCount;

                // Save initial state at 0:00
                SaveState("0:00");

                // Calculate time until next 30 second mark
                int gameTimeMs = Environment.TickCount - arena._tickGameStarted;
                int msUntilNext30 = AUTO_SAVE_INTERVAL - (gameTimeMs % AUTO_SAVE_INTERVAL);

                autoSaveTimer = new System.Threading.Timer(
                    _ => CheckAutoSave(),
                    null,
                    msUntilNext30, // Initial delay until next 30 second mark
                    AUTO_SAVE_INTERVAL
                );
                player.sendMessage(0, "Auto-save enabled. Saving every 30 seconds.");
            }
            else if (!enable && isAutoSaving)
            {
                // Stop the auto-save timer
                isAutoSaving = false;
                autoSaveTimer.Dispose();
                autoSaveTimer = null;
                player.sendMessage(0, "Auto-save disabled.");
            }
        }

        /// <summary>
        /// Saves the current state of all players and vehicles in the arena with the given state name
        /// </summary>
        private void SaveState(string stateName)
        {
            if (string.IsNullOrEmpty(stateName))
            {
                arena.sendArenaMessage("State name cannot be empty.");
                return;
            }

            int respawnDelay = CFG.timing.enterDelay;
            Dictionary<string, PlayerState> stateDict = new Dictionary<string, PlayerState>();
            Dictionary<int, VehicleState> vehicleStateDict = new Dictionary<int, VehicleState>();
            Dictionary<int, Arena.FlagState> flagStateDict = new Dictionary<int, Arena.FlagState>();

            // Store all flag states
            foreach (Arena.FlagState flag in arena._flags.Values)
            {
                if (flag == null)
                    continue;

                // Create a deep copy of the flag state
                Arena.FlagState flagCopy = new Arena.FlagState();
                flagCopy.flag = flag.flag;
                flagCopy.team = flag.team;
                flagCopy.posX = flag.posX;
                flagCopy.posY = flag.posY;
                flagCopy.oldPosX = flag.oldPosX;
                flagCopy.oldPosY = flag.oldPosY;
                flagCopy.bActive = flag.bActive;
                flagCopy.carrier = flag.carrier;

                flagStateDict[flag.flag.GeneralData.Id] = flagCopy;
            }

            foreach (Player player in arena.Players)
            {
                if (player == null || player.IsSpectator)
                    continue;

                PlayerState state = new PlayerState
                {
                    PosX = player._state.positionX,
                    PosY = player._state.positionY,
                    Yaw = player._state.yaw,
                    VelocityX = player._state.velocityX,
                    VelocityY = player._state.velocityY,
                    Energy = player._state.energy,
                    Health = player._state.health,
                    Direction = (ushort)player._state.direction,
                    DeathTime = player._deathTime,
                    IsOnVehicle = player._occupiedVehicle != null,
                    VehicleId = player._occupiedVehicle != null ? player._occupiedVehicle._type.Id : -1,
                    Skill = GetPrimarySkillName(player)
                };

                if (player.IsDead)
                {
                    int deathDuration = Environment.TickCount - player._deathTime;
                    state.DeathTime = respawnDelay - deathDuration;
                }
                else
                {
                    state.DeathTime = 0;
                }

                // Save all items in inventory
                foreach (var item in player._inventory)
                {
                    if (item.Value != null && item.Value.item != null)
                    {
                        string itemName = item.Value.item.name;
                        int count = item.Value.quantity;
                        state.ItemCounts[itemName] = count;
                    }
                }

                stateDict[player._alias] = state;
            }

            // Save vehicle states
            foreach (Vehicle vehicle in arena.Vehicles)
            {
                if (vehicle == null)
                    continue;

                VehicleState state = new VehicleState
                {
                    PosX = vehicle._state.positionX,
                    PosY = vehicle._state.positionY,
                    Yaw = vehicle._state.yaw,
                    VelocityX = vehicle._state.velocityX,
                    VelocityY = vehicle._state.velocityY,
                    Energy = vehicle._state.energy,
                    Health = vehicle._state.health,
                    Direction = (ushort)vehicle._state.direction,
                    IsDestroyed = vehicle._state.health <= 0,
                    VehicleTypeId = vehicle._type.Id,
                    Team = vehicle._team
                };

                vehicleStateDict[vehicle._id] = state;
            }

            // Store the state dictionaries under the provided state name
            savedGameStates[stateName] = stateDict;
            savedVehicleStates[stateName] = vehicleStateDict;
            savedFlagStates[stateName] = flagStateDict;
            if (stateName == "0:00")
            {
                arena.sendArenaMessage("Game states will auto-save every 30 seconds (e.g. 0:00, 0:30, 1:00, 1:30, etc)");
            }
        }

        /// <summary>
        /// Exports the saved state to a CSV file in the SaveStates folder
        /// </summary>
        private void ExportStateToCSV(Player player, string stateName, string fileName)
        {
            if (string.IsNullOrEmpty(stateName))
            {
                player.sendMessage(-1, "State name cannot be empty.");
                return;
            }

            if (!savedGameStates.ContainsKey(stateName))
            {
                player.sendMessage(-1, string.Format("No saved state found with the name '{0}'.", stateName));
                return;
            }

            if (string.IsNullOrEmpty(fileName))
            {
                fileName = stateName.Replace(":", "-"); // Replace colons with hyphens for file name
            }

            // Create directory structure
            string baseDir = "SaveStates";
            string playerDir = System.IO.Path.Combine(baseDir, player._alias);
            string fullPath = System.IO.Path.Combine(playerDir, fileName + ".csv");

            try
            {
                // Create directories if they don't exist
                if (!System.IO.Directory.Exists(baseDir))
                    System.IO.Directory.CreateDirectory(baseDir);
                
                if (!System.IO.Directory.Exists(playerDir))
                    System.IO.Directory.CreateDirectory(playerDir);

                // Create CSV content
                using (System.IO.StreamWriter writer = new System.IO.StreamWriter(fullPath))
                {
                    // Write header for player data
                    writer.WriteLine("DataType,PlayerAlias,PosX,PosY,Yaw,Direction,VelocityX,VelocityY,Energy,Health,DeathTime,IsOnVehicle,VehicleId,Skill,Items");

                    // Write player data
                    Dictionary<string, PlayerState> playerStates = savedGameStates[stateName];
                    foreach (var kvp in playerStates)
                    {
                        string playerAlias = kvp.Key;
                        PlayerState state = kvp.Value;
                        
                        // Format items as a semicolon-separated list of "itemName:count"
                        string items = string.Join(";", state.ItemCounts.Select(i => string.Format("{0}:{1}", i.Key, i.Value)));
                        
                        writer.WriteLine(string.Format("Player,{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13}", 
                            playerAlias, state.PosX, state.PosY, state.Yaw, state.Direction, state.VelocityX, state.VelocityY, 
                            state.Energy, state.Health, state.DeathTime, state.IsOnVehicle, state.VehicleId, state.Skill, items));
                    }

                    // Write header for vehicle data
                    writer.WriteLine("\nDataType,VehicleId,PosX,PosY,Yaw,Direction,VelocityX,VelocityY,Energy,Health,IsDestroyed,VehicleTypeId,Team");

                    // Write vehicle data
                    Dictionary<int, VehicleState> vehicleStates = savedVehicleStates[stateName];
                    foreach (var kvp in vehicleStates)
                    {
                        int vehicleId = kvp.Key;
                        VehicleState state = kvp.Value;
                        string teamName = state.Team != null ? state.Team._name : "None";
                        
                        writer.WriteLine(string.Format("Vehicle,{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11}", 
                            vehicleId, state.PosX, state.PosY, state.Yaw, state.Direction, state.VelocityX, state.VelocityY, 
                            state.Energy, state.Health, state.IsDestroyed, state.VehicleTypeId, teamName));
                    }

                    // Write header for flag data
                    writer.WriteLine("\nDataType,FlagId,PosX,PosY,OldPosX,OldPosY,Active,Team,Carrier");

                    // Write flag data
                    Dictionary<int, Arena.FlagState> flagStates = savedFlagStates[stateName];
                    foreach (var kvp in flagStates)
                    {
                        int flagId = kvp.Key;
                        Arena.FlagState state = kvp.Value;
                        string teamName = state.team != null ? state.team._name : "None";
                        string carrierName = state.carrier != null ? state.carrier._alias : "None";
                        
                        writer.WriteLine(string.Format("Flag,{0},{1},{2},{3},{4},{5},{6},{7}", 
                            flagId, state.posX, state.posY, state.oldPosX, state.oldPosY, state.bActive, teamName, carrierName));
                    }
                }

                player.sendMessage(0, string.Format("State '{0}' exported to {1}", stateName, fullPath));
            }
            catch (Exception ex)
            {
                player.sendMessage(-1, string.Format("Error exporting state: {0}", ex.Message));
                Log.write(TLog.Error, string.Format("Error exporting state: {0}", ex));
            }
        }

        /// <summary>
        /// Loads the previously saved state for all players and vehicles with the given state name
        /// </summary>
        private void LoadState(string stateName)
        {
            int respawnDelay = CFG.timing.enterDelay;
            if (string.IsNullOrEmpty(stateName))
            {
                arena.sendArenaMessage("State name cannot be empty.");
                return;
            }

            if (!savedGameStates.ContainsKey(stateName) || !savedVehicleStates.ContainsKey(stateName))
            {
                arena.sendArenaMessage(string.Format("No saved state found with the name '{0}'.", stateName));
                return;
            }

            Dictionary<string, PlayerState> savedGameState = savedGameStates[stateName];
            Dictionary<int, VehicleState> savedVehicleState = savedVehicleStates[stateName];
            Dictionary<int, Arena.FlagState> savedFlagState = savedFlagStates[stateName];

            // Load all flag states
            foreach (var kvp in savedFlagState)
            {
                int flagId = kvp.Key;
                Arena.FlagState savedFlag = kvp.Value;
                Arena.FlagState currentFlag = arena._flags.Values.FirstOrDefault(f => f.flag.GeneralData.Id == flagId);
                
                if (currentFlag != null)
                {
                    currentFlag.team = savedFlag.team;
                    currentFlag.posX = savedFlag.posX;
                    currentFlag.posY = savedFlag.posY;
                    currentFlag.oldPosX = savedFlag.oldPosX;
                    currentFlag.oldPosY = savedFlag.oldPosY;
                    currentFlag.bActive = savedFlag.bActive;
                    currentFlag.carrier = savedFlag.carrier;

                    // Update flag visually for all players
                    Helpers.Object_Flags(arena.Players, currentFlag);
                }
            }

            foreach (Player player in arena.Players)
            {
                if (player == null || player.IsSpectator || !savedGameState.ContainsKey(player._alias))
                {
                    continue;
                }

                PlayerState state = savedGameState[player._alias];

                // Create an ObjectState with the saved position and state
                Helpers.ObjectState newState = new Helpers.ObjectState
                {
                    positionX = state.PosX,
                    positionY = state.PosY,
                    positionZ = 0,
                    yaw = state.Yaw,
                    velocityX = state.VelocityX,
                    velocityY = state.VelocityY,
                    energy = state.Energy,
                    health = state.Health,
                    direction = (Helpers.ObjectState.Direction)state.Direction
                };
                ChangePlayerSkill(player, state.Skill);
                player.resetWarp();
                player.resetState(false, false, false);

                // Warp the player to restore position and state
                player.warp(Helpers.ResetFlags.ResetAll, newState, state.Health, state.Energy, (byte)state.Yaw);

                // Check if the player was on a vehicle and restore the vehicle state
                if (state.IsOnVehicle && state.VehicleId != -1)
                {
                    Vehicle vehicleToOccupy = player._arena.Vehicles.FirstOrDefault(v => v._type.Id == state.VehicleId);
                    if (vehicleToOccupy != null)
                    {
                        if (vehicleToOccupy._inhabitant == null)
                        {
                            player.enterVehicle(vehicleToOccupy);
                            // Directly update the vehicle's state after entering
                            vehicleToOccupy._state.positionX = state.PosX;
                            vehicleToOccupy._state.positionY = state.PosY;
                            vehicleToOccupy._state.velocityX = state.VelocityX;
                            vehicleToOccupy._state.velocityY = state.VelocityY;
                            vehicleToOccupy._state.yaw = state.Yaw;
                            vehicleToOccupy._state.direction = (Helpers.ObjectState.Direction)state.Direction;
                            vehicleToOccupy._state.energy = state.Energy;
                            vehicleToOccupy._state.health = state.Health;
                        }
                    }
                }

                // After warping, directly update the player's vehicle state
                Vehicle vehicle = player._occupiedVehicle ?? player._baseVehicle;
                if (vehicle != null)
                {
                    vehicle._state.positionX = state.PosX;
                    vehicle._state.positionY = state.PosY;
                    vehicle._state.velocityX = state.VelocityX;
                    vehicle._state.velocityY = state.VelocityY;
                    vehicle._state.yaw = state.Yaw;
                    vehicle._state.direction = (Helpers.ObjectState.Direction)state.Direction;
                    vehicle._state.energy = state.Energy;
                    vehicle._state.health = state.Health;

                    // Check if the player was dead when the state was saved
                    if (state.Health <= 0)
                    {
                        // Simulate death
                        vehicle._state.health = 0;
                        vehicle._tickDead = Environment.TickCount - (int)(Environment.TickCount - state.DeathTime);
                        player._deathTime = vehicle._tickDead;
                        vehicle.kill(null);
                    }
                    else
                    {
                        // Player was alive, restore health
                        vehicle._state.health = state.Health;
                        vehicle._tickDead = 0;
                    }
                }
                else
                {
                    player.sendMessage(-1, "Error: Unable to update vehicle state because vehicle is null.");
                }

                if (state.IsOnVehicle && state.VehicleId != -1)
                {
                    Vehicle vehicleToOccupy = player._arena.Vehicles.FirstOrDefault(v => v._type.Id == state.VehicleId);
                    if (vehicleToOccupy != null)
                    {
                        if (vehicleToOccupy._inhabitant == null)
                        {
                            player.enterVehicle(vehicleToOccupy);
                            // Restore the velocity of the vehicle after entering it
                            vehicleToOccupy._state.velocityX = state.VelocityX;
                            vehicleToOccupy._state.velocityY = state.VelocityY;
                        }
                    }
                }

                // Warp the player to restore position and state again
                player.warp(Helpers.ResetFlags.ResetAll, newState, state.Health, state.Energy, (byte)state.Yaw);

                if (vehicle != null)
                {
                    vehicle._state.positionX = state.PosX;
                    vehicle._state.positionY = state.PosY;
                    vehicle._state.velocityX = state.VelocityX;
                    vehicle._state.velocityY = state.VelocityY;
                    vehicle._state.yaw = state.Yaw;
                    vehicle._state.direction = (Helpers.ObjectState.Direction)state.Direction;
                    vehicle._state.energy = state.Energy;
                    vehicle._state.health = state.Health;

                    if (state.Health <= 0)
                    {
                        vehicle._state.health = 0;
                        vehicle._tickDead = Environment.TickCount - (int)(Environment.TickCount - state.DeathTime);
                        player._deathTime = vehicle._tickDead;
                        vehicle.kill(null);
                    }
                    else
                    {
                        vehicle._state.health = state.Health;
                        vehicle._tickDead = 0;
                        player._deathTime = 0;
                    }

                    vehicle.update(false);

                    SC_PlayerUpdate stateUpdate = new SC_PlayerUpdate
                    {
                        tickUpdate = Environment.TickCount,
                        player = player,
                        vehicle = vehicle,
                        itemID = 0, // No item used
                        bBot = false,
                        activeEquip = null
                    };

                    stateUpdate.vehicle._state = vehicle._state;
                    player._client.sendReliable(stateUpdate);
                }

                // Clear current inventory
                player._inventory.Clear();

                // Restore all saved items
                foreach (var itemPair in state.ItemCounts)
                {
                    ItemInfo item = AssetManager.Manager.getItemByName(itemPair.Key);
                    if (item != null)
                    {
                        player.inventoryModify(item, (ushort)itemPair.Value);
                    }
                }

                player.syncInventory();
                player.syncState();
            }

            // Remove any computer vehicles that were created after the save state
            foreach (Vehicle v in arena.Vehicles.ToList())
            {
                if (v != null && !savedVehicleState.ContainsKey(v._id))
                {
                    v.kill(null);
                }
            }

            // Restore computer vehicle states
            foreach (KeyValuePair<int, VehicleState> kvp in savedVehicleState)
            {
                int savedId = kvp.Key;
                VehicleState state = kvp.Value;

                // Immediately after retrieving VehicleState state and before checking loadedVehicles
                int savedHealth = state.Health;

                // Check if we have a loaded vehicle or one in the arena
                Vehicle vehicle;
                if (!loadedVehicles.TryGetValue(Tuple.Create(stateName, savedId), out vehicle))
                {
                    // Attempt to find an existing vehicle by ID
                    vehicle = arena.Vehicles.FirstOrDefault(v => v != null && v._id == savedId);
                }

                // If the saved state says the vehicle should be alive (health > 0) but we either have no vehicle or a dead one, recreate it
                if (savedHealth > 0 && (vehicle == null || vehicle._state.health <= 0))
                {
                    // Remove any stale reference
                    loadedVehicles.Remove(Tuple.Create(stateName, savedId));

                    VehInfo vehicleInfo = AssetManager.Manager.getVehicleByID(state.VehicleTypeId);
                    if (vehicleInfo != null)
                    {
                        Helpers.ObjectState objState = new Helpers.ObjectState
                        {
                            positionX = state.PosX,
                            positionY = state.PosY,
                            positionZ = 0,
                            yaw = state.Yaw,
                            velocityX = state.VelocityX,
                            velocityY = state.VelocityY,
                            energy = state.Energy,
                            health = state.Health,
                            direction = (Helpers.ObjectState.Direction)state.Direction
                        };

                        // Recreate the vehicle since it should exist at this saved state
                        vehicle = arena.newVehicle(vehicleInfo, state.Team, null, objState);
                        loadedVehicles[Tuple.Create(stateName, savedId)] = vehicle;

                        // Update vehicle state to sync immediately
                        vehicle.update(false);
                    }
                }
                // If the saved state says the vehicle was destroyed (health <= 0) and we currently have one, kill it
                else if (savedHealth <= 0 && vehicle != null)
                {
                    vehicle._state.health = 0;
                    vehicle.kill(null);
                }

                // If we have a vehicle and it should be alive, update it
                if (vehicle != null && savedHealth > 0)
                {
                    vehicle._state.positionX = state.PosX;
                    vehicle._state.positionY = state.PosY;
                    vehicle._state.velocityX = state.VelocityX;
                    vehicle._state.velocityY = state.VelocityY;
                    vehicle._state.yaw = state.Yaw;
                    vehicle._state.direction = (Helpers.ObjectState.Direction)state.Direction;
                    vehicle._state.energy = state.Energy;
                    vehicle._state.health = state.Health;

                    // Update vehicle state consistently for all vehicle types
                    vehicle.update(false);
                }
            }

            arena.sendArenaMessage(string.Format("Game state '{0}' has been loaded.", stateName));
        }

        /// <summary>
        /// Loads a state with a pause and countdown before resuming gameplay
        /// </summary>
        private void LoadStatePause(string stateName)
        {
            if (string.IsNullOrEmpty(stateName))
            {
                return;
            }

            if (!savedGameStates.ContainsKey(stateName) || !savedVehicleStates.ContainsKey(stateName))
            {
                //arena.sendArenaMessage(string.Format("No saved state found with the name '{0}'.", stateName));
                return;
            }

            // Load the state initially
            LoadState(stateName);

            // Make all players invincible and freeze their energy
            foreach (Player player in arena.Players)
            {
                if (player == null || player.IsSpectator)
                    continue;

                // Change the players baseVehicle to a Paused Vehicle (id 159)
                player.setDefaultVehicle(AssetManager.Manager.getVehicleByID(159));
                player.resetInventory(true);

                // ItemInfo pausedItem = AssetManager.Manager.getItemByName("Paused");
                // if (pausedItem != null)
                // {
                //     player.inventoryModify(pausedItem, 1);
                // }
            }

            // Start the countdown timer
            arena.sendArenaMessage("Game paused for countdown...");
            
            // Create a timer for the countdown
            System.Threading.Timer countdownTimer = null;
            int countdown = 3;
            
            countdownTimer = new System.Threading.Timer((state) =>
            {
                if (countdown > 0)
                {
                    arena.sendArenaMessage(string.Format("&{0}...", countdown), 4);
                    countdown--;
                }
                else
                {
                    arena.sendArenaMessage("GO!", 1);
                    LoadState(stateName);
                    countdownTimer.Dispose();
                }
            }, null, 0, 1000);
        }
    }
}


