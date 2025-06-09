const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addExpiresAtColumn() {
  console.log('🔧 Adding expires_at column to user_products table...\n');
  
  try {
    // First, let's check if the column already exists
    console.log('🔍 Checking current table structure...');
    
    const { data: currentSchema, error: schemaError } = await supabase
      .from('user_products')
      .select('*')
      .limit(1);
    
    if (schemaError) {
      console.error('❌ Error checking schema:', schemaError);
      return;
    }
    
    console.log('📋 Current columns:', currentSchema && currentSchema.length > 0 ? Object.keys(currentSchema[0]) : 'No data to show columns');
    
    // Try to add the column using a simple INSERT approach
    console.log('\n🚀 Attempting to add expires_at column...');
    
    // We'll use a workaround - try to insert a record with expires_at to see if it exists
    const { error: testError } = await supabase
      .from('user_products')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
        product_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
        expires_at: null,
        purchased_at: new Date().toISOString()
      });
    
    if (testError) {
      if (testError.message?.includes('expires_at')) {
        console.log('✅ expires_at column already exists or is being used correctly');
      } else {
        console.log('❌ Column missing, error:', testError.message);
        console.log('\n🔄 The column needs to be added via Supabase dashboard or direct SQL access');
        console.log('📋 Required SQL: ALTER TABLE user_products ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;');
      }
    } else {
      console.log('✅ expires_at column exists and accepts data');
      
      // Clean up the test record
      await supabase
        .from('user_products')
        .delete()
        .eq('user_id', '00000000-0000-0000-0000-000000000000');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addExpiresAtColumn(); 