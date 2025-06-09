# Gaming Perks Shop - Server Management Guide

## 🔥 **Emergency Commands - High CPU/Memory Issues**

### Analyze System Performance
```bash
# Check top CPU processes
ssh root@linux-1.freeinfantry.com "ps aux --sort=-%cpu | head -10"

# Check top memory processes  
ssh root@linux-1.freeinfantry.com "ps aux --sort=-%mem | head -10"

# Real-time system monitor
ssh root@linux-1.freeinfantry.com "top -bn1 | head -20"

# Memory and disk usage
ssh root@linux-1.freeinfantry.com "free -h && df -h"
```

### Kill High CPU Processes
```bash
# Kill specific process by PID
ssh root@linux-1.freeinfantry.com "kill -9 <PID>"

# Kill all Node processes (if needed)
ssh root@linux-1.freeinfantry.com "pkill -f node"

# Kill PM2 daemon completely
ssh root@linux-1.freeinfantry.com "pm2 kill"
```

---

## 🚀 **Deployment & Build Commands**

### Quick Fix Deployment (Local Build → Server)
```bash
# 1. Fix local build issues
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Build locally
npm run build

# 3. Commit and push changes
git add . && git commit -m "Your message" && git push origin main

# 4. Deploy to server
ssh root@linux-1.freeinfantry.com "pm2 stop gaming-perks-shop"
ssh root@linux-1.freeinfantry.com "rm -rf /var/www/gaming-perks-shop/.next"
scp -r .next root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && pm2 start gaming-perks-shop"
```

### Alternative Deployment (Server Build)
```bash
# Pull latest code and build on server
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git pull origin main && npm run build && pm2 restart gaming-perks-shop"
```

---

## 🔍 **Troubleshooting Commands**

### PM2 Management
```bash
# Check PM2 status
ssh root@linux-1.freeinfantry.com "pm2 status"

# View logs (live)
ssh root@linux-1.freeinfantry.com "pm2 logs gaming-perks-shop --lines 20"

# View error logs only
ssh root@linux-1.freeinfantry.com "tail -20 /root/.pm2/logs/gaming-perks-shop-error.log"

# View output logs only  
ssh root@linux-1.freeinfantry.com "tail -20 /root/.pm2/logs/gaming-perks-shop-out.log"

# Restart with environment reload
ssh root@linux-1.freeinfantry.com "pm2 restart gaming-perks-shop --update-env"

# Show detailed process info
ssh root@linux-1.freeinfantry.com "pm2 show gaming-perks-shop"
```

### Database Connection Issues
```bash
# Test Supabase connection
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && node -e \"const { createClient } = require('@supabase/supabase-js'); console.log('Testing connection...');\""

# Check environment variables
ssh root@linux-1.freeinfantry.com "pm2 env 0"
```

### Build Issues
```bash
# Check for missing dependencies
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && npm ls --depth=0"

# Install missing dependencies
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && npm install"

# Clear build cache
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && rm -rf .next && rm -rf node_modules/.cache"
```

---

## 🛠️ **Specific Problem Solutions**

### JSON Parsing Errors (Server-Status API)
```bash
# Check external API directly
ssh root@linux-1.freeinfantry.com "curl -s https://jovan-s.com/zonepop-raw.php | head -10"

# Test API timeout
ssh root@linux-1.freeinfantry.com "timeout 10 curl https://jovan-s.com/zonepop-raw.php"
```

### Memory Issues
```bash
# Restart with memory limits
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && NODE_OPTIONS='--max-old-space-size=1024' pm2 restart gaming-perks-shop"

# Check memory usage
ssh root@linux-1.freeinfantry.com "pm2 monit"
```

### File Permission Issues
```bash
# Fix ownership
ssh root@linux-1.freeinfantry.com "chown -R root:root /var/www/gaming-perks-shop"

# Fix permissions
ssh root@linux-1.freeinfantry.com "chmod -R 755 /var/www/gaming-perks-shop"
```

---

## 📁 **File Management**

### Copy Files to Server
```bash
# Copy specific file
scp src/app/api/server-status/route.ts root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/src/app/api/server-status/

# Copy entire directory
scp -r src/ root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/

# Copy with compression (faster)
scp -C -r .next root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
```

### Check Server Files
```bash
# List directory contents
ssh root@linux-1.freeinfantry.com "ls -la /var/www/gaming-perks-shop/src/lib/"

# Check file content
ssh root@linux-1.freeinfantry.com "cat /var/www/gaming-perks-shop/package.json"

# Check disk usage
ssh root@linux-1.freeinfantry.com "du -sh /var/www/gaming-perks-shop/*"
```

---

## 🔧 **Configuration Updates**

### Update Environment Variables
```bash
# Check current env
ssh root@linux-1.freeinfantry.com "cat /var/www/gaming-perks-shop/production.env"

# Update PM2 ecosystem config
scp ecosystem.config.js root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
```

### Git Operations on Server
```bash
# Reset server changes and pull latest
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git reset --hard HEAD && git pull origin main"

# Check git status
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && git status"
```

---

## 📊 **Monitoring Commands**

### Real-time Monitoring
```bash
# Live tail logs
ssh root@linux-1.freeinfantry.com "pm2 logs gaming-perks-shop"

# System resources
ssh root@linux-1.freeinfantry.com "htop"

# Network connections
ssh root@linux-1.freeinfantry.com "netstat -tulpn | grep :3000"
```

### Health Checks
```bash
# Test site response
curl -I https://freeinf.org

# Check if process is responding
ssh root@linux-1.freeinfantry.com "curl -I http://localhost:3000"

# Check PM2 process uptime
ssh root@linux-1.freeinfantry.com "pm2 status | grep gaming-perks-shop"
```

---

## 🆘 **Emergency Recovery**

### Complete Application Reset
```bash
# 1. Stop everything
ssh root@linux-1.freeinfantry.com "pm2 kill"

# 2. Clean build
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build

# 3. Full redeploy
ssh root@linux-1.freeinfantry.com "rm -rf /var/www/gaming-perks-shop/.next"
scp -r .next root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/
ssh root@linux-1.freeinfantry.com "cd /var/www/gaming-perks-shop && pm2 start ecosystem.config.js"
```

### Server Restart (Last Resort)
```bash
# Graceful reboot
ssh root@linux-1.freeinfantry.com "reboot"

# Check uptime after restart
ssh root@linux-1.freeinfantry.com "uptime"
```

---

## 📝 **Quick Reference**

| Problem | Quick Command |
|---------|---------------|
| High CPU | `ssh root@linux-1.freeinfantry.com "ps aux --sort=-%cpu \| head -5"` |
| Check logs | `ssh root@linux-1.freeinfantry.com "pm2 logs gaming-perks-shop --lines 10"` |
| Restart app | `ssh root@linux-1.freeinfantry.com "pm2 restart gaming-perks-shop"` |
| Deploy fix | `npm run build && scp -r .next root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/` |
| Stop errors | `ssh root@linux-1.freeinfantry.com "pm2 stop gaming-perks-shop"` |

**Server Details:**
- Host: `linux-1.freeinfantry.com` 
- User: `root`
- App Path: `/var/www/gaming-perks-shop`
- PM2 App Name: `gaming-perks-shop`
- Site URL: `https://freeinf.org` 