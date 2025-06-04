const fs = require('fs');
const path = require('path');

async function temporarilyDisableSquareSignature() {
  console.log('🔧 TEMPORARILY DISABLING SQUARE SIGNATURE VERIFICATION');
  console.log('=====================================================\n');
  
  const webhookFile = 'src/app/api/webhooks/square/route.ts';
  
  try {
    // Read the current webhook file
    const content = fs.readFileSync(webhookFile, 'utf8');
    
    // Check if signature verification is already disabled
    if (content.includes('// SIGNATURE VERIFICATION TEMPORARILY DISABLED')) {
      console.log('⚠️  Signature verification already disabled');
      return;
    }
    
    // Create backup
    const backupFile = webhookFile + '.backup';
    fs.writeFileSync(backupFile, content);
    console.log(`💾 Created backup: ${backupFile}`);
    
    // Replace signature verification block
    const modifiedContent = content.replace(
      /\/\/ Verify webhook signature if key is available[\s\S]*?}\s*}/,
      `// SIGNATURE VERIFICATION TEMPORARILY DISABLED FOR TESTING
    // Verify webhook signature if key is available
    if (false) { // TEMPORARILY DISABLED - WAS: if (SQUARE_WEBHOOK_SIGNATURE_KEY)
      const signature = request.headers.get('x-square-signature');
      if (!signature) {
        console.error('❌ Missing Square webhook signature');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      const url = request.url;
      const hash = crypto
        .createHmac('sha256', SQUARE_WEBHOOK_SIGNATURE_KEY)
        .update(url + body)
        .digest('base64');

      if (signature !== hash) {
        console.error('❌ Square webhook signature verification failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }`
    );
    
    if (modifiedContent === content) {
      console.log('❌ Could not find signature verification block to modify');
      console.log('You may need to manually comment it out');
      return;
    }
    
    // Write modified content
    fs.writeFileSync(webhookFile, modifiedContent);
    
    console.log('✅ Signature verification temporarily disabled');
    console.log('\n⚠️  IMPORTANT WARNINGS:');
    console.log('- This is for TESTING ONLY');
    console.log('- Your webhook is now insecure');
    console.log('- Re-enable signature verification before going to production');
    console.log('- Use the restore script when done testing');
    
    console.log('\n📝 Next Steps:');
    console.log('1. Deploy your application');
    console.log('2. Test a Square donation');
    console.log('3. Check if webhook works now');
    console.log('4. Run restore script: node restore-square-signature.js');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

if (require.main === module) {
  temporarilyDisableSquareSignature();
} 