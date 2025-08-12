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
using Assets;

using Axiom.Math;
using Bnoerj.AI.Steering;

namespace InfServer.Script.CTFBot
{
    /// <summary>
    /// CTFBot - Based on proven ArenaBot system for reliable bot vs bot combat
    /// </summary>
    public class CTFBot : Bot
    {
        ///////////////////////////////////////////////////
        // Member Variables (from proven ArenaBot)
        ///////////////////////////////////////////////////
        private Random _rand;
        private SteeringController _steering;

        // Target management
        private Bot _currentBotTarget;
        private Vehicle _currentVehicleTarget;
        private int _tickLastTargetSearch;
        private int _tickTargetLockOn;

        // Combat behavior
        private CombatBehavior _currentBehavior;
        private int _tickBehaviorChange;
        private int _tickLastStrafe;
        private bool _strafeLeft;

        // Combat parameters
        private float _optimalRange = 350f;
        private float _maxRange = 1400f;
        private float _fireDist = 600f;
        private float _shortDist = 250f;
        private float _runDist = 180f;
        private float _accuracy = 0.85f;

        // Weapon management (from DuelBot)
        private int _currentWeaponIndex = 0;
        
        // ADDED: Target tracking variables from DuelBot
        private int _lastValidTargetTime = 0;
        private const int _targetLossTimeout = 3000; // 3 seconds without line of sight before giving up
        private int _consecutiveLOSFailures = 0;
        private const int _maxLOSFailures = 6; // Max consecutive line of sight failures before giving up
        private Vector3 _lastKnownTargetPosition;
        private bool _hasLastKnownPosition = false;
        private int _lastTargetValidationTime = 0;
        private const int _targetValidationInterval = 500; // Check target validity every 500ms
        private Vehicle _recentlyLostTarget = null;
        private int _targetLossTime = 0;
        private const int _targetExclusionDuration = 5000; // Don't reacquire same target for 5 seconds
        
        // ADDED: Objective coordinate for fallback behavior
        private Vector3 _objectiveCoord = new Vector3(202 * 16, 202 * 16, 0);
        
        // Weapon Type Identification (from DuelBot)
        private enum WeaponType { AR, Shotgun, RifleGrenade, ACMk2, MicroMissile, Unknown }
        
        // Rifle Grenade state machine (from DuelBot)
        private enum RGState { Idle, Prefire, Fired }
        private RGState _rgState = RGState.Idle;
        private const int _rgPrefireTime = 1000;      // ms to pause and aim (1 second)
        private const int _rgFiredStateTime = 1000;   // ms to remain in fired state
        private int _rgStateEndTime = 0;

        // Maklov AC mk2 variables (from DuelBot)
        private enum ACState { Idle, Prefire, Firing, Cooldown }
        private ACState _acState = ACState.Idle;
        private const int _acPrefireTime = 300;      // ms to pause and aim
        private const int _acShotsPerClip = 5;
        private const int _acClipsToFire = 3;        // Fire 2-3 clips before switching
        private const int _acFireDelay = 750;        // ms between shots (manual fire delay)
        private const int _acCooldownTime = 1000;    // ms cooldown between clips
        private int _acStateEndTime = 0;
        private int _acNextShotTime = 0;             // Track when next shot can be fired
        private int _acShotsFired = 0;
        private int _acClipsFired = 0;
        private const int _acOptimalDistance = 300;  // Long range optimal distance

        // Micro Missile Launcher variables (from DuelBot)
        private enum MMLState { Idle, Prefire, Fired, Repositioning }
        private MMLState _mmlState = MMLState.Idle;
        private const int _mmlPrefireTime = 400;     // ms to pause and aim (quick)
        private const int _mmlRepositionTime = 800;  // ms to reposition after shot
        private int _mmlStateEndTime = 0;
        private bool _mmlRepositionDirection = false; // false = strafe, true = move forward/back
        private const int _mmlOptimalDistance = 150; // Medium-close range

        // FIXED: Projectile tracking with PROPER timing (from ArenaBot)
        private class ProjectileTracker
        {
            public ItemInfo.Projectile weapon;
            public Vehicle target;
            public float damageRadius;
            public int impactTime;
            public Vector3 targetPositionAtFire;
            public bool isExplosive;
        }
        private List<ProjectileTracker> _pendingProjectiles = new List<ProjectileTracker>();

        public enum CombatBehavior
        {
            ClosingDistance, OptimalRange, BackPedaling, Retreating, Flanking
        }

        ///////////////////////////////////////////////////
        // Constructor
        ///////////////////////////////////////////////////
        public CTFBot(VehInfo.Car type, InfServer.Protocol.Helpers.ObjectState state, Arena arena, Scripts.IScript script)
            : base(type, state, arena, new SteeringController(type, state, arena))
        {
            _rand = new Random();
            _steering = _movement as SteeringController;

            // Equip first weapon
            if (type.InventoryItems[0] != 0)
            {
                _weapon.equip(AssetManager.Manager.getItemByID(type.InventoryItems[0]));
                var weaponItem = AssetManager.Manager.getItemByID(type.InventoryItems[0]);
                // Console.WriteLine(String.Format("[CTF BOT] {0} equipped weapon: {1} (ID:{2})", 
                //     _type.Name, weaponItem != null ? weaponItem.name : "None", 
                //     type.InventoryItems[0]));
            }

            // Setup weapon settings
            var settings = new WeaponController.WeaponSettings();
            settings.aimFuzziness = 6;
            _weapon.setSettings(settings);

            _currentBehavior = CombatBehavior.OptimalRange;
            _tickBehaviorChange = Environment.TickCount;
            _tickLastTargetSearch = 0;
            _tickTargetLockOn = 0;
            
            // ADDED: Initialize target tracking
            _lastValidTargetTime = Environment.TickCount;
            _lastTargetValidationTime = Environment.TickCount;
            _consecutiveLOSFailures = 0;
            _hasLastKnownPosition = false;

            // Console.WriteLine(String.Format("[CTF BOT] {0} spawned and ready for combat!", _type.Name));
        }

        ///////////////////////////////////////////////////
        // Main Poll Loop
        ///////////////////////////////////////////////////
        public override bool poll()
        {
            if (IsDead)
            {
                _steering.steerDelegate = null;
                return base.poll();
            }

            int now = Environment.TickCount;
            
            // FIXED: Remove yaw forcing - let the bot rotate naturally
            // Call base.poll() for normal movement and physics
            bool result = base.poll();
            
            // FIXED: Handle delayed projectile impacts with proper timing
            handleDelayedProjectiles(now);
            
            // ADDED: Enhanced target tracking from DuelBot
            updateTargetTrackingAndSelection(now);

            var currentTarget = getCurrentTarget();
            if (currentTarget != null && !currentTarget.IsDead)
            {
                updateCombatBehavior(now);
                executeCombatBehavior(now);
                handleCombat(now);
            }
            else
            {
                // ADDED: Objective logic for pursuing lost targets
                doObjectiveLogic(now);
            }

            return result;
        }

        ///////////////////////////////////////////////////
        // Target Management
        ///////////////////////////////////////////////////
        private Vehicle getCurrentTarget()
        {
            if (_currentBotTarget != null) return _currentBotTarget;
            return _currentVehicleTarget;
        }

        private void setCurrentTarget(Vehicle target)
        {
            if (target is Bot)
            {
                _currentBotTarget = target as Bot;
                _currentVehicleTarget = null;
            }
            else
            {
                _currentVehicleTarget = target;
                _currentBotTarget = null;
            }
        }

