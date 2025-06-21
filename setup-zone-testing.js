// Setup script for zone management testing
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🎮 Setting up Zone Management Testing Environment...\n');

// Check if .env.local exists
const envPath = '.env.local';
let envContent = '';

if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('✅ Found existing .env.local file');
} else {
    console.log('📝 Creating new .env.local file');
}

// Environment variables to add/update
const zoneEnvVars = {
    'INFANTRY_SERVER_HOST': 'linux-1.freeinfantry.com',
    'INFANTRY_SERVER_USER': 'root',
    'INFANTRY_SSH_KEY_PATH': path.join(os.homedir(), '.ssh', 'id_rsa')
};

console.log('\n🔧 Zone Management Configuration:');

let updatedContent = envContent;
let hasChanges = false;

Object.entries(zoneEnvVars).forEach(([key, defaultValue]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const envLine = `${key}=${defaultValue}`;
    
    if (regex.test(updatedContent)) {
        console.log(`   ${key}: Already configured`);
    } else {
        if (updatedContent && !updatedContent.endsWith('\n')) {
            updatedContent += '\n';
        }
        updatedContent += `\n# Infantry Zone Management\n${envLine}\n`;
        hasChanges = true;
        console.log(`   ${key}: Added (${defaultValue})`);
    }
});

if (hasChanges) {
    fs.writeFileSync(envPath, updatedContent);
    console.log('\n✅ Environment variables updated in .env.local');
} else {
    console.log('\n✅ All environment variables already configured');
}

// Check SSH key
const sshKeyPath = zoneEnvVars.INFANTRY_SSH_KEY_PATH;
console.log('\n🔑 SSH Key Check:');

if (fs.existsSync(sshKeyPath)) {
    console.log(`   ✅ SSH key found: ${sshKeyPath}`);
    
    // Check permissions
    const stats = fs.statSync(sshKeyPath);
    const mode = stats.mode & parseInt('777', 8);
    if (mode === parseInt('600', 8)) {
        console.log('   ✅ SSH key permissions are correct (600)');
    } else {
        console.log(`   ⚠️  SSH key permissions: ${mode.toString(8)} (should be 600)`);
        console.log('   💡 Run: chmod 600 ~/.ssh/id_rsa');
    }
} else {
    console.log(`   ❌ SSH key not found: ${sshKeyPath}`);
    console.log('   💡 Generate one with: ssh-keygen -t rsa -b 4096');
}

// Test SSH connection
console.log('\n🔗 Testing SSH Connection...');
const { exec } = require('child_process');

const testCommand = `ssh -i "${sshKeyPath}" -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${zoneEnvVars.INFANTRY_SERVER_USER}@${zoneEnvVars.INFANTRY_SERVER_HOST} "echo 'SSH connection successful'"`;

exec(testCommand, (error, stdout, stderr) => {
    if (error) {
        console.log('   ❌ SSH connection failed:', error.message);
        console.log('   💡 Make sure your SSH key is added to the server');
        console.log('   💡 Try: ssh-copy-id -i ~/.ssh/id_rsa.pub root@linux-1.freeinfantry.com');
    } else {
        console.log('   ✅ SSH connection successful!');
        
        // Test zone script
        console.log('\n📋 Testing Zone Script...');
        const scriptTest = `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=no ${zoneEnvVars.INFANTRY_SERVER_USER}@${zoneEnvVars.INFANTRY_SERVER_HOST} "ls -la /root/Infantry/scripts/zone-manager.sh"`;
        
        exec(scriptTest, (error, stdout, stderr) => {
            if (error) {
                console.log('   ❌ Zone script not found on server');
                console.log('   💡 Upload the zone-manager.sh script to /root/Infantry/scripts/');
                console.log('   💡 Make it executable: chmod +x /root/Infantry/scripts/zone-manager.sh');
            } else {
                console.log('   ✅ Zone script found on server!');
                console.log('\n🎉 Setup complete! You can now test zone management at:');
                console.log('   🌐 http://localhost:3000/admin/zones');
            }
        });
    }
});

console.log('\n📖 Next Steps:');
console.log('1. Make sure the zone-manager.sh script is uploaded to your server');
console.log('2. Restart your development server (npm run dev)');
console.log('3. Log in as admin and visit /admin/zones');
console.log('4. Test the zone controls!'); 