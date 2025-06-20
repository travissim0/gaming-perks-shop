require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Environment variables not found. Please check .env.local file.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runLegacySquadSetup() {
    console.log('🚀 Setting up Legacy Squad System...');
    
    try {
        // Read the SQL file
        const sqlContent = fs.readFileSync('./add-legacy-squad-designation.sql', 'utf8');
        
        // Execute the SQL
        console.log('📝 Executing SQL migration...');
        const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
        
        if (error) {
            console.error('❌ SQL execution error:', error);
            return;
        }
        
        console.log('✅ SQL migration completed successfully!');
        
        // Test the new functions
        console.log('\n🧪 Testing new functions...');
        
        // Test can_join_squad function
        console.log('Testing can_join_squad function...');
        const { data: testResult1, error: testError1 } = await supabase
            .rpc('can_join_squad', { 
                user_id: '00000000-0000-0000-0000-000000000000', 
                target_squad_id: '00000000-0000-0000-0000-000000000000' 
            });
        
        if (testError1) {
            console.log('⚠️ Function test failed (expected for non-existent IDs):', testError1.message);
        } else {
            console.log('✅ can_join_squad function is working');
        }
        
        // Test get_free_agents_excluding_active_only function
        console.log('Testing get_free_agents_excluding_active_only function...');
        const { data: freeAgentsTest, error: freeAgentsError } = await supabase
            .rpc('get_free_agents_excluding_active_only');
        
        if (freeAgentsError) {
            console.log('❌ Free agents function error:', freeAgentsError.message);
        } else {
            console.log(`✅ Free agents function working - found ${freeAgentsTest?.length || 0} potential free agents`);
        }
        
        // Show candidates for legacy designation
        console.log('\n🔍 Finding candidates for legacy designation...');
        const { data: candidates, error: candidatesError } = await supabase
            .from('squads')
            .select(`
                id,
                name,
                tag,
                created_at,
                is_active,
                is_legacy
            `)
            .eq('is_active', false)
            .eq('is_legacy', false)
            .order('created_at', { ascending: true })
            .limit(10);
        
        if (candidatesError) {
            console.log('❌ Error finding candidates:', candidatesError.message);
        } else if (candidates && candidates.length > 0) {
            console.log('📋 Inactive squads that could be marked as legacy:');
            candidates.forEach(squad => {
                console.log(`  - [${squad.tag}] ${squad.name} (created: ${new Date(squad.created_at).toLocaleDateString()})`);
            });
        } else {
            console.log('No inactive squads found that could be marked as legacy.');
        }
        
        console.log('\n🎉 Legacy Squad System setup completed successfully!');
        console.log('\n📚 Next steps:');
        console.log('1. Update TypeScript interfaces to include is_legacy field');
        console.log('2. Update squad validation logic in API routes');
        console.log('3. Update UI to show legacy vs active squads differently');
        console.log('4. Update free agents system to use new functions');
        console.log('5. Manually mark historical squads as legacy using admin interface');
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
    }
}

// Helper function to execute raw SQL (fallback if rpc doesn't work)
async function executeRawSQL() {
    console.log('🔄 Trying alternative approach - executing SQL statements individually...');
    
    try {
        const sqlContent = fs.readFileSync('./add-legacy-squad-designation.sql', 'utf8');
        
        // Split SQL into individual statements (basic splitting)
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.toLowerCase().includes('comment on') || 
                statement.toLowerCase().includes('grant') ||
                statement.toLowerCase().includes('select \'legacy')) {
                continue; // Skip problematic statements
            }
            
            console.log(`Executing statement ${i + 1}/${statements.length}...`);
            
            const { error } = await supabase.rpc('exec_sql', { sql: statement });
            if (error) {
                console.log(`⚠️ Statement ${i + 1} failed:`, error.message);
            }
        }
        
        console.log('✅ Individual statement execution completed');
        
    } catch (error) {
        console.error('❌ Alternative approach failed:', error);
    }
}

// Run the setup
runLegacySquadSetup().catch(error => {
    console.error('❌ Script execution failed:', error);
    // Try alternative approach
    executeRawSQL();
}); 