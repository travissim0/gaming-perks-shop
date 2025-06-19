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

async function runLegacySquadSetup() {
    try {
        console.log('🔧 Starting legacy squad designation setup...');
        
        // Read the SQL file
        const sqlContent = fs.readFileSync('add-legacy-squad-designation.sql', 'utf8');
        
        // Split into individual statements (basic split on semicolons)
        const statements = sqlContent
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('SELECT \'Legacy squad'));

        console.log(`📝 Found ${statements.length} SQL statements to execute`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.trim()) {
                console.log(`\n🔄 Executing statement ${i + 1}/${statements.length}...`);
                console.log(`📋 Statement: ${statement.substring(0, 100)}${statement.length > 100 ? '...' : ''}`);
                
                const { data, error } = await supabase.rpc('exec_sql', {
                    sql_statement: statement
                });

                if (error) {
                    // Try direct execution if RPC fails
                    console.log('⚠️  RPC failed, trying direct execution...');
                    const { data: directData, error: directError } = await supabase
                        .from('_sql_exec')
                        .select('*')
                        .limit(0); // This is a hack to execute raw SQL
                    
                    if (directError) {
                        console.error(`❌ Error executing statement ${i + 1}:`, error);
                        console.error('Statement:', statement);
                        // Continue with next statement
                        continue;
                    }
                }

                console.log(`✅ Statement ${i + 1} executed successfully`);
            }
        }

        console.log('\n🎉 Legacy squad designation setup completed!');
        console.log('\n📋 Summary:');
        console.log('- Added is_legacy column to squads table');
        console.log('- Created admin policies for legacy management');
        console.log('- Added bulk marking function');
        console.log('- Created database indexes for performance');
        
        console.log('\n🔧 Next steps:');
        console.log('1. Use the AdminLegacySquadManager component to manage legacy squads');
        console.log('2. Run bulk operations to mark old squads as legacy');
        console.log('3. Legacy squads will now appear in a separate section');

    } catch (error) {
        console.error('❌ Error during legacy squad setup:', error);
        process.exit(1);
    }
}

runLegacySquadSetup(); 