const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './production.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixKofiCodes() {
  console.log('🔧 Fixing Ko-fi direct link codes...\n');
  
  // Update Floating Text on Kill with correct code
  const { data: floatingUpdate, error: floatingError } = await supabase
    .from('products')
    .update({ kofi_direct_link_code: 'c910b74348' })
    .eq('id', 'c25d69b0-d179-427b-b771-1e99cf26f6d6')
    .select();
  
  if (floatingError) {
    console.error('❌ Error updating Floating Text on Kill:', floatingError);
  } else {
    console.log('✅ Updated Floating Text on Kill code to: c910b74348');
  }
  
  // Verify Rainbow Caw has correct code (should already be correct)
  const { data: rainbowUpdate, error: rainbowError } = await supabase
    .from('products')
    .update({ kofi_direct_link_code: '40a4b65a29' })
    .eq('id', 'f3a3bb5e-61cf-4efb-9662-2c35cd785965')
    .select();
    
  if (rainbowError) {
    console.error('❌ Error updating Rainbow Caw:', rainbowError);
  } else {
    console.log('✅ Confirmed Rainbow Caw code: 40a4b65a29');
  }
  
  // Verify the changes
  console.log('\n🔍 Verifying updated codes...');
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('id, name, kofi_direct_link_code')
    .in('id', ['c25d69b0-d179-427b-b771-1e99cf26f6d6', 'f3a3bb5e-61cf-4efb-9662-2c35cd785965']);
    
  if (fetchError) {
    console.error('❌ Error fetching products:', fetchError);
  } else {
    products.forEach(product => {
      console.log(`${product.name}: ${product.kofi_direct_link_code}`);
    });
  }
  
  console.log('\n✅ Ko-fi codes updated successfully!');
  console.log('🧪 Now you can test the webhook with the real purchase data.');
}

fixKofiCodes().catch(console.error); 