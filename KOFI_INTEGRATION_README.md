# ☕ Ko-fi Donation Integration

This document covers the complete Ko-fi integration that adds Ko-fi as an alternative donation method alongside Stripe.

## 🎯 Overview

Ko-fi integration provides users with an alternative to Stripe for making donations. The system automatically tracks Ko-fi donations via webhooks and displays them in the admin dashboard alongside Stripe donations.

## 🚀 Features

- **Dual Payment Options**: Users can choose between Stripe and Ko-fi
- **Automatic Tracking**: Ko-fi donations are automatically captured via webhooks
- **Admin Dashboard**: Unified view of all donations with payment method filtering
- **User Matching**: Ko-fi donations are linked to user accounts when possible
- **Export Support**: CSV exports include both Stripe and Ko-fi donations
- **Visual Distinction**: Payment methods are clearly distinguished in the UI

## 📁 Files Changed/Added

### Frontend Components
- `src/app/donate/page.tsx` - Added Ko-fi payment option
- `src/app/admin/donations/page.tsx` - Enhanced to show Ko-fi donations

### API Endpoints
- `src/app/api/kofi-webhook/route.ts` - Ko-fi webhook handler (NEW)

### Database Schema
- `add-kofi-donations.sql` - Database schema updates (NEW)

### Deployment Scripts
- `deploy-kofi-integration.js` - Deployment checker (NEW)

## 📋 Database Schema Changes

The integration adds the following columns to `donation_transactions`:

```sql
- payment_method VARCHAR(20) DEFAULT 'stripe'
- kofi_transaction_id VARCHAR(255)
- kofi_message TEXT
- kofi_from_name VARCHAR(255)
- kofi_email VARCHAR(255)
- kofi_url VARCHAR(500)
- kofi_shop_items JSONB
```

## 🔧 Setup Instructions

### 1. Apply Database Schema

Run the SQL script in your Supabase SQL Editor:

```bash
# Copy the contents of add-kofi-donations.sql and run in Supabase
```

### 2. Configure Ko-fi Webhook

