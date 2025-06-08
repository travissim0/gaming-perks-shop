# Ko-fi Shop Integration Workflow

This document explains the enhanced Ko-fi integration using Ko-fi's actual shop functionality instead of donations.

## 🛒 **New Shop-Based Workflow**

### **Old Way (Donation-Based)**
1. User clicks "Purchase" → Redirected to Ko-fi donation page
2. User donates money with product info in message
3. User returns and clicks "Check for Existing Donation"
4. System searches donations and manually verifies purchase
5. Admin or system creates `user_product` entry

### **New Way (Shop-Based)**
1. User clicks "Purchase" → Redirected to Ko-fi shop item page
2. User completes purchase on Ko-fi's professional checkout
3. Ko-fi automatically sends "Shop Order" webhook
4. System automatically creates `user_product` entry
5. **No manual verification needed!**

## 🔧 **Technical Implementation**

### **Database Changes**
```sql
-- Add Ko-fi direct link code field
ALTER TABLE products ADD COLUMN kofi_direct_link_code VARCHAR(50);
```

### **Ko-fi Shop Setup**
1. Go to Ko-fi Creator Dashboard
2. Create shop items for each perk
3. Each item gets a `direct_link_code` (like `40a4b65a29`)
4. Update products table with these codes

### **URL Structure**
- **Shop Item**: `https://ko-fi.com/s/{direct_link_code}`
- **With Variation**: `https://ko-fi.com/s/{direct_link_code}?variation={custom_phrase}`

### **Webhook Processing**
When Ko-fi sends a "Shop Order" webhook:

```json
{
  "type": "Shop Order",
  "shop_items": [
    {
      "direct_link_code": "40a4b65a29",
      "variation_name": "CustomPhrase",
      "quantity": 1
    }
  ]
}
```

The webhook automatically:
1. Looks up product by `direct_link_code`
2. Creates `user_product` entry
3. Uses `variation_name` as custom phrase

## 📝 **Setting Up Ko-fi Shop Items**

### **Step 1: Create Shop Items**
1. Go to [Ko-fi Creator Dashboard](https://ko-fi.com/manage/shop)
2. Click "Add Product"
3. Set up each perk as a shop item
4. Note the `direct_link_code` from the URL

### **Step 2: Update Database**
```sql
-- Example: Update existing products with Ko-fi codes
UPDATE products SET kofi_direct_link_code = '40a4b65a29' 
WHERE name = 'Text Visual Kill Macro';

UPDATE products SET kofi_direct_link_code = 'xyz123abc' 
WHERE name = 'Weapon Skin Pack';
```

### **Step 3: Configure Variations (Optional)**
For customizable products (custom phrases):
- Set up Ko-fi product variations
- Each variation becomes a `variation_name` in the webhook
- Used as the custom phrase in `user_products.phrase`

## 🚀 **Benefits**

### **User Experience**
- ✅ Professional Ko-fi checkout experience
- ✅ Multiple payment methods (PayPal, Stripe, etc.)
- ✅ Instant activation (no manual verification)
- ✅ Proper product pages with descriptions/images

### **Technical Benefits**
- ✅ Automatic processing via webhooks
- ✅ Reduced API calls and manual work
- ✅ Better inventory/product management
- ✅ Support for shipping (if needed)
- ✅ Ko-fi handles PCI compliance

### **Business Benefits**
- ✅ Higher conversion rates (better UX)
- ✅ Reduced support tickets (automatic activation)
- ✅ Professional appearance
- ✅ Ko-fi's fraud protection

## 🔄 **Migration Strategy**

### **Phase 1: Hybrid Support (Current)**
- ✅ Webhook handles both donation verification and shop orders
- ✅ Perks page uses shop URLs when available, donations as fallback
- ✅ Existing verification system still works

### **Phase 2: Create Shop Items**
- Create Ko-fi shop items for each product
- Update database with `direct_link_code` values
- Test shop purchases

### **Phase 3: Full Migration**
- All products have Ko-fi shop items
- Remove donation-based verification system
- Streamline perks page UI

## 🛠️ **Testing**

### **Test Shop Order Webhook**
```bash
# Use the existing test script with shop order data
node test-kofi-webhook.js
```

### **Test URL Structure**
- Direct: `https://ko-fi.com/s/40a4b65a29`
- With phrase: `https://ko-fi.com/s/40a4b65a29?variation=MyPhrase`

## 🔍 **Troubleshooting**

### **Product Not Found in Webhook**
- Check `kofi_direct_link_code` in products table
- Verify Ko-fi shop item is active
- Check webhook logs for correct `direct_link_code`

### **Custom Phrases Not Working**
- Ensure Ko-fi product has variations set up
- Check `variation_name` in webhook data
- Verify phrase is saved to `user_products.phrase`

### **User Not Found**
- User must be signed in with same email as Ko-fi account
- Check `profiles` table for matching email
- Anonymous purchases won't auto-activate

## 📊 **Monitoring**

### **Check Integration Status**
```sql
-- See which products have Ko-fi shop integration
SELECT 
  name,
  price / 100.0 as price_dollars,
  kofi_direct_link_code,
  CASE 
    WHEN kofi_direct_link_code IS NULL THEN '❌ Donation only'
    ELSE '✅ Shop integration'
  END as status
FROM products 
WHERE active = true;
```

### **Recent Shop Orders**
```sql
-- Check recent Ko-fi shop orders
SELECT 
  customer_name,
  amount_cents / 100.0 as amount,
  kofi_shop_items,
  created_at
FROM donation_transactions 
WHERE payment_method = 'kofi' 
  AND kofi_shop_items IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## 🎯 **Next Steps**

1. **Run Database Migration**: Execute `setup-kofi-shop.sql`
2. **Create Ko-fi Shop Items**: Set up products in Ko-fi dashboard
3. **Update Product Records**: Add `direct_link_code` to database
4. **Test Integration**: Purchase test item and verify webhook
5. **Monitor Performance**: Check webhook logs and user feedback 