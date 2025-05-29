# 🚀 Gaming Perks Shop Deployment Guide

This repository includes automated deployment scripts to streamline your development workflow.

## 📁 Available Scripts

### 1. PowerShell Script (Windows)
```powershell
.\deploy.ps1 "Your commit message"
```

### 2. Bash Script (Linux/macOS)
```bash
./deploy.sh "Your commit message"
```

## 🎯 What These Scripts Do

1. **Check Git Status** - Shows you what files have changed
2. **Add Changes** - Runs `git add .` to stage all changes
3. **Commit** - Creates a commit with your message
4. **Push to GitHub** - Pushes to the main branch
5. **Build Test** - Runs `npm run build` to ensure everything compiles
6. **Server Commands** - Displays the commands to run on your production server

## 🔧 Usage Examples

### Basic Deployment
```bash
# PowerShell
.\deploy.ps1 "Fix squad invitation system"

# Bash
./deploy.sh "Fix squad invitation system"
```

### Skip Local Build
```bash
# PowerShell
.\deploy.ps1 "Quick fix" -SkipBuild

# Bash  
./deploy.sh "Quick fix" true
```

### Git Only (No Server Commands)
```bash
# PowerShell
.\deploy.ps1 "Update README" -LocalOnly

# Bash
./deploy.sh "Update README" false true
```

## 🖥️ Server Deployment

After running the script, you'll see these commands to run on your DigitalOcean server:

```bash
cd /var/www/gaming-perks-shop
git pull origin main
npm install
npm run build
pm2 restart gaming-perks-shop
```

## ⚡ Quick Setup

### Windows (PowerShell)
1. Make sure you can run PowerShell scripts:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
2. Run deployment:
   ```powershell
   .\deploy.ps1 "Your commit message"
   ```

### Linux/macOS (Bash)
1. Make script executable:
   ```bash
   chmod +x deploy.sh
   ```
2. Run deployment:
   ```bash
   ./deploy.sh "Your commit message"
   ```

## 🎮 Typical Workflow

1. **Make your changes** to the code
2. **Test locally** with `npm run dev`
3. **Deploy** with the script:
   ```bash
   .\deploy.ps1 "Enhanced squad invitation system with better UX"
   ```
4. **SSH to your server** and run the displayed commands
5. **Verify** your changes are live!

## 🛠️ Customization

You can modify the scripts to:
- Add automatic SSH deployment (uncomment the SSH section in `deploy.ps1`)
- Add pre-deployment tests
- Include database migrations
- Add Slack/Discord notifications
- Customize build processes

## 🔍 Troubleshooting

**Script won't run?**
- Windows: Check PowerShell execution policy
- Linux/macOS: Ensure script has execute permissions (`chmod +x deploy.sh`)

**Git errors?**
- Make sure you're in the correct directory
- Check if you have uncommitted changes
- Verify your GitHub credentials are set up

**Build failures?**
- Check `npm install` worked correctly
- Look for TypeScript errors in the output
- Ensure all environment variables are set

## 📝 Current Squad System Deployment

The latest deployment includes:
- ✅ Fixed squad invitation display logic
- ✅ Separate UI for join requests vs invitations  
- ✅ Better UX with "REQUEST PENDING" badges
- ✅ Proper withdrawal functionality
- ✅ Enhanced debugging and error handling

Don't forget to apply the RLS policy fixes in Supabase after deployment! 