        ///////////////////////////////////////////////////
        // ADDED: Enhanced target tracking from DuelBot
        ///////////////////////////////////////////////////
        private void updateTargetTrackingAndSelection(int now)
        {
            var currentTarget = getCurrentTarget();
            
            // Handle dead target
            if (currentTarget != null && currentTarget.IsDead)
            {
                // Store last known position before clearing target
                if (_hasLastKnownPosition)
                {
                    _lastKnownTargetPosition = new Vector3(currentTarget._state.positionX, currentTarget._state.positionY, 0);
                }
                
                // Remember this target to prevent immediate reacquisition
                _recentlyLostTarget = currentTarget;
                _targetLossTime = now;
                
                setCurrentTarget(null);
                // Console.WriteLine("[CTF BOT] Target died, switching to pursuit/objective mode");
            }

            // Attempt to find a new target if we have none
            if (currentTarget == null)
            {
                if (now - _tickLastTargetSearch < 200) return; // Rate limit target search
                _tickLastTargetSearch = now;
                
                Vehicle newTarget = getClosestValidTarget(now);
                
                if (newTarget != null)
                {
                    setCurrentTarget(newTarget);
                    _tickTargetLockOn = now;
                    
                    // Initialize target tracking for new target
                    _lastValidTargetTime = now;
                    _lastTargetValidationTime = now;
                    _consecutiveLOSFailures = 0;
                    _lastKnownTargetPosition = new Vector3(newTarget._state.positionX, newTarget._state.positionY, 0);
                    _hasLastKnownPosition = true;
                    
                    // Clear recently lost target since we have a new one
                    _recentlyLostTarget = null;
                    
                    string targetType = newTarget is Bot ? "Bot" : "Human";
                    Console.WriteLine(String.Format("[CTF BOT] {0} acquired new target: {1} {2} at distance {3:F0}", 
                        _type.Name, targetType, newTarget._type.Name, 
                        CTFBotHelpers.distanceTo(this, newTarget)));
                }
            }
            else
            {
                // Validate existing target periodically, not every frame
                if (now - _lastTargetValidationTime >= _targetValidationInterval)
                {
                    _lastTargetValidationTime = now;
                    
                    // Check if we have valid line of sight to target
                    bool hasValidTarget = HasLineOfSightToTarget(currentTarget);
                    
                    if (hasValidTarget)
                    {
                        // Reset tracking counters when we have valid line of sight
                        _lastValidTargetTime = now;
                        _consecutiveLOSFailures = 0;
                        _lastKnownTargetPosition = new Vector3(currentTarget._state.positionX, currentTarget._state.positionY, 0);
                        _hasLastKnownPosition = true;
                    }
                    else
                    {
                        // Only increment failure counter during validation checks
                        _consecutiveLOSFailures++;
                        
                        // Check if we should give up on this target
                        bool shouldGiveUpTarget = 
                            (now - _lastValidTargetTime > _targetLossTimeout) ||
                            (_consecutiveLOSFailures > _maxLOSFailures);
                        
                        if (shouldGiveUpTarget)
                        {
                            // Console.WriteLine("Lost target for too long. Switching to pursuit/objective mode.");
                            
                            // Store the last known position before clearing the target
                            if (currentTarget != null)
                            {
                                _lastKnownTargetPosition = new Vector3(currentTarget._state.positionX, currentTarget._state.positionY, 0);
                                _hasLastKnownPosition = true;
                                
                                // Remember this target to prevent immediate reacquisition
                                _recentlyLostTarget = currentTarget;
                                _targetLossTime = now;
                            }
                            
                            // Clear the target to transition to objective logic
                            setCurrentTarget(null);
                            _consecutiveLOSFailures = 0;
                        }
                    }
                }
            }
        }
        
        ///////////////////////////////////////////////////
        // FIXED: Proper line of sight checking from DuelBot
        ///////////////////////////////////////////////////
        private bool HasLineOfSightToTarget(Vehicle target)
        {
            if (target == null) return false;
            
            // For human players, use MovementController's proper line of sight check
            var player = _arena.PlayersIngame.FirstOrDefault(p => p._baseVehicle == target);
            if (player != null)
            {
                // Set the target in MovementController so it can do proper LOS checking
                _movement.setTarget(player);
                return _movement.hasValidTarget();
            }
            
            // For bots, use direct line of sight calculation (simple distance for now)
            return HasDirectLineOfSight(this, target);
        }

        ///////////////////////////////////////////////////
        // ADDED: Direct line of sight check from DuelBot (for bot vs bot)
        ///////////////////////////////////////////////////
        private bool HasDirectLineOfSight(Vehicle from, Vehicle to)
        {
            if (from == null || to == null) return false;
            
            // Simple line of sight check - distance based for now
            // In a real implementation you'd check for walls using proper collision detection
            double distance = CTFBotHelpers.distanceTo(this, to);
            return distance <= _maxRange && !to.IsDead;
        }
        
        ///////////////////////////////////////////////////
        // FIXED: Enhanced target search with PROPER line of sight like DuelBot
        ///////////////////////////////////////////////////
        private Vehicle getClosestValidTarget(int now)
        {
            var potentialTargets = new List<Vehicle>();
            
            // Get human players - use MovementController's canSeeTarget like DuelBot
            var humanPlayers = _arena.getPlayersInRange(_state.positionX, _state.positionY, (int)_maxRange)
                .Where(p => !p.IsDead && p._team != _team && !p.IsSpectator)
                .ToList();
            
            foreach (var player in humanPlayers)
            {
                if (player._baseVehicle != null && 
                    player._baseVehicle != this &&
                    CTFBotHelpers.distanceTo(this, player) < _maxRange &&
                    _movement.canSeeTarget(player)) // PROPER line of sight check like DuelBot
                {
                    potentialTargets.Add(player._baseVehicle);
                }
            }
            
            // Get bot vehicles  
            var botVehicles = _arena.getVehiclesInRange(_state.positionX, _state.positionY, (int)_maxRange,
                v => v is Bot && v != this && v._team != _team && !v.IsDead);
            
            foreach (var bot in botVehicles)
            {
                if (CTFBotHelpers.distanceTo(this, bot) < _maxRange && HasDirectLineOfSight(this, bot))
                {
                    potentialTargets.Add(bot);
                }
            }
            
            // Filter out recently lost target if still in exclusion period
            if (_recentlyLostTarget != null && (now - _targetLossTime < _targetExclusionDuration))
            {
                potentialTargets.RemoveAll(t => t == _recentlyLostTarget);
            }
            
            // Target closest enemy with line of sight
            return potentialTargets
                .OrderBy(v => CTFBotHelpers.distanceSquaredTo(this._state, v._state))
                .FirstOrDefault();
        }

        private void updateCombatBehavior(int now)
        {
            var target = getCurrentTarget();
            if (target == null) return;

            float distance = (float)CTFBotHelpers.distanceTo(this, target);
            
            // ADDED: Weapon selection based on distance (from DuelBot)
            trySelectOptimalWeapon(distance);

            if (_state.health < _type.Hitpoints * 0.4)
                _currentBehavior = CombatBehavior.Retreating;
            else if (distance < _runDist)
                _currentBehavior = CombatBehavior.BackPedaling;
            else if (distance > _fireDist)
                _currentBehavior = CombatBehavior.ClosingDistance;
            else
                _currentBehavior = CombatBehavior.OptimalRange;
        }
        
