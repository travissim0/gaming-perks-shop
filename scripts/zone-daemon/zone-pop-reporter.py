#!/usr/bin/env python3
"""
Zone population reporter.

Runs on a zone host (via cron, ~every minute). Asks the website for the active
zone list, UDP-pings each zone's live-count port (game port + 1), and reports the
real player counts back to the website, which stores them in Supabase.

This is the robust replacement for the jovan-s.com/zonepop-raw.php scraper, whose
counts read 0 post-migration. A zone's count is only obtainable by pinging its
port+1 (the same thing the game launcher does) from a host that can reach it.

Only depends on the Python 3 standard library. Configure via environment:
    POP_SITE_URL     e.g. https://freeinf.org        (required)
    POP_CRON_SECRET  the site's CRON_SECRET value      (required)
    POP_TIMEOUT      per-zone UDP timeout seconds       (optional, default 2.0)

Cron example (every minute):
    * * * * * POP_SITE_URL=https://freeinf.org POP_CRON_SECRET=xxxx \
        /usr/bin/python3 /home/travis/infantry/scripts/zone-pop-reporter.py >> /tmp/zone-pop.log 2>&1
"""

import json
import os
import socket
import struct
import sys
import urllib.request

SITE_URL = os.environ.get("POP_SITE_URL", "").rstrip("/")
CRON_SECRET = os.environ.get("POP_CRON_SECRET", "")
TIMEOUT = float(os.environ.get("POP_TIMEOUT", "2.0"))
PING_TOKEN = b"\x2a\x00\x00\x00"  # arbitrary 4-byte token; the zone echoes it back


def fail(msg):
    print(f"[zone-pop] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def http_json(method, path, payload=None):
    url = f"{SITE_URL}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {CRON_SECRET}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def ping_zone(ip, game_port):
    """Send the 4-byte token to game_port+1, read back int32 count (LE). None on timeout."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(TIMEOUT)
    try:
        s.sendto(PING_TOKEN, (ip, game_port + 1))
        data, _ = s.recvfrom(64)
        if len(data) >= 4:
            return struct.unpack_from("<i", data, 0)[0]
        return None
    except (socket.timeout, OSError):
        return None
    finally:
        s.close()


def main():
    if not SITE_URL or not CRON_SECRET:
        fail("set POP_SITE_URL and POP_CRON_SECRET")

    try:
        targets = http_json("GET", "/api/cron/zone-targets").get("zones", [])
    except Exception as e:  # noqa: BLE001
        fail(f"could not fetch zone targets: {e}")

    reported = []
    for z in targets:
        ip, port, title = z.get("ip"), z.get("port"), z.get("title")
        if not ip or not port or not title:
            continue
        count = ping_zone(ip, int(port))
        reported.append({"title": title, "ip": ip, "port": int(port), "count": count if count is not None else 0})

    try:
        res = http_json("POST", "/api/cron/report-zone-population", {"zones": reported})
    except Exception as e:  # noqa: BLE001
        fail(f"could not post report: {e}")

    total = res.get("total", 0)
    live = ", ".join(f"{r['title']}={r['count']}" for r in reported if r["count"] > 0) or "(all zero)"
    print(f"[zone-pop] reported {len(reported)} zones, total {total} players: {live}")


if __name__ == "__main__":
    main()
