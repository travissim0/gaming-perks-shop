require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('🔧 Applying financial function fix...');
  
  try {
    // Read the SQL file
    const sqlContent = fs.readFileSync('fix-financial-function.sql', 'utf8');
    
    // Execute the SQL to recreate the function
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: sqlContent 
    });
    
    if (error) {
      console.error('❌ Error applying fix:', error);
      
      // Try alternative approach - execute parts manually
      console.log('🔄 Trying manual function recreation...');
      
      // Drop function first
      const { error: dropError } = await supabase.rpc('exec_sql', {
        sql: 'DROP FUNCTION IF EXISTS get_financial_overview(DATE, DATE);'
      });
      
      if (dropError) {
        console.error('Error dropping function:', dropError);
      }
      
      // Test a simple query to verify our understanding
      console.log('🧪 Testing simple query...');
      const { data: testData, error: testError } = await supabase
        .from('user_products')
        .select(`
          id,
          product_id,
          created_at,
          products!inner(id, name, price)
        `)
        .limit(3);
      
      if (testError) {
        console.error('Test query error:', testError);
      } else {
        console.log('Test data:', testData);
        
        // Calculate manual total
        const total = testData?.reduce((sum, item) => {
          return sum + (item.products.price / 100);
        }, 0) || 0;
        
        console.log('Manual total for test data:', total);
      }
      
    } else {
      console.log('✅ Function updated successfully');
      
      // Test the updated function
      console.log('🧪 Testing updated function...');
      const { data: testResult, error: testError } = await supabase.rpc(
        'get_financial_overview',
        {
          start_date: '2025-01-01',
          end_date: '2025-12-31'
        }
      );
      
      if (testError) {
        console.error('Test error:', testError);
      } else {
        console.log('Test result:', testResult);
      }
    }
    
  } catch (err) {
    console.error('❌ Script error:', err);
  }
}

applyFix();
