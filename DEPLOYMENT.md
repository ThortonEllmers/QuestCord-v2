# QuestCord VPS Deployment Guide

## Issues Fixed

### 1. Missing Environment Variables
- ✅ Added `SESSION_SECRET` (required in production mode)
- ✅ Added `STATE_SECRET` (required for OAuth security)
- ✅ Set `NODE_ENV=production` (was incorrectly set to development)
- ✅ Added `PUBLIC_BASE_URL` configuration
- ✅ Fixed OAuth redirect URI configuration

### 2. Code Issues Fixed
- ✅ Fixed `auth.js` to support both `REDIRECT_URI` and `OAUTH_REDIRECT_URI` environment variables (production/src/web/routes/auth.js:49)

## Current Error Diagnosis

Your website returns **HTTP 522 (Connection Timed Out)** from Cloudflare, which means:
- Cloudflare can reach your domain
- But Cloudflare **cannot connect to your origin server** (VPS)

### Possible Causes:
1. **Node.js server is not running** on your VPS
2. **Server crashed** due to missing environment variables (now fixed)
3. **Firewall blocking** port 80 on your VPS
4. **Wrong IP address** in Cloudflare DNS settings
5. **Server listening on wrong interface** (127.0.0.1 instead of 0.0.0.0)

## Deployment Steps for VPS

### Step 1: Upload Fixed Files to VPS
Upload these files to your VPS:
```bash
production/.env              # Updated with all required variables
production/src/web/routes/auth.js  # Fixed OAuth redirect URI
```

### Step 2: Connect to Your VPS
```bash
ssh username@your-vps-ip
cd /path/to/QuestCord-v2/production
```

### Step 3: Update .env File on VPS
Copy the contents of `production/.env` to your VPS (DO NOT copy from this file - use your local .env with real credentials):

**Option A: Upload via SCP**
```bash
# From your local machine
scp production/.env username@your-vps-ip:/path/to/QuestCord-v2/production/.env
```

**Option B: Create manually on VPS**
```bash
# On your VPS, create .env with this structure:
cat > .env << 'EOF'
# QuestCord Production Environment Configuration
# ===========================================
# DISCORD BOT CONFIGURATION
# ===========================================
DISCORD_TOKEN=your_actual_discord_bot_token
DISCORD_CLIENT_ID=your_actual_client_id
DISCORD_CLIENT_SECRET=your_actual_client_secret

# ===========================================
# BOT OWNER
# ===========================================
BOT_OWNER_ID=your_discord_user_id

# ===========================================
# WEB SERVER CONFIGURATION
# ===========================================
PORT=80
NODE_ENV=production
PUBLIC_BASE_URL=https://questcord.fun

# ===========================================
# AUTHENTICATION & SECURITY
# ===========================================
SESSION_SECRET=generate_a_random_64_character_string
STATE_SECRET=generate_another_random_64_character_string

# ===========================================
# OAUTH CONFIGURATION
# ===========================================
REDIRECT_URI=https://questcord.fun/auth/discord/callback

# ===========================================
# COOKIE SETTINGS
# ===========================================
COOKIE_DOMAIN=questcord.fun
COOKIE_SECURE=false

# ===========================================
# STRIPE PAYMENT (OPTIONAL)
# ===========================================
STRIPE_SECRET_KEY=your_stripe_key_here
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret_here
PREMIUM_PRICE_ID=your_stripe_price_id_here
EOF
```

**Generate secure secrets:**
```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate STATE_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Install Dependencies
```bash
npm install
```

### Step 5: Stop Existing Server (if running)
```bash
# If using PM2
pm2 stop all
pm2 delete all

# If using screen/tmux
# Find and kill the process
ps aux | grep node
kill -9 <process_id>

# If using systemd
sudo systemctl stop questcord
```

### Step 6: Start the Server
```bash
# Option A: Using PM2 (Recommended for production)
pm2 start src/index.js --name "questcord" --time
pm2 save
pm2 startup  # Follow the instructions to enable auto-start

