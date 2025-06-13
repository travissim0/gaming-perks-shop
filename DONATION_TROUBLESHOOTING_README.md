# Donation System Troubleshooting Guide

## 🚀 New Admin Controls

I've created a comprehensive solution to help you manage your donation feeds and troubleshoot issues. Here's what's now available:

### **Admin Donation Manager** 
**URL:** `/admin/donation-manager`

This new admin page gives you full control over how donations are displayed site-wide:

#### **Three Display Modes:**
1. **Auto Mode** ⚡ (Recommended for production)
   - Tries to load from database first
   - Falls back to cached data if database fails
   - Best user experience - always shows something

2. **Database Mode** 🗄️ (For testing)
   - Shows only database data
   - Will display errors if database is down
   - Good for troubleshooting database issues

3. **Cache Mode** 💾 (Emergency fallback)
   - Shows only cached data from `supporters-cache.json`
   - Always works, even if database is completely down
   - Good for maintenance periods

#### **Built-in Troubleshooting Tools:**
- **Test Database Connectivity** - Check if your database is responding
- **Test Ko-Fi Webhook** - Look for recent Ko-Fi donations and find your missing $121
- **Live Data Preview** - See exactly what data is being loaded in real-time

---

## 🔧 Ko-Fi Donation Troubleshooting

### **Quick Ko-Fi Webhook Check**
Run this command to investigate your missing $121 donation:

```bash
node troubleshoot-kofi-donation.js
```

This script will:
- Search specifically for $121+ donations
- Check Ko-Fi webhook status
- Verify environment configuration
- Show recent donations from all sources
- Give specific recommendations

### **Common Ko-Fi Issues & Solutions:**

#### **Issue: $121 Donation Not Appearing**
**Possible Causes:**
1. **Ko-Fi webhook not configured properly**
   - Webhook URL should be: `https://freeinf.org/api/kofi-webhook`
   - Verification token must match your `KOFI_VERIFICATION_TOKEN`

2. **Webhook delivery failed**
   - Check Ko-Fi dashboard for delivery logs
   - Look for HTTP errors or timeouts

3. **Database processing error**
   - Check server logs during donation time
   - Look for Supabase connection issues

**Quick Fix:**
1. Go to `/admin/donation-manager`
2. Click "Test Ko-Fi Webhook" 
3. If it finds the donation, database is working
4. If not found, check Ko-Fi webhook configuration

#### **Issue: Database Not Loading**
**Symptoms:** Site shows cached data instead of live donations

**Quick Fix:**
1. Go to `/admin/donation-manager`
2. Check database status (should show green ✅)
3. If red ❌, click "Sync Database" to test connectivity
4. Switch to "Cache Mode" temporarily if needed

---

## 🎛️ How to Use the New System

### **For Immediate Relief:**
1. Visit `/admin/donation-manager`
2. Switch to **"Cache Mode"** 
3. Click "Apply Mode Change"
4. Your site will now show cached supporters data everywhere

### **For Troubleshooting:**
1. Switch to **"Database Mode"**
2. Click "Sync Database" to test connectivity
3. Click "Test Ko-Fi Webhook" to check for missing donations
4. Check the "Live Test Data Preview" to see what's loading

### **For Production (Recommended):**
1. Use **"Auto Mode"**
2. This gives the best user experience:
   - Shows live database data when available
   - Gracefully falls back to cache when database has issues
   - Users always see donation data, never empty pages

---

## 📊 Components That Use New System

These components now automatically respect your admin mode settings:

- **DonateWidget** - Used on multiple pages
- **Donate Page** - Main donation page (`/donate`)
- **Recent Donations APIs** - Backend endpoints
- **Supporters Pages** - Community supporter displays

When you change the mode in admin, it affects the entire site immediately.

---

## 🛠️ Technical Details

### **New Files Created:**
- `/src/app/api/admin/donation-mode/route.ts` - Admin API endpoint
- `/src/app/admin/donation-manager/page.tsx` - Admin control panel
- `/src/hooks/useDonationMode.ts` - React hook for flexible data loading
- `troubleshoot-kofi-donation.js` - Ko-Fi debugging script

### **Updated Components:**
- Updated `DonateWidget` to use new hook
- Updated donation page to use flexible loading
- All donation displays now respect admin mode settings

### **Database Queries:**
The system intelligently handles:
- Connection timeouts
- Query errors  
- Missing data
- Graceful fallbacks

---

## 🚨 Emergency Procedures

### **If Donations Stop Working Completely:**
1. Go to `/admin/donation-manager`
2. Switch to **"Cache Mode"**
3. Site will continue showing supporters while you debug

### **If Ko-Fi Donations Stop Appearing:**
1. Run: `node troubleshoot-kofi-donation.js`
2. Check Ko-Fi webhook configuration
3. Test webhook delivery in Ko-Fi dashboard
4. Check server logs for processing errors

### **If Database Connection Fails:**
1. Admin panel will show red ❌ status
2. "Auto Mode" will automatically fall back to cache
3. Users won't notice any disruption
4. Fix database connection and switch back to "Auto Mode"

---

## ✅ Testing Your Setup

1. **Visit `/admin/donation-manager`**
2. **Verify all status indicators are green ✅**
3. **Test mode switching:**
   - Switch between modes
   - Check that test data updates accordingly
   - Verify site pages reflect changes
4. **Run troubleshooting script:**
   ```bash
   node troubleshoot-kofi-donation.js
   ```
5. **Check for your $121 donation specifically**

---

## 🎯 Next Steps

1. **Try the admin panel first** - `/admin/donation-manager`
2. **Test Ko-Fi webhook** - Use the built-in tools to find your missing donation
3. **Set to Auto Mode** - For the best production experience
4. **Run the troubleshooting script** - Get detailed Ko-Fi webhook analysis

This system gives you complete control and visibility over your donation feeds. You can now easily switch between cached and database modes, and you have powerful tools to debug Ko-Fi webhook issues.

The missing $121 donation issue should be resolved by either finding it in the database (if webhook worked) or identifying the webhook configuration problem (if it didn't process). 