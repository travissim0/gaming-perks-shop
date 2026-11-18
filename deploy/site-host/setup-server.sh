#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 OVH VPS that will host freeinf.org.
#
# Usage (as root, from a copy of this folder on the server):
#   bash setup-server.sh "<public key the GitHub deploy job will use>"
#
# Safe to re-run. It does NOT start the site (that happens on the first deploy) and
# does NOT enable the cron timer (see README: turn the old scheduler off first).
set -euo pipefail

DEPLOY_PUBKEY="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root."; exit 1; fi
if [ -z "$DEPLOY_PUBKEY" ]; then echo "Pass the deploy public key as the first argument."; exit 1; fi

echo "== Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl ca-certificates gnupg ufw unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https

echo "== Node 22 LTS"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi
node -v

echo "== Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
cp "$HERE/Caddyfile" /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

echo "== Swap (builds happen in GitHub Actions, this is just a cushion)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== web user + deploy key"
id web >/dev/null 2>&1 || useradd --create-home --shell /bin/bash web
install -d -m 700 -o web -g web /home/web/.ssh
touch /home/web/.ssh/authorized_keys
grep -qxF "$DEPLOY_PUBKEY" /home/web/.ssh/authorized_keys || echo "$DEPLOY_PUBKEY" >> /home/web/.ssh/authorized_keys
chown web:web /home/web/.ssh/authorized_keys && chmod 600 /home/web/.ssh/authorized_keys

# The deploy job may restart the site and nothing else.
cat > /etc/sudoers.d/freeinf-web <<'EOF'
web ALL=(root) NOPASSWD: /usr/bin/systemctl restart freeinf-site
EOF
chmod 440 /etc/sudoers.d/freeinf-web
visudo -cf /etc/sudoers.d/freeinf-web

echo "== Directories + env file"
install -d -o web -g web /srv/freeinf /srv/freeinf/releases
install -d -m 750 -o root -g web /etc/freeinf
if [ ! -f /etc/freeinf/site.env ]; then
  install -m 640 -o root -g web "$HERE/site.env.example" /etc/freeinf/site.env
  echo "   Created /etc/freeinf/site.env from the template: FILL IT IN before the first deploy."
fi

echo "== systemd units"
cp "$HERE/freeinf-site.service" /etc/systemd/system/
cp "$HERE/freeinf-cron@.service" /etc/systemd/system/
cp "$HERE"/freeinf-cron@*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable freeinf-site

echo "== Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== SSH: key-only login (only if root already has a key, so you can't lock yourself out)"
if [ -s /root/.ssh/authorized_keys ]; then
  cat > /etc/ssh/sshd_config.d/10-freeinf.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh
else
  echo "   Skipped: /root/.ssh/authorized_keys is empty. Add your key, then re-run."
fi

echo
echo "Done. Next: fill /etc/freeinf/site.env, add the GitHub secrets, run the 'Deploy site (OVH)' workflow."