        ///////////////////////////////////////////////////
        // Weapon Selection (from DuelBot)
        ///////////////////////////////////////////////////
        private void trySelectOptimalWeapon(float targetDistance)
        {
            int weaponCount = _type.InventoryItems.Count();
            if (weaponCount <= 1) return; // No point in switching if only one weapon
            
            int bestWeaponIndex = _currentWeaponIndex;
            WeaponType bestWeaponType = WeaponType.Unknown;
            double bestScore = -1;

            // Check all available weapons and score them based on distance
            for (int i = 0; i < weaponCount; i++)
            {
                int itemId = _type.InventoryItems[i];
                WeaponType weaponType = GetWeaponTypeFromId(itemId);
                
                if (weaponType == WeaponType.Unknown)
                    continue;

                double score = ScoreWeaponForDistance(weaponType, targetDistance);
                if (score > bestScore)
                {
                    bestScore = score;
                    bestWeaponIndex = i;
                    bestWeaponType = weaponType;
                }
            }

            // Switch weapon if we found a better one
            if (bestWeaponIndex != _currentWeaponIndex)
            {
                var newItem = AssetManager.Manager.getItemByID(_type.InventoryItems[bestWeaponIndex]);
                if (newItem != null)
                {
                    _currentWeaponIndex = bestWeaponIndex;
                    _weapon.equip(newItem);
                    
                    // Update optimal range based on new weapon
                    _optimalRange = GetOptimalDistanceForWeapon(bestWeaponType);
                    // Reset weapon states when switching
                    resetWeaponStates();
                }
            }
        }
        
        private double ScoreWeaponForDistance(WeaponType weaponType, double targetDistance)
        {
            float optimalDist = GetOptimalDistanceForWeapon(weaponType);
            double distanceDiff = Math.Abs(targetDistance - optimalDist);
            
            // Score weapons based on how close they are to their optimal range
            switch (weaponType)
            {
                case WeaponType.ACMk2:
                    // Prefer AC mk2 for long range (distance > 200)
                    if (targetDistance > 200)
                        return 100 - (distanceDiff * 0.2); // High base score, low penalty
                    else
                        return 10 - (distanceDiff * 0.5);  // Low score for close range
                        
                case WeaponType.MicroMissile:
                    // Prefer Micro Missile for medium-close range (100-250)
                    if (targetDistance >= 100 && targetDistance <= 250)
                        return 90 - (distanceDiff * 0.3);
                    else
                        return 15 - (distanceDiff * 0.4);
                        
                case WeaponType.RifleGrenade:
                    // Medium priority for rifle grenade
                    return 50 - (distanceDiff * 0.4);
                    
                case WeaponType.Shotgun:
                    // Good for close range
                    if (targetDistance < 150)
                        return 60 - (distanceDiff * 0.5);
                    else
                        return 20 - (distanceDiff * 0.6);
                        
                case WeaponType.AR:
                    // Default weapon, moderate score
                    return 40 - (distanceDiff * 0.3);
                    
                default:
                    return 0;
            }
        }

        ///////////////////////////////////////////////////
        // Weapon State Management
        ///////////////////////////////////////////////////
        
        /// <summary>
        /// Check if current weapon requires standing still (stand-and-fire weapons)
        /// </summary>
        private bool currentWeaponRequiresStandingStill()
        {
            WeaponType weaponType = GetCurrentWeaponType();
            
            switch (weaponType)
            {
                case WeaponType.RifleGrenade:
                    return _rgState == RGState.Prefire || _rgState == RGState.Fired;
                    
                case WeaponType.ACMk2:
                    return _acState == ACState.Prefire || _acState == ACState.Firing || _acState == ACState.Cooldown;
                    
                case WeaponType.MicroMissile:
                    return _mmlState == MMLState.Prefire || _mmlState == MMLState.Fired;
                    
                default:
                    return false; // AR and Shotgun can move while firing
            }
        }
        
        /// <summary>
        /// Check if current weapon is in repositioning state (for micro missile)
        /// </summary>
        private bool currentWeaponIsRepositioning()
        {
            return GetCurrentWeaponType() == WeaponType.MicroMissile && _mmlState == MMLState.Repositioning;
        }

        private void executeCombatBehavior(int now)
        {
            if (getCurrentTarget() == null)
            {
                _steering.steerDelegate = steerForWander;
                return;
            }

            // Check if weapon requires standing still
            if (currentWeaponRequiresStandingStill())
            {
                // Stop all movement for stand-and-fire weapons
                _steering.steerDelegate = steerForStandStill;
                return;
            }
            
            // Check if weapon needs special repositioning (micro missile)
            if (currentWeaponIsRepositioning())
            {
                _steering.steerDelegate = steerForMicroMissileReposition;
                return;
            }

            // Let handleCombat control ALL aiming and rotation
            _steering.bSkipAim = false;
            _steering.bSkipRotate = true; // CHANGED: Let aimAtTarget handle rotation directly

            switch (_currentBehavior)
            {
                case CombatBehavior.ClosingDistance: 
                    _steering.steerDelegate = steerForClosingDistance; 
                    break;
                case CombatBehavior.OptimalRange: 
                    _steering.steerDelegate = steerForOptimalRange; 
                    break;
                case CombatBehavior.BackPedaling: 
                    _steering.steerDelegate = steerForBackPedaling; 
                    break;
                case CombatBehavior.Retreating: 
                    _steering.steerDelegate = steerForTacticalRetreat; 
                    break;
                case CombatBehavior.Flanking: 
                    _steering.steerDelegate = steerForFlank; 
                    break;
            }
        }

        ///////////////////////////////////////////////////
        // Combat & Aiming - FOLLOW ARENABOT'S PROVEN PATTERN
        ///////////////////////////////////////////////////
        private void handleCombat(int now)
        {
            var target = getCurrentTarget();
            if (target == null || _weapon == null || !_weapon.bEquipped) return;

            // CRITICAL: Aim at target EVERY FRAME (like ArenaBot does)
            aimAtTarget(target);

            float distance = (float)CTFBotHelpers.distanceTo(this, target);
            
            // Route to weapon-specific handlers (from DuelBot)
            WeaponType currentWeapon = GetCurrentWeaponType();
            switch (currentWeapon)
            {
                case WeaponType.AR:
                case WeaponType.Shotgun:
                    handleAROrShotgun(now, distance, currentWeapon);
                    break;
                case WeaponType.RifleGrenade:
                    handleRifleGrenade(now, distance, target);
                    break;
                case WeaponType.ACMk2:
                    handleACMk2(now, distance, target);
                    break;
                case WeaponType.MicroMissile:
                    handleMicroMissile(now, distance, target);
                    break;
                case WeaponType.Unknown:
                default:
                    // Fall back to basic firing for unknown weapons
                    handleAROrShotgun(now, distance, WeaponType.AR);
                    break;
            }
        }
        
        ///////////////////////////////////////////////////
        // Weapon-Specific Handlers (from DuelBot)
        ///////////////////////////////////////////////////
        
