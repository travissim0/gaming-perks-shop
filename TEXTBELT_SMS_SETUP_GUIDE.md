# 📱 Textbelt SMS Setup (No Business Verification Required!)

This is a simpler alternative to Twilio that doesn't require business verification.

## 🎯 Why Textbelt?

- ✅ **No business verification** - just need an email
- ✅ **No phone number purchase** required
- ✅ **Simple API** - just one endpoint
- ✅ **Pay-per-use** - $0.01 per SMS
- ✅ **Works immediately** after signup

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Your API Key
1. Go to [textbelt.com](https://textbelt.com)
2. Click "Get API Key"
3. Enter your email address
4. Check your email and click the verification link
5. Copy your API key (looks like: `textbelt-abc123def456...`)

### Step 2: Add to Environment Variables
Add this to your `.env.local` file:

```bash
# Textbelt SMS Configuration
TEXTBELT_API_KEY=textbelt-abc123def456...
```

### Step 3: Update Your Ko-fi Webhook URL
Change your Ko-fi webhook URL from:
```
https://freeinf.org/api/kofi-webhook
```

To:
```
https://freeinf.org/api/kofi-webhook-textbelt
```

### Step 4: Test It
```bash
node test-sms-notification.js
```

## 💰 Pricing

- **Free tier**: 1 SMS to test
- **Paid**: $0.01 per SMS (1 cent each)
- **No monthly fees**
- **No phone number rental**

**Example costs:**
- 10 donations/month = $0.10/month
- 50 donations/month = $0.50/month
- 100 donations/month = $1.00/month

## 📱 What You'll Receive

Same format as before:
```
🎉 New ☕ Donation!

💰 Amount: $25.00
👤 From: John Doe
📧 Email: john@example.com
💬 Message: "Keep up the great work!"

🕒 12/15/2024, 3:45:23 PM
```

## 🔧 Files Changed

The system creates these files for you:
- `src/utils/sms-notifications-textbelt.ts` - Textbelt SMS handler
- `src/app/api/kofi-webhook-textbelt/route.ts` - New webhook endpoint

## 🎛️ Ko-fi Settings Update

In your Ko-fi creator dashboard:
1. Go to Settings → Webhooks
2. Update webhook URL to: `https://freeinf.org/api/kofi-webhook-textbelt`
3. Keep your verification token the same

## ✅ Testing

Test the new setup:
```bash
# Test SMS functionality
node test-sms-notification.js

# Test full webhook with SMS
node test-kofi-webhook.js
```

## 🆚 Textbelt vs Twilio

| Feature | Textbelt | Twilio |
|---------|----------|--------|
| Business verification | ❌ No | ✅ Yes |
| Setup complexity | 🟢 Simple | 🟡 Complex |
| Cost per SMS | $0.01 | ~$0.0075 |
| Monthly fees | ❌ None | ✅ $1 phone rental |
| Reliability | 🟢 Good | 🟢 Excellent |
| Features | 🟡 Basic | 🟢 Advanced |

## 🎉 That's It!

Your SMS donation alerts will now work with Textbelt - no business verification needed! You'll get a text at **702-472-5616** every time someone donates.

Much simpler than dealing with Twilio's verification process! 📱 