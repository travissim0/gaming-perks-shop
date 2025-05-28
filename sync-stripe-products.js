// Script to sync Stripe products to Supabase database
// Usage: node sync-stripe-products.js

const syncStripeProducts = async () => {
  console.log('🔄 Starting Stripe product sync...');
  
  try {
    const response = await fetch('http://localhost:3000/api/sync-stripe-products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.error) {
      console.error('❌ Sync failed:', result.error);
      return;
    }

    console.log('🎉 Sync completed successfully!');
    console.log('📊 Results:');
    console.log(`  - Created: ${result.results.created} products`);
    console.log(`  - Updated: ${result.results.updated} products`);
    console.log(`  - Errors: ${result.results.errors} products`);
    
    if (result.results.products.length > 0) {
      console.log('\n📝 Products processed:');
      result.results.products.forEach(product => {
        console.log(`  - ${product.action.toUpperCase()}: ${product.name} (${product.price_id})`);
      });
    }

  } catch (error) {
    console.error('❌ Error running sync:', error.message);
  }
};

// Check sync status first
const checkSyncStatus = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/sync-stripe-products');
    const result = await response.json();

    console.log('📊 Current Status:');
    console.log(`  - Products in database: ${result.database_products}`);
    console.log(`  - Products in Stripe: ${result.stripe_products}`);
    console.log(`  - Sync needed: ${result.sync_needed ? 'YES' : 'NO'}`);

    if (result.sync_needed) {
      console.log('\n🚀 Running sync...');
      await syncStripeProducts();
    } else {
      console.log('\n✅ No sync needed - products are already in sync!');
    }

  } catch (error) {
    console.error('❌ Error checking sync status:', error.message);
  }
};

// Run the script
checkSyncStatus(); 