        /// <summary>
        /// FIXED: Handle AR and Shotgun - mobile weapons that fire while moving with proper range
        /// </summary>
        private void handleAROrShotgun(int now, float distance, WeaponType weaponType)
        {
            var target = getCurrentTarget();
            if (target == null) return;
            
            // FIXED: Use maxRange instead of fireDist so bots can fire at the same range they can target
            // These weapons can fire while moving - use standard firing logic
            if (distance < _maxRange && _weapon.ableToFire())
            {
                int aimResult = _weapon.getAimAngle(target._state);
                // FIXED: Make aiming less restrictive - if we have a target, try to fire
                if (_weapon.isAimed(aimResult) || Math.Abs(aimResult) < 50) // Allow firing if reasonably close to aimed
                {
                    Console.WriteLine(String.Format("[CTF BOT FIRE] {0} firing {1} at {2} at distance {3:F0}", 
                        _type.Name, weaponType, target._type.Name, distance));
                    
                    // Fire weapon for visual effects
                    _itemUseID = _weapon.ItemID;
                    _weapon.shotFired();
                    
                    // Handle both Projectile and MultiUse weapon types
                    var weaponItem = AssetManager.Manager.getItemByID(_weapon.ItemID);
                    if (weaponItem != null)
                    {
                        processDamageFromWeapon(weaponItem, target, now);
                    }
                }
            }
        }
        
        /// <summary>
        /// Handle Rifle Grenade - long pause and aim before firing (from DuelBot)
        /// </summary>
        private void handleRifleGrenade(int now, float distance, Vehicle target)
        {
            float weaponOptimalDistance = GetOptimalDistanceForWeapon(WeaponType.RifleGrenade);
            
            if (_rgState == RGState.Idle)
            {
                // FIXED: More lenient range check - fire from longer distances
                if (distance < _maxRange) // Fire if within max targeting range
                {
                    _rgState = RGState.Prefire;
                    _rgStateEndTime = now + _rgPrefireTime;
                }
                else
                {
                    // Move closer to target before firing - don't fire while moving
                    return; // Let movement system handle positioning
                }
            }
            else if (_rgState == RGState.Prefire)
            {
                // Stand still and aim precisely - NO MOVEMENT during prefire
                // Movement system will be told to stop by not calling movement commands
                
                if (now >= _rgStateEndTime)
                {
                    // Fire if weapon is ready
                    if (_weapon.ableToFire())
                    {
                        _itemUseID = _weapon.ItemID;
                        _weapon.shotFired();
                        
                        // Handle damage
                        var weaponItem = AssetManager.Manager.getItemByID(_weapon.ItemID);
                        if (weaponItem != null)
                        {
                            processDamageFromWeapon(weaponItem, target, now);
                        }
                        
                        _rgState = RGState.Fired;
                        _rgStateEndTime = now + _rgFiredStateTime;
                    }
                    else
                    {
                        _rgState = RGState.Idle; // Reset if weapon can't fire
                    }
                }
            }
            else if (_rgState == RGState.Fired)
            {
                // Continue standing still after firing
                if (now >= _rgStateEndTime)
                {
                    _rgState = RGState.Idle;
                }
            }
        }
        
        /// <summary>
        /// Handle AC mk2 - sustained burst fire weapon (from DuelBot)
        /// </summary>
        private void handleACMk2(int now, float distance, Vehicle target)
        {
            float weaponOptimalDistance = GetOptimalDistanceForWeapon(WeaponType.ACMk2);
            
            // Reset clips fired if we've completed a full engagement cycle
            if (_acClipsFired >= _acClipsToFire)
            {
                _acClipsFired = 0;
                _acState = ACState.Idle;
            }

            if (_acState == ACState.Idle)
            {
                // FIXED: More lenient range check - fire from longer distances  
                if (distance < _maxRange) // Fire if within max targeting range
                {
                    _acState = ACState.Prefire;
                    _acStateEndTime = now + _acPrefireTime;
                    _acShotsFired = 0;
                }
                else
                {
                    // Let movement system handle positioning
                    return;
                }
            }
            else if (_acState == ACState.Prefire)
            {
                // Stand still and aim
                if (now >= _acStateEndTime)
                {
                    _acState = ACState.Firing;
                    _acNextShotTime = now; // Allow immediate first shot
                }
            }
            else if (_acState == ACState.Firing)
            {
                // Fire when weapon is ready AND enough time has passed
                if (_weapon.ableToFire() && now >= _acNextShotTime)
                {
                    _itemUseID = _weapon.ItemID;
                    _weapon.shotFired();
                    
                    // Handle damage
                    var weaponItem = AssetManager.Manager.getItemByID(_weapon.ItemID);
                    if (weaponItem != null)
                    {
                        processDamageFromWeapon(weaponItem, target, now);
                    }
                    
                    _acShotsFired++;
                    _acNextShotTime = now + _acFireDelay; // Set next shot time

                    if (_acShotsFired >= _acShotsPerClip)
                    {
                        // Clip empty, enter cooldown
                        _acState = ACState.Cooldown;
                        _acStateEndTime = now + _acCooldownTime;
                        _acClipsFired++;
                    }
                }
            }
            else if (_acState == ACState.Cooldown)
            {
                // Continue standing still during cooldown
                if (now >= _acStateEndTime)
                {
                    _acState = ACState.Idle;
                }
            }
        }
        
        /// <summary>
        /// Handle Micro Missile - quick pause and scoot-and-shoot (from DuelBot)
        /// </summary>
        private void handleMicroMissile(int now, float distance, Vehicle target)
        {
            float weaponOptimalDistance = GetOptimalDistanceForWeapon(WeaponType.MicroMissile);
            
            if (_mmlState == MMLState.Idle)
            {
                // FIXED: More lenient range check - fire from longer distances
                if (distance < _maxRange) // Fire if within max targeting range
                {
                    _mmlState = MMLState.Prefire;
                    _mmlStateEndTime = now + _mmlPrefireTime;
                }
                else
                {
                    // Let movement system handle positioning
                    return;
                }
            }
            else if (_mmlState == MMLState.Prefire)
            {
                // Stand still and aim precisely
                if (now >= _mmlStateEndTime)
                {
                    // Fire if weapon is ready
                    if (_weapon.ableToFire())
                    {
                        _itemUseID = _weapon.ItemID;
                        _weapon.shotFired();
                        
                        // Handle damage
                        var weaponItem = AssetManager.Manager.getItemByID(_weapon.ItemID);
                        if (weaponItem != null)
                        {
                            processDamageFromWeapon(weaponItem, target, now);
                        }
                        
                        _mmlState = MMLState.Fired;
                        _mmlStateEndTime = now + 200; // Brief pause after firing
                    }
                    else
                    {
                        _mmlState = MMLState.Idle; // Reset if weapon can't fire
                    }
                }
            }
            else if (_mmlState == MMLState.Fired)
            {
                // Brief pause after firing, then start repositioning
                if (now >= _mmlStateEndTime)
                {
                    _mmlState = MMLState.Repositioning;
                    _mmlStateEndTime = now + _mmlRepositionTime;
                    // Randomly choose repositioning direction
                    _mmlRepositionDirection = _rand.Next(0, 2) == 0;
                }
            }
            else if (_mmlState == MMLState.Repositioning)
            {
                // Continue aiming while repositioning - movement handled by steering
                if (now >= _mmlStateEndTime)
                {
                    _mmlState = MMLState.Idle;
                }
            }
        }
        
