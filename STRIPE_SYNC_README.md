# Stripe Product Sync System

This system automatically syncs products from your Stripe dashboard to your Supabase database, eliminating the need to manually add products in both places.

## How It Works

1. **Create products in Stripe Dashboard** - Add products and prices as usual
2. **Sync to Database** - Use the sync button or API to pull products into Supabase
3. **Products appear on your site** - They're automatically available on the perks page

## Features

✅ **Automatic Product Creation** - New Stripe products are automatically added to your database
✅ **Smart Updates** - Existing products are updated if prices or details change
✅ **Admin Interface** - Easy sync button in the admin panel
✅ **API Endpoint** - Can be triggered programmatically
✅ **Detailed Logging** - See exactly what was created, updated, or failed
✅ **Error Handling** - Graceful handling of missing prices or invalid products

## Usage

### Via Admin Interface

1. Go to `/admin/perks`
2. Click the "🔄 Sync from Stripe" button
3. Wait for the sync to complete
4. Check the toast notification for results

### Via API

```bash
# Check sync status
curl http://localhost:3000/api/sync-stripe-products

# Trigger sync (requires admin authentication)
curl -X POST http://localhost:3000/api/sync-stripe-products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Via Script

```bash
# Make sure your dev server is running first
npm run dev

# Then run the sync script
node sync-stripe-products.js
```

## API Reference

### GET `/api/sync-stripe-products`

Returns current sync status:

```json
{
  "database_products": 3,
  "stripe_products": 5,
  "sync_needed": true
}
```

### POST `/api/sync-stripe-products`

Performs the sync operation:

```json
{
  "success": true,
  "message": "Stripe products synced successfully",
  "results": {
    "created": 2,
    "updated": 1,
    "errors": 0,
    "products": [
      {
        "action": "created",
        "name": "Kill Text Macro",
        "price_id": "price_1234567890"
      }
    ]
  }
}
```

## What Gets Synced

From Stripe products, the system syncs:

- **Name** - Product name
- **Description** - Product description  
- **Price** - From the default price or first active price
- **Price ID** - Stripe price ID for checkout
- **Image** - First product image (if any)
- **Active Status** - Whether the product is active

## Requirements

### Stripe Product Setup

For products to sync properly, they need:

1. **Active status** in Stripe
2. **At least one active price** attached
3. **Name and description** (description can be empty)

### Database Schema

Your `products` table must have these columns:

```sql
- id (uuid, primary key)
- name (text, not null)
- description (text)
- price (integer, not null) -- in cents
- price_id (text, not null) -- Stripe price ID
- image (text, nullable)
- active (boolean, default true)
- created_at (timestamptz)
- updated_at (timestamptz)
```

## Security

- Only admin users can trigger syncs via the web interface
- The API endpoint checks for admin permissions
- Direct script usage bypasses auth (use carefully)
- Uses Supabase service role for database operations

## Troubleshooting

### "No price found for product"

This means the Stripe product doesn't have an active price. Either:
- Add a price to the product in Stripe
- Make sure the price is marked as active

### "Authentication required"

You need to be logged in as an admin user to use the sync feature.

### "Product not syncing"

Check that:
- The product is active in Stripe
- The product has a valid price
- Your Stripe API keys are correct
- Your database connection is working

## Advanced Usage

### Automated Syncing

You can set up automated syncing using:

1. **Stripe Webhooks** - Trigger sync when products change
2. **Cron Jobs** - Schedule regular syncs
3. **Deploy Hooks** - Sync during deployment

### Custom Sync Logic

Modify `/src/app/api/sync-stripe-products/route.ts` to:
- Add custom validation
- Sync additional product metadata
- Handle special pricing logic
- Add custom logging

## Benefits

- ✅ **Single Source of Truth** - Stripe becomes your product catalog
- ✅ **Reduced Errors** - No manual data entry in database
- ✅ **Faster Setup** - Add products once in Stripe
- ✅ **Automatic Updates** - Price changes sync automatically
- ✅ **Scalable** - Handle hundreds of products easily

## Next Steps

After adding products to Stripe:

1. Run the sync to pull them into your database
2. Products will appear on your `/perks` page
3. Customers can purchase with custom phrases
4. Monitor sales in your admin dashboard

The custom phrase system works with any synced products - customers will be prompted to enter their phrase during checkout regardless of how the product was added to the database. 