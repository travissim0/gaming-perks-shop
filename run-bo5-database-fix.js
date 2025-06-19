require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration');
    console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runBo5DatabaseFix() {
    try {
        console.log('🔧 Starting Bo5 database constraint fix...');
        
        // Read the SQL file
        const sqlContent = fs.readFileSync('fix-bo5-database-constraint.sql', 'utf8');
        
        // Split into individual statements (simple split on semicolon + newline)
        const statements = sqlContent
            .split(';\n')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt && !stmt.startsWith('--'));
        
        console.log(`📝 Found ${statements.length} SQL statements to execute`);
        
        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (!statement) continue;
            
            console.log(`\n🔄 Executing statement ${i + 1}/${statements.length}:`);
            console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
            
            const { data, error } = await supabase.rpc('exec_sql', { 
                sql_query: statement 
            });
            
            if (error) {
                // Try direct query if RPC fails
                const { data: directData, error: directError } = await supabase
                    .from('__direct_sql__')
                    .select('*')
                    .limit(0); // This will fail, but we can try a different approach
                
                // Let's try a simpler approach - execute the statements one by one
                console.log('⚠️  RPC method failed, trying direct execution...');
                
                // For constraint operations, we need to use the service role directly
                const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                        'apikey': supabaseServiceKey
                    },
                    body: JSON.stringify({ sql_query: statement })
                });
                
                if (!response.ok) {
                    console.error(`❌ Failed to execute statement ${i + 1}:`, await response.text());
                    continue;
                }
                
                const result = await response.json();
                console.log(`✅ Statement ${i + 1} executed successfully`);
                if (result && typeof result === 'object') {
                    console.log('Result:', result);
                }
            } else {
                console.log(`✅ Statement ${i + 1} executed successfully`);
                if (data) {
                    console.log('Result:', data);
                }
            }
        }
        
        console.log('\n🎉 Bo5 database constraint fix completed!');
        console.log('\n📋 Summary:');
        console.log('• Fixed dueling_matches table constraint to accept "ranked_bo5"');
        console.log('• Fixed dueling_player_stats table constraint to accept "ranked_bo5"');
        console.log('• Updated any existing "ranked_bo6" records to "ranked_bo5"');
        console.log('\n✅ Bo5 matches should now record properly in the database');
        
    } catch (error) {
        console.error('❌ Error running Bo5 database fix:', error);
        process.exit(1);
    }
}

// Alternative approach - execute statements manually
async function runBo5DatabaseFixManual() {
    try {
        console.log('🔧 Running Bo5 database constraint fix (manual approach)...');
        
        // Drop existing constraints
        console.log('\n1️⃣ Dropping existing constraints...');
        
        // We'll need to execute these through the SQL editor or direct database access
        // since constraint modifications require elevated privileges
        
        const fixStatements = [
            {
                name: 'Drop dueling_matches constraint',
                sql: 'ALTER TABLE dueling_matches DROP CONSTRAINT IF EXISTS dueling_matches_match_type_check;'
            },
            {
                name: 'Add corrected dueling_matches constraint',
                sql: "ALTER TABLE dueling_matches ADD CONSTRAINT dueling_matches_match_type_check CHECK (match_type IN ('unranked', 'ranked_bo3', 'ranked_bo5'));"
            },
            {
                name: 'Drop dueling_player_stats constraint',
                sql: 'ALTER TABLE dueling_player_stats DROP CONSTRAINT IF EXISTS dueling_player_stats_match_type_check;'
            },
            {
                name: 'Add corrected dueling_player_stats constraint',
                sql: "ALTER TABLE dueling_player_stats ADD CONSTRAINT dueling_player_stats_match_type_check CHECK (match_type IN ('unranked', 'ranked_bo3', 'ranked_bo5', 'overall'));"
            },
            {
                name: 'Update existing bo6 records in dueling_matches',
                sql: "UPDATE dueling_matches SET match_type = 'ranked_bo5' WHERE match_type = 'ranked_bo6';"
            },
            {
                name: 'Update existing bo6 records in dueling_player_stats',
                sql: "UPDATE dueling_player_stats SET match_type = 'ranked_bo5' WHERE match_type = 'ranked_bo6';"
            }
        ];
        
        console.log('\n📋 SQL statements to execute:');
        console.log('='.repeat(80));
        
        fixStatements.forEach((stmt, i) => {
            console.log(`\n-- ${i + 1}. ${stmt.name}`);
            console.log(stmt.sql);
        });
        
        console.log('\n='.repeat(80));
        console.log('\n⚠️  Please execute these SQL statements in your Supabase SQL editor:');
        console.log('1. Go to https://supabase.com/dashboard/project/[your-project]/sql');
        console.log('2. Copy and paste the SQL statements above');
        console.log('3. Click "Run" to execute them');
        console.log('\nAfter running these statements, Bo5 matches should record properly.');
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Run the manual approach since constraint modifications need elevated privileges
runBo5DatabaseFixManual(); 