# Quick Guide: Adding a New Zone

## TL;DR - 3 Easy Steps

### 1. Edit `zones-config.json`

Add your new zone to the `zones` array:

```json
{
  "key": "yourkey",
  "name": "Category - Zone Name",
  "directory": "Category - Zone Name"
}
```

### 2. Copy to public & Deploy

```bash
# Windows (local development)
Copy-Item zones-config.json public/zones-config.json

# Deploy to server
scp -i "C:\Users\Travis\.ssh\id_rsa" zones-config.json root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/zones-config.json
scp -i "C:\Users\Travis\.ssh\id_rsa" public/zones-config.json root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/public/zones-config.json
```

### 3. Done! 🎉

Your new zone will automatically appear in the admin panel with full start/stop/restart functionality.

---

## Hiding a Zone (Without Deleting)

If you want to hide a zone from the admin panel but keep it on the server, add it to the filter list in `zone-manager.sh`:

```bash
# Edit line 166 in zone-manager.sh
"BIN"|"Blobs"|"Global"|"assets"|"net8.0"|"TEST ZONES"|"Your Zone Name Here")
```

Then redeploy zone-manager.sh:

```bash
scp -i "C:\Users\Travis\.ssh\id_rsa" zone-manager.sh root@linux-1.freeinfantry.com:/var/www/gaming-perks-shop/zone-manager.sh
```

---

## Current Zones

| Key | Zone Name |
|-----|-----------|
| `ctf` | CTF - Twin Peaks 2.0 |
| `tp` | CTF - Twin Peaks Classic |
| `usl` | League - USL Matches |
| `usl2` | League - USL Secondary |
| `skMini` | Skirmish - Minimaps |
| `grav` | Sports - GravBall |
| `arena` | Arcade - The Arena |
| `zz` | Bots - Zombie Zone |

---

## Benefits of the New System

✅ **No code changes needed** - Just edit JSON  
✅ **Centralized configuration** - One file for everything  
✅ **Automatic discovery** - Zones not in config still work with auto-generated keys  
✅ **Filtering support** - Hide test/development zones easily  
✅ **Both frontend and backend** read from same config  

See `ZONES_CONFIGURATION_README.md` for complete documentation.

