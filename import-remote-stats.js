const { spawn } = require('child_process');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

// Remote server configuration
const REMOTE_CONFIG = {
  host: 'linux-1.freeinfantry.com',
  user: 'root',
  path: '/root/Infantry/Zones/CTF\\ -\\ Twin\\ Peaks\\ 2.0/playerStats'
};

const BATCH_SIZE = 100;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CSV column mapping (same as before)
const CSV_TO_DB_MAPPING = {
  'PlayerName': 'player_name',
  'Team': 'team', 
  'Kills': 'kills',
  'Deaths': 'deaths',
  'Captures': 'captures',
  'CarrierKills': 'carrier_kills',
  'CarryTimeSeconds': 'carry_time_seconds',
  'GameLengthMinutes': 'game_length_minutes',
  'Result': 'result',
  'MainClass': 'main_class',
  'ClassSwaps': 'class_swaps',
  'TurretDamage': 'turret_damage',
  'GameMode': 'game_mode',
  'Side': 'side',
  'BaseUsed': 'base_used'
};

// Default values (same as before)
const DEFAULT_VALUES = {
  game_id: null,
  player_name: '',
  team: null,
  game_mode: 'OvD',
  arena_name: null,
  base_used: null,
  side: 'N/A',
  result: null,
  main_class: null,
  kills: 0,
  deaths: 0,
  captures: 0,
  carrier_kills: 0,
  carry_time_seconds: 0,
  class_swaps: 0,
  turret_damage: 0,
  eb_hits: 0,
  accuracy: 0.000,
  avg_resource_unused_per_death: 0.00,
  avg_explosive_unused_per_death: 0.00,
  game_length_minutes: 0.00,
  game_date: new Date().toISOString()
};

/**
 * Get list of OvD CSV files from remote server
 */
async function getRemoteFileList() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Scanning remote server for OvD CSV files...');
    
    const sshCommand = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      `${REMOTE_CONFIG.user}@${REMOTE_CONFIG.host}`,
      `ls -1 ${REMOTE_CONFIG.path}/*ovd*.csv 2>/dev/null || echo "NO_FILES"`
    ]);
    
    let output = '';
    let errorOutput = '';
    
    sshCommand.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    sshCommand.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    sshCommand.on('close', (code) => {
      if (code === 0) {
        const files = output.trim().split('\n')
          .filter(line => line && line !== 'NO_FILES' && line.includes('ovd') && line.endsWith('.csv'))
          .map(fullPath => ({
            fullPath,
            filename: path.basename(fullPath)
          }));
        
        console.log(`📋 Found ${files.length} OvD CSV files on remote server`);
        files.forEach(f => console.log(`   - ${f.filename}`));
        resolve(files);
      } else {
        reject(new Error(`SSH command failed: ${errorOutput}`));
      }
    });
  });
}

/**
 * Process a single remote CSV file by streaming it through SSH
 */
async function processRemoteCSVFile(remoteFile) {
  const { fullPath, filename } = remoteFile;
  console.log(`\n📊 Processing remote file: ${filename}`);
  
  const { gameId, gameDate } = extractGameMetadata(filename);
  console.log(`🎮 Game ID: ${gameId}`);
  console.log(`📅 Game Date: ${gameDate}`);
  
  // Check if game already exists
  const { data: existingGame } = await supabase
    .from('player_stats')
    .select('game_id')
    .eq('game_id', gameId)
    .limit(1);
    
  if (existingGame && existingGame.length > 0) {
    console.log(`⚠️  Game ${gameId} already exists in database. Skipping...`);
    return {
      filename,
      processed: 0,
      errors: 0,
      gameId,
      skipped: true
    };
  }
  
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];
    
    // Stream the remote CSV file through SSH and cat
    const sshCommand = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      `${REMOTE_CONFIG.user}@${REMOTE_CONFIG.host}`,
      `cat "${fullPath}"`
    ]);
    
    let csvStream = sshCommand.stdout.pipe(csv());
    
    csvStream.on('data', (row) => {
      try {
        const dbRow = parseRowToDbFormat(row, gameId, gameDate);
        results.push(dbRow);
      } catch (error) {
        errors.push({
          row: results.length + errors.length + 1,
          error: error.message,
          data: row
        });
      }
    });
    
    csvStream.on('end', async () => {
      try {
        console.log(`📈 Parsed ${results.length} valid rows`);
        if (errors.length > 0) {
          console.log(`⚠️  ${errors.length} rows had errors:`);
          errors.forEach(err => {
            console.log(`   Row ${err.row}: ${err.error}`);
          });
        }
        
        if (results.length > 0) {
          await insertDataInBatches(results, gameId);
        }
        
        resolve({
          filename,
          processed: results.length,
          errors: errors.length,
          gameId
        });
      } catch (error) {
        reject(error);
      }
    });
    
    csvStream.on('error', (error) => {
      reject(new Error(`CSV parsing error: ${error.message}`));
    });
    
    sshCommand.stderr.on('data', (data) => {
      console.error(`SSH error: ${data.toString()}`);
    });
    
    sshCommand.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`SSH command failed with exit code: ${code}`));
      }
    });
  });
}

/**
 * Parse a single CSV row and map it to database format (same as before)
 */
