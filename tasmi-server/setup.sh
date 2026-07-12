#!/usr/bin/env bash
set -euo pipefail

# ---- Tasmi Server — One-shot VPS Setup ----
# Usage: scp -r tasmi-server/ user@<VPS_IP>:/tmp/tasmi-server/
#        ssh user@<VPS_IP> 'cd /tmp/tasmi-server && sudo bash setup.sh'

INSTALL_DIR="/opt/tasmi"
SERVICE_USER="tasmi"

echo "=== Tasmi Server Setup ==="

# 1. Install Python 3.11+ if needed
if ! command -v python3.11 &>/dev/null && ! python3 --version 2>&1 | grep -qE '3\.(1[1-9]|[2-9][0-9])'; then
    echo "Installing Python 3.11..."
    apt-get update
    apt-get install -y python3.11 python3.11-venv python3-pip
else
    echo "Python 3.11+ already installed."
fi

# Determine python binary
PYTHON_BIN=$(command -v python3.11 2>/dev/null || command -v python3)

# 2. Create service user if needed
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating user: $SERVICE_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# 3. Create install directory
echo "Setting up $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

# 4. Copy app files
cp main.py normalizer.py requirements.txt "$INSTALL_DIR/"

# 5. Create venv and install deps
if [ ! -d "$INSTALL_DIR/venv" ]; then
    echo "Creating Python venv..."
    "$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
fi

echo "Installing Python dependencies (this may take a few minutes)..."
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

# 6. Set up .env file
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    read -rp "Enter API key for tasmi server: " API_KEY
    cat > "$ENV_FILE" <<EOF
TASMI_API_KEY=$API_KEY
WHISPER_MODEL=large-v3
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_CPU_THREADS=2
EOF
    chmod 600 "$ENV_FILE"
    echo "Wrote $ENV_FILE"
else
    echo "$ENV_FILE already exists, skipping."
fi

# 7. Fix ownership
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# 8. Install systemd service
echo "Installing systemd service..."
cp tasmi.service /etc/systemd/system/tasmi.service
systemctl daemon-reload
systemctl enable tasmi
systemctl restart tasmi

# 9. Open firewall port (ufw if available)
if command -v ufw &>/dev/null; then
    ufw allow 8000/tcp 2>/dev/null || true
    echo "Opened port 8000 in ufw."
fi

# 10. Print status
echo ""
echo "=== Setup Complete ==="
systemctl status tasmi --no-pager || true
echo ""
echo "Test with:"
echo "  curl http://$(hostname -I | awk '{print $1}'):8000/health"
echo ""
echo "Update Miftah .env.local:"
echo "  TASMI_SERVER_URL=http://$(hostname -I | awk '{print $1}'):8000"
echo "  TASMI_API_KEY=<same key you entered above>"