        /// <summary>
        /// Process damage from weapon - handles both Projectile and MultiUse items
        /// </summary>
        private void processDamageFromWeapon(ItemInfo weaponItem, Vehicle target, int now)
        {
            if (weaponItem is ItemInfo.Projectile)
            {
                // Direct projectile weapon
                var projectile = weaponItem as ItemInfo.Projectile;
                // Console.WriteLine(String.Format("[CTF BOT FIRE] Direct projectile weapon: {0} (ID:{1})", 
                //     projectile.name, projectile.id));
                
                if (hasDamageValues(projectile))
                {
                    scheduleProjectileDamage(projectile, target, now);
                }
                else
                {
                    // Console.WriteLine(String.Format("[CTF BOT FIRE] Projectile {0} has no damage values - skipping", projectile.name));
                }
            }
            else if (weaponItem is ItemInfo.MultiUse)
            {
                // MultiUse weapon - check child items for projectiles
                var multiUse = weaponItem as ItemInfo.MultiUse;
                // Console.WriteLine(String.Format("[CTF BOT FIRE] MultiUse weapon: {0} (ID:{1}) with {2} child items", 
                //     multiUse.name, multiUse.id, multiUse.childItems.Count));
                
                foreach (var childItem in multiUse.childItems)
                {
                    if (childItem.id != 0)
                    {
                        var childWeapon = AssetManager.Manager.getItemByID(childItem.id);
                        if (childWeapon is ItemInfo.Projectile)
                        {
                            var childProjectile = childWeapon as ItemInfo.Projectile;
                            // Console.WriteLine(String.Format("[CTF BOT FIRE] Child projectile: {0} (ID:{1})", 
                            //     childProjectile.name, childProjectile.id));
                            
                            if (hasDamageValues(childProjectile))
                            {
                                // Console.WriteLine(String.Format("[CTF BOT FIRE] Child projectile {0} has damage - scheduling", childProjectile.name));
                                scheduleProjectileDamage(childProjectile, target, now);
                            }
                            else
                            {
                                // Console.WriteLine(String.Format("[CTF BOT FIRE] Child projectile {0} has no damage - likely effect item", childProjectile.name));
                            }
                        }
                    }
                }
            }
            else
            {
                // Console.WriteLine(String.Format("[CTF BOT FIRE] Unknown weapon type: {0}", weaponItem.GetType().Name));
            }
        }
        
        /// <summary>
        /// Check if projectile has actual damage values (not just visual effects)
        /// </summary>
        private bool hasDamageValues(ItemInfo.Projectile projectile)
        {
            // Check if any damage type has values > 0
            bool hasInnerDamage = projectile.kineticDamageInner > 0 || projectile.explosiveDamageInner > 0 || 
                                 projectile.electronicDamageInner > 0 || projectile.psionicDamageInner > 0 || 
                                 projectile.bypassDamageInner > 0 || projectile.energyDamageInner > 0;
            
            bool hasOuterDamage = projectile.kineticDamageOuter > 0 || projectile.explosiveDamageOuter > 0 || 
                                 projectile.electronicDamageOuter > 0 || projectile.psionicDamageOuter > 0 || 
                                 projectile.bypassDamageOuter > 0 || projectile.energyDamageOuter > 0;
            
            return hasInnerDamage || hasOuterDamage;
        }
        
        /// <summary>
        /// FIXED: Schedule projectile damage with proper timing
        /// </summary>
        private void scheduleProjectileDamage(ItemInfo.Projectile projectile, Vehicle target, int now)
        {
            // Use Helpers.getMaxBlastRadius() like ArenaBot does
            float damageRadius = Helpers.getMaxBlastRadius(projectile);
            
            // Console.WriteLine(String.Format("[CTF BOT FIRE] Projectile {0} damage radius: {1}", projectile.name, damageRadius));
            
            if (damageRadius > 0)
            {
                // Schedule delayed explosion
                // Console.WriteLine(String.Format("[CTF BOT FIRE] Scheduling delayed explosion for {0}", target._type.Name));
                scheduleDelayedExplosion(projectile, target, damageRadius, now);
            }
            else
            {
                // Schedule delayed direct hit
                // Console.WriteLine(String.Format("[CTF BOT FIRE] Scheduling delayed direct hit for {0}", target._type.Name));
                scheduleDelayedDirectHit(projectile, target, now);
            }
        }

        private void aimAtTarget(Vehicle target)
        {
            if (target == null || _weapon == null) return;
            
            int aimResult = _weapon.getAimAngle(target._state);
            
            // FIXED: Use gradual rotation instead of instant snap turning
            if (aimResult != 0)
            {
                // Convert weapon aim angle to degrees for gradual rotation
                double targetDegrees = (aimResult * 360.0) / 256.0; // Convert to degrees
                double currentDegrees = (_state.yaw * 360.0) / 256.0; // Convert current yaw to degrees
                double angleDiff = CTFBotHelpers.calculateDifferenceInAngles(currentDegrees, targetDegrees);
                
                // Only rotate if we're not close enough to the target angle
                if (Math.Abs(angleDiff) > 5) // 5 degree tolerance
                {
                    // Gradual rotation - only turn by small increments each frame
                    int rotationSpeed = 3; // Rotation speed per frame (was 2, increased slightly for responsiveness)
                    
                    if (angleDiff > 0)
                    {
                        // Need to rotate right
                        byte newYaw = (byte)((_state.yaw + rotationSpeed) % 256);
                        _state.yaw = newYaw;
                    }
                    else
                    {
                        // Need to rotate left  
                        byte newYaw = (byte)((_state.yaw - rotationSpeed + 256) % 256);
                        _state.yaw = newYaw;
                    }
                }
            }
            
            // Keep steering controller informed but don't rely on it for rotation
            if (_steering != null)
            {
                _steering.bSkipAim = true;
                _steering.angle = aimResult;
                _steering.bSkipRotate = true; // We handle rotation manually
            }
        }

        ///////////////////////////////////////////////////
        // Steering Behaviors - FOCUS ON MOVEMENT ONLY
        ///////////////////////////////////////////////////
        public Vector3 steerForClosingDistance(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return Vector3.Zero;
            
            // REMOVED: aimAtTarget(target) - let handleCombat handle aiming
            
            return vehicle.SteerForSeek(target._state.position());
        }

        public Vector3 steerForOptimalRange(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return Vector3.Zero;

            // REMOVED: aimAtTarget(target) - let handleCombat handle aiming

            float distance = (float)CTFBotHelpers.distanceTo(this, target);
            Vector3 targetPos = target._state.position();
            Vector3 movement = Vector3.Zero;

            if (distance > _optimalRange) 
                movement = vehicle.SteerForSeek(targetPos);
            else if (distance < _shortDist) 
                movement = vehicle.SteerForFlee(targetPos);
            
            // Add strafing and separation
            Vector3 strafe = getStrafeMovement(vehicle);
            Vector3 separation = getBotSeparation(vehicle);
            
            return movement + strafe + separation;
        }

        public Vector3 steerForBackPedaling(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return Vector3.Zero;
            
            // REMOVED: aimAtTarget(target) - let handleCombat handle aiming
            
            Vector3 fleeMovement = vehicle.SteerForFlee(target._state.position());
            Vector3 strafeMovement = getStrafeMovement(vehicle) * 2.0f;
            
            return fleeMovement + strafeMovement;
        }

        public Vector3 steerForTacticalRetreat(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return steerForWander(vehicle);
            
            // REMOVED: aimAtTarget(target) - let handleCombat handle aiming
            
            return vehicle.SteerForFlee(target._state.position());
        }

        public Vector3 steerForFlank(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return Vector3.Zero;

            // REMOVED: aimAtTarget(target) - let handleCombat handle aiming

            // Get behind target
            float headingX = (float)Math.Cos(target._state.yaw);
            float headingY = (float)Math.Sin(target._state.yaw);
            Vector3 headingVector = new Vector3(headingX, headingY, 0);

            Vector3 behindTarget = target._state.position() - (headingVector * _optimalRange);
            return vehicle.SteerForSeek(behindTarget);
        }

