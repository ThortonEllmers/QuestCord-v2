#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class QuestCordRollback {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.backupDir = path.join(this.projectRoot, 'backups');
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelColors = {
      INFO: '\x1b[36m',
      WARN: '\x1b[33m', 
      ERROR: '\x1b[31m',
      SUCCESS: '\x1b[32m'
    };
    const color = levelColors[level] || '';
    console.log(`${color}[${timestamp}] [${level}] ${message}\x1b[0m`, ...args);
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) {
      this.log('ERROR', 'No backups directory found');
      return [];
    }

    const backups = fs.readdirSync(this.backupDir)
      .filter(name => name.startsWith('deploy_'))
      .map(name => {
        const backupPath = path.join(this.backupDir, name);
        const manifestPath = path.join(backupPath, 'manifest.json');
        
        let manifest = { timestamp: 'unknown', version: 'unknown' };
        if (fs.existsSync(manifestPath)) {
          try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          } catch (e) {
            // Ignore manifest read errors
          }
        }
        
        return {
          id: name,
          path: backupPath,
          timestamp: manifest.timestamp,
          version: manifest.version
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Most recent first

    return backups;
  }

  async rollbackToBackup(backupId) {
    const backupPath = path.join(this.backupDir, backupId);
    
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    this.log('INFO', `🔄 Rolling back to: ${backupId}`);
    
    // Restore database
    const backupDb = path.join(backupPath, 'data.sqlite');
    if (fs.existsSync(backupDb)) {
      const targetDb = path.join(this.projectRoot, 'data.sqlite');
      
      // Create a rollback backup of current state
      if (fs.existsSync(targetDb)) {
        const rollbackBackup = path.join(this.projectRoot, `data.sqlite.rollback_${Date.now()}`);
        fs.copyFileSync(targetDb, rollbackBackup);
        this.log('INFO', `Current database backed up to: ${rollbackBackup}`);
      }
      
      fs.copyFileSync(backupDb, targetDb);
      this.log('SUCCESS', '✅ Database restored');
    }
    
    // Restore config
    const backupConfig = path.join(backupPath, 'config.json');
    if (fs.existsSync(backupConfig)) {
      const targetConfig = path.join(this.projectRoot, 'config.json');
      
      // Create rollback backup of current config
      if (fs.existsSync(targetConfig)) {
        const rollbackBackup = path.join(this.projectRoot, `config.json.rollback_${Date.now()}`);
        fs.copyFileSync(targetConfig, rollbackBackup);
        this.log('INFO', `Current config backed up to: ${rollbackBackup}`);
      }
      
      fs.copyFileSync(backupConfig, targetConfig);
      this.log('SUCCESS', '✅ Configuration restored');
    }

    this.log('SUCCESS', `✅ Rollback to ${backupId} completed`);
    this.log('INFO', 'Please restart your production server');
  }

  async interactiveRollback() {
    console.log('\n' + '='.repeat(50));
    console.log('         QuestCord Rollback Tool');
    console.log('='.repeat(50) + '\n');
    
    const backups = this.listBackups();
    
    if (backups.length === 0) {
      this.log('ERROR', 'No backups available for rollback');
      return;
    }
    
    console.log('Available backups:\n');
    backups.forEach((backup, index) => {
      const date = new Date(backup.timestamp).toLocaleString();
      console.log(`${index + 1}. ${backup.id}`);
      console.log(`   Date: ${date}`);
      console.log(`   Version: ${backup.version}\n`);
    });
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('Select backup number to rollback to (or 0 to cancel): ', async (answer) => {
        rl.close();
        
        const selection = parseInt(answer);
        
        if (selection === 0) {
          console.log('\nRollback cancelled.');
          resolve();
          return;
        }
        
        if (selection < 1 || selection > backups.length) {
          console.log('\nInvalid selection.');
          resolve();
          return;
        }
        
        const selectedBackup = backups[selection - 1];
        
        console.log(`\nSelected: ${selectedBackup.id}`);
        
        rl.question('Are you sure you want to rollback? This will replace your current production data! (y/N): ', async (confirm) => {
          if (confirm.toLowerCase() === 'y') {
            try {
              await this.rollbackToBackup(selectedBackup.id);
              console.log('\n' + '='.repeat(50));
              console.log('         Rollback Completed!');
              console.log('='.repeat(50));
              console.log('\nPlease restart your production server.');
            } catch (error) {
              this.log('ERROR', `Rollback failed: ${error.message}`);
            }
          } else {
            console.log('\nRollback cancelled.');
          }
          resolve();
        });
      });
    });
  }
}

// Run if called directly
if (require.main === module) {
  const rollback = new QuestCordRollback();
  rollback.interactiveRollback().then(() => process.exit(0));
}

module.exports = QuestCordRollback;