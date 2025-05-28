# Custom Phrase Per Purchase Update

This update modifies the system so that customers can input a custom phrase for each perk purchase, rather than having a fixed phrase per product.

## Changes Made

### Database Changes
1. **Added phrase column to user_products table** - Run `user-products-add-phrase.sql`
   - Stores the custom phrase for each individual purchase
   - Validates 1-12 alphanumeric characters only
   - Optional field (can be null)

### Frontend Changes

#### New Component
- **PhraseInputModal** (`src/components/PhraseInputModal.tsx`)
  - Modal dialog for inputting custom phrases
  - Real-time validation with visual feedback
  - Preview of how the phrase will appear in-game
  - Converts input to uppercase for consistency

#### Updated Pages
- **Perks Page** (`src/app/perks/page.tsx`)
  - Modified purchase flow to show phrase input modal first
  - Removed display of product-level phrases
  - Added customization notice for each product
  
- **Dashboard** (`src/app/dashboard/page.tsx`)
  - Shows custom phrases for purchased perks
  - Displays kill macro preview

#### Updated Types
- **UserProduct interface** (`src/types/index.ts`)
  - Added optional `phrase` field

### Backend Changes

#### API Updates
- **Checkout API** (`src/app/api/checkout/route.ts`)
  - Accepts `phrase` parameter
  - Validates phrase format (1-12 alphanumeric)
  - Stores phrase in Stripe session metadata

- **Webhook Handler** (`src/app/api/webhooks/stripe/route.ts`)
  - Extracts phrase from session metadata
  - Saves phrase to user_products table

- **Verify Checkout** (`src/app/api/verify-checkout/route.ts`)
  - Handles phrase storage during purchase verification

## Database Migration

Run the following SQL in your Supabase SQL editor:

```sql
-- Migration to add phrase column to user_products table
ALTER TABLE user_products 
ADD COLUMN IF NOT EXISTS phrase VARCHAR(12) CHECK (phrase ~ '^[a-zA-Z0-9]*$');

-- Add comment to document the column
COMMENT ON COLUMN user_products.phrase IS 'Custom phrase for in-game usage (1-12 alphanumeric characters only)';

-- Create index for faster phrase lookups (optional)
CREATE INDEX IF NOT EXISTS idx_user_products_phrase ON user_products(phrase) WHERE phrase IS NOT NULL;
```

## New Purchase Flow

1. User clicks "Buy" on a perk
2. Phrase input modal appears
3. User enters their custom phrase (1-12 alphanumeric characters)
4. System validates the phrase
5. User confirms and proceeds to Stripe checkout
6. After payment, phrase is stored with the user's purchase
7. Phrase appears in user's dashboard and is available for game integration

## Game Integration

The custom phrase is now stored in the `user_products.phrase` field and can be retrieved for in-game use:

```sql
SELECT up.phrase, p.name as product_name
FROM user_products up
JOIN products p ON up.product_id = p.id
WHERE up.user_id = $1 AND up.phrase IS NOT NULL;
```

## Benefits

- ✅ Each customer can have a unique phrase per purchase
- ✅ Improved user experience with real-time validation
- ✅ Better game integration possibilities
- ✅ Maintains data integrity with proper validation
- ✅ Backward compatible (existing purchases without phrases)

## Testing

After deployment:

1. Navigate to `/perks`
2. Click "Buy" on any perk
3. Enter a custom phrase in the modal
4. Complete the purchase process
5. Check your dashboard to see the custom phrase displayed
6. Verify the phrase is stored in the database

## Notes

- The old `phrase` field in the `products` table can be removed if no longer needed
- All phrases are converted to uppercase for consistency
- Empty or null phrases are allowed (optional feature)
- Phrase validation happens on both frontend and backend 