        private Vector3 getStrafeMovement(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return Vector3.Zero;

            // Change strafe direction periodically
            if (Environment.TickCount - _tickLastStrafe > 2000)
            {
                _strafeLeft = !_strafeLeft;
                _tickLastStrafe = Environment.TickCount;
            }

            Vector3 toTarget = target._state.position() - vehicle.Position;
            if (toTarget.Length < 0.1f) return Vector3.Zero;
            
            toTarget.Normalize();
            Vector3 perpendicular = new Vector3(-toTarget.y, toTarget.x, 0);
            
            return perpendicular * (_strafeLeft ? -1 : 1) * 150f;
        }

        private Vector3 getBotSeparation(InfantryVehicle vehicle)
        {
            var nearbyBots = _arena.getVehiclesInRange(vehicle.state.positionX, vehicle.state.positionY, 200, 
                v => v is Bot && v != this).Select(v => v.Abstract);
            return vehicle.SteerForSeparation(1.0f, -0.707f, nearbyBots);
        }

        public Vector3 steerForWander(InfantryVehicle vehicle)
        {
            return vehicle.SteerForWander(0.5f);
        }
        
        /// <summary>
        /// Stand still behavior for stand-and-fire weapons
        /// </summary>
        public Vector3 steerForStandStill(InfantryVehicle vehicle)
        {
            return Vector3.Zero; // No movement at all
        }
        
        /// <summary>
        /// Micro missile repositioning behavior
        /// </summary>
        public Vector3 steerForMicroMissileReposition(InfantryVehicle vehicle)
        {
            var target = getCurrentTarget();
            if (target == null) return Vector3.Zero;
            
            float distance = (float)CTFBotHelpers.distanceTo(this, target);
            float optimalDistance = GetOptimalDistanceForWeapon(WeaponType.MicroMissile);
            
            // Scoot and shoot repositioning movement
            if (_mmlRepositionDirection)
            {
                // Forward/backward movement based on distance
                if (distance > optimalDistance + 50)
                    return vehicle.SteerForSeek(target._state.position());
                else if (distance < optimalDistance - 50)
                    return vehicle.SteerForFlee(target._state.position());
                else
                {
                    // Random forward/back when at optimal distance
                    if (_rand.Next(0, 2) == 0)
                        return vehicle.SteerForSeek(target._state.position()) * 0.5f;
                    else
                        return vehicle.SteerForFlee(target._state.position()) * 0.5f;
                }
            }
            else
            {
                // Strafe movement
                return getStrafeMovement(vehicle) * 1.5f; // Enhanced strafe for repositioning
            }
        }

        ///////////////////////////////////////////////////
        // ARENABOT'S DELAYED DAMAGE SYSTEM - MAKES BOTS DAMAGE EACH OTHER
        ///////////////////////////////////////////////////
        
        /// <summary>
        /// FIXED: Much more conservative timing to prevent premature damage - bots should see explosions first
        /// </summary>
        private void scheduleDelayedExplosion(ItemInfo.Projectile weapon, Vehicle target, float damageRadius, int fireTime)
        {
            // Calculate projectile travel time - VERY CONSERVATIVE to avoid premature damage
            float distance = (float)CTFBotHelpers.distanceTo(this, target);
            float projectileSpeed = weapon.muzzleVelocity > 0 ? weapon.muzzleVelocity : 1500;
            int travelTimeMs = (int)((distance / projectileSpeed) * 1000);
            
            // CRITICAL: Add substantial minimum delay to ensure visual projectile reaches target first
            travelTimeMs = Math.Max(500, travelTimeMs); // Increased to 500ms minimum delay
            
            // Account for weapon alive time CONSERVATIVELY
            int aliveTimeMs = weapon.aliveTime;
            if (aliveTimeMs > 0)
            {
                travelTimeMs = Math.Min(travelTimeMs, aliveTimeMs);
            }
            
            // Add additional visual buffer for explosions to be seen
            travelTimeMs += 200; // Additional 200ms buffer for visual consistency
            
            // Predict target position
            Vector3 predictedPosition = PredictTargetPosition(target, travelTimeMs);
            
            var projectile = new ProjectileTracker
            {
                weapon = weapon,
                target = target,
                damageRadius = damageRadius,
                impactTime = fireTime + travelTimeMs,
                targetPositionAtFire = predictedPosition,
                isExplosive = true
            };
            
            _pendingProjectiles.Add(projectile);
        }
        
        /// <summary>
        /// FIXED: Much more conservative direct hit timing to match explosion timing
        /// </summary>
        private void scheduleDelayedDirectHit(ItemInfo.Projectile weapon, Vehicle target, int fireTime)
        {
            float distance = (float)CTFBotHelpers.distanceTo(this, target);
            float projectileSpeed = weapon.muzzleVelocity > 0 ? weapon.muzzleVelocity : 1500;
            int travelTimeMs = (int)((distance / projectileSpeed) * 1000);
            
            // CRITICAL: Use same conservative timing as explosions for consistency
            travelTimeMs = Math.Max(400, travelTimeMs); // Increased to 400ms minimum delay
            
            // Add visual buffer for direct hits too
            travelTimeMs += 100; // Additional 100ms buffer for visual consistency
            
            Vector3 predictedPosition = PredictTargetPosition(target, travelTimeMs);
            
            var projectile = new ProjectileTracker
            {
                weapon = weapon,
                target = target,
                damageRadius = 0,
                impactTime = fireTime + travelTimeMs,
                targetPositionAtFire = predictedPosition,
                isExplosive = false
            };
            
            _pendingProjectiles.Add(projectile);
        }
        
        /// <summary>
        /// Target prediction (from ArenaBot)
        /// </summary>
        private Vector3 PredictTargetPosition(Vehicle target, int delayMs)
        {
            Vector3 currentPos = new Vector3(target._state.positionX, target._state.positionY, 0);
            Vector3 targetVelocity = new Vector3(target._state.velocityX, target._state.velocityY, 0);
            float timeInSeconds = delayMs / 1000f;
            
            return currentPos + (targetVelocity * timeInSeconds);
        }

        
        ///////////////////////////////////////////////////
        // ADDED: Objective logic for pursuing lost targets (from DuelBot)
        ///////////////////////////////////////////////////
        private void doObjectiveLogic(int now)
        {
            Vector3 targetCoord;
            string logicMode;
            
            // Determine target based on current state
            if (_hasLastKnownPosition)
            {
                targetCoord = _lastKnownTargetPosition;
                logicMode = "Pursuing last known target position";
                
                // Check if we've reached the last known position
                double dx = targetCoord.x - _state.positionX;
                double dy = targetCoord.y - _state.positionY;
                double distToLastKnown = Math.Sqrt(dx * dx + dy * dy);
                
                if (distToLastKnown < 80) // Close enough to last known position
                {
                    // Console.WriteLine("Reached last known target position. Switching to default objective.");
                    _hasLastKnownPosition = false;
                    targetCoord = _objectiveCoord;
                    logicMode = "Default objective";
                }
            }
            else
            {
                // No last known position - head to default objective
                targetCoord = _objectiveCoord;
                logicMode = "Default objective";
            }
            
            // Calculate distance to target
            double dx2 = targetCoord.x - _state.positionX;
            double dy2 = targetCoord.y - _state.positionY;
            double distToTarget = Math.Sqrt(dx2 * dx2 + dy2 * dy2);

            // If we are close to the target, strafe and look for new targets
            if (distToTarget < 100)
            {
                // At target - strafe and look for new targets
                if (now > _tickLastStrafe + 1000)
                {
                    _tickLastStrafe = now;
                    _strafeLeft = !_strafeLeft;
                }
                
                if (_strafeLeft)
                    _steering.steerDelegate = steerForStrafeLeft;
                else
                    _steering.steerDelegate = steerForStrafeRight;
                    
                // Occasionally scan for new targets
                if (now % 1000 == 0) // Every second
                {
                    Vehicle newTarget = getClosestValidTarget(now);
                    if (newTarget != null)
                    {
                        // Console.WriteLine("Found new target while at objective. Switching to combat mode.");
                        setCurrentTarget(newTarget);
                        _lastValidTargetTime = now;
                        _consecutiveLOSFailures = 0;
                        _hasLastKnownPosition = true;
                        _lastKnownTargetPosition = new Vector3(newTarget._state.positionX, newTarget._state.positionY, 0);
                    }
                }
            }
            else
            {
                // Move toward target using simple direct movement
                moveDirectlyToward(targetCoord);
            }
        }
        
