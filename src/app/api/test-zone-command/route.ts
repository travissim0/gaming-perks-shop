import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const IS_LOCAL = process.env.NODE_ENV === 'development';
const SERVER_HOST = process.env.REMOTE_SERVER_HOST;
const SERVER_USER = process.env.REMOTE_SERVER_USER || 'root';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const testType = searchParams.get('test') || 'basic';
    
    console.log(`🧪 Starting zone test: ${testType} at ${new Date().toISOString()}`);
    
    const results: any = {
      testType,
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        hostname: require('os').hostname(),
        pid: process.pid,
        cwd: process.cwd(),
        pm2: !!process.env.PM2_HOME
      }
    };
    
    // Test 1: Basic environment check
    if (testType === 'basic' || testType === 'all') {
      console.log('🔍 Running basic environment tests...');
      
      // Check script existence and permissions
      const scriptPath = '/var/www/gaming-perks-shop/zone-manager.sh';
      const backupScriptPath = '/root/Infantry/scripts/zone-manager.sh';
      
      results.scriptChecks = {
        primaryPath: scriptPath,
        primaryExists: fs.existsSync(scriptPath),
        primaryExecutable: false,
        backupPath: backupScriptPath,
        backupExists: fs.existsSync(backupScriptPath),
        backupExecutable: false
      };
      
      // Check permissions on both scripts
      try {
        fs.accessSync(scriptPath, fs.constants.F_OK | fs.constants.X_OK);
        results.scriptChecks.primaryExecutable = true;
      } catch (e) {
        results.scriptChecks.primaryError = (e as Error).message;
      }
      
      try {
        fs.accessSync(backupScriptPath, fs.constants.F_OK | fs.constants.X_OK);
        results.scriptChecks.backupExecutable = true;
      } catch (e) {
        results.scriptChecks.backupError = (e as Error).message;
      }
      
      // Test command availability
      try {
        const { stdout: whichScreen } = await execAsync('which screen', { timeout: 5000 });
        results.commandChecks = {
          screen: whichScreen.trim(),
          bash: '/bin/bash'
        };
      } catch (e) {
        results.commandChecks = { error: (e as Error).message };
      }
    }
    
    // Test 2: Direct script execution with timeout handling
    if (testType === 'direct' || testType === 'all') {
      console.log('🚀 Testing direct script execution...');
      
      const scriptPath = fs.existsSync('/var/www/gaming-perks-shop/zone-manager.sh') 
        ? '/var/www/gaming-perks-shop/zone-manager.sh'
        : '/root/Infantry/scripts/zone-manager.sh';
      
      // Test with spawn for better process control
      const directTest = await new Promise((resolve) => {
        const child = spawn('bash', [scriptPath, 'status-all'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000, // 30 second timeout
          killSignal: 'SIGTERM',
          env: {
            ...process.env,
            PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
          }
        });
        
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        
        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 5000); // Force kill after 5s
        }, 30000);
        
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code, signal) => {
          clearTimeout(timeout);
          resolve({
            exitCode: code,
            signal,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            timedOut,
            duration: Date.now() - startTime
          });
        });
        
        child.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            error: error.message,
            timedOut,
            duration: Date.now() - startTime
          });
        });
      });
      
      results.directExecution = directTest;
    }
    
    // Test 3: execAsync with various timeout settings
    if (testType === 'exec' || testType === 'all') {
      console.log('⚡ Testing execAsync with different timeouts...');
      
      const scriptPath = fs.existsSync('/var/www/gaming-perks-shop/zone-manager.sh') 
        ? '/var/www/gaming-perks-shop/zone-manager.sh'
        : '/root/Infantry/scripts/zone-manager.sh';
      
      // Test multiple timeout values
      const timeouts = [10000, 30000, 60000];
      results.execTests = [];
      
      for (const timeout of timeouts) {
        const testStart = Date.now();
        try {
          console.log(`⏱️ Testing with ${timeout}ms timeout...`);
          
          const { stdout, stderr } = await execAsync(
            `bash "${scriptPath}" status-all`,
            {
              timeout,
              cwd: '/var/www/gaming-perks-shop',
              env: {
                ...process.env,
                PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
              },
              killSignal: 'SIGTERM'
            }
          );
          
          results.execTests.push({
            timeout,
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            duration: Date.now() - testStart
          });
          
          // If successful, break out to avoid redundant tests
          break;
          
        } catch (error: any) {
          results.execTests.push({
            timeout,
            success: false,
            error: error.message,
            code: error.code,
            signal: error.signal,
            killed: error.killed,
            duration: Date.now() - testStart
          });
        }
      }
    }
    
    // Test 4: Simple command tests
    if (testType === 'simple' || testType === 'all') {
      console.log('📝 Testing simple commands...');
      
      const simpleTests = [
        'echo "Hello World"',
        'date',
        'whoami',
        'pwd',
        'ls -la /var/www/gaming-perks-shop/',
        'ls -la /root/Infantry/scripts/',
        'screen -list || echo "No screen sessions"'
      ];
      
      results.simpleCommands = [];
      
      for (const cmd of simpleTests) {
        try {
          const { stdout, stderr } = await execAsync(cmd, { 
            timeout: 5000,
            env: { ...process.env, PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
          });
          results.simpleCommands.push({
            command: cmd,
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        } catch (error: any) {
          results.simpleCommands.push({
            command: cmd,
            success: false,
            error: error.message,
            code: error.code,
            signal: error.signal
          });
        }
      }
    }
    
    // Test 5: PM2 environment detection
    if (testType === 'pm2' || testType === 'all') {
      console.log('🔧 Testing PM2 environment...');
      
      results.pm2Environment = {
        PM2_HOME: process.env.PM2_HOME,
        PM2_USAGE: process.env.PM2_USAGE,
        pm2_process: !!process.env.pm_id,
        process_title: process.title,
        argv: process.argv
      };
      
      // Test PM2 process limits
      try {
        const { stdout } = await execAsync('pm2 show gaming-perks-shop || echo "Not found"', { timeout: 5000 });
        results.pm2Environment.pm2Show = stdout.trim();
      } catch (e) {
        results.pm2Environment.pm2ShowError = (e as Error).message;
      }
    }
    
    console.log(`✅ Zone test completed in ${Date.now() - startTime}ms`);
    
    return NextResponse.json({
      success: true,
      results,
      totalDuration: Date.now() - startTime
    });
    
  } catch (error: any) {
    console.error('❌ Zone test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    }, { status: 500 });
  }
} 