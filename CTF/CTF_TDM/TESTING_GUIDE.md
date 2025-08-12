# CTFBot + TDM Integration Testing Guide

## Overview
This guide helps test the newly integrated CTFBot system in TDM (Team Deathmatch) mode. The integration spawns intelligent CTFBots using vehicles 301 and 129 with sophisticated DuelBot-based combat AI.

## Prerequisites
1. **CTFBot.cs** - Compiled successfully (fixed namespace issues)
2. **TDM.cs** - Updated with bot spawning system
3. **Server running** - CTF game type with TDM mode available
4. **At least 1 human player** - Required for bot spawning reference

## Testing Checklist

### ✅ **Phase 1: Compilation & Loading**
- [ ] Server starts without errors
- [ ] CTFBot.cs compiles successfully
- [ ] TDM.cs loads without compilation errors
- [ ] No namespace or reference errors in logs

### ✅ **Phase 2: TDM Game Activation**
- [ ] Start a TDM game using `?tdm` or admin commands
- [ ] Verify TDM spawn points work correctly
- [ ] Confirm TDM scoring system functions
- [ ] Check that kill limit system works

### ✅ **Phase 3: Bot Spawning**
**Expected Behavior:**
- Bots spawn 3-6 seconds after TDM game starts
- Maximum 1 bot per human player
- Alternates between vehicles 301 and 129
- Safe spawn locations (not on top of players)

**Test Steps:**
1. Join TDM game as human player
2. Wait 3-10 seconds
3. Look for bot spawn messages: `"&CTFBots active: X"`
4. Verify bots appear on battlefield
5. Check that vehicles alternate (301, then 129, then 301, etc.)

### ✅ **Phase 4: Bot Combat Behavior**
**Expected CTFBot AI Features:**
- Target acquisition and pursuit
- Weapon switching based on distance
- Advanced movement patterns (strafing, positioning)
- Line-of-sight checking
- Objective-based movement when no targets

**Test Steps:**
1. Engage CTFBot in combat
2. Observe weapon switching behavior
3. Check strafing and movement patterns
4. Verify bots pursue and engage targets
5. Test bot behavior when line-of-sight is broken

### ✅ **Phase 5: Team Balance**
- [ ] Bots distribute evenly across teams
- [ ] Bots don't all spawn on same team
- [ ] Team balance maintained as players join/leave

### ✅ **Phase 6: Bot Lifecycle**
- [ ] Dead bots are properly removed from active list
- [ ] New bots spawn to replace dead ones
- [ ] Bot count stays within limits (1 per player)
- [ ] Bots despawn when TDM game ends

## Expected Debug Messages

Look for these console messages to verify functionality:

```
[CTF DEBUG] New victim acquired, resetting shotgun combo
[CTF DEBUG] Switched to optimal weapon ID: 1096 for distance: 150
[CTF DEBUG] Shotgun fired.
[CTF DEBUG] Rifle grenade prefire initiated - standing still to aim for 1000ms
```

## Test Commands

Use these admin commands for testing:

```
?tdm                    - Start TDM mode
?tdmscore              - Check current scores
?tdmlimit 30           - Set kill limit to 30
?spec                  - Spectate to observe bot behavior
```

## Troubleshooting Common Issues

### 🚨 **No Bots Spawning**
- Check that TDM game is active (`_tdm.IsGameActive = true`)
- Verify at least 1 human player is in game
- Look for vehicle loading errors (vehicles 301/129 not found)
- Check console for CTFBot creation errors

### 🚨 **Compilation Errors**
- Verify `using InfServer.Script.CTFBot;` namespace
- Check CTFBot.cs has proper file structure
- Ensure all necessary using statements are present

### 🚨 **Bots Not Fighting**
- Check that CTFBot AI is properly initialized
- Verify weapon equipping works correctly
- Look for line-of-sight validation issues

### 🚨 **Wrong Vehicle Types**
- Verify vehicles 301 and 129 exist in asset files
- Check `getCTFBotVehicleType()` alternation logic
- Look for vehicle loading error messages

## Performance Monitoring

Monitor these aspects during testing:

1. **Memory Usage** - Ensure bots don't cause memory leaks
2. **Server Performance** - Check for lag with multiple bots
3. **Item Count** - Verify bot weapon spawning doesn't overflow items
4. **Network Traffic** - Monitor for excessive network usage

## Success Criteria

✅ **Integration Successful If:**
- CTFBots spawn automatically in TDM games
- Bots use vehicles 301 and 129 in alternating pattern
- Bots demonstrate sophisticated DuelBot combat AI
- Team balance is maintained
- Performance remains stable
- No compilation or runtime errors

## Advanced Testing

For thorough testing, try these scenarios:

1. **Multiple Players** - Test with 2-4 human players
2. **Team Switching** - Change teams and verify bot balance
3. **Extended Games** - Run long TDM games (50+ kills)
4. **Bot vs Bot** - Observe pure bot combat when players spectate
5. **Weapon Variety** - Test with different player weapon levels

## Reporting Issues

If issues are found, report with:
- Console error messages
- Specific reproduction steps
- Server configuration details
- Number of players/bots present
- Screenshots/video if helpful

---

**Ready to test!** Start with Phase 1 and work through each phase systematically. The CTFBot integration should provide sophisticated AI opponents that enhance TDM gameplay significantly. 