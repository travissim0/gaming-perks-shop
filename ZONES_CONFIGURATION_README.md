# Zone Configuration Guide

## Overview

Zone configuration is centralized in `zones-config.json` to make it easy to add, modify, or remove zones without hardcoding them in multiple places.

## Adding a New Zone

To add a new zone, simply edit the `zones-config.json` file:

### 1. Edit `zones-config.json`

Add a new entry to the `zones` array:

```json
{
  "key": "newzone",
  "name": "Category - Zone Name",
  "directory": "Category - Zone Name"
}
```

**Fields:**
- `key`: Short identifier used for APIs and internal references (e.g., "ctf", "usl", "zz")
- `name`: Full display name that matches the zone folder name exactly
- `directory`: The folder name inside `/root/Infantry/Zones/` (usually matches `name`)

### 2. Deploy to Server

After editing `zones-config.json`, run:

```bash
# Copy to public directory (for Next.js frontend)
Copy-Item zones-config.json public/zones-config.json

# Deploy to server
scp -i "C:\Users\Travis\.ssh\id_rsa" zones-config.json root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/zones-config.json

scp -i "C:\Users\Travis\.ssh\id_rsa" zone-manager.sh root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/zone-manager.sh

scp -i "C:\Users\Travis\.ssh\id_rsa" public/zones-config.json root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/public/zones-config.json
```

### 3. Verify

- Restart your Next.js application (if needed)
- The new zone should appear in the admin zones page
- You should be able to start/stop/restart it immediately

## Example: Adding a New Zone

Let's say you want to add a new zone called "Deathmatch - Chaos Arena":

1. **Create the zone folder on the server:**
   ```bash
   mkdir "/root/Infantry/Zones/Deathmatch - Chaos Arena"
   # Copy zone files, settings, etc.
   ```

2. **Edit `zones-config.json`:**
   ```json
   {
     "zones": [
       // ... existing zones ...
       {
         "key": "dm",
         "name": "Deathmatch - Chaos Arena",
         "directory": "Deathmatch - Chaos Arena"
       }
     ],
     "zones_dir": "/root/Infantry/Zones"
   }
   ```

3. **Deploy** (see step 2 above)

4. **Done!** The zone will automatically appear in the admin panel.

## Removing a Zone

Simply delete the zone entry from `zones-config.json` and redeploy. The zone folder will remain on the server but won't be managed through the admin panel.

## Benefits

✅ **No Code Changes**: Add zones without modifying TypeScript or bash scripts  
✅ **Single Source of Truth**: Configuration is in one place  
✅ **Automatic Updates**: Both frontend and backend read from the same config  
✅ **Easy Maintenance**: Simple JSON format that anyone can edit

## Requirements

- Server must have `jq` installed: `apt-get install jq`
- Zone folder names must match exactly between config and filesystem
- Zone keys should be short, unique, and URL-safe (lowercase, no spaces)

