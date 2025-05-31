const { createClient } = require('@supabase/supabase-js');

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

const ctfRoles = [
    {
        name: 'admin',
        display_name: 'Site Administrator',
        description: 'Full system access including payments and donations',
        hierarchy_level: 100,
        permissions: {
            "manage_all_users": true,
            "manage_payments": true,
            "manage_donations": true,
            "manage_orders": true,
            "manage_ctf_roles": true,
            "manage_matches": true,
            "manage_squads": true,
            "view_admin_panel": true
        }
    },
    {
        name: 'ctf_admin',
        display_name: 'CTF Administrator',
        description: 'Manages all CTF operations and roles (no payment access)',
        hierarchy_level: 90,
        permissions: {
            "manage_ctf_roles": true,
            "assign_ctf_admin": true,
            "manage_matches": true,
            "manage_squads": true,
            "manage_referees": true,
            "manage_referee_applications": true,
            "view_ctf_admin_panel": true
        }
    },
    {
        name: 'ctf_head_referee',
        display_name: 'CTF Head Referee',
        description: 'Manages all referees and their applications',
        hierarchy_level: 80,
        permissions: {
            "manage_referees": true,
            "manage_referee_applications": true,
            "approve_referee_promotions": true,
            "manage_match_results": true,
            "view_referee_panel": true
        }
    },
    {
        name: 'ctf_referee',
        display_name: 'CTF Referee',
        description: 'Confirms and edits match results and statistics',
        hierarchy_level: 70,
        permissions: {
            "manage_match_results": true,
            "edit_match_stats": true,
            "view_match_details": true,
            "referee_matches": true
        }
    },
    {
        name: 'ctf_recorder',
        display_name: 'CTF Recorder',
        description: 'Manages video recordings for tournament matches',
        hierarchy_level: 60,
        permissions: {
            "add_match_videos": true,
            "edit_match_videos": true,
            "manage_tournament_recordings": true
        }
    },
    {
        name: 'ctf_commentator',
        display_name: 'CTF Commentator',
        description: 'Can sign up to commentate matches',
        hierarchy_level: 50,
        permissions: {
            "signup_for_commentary": true,
            "view_match_schedule": true
        }
    }
];

async function deployCTFRoles() {
    try {
        console.log('🎮 Deploying CTF Roles System (Simple Mode)...');
        
        // Step 1: Check if ctf_roles table exists
        console.log('🔍 Checking existing tables...');
        const { data: existingRoles, error: checkError } = await supabase
            .from('ctf_roles')
            .select('name')
            .limit(1);
        
        if (checkError && checkError.code === 'PGRST116') {
            console.log('⚠️  CTF roles tables do not exist yet');
            console.log('📋 Please run the SQL schema manually first');
            console.log('');
            console.log('You can:');
            console.log('1. Go to your Supabase dashboard > SQL Editor');
            console.log('2. Copy and paste the contents of add-ctf-roles-system-fixed.sql');
            console.log('3. Run the SQL to create the tables');
            console.log('4. Then run this script again to populate data');
            return;
        }
        
        if (checkError) {
            throw checkError;
        }
        
        // Step 2: Clear existing roles
        console.log('🧹 Clearing existing CTF roles...');
        const { error: deleteError } = await supabase
            .from('ctf_roles')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        
        if (deleteError) {
            console.log('ℹ️  Note: Could not clear existing roles (this is normal for first install)');
        }
        
        // Step 3: Insert CTF roles
        console.log('📝 Inserting CTF roles...');
        const { error: insertError } = await supabase
            .from('ctf_roles')
            .insert(ctfRoles);
        
        if (insertError) {
            throw insertError;
        }
        
        // Step 4: Verify installation
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
        
        if (error.code === 'PGRST116') {
            console.log('');
            console.log('🔧 Table does not exist. Please:');
            console.log('1. Go to Supabase Dashboard > SQL Editor');
            console.log('2. Run the add-ctf-roles-system-fixed.sql file');
            console.log('3. Then run this script again');
        }
        
        process.exit(1);
    }
}

// Run deployment
deployCTFRoles(); 