const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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

async function deploySimpleCTFRoles() {
    try {
        console.log('🎮 Deploying Simple CTF Roles System...');
        
        // Check if ctf_role column already exists
        console.log('🔍 Checking if ctf_role column exists...');
        const { data: columns, error: columnError } = await supabase
            .rpc('check_column_exists', { 
                table_name: 'profiles', 
                column_name: 'ctf_role' 
            })
            .single();
        
        if (columnError) {
            // If the function doesn't exist, we'll try a different approach
            console.log('ℹ️  Using alternative column check method...');
            
            const { data: testData, error: testError } = await supabase
                .from('profiles')
                .select('ctf_role')
                .limit(1);
            
            if (testError && testError.code === '42703') {
                console.log('✅ Column does not exist - proceeding with deployment');
            } else if (!testError) {
                console.log('✅ CTF roles system already deployed!');
                console.log('📊 Column "ctf_role" already exists in profiles table');
                return;
            }
        }
        
        console.log('📋 Please run the following SQL in your Supabase SQL Editor:');
        console.log('');
        console.log('------- COPY AND PASTE THIS SQL -------');
        
        const sqlContent = fs.readFileSync('add-ctf-roles-simple.sql', 'utf8');
        console.log(sqlContent);
        
        console.log('------- END SQL -------');
        console.log('');
        console.log('After running the SQL:');
        console.log('1. Refresh your web application');
        console.log('2. Go to /admin/users to assign CTF roles');
        console.log('3. The console errors should be resolved');
        console.log('4. Users can now have both admin status AND a CTF role');
        
    } catch (error) {
        console.error('❌ Deployment check failed:', error.message);
        
        if (error.details) {
            console.error('📋 Details:', error.details);
        }
        
        console.log('');
        console.log('🔧 Manual Deployment Instructions:');
        console.log('1. Go to your Supabase Dashboard');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy and paste the contents of add-ctf-roles-simple.sql');
        console.log('4. Run the SQL query');
        console.log('5. Refresh your application');
        
        process.exit(1);
    }
}

// Run deployment
deploySimpleCTFRoles(); 