1. Go to your [Ko-fi Creator Dashboard](https://ko-fi.com/manage)
2. Navigate to **Settings** → **Webhooks**
3. Add webhook URL: `https://your-domain.com/api/kofi-webhook`
4. (Optional) Set a verification token for security

### 3. Environment Variables

Add to your `.env.local`:

```env
# Optional: Ko-fi webhook verification token
KOFI_VERIFICATION_TOKEN=your_secret_token_here
```

### 4. Test the Integration

1. Visit your donate page (`/donate`)
2. Select Ko-fi as payment method
3. Make a test donation
4. Check admin dashboard to verify webhook captured the donation

## 💳 Payment Method Comparison

| Feature | Stripe | Ko-fi |
|---------|--------|-------|
| **Processing** | Direct integration | External redirect |
| **Fees** | 2.9% + 30¢ | 0% (Ko-fi Gold: 3%) |
| **Payment Methods** | Cards, Apple Pay, etc. | Cards, PayPal, Apple Pay |
| **Automation** | Full automation | Webhook automation |
| **User Experience** | Seamless checkout | Redirect to Ko-fi |
| **Recurring** | Built-in subscriptions | Ko-fi memberships |

## 📊 Admin Dashboard Features

The enhanced admin dashboard now includes:

### Enhanced Stats
- Total donations (both methods combined)
- Separate Stripe and Ko-fi breakdowns
- Visual indicators for each payment method

### Advanced Filtering
- Filter by payment method (All/Stripe/Ko-fi)
- Search Ko-fi transaction IDs
- Export data includes payment method

### Ko-fi Specific Information
- Ko-fi transaction IDs
- Direct links to Ko-fi donation pages
- Ko-fi-specific donor information

## 🔗 Webhook Details

### Ko-fi Webhook Data Structure

```json
{
  "verification_token": "your_token",
  "message_id": "unique_id",
  "timestamp": "2023-12-07T10:30:00Z",
  "type": "Donation",
  "from_name": "Supporter Name",
  "message": "Keep up the great work!",
  "amount": "5.00",
  "currency": "USD",
  "email": "supporter@example.com",
  "kofi_transaction_id": "00000000-1111-2222-3333-444444444444",
  "url": "https://ko-fi.com/supporterpage",
  "is_public": true
}
```

### Webhook Processing

1. **Verification**: Checks verification token if configured
2. **Deduplication**: Prevents duplicate donations
3. **User Matching**: Links donation to user account if email matches
4. **Data Storage**: Saves all Ko-fi specific information
5. **Status**: Marks donation as 'completed' immediately

## 🧪 Testing

### Manual Testing Steps

1. **Frontend Integration Test**
   ```bash
   # Visit donate page
   # Select Ko-fi method
   # Verify redirect works
   ```

2. **Webhook Test**
   ```bash
   # Use Ko-fi webhook tester
   # Or make real test donation
   # Check database for new entry
   ```

3. **Admin Dashboard Test**
   ```bash
   # Check stats show Ko-fi breakdown
   # Filter by Ko-fi donations
   # Export CSV with Ko-fi data
   ```

### Deployment Check

Run the deployment checker:

```bash
node deploy-kofi-integration.js
```

## 🛠️ Troubleshooting

### Common Issues

#### Ko-fi Donations Not Appearing

1. **Check Webhook URL**: Ensure it's correctly set in Ko-fi dashboard
2. **Verify HTTPS**: Ko-fi requires HTTPS for webhooks
3. **Check Logs**: Look at webhook endpoint logs
4. **Test Webhook**: Use Ko-fi's webhook testing tool

#### Database Errors

1. **Schema Check**: Ensure `add-kofi-donations.sql` was applied
2. **Permissions**: Verify RLS policies allow webhook inserts
3. **Column Types**: Check column types match expected data

#### Frontend Issues

1. **Environment Variables**: Ensure Supabase credentials are correct
2. **Ko-fi URL**: Verify Ko-fi profile URL is correct
3. **Browser Console**: Check for JavaScript errors

### Debugging Commands

```bash
# Check database schema
node deploy-kofi-integration.js

# Test webhook locally (if using ngrok)
curl -X POST https://your-ngrok-url.com/api/kofi-webhook \
  -F 'data={"verification_token":"test","type":"Donation","amount":"5.00","from_name":"Test User","kofi_transaction_id":"test-123","currency":"USD","email":"test@example.com"}'
```

## 📈 Analytics & Monitoring

### Key Metrics to Track

1. **Donation Method Split**: Stripe vs Ko-fi usage
2. **Average Donation Size**: Compare between methods
3. **Conversion Rates**: Success rates for each method
4. **User Preferences**: Which method users prefer

### Monitoring Webhooks

```sql
-- Check recent Ko-fi donations
SELECT 
  kofi_transaction_id,
  amount_cents,
  kofi_from_name,
  created_at
FROM donation_transactions 
WHERE payment_method = 'kofi' 
ORDER BY created_at DESC 
LIMIT 10;

-- Ko-fi vs Stripe comparison
SELECT 
  payment_method,
  COUNT(*) as count,
  SUM(amount_cents) as total_cents,
  AVG(amount_cents) as avg_cents
FROM donation_transactions 
WHERE status = 'completed'
GROUP BY payment_method;
```

## 🔮 Future Enhancements

### Potential Improvements

1. **Ko-fi API Integration**: Direct API calls for more data
2. **Subscription Tracking**: Better handling of Ko-fi memberships
3. **Mobile Optimization**: Enhanced mobile Ko-fi experience
4. **Analytics Dashboard**: Detailed payment method analytics
5. **Notification System**: Real-time donation notifications

### Ko-fi Gold Features

If you upgrade to Ko-fi Gold:
- Lower fees (3% vs external payment fees)
- Commission shop support
- Advanced analytics
- Custom donation goals

## 📞 Support

For issues with this integration:

1. **Ko-fi Issues**: Contact Ko-fi support for webhook/platform issues
2. **Database Issues**: Check Supabase logs and documentation
3. **Code Issues**: Review the implementation files
4. **Webhook Issues**: Use browser dev tools and server logs

## ✅ Checklist

- [ ] Database schema applied (`add-kofi-donations.sql`)
- [ ] Ko-fi webhook URL configured
- [ ] Environment variables set (optional)
- [ ] Frontend payment selection working
- [ ] Test donation completed
- [ ] Admin dashboard showing Ko-fi donations
- [ ] CSV export includes Ko-fi data
- [ ] Webhook verification working (if enabled)

## 🎉 Success!

Once setup is complete, you'll have:
- ☕ Ko-fi as an alternative to Stripe
- 📊 Unified donation tracking
- 💰 Automatic webhook processing
- 📈 Enhanced admin analytics
- 🎯 Better user choice and experience

Your users can now support you through both Stripe and Ko-fi, giving them more options while you maintain complete visibility into all donations through a single dashboard! 