#!/usr/bin/env python3
"""
Zone population reporter.

Runs on a zone host (via cron, ~every minute). Works out which zones are live on
this host, UDP-pings each zone's live-count port (game port + 1), and reports the
real player counts back to the website, which stores them in Supabase.

Zone discovery is LOCAL by default: every running ZoneServer process is found via
/proc, its working directory read, and the zone's title + port taken from that
folder's server.xml (<zoneName> / <bindPort>). This deliberately does NOT go
through the game database — the backend moved to SQLite (2026-08), which must
only ever be opened by local apps, so the website can no longer look zones up
remotely. Local discovery is also immune to the game server changing IP.

The old path (GET /api/cron/zone-targets, which reads the game DB) is kept as a
fallback for hosts where /proc discovery finds nothing, and is non-fatal.

Only depends on the Python 3 standard library. Configure via environment:
    POP_SITE_URL     e.g. https://www.freeinf.org      (required)
    POP_CRON_SECRET  the site's CRON_SECRET value      (required)
    POP_TIMEOUT      per-zone UDP timeout seconds      (optional, default 2.0)
    POP_SOURCE       local | remote | auto             (optional, default auto)
    POP_ZONES_BASE   only report zones under this dir  (optional)

Cron example (every minute):
    * * * * * POP_SITE_URL=https://www.freeinf.org POP_CRON_SECRET=xxxx \
        /usr/bin/python3 /home/freeinfantry/zones/scripts/zone-pop-reporter.py >> /tmp/zone-pop.log 2>&1
"""

import json
import os
import re
import socket
import struct
import sys
import urllib.request

SITE_URL = os.environ.get("POP_SITE_URL", "").rstrip("/")
CRON_SECRET = os.environ.get("POP_CRON_SECRET", "")
TIMEOUT = float(os.environ.get("POP_TIMEOUT", "2.0"))
SOURCE = os.environ.get("POP_SOURCE", "auto").strip().lower()
ZONES_BASE = os.environ.get("POP_ZONES_BASE", "").rstrip("/")
PING_TOKEN = b"\x2a\x00\x00\x00"  # arbitrary 4-byte token; the zone echoes it back

# server.xml is hand-edited and not always well-formed enough for a strict XML
# parse, so pull the two values we need with a regex instead.
_VALUE_RE = r'<{tag}\s+value="([^"]*)"'


def fail(msg):
    print(f"[zone-pop] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f"[zone-pop] WARN: {msg}", file=sys.stderr)


def http_json(method, path, payload=None):
    url = f"{SITE_URL}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {CRON_SECRET}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def read_server_xml(zone_dir):
    """Return (title, port, bind_ip) from a zone folder's server.xml, or None."""
    path = os.path.join(zone_dir, "server.xml")
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            xml = fh.read()
    except OSError:
        return None
    title = re.search(_VALUE_RE.format(tag="zoneName"), xml)
    port = re.search(_VALUE_RE.format(tag="bindPort"), xml)
    bind_ip = re.search(_VALUE_RE.format(tag="bindIP"), xml)
    if not title or not port:
        return None
    try:
        port = int(port.group(1))
    except ValueError:
        return None
    title = title.group(1).strip()
    if not title or port <= 0:
        return None
    return title, port, (bind_ip.group(1).strip() if bind_ip else "")


def discover_local_zones():
    """Every running ZoneServer on this host -> {title, ip, port}, from /proc."""
    zone_dirs = set()
    try:
        pids = [p for p in os.listdir("/proc") if p.isdigit()]
    except OSError:
        return []
    for pid in pids:
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as fh:
                cmdline = fh.read().decode("utf-8", "replace")
            if "ZoneServer.dll" not in cmdline:
                continue
            cwd = os.path.realpath(f"/proc/{pid}/cwd")
        except (OSError, PermissionError):
            continue  # another user's process, or it exited mid-scan
        if not cwd or cwd == "/":
            continue
        if ZONES_BASE and not cwd.startswith(ZONES_BASE + "/") and cwd != ZONES_BASE:
            continue
        zone_dirs.add(cwd)

    zones = []
    for zone_dir in sorted(zone_dirs):
        parsed = read_server_xml(zone_dir)
        if not parsed:
            warn(f"no usable zoneName/bindPort in {zone_dir}/server.xml")
            continue
        title, port, bind_ip = parsed
        # Ping over loopback: it always works from the host itself and does not
        # depend on the box's public IP (which changes) or the edge firewall.
        zones.append({"title": title, "ip": "127.0.0.1", "port": port, "bind_ip": bind_ip})
    return zones


def fetch_remote_zones():
    targets = http_json("GET", "/api/cron/zone-targets").get("zones", [])
    zones = []
    for z in targets:
        ip, port, title = z.get("ip"), z.get("port"), z.get("title")
        if not ip or not port or not title:
            continue
        zones.append({"title": title, "ip": ip, "port": int(port), "bind_ip": ""})
    return zones


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
    if SOURCE not in ("auto", "local", "remote"):
        fail(f"POP_SOURCE must be auto, local or remote (got {SOURCE!r})")

    zones, origin = [], ""
    if SOURCE in ("auto", "local"):
        zones = discover_local_zones()
        origin = "local"
    if not zones and SOURCE in ("auto", "remote"):
        try:
            zones = fetch_remote_zones()
            origin = "remote"
        except Exception as e:  # noqa: BLE001
            # The remote list needs the game DB, which may well be gone. Only
            # fatal if we have nothing of our own to report.
            if SOURCE == "remote":
                fail(f"could not fetch zone targets: {e}")
            warn(f"zone-targets unavailable ({e}); no local zones either")
    if not zones:
        fail("no zones found to report")

    reported = []
    for z in zones:
        count = ping_zone(z["ip"], z["port"])
        # A zone can bind its responder to the advertised IP rather than 0.0.0.0.
        if count is None and z.get("bind_ip") and z["bind_ip"] != z["ip"]:
            count = ping_zone(z["bind_ip"], z["port"])
        reported.append(
            {"title": z["title"], "ip": z["ip"], "port": z["port"], "count": count if count is not None else 0}
        )

    try:
        res = http_json("POST", "/api/cron/report-zone-population", {"zones": reported})
    except Exception as e:  # noqa: BLE001
        fail(f"could not post report: {e}")

    total = res.get("total", 0)
    live = ", ".join(f"{r['title']}={r['count']}" for r in reported if r["count"] > 0) or "(all zero)"
    print(f"[zone-pop] reported {len(reported)} {origin} zones, total {total} players: {live}")


if __name__ == "__main__":
    main()
