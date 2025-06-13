#!/usr/bin/env node

// Create static supporters data as fallback
require('dotenv').config({ path: './.env.local' });

const fs = require('fs');

// Known supporters from our database check
const supportersData = [
 { name: "Zmn", amount: 121, message: "ez dila", date: "2025-06-12T04:25:29.442+00:00" },
  { name: "Kurrupter", amount: 120, message: "", date: "2025-06-12T01:25:29.442+00:00" },
  { name: "Worth", amount: 110, message: "Thanks for all your hard work.", date: "2025-06-10T00:07:06.896+00:00" },
  { name: "kal", amount: 5, message: "", date: "2025-06-09T23:49:56.912+00:00" },
  { name: "Travis Lyons", amount: 5, message: "", date: "2025-06-09T21:32:05.306+00:00" },
  { name: "SgtKetchup", amount: 5, message: "", date: "2025-06-09T18:22:12.001+00:00" },
  { name: "Keyser", amount: 15, message: "", date: "2025-06-09T13:20:18.375+00:00" },
  { name: "Fausto", amount: 100, message: "Thank you Axidus", date: "2025-06-09T04:25:54.693+00:00" },
  { name: "CT", amount: 40, message: "CT donate from MVP prize pool", date: "2025-06-09T04:21:54.847+00:00" },
  { name: "mbx", amount: 50, message: "thanks for all that you are doing", date: "2025-06-08T18:41:05.698+00:00" },
  { name: "victim", amount: 50, message: "", date: "2025-06-08T18:10:24.944+00:00" },
  { name: "Thiz", amount: 10, message: "", date: "2025-06-01T22:53:55.524+00:00" },
  { name: "Decker", amount: 25, message: "", date: "2025-06-01T05:19:14.426+00:00" },
  { name: "JACKIE", amount: 5, message: "FOR MY KILL MACRO", date: "2025-06-01T04:55:41.093+00:00" },
  { name: "MIKE", amount: 5, message: "Got rice?", date: "2025-05-31T18:08:32.662+00:00" },
  { name: "Trouble (MG)", amount: 50, message: "", date: "2025-05-31T18:00:40.476+00:00" }
];

// Calculate totals
const totalAmount = supportersData.reduce((sum, supporter) => sum + supporter.amount, 0);
const totalCount = supportersData.length;

console.log('🎉 Creating static supporters data...');
console.log(`📊 Total: $${totalAmount} from ${totalCount} supporters`);

// Create API response format
const apiResponse = {
  donations: supportersData.map(supporter => ({
    amount: supporter.amount,
    currency: 'usd',
    customerName: supporter.name,
    message: supporter.message,
    date: supporter.date,
    paymentMethod: 'kofi'
  })),
  count: totalCount,
  timeframe: 'All time',
  lastUpdated: new Date().toISOString(),
  totalAmount: totalAmount,
  status: 'cached'
};

// Save as fallback data
fs.writeFileSync('supporters-fallback.json', JSON.stringify(apiResponse, null, 2));

console.log('✅ Static supporters data created in supporters-fallback.json');
console.log('💡 This can be used as a fallback while fixing the API issues');

// Create HTML version for emergency use
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>CTFPL Supporters</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a1a; color: white; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .total { text-align: center; margin: 20px 0; font-size: 24px; color: #ff6b6b; }
        .supporter { background: #2a2a2a; margin: 10px 0; padding: 15px; border-radius: 8px; }
        .amount { color: #4ade80; font-weight: bold; }
        .message { color: #94a3b8; font-style: italic; margin-top: 5px; }
        .date { color: #64748b; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎮 CTFPL Supporters</h1>
        <div class="total">Total Raised: $${totalAmount} from ${totalCount} supporters</div>
        <p>Thank you to all our amazing supporters who keep Infantry Online running!</p>
        
        ${supportersData.map(supporter => `
            <div class="supporter">
                <strong>${supporter.name}</strong> - <span class="amount">$${supporter.amount}</span>
                ${supporter.message ? `<div class="message">"${supporter.message}"</div>` : ''}
                <div class="date">${new Date(supporter.date).toLocaleDateString()}</div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;

fs.writeFileSync('supporters-emergency.html', html);
console.log('✅ Emergency HTML page created: supporters-emergency.html');
console.log('🌐 You can upload this to your server if needed');

console.log('\n🎯 Summary:');
console.log(`   • ${totalCount} supporters properly recognized`);
console.log(`   • $${totalAmount} total amount displayed`);
console.log(`   • All Ko-fi donors included`);
console.log(`   • Files ready for deployment if needed`); 