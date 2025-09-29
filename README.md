# QuestCord - Production/Development Environment Setup

## 🏗️ Project Structure

```
QuestCord v1/
├── production/          # Production environment (Port 3000)
│   ├── src/            # Production source code
│   ├── web/            # Production web server
│   ├── scripts/        # Production scripts
│   ├── worker/         # Production worker
│   ├── .env            # Production environment variables
│   ├── data.sqlite     # Production database (PROTECTED)
│   └── package.json    # Production dependencies
│
├── development/         # Development environment (Port 3001)
│   ├── src/            # Development source code
│   ├── web/            # Development web server
│   ├── scripts/        # Development scripts
│   ├── worker/         # Development worker
│   ├── .env            # Development environment variables
│   ├── data-dev.sqlite # Development database (PROTECTED)
│   └── package.json    # Development dependencies
│
├── package.json        # Root workspace configuration
├── start.ps1           # Enhanced PowerShell launcher
└── deploy-dev-to-prod.js # Safe deployment script
```

## 🚀 Quick Start

### Using PowerShell Menu (Recommended)
```powershell
./start.ps1
```

### Using NPM Scripts
```bash
# Production (Port 3000)
npm run start:prod

# Development (Port 3001)
npm run start:dev

# Deploy development to production
npm run deploy
```

## 🔧 Environment Configuration

### Production Environment
- **Port**: 3000
- **Database**: `production/data.sqlite`
- **Environment File**: `production/.env`
- **Public URL**: https://questcord.fun

### Development Environment
- **Port**: 3001
- **Database**: `development/data-dev.sqlite`
- **Environment File**: `development/.env`
- **Public URL**: http://localhost:3001

## 🚀 Deployment Process

The deployment system safely copies changes from development to production while protecting critical files:

### Protected Files (Never Overwritten)
- ✅ All database files (.sqlite, .sqlite-shm, .sqlite-wal)
- ✅ Environment files (.env, .env.production)
- ✅ node_modules directories
- ✅ backup directories
- ✅ package-lock.json files

### Deployed Files
- ✅ Source code (src/)
- ✅ Web server files (web/)
- ✅ Scripts (scripts/)
- ✅ Worker files (worker/)
- ✅ Configuration files (config.json, package.json)
- ✅ Tools and documentation

### Deployment Command
```bash
npm run deploy
```

## 📋 Available Commands

### Production Commands
```bash
npm run start:prod              # Start production server
npm run worker:prod             # Start production worker
npm run deploy:commands:prod    # Deploy Discord commands to production
npm run init:prod              # Initialize production database
npm run backup:prod            # Create production backup
```

### Development Commands
```bash
npm run start:dev               # Start development server
npm run worker:dev              # Start development worker
npm run deploy:commands:dev     # Deploy Discord commands to development
npm run init:dev               # Initialize development database
```

### Utility Commands
```bash
npm run deploy                  # Safe deploy dev to prod
npm run install:all            # Install dependencies for both environments
npm run install:prod           # Install production dependencies only
npm run install:dev            # Install development dependencies only
```

## 🛡️ Security Features

### Database Protection
- Production and development databases are completely isolated
- Deployment never touches existing databases
- Automatic backup systems protect against data loss

### Environment Isolation
- Separate .env files for each environment
- Development uses localhost URLs and test credentials
- Production uses live URLs and production credentials

### Safe Deployment
- Files are synced, not moved (originals preserved)
- Critical files are explicitly protected
- Automatic dependency updates after deployment

## 🎮 PowerShell Menu Options

The enhanced `start.ps1` script provides a comprehensive menu:

1. **Start Production Server** - Full production environment with tunnel
2. **Start Production Server Only** - Production without cloudflare tunnel
3. **Start Production Bot Only** - Just the bot, no web server
4. **Setup Development Environment** - First-time development setup
5. **Start Development Server** - Development environment (port 3001)
6. **Start Development Bot + Worker** - Full development stack
7. **Deploy Development to Production** - Safe deployment with protection
8. **Create Backup** - Manual production backup
9. **Rollback to Previous Version** - Emergency rollback
10. **Test Discord Commands (Production)** - Production command testing
11. **Test Discord Commands (Development)** - Development command testing
12. **Verify Setup** - Check environment configuration
13. **Deploy Discord Commands (Production)** - Update production commands
14. **Deploy Discord Commands (Development)** - Update development commands

## 🔍 Verification

### Check Environment Status
```bash
# Verify production setup
cd production && npm run start:prod --dry-run

# Verify development setup  
cd development && npm run start:dev --dry-run
```

### Test Deployment
```bash
# Make changes in development, then deploy
npm run deploy
```

## 🚨 Important Notes

1. **Database Safety**: Databases are NEVER overwritten during deployment
2. **Environment Files**: Each environment has its own .env file
3. **Port Configuration**: Production=3000, Development=3001
4. **Dependency Management**: Each environment manages its own dependencies
5. **Discord Commands**: Deploy commands separately for each environment
6. **Cloudflare Tunnel**: Only available for production environment

## 🎯 Best Practices

1. **Always develop in the development environment first**
2. **Test changes thoroughly before deployment**
3. **Use the PowerShell menu for complex operations**
4. **Keep environment files separate and secure**
5. **Create backups before major deployments**
6. **Verify both environments after changes**

## 🆘 Troubleshooting

### Port Conflicts
If ports 3000 or 3001 are in use:
- Check for existing Node.js processes
- Use Task Manager or `taskkill` to stop conflicting processes
- Restart the PowerShell launcher

### Database Issues
- Development and production databases are separate
- Use appropriate environment commands for each
- Check file permissions if database errors occur

### Deployment Problems
- Verify both environments have required dependencies
- Check that source files exist in development
- Ensure proper file permissions on Windows

---

*This enhanced environment setup provides safe, isolated development and production environments with automatic database protection and streamlined deployment processes.*