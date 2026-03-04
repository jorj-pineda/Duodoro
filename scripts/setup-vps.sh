#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Duodoro VPS Setup Script
# Run once on a fresh Ubuntu 24.04 VPS
# Usage: sudo bash setup-vps.sh yourdomain.com your-email@example.com
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

DOMAIN="${1:?Usage: sudo bash setup-vps.sh <domain> <email>}"
EMAIL="${2:?Usage: sudo bash setup-vps.sh <domain> <email>}"
DEPLOY_USER="deploy"
APP_DIR="/opt/duodoro"
REPO_URL="https://github.com/jorj-pineda/Duodoro.git"

echo "==> Setting up Duodoro on $DOMAIN"

# ── 1. System updates ────────────────────────────────────────────────────────
echo "==> Updating system packages..."
apt-get update && apt-get upgrade -y

# ── 2. Install Nginx ─────────────────────────────────────────────────────────
echo "==> Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── 3. Install Docker (official repo) ────────────────────────────────────────
echo "==> Installing Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker

# ── 4. Install Certbot ───────────────────────────────────────────────────────
echo "==> Installing Certbot..."
snap install --classic certbot 2>/dev/null || apt-get install -y certbot
ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true

# ── 5. Create deploy user ───────────────────────────────────────────────────
echo "==> Creating deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# Copy SSH keys from root so CI/CD can SSH in as deploy
if [ -f /root/.ssh/authorized_keys ]; then
    mkdir -p /home/$DEPLOY_USER/.ssh
    cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
    chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
    chmod 700 /home/$DEPLOY_USER/.ssh
    chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
fi

# ── 6. Clone repository ─────────────────────────────────────────────────────
echo "==> Cloning repository to $APP_DIR..."
if [ ! -d "$APP_DIR" ]; then
    git clone "$REPO_URL" "$APP_DIR"
else
    echo "    $APP_DIR already exists, pulling latest..."
    cd "$APP_DIR" && git pull origin main
fi
chown -R $DEPLOY_USER:$DEPLOY_USER "$APP_DIR"

# ── 7. Initial Nginx config (HTTP only, for certbot challenge) ───────────────
echo "==> Setting up temporary Nginx config for SSL challenge..."
mkdir -p /var/www/certbot

cat > /etc/nginx/sites-available/duodoro <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Setting up...';
        add_header Content-Type text/plain;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/duodoro /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 8. Obtain SSL certificate ────────────────────────────────────────────────
echo "==> Obtaining SSL certificate..."
certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive

# ── 9. Deploy full Nginx config ──────────────────────────────────────────────
echo "==> Deploying production Nginx config..."
sed "s/yourdomain.com/$DOMAIN/g" "$APP_DIR/nginx/duodoro.conf" > /etc/nginx/sites-available/duodoro
nginx -t && systemctl reload nginx

# ── 10. Set up certbot auto-renewal hook ─────────────────────────────────────
echo "==> Configuring SSL auto-renewal..."
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/bash
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "==========================================="
echo "  VPS setup complete!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "  1. Create /opt/duodoro/.env with your production secrets"
echo "     (use .env.production.example as a template)"
echo ""
echo "  2. Build and start the app:"
echo "     cd /opt/duodoro"
echo "     docker compose up -d --build"
echo ""
echo "  3. Visit https://$DOMAIN"
echo ""