function parseRowToDbFormat(row, gameId, gameDate) {
  const dbRow = { ...DEFAULT_VALUES };
  
  dbRow.game_id = gameId;
  dbRow.game_date = gameDate;
  
  Object.keys(CSV_TO_DB_MAPPING).forEach(csvCol => {
    const dbCol = CSV_TO_DB_MAPPING[csvCol];
    if (row[csvCol] !== undefined && row[csvCol] !== null && row[csvCol] !== '') {
      let value = row[csvCol];
      
      switch (dbCol) {
        case 'kills':
        case 'deaths':
        case 'captures':
        case 'carrier_kills':
        case 'carry_time_seconds':
        case 'class_swaps':
        case 'turret_damage':
        case 'eb_hits':
          dbRow[dbCol] = parseInt(value) || 0;
          break;
          
        case 'game_length_minutes':
        case 'accuracy':
        case 'avg_resource_unused_per_death':
        case 'avg_explosive_unused_per_death':
          dbRow[dbCol] = parseFloat(value) || 0.0;
          break;
          
        case 'result':
          dbRow[dbCol] = ['Win', 'Loss'].includes(value) ? value : null;
          break;
          
        case 'side':
          dbRow[dbCol] = ['offense', 'defense'].includes(value) ? value : 'N/A';
          break;
          
        default:
          dbRow[dbCol] = value.toString().trim();
      }
    }
  });
  
  if (!dbRow.player_name || dbRow.player_name.trim() === '') {
    throw new Error('Player name is required');
  }
  
  return dbRow;
}

/**
 * Extract game metadata from filename (same as before)
 */
function extractGameMetadata(filename) {
  const dateMatch = filename.match(/(\d{2})_(\d{2})_(\d{4})_(\d{2})_(\d{2})_(\d{2})/);
  
  let gameDate = new Date().toISOString();
  let gameId = filename.replace('.csv', '');
  
  if (dateMatch) {
    const [, month, day, year, hour, minute, second] = dateMatch;
    gameDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
    gameId = `ovd_${year}${month}${day}_${hour}${minute}${second}`;
  }
  
  return { gameId, gameDate };
}

/**
 * Insert data in batches (same as before)
 */
async function insertDataInBatches(data, gameId) {
  console.log(`💾 Inserting ${data.length} records in batches of ${BATCH_SIZE}...`);
  
  let inserted = 0;
  let failed = 0;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    
    try {
      const { data: insertedData, error } = await supabase
        .from('player_stats')
        .insert(batch)
        .select('id');
        
      if (error) {
        console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
        failed += batch.length;
      } else {
        inserted += insertedData.length;
        console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${insertedData.length} records inserted`);
      }
    } catch (error) {
      console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
      failed += batch.length;
    }
  }
  
  console.log(`📊 Final results: ${inserted} inserted, ${failed} failed`);
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting remote CSV import process...');
  console.log(`🖥️  Remote server: ${REMOTE_CONFIG.user}@${REMOTE_CONFIG.host}`);
  console.log(`📁 Remote path: ${REMOTE_CONFIG.path}`);
  
  try {
    // Get list of remote files
    const remoteFiles = await getRemoteFileList();
    
    if (remoteFiles.length === 0) {
      console.log('❌ No OvD CSV files found on remote server.');
      return;
    }
    
    const results = [];
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    
    // Process each remote file
    for (const remoteFile of remoteFiles) {
      try {
        const result = await processRemoteCSVFile(remoteFile);
        results.push(result);
        
        if (result.skipped) {
          totalSkipped++;
        } else {
          totalProcessed += result.processed;
          totalErrors += result.errors;
        }
      } catch (error) {
        console.error(`❌ Failed to process ${remoteFile.filename}:`, error.message);
        results.push({
          filename: remoteFile.filename,
          processed: 0,
          errors: 1,
          error: error.message
        });
        totalErrors++;
      }
    }
    
    // Summary
    console.log('\n🎉 Remote import process completed!');
    console.log('📊 Summary:');
    console.log(`   Files found: ${remoteFiles.length}`);
    console.log(`   Files processed: ${results.length - totalSkipped}`);
    console.log(`   Files skipped: ${totalSkipped}`);
    console.log(`   Total records processed: ${totalProcessed}`);
    console.log(`   Total errors: ${totalErrors}`);
    
    console.log('\n📋 Detailed results:');
    results.forEach(result => {
      if (result.error) {
        console.log(`   ❌ ${result.filename}: ERROR - ${result.error}`);
      } else if (result.skipped) {
        console.log(`   ⏭️  ${result.filename}: SKIPPED (already exists)`);
      } else {
        console.log(`   ✅ ${result.filename}: ${result.processed} records (${result.errors} errors)`);
      }
    });
    
    if (totalProcessed > 0) {
      console.log('\n🔄 Aggregate stats will be automatically updated by database triggers.');
      console.log('🌐 Check your website to see the imported stats!');
    }
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments for custom server config
if (process.argv.length > 2) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--host':
        REMOTE_CONFIG.host = args[++i];
        break;
      case '--user':
        REMOTE_CONFIG.user = args[++i];
        break;
      case '--path':
        REMOTE_CONFIG.path = args[++i];
        break;
      case '--help':
        console.log('Remote CSV Import Tool');
        console.log('Usage: node import-remote-stats.js [options]');
        console.log('Options:');
        console.log('  --host <hostname>    Remote server hostname');
        console.log('  --user <username>    SSH username');
        console.log('  --path <path>        Remote directory path');
        console.log('  --help              Show this help');
        process.exit(0);
    }
  }
}

// Run the import
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
}); 