        ///////////////////////////////////////////////////
        // ADDED: Simple direct movement (from DuelBot)
        ///////////////////////////////////////////////////
        private void moveDirectlyToward(Vector3 targetCoord)
        {
            // Calculate direction to target
            double targetDegrees = CTFBotHelpers.calculateDegreesBetweenPoints(
                _state.positionX, _state.positionY,
                targetCoord.x, targetCoord.y);
            
            // Simple rotation toward target
            aimAndRotateToward(targetDegrees);
            
            // Set forward movement
            _steering.steerDelegate = steerForSeek;
        }
        
        ///////////////////////////////////////////////////
        // ADDED: Aim and rotate helper (from DuelBot)
        ///////////////////////////////////////////////////
        private void aimAndRotateToward(double targetDegrees)
        {
            double currentDegrees = (_state.yaw * 360.0) / 256.0; // Convert yaw to degrees
            double angleDiff = CTFBotHelpers.calculateDifferenceInAngles(currentDegrees, targetDegrees);
            
            if (Math.Abs(angleDiff) > 5)
            {
                if (angleDiff > 0)
                {
                    // Need to rotate right
                    byte newYaw = (byte)((_state.yaw + 2) % 256);
                    _state.yaw = newYaw;
                }
                else
                {
                    // Need to rotate left  
                    byte newYaw = (byte)((_state.yaw - 2 + 256) % 256);
                    _state.yaw = newYaw;
                }
            }
        }
        
        ///////////////////////////////////////////////////
        // ADDED: Strafe steering behaviors
        ///////////////////////////////////////////////////
        public Vector3 steerForStrafeLeft(InfantryVehicle vehicle)
        {
            return new Vector3(-150f, 0, 0);
        }
        
        public Vector3 steerForStrafeRight(InfantryVehicle vehicle)
        {
            return new Vector3(150f, 0, 0);
        }
        
        public Vector3 steerForSeek(InfantryVehicle vehicle)
        {
            return new Vector3(0, 150f, 0); // Forward movement
        }

        /// <summary>
        /// FIXED: Handle projectile impacts with proper timing (from ArenaBot)
        /// </summary>
        private void handleDelayedProjectiles(int now)
        {
            var projectilesToRemove = new List<ProjectileTracker>();
            
            foreach (var projectile in _pendingProjectiles)
            {
                if (now >= projectile.impactTime)
                {
                    if (projectile.isExplosive)
                    {
                        // Explosion at predicted position
                        checkExplosionDamageAtImpact(projectile.weapon, 
                            projectile.targetPositionAtFire.x, 
                            projectile.targetPositionAtFire.y, 
                            projectile.damageRadius);
                    }
                    else
                    {
                        // Direct hit check
                        if (projectile.target != null && !projectile.target.IsDead)
                        {
                            Vector3 currentTargetPos = new Vector3(projectile.target._state.positionX, projectile.target._state.positionY, 0);
                            float distanceMoved = projectile.targetPositionAtFire.Distance(currentTargetPos);
                            
                            if (distanceMoved <= 80f) // More forgiving hit detection
                            {
                                applyDirectProjectileHit(projectile.weapon, projectile.target);
                            }
                        }
                    }
                    
                    projectilesToRemove.Add(projectile);
                }
            }
            
            foreach (var projectile in projectilesToRemove)
            {
                _pendingProjectiles.Remove(projectile);
            }
        }
        
        /// <summary>
        /// FIXED: Proper area-of-effect validation like ArenaBot - no damage without proper explosion radius check
        /// </summary>
        private void checkExplosionDamageAtImpact(ItemInfo.Projectile weapon, float posX, float posY, float damageRadius)
        {
            // Use the same method as ArenaBot - getVehiclesInRange finds bots correctly
            var vehiclesInRange = _arena.getVehiclesInRange((short)posX, (short)posY, (int)damageRadius);
            
            int botsChecked = 0;
            int botsHit = 0;
            
            foreach (Vehicle vehicle in vehiclesInRange)
            {
                // Skip self and only damage enemies (both bots and human players)
                if (vehicle == this || vehicle._team == _team || vehicle.IsDead)
                {
                    continue;
                }
                
                // Only damage bots and human players, not other vehicle types
                if (!(vehicle is Bot) && !isHumanPlayer(vehicle))
                {
                    continue;
                }
                
                botsChecked++;
                
                // CRITICAL: Calculate exact distance from explosion center
                double distance = Math.Sqrt(
                    Math.Pow(vehicle._state.positionX - posX, 2) + 
                    Math.Pow(vehicle._state.positionY - posY, 2)
                );
                
                // CRITICAL: Double-check if within radius (getVehiclesInRange might be approximate)
                if (distance <= damageRadius)
                {
                    // Apply damage to bots manually (humans handled by game client automatically)
                    if (vehicle is Bot)
                    {
                        applyExplosionDamageToBot(weapon, vehicle as Bot, distance, damageRadius);
                        botsHit++;
                    }
                    // Human players will be damaged automatically by the game's damage system
                }
            }
        }
        
        /// <summary>
        /// FIXED: Apply explosion damage to bot using ArenaBot's exact approach
        /// </summary>
        private void applyExplosionDamageToBot(ItemInfo.Projectile weapon, Bot targetBot, double distance, float damageRadius)
        {
            // Calculate damage from ALL damage types using ArenaBot's proven system
            int totalDamage = CalculateAllDamageTypes(weapon, distance, damageRadius);
            
            if (totalDamage > 0)
            {
                // Apply damage exactly like ArenaBot does
                int oldHealth = targetBot._state.health;
                targetBot._state.health = (short)Math.Max(0, targetBot._state.health - totalDamage);
                
                // Handle death exactly like ArenaBot does
                if (targetBot._state.health <= 0)
                {
                    // Don't look for Player objects - bots don't have them (same as ArenaBot)
                    // Just kill the bot directly
                    targetBot.kill(null, 0);
                }
            }
        }
        
