// Simple SMS notifications using Textbelt (no business verification required)
import fetch from 'node-fetch';

// Your SMS notification settings
const NOTIFICATION_PHONE = '7024725616'; // Your phone number
const TEXTBELT_API_KEY = process.env.TEXTBELT_API_KEY; // Get from textbelt.com

interface DonationData {
  amount: number;
  currency: string;
  from_name: string;
  message?: string;
  type: string;
  email?: string;
}

export async function sendDonationSMS(donationData: DonationData): Promise<boolean> {
  try {
    if (!TEXTBELT_API_KEY) {
      console.error('❌ Textbelt API key not configured');
      return false;
    }

    // Format the donation message
    const formatAmount = (amount: number, currency: string) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase()
      }).format(amount);
    };

    const messageType = donationData.type === 'Shop Order' ? '🛒 Shop Order' : '☕ Donation';
    const amountStr = formatAmount(donationData.amount, donationData.currency);
    
    let messageText = `🎉 New ${messageType}!\n\n`;
    messageText += `💰 Amount: ${amountStr}\n`;
    messageText += `👤 From: ${donationData.from_name}\n`;
    
    if (donationData.email) {
      messageText += `📧 Email: ${donationData.email}\n`;
    }
    
    if (donationData.message) {
      messageText += `💬 Message: "${donationData.message}"\n`;
    }
    
    messageText += `\n🕒 ${new Date().toLocaleString()}`;

    // Send SMS via Textbelt
    const response = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: NOTIFICATION_PHONE,
        message: messageText,
        key: TEXTBELT_API_KEY,
      }),
    });

    const result = await response.json() as any;

    if (result.success) {
      console.log('✅ SMS notification sent successfully via Textbelt');
      return true;
    } else {
      console.error('❌ Textbelt SMS failed:', result.error);
      return false;
    }

  } catch (error: any) {
    console.error('❌ Failed to send SMS notification via Textbelt:', error.message);
    return false;
  }
}

// Test function
export async function testSMSNotification(): Promise<boolean> {
  const testData: DonationData = {
    amount: 5.00,
    currency: 'USD',
    from_name: 'Test User',
    message: 'This is a test SMS notification via Textbelt',
    type: 'Donation',
    email: 'test@example.com'
  };

  return await sendDonationSMS(testData);
} 