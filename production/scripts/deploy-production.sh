#!/usr/bin/env bash

# QuestCord Production Deployment Script
# This script safely deploys the QuestCord bot to production

set -euo pipefail

echo "🚀 Starting QuestCord Production Deployment"
echo "=============================================="

# Get script directory and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "📂 Working directory: $(pwd)"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing..."
    npm install -g pm2
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Install dependencies
echo "📦 Installing production dependencies..."
npm ci --omit=dev 2>/dev/null || npm install --omit=dev 2>/dev/null || npm install

# Kill any processes using port 3001
echo "🔧 Clearing port 3001..."
npx kill-port 3001 2>/dev/null || echo "Port 3001 was not in use"

# Stop existing PM2 processes (if any)
echo "🛑 Stopping existing processes..."
pm2 stop questcord-bot 2>/dev/null || echo "No existing bot processes to stop"
pm2 delete questcord-bot 2>/dev/null || echo "No existing processes to delete"

# Deploy slash commands
echo "⚡ Deploying slash commands..."
if [[ -f "scripts/deploy-commands.js" ]]; then
    node scripts/deploy-commands.js || {
        echo "❌ Failed to deploy commands, continuing anyway..."
    }
else
    echo "❌ deploy-commands.js not found, skipping command deployment"
fi

# Start with PM2 using ecosystem config
echo "🚀 Starting bot with PM2..."
if [[ -f "ecosystem.config.js" ]]; then
    pm2 start ecosystem.config.js
else
    echo "❌ ecosystem.config.js not found, starting with direct command..."
    pm2 start src/index.js --name questcord-bot
fi

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Show status
echo "📊 Current PM2 status:"
pm2 status

echo ""
echo "✅ QuestCord bot deployed successfully!"
echo ""
echo "📝 View logs: pm2 logs questcord-bot"
echo "🔄 Restart: pm2 restart questcord-bot"
echo "🛑 Stop: pm2 stop questcord-bot"
echo "🌐 Web interface: https://questcord.fun"
echo ""
echo "ℹ️  Note: All background processes (boss spawning, stamina regen, events) run in the main bot"