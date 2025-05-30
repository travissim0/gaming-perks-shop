# 🔄 Patch Notes Sync System

**Automatically sync patch notes from your Infantry Online game server to your website.**

## Quick Start (Production)

1. **Upload files to your Linux server:**
   - `sync-patch-notes.sh`
   - `setup-patch-sync.sh`

2. **Run the setup:**
   ```bash
   sudo ./setup-patch-sync.sh
   ```

3. **That's it!** Your patch notes will now automatically sync every 2 minutes.

## 📁 Files

- **`sync-patch-notes.sh`** - Main sync script that copies game file when changed
- **`setup-patch-sync.sh`** - One-time setup script that configures everything
- **`PATCH_SYNC_DEPLOYMENT.md`** - Complete deployment and troubleshooting guide

## ⚙️ How It Works

1. **Game Server**: `/root/Infantry/Zones/CTF - Twin Peaks 2.0/assets/ctfpl.nws`
2. **Sync Script**: Checks every 2 minutes if game file has changed
3. **Web Copy**: `/var/www/gaming-perks-shop/public/ctfpl.nws`
4. **API**: Next.js reads from synced file automatically

## 🔍 Quick Commands

```bash
# View sync logs
tail -f /var/www/gaming-perks-shop/logs/patch-sync.log

# Manual sync
sync-patch-notes

# Check status
ls -la /var/www/gaming-perks-shop/public/ctfpl.nws
```

## 📖 Full Documentation

See **`PATCH_SYNC_DEPLOYMENT.md`** for complete setup instructions, troubleshooting, and configuration options.

---

**Benefits:**
- ✅ Zero manual work after setup
- ✅ Instant patch note updates on website
- ✅ No game performance impact
- ✅ Automatic backups and error handling 