#!/usr/bin/env node

// Debug database connection issues
require('dotenv').config({ path: './production.env' });

const { createClient } = require('@supabase/supabase-js');

async function debugDatabaseConnection() {
  console.log('🔍 Debugging database connection issues...\n');

  try {
    // 1. Check environment variables
    console.log('1. Environment Variables Check:');
    console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'}`);
    console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'}`);
    
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing required environment variables');
      return;
    }

    // 2. Create Supabase clients with different configurations
    console.log('\n2. Creating Supabase clients...');
    
    // Service role client (should bypass RLS)
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Anon client (subject to RLS)
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || 'missing'
    );

    console.log('✅ Supabase clients created');

    // 3. Test basic connectivity
    console.log('\n3. Testing basic connectivity...');
    
    try {
      const { data: healthCheck, error: healthError } = await supabaseService
        .from('donation_transactions')
        .select('count(*)', { count: 'exact', head: true });
      
      if (healthError) {
        console.error('❌ Service client connectivity failed:', healthError);
      } else {
        console.log('✅ Service client connectivity successful');
        console.log(`   Table exists and contains ${healthCheck?.length || 0} records`);
      }
    } catch (error) {
      console.error('❌ Service client connection error:', error.message);
    }

    // 4. Test different query patterns
    console.log('\n4. Testing different query patterns...');

    // Simple ID query
    try {
      const { data: idTest, error: idError } = await supabaseService
        .from('donation_transactions')
        .select('id')
        .limit(1);
      
      if (idError) {
        console.error('❌ Simple ID query failed:', idError);
      } else {
        console.log('✅ Simple ID query successful');
      }
    } catch (error) {
      console.error('❌ Simple ID query error:', error.message);
    }

    // Basic fields query
    try {
      const { data: basicTest, error: basicError } = await supabaseService
        .from('donation_transactions')
        .select('id, amount_cents, customer_name, created_at')
        .limit(5);
      
      if (basicError) {
        console.error('❌ Basic fields query failed:', basicError);
        console.log('   Error details:', JSON.stringify(basicError, null, 2));
      } else {
        console.log('✅ Basic fields query successful');
        console.log(`   Retrieved ${basicTest?.length || 0} records`);
        if (basicTest && basicTest.length > 0) {
          console.log('   Sample record:', JSON.stringify(basicTest[0], null, 2));
        }
      }
    } catch (error) {
      console.error('❌ Basic fields query error:', error.message);
    }

    // Status filter query (this might be what's failing)
    try {
      const { data: statusTest, error: statusError } = await supabaseService
        .from('donation_transactions')
        .select('id, amount_cents, status')
        .eq('status', 'completed')
        .limit(5);
      
      if (statusError) {
        console.error('❌ Status filter query failed:', statusError);
        console.log('   This could be the source of the 500 error');
        console.log('   Error details:', JSON.stringify(statusError, null, 2));
      } else {
        console.log('✅ Status filter query successful');
        console.log(`   Retrieved ${statusTest?.length || 0} completed records`);
      }
    } catch (error) {
      console.error('❌ Status filter query error:', error.message);
    }

    // 5. Test table structure
    console.log('\n5. Testing table structure...');
    
    try {
      // Get table info from information_schema
      const { data: tableInfo, error: tableError } = await supabaseService
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_name', 'donation_transactions')
        .eq('table_schema', 'public');
      
      if (tableError) {
        console.error('❌ Table structure query failed:', tableError);
      } else {
        console.log('✅ Table structure query successful');
        console.log('   Columns:');
        tableInfo?.forEach(col => {
          console.log(`     - ${col.column_name}: ${col.data_type}`);
        });
      }
    } catch (error) {
      console.error('❌ Table structure error:', error.message);
    }

    // 6. Test RLS policies
    console.log('\n6. Testing RLS policies...');
    
    try {
      // Try with anon client to see RLS behavior
      const { data: anonTest, error: anonError } = await supabaseAnon
        .from('donation_transactions')
        .select('id')
        .limit(1);
      
      if (anonError) {
        console.log('❌ Anon client blocked by RLS (expected):', anonError.message);
      } else {
        console.log('⚠️ Anon client succeeded - RLS might be disabled');
      }
    } catch (error) {
      console.log('❌ Anon client error (expected if RLS enabled):', error.message);
    }

    // 7. Recent donations simulation
    console.log('\n7. Simulating /api/recent-donations query...');
    
    try {
      const { data: recentDonations, error: recentError } = await supabaseService
        .from('donation_transactions')
        .select(`
          amount_cents,
          currency,
          donation_message,
          customer_name,
          kofi_from_name,
          created_at,
          payment_method,
          status
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (recentError) {
        console.error('❌ Recent donations query failed:', recentError);
        console.log('   This is likely the source of your 500 error');
        console.log('   Error details:', JSON.stringify(recentError, null, 2));
      } else {
        console.log('✅ Recent donations query successful');
        console.log(`   Retrieved ${recentDonations?.length || 0} records`);
        
        if (recentDonations && recentDonations.length > 0) {
          console.log('   Top donation:', {
            amount: recentDonations[0].amount_cents / 100,
            name: recentDonations[0].kofi_from_name || recentDonations[0].customer_name,
            date: recentDonations[0].created_at
          });
        }
      }
    } catch (error) {
      console.error('❌ Recent donations simulation error:', error.message);
    }

    console.log('\n✅ Database debugging complete!');
    console.log('\nNext steps:');
    console.log('1. If basic queries work but status filter fails, remove status filter from API');
    console.log('2. If RLS is blocking access, check policies on donation_transactions table');
    console.log('3. If table structure is wrong, check migrations and schema');

  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
}

// Run the debugging
debugDatabaseConnection().then(() => {
  console.log('\n🎯 Check the output above to identify the database issue');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 