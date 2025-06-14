# 📱 SMS Donation Alerts Setup Guide

This guide will help you set up SMS text alerts to **702-472-5616** whenever you receive a donation through Ko-fi.

## 🎯 Overview

The SMS notification system integrates with your existing Ko-fi webhook to automatically send you text messages when:
- Someone makes a donation
- Someone purchases from your Ko-fi shop
- Any Ko-fi transaction is processed

## 🚀 Setup Steps

### Step 1: Create a Twilio Account

1. Go to [twilio.com](https://www.twilio.com) and sign up for a free account
2. Verify your phone number (702-472-5616) during signup
3. Complete the account verification process

### Step 2: Get Your Twilio Credentials

1. From your Twilio Console Dashboard, copy these values:
   - **Account SID** (starts with "AC...")
   - **Auth Token** (click to reveal, starts with letters/numbers)

2. Get a Twilio phone number:
   - Go to Phone Numbers → Manage → Buy a number
   - Choose a US number (free trial includes $15 credit)
   - Purchase the number

### Step 3: Configure Environment Variables

Add these to your `.env.local` file (create it if it doesn't exist):

```bash
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Replace with your actual values:**
- `TWILIO_ACCOUNT_SID`: Your Account SID from Twilio Console
- `TWILIO_AUTH_TOKEN`: Your Auth Token from Twilio Console  
- `TWILIO_PHONE_NUMBER`: Your purchased Twilio number (format: +1234567890)

### Step 4: Install Dependencies

```bash
npm install
```

This will install the Twilio package that was added to your `package.json`.

### Step 5: Test the Setup

Run the test script to verify everything works:

```bash
node test-sms-notification.js
```

You should see:
- ✅ All environment variables configured
- 📱 Test SMS sent successfully
- A text message on your phone (702-472-5616)

## 📱 What You'll Receive

When someone donates, you'll get a text like:

```
🎉 New ☕ Donation!

💰 Amount: $25.00
👤 From: John Doe
📧 Email: john@example.com
💬 Message: "Keep up the great work!"

🕒 12/15/2024, 3:45:23 PM
```

## 🔧 Troubleshooting

### Common Issues

**Error: "Cannot find module 'twilio'"**
```bash
npm install twilio
```

**Error: "Authentication Error"**
- Double-check your Account SID and Auth Token
- Make sure there are no extra spaces in your `.env.local` file

**Error: "The number +17024725616 is not a valid phone number"**
- Verify your phone number is verified in Twilio Console
- Make sure it's in format +1XXXXXXXXXX

**SMS not received**
- Check if your phone number is verified in Twilio Console
- For trial accounts, you can only send to verified numbers
- Check Twilio logs in the Console for delivery status

### Test Individual Components

**Test environment variables:**
```bash
node -e "require('dotenv').config(); console.log('SID:', process.env.TWILIO_ACCOUNT_SID?.substring(0,8) + '...');"
```

**Test webhook with SMS:**
```bash
node test-kofi-webhook.js
```

## 💰 Costs

### Twilio Pricing (as of 2024)
- **Free Trial**: $15 credit (enough for ~500 SMS messages)
- **SMS Cost**: ~$0.0075 per message in the US
- **Phone Number**: ~$1/month to maintain

### Monthly Cost Estimate
- If you get 10 donations/month: ~$0.08/month + $1 phone rental = ~$1.08/month
- If you get 50 donations/month: ~$0.38/month + $1 phone rental = ~$1.38/month

## 🔐 Security Notes

- Never commit your `.env.local` file to git (it's already in `.gitignore`)
- Keep your Twilio Auth Token secret
- Consider using environment variables on your production server
- The SMS function is designed to not break your webhook if it fails

## 🎛️ Customization Options

### Change Notification Phone Number
Edit `src/utils/sms-notifications.ts` and update:
```typescript
const NOTIFICATION_PHONE = '7024725616'; // Your phone number
```

### Customize Message Format
Edit the `messageText` formatting in `src/utils/sms-notifications.ts`

### Add Multiple Recipients
Modify the SMS function to send to multiple phone numbers

### Conditional Notifications
Add logic to only send SMS for donations above a certain amount

## 🚀 Production Deployment

Make sure to set these environment variables on your production server:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

The SMS notifications will automatically work with your existing Ko-fi webhook.

## 📞 Support

If you run into issues:
1. Check the troubleshooting section above
2. Run the test script: `node test-sms-notification.js`
3. Check your Twilio Console logs for delivery details
4. Verify your Ko-fi webhook is working: `node test-kofi-webhook.js`

---

Your donation SMS alerts are now ready! 🎉 You'll get a text at **702-472-5616** every time someone supports your gaming community. 