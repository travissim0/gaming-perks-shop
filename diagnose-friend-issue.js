// Comprehensive Development Environment Diagnostic
// Run this to figure out what's going wrong

const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE DIAGNOSTIC FOR DEVELOPMENT ISSUES\n');
console.log('=' * 60);

// 1. Check Current Directory
console.log('\n1. 📁 DIRECTORY CHECK');
console.log(`Current directory: ${process.cwd()}`);
console.log(`Directory name: ${path.basename(process.cwd())}`);

// List key files
const keyFiles = ['.env.local', 'package.json', 'next.config.ts', 'next.config.js'];
keyFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✅' : '❌'} ${file}`);
});

// 2. Check Environment Variables
console.log('\n2. 🌐 ENVIRONMENT VARIABLES');
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

let envIssues = [];
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`   ✅ ${varName}: ${value.substring(0, 30)}...`);
  } else {
    console.log(`   ❌ ${varName}: MISSING`);
    envIssues.push(varName);
  }
});

// 3. Check .env.local file specifically
console.log('\n3. 📋 .ENV.LOCAL FILE CHECK');
if (fs.existsSync('.env.local')) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    console.log(`   File exists with ${lines.length} variables`);
    
    // Check for common issues
    const issues = [];
    lines.forEach((line, index) => {
      if (line.includes(' = ')) issues.push(`Line ${index + 1}: Extra spaces around =`);
      if (line.startsWith(' ') || line.endsWith(' ')) issues.push(`Line ${index + 1}: Leading/trailing spaces`);
      if (!line.includes('=')) issues.push(`Line ${index + 1}: Missing = sign`);
    });
    
    if (issues.length > 0) {
      console.log('   ⚠️  Issues found:');
      issues.forEach(issue => console.log(`      - ${issue}`));
    } else {
      console.log('   ✅ File format looks good');
    }
  } catch (error) {
    console.log(`   ❌ Error reading file: ${error.message}`);
  }
} else {
  console.log('   ❌ .env.local file not found');
}

// 4. Check package.json and dependencies
console.log('\n4. 📦 PACKAGE.JSON & DEPENDENCIES');
if (fs.existsSync('package.json')) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log(`   Project: ${pkg.name}`);
    console.log(`   Version: ${pkg.version}`);
    console.log(`   Scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
    
    // Check if it's the right project
    const isCorrectProject = pkg.name && (
      pkg.name.includes('gaming-perks') || 
      pkg.name.includes('infantry') ||
      pkg.dependencies?.['@supabase/supabase-js']
    );
    
    if (isCorrectProject) {
      console.log('   ✅ Appears to be the correct project');
    } else {
      console.log('   ⚠️  This might not be the correct project');
    }
    
  } catch (error) {
    console.log(`   ❌ Error reading package.json: ${error.message}`);
  }
} else {
  console.log('   ❌ package.json not found');
}

// 5. Check node_modules
console.log('\n5. 📚 NODE_MODULES CHECK');
const nodeModulesExists = fs.existsSync('node_modules');
console.log(`   Node modules: ${nodeModulesExists ? '✅ Present' : '❌ Missing'}`);

if (nodeModulesExists) {
  const supabaseExists = fs.existsSync('node_modules/@supabase');
  const nextExists = fs.existsSync('node_modules/next');
  console.log(`   Supabase: ${supabaseExists ? '✅' : '❌'}`);
  console.log(`   Next.js: ${nextExists ? '✅'  : '❌'}`);
}

// 6. Check for build files
console.log('\n6. 🏗️  BUILD FILES CHECK');
const buildFiles = ['.next', 'dist', 'build'];
buildFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${file}: ${exists ? '✅ Present' : '❌ Not found'}`);
});

// 7. Check git status
console.log('\n7. 🔄 GIT STATUS');
if (fs.existsSync('.git')) {
  console.log('   ✅ Git repository found');
  // We can't easily check git status from here without exec, but we can check if it's a repo
} else {
  console.log('   ❌ Not a git repository');
}

// 8. Check for port conflicts
console.log('\n8. 🌐 DEVELOPMENT SERVER INFO');
console.log('   Default Next.js port: 3000');
console.log('   Check if running: http://localhost:3000');
console.log('   Alternative ports: 3001, 3002, 8000, 8080');

// 9. Generate fix recommendations
console.log('\n9. 🎯 RECOMMENDATIONS');
let recommendations = [];

if (envIssues.length > 0) {
  recommendations.push('❌ Fix missing environment variables');
}

if (!fs.existsSync('node_modules')) {
  recommendations.push('❌ Run: npm install');
}

if (fs.existsSync('.next')) {
  recommendations.push('🔄 Try deleting .next folder and restart');
}

if (!fs.existsSync('.env.local')) {
  recommendations.push('❌ Create .env.local file in root directory');
}

if (recommendations.length === 0) {
  recommendations.push('✅ Environment looks good - check browser and network');
}

recommendations.forEach((rec, index) => {
  console.log(`   ${index + 1}. ${rec}`);
});

// 10. Next steps
console.log('\n10. 🚀 NEXT STEPS TO TRY:');
console.log('   1. Stop the dev server (Ctrl+C)');
console.log('   2. Delete .next folder: rm -rf .next (or delete manually)');
console.log('   3. Clear npm cache: npm cache clean --force');
console.log('   4. Reinstall: npm install');
console.log('   5. Start fresh: npm run dev');
console.log('   6. Open browser in incognito mode');
console.log('   7. Go to: http://localhost:3000');

console.log('\n11. 🐛 IF STILL SHOWING WRONG INTERFACE:');
console.log('   - Check you\'re on the right branch: git branch');
console.log('   - Check you\'re in the right project folder');
console.log('   - Compare package.json with the working version');
console.log('   - Check browser console for JavaScript errors (F12)');

console.log('\n' + '=' * 60);
console.log('📤 SHARE THIS OUTPUT WITH THE PROJECT OWNER');
console.log('=' * 60); 