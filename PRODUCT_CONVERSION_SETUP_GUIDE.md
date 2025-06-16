# Product Conversion Setup Guide

This guide covers everything needed to add new premium product conversions (like Rainbow CAW) to your CTF game server.

## Overview

The product conversion system allows players who purchase premium items from freeinf.org to automatically receive upgraded versions of regular items when using buy commands (`?b`, `?build`, etc.).

## Step-by-Step Setup for New Products

### 1. Database Setup

#### A. Add Product to Supabase
1. Go to your Supabase dashboard → `products` table
2. Add a new product record:
   ```sql
   INSERT INTO products (id, name, description, price, active)
   VALUES (
     'your-unique-product-id',  -- Generate a UUID
     'Premium Item Name',       -- Display name
     'Description of the item', -- Product description
     9.99,                     -- Price in USD
     true                      -- Active status
   );
   ```

#### B. Update SQL Function (if needed)
If your new product doesn't follow the standard naming pattern, update the `get_player_product_purchases()` function in `setup-product-purchases-clean.sql`:

```sql
-- Add your product mapping in the CASE statement
WHEN p.id = 'your-unique-product-id' THEN 'your_product_key'
```

### 2. Code Implementation

#### A. Update ProductPurchaseManager.cs

1. **Add Product Conversion Mapping**
   
   In the `PRODUCT_CONVERSIONS` dictionary (around line 403), add your new product:
   ```csharp
   "your_product_key", new Dictionary<string, string>
   {
       { "Original Item Name", "Premium Item Name" },
       { "original item name", "Premium Item Name" },  // lowercase variant
       { "short_name", "Premium Item Name" }           // any aliases
   }
   ```

2. **Example for a Premium Rifle**:
   ```csharp
   "premium_rifle", new Dictionary<string, string>
   {
       { "Maklov AR mk 606", "Premium AR mk 606" },
       { "maklov ar mk 606", "Premium AR mk 606" },
       { "ar", "Premium AR mk 606" }
   }
   ```

#### B. Update Short Commands (if applicable)

If your premium item should have its own short command, add it to the `shortCommands` dictionary in `CommandHandler` class (around line 6394):

```csharp
{ "Premium AR mk 606", "par" },  // New short command for premium item
```

### 3. Item Editor Setup

#### A. Create the Premium Item
1. Open your Infantry item editor
2. Create the new premium item with enhanced stats
3. Note the exact item name (case-sensitive)
4. Ensure the item ID doesn't conflict with existing items

#### B. Multi-Item Updates (if applicable)
If the original item is part of a Multi-Item (like "caw"):
1. The conversion will happen automatically after Multi-Item expansion
2. No additional Multi-Item changes needed
3. The `ConvertProductPurchaseItems` method handles post-expansion conversion

### 4. Testing Checklist

#### A. Database Testing
```sql
-- Test the SQL function returns your product
SELECT * FROM get_player_product_purchases() 
WHERE product_name = 'your_product_key';
```

#### B. In-Game Testing
Test all these scenarios:
- [ ] `?b "Original Item Name"` → converts to premium
- [ ] `?b short_name` → converts to premium (if applicable)
- [ ] Multi-Item containing original item → converts after expansion
- [ ] Named builds containing original item → converts in build
- [ ] Player without purchase → gets original item
- [ ] Player with purchase → gets premium item + conversion message

### 5. Common Patterns

#### A. Weapon Conversions
```csharp
"premium_weapon_key", new Dictionary<string, string>
{
    { "Standard Weapon Name", "Premium Weapon Name" },
    { "standard weapon name", "Premium Weapon Name" },
    { "weapon_short", "Premium Weapon Name" }
}
```

#### B. Armor Conversions
```csharp
"premium_armor_key", new Dictionary<string, string>
{
    { "Standard Armor", "Premium Armor" },
    { "standard armor", "Premium Armor" },
    { "armor_short", "Premium Armor" }
}
```

#### C. Utility Item Conversions
```csharp
"premium_utility_key", new Dictionary<string, string>
{
    { "Standard Utility", "Premium Utility" },
    { "standard utility", "Premium Utility" },
    { "util_short", "Premium Utility" }
}
```

### 6. Best Practices

#### A. Naming Conventions
- **Product Keys**: Use lowercase with underscores (`premium_rifle`, `rainbow_caw`)
- **Item Names**: Match exactly what's in the item editor (case-sensitive)
- **Short Commands**: Keep them intuitive and short (`par` for Premium AR)

#### B. Database IDs
- Use UUIDs for product IDs
- Keep product names user-friendly
- Use descriptive product descriptions

#### C. Item Stats
- Make premium items noticeably better but not game-breaking
- Consider visual differences (colors, effects)
- Maintain game balance

### 7. Troubleshooting

#### A. Conversion Not Working
1. Check product ID matches between database and code
2. Verify exact item name spelling (case-sensitive)
3. Test SQL function returns correct product_name
4. Check player actually purchased the product

#### B. Short Commands Not Working
1. Verify short command is in `shortCommands` dictionary
2. Check the short-to-full name conversion logic
3. Ensure item exists in item editor

#### C. Multi-Items Not Converting
1. Conversion happens after Multi-Item expansion
2. Check `ConvertProductPurchaseItems` is being called
3. Verify original item name in Multi-Item matches conversion mapping

### 8. Example: Adding "Premium Shotgun"

#### Database:
```sql
INSERT INTO products (id, name, description, price, active)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Premium Shotgun',
  'Enhanced shotgun with increased damage and range',
  12.99,
  true
);
```

#### Code (PRODUCT_CONVERSIONS):
```csharp
"premium_shotgun", new Dictionary<string, string>
{
    { "SiG Arms m2 AS", "Premium SiG Arms m2 AS" },
    { "sig arms m2 as", "Premium SiG Arms m2 AS" },
    { "sg", "Premium SiG Arms m2 AS" }
}
```

#### Short Commands (optional):
```csharp
{ "Premium SiG Arms m2 AS", "psg" },
```

#### SQL Function Update:
```sql
WHEN p.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' THEN 'premium_shotgun'
```

## Summary

For each new premium product:
1. Add to Supabase `products` table
2. Update `PRODUCT_CONVERSIONS` in code
3. Create premium item in item editor
4. Add short command (if desired)
5. Update SQL function (if needed)
6. Test all conversion scenarios

The system will automatically handle conversions for direct purchases, Multi-Items, builds, and short commands once properly configured. 