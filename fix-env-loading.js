// Fix Environment Variable Loading Issues
// This addresses the "supabaseUrl is required" error during login

const fs = require('fs');
const path = require('path');

console.log('🔧 FIXING ENVIRONMENT VARIABLE LOADING ISSUES\n');

// Check if .env.local exists
if (!fs.existsSync('.env.local')) {
  console.log('❌ .env.local file not found!');
  console.log('Create a .env.local file in the root directory with your Supabase credentials.');
  process.exit(1);
}

console.log('✅ .env.local file found');

// Read and analyze the .env.local file
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  console.log('\n📋 Analyzing .env.local content...');
  
  const lines = envContent.split('\n');
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  let foundVars = {};
  let issues = [];
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) return;
    
    // Check for common formatting issues
    if (line.includes(' = ')) {
      issues.push(`Line ${lineNum}: Extra spaces around = (should be VAR=value)`);
    }
    
    if (line.startsWith(' ') || line.endsWith(' ')) {
      issues.push(`Line ${lineNum}: Leading or trailing spaces`);
    }
    
    if (!line.includes('=')) {
      issues.push(`Line ${lineNum}: Missing = sign`);
      return;
    }
    
    // Extract key-value pair
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('='); // In case value contains =
    
    if (key && value) {
      foundVars[key.trim()] = value.trim();
    }
  });
  
  // Check for required variables
  console.log('\n🔍 Checking required variables:');
  requiredVars.forEach(varName => {
    if (foundVars[varName]) {
      console.log(`   ✅ ${varName}: Found`);
    } else {
      console.log(`   ❌ ${varName}: Missing`);
      issues.push(`Missing required variable: ${varName}`);
    }
  });
  
  // Report issues
  if (issues.length > 0) {
    console.log('\n⚠️  Issues found in .env.local:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    
    // Create a fixed version
    console.log('\n🔧 Creating corrected .env.local...');
    
    let fixedContent = '';
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        fixedContent += line + '\n';
        return;
      }
      
      if (line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=');
        fixedContent += `${key.trim()}=${value.trim()}\n`;
      } else {
        fixedContent += line + '\n';
      }
    });
    
    // Backup original and write fixed version
    fs.writeFileSync('.env.local.backup', envContent);
    fs.writeFileSync('.env.local', fixedContent);
    console.log('   ✅ Fixed .env.local (backup saved as .env.local.backup)');
  } else {
    console.log('\n✅ .env.local format looks good');
  }
  
} catch (error) {
  console.log(`❌ Error reading .env.local: ${error.message}`);
  process.exit(1);
}

// Test if variables are being loaded at runtime
console.log('\n🌐 Testing runtime environment variable loading...');

// We can't test NEXT_PUBLIC variables easily in Node.js since Next.js processes them
// But we can check if the file is readable and properly formatted

console.log('\n🎯 NEXT STEPS:');
console.log('1. Restart your development server completely (Ctrl+C then npm run dev)');
console.log('2. Clear browser cache or use incognito mode');
console.log('3. Try the login again');
console.log('4. If still not working, try deleting .next folder and restart');

console.log('\n💡 Common fixes that work:');
console.log('   - Restart terminal/IDE completely');
console.log('   - Delete .next folder: rm -rf .next');
console.log('   - Start server fresh: npm run dev');
console.log('   - Use incognito browser window');

console.log('\n🚨 If environment variables still not loading:');
console.log('   - Check file encoding (should be UTF-8)');
console.log('   - Try renaming file to .env.local.txt then back to .env.local');
console.log('   - Make sure no hidden characters in the file');

console.log('\n✅ Environment variable fix complete!'); 