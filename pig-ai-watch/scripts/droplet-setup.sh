#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  PRISMA ATLAS — Droplet Bootstrap / Deploy Script
#
#  Run this script ONCE on a fresh DigitalOcean Droplet to
#  install Docker, configure the app directory, and perform the
#  first deployment.  Subsequent deployments are handled
#  automatically by the GitHub Actions CI/CD pipeline.
#
#  Usage:
#    1. SSH into your Droplet:  ssh root@<DROPLET_IP>
#    2. Copy this script or run it remotely:
#         bash <(curl -fsSL https://raw.githubusercontent.com/<owner>/Prisma-atlas/main/pig-ai-watch/scripts/droplet-setup.sh)
#
#  Prerequisites:
#    - Ubuntu 22.04 LTS Droplet (1 GB RAM minimum, 2 GB+ recommended)
#    - Root or sudo access
# ════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ───────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/prisma-atlas/pig-ai-watch}"
REPO_RAW="https://raw.githubusercontent.com/durendal11/Prisma-atlas/main/pig-ai-watch"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

echo "════════════════════════════════════════════"
echo "  Prisma Atlas — Droplet Setup"
echo "  App directory: $APP_DIR"
echo "════════════════════════════════════════════"

# ── 1. System updates ────────────────────────────────────────────
echo "[1/6] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Install Docker ────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "[2/6] Installing Docker..."
  apt-get install -y -qq ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  echo "  Docker $(docker --version) installed ✓"
else
  echo "[2/6] Docker already installed — skipping."
fi

# ── 3. Create a non-root deploy user (optional, skip if already exists) ──
if ! id "$DEPLOY_USER" &>/dev/null; then
  echo "[3/6] Creating deploy user '$DEPLOY_USER'..."
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"
  mkdir -p /home/"$DEPLOY_USER"/.ssh
  # Copy root's authorized_keys so the same SSH key works for the deploy user
  cp /root/.ssh/authorized_keys /home/"$DEPLOY_USER"/.ssh/authorized_keys 2>/dev/null || true
  chown -R "$DEPLOY_USER":"$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh
  chmod 700 /home/"$DEPLOY_USER"/.ssh
  chmod 600 /home/"$DEPLOY_USER"/.ssh/authorized_keys 2>/dev/null || true
  echo "  User '$DEPLOY_USER' created ✓"
else
  echo "[3/6] User '$DEPLOY_USER' already exists — skipping."
  usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true
fi

# ── 4. Create app directory ─────────────────────────────────────
echo "[4/6] Creating app directory at $APP_DIR..."
mkdir -p "$APP_DIR"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$(dirname "$APP_DIR")"

# ── 5. Download docker-compose.yml ──────────────────────────────
echo "[5/6] Downloading docker-compose.yml..."
curl -fsSL "$REPO_RAW/docker-compose.yml" -o "$APP_DIR/docker-compose.yml"

# ── 6. Create .env template (operator must fill in secrets) ──────
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[6/6] Creating .env template at $ENV_FILE..."
  cat > "$ENV_FILE" <<'ENVEOF'
# ── Database ──────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD
POSTGRES_DB=pig_ai_watch
DB_PORT=5432

# ── Backend ───────────────────────────────────────────────────
SECRET_KEY=CHANGE_ME_LONG_RANDOM_STRING_AT_LEAST_32_CHARS
DEBUG=false

# ── Edge devices ─────────────────────────────────────────────
EDGE_API_KEY=CHANGE_ME_EDGE_SECRET

# ── Frontend ─────────────────────────────────────────────────
FRONTEND_PORT=3000
ENVEOF
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "  .env template created ✓"
  echo ""
  echo "  ⚠️  IMPORTANT: Edit $ENV_FILE and fill in all secrets before running!"
  echo "     nano $ENV_FILE"
else
  echo "[6/6] .env already exists — skipping template creation."
fi

# ── Summary ──────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Fill in secrets:  nano $ENV_FILE"
echo "  2. Start the stack:  cd $APP_DIR && docker compose up -d"
echo "  3. Run DB seed:      cd $APP_DIR && docker compose --profile seed up seed"
echo ""
echo "  After adding DROPLET_HOST, DROPLET_USER, DROPLET_SSH_KEY,"
echo "  DROPLET_APP_DIR, DOCKERHUB_USERNAME and DOCKERHUB_TOKEN"
echo "  to GitHub Secrets, every push to main will auto-deploy."
echo "════════════════════════════════════════════"
