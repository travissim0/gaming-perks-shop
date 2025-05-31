const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deployCTFRoles() {
    try {
        console.log('🎮 Deploying CTF Roles System...');
        console.log('📁 Reading SQL file...');
        
        const sqlFile = path.join(__dirname, 'add-ctf-roles-system-fixed.sql');
        const sqlContent = fs.readFileSync(sqlFile, 'utf8');
        
        console.log('🔗 Connecting to database...');
        
        // Execute the SQL using Supabase's rpc function for raw SQL
        const { data, error } = await supabase.rpc('exec_sql', { 
            sql_query: sqlContent 
        });
        
        if (error) {
            // If exec_sql doesn't exist, try direct SQL execution
            console.log('📋 Attempting direct SQL execution...');
            
            // Split the SQL into individual statements
            const statements = sqlContent
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt && !stmt.startsWith('--'));
            
            console.log(`📝 Executing ${statements.length} SQL statements...`);
            
            for (let i = 0; i < statements.length; i++) {
                const statement = statements[i];
                if (!statement) continue;
                
                console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
                
                try {
                    const { error: stmtError } = await supabase.rpc('exec', { 
                        sql: statement 
                    });
                    
                    if (stmtError) {
                        console.error(`❌ Error in statement ${i + 1}:`, stmtError);
                        throw stmtError;
                    }
                } catch (stmtErr) {
                    console.error(`❌ Failed to execute statement ${i + 1}:`, statement.substring(0, 100) + '...');
                    throw stmtErr;
                }
            }
            
            console.log('✅ All statements executed successfully');
        } else {
            console.log('✅ SQL executed successfully');
        }
        
        // Verify installation
        console.log('🔍 Verifying installation...');
        
        const { data: roles, error: rolesError } = await supabase
            .from('ctf_roles')
            .select('name, display_name, hierarchy_level')
            .order('hierarchy_level', { ascending: false });
        
        if (rolesError) {
            throw rolesError;
        }
        
        console.log('✅ CTF Roles System deployed successfully!');
        console.log('📊 Installed roles:');
        roles.forEach(role => {
            console.log(`  • ${role.display_name} (Level ${role.hierarchy_level})`);
        });
        
        console.log('');
        console.log('🎯 Next steps:');
        console.log('1. Refresh your web application');
        console.log('2. Go to /admin/users to assign CTF roles');
        console.log('3. The console errors should now be resolved');
        
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        
        if (error.details) {
            console.error('📋 Details:', error.details);
        }
        
        if (error.hint) {
            console.error('💡 Hint:', error.hint);
        }
        
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('• Check that your SUPABASE_SERVICE_ROLE_KEY has admin permissions');
        console.log('• Verify the .env.local file contains correct credentials');
        console.log('• Check the database connection');
        
        process.exit(1);
    }
}

// Run deployment
deployCTFRoles(); 