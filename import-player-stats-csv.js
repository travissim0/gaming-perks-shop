const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkinpmqnbcjaftqduujf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raW5wbXFuYmNqYWZ0cWR1dWpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODEyMDQ3NiwiZXhwIjoyMDYzNjk2NDc2fQ.u8bPszZSVGJku44KFKyRszfL2lZVwv4-EBYc3dgezK4';

const STATS_DIR = './imported-stats'; // Directory containing CSV files
const BATCH_SIZE = 100; // Process in batches to avoid memory issues

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CSV column mapping to database fields
const CSV_TO_DB_MAPPING = {
  // Direct mappings from your CSV sample
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

// Default values for missing fields (based on your database schema)
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
 * Parse a single CSV row and map it to database format
 */
function parseRowToDbFormat(row, gameId, gameDate) {
  const dbRow = { ...DEFAULT_VALUES };
  
  // Set game metadata
  dbRow.game_id = gameId;
  dbRow.game_date = gameDate;
  
  // Map CSV columns to database fields
  Object.keys(CSV_TO_DB_MAPPING).forEach(csvCol => {
    const dbCol = CSV_TO_DB_MAPPING[csvCol];
    if (row[csvCol] !== undefined && row[csvCol] !== null && row[csvCol] !== '') {
      let value = row[csvCol];
      
      // Type conversion based on database schema
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
          // Ensure valid result values
          dbRow[dbCol] = ['Win', 'Loss'].includes(value) ? value : null;
          break;
          
        case 'side':
          // Ensure valid side values
          dbRow[dbCol] = ['offense', 'defense'].includes(value) ? value : 'N/A';
          break;
          
        default:
          // String fields
          dbRow[dbCol] = value.toString().trim();
      }
    }
  });
  
  // Validate required fields
  if (!dbRow.player_name || dbRow.player_name.trim() === '') {
    throw new Error('Player name is required');
  }
  
  return dbRow;
}

/**
 * Extract game ID and date from filename
 */
function extractGameMetadata(filename) {
  // Extract date from filename like: game_stats_06_10_2025_01_22_19_ovd.csv
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
 * Process a single CSV file
 */
async function processCSVFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`\n📊 Processing: ${filename}`);
  
  const { gameId, gameDate } = extractGameMetadata(filename);
  console.log(`🎮 Game ID: ${gameId}`);
  console.log(`📅 Game Date: ${gameDate}`);
  
  const results = [];
  const errors = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          const dbRow = parseRowToDbFormat(row, gameId, gameDate);
          results.push(dbRow);
        } catch (error) {
          errors.push({
            row: Object.keys(results).length + 1,
            error: error.message,
            data: row
          });
        }
      })
      .on('end', async () => {
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
      })
      .on('error', reject);
  });
}

/**
 * Insert data in batches to avoid overwhelming the database
 */
async function insertDataInBatches(data, gameId) {
  console.log(`💾 Inserting ${data.length} records in batches of ${BATCH_SIZE}...`);
  
  // Check if game already exists
  const { data: existingGame } = await supabase
    .from('player_stats')
    .select('game_id')
    .eq('game_id', gameId)
    .limit(1);
    
  if (existingGame && existingGame.length > 0) {
    console.log(`⚠️  Game ${gameId} already exists in database. Skipping...`);
    return;
  }
  
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
 * Main function to process all CSV files
 */
async function main() {
  console.log('🚀 Starting CSV import process...');
  console.log(`📁 Looking for CSV files in: ${STATS_DIR}`);
  
  // Create stats directory if it doesn't exist
  if (!fs.existsSync(STATS_DIR)) {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    console.log(`📁 Created directory: ${STATS_DIR}`);
    console.log('📥 Please copy your CSV files to this directory and run the script again.');
    return;
  }
  
  // Find all CSV files with 'ovd' in the name
  const files = fs.readdirSync(STATS_DIR)
    .filter(f => f.endsWith('.csv') && f.toLowerCase().includes('ovd'))
    .map(f => path.join(STATS_DIR, f));
    
  if (files.length === 0) {
    console.log('❌ No CSV files with "ovd" in the name found.');
    console.log('📥 Please copy your OvD CSV files to the imported-stats directory.');
    return;
  }
  
  console.log(`📋 Found ${files.length} OvD CSV files to process:`);
  files.forEach(f => console.log(`   - ${path.basename(f)}`));
  
  const results = [];
  let totalProcessed = 0;
  let totalErrors = 0;
  
  // Process each file
  for (const file of files) {
    try {
      const result = await processCSVFile(file);
      results.push(result);
      totalProcessed += result.processed;
      totalErrors += result.errors;
    } catch (error) {
      console.error(`❌ Failed to process ${path.basename(file)}:`, error.message);
      results.push({
        filename: path.basename(file),
        processed: 0,
        errors: 1,
        error: error.message
      });
      totalErrors++;
    }
  }
  
  // Summary
  console.log('\n🎉 Import process completed!');
  console.log('📊 Summary:');
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Total records processed: ${totalProcessed}`);
  console.log(`   Total errors: ${totalErrors}`);
  
  console.log('\n📋 Detailed results:');
  results.forEach(result => {
    if (result.error) {
      console.log(`   ❌ ${result.filename}: ERROR - ${result.error}`);
    } else {
      console.log(`   ✅ ${result.filename}: ${result.processed} records (${result.errors} errors)`);
    }
  });
  
  if (totalProcessed > 0) {
    console.log('\n🔄 Aggregate stats will be automatically updated by database triggers.');
    console.log('🌐 Check your website to see the imported stats!');
  }
}

// Handle command line arguments
if (process.argv.length > 2) {
  const customDir = process.argv[2];
  if (fs.existsSync(customDir)) {
    STATS_DIR = customDir;
    console.log(`📁 Using custom directory: ${customDir}`);
  } else {
    console.log(`❌ Directory not found: ${customDir}`);
    process.exit(1);
  }
}

// Run the import
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
}); 