#!/usr/bin/env node

/**
 * Debug script to test zone-manager.sh execution
 * Run this directly on your production server to verify the script works
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Configuration
const SCRIPT_PATHS = [
  '/var/www/gaming-perks-shop/zone-manager.sh',
  '/root/Infantry/scripts/zone-manager.sh'
];

async function runTests() {
  console.log('🧪 Starting comprehensive zone management debugging...');
  console.log('=' .repeat(60));
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd(),
      user: process.env.USER || process.env.USERNAME,
      pm2: !!process.env.PM2_HOME
    },
    tests: {}
  };
  
  // Test 1: Environment Check
  console.log('\n🔍 TEST 1: Environment Check');
  console.log('-' .repeat(30));
  
  try {
    const env = await Promise.allSettled([
      execAsync('whoami'),
      execAsync('pwd'),
      execAsync('echo $PATH'),
      execAsync('which screen || echo "screen not found"'),
      execAsync('which bash'),
      execAsync('ps aux | grep pm2 | head -5 || echo "No PM2 processes"'),
      execAsync('ulimit -a | grep "max user processes" || echo "No ulimit info"')
    ]);
    
    results.tests.environment = {
      whoami: env[0].status === 'fulfilled' ? env[0].value.stdout.trim() : env[0].reason.message,
      pwd: env[1].status === 'fulfilled' ? env[1].value.stdout.trim() : env[1].reason.message,
      path: env[2].status === 'fulfilled' ? env[2].value.stdout.trim() : env[2].reason.message,
      screen: env[3].status === 'fulfilled' ? env[3].value.stdout.trim() : env[3].reason.message,
      bash: env[4].status === 'fulfilled' ? env[4].value.stdout.trim() : env[4].reason.message,
      pm2Processes: env[5].status === 'fulfilled' ? env[5].value.stdout.trim() : env[5].reason.message,
      ulimit: env[6].status === 'fulfilled' ? env[6].value.stdout.trim() : env[6].reason.message
    };
    
    console.log('✅ Environment check completed');
    Object.entries(results.tests.environment).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  } catch (error) {
    console.error('❌ Environment check failed:', error.message);
    results.tests.environment = { error: error.message };
  }
  
  // Test 2: Script File Checks
  console.log('\n📄 TEST 2: Script File Checks');
  console.log('-' .repeat(30));
  
  results.tests.scriptFiles = [];
  
  for (const scriptPath of SCRIPT_PATHS) {
    const fileTest = {
      path: scriptPath,
      exists: fs.existsSync(scriptPath),
      executable: false,
      size: 0,
      permissions: '',
      owner: ''
    };
    
    if (fileTest.exists) {
      try {
        const stats = fs.statSync(scriptPath);
        fileTest.size = stats.size;
        fileTest.permissions = stats.mode.toString(8);
        
        // Check if executable
        fs.accessSync(scriptPath, fs.constants.F_OK | fs.constants.X_OK);
        fileTest.executable = true;
        
        // Get owner info
        const { stdout: lsOutput } = await execAsync(`ls -la "${scriptPath}"`);
        fileTest.owner = lsOutput.trim();
        
        console.log(`✅ ${scriptPath}: exists, ${fileTest.size} bytes, ${fileTest.executable ? 'executable' : 'not executable'}`);
      } catch (error) {
        fileTest.error = error.message;
        console.log(`❌ ${scriptPath}: ${error.message}`);
      }
    } else {
      console.log(`❌ ${scriptPath}: does not exist`);
    }
    
    results.tests.scriptFiles.push(fileTest);
  }
  
  // Find the best script to use
  const workingScript = results.tests.scriptFiles.find(s => s.exists && s.executable);
  if (!workingScript) {
    console.error('💥 No working script found!');
    return results;
  }
  
  console.log(`🎯 Using script: ${workingScript.path}`);
  
  // Test 3: Directory Structure Check
  console.log('\n📁 TEST 3: Directory Structure Check');
  console.log('-' .repeat(30));
  
  try {
    const directories = [
      '/root/Infantry',
      '/root/Infantry/Zones',
      '/root/Infantry/logs',
      '/var/www/gaming-perks-shop'
    ];
    
    results.tests.directories = [];
    
    for (const dir of directories) {
      const dirTest = {
        path: dir,
        exists: fs.existsSync(dir),
        readable: false,
        writable: false,
        contents: []
      };
      
      if (dirTest.exists) {
        try {
          fs.accessSync(dir, fs.constants.R_OK);
          dirTest.readable = true;
          
          fs.accessSync(dir, fs.constants.W_OK);
          dirTest.writable = true;
          
          if (dir === '/root/Infantry/Zones') {
            dirTest.contents = fs.readdirSync(dir).filter(item => {
              const itemPath = path.join(dir, item);
              return fs.statSync(itemPath).isDirectory();
            });
          }
          
          console.log(`✅ ${dir}: exists, ${dirTest.readable ? 'readable' : 'not readable'}, ${dirTest.writable ? 'writable' : 'not writable'}`);
          if (dirTest.contents.length > 0) {
            console.log(`   Zones: ${dirTest.contents.slice(0, 5).join(', ')}${dirTest.contents.length > 5 ? '...' : ''}`);
          }
        } catch (error) {
          dirTest.error = error.message;
          console.log(`❌ ${dir}: ${error.message}`);
        }
      } else {
        console.log(`❌ ${dir}: does not exist`);
      }
      
      results.tests.directories.push(dirTest);
    }
  } catch (error) {
    console.error('❌ Directory check failed:', error.message);
    results.tests.directories = { error: error.message };
  }
  
  // Test 4: Screen Command Test
  console.log('\n📺 TEST 4: Screen Command Test');
  console.log('-' .repeat(30));
  
  try {
    const { stdout: screenList } = await execAsync('screen -list || echo "No screen sessions"', { timeout: 10000 });
    results.tests.screen = {
      available: true,
      sessions: screenList.trim()
    };
    console.log('✅ Screen command working');
    console.log(`   Current sessions: ${screenList.trim()}`);
  } catch (error) {
    results.tests.screen = {
      available: false,
      error: error.message
    };
    console.error('❌ Screen command failed:', error.message);
  }
  
  // Test 5: Simple Script Execution
  console.log('\n🚀 TEST 5: Simple Script Execution');
  console.log('-' .repeat(30));
  
  const simpleCommands = ['list', 'status-all'];
  results.tests.simpleExecution = [];
  
  for (const command of simpleCommands) {
    console.log(`   Testing: ${command}`);
    const testStart = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(
        `bash "${workingScript.path}" ${command}`,
        {
          timeout: 30000,
          cwd: '/var/www/gaming-perks-shop',
          env: {
            ...process.env,
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
          }
        }
      );
      
      const duration = Date.now() - testStart;
      const result = {
        command,
        success: true,
        duration,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };
      
      // Try to parse JSON for status-all
      if (command === 'status-all' && stdout.trim()) {
        try {
          result.parsedJson = JSON.parse(stdout.trim());
          result.validJson = true;
        } catch (e) {
          result.validJson = false;
          result.jsonError = e.message;
        }
      }
      
      results.tests.simpleExecution.push(result);
      console.log(`   ✅ ${command}: ${duration}ms, ${stdout.length} chars output`);
      
    } catch (error) {
      const duration = Date.now() - testStart;
      results.tests.simpleExecution.push({
        command,
        success: false,
        duration,
        error: error.message,
        code: error.code,
        signal: error.signal,
        killed: error.killed
      });
      console.log(`   ❌ ${command}: ${error.message} (${duration}ms)`);
    }
  }
  
  // Test 6: Spawn Method Test
  console.log('\n🎯 TEST 6: Spawn Method Test');
  console.log('-' .repeat(30));
  
  const spawnTest = await new Promise((resolve) => {
    const testStart = Date.now();
    console.log('   Starting spawn test for status-all...');
    
    const child = spawn('bash', [workingScript.path, 'status-all'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: '/var/www/gaming-perks-shop',
      env: {
        ...process.env,
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      },
      detached: false
    });
    
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let completed = false;
    
    const timeout = setTimeout(() => {
      if (!completed) {
        timedOut = true;
        console.log('   ⏰ Spawn test timed out');
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }
    }, 60000);
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code, signal) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      
      const duration = Date.now() - testStart;
      console.log(`   📤 Process closed: code=${code}, signal=${signal}, duration=${duration}ms`);
      
      resolve({
        success: !timedOut && code === 0,
        exitCode: code,
        signal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        duration
      });
    });
    
    child.on('error', (error) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      
      const duration = Date.now() - testStart;
      console.log(`   💥 Process error: ${error.message}`);
      
      resolve({
        success: false,
        error: error.message,
        duration
      });
    });
  });
  
  results.tests.spawnExecution = spawnTest;
  console.log(`   ${spawnTest.success ? '✅' : '❌'} Spawn test: ${spawnTest.duration}ms`);
  
  // Test 7: Resource Usage Check
  console.log('\n💾 TEST 7: Resource Usage Check');
  console.log('-' .repeat(30));
  
  try {
    const resourceChecks = await Promise.allSettled([
      execAsync('free -h'),
      execAsync('df -h /'),
      execAsync('ps aux | grep -E "(node|pm2)" | head -10'),
      execAsync('pgrep -f "ZoneServer" | wc -l || echo "0"')
    ]);
    
    results.tests.resources = {
      memory: resourceChecks[0].status === 'fulfilled' ? resourceChecks[0].value.stdout.trim() : 'failed',
      disk: resourceChecks[1].status === 'fulfilled' ? resourceChecks[1].value.stdout.trim() : 'failed',
      processes: resourceChecks[2].status === 'fulfilled' ? resourceChecks[2].value.stdout.trim() : 'failed',
      zoneServers: resourceChecks[3].status === 'fulfilled' ? resourceChecks[3].value.stdout.trim() : 'failed'
    };
    
    console.log('✅ Resource usage check completed');
  } catch (error) {
    results.tests.resources = { error: error.message };
    console.error('❌ Resource check failed:', error.message);
  }
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  
  const testNames = Object.keys(results.tests);
  const passedTests = testNames.filter(name => {
    const test = results.tests[name];
    if (Array.isArray(test)) {
      return test.some(t => t.success);
    }
    return test.success !== false && !test.error;
  });
  
  console.log(`Tests passed: ${passedTests.length}/${testNames.length}`);
  console.log(`Working script: ${workingScript ? workingScript.path : 'None found'}`);
  
  if (spawnTest.success) {
    console.log('✅ Spawn method works - this should resolve the production issue');
  } else {
    console.log('❌ Spawn method failed - investigate further');
  }
  
  // Write detailed results to file
  const resultsFile = '/tmp/zone-debug-results.json';
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📄 Detailed results saved to: ${resultsFile}`);
  
  return results;
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests }; 