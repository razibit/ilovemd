#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

install -d -m 0755 /opt/ilovemd
install -d -m 0700 /etc/ilovemd

if ! id ilovemd >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /var/lib/ilovemd --shell /usr/sbin/nologin ilovemd
fi

if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 0600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git jq
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y --no-install-recommends nodejs

install -d -m 0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  > /etc/apt/sources.list.d/cloudflared.list
apt-get update
apt-get install -y --no-install-recommends cloudflared

if [[ ! -d /opt/ilovemd/app/.git ]]; then
  git clone --depth 1 https://github.com/razibit/ilovemd.git /opt/ilovemd/app
fi

cd /opt/ilovemd/app
npm ci
chown -R ilovemd:ilovemd /opt/ilovemd/app /var/lib/ilovemd
npx playwright install-deps chromium
runuser -u ilovemd -- env PLAYWRIGHT_BROWSERS_PATH=/var/lib/ilovemd/.cache/ms-playwright \
  npx playwright install chromium

cat > /etc/systemd/system/ilovemd-export.service <<'UNIT'
[Unit]
Description=iLoveMD export engine
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ilovemd
Group=ilovemd
WorkingDirectory=/opt/ilovemd/app
EnvironmentFile=/etc/ilovemd/export.env
Environment=HOST=127.0.0.1
Environment=PORT=4174
Environment=FOLIO_MAX_CONCURRENCY=1
Environment=PLAYWRIGHT_BROWSERS_PATH=/var/lib/ilovemd/.cache/ms-playwright
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
MemoryHigh=750M
MemoryMax=900M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/ilovemd /tmp

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/cloudflared-ilovemd.service <<'UNIT'
[Unit]
Description=Cloudflare tunnel for iLoveMD export engine
After=network-online.target ilovemd-export.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/ilovemd/export.env
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token ${CLOUDFLARED_TUNNEL_TOKEN}
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
echo "Bootstrap complete. Install /etc/ilovemd/export.env, then enable both services."
