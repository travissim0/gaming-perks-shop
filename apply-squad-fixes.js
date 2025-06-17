require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables. Trying production.env...');
  
  // Try loading from production.env
  const prodEnv = fs.readFileSync('production.env', 'utf8');
  const lines = prodEnv.split('\n');
  lines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key] = value;
    }
  });
}

console.log('🔧 Environment check:');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set');
console.log('SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applySquadFixes() {
  console.log('🔧 Applying squad fixes...\n');
  
  try {
    // Read the SQL file
    const sqlContent = fs.readFileSync('fix-squad-multiple-issues.sql', 'utf8');
    
    // Split by statement separators and execute each part
    const statements = sqlContent.split(/;\s*(?=\n|$)/).filter(stmt => stmt.trim());
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement || statement === 'COMMIT') continue;
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('execute_sql', { 
        sql: statement 
      });
      
      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error);
        if (error.message.includes('already exists')) {
          console.log('  ℹ️ Item already exists, skipping...');
          continue;
        }
        throw error;
      }
      
      console.log(`✅ Statement ${i + 1} executed successfully`);
    }

    console.log('\n✅ All squad fixes applied successfully!');
    
    // Test the fixes
    console.log('\n🧪 Testing fixes...');
    
    // Check if unique constraint exists
    const { data: constraints } = await supabase
      .rpc('execute_sql', { 
        sql: `
          SELECT constraint_name, constraint_type 
          FROM information_schema.table_constraints 
          WHERE table_name = 'squad_invites' 
            AND constraint_name = 'unique_pending_self_request'
        `
      });
    
    if (constraints && constraints.length > 0) {
      console.log('✅ Unique constraint created successfully');
    } else {
      console.log('⚠️ Unique constraint not found');
    }

  } catch (error) {
    console.error('❌ Failed to apply fixes:', error);
    process.exit(1);
  }
}

applySquadFixes().then(() => {
  console.log('\n🎉 Squad fixes completed!');
}).catch(error => {
  console.error('❌ Failed to run fixes:', error);
  process.exit(1);
}); 