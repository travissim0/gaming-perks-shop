#!/usr/bin/env python3
"""
CTFBot + TDM Integration Verification Script
Checks that the integration files are properly structured for testing.
"""

import os
import re
import sys

def check_file_exists(file_path, description):
    """Check if a file exists and report status."""
    if os.path.exists(file_path):
        print(f"✅ {description}: {file_path}")
        return True
    else:
        print(f"❌ {description}: {file_path} NOT FOUND")
        return False

def check_file_content(file_path, patterns, description):
    """Check if file contains required patterns."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        missing_patterns = []
        for pattern_name, pattern in patterns.items():
            if not re.search(pattern, content, re.MULTILINE | re.DOTALL):
                missing_patterns.append(pattern_name)
        
        if not missing_patterns:
            print(f"✅ {description}: All required patterns found")
            return True
        else:
            print(f"❌ {description}: Missing patterns: {', '.join(missing_patterns)}")
            return False
            
    except Exception as e:
        print(f"❌ {description}: Error reading file - {e}")
        return False

def main():
    """Main verification function."""
    print("🧪 CTFBot + TDM Integration Verification")
    print("=" * 50)
    
    # Define base paths
    base_path = os.path.dirname(os.path.abspath(__file__))
    ctf_path = os.path.dirname(base_path)
    
    # File paths to check
    files_to_check = {
        "CTFBot.cs": os.path.join(ctf_path, "Bots", "CTFBot.cs"),
        "TDM.cs": os.path.join(base_path, "TDM.cs"),
        "Testing Guide": os.path.join(base_path, "TESTING_GUIDE.md")
    }
    
    # Check file existence
    all_files_exist = True
    for desc, path in files_to_check.items():
        if not check_file_exists(path, desc):
            all_files_exist = False
    
    if not all_files_exist:
        print("\n❌ CRITICAL: Required files missing. Cannot proceed with verification.")
        return False
    
    print("\n🔍 Verifying File Content...")
    
    # CTFBot.cs verification patterns
    ctfbot_patterns = {
        "Namespace": r"namespace\s+InfServer\.Script\.CTFBot",
        "Class Definition": r"class\s+Script_CTF\s*:\s*Scripts\.IScript",
        "Member Variables": r"private\s+Bot\s+_bot",
        "Weapon Types": r"private\s+enum\s+WeaponType.*AR.*Shotgun.*RifleGrenade",
        "Debug Messages": r"Console\.WriteLine\(\"\[CTF DEBUG\]",
        "Init Method": r"public\s+bool\s+init\(IEventObject\s+invoker\)",
        "Poll Method": r"public\s+bool\s+poll\(\)",
        "Combat Logic": r"private\s+void\s+doCombatLogic",
        "Weapon Switching": r"ChooseOptimalWeaponForDistance",
        "Target Acquisition": r"getClosestPlayer"
    }
    
    # TDM.cs verification patterns
    tdm_patterns = {
        "CTFBot Import": r"using\s+InfServer\.Script\.CTFBot",
        "Bot List": r"public\s+List<Bot>\s+_ctfBots",
        "Bot Spawning": r"private\s+void\s+handleBotSpawning",
        "Vehicle Selection": r"getCTFBotVehicleType.*301.*129",
        "Bot Management": r"private\s+void\s+manageBots",
        "Spawn Intervals": r"BOT_SPAWN_MIN_INTERVAL.*BOT_SPAWN_MAX_INTERVAL",
        "Skill Levels": r"enum\s+BotSkillLevel.*Weak.*Average.*Strong.*Elite",
        "Poll Integration": r"handleBotSpawning\(now\).*manageBots\(now\)",
        "CTFBot Creation": r"InfServer\.Script\.CTFBot\.Script_CTF",
        "Team Balance": r"getTeamWithFewestBots"
    }
    
    # Verify content
    ctfbot_ok = check_file_content(files_to_check["CTFBot.cs"], ctfbot_patterns, "CTFBot.cs Content")
    tdm_ok = check_file_content(files_to_check["TDM.cs"], tdm_patterns, "TDM.cs Content")
    
    print("\n📊 Verification Summary")
    print("=" * 30)
    
    if ctfbot_ok and tdm_ok:
        print("🎉 ALL CHECKS PASSED!")
        print("\n✅ Integration appears ready for testing")
        print("✅ CTFBot has proper structure and combat AI")
        print("✅ TDM has bot spawning integration")
        print("✅ Vehicle alternation (301/129) configured")
        print("✅ Namespace and imports correct")
        
        print("\n🚀 Next Steps:")
        print("1. Compile the server and check for errors")
        print("2. Start TDM game mode")
        print("3. Follow the TESTING_GUIDE.md for detailed testing")
        print("4. Look for '[CTF DEBUG]' messages in console")
        print("5. Verify bots spawn with alternating vehicles 301/129")
        
        return True
    else:
        print("❌ ISSUES FOUND!")
        print("\n🔧 Fix Required:")
        if not ctfbot_ok:
            print("- CTFBot.cs needs attention")
        if not tdm_ok:
            print("- TDM.cs needs attention")
        
        print("\n📖 Refer to error messages above for specific issues")
        return False

def check_integration_health():
    """Additional health checks for the integration."""
    print("\n🔍 Additional Integration Health Checks...")
    
    # Check for common integration issues
    issues = []
    
    # Check that CTFBot.cs doesn't have DuelBot references
    ctfbot_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Bots", "CTFBot.cs")
    if os.path.exists(ctfbot_path):
        with open(ctfbot_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if "DuelBot" in content and "namespace InfServer.Script.DuelBot" not in content:
            issues.append("CTFBot.cs still contains DuelBot references")
            
        if "[DEBUG]" in content and "[CTF DEBUG]" not in content:
            issues.append("CTFBot.cs debug messages not updated to CTF prefix")
    
    # Check TDM integration points
    tdm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "TDM.cs")
    if os.path.exists(tdm_path):
        with open(tdm_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        if "ArenaBot" in content:
            issues.append("TDM.cs still references ArenaBot instead of CTFBot")
            
        if "vehicle 113" in content.lower():
            issues.append("TDM.cs still uses vehicle 113 instead of 301/129")
    
    if issues:
        print("⚠️  Potential Issues Found:")
        for issue in issues:
            print(f"   - {issue}")
        return False
    else:
        print("✅ No additional issues detected")
        return True

if __name__ == "__main__":
    print("Starting CTFBot + TDM Integration Verification...\n")
    
    success = main()
    health_ok = check_integration_health()
    
    print("\n" + "=" * 50)
    if success and health_ok:
        print("🏆 VERIFICATION COMPLETE: Ready for testing!")
        sys.exit(0)
    else:
        print("🚨 VERIFICATION FAILED: Fix issues before testing")
        sys.exit(1) 