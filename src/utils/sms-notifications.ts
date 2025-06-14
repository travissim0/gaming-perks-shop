import twilio from 'twilio';

// Your SMS notification settings
const NOTIFICATION_PHONE = '7024725616'; // Your phone number
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: twilio.Twilio | null = null;

// Initialize Twilio client
function getTwilioClient() {
  if (!twilioClient && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

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
    const client = getTwilioClient();
    
    if (!client) {
      console.error('❌ Twilio not configured - missing credentials');
      return false;
    }

    if (!TWILIO_PHONE_NUMBER) {
      console.error('❌ Twilio phone number not configured');
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

    // Send the SMS
    const message = await client.messages.create({
      body: messageText,
      from: TWILIO_PHONE_NUMBER,
      to: `+1${NOTIFICATION_PHONE}`
    });

    console.log('✅ SMS notification sent successfully:', message.sid);
    return true;

  } catch (error: any) {
    console.error('❌ Failed to send SMS notification:', error.message);
    
    // Log specific Twilio errors
    if (error.code) {
      console.error(`Twilio Error Code: ${error.code}`);
    }
    
    return false;
  }
}

// Test function to verify SMS setup
export async function testSMSNotification(): Promise<boolean> {
  const testData: DonationData = {
    amount: 5.00,
    currency: 'USD',
    from_name: 'Test User',
    message: 'This is a test SMS notification',
    type: 'Donation',
    email: 'test@example.com'
  };

  return await sendDonationSMS(testData);
} 