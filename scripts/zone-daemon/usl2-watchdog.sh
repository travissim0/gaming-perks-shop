#!/bin/bash
# usl2-watchdog.sh - intent-aware self-heal for "USL - KS10" (zoneid 120) on Server A.
#
# Why this exists:
#   usl2 is hosted on Server A (droplet) because Server B's OVH edge firewall won't
#   allow opening new ports for it. Nothing else on A auto-restarts zones, so this
#   cron watchdog gives usl2 reboot + crash persistence.
#
# Intent-aware (the important part):
#   The first version blindly relaunched usl2 whenever its screen was gone. That made
#   the admin "Stop" button useless (the zone came back within 60s) and, worse, it
#   resurrected A's copy while you were moving zoneid 120 to another server - two
#   instances then fight over the single game-DB login (each kicks the other), which
#   looks like flapping / "superseding the DB connection".
#
#   So before relaunching, we ask the SAME control plane the admin page uses
#   (Supabase zone_commands) what the last explicit intent for this zone on THIS
#   server was:
#     last intent = stop            -> leave it DOWN (you stopped it on purpose)
#     last intent = start / restart -> a missing screen is a crash: relaunch
#     no command on record          -> default to relaunch (preserve crash recovery)
#
#   Net effect: admin "Stop" now sticks; admin "Start" (or a real crash) brings it
#   back; moving zoneid 120 to another server no longer makes A fight it.
#   To take usl2 off A:  click Stop in /admin/zones  (this now sticks).
#   To bring it back on A: click Start in /admin/zones.
#
# Deploy to: /opt/infantry/scripts/usl2-watchdog.sh  (chmod +x)
# crontab (travis):
#   @reboot sleep 45 && /opt/infantry/scripts/usl2-watchdog.sh >> /tmp/usl2-watchdog.log 2>&1
#   * * * * *          /opt/infantry/scripts/usl2-watchdog.sh >> /tmp/usl2-watchdog.log 2>&1
export PATH=/usr/bin:/bin:$PATH

DIR="/opt/infantry/League - USL Matches2"
TAG="usl2"
HOST_KEY="serverA"
CONF="/opt/infantry/scripts/zone-daemon.conf"
STATE="/tmp/usl2-watchdog.state"

stamp() { date '+%F %T'; }
# Log only when the decision changes, so the every-minute cron does not grow the log.
note() {
  local msg="$1"
  [ "$(cat "$STATE" 2>/dev/null)" = "$msg" ] && return 0
  echo "$msg" > "$STATE"
  echo "$(stamp) $msg"
}

# Already up? nothing to do.
if screen -ls 2>/dev/null | grep -qE "[0-9]+\.${TAG}[[:space:]]"; then
  note "up"
  exit 0
fi

# Screen is gone. Consult admin intent before assuming it was a crash.
intent="start"   # default: no record -> preserve crash-recovery behavior
if [ -r "$CONF" ]; then
  URL=$(grep -E '^SUPABASE_URL=' "$CONF" | head -1 | cut -d'"' -f2)
  KEY=$(grep -E '^SUPABASE_SERVICE_KEY=' "$CONF" | head -1 | cut -d'"' -f2)
  if [ -n "$URL" ] && [ -n "$KEY" ]; then
    q="zone_commands?zone=eq.${TAG}&host=eq.${HOST_KEY}&action=in.(start,stop,restart)&order=created_at.desc&limit=1&select=action"
    last=$(curl -s --max-time 10 -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "${URL}/rest/v1/${q}" | jq -r '.[0].action // empty' 2>/dev/null)
    [ -n "$last" ] && intent="$last"
  fi
fi

if [ "$intent" = "stop" ]; then
  note "down: last admin intent was 'stop' - leaving it stopped"
  exit 0
fi

cd "$DIR" && screen -dmS "$TAG" dotnet ZoneServer.dll
echo "$(stamp) relaunched $TAG (last intent: $intent)"
echo "relaunched" > "$STATE"