        /// <summary>
        /// FIXED: Apply direct projectile hit using ArenaBot's exact approach
        /// </summary>
        private void applyDirectProjectileHit(ItemInfo.Projectile weapon, Vehicle target)
        {
            if (!(target is Bot) || target._team == _team || target.IsDead) return;
            
            Bot targetBot = target as Bot;
            
            // Calculate total damage from all types for direct hit (same as ArenaBot)
            int totalDamage = weapon.kineticDamageInner + weapon.explosiveDamageInner + weapon.electronicDamageInner + 
                             weapon.psionicDamageInner + weapon.bypassDamageInner + weapon.energyDamageInner;
            
            if (totalDamage <= 0) totalDamage = 25; // Fallback damage (same as ArenaBot)
            
            int oldHealth = targetBot._state.health;
            targetBot._state.health = (short)Math.Max(0, targetBot._state.health - totalDamage);
            
            // Handle death exactly like ArenaBot does
            if (targetBot._state.health <= 0)
            {
                // Don't look for Player objects - bots don't have them (same as ArenaBot)
                targetBot.kill(null, 0);
            }
        }
        
        /// <summary>
        /// FIXED: ArenaBot's proven damage calculation system with proper falloff
        /// </summary>
        private int CalculateAllDamageTypes(ItemInfo.Projectile weapon, double distance, float radius)
        {
            // Improved damage falloff curve - less severe than before (same as ArenaBot)
            float damageFalloff = Math.Max(0.4f, 1.0f - (float)(distance / radius) * 0.6f);
            int totalDamage = 0;
            
            // Check all 6 damage types with improved calculation (same as ArenaBot)
            totalDamage += CalculateDamageType(weapon.kineticDamageInner, weapon.kineticDamageOuter, damageFalloff, "Kinetic");
            totalDamage += CalculateDamageType(weapon.explosiveDamageInner, weapon.explosiveDamageOuter, damageFalloff, "Explosive");
            totalDamage += CalculateDamageType(weapon.psionicDamageInner, weapon.psionicDamageOuter, damageFalloff, "Psionic");
            totalDamage += CalculateDamageType(weapon.electronicDamageInner, weapon.electronicDamageOuter, damageFalloff, "Electronic");
            totalDamage += CalculateDamageType(weapon.energyDamageInner, weapon.energyDamageOuter, damageFalloff, "Energy");
            totalDamage += CalculateDamageType(weapon.bypassDamageInner, weapon.bypassDamageOuter, damageFalloff, "Bypass");
            
            return totalDamage;
        }
        
        /// <summary>
        /// FIXED: ArenaBot's proven damage calculation per type with proper capping
        /// </summary>
        private int CalculateDamageType(int innerDamage, int outerDamage, float falloff, string damageType)
        {
            if (innerDamage <= 0 && outerDamage <= 0) return 0;
            
            // Use inner damage for close range, interpolate to outer damage at max range (same as ArenaBot)
            int damage = innerDamage > outerDamage ? innerDamage : outerDamage;
            if (innerDamage > 0 && outerDamage > 0)
            {
                damage = (int)(innerDamage * (1.0f - falloff) + outerDamage * falloff);
            }
            
            // Cap damage per type to prevent instant kills (same as ArenaBot)
            int finalDamage = Math.Min(damage, 50);
            
            return finalDamage;
        }
        
        /// <summary>
        /// Check if vehicle is a human player (FROM ARENABOT)
        /// </summary>
        private bool isHumanPlayer(Vehicle vehicle)
        {
            if (vehicle is Bot) return false;
            var player = _arena.PlayersIngame.FirstOrDefault(p => p._baseVehicle == vehicle);
            return player != null;
        }

        ///////////////////////////////////////////////////
        // Weapon Type Identification (from DuelBot)
        ///////////////////////////////////////////////////
        private WeaponType GetCurrentWeaponType()
        {
            if (_weapon.ItemID == 0 || _currentWeaponIndex >= _type.InventoryItems.Count())
                return WeaponType.Unknown;
                
            int itemId = _type.InventoryItems[_currentWeaponIndex];
            
            // Identify weapons by their item IDs
            switch (itemId)
            {
                // Maklov AR mk 606 (assault rifle)
                case 1096:
                    return WeaponType.AR;
                    
                // Maklov G2 ACW (shotgun) 
                case 3001:
                    return WeaponType.Shotgun;
                    
                // Maklov RG 2 (rifle grenade)
                case 1106:
                    return WeaponType.RifleGrenade;
                    
                // Maklov AC mk2 (long-range weapon)
                case 3031:
                    return WeaponType.ACMk2;
                    
                // Micro Missile Launcher
                case 3009:
                    return WeaponType.MicroMissile;
                    
                default:
                    return WeaponType.Unknown;
            }
        }
        
        private WeaponType GetWeaponTypeFromId(int itemId)
        {
            switch (itemId)
            {
                case 1096: return WeaponType.AR;
                case 3001: return WeaponType.Shotgun;
                case 1106: return WeaponType.RifleGrenade;
                case 3031: return WeaponType.ACMk2;
                case 3009: return WeaponType.MicroMissile;
                default: return WeaponType.Unknown;
            }
        }
        
        private float GetOptimalDistanceForWeapon(WeaponType weaponType)
        {
            switch (weaponType)
            {
                case WeaponType.ACMk2:
                    return _acOptimalDistance; // Long range
                case WeaponType.MicroMissile:
                    return _mmlOptimalDistance; // Medium-close range
                case WeaponType.Shotgun:
                    return 100f; // Close range
                default:
                    return _optimalRange; // Default range for AR and others
            }
        }
        
        ///////////////////////////////////////////////////
        // Weapon state reset when switching (from DuelBot)
        ///////////////////////////////////////////////////
        private void resetWeaponStates()
        {
            _rgState = RGState.Idle;
            _acState = ACState.Idle;
            _acNextShotTime = 0;
            _acShotsFired = 0;
            _acClipsFired = 0;
            _mmlState = MMLState.Idle;
        }
    }

    ///////////////////////////////////////////////////
    // Helper Functions (renamed to avoid conflicts)
    ///////////////////////////////////////////////////
    public static class CTFBotHelpers
    {
        public static double distanceTo(Bot bot, Player player)
        {
            return Math.Sqrt(Math.Pow(bot._state.positionX - player._baseVehicle._state.positionX, 2) + 
                           Math.Pow(bot._state.positionY - player._baseVehicle._state.positionY, 2));
        }

        public static double distanceTo(Bot bot, Vehicle vehicle)
        {
            return Math.Sqrt(Math.Pow(bot._state.positionX - vehicle._state.positionX, 2) + 
                           Math.Pow(bot._state.positionY - vehicle._state.positionY, 2));
        }

        public static double distanceTo(Vehicle from, Vehicle to)
        {
            return Math.Sqrt(Math.Pow(from._state.positionX - to._state.positionX, 2) + 
                           Math.Pow(from._state.positionY - to._state.positionY, 2));
        }

        public static double distanceSquaredTo(InfServer.Protocol.Helpers.ObjectState state1, InfServer.Protocol.Helpers.ObjectState state2)
        {
            return Math.Pow(state1.positionX - state2.positionX, 2) + 
                   Math.Pow(state1.positionY - state2.positionY, 2);
        }

        public static double calculateDegreesBetweenPoints(double x1, double y1, double x2, double y2)
        {
            double radians = Math.Atan2(y2 - y1, x2 - x1);
            double degrees = radians * (180.0 / Math.PI);
            return (degrees + 360) % 360;
        }

        public static double calculateDifferenceInAngles(double angle1, double angle2)
        {
            double difference = angle2 - angle1;
            while (difference < -180) difference += 360;
            while (difference > 180) difference -= 360;
            return difference;
        }
    }
} 