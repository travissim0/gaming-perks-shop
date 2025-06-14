// Environment Setup Checker
// Run this to diagnose environment variable issues

console.log('🔍 Checking Development Environment Setup...\n');

// Check if .env.local exists
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');
const envExists = fs.existsSync(envPath);

console.log(`📁 .env.local file: ${envExists ? '✅ Found' : '❌ Missing'}`);

if (envExists) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    console.log(`📊 Environment variables found: ${lines.length}`);
    console.log('\n🔐 Environment Variables:');
    
    // Check required variables
    const requiredVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    const foundVars = {};
    lines.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        foundVars[key.trim()] = value.trim();
      }
    });
    
    requiredVars.forEach(varName => {
      const exists = foundVars[varName];
      const status = exists ? '✅' : '❌';
      const preview = exists ? `(${exists.substring(0, 20)}...)` : '(missing)';
      console.log(`   ${status} ${varName} ${preview}`);
    });
    
    // Check if variables are accessible in process.env
    console.log('\n🌐 Runtime Environment Check:');
    requiredVars.forEach(varName => {
      const runtimeValue = process.env[varName];
      const status = runtimeValue ? '✅' : '❌';
      const preview = runtimeValue ? `(${runtimeValue.substring(0, 20)}...)` : '(not loaded)';
      console.log(`   ${status} ${varName} ${preview}`);
    });
    
  } catch (error) {
    console.error('❌ Error reading .env.local:', error.message);
  }
} else {
  console.log('\n📝 .env.local file is missing!');
  console.log('Create a .env.local file in the root directory with:');
  console.log(`
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
`);
}

// Check package.json
const packagePath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(packagePath)) {
  console.log('\n📦 Package.json: ✅ Found');
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(`   Project: ${pkg.name || 'Unknown'}`);
    console.log(`   Scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
  } catch (error) {
    console.log('   ⚠️ Could not parse package.json');
  }
} else {
  console.log('\n📦 Package.json: ❌ Missing');
}

// Check node_modules
const nodeModulesPath = path.join(process.cwd(), 'node_modules');
const nodeModulesExists = fs.existsSync(nodeModulesPath);
console.log(`\n📚 Node modules: ${nodeModulesExists ? '✅ Installed' : '❌ Missing - run npm install'}`);

console.log('\n🎯 Next Steps:');
if (!envExists) {
  console.log('1. ❌ Create .env.local file in root directory');
} else {
  console.log('1. ✅ .env.local file exists');
}

if (!nodeModulesExists) {
  console.log('2. ❌ Run: npm install');
} else {
  console.log('2. ✅ Dependencies installed');
}

console.log('3. 🔄 Restart development server: npm run dev');
console.log('4. 🌐 Open: http://localhost:3000');

console.log('\n💡 If issues persist:');
console.log('- Check .env.local is in the ROOT directory (same level as package.json)');
console.log('- Ensure no extra spaces in environment variable names');
console.log('- Try restarting your terminal/IDE');
console.log('- Check for typos in variable names'); 