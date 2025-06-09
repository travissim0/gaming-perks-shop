const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProducts() {
  console.log('🔍 Checking current products in database...\n');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, kofi_direct_link_code, active, customizable')
    .eq('active', true)
    .order('name');
  
  if (error) {
    console.error('❌ Error fetching products:', error);
    return;
  }
  
  if (!products || products.length === 0) {
    console.log('⚠️ No active products found in database');
    return;
  }
  
  console.log('📦 Active Products:');
  console.log('=' .repeat(80));
  
  products.forEach((product, index) => {
    const price = (product.price / 100).toFixed(2);
    const kofiStatus = product.kofi_direct_link_code ? '✅ HAS CODE' : '❌ NEEDS CODE';
    const customizable = product.customizable ? '🎮 CUSTOMIZABLE' : '';
    
    console.log(`${index + 1}. ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Price: $${price}`);
    console.log(`   Ko-fi Code: ${product.kofi_direct_link_code || 'NOT SET'}`);
    console.log(`   Status: ${kofiStatus} ${customizable}`);
    console.log('');
  });
  
  const needsCodes = products.filter(p => !p.kofi_direct_link_code);
  
  if (needsCodes.length > 0) {
    console.log('⚠️  Products that need Ko-fi shop items created:');
    needsCodes.forEach(p => {
      console.log(`   - ${p.name} ($${(p.price / 100).toFixed(2)})`);
    });
    console.log('');
  }
  
  console.log('📋 Next Steps:');
  console.log('1. Create Ko-fi shop items for products that need codes');
  console.log('2. Get the direct link codes from Ko-fi');
  console.log('3. Update the database with the codes');
  console.log('4. Test the webhook integration');
}

checkProducts().catch(console.error); 