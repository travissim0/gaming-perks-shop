# Environment Setup Guide

This guide explains how to configure environment variables for both local development and production deployment of the Gaming Perks Shop.

## 🔧 Quick Setup

### For Local Development

1. **Run the setup script:**
   ```bash
   ./setup-env.ps1
   ```

2. **Check environment status:**
   ```bash
   ./check-env-status.ps1
   ```

3. **Edit `.env.local` with your actual credentials**

4. **Start development server:**
   ```bash
   npm run dev
   ```

## 📋 Required Environment Variables

### Core Configuration
- `NEXT_PUBLIC_SITE_URL` - Your site URL (http://localhost:3000 for dev, https://freeinf.org for prod)

### Supabase (Database)
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key  
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for server-side operations)

### Stripe (Payments)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook endpoint secret

## 🎯 Getting Credentials

### Supabase Setup

1. Go to [app.supabase.com](https://app.supabase.com)
2. Create a new project or select existing one
3. Navigate to **Settings > API**
4. Copy the following:
   - **URL**: Your project URL (e.g., `https://abcdefgh.supabase.co`)
   - **anon/public key**: The `anon` key under "Project API keys"
   - **service_role key**: The `service_role` key (keep this secure!)

### Stripe Setup

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Navigate to **Developers > API keys**
3. For development, use **test keys**:
   - **Publishable key**: Starts with `pk_test_`
   - **Secret key**: Starts with `sk_test_`
4. For webhooks, go to **Developers > Webhooks**:
   - Create endpoint pointing to your domain + `/api/webhooks/stripe`
   - Copy the **Signing secret** (starts with `whsec_`)

## 📁 Environment Files

### Development: `.env.local`
```env
# Local Development Environment Variables
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Stripe Configuration (use test keys)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Production: Platform Environment Variables
Set these in your hosting platform (Vercel, Netlify, etc.):

```env
NEXT_PUBLIC_SITE_URL=https://freeinf.org
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key_here
STRIPE_SECRET_KEY=sk_live_your_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret_here
```

## 🚀 Deployment

### Vercel
1. Connect your repository to Vercel
2. Add environment variables in **Settings > Environment Variables**
3. Deploy!

### Netlify
1. Connect your repository to Netlify
2. Add environment variables in **Site settings > Environment variables**
3. Deploy!

### Other Platforms
Most platforms support environment variables through their dashboard or configuration files.

## 🔍 Troubleshooting

### Common Issues

**"subscription.unsubscribe is not a function"**
- This is a known Next.js development issue
- It doesn't affect production
- Restart the dev server if it becomes problematic

**"Failed to load stats: Database query failed"**
- Check your Supabase credentials are correct
- Verify your database has the required tables
- Ensure RLS policies allow admin access
- Run `./check-env-status.ps1` to verify configuration

**Admin access denied**
- Make sure your user account has `is_admin = true` in the `profiles` table
- Use the SQL provided in `grant-admin-access.sql`

### Verification Commands

```bash
# Check environment status
./check-env-status.ps1

# Create environment template  
./setup-env.ps1

# Test admin access (after setting up environment)
npm run dev
# Navigate to http://localhost:3000/admin
```

## 🔒 Security Notes

### Development
- ✅ Use test/development keys
- ✅ Never commit `.env.local` to version control
- ✅ Use different databases for dev/prod

### Production  
- ✅ Use live/production keys
- ✅ Set environment variables in hosting platform
- ✅ Enable all security features in Supabase/Stripe
- ✅ Use secure webhook endpoints

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

## 🆘 Need Help?

1. Run the diagnostic script: `./check-env-status.ps1`
2. Check the browser console for detailed error messages
3. Verify your Supabase project is active and properly configured
4. Ensure your Stripe account is set up with the correct webhook endpoints 