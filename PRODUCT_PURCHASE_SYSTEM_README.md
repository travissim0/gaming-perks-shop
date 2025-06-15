# Product Purchase System Integration

## Overview

The Product Purchase System extends your existing champion weapon system to work with web-based purchases from freeinf.org. Players can purchase premium items from your website, and when they use buy macros in-game, normal items are automatically converted to premium versions.

## Features

### 🎯 **Smart Item Conversion**
- **Rainbow CAW**: When players try to buy "Kuchler A6 CAW", it automatically converts to "Rainbow CAW" if they've purchased it
- **Extensible**: Easy to add new product conversions
- **Performance Optimized**: 10-minute caching system prevents API spam

### 🔄 **Seamless Integration**
- Works with all existing buy commands: `?build`, `?b`, `?bw`, `?bwd`
- Compatible with your existing champion weapon system
- No changes needed to existing builds or player workflows

### ⚡ **Performance Conscious**
- Caches player purchases for 10 minutes
- Async processing doesn't block game events
- Error handling ensures normal gameplay continues if API fails

## How It Works

### 1. **Player Purchases Product**
```
Player goes to freeinf.org → Purchases Rainbow CAW → Links in-game alias
```

### 2. **Player Uses Buy Command**
```
Player types: ?build caw
System checks: Does player own Rainbow CAW?
If yes: Converts "Kuchler A6 CAW" → "Rainbow CAW"
If no: Regular "Kuchler A6 CAW" is given
```

### 3. **Player Gets Premium Item**
```
Player receives: Rainbow CAW + confirmation message
Message: "&Converted to Rainbow CAW! (Premium Product)"
```

## Supported Commands

All existing buy commands now support product conversions:

```bash
?build caw                 # Basic item purchase
?b kuchler a6 caw          # Short alias
?bw mycawbuild             # Wipe inventory then buy build
?bwd premiumsetup          # Wipe, buy, max ammo
```

## Configuration

### Adding New Products

To add new premium products, edit the `PRODUCT_CONVERSIONS` dictionary in `CTF.cs`:

```csharp
private static readonly Dictionary<string, Dictionary<string, string>> PRODUCT_CONVERSIONS = new Dictionary<string, Dictionary<string, string>>
{
    {
        "rainbow_caw", new Dictionary<string, string>
        {
            { "Kuchler A6 CAW", "Rainbow CAW" },
            { "kuchler a6 caw", "Rainbow CAW" },
            { "caw", "Rainbow CAW" }
        }
    },
    {
        "premium_rifle", new Dictionary<string, string>
        {
            { "Assault Rifle", "Premium AR" },
            { "assault rifle", "Premium AR" }
        }
    }
    // Add more products here...
};
```

### Database Setup

1. **Run the SQL function** (setup-product-purchases.sql):
```sql
CREATE OR REPLACE FUNCTION get_player_product_purchases()
RETURNS TABLE (player_alias TEXT, product_name TEXT)
-- Maps Ko-fi purchases to internal product names
```

2. **Update product mappings** in the SQL function as needed:
```sql
WHEN d.product_name ILIKE '%rainbow%caw%' THEN 'rainbow_caw'
WHEN d.product_name ILIKE '%premium%rifle%' THEN 'premium_rifle'
```

## API Integration

### Endpoint Configuration
The system uses your existing Supabase configuration:
- **URL**: `https://nkinpmqnbcjaftqduujf.supabase.co`
- **Endpoint**: `/rest/v1/rpc/get_player_product_purchases`
- **Method**: POST (empty body)

### Response Format
```json
[
  {
    "player_alias": "PlayerName1",
    "product_name": "rainbow_caw"
  },
  {
    "player_alias": "PlayerName2", 
    "product_name": "premium_rifle"
  }
]
```

## Performance Optimization

### Caching Strategy
- **Cache Duration**: 10 minutes (configurable)
- **Cache Key**: Player alias (case-insensitive)
- **Auto-Refresh**: On first request after expiry
- **Manual Refresh**: `ProductPurchaseManager.ForceRefreshCache()`

### Error Handling
- API failures don't break normal gameplay
- Fallback to original items if conversion fails
- Console logging for debugging
- Non-blocking async execution

## Testing

### Manual Testing
```csharp
// Test conversion for a specific player
string converted = await ProductPurchaseManager.GetConvertedItemName("PlayerName", "Kuchler A6 CAW");

// Check all products for a player
var products = await ProductPurchaseManager.GetPlayerProducts("PlayerName");

// Force cache refresh
await ProductPurchaseManager.ForceRefreshCache();
```

### In-Game Testing
1. Add test data to your Ko-fi donations table
2. Player uses `?build caw` command
3. Check for conversion message and Rainbow CAW in inventory

## Troubleshooting

### Common Issues

**Problem**: Conversions not working
```bash
Solution: Check console logs for API errors
         Verify database function exists
         Test with ProductPurchaseManager.ForceRefreshCache()
```

**Problem**: Performance issues
```bash
Solution: Increase cache duration (currently 10 minutes)
         Check API response times
         Verify async execution is working
```

**Problem**: Players not getting premium items
```bash
Solution: Verify Ko-fi data has correct in_game_alias
         Check product name mappings in SQL function
         Confirm verification_status = 'verified'
```

### Debug Commands

Add these temporary debug commands for testing:

```csharp
// In playerCommand method
case "testproduct":
    Task.Run(async () => {
        var products = await ProductPurchaseManager.GetPlayerProducts(player._alias);
        player.sendMessage(0, $"You own {products.Count} products: {string.Join(", ", products)}");
    });
    break;

case "refreshcache":
    Task.Run(async () => {
        await ProductPurchaseManager.ForceRefreshCache();
        player.sendMessage(0, "Product cache refreshed!");
    });
    break;
```

## Security Considerations

### API Security
- Uses service role key for authenticated requests
- SSL/TLS validation bypassed for development (configure for production)
- Rate limiting handled by caching system

### Data Validation
- Player aliases sanitized (case-insensitive, trimmed)
- Product names validated against known conversions
- Error handling prevents malicious input issues

## Future Enhancements

### Planned Features
- [ ] **Temporary Products**: Items that expire after time
- [ ] **Quantity Bonuses**: Premium products give extra ammo
- [ ] **Product Stacking**: Multiple products with combined effects
- [ ] **Usage Analytics**: Track which products are most popular

### Easy Extensions
- Add new product types by updating `PRODUCT_CONVERSIONS`
- Create product bundles (multiple conversions per purchase)
- Implement product tiers (basic/premium/elite)
- Add seasonal or limited-time conversions

## Support

### Console Logging
All errors and important events are logged to console:
```
Product purchases cache refreshed: 15 players with purchases
Error getting player products for Player1: API timeout
Converted Kuchler A6 CAW to Rainbow CAW for Player2
```

### Performance Monitoring
Monitor these metrics:
- API response times
- Cache hit/miss ratios  
- Conversion success rates
- Error frequencies

---

**Ready to use!** Players can now purchase premium items from your website and automatically receive them in-game through the existing buy command system. 