# Option B: Using Node directly (for testing)
sudo node src/index.js

# Option C: Using npm script
npm run start:prod
```

### Step 7: Check Server Logs
```bash
# If using PM2
pm2 logs questcord --lines 50

# If using Node directly
# Logs will appear in the terminal

# Check for these startup messages:
# ✅ "WEB SERVER STARTED"
# ✅ "Logged in as [Bot Name]"
```

### Step 8: Verify Server is Listening
```bash
# Check if port 80 is open and listening
sudo netstat -tlnp | grep :80

# Should show something like:
# tcp6  0  0 :::80  :::*  LISTEN  12345/node

# Test local connection
curl http://localhost:80
# Should return HTML, not connection refused
```

### Step 9: Check Firewall Rules
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --reload
```

### Step 10: Verify Cloudflare Settings
1. Go to Cloudflare Dashboard → DNS
2. Verify A record points to correct VPS IP address
3. Verify proxy status (orange cloud) is enabled
4. Check SSL/TLS settings → Set to "Full" or "Full (strict)"

## Troubleshooting

### Server Won't Start
```bash
# Check for syntax errors
node -c src/index.js

# Check if port 80 is already in use
sudo lsof -i :80

# Try running with sudo (port 80 requires root)
sudo node src/index.js
```

### 522 Error Persists
```bash
# 1. Verify server is actually running
ps aux | grep node

# 2. Test local connection
curl -v http://localhost:80

# 3. Test from external IP
curl -v http://YOUR_VPS_IP

# 4. Check if firewall is blocking
sudo iptables -L -n | grep 80
```

### Environment Variable Issues
```bash
# Verify .env file is loaded
cd /path/to/production
cat .env | grep NODE_ENV
# Should show: NODE_ENV=production

# Test environment loading
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"
```

### Check Server Health
Once running, test these endpoints:
```bash
# Health check
curl http://localhost:80/healthz

# Should return:
# {"ok":true,"status":"healthy","uptime":"...","timestamp":"..."}
```

## Quick Restart Commands

```bash
# PM2
pm2 restart questcord

# Or full restart
pm2 stop questcord
pm2 delete questcord
pm2 start src/index.js --name "questcord"
```

## Security Notes

1. **Never commit `.env` files** - They're already in `.gitignore`
2. **Rotate secrets periodically** - Especially `SESSION_SECRET` and `STATE_SECRET`
3. **Use HTTPS** - Set `COOKIE_SECURE=true` after Cloudflare SSL is working
4. **Monitor logs** - Use `pm2 logs` to watch for errors
5. **Keep dependencies updated** - Run `npm audit` regularly

## Production Checklist

- [x] NODE_ENV set to "production"
- [x] SESSION_SECRET configured
- [x] STATE_SECRET configured
- [x] Discord OAuth credentials set
- [x] REDIRECT_URI matches Discord app settings
- [x] PORT set to 80
- [x] Firewall allows port 80
- [x] Cloudflare DNS points to VPS IP
- [x] Server running with PM2
- [ ] SSL/TLS configured (Cloudflare handles this)
- [ ] Monitor server logs for errors

## Next Steps After Deployment

1. Monitor logs for 24 hours: `pm2 logs --lines 100`
2. Test OAuth login: Visit https://questcord.fun/login
3. Check Discord bot status in Discord Developer Portal
4. Set up monitoring/alerting for server downtime
5. Configure automated backups for database files

## Support

If issues persist after following this guide:
1. Check PM2 logs: `pm2 logs questcord --lines 100`
2. Check system logs: `journalctl -u questcord -n 50` (if using systemd)
3. Verify Cloudflare proxy status is enabled (orange cloud)
4. Test direct IP access: `curl http://YOUR_VPS_IP` (bypasses Cloudflare)
