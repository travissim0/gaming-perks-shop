const fs = require('fs');

async function restoreSquareSignature() {
  console.log('🔄 RESTORING SQUARE SIGNATURE VERIFICATION');
  console.log('=========================================\n');
  
  const webhookFile = 'src/app/api/webhooks/square/route.ts';
  const backupFile = webhookFile + '.backup';
  
  try {
    // Check if backup exists
    if (!fs.existsSync(backupFile)) {
      console.log('❌ No backup file found');
      console.log('You may need to manually restore signature verification');
      return;
    }
    
    // Read backup and restore
    const originalContent = fs.readFileSync(backupFile, 'utf8');
    fs.writeFileSync(webhookFile, originalContent);
    
    console.log('✅ Signature verification restored from backup');
    
    // Clean up backup
    fs.unlinkSync(backupFile);
    console.log('🗑️  Backup file removed');
    
    console.log('\n📝 Next Steps:');
    console.log('1. Add SQUARE_WEBHOOK_SIGNATURE_KEY to your .env.local');
    console.log('2. Get the key from Square Developer Dashboard > Webhooks');
    console.log('3. Deploy your application');
    console.log('4. Test webhook with proper signature verification');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

if (require.main === module) {
  restoreSquareSignature();
} 