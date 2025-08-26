require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function quickTest() {
  console.log('Quick test...');
  
  // Check product price
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .limit(1);
  
  console.log('Product:', products?.[0]);
  
  // Check user_products status values
  const { data: userProducts } = await supabase
    .from('user_products')
    .select('status')
    .limit(10);
  
  const statuses = [...new Set(userProducts?.map(up => up.status))];
  console.log('Available statuses:', statuses);
  
  // Test manual join query
  const { data: orders } = await supabase
    .from('user_products')
    .select(`
      *,
      products!inner(id, name, price)
    `)
    .limit(3);
  
  console.log('Orders with products:', orders);
  
  // Calculate total manually
  const total = orders?.reduce((sum, order) => sum + (order.products.price / 100), 0) || 0;
  console.log('Manual total orders value:', total);
}

quickTest();

