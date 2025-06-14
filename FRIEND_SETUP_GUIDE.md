# 🚀 Friend Setup Guide - Gaming Perks Shop

## Quick Setup for Development

### **Step 1: Verify File Placement**
Make sure your `.env.local` file is in the **ROOT** directory of the project (same level as `package.json`), not in any subfolder.

```
gaming-perks-shop/
├── .env.local          ← Should be here!
├── package.json
├── src/
├── public/
└── ...
```

### **Step 2: Check Environment Variables**
Run this command to verify your setup:
```bash
node check-env-setup.js
```

### **Step 3: Required Environment Variables**
Your `.env.local` file should contain (no extra spaces!):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### **Step 4: Install Dependencies**
```bash
npm install
```

### **Step 5: Start Development Server**
```bash
npm run dev
```

## 🔧 Troubleshooting

### **Error: "supabaseUrl is required"**
- ✅ Check `.env.local` is in root directory
- ✅ Check no extra spaces around `=` signs
- ✅ Restart terminal/IDE after adding .env.local
- ✅ Try restarting dev server

### **Error: "Cannot find module"**
```bash
npm install
```

### **Port Already in Use**
If port 3000 is busy:
```bash
npm run dev -- -p 3001
```

### **Still Not Working?**
1. **Delete `.next` folder** and restart:
   ```bash
   rm -rf .next
   npm run dev
   ```

2. **Check file encoding** - Make sure `.env.local` is saved as UTF-8

3. **Verify you're in the right directory**:
   ```bash
   ls -la
   # Should see package.json and .env.local
   ```

## 🎯 Quick Test
Once running, go to `http://localhost:3000` and:
1. Try to visit the homepage
2. Try to register/login
3. Check browser console for any errors

## 🐛 Wrong Interface Showing? (Tournament/Matches instead of main site)

If you're seeing a different interface than expected:

### **Quick Fix (Try this first):**
```bash
# Run the auto-fix script
.\fix-dev-environment.ps1
```

### **Manual Fix:**
```bash
# 1. Stop the server (Ctrl+C)
# 2. Delete build cache
rm -rf .next
# 3. Clear npm cache  
npm cache clean --force
# 4. Reinstall dependencies
npm install
# 5. Start fresh
npm run dev
```

### **Still Wrong Interface?**
1. **Check you're in the right folder** - should be `gaming-perks-shop`
2. **Check git branch**: `git branch` (should be on `main` or `master`)
3. **Check package.json** - project name should include `gaming-perks`
4. **Try a different port**: `npm run dev -- -p 3001`
5. **Use incognito browser window**

## 🆘 If All Else Fails
1. **Run diagnostic**: `node diagnose-friend-issue.js`
2. **Double-check the .env.local file contents** with the original sender
3. **Try clearing browser cache**
4. **Use incognito/private browsing mode**
5. **Share the diagnostic output**

---
**Need help?** Share the output of `node diagnose-friend-issue.js`! 