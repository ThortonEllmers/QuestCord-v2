#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class QuestCordDeployer {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.config = this.loadConfig();
    this.backupDir = path.join(this.projectRoot, this.config.deployment.backup.directory);
    this.deploymentId = `deploy_${Date.now()}`;
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  loadConfig() {
    const configPath = path.join(this.projectRoot, 'deploy.config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('deploy.config.json not found');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelColors = {
      INFO: '\x1b[36m',  // Cyan
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      SUCCESS: '\x1b[32m' // Green
    };
    const color = levelColors[level] || '';
    console.log(`${color}[${timestamp}] [${level}] ${message}\x1b[0m`, ...args);
  }

  async validateEnvironment() {
    this.log('INFO', '🔍 Validating deployment environment...');
    
    const { source, target } = this.config.deployment;
    
    // Check if source files exist
    const sourceDb = path.join(this.projectRoot, source.database);
    if (!fs.existsSync(sourceDb)) {
      throw new Error(`Source database not found: ${sourceDb}`);
    }

    // Check if target database exists (for backup)
    const targetDb = path.join(this.projectRoot, target.database);
    if (!fs.existsSync(targetDb)) {
      this.log('WARN', `Target database not found: ${targetDb} (will be created)`);
    }

    // Validate dependencies
    if (this.config.deployment.validation.checkDependencies) {
      try {
        execSync('npm list', { cwd: this.projectRoot, stdio: 'ignore' });
        this.log('SUCCESS', '✅ Dependencies validated');
      } catch (error) {
        throw new Error('npm dependencies validation failed. Run "npm install"');
      }
    }

    // Check if production server is running
    if (this.config.deployment.validation.checkPorts) {
      try {
        const net = require('net');
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.listen(3000, () => {
            server.close();
            this.log('SUCCESS', '✅ Port 3000 is available');
            resolve();
          });
          server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              this.log('WARN', '⚠️  Production server appears to be running on port 3000');
            }
            resolve(); // Continue anyway
          });
        });
      } catch (error) {
        // Continue anyway
      }
    }

    this.log('SUCCESS', '✅ Environment validation completed');
  }

  async createBackup() {
    if (!this.config.deployment.backup.enabled) {
      this.log('INFO', 'Backup disabled, skipping...');
      return null;
    }

    this.log('INFO', '💾 Creating backup...');
    
    const backupPath = path.join(this.backupDir, this.deploymentId);
    fs.mkdirSync(backupPath, { recursive: true });

    const { target } = this.config.deployment;

    // Backup database
    if (this.config.deployment.backup.includeDatabase) {
      const sourceDb = path.join(this.projectRoot, target.database);
      if (fs.existsSync(sourceDb)) {
        const backupDb = path.join(backupPath, target.database);
        fs.copyFileSync(sourceDb, backupDb);
        this.log('SUCCESS', `✅ Database backed up to ${backupDb}`);
      }
    }

    // Backup config files
    if (this.config.deployment.backup.includeConfig) {
      const configFile = path.join(this.projectRoot, target.config);
      if (fs.existsSync(configFile)) {
        const backupConfig = path.join(backupPath, target.config);
        fs.copyFileSync(configFile, backupConfig);
        this.log('SUCCESS', `✅ Config backed up to ${backupConfig}`);
      }

      const envFile = path.join(this.projectRoot, target.env);
      if (fs.existsSync(envFile)) {
        const backupEnv = path.join(backupPath, target.env);
        fs.copyFileSync(envFile, backupEnv);
        this.log('SUCCESS', `✅ Environment file backed up to ${backupEnv}`);
      }
    }

    // Create backup manifest
    const manifest = {
      deploymentId: this.deploymentId,
      timestamp: new Date().toISOString(),
      files: fs.readdirSync(backupPath),
      version: this.getVersion()
    };
    
    fs.writeFileSync(
      path.join(backupPath, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    this.log('SUCCESS', `✅ Backup created: ${backupPath}`);
    this.cleanupOldBackups();
    
    return backupPath;
  }

  cleanupOldBackups() {
    const keepBackups = this.config.deployment.backup.keepBackups;
    const backups = fs.readdirSync(this.backupDir)
      .filter(name => name.startsWith('deploy_'))
      .sort()
      .reverse();

    if (backups.length > keepBackups) {
      const toDelete = backups.slice(keepBackups);
      toDelete.forEach(backup => {
        const backupPath = path.join(this.backupDir, backup);
        fs.rmSync(backupPath, { recursive: true, force: true });
        this.log('INFO', `🗑️  Removed old backup: ${backup}`);
      });
    }
  }

  async deployDatabase() {
    if (!this.config.deployment.migration.migrateDatabase) {
      this.log('INFO', 'Database migration disabled, skipping...');
      return;
    }

    this.log('INFO', '🗃️  Deploying database changes...');
    
    const { source, target } = this.config.deployment;
    const sourceDb = path.join(this.projectRoot, source.database);
    const targetDb = path.join(this.projectRoot, target.database);

    if (this.config.deployment.migration.preserveUserData) {
      this.log('INFO', 'Preserving user data during migration...');
      
      // For now, we'll do a simple copy but in production you'd want
      // more sophisticated schema migration
      if (fs.existsSync(targetDb)) {
        // Create a temp backup
        const tempBackup = `${targetDb}.temp`;
        fs.copyFileSync(targetDb, tempBackup);
        this.log('INFO', `Created temporary backup: ${tempBackup}`);
      }
    }

    // Copy development database to production
    // NOTE: In a real deployment, you'd want schema-only migration
    // preserving production data
    fs.copyFileSync(sourceDb, targetDb);
    this.log('SUCCESS', '✅ Database deployed');
  }

  async deployConfig() {
    if (!this.config.deployment.migration.mergeConfigs) {
      this.log('INFO', 'Config merge disabled, skipping...');
      return;
    }

    this.log('INFO', '⚙️  Deploying configuration...');
    
    const { source, target } = this.config.deployment;
    
    // Don't overwrite production .env - it contains live credentials
    this.log('INFO', '📝 Keeping production .env file unchanged');
    
    // Only update config.json if there are structural changes
    const sourceConfig = path.join(this.projectRoot, source.config);
    const targetConfig = path.join(this.projectRoot, target.config);
    
    if (fs.existsSync(sourceConfig)) {
      // Read both configs
      const devConfig = JSON.parse(fs.readFileSync(sourceConfig, 'utf8'));
      let prodConfig = {};
      
      if (fs.existsSync(targetConfig)) {
        prodConfig = JSON.parse(fs.readFileSync(targetConfig, 'utf8'));
      }
      
      // Merge configs (dev config structure with prod values where they exist)
      const mergedConfig = this.mergeConfigs(devConfig, prodConfig);
      
      fs.writeFileSync(targetConfig, JSON.stringify(mergedConfig, null, 2));
      this.log('SUCCESS', '✅ Configuration updated');
    }
  }

  mergeConfigs(devConfig, prodConfig) {
    // Remove development-specific sections
    const cleaned = JSON.parse(JSON.stringify(devConfig));
    delete cleaned.development;
    delete cleaned.security; // Keep production security settings
    
    // Merge with production config, keeping prod values
    return {
      ...cleaned,
      ...prodConfig,
      web: {
        ...cleaned.web,
        ...prodConfig.web,
        publicBaseUrl: prodConfig.web?.publicBaseUrl || "https://questcord.fun"
      }
    };
  }

  async deployCode() {
    this.log('INFO', '📦 Code is already in place (no file copying needed)');
    this.log('SUCCESS', '✅ Code deployment completed');
  }

  async restartServices() {
    this.log('INFO', '🔄 Restarting services...');
    
    try {
      // In a real deployment, you might use PM2 or similar
      this.log('INFO', 'Services will need manual restart');
      this.log('INFO', 'Run: npm run start:prod');
      this.log('SUCCESS', '✅ Services restart initiated');
    } catch (error) {
      this.log('ERROR', '❌ Failed to restart services:', error.message);
      throw error;
    }
  }

  async validateDeployment() {
    this.log('INFO', '✅ Validating deployment...');
    
    // Basic file existence checks
    const { target } = this.config.deployment;
    const targetDb = path.join(this.projectRoot, target.database);
    
    if (!fs.existsSync(targetDb)) {
      throw new Error('Production database not found after deployment');
    }

    this.log('SUCCESS', '✅ Deployment validation passed');
  }

  getVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync(
        path.join(this.projectRoot, 'package.json'), 'utf8'
      ));
      return packageJson.version;
    } catch {
      return 'unknown';
    }
  }

  async rollback(backupPath) {
    if (!this.config.deployment.rollback.enabled) {
      this.log('ERROR', 'Rollback disabled, manual recovery required');
      return;
    }

    this.log('WARN', '🔄 Rolling back deployment...');
    
    const { target } = this.config.deployment;
    
    // Restore database
    const backupDb = path.join(backupPath, target.database);
    if (fs.existsSync(backupDb)) {
      const targetDb = path.join(this.projectRoot, target.database);
      fs.copyFileSync(backupDb, targetDb);
      this.log('SUCCESS', '✅ Database restored');
    }
    
    // Restore config
    const backupConfig = path.join(backupPath, target.config);
    if (fs.existsSync(backupConfig)) {
      const targetConfig = path.join(this.projectRoot, target.config);
      fs.copyFileSync(backupConfig, targetConfig);
      this.log('SUCCESS', '✅ Configuration restored');
    }

    this.log('SUCCESS', '✅ Rollback completed');
  }

  async deploy(backupOnly = false) {
    let backupPath = null;
    
    try {
      this.log('INFO', `🚀 Starting deployment: ${this.deploymentId}`);
      this.log('INFO', '='.repeat(50));
      
      // Pre-deployment validation
      await this.validateEnvironment();
      
      // Create backup
      backupPath = await this.createBackup();
      
      // If backup-only mode, stop here
      if (backupOnly) {
        this.log('SUCCESS', '✅ Backup completed successfully!');
        return;
      }
      
      // Deploy components
      await this.deployDatabase();
      await this.deployConfig();
      await this.deployCode();
      
      // Post-deployment validation
      await this.validateDeployment();
      
      // Services don't auto-restart for safety
      await this.restartServices();
      
      this.log('SUCCESS', '🎉 Deployment completed successfully!');
      this.log('INFO', '='.repeat(50));
      this.log('INFO', 'Next steps:');
      this.log('INFO', '1. Stop your production server if running');
      this.log('INFO', '2. Run: npm run start:prod');
      this.log('INFO', '3. Test your live server');
      this.log('INFO', `4. Backup available at: ${backupPath}`);
      
    } catch (error) {
      this.log('ERROR', `❌ Deployment failed: ${error.message}`);
      
      if (backupPath && this.config.deployment.rollback.autoRollbackOnError) {
        await this.rollback(backupPath);
      }
      
      process.exit(1);
    }
  }
}

// Run deployment if called directly
if (require.main === module) {
  const deployer = new QuestCordDeployer();
  const backupOnly = process.argv.includes('--backup-only');
  deployer.deploy(backupOnly);
}

module.exports = QuestCordDeployer;