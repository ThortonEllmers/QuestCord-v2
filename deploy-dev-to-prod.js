#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting deployment from development to production...\n');

// Files and directories to exclude from deployment (keep production versions)
const PROTECTED_FILES = [
  '.env',
  '.env.production',
  'data.sqlite',
  'data.sqlite-shm', 
  'data.sqlite-wal',
  'data-dev.sqlite',
  'data-dev.sqlite-shm',
  'data-dev.sqlite-wal',
  'node_modules',
  'package-lock.json',
  'backups'
];

// Directories to sync completely
const SYNC_DIRECTORIES = [
  'src',
  'web',
  'scripts',
  'worker',
  'tools',
  'docs'
];

// Files to sync
const SYNC_FILES = [
  'package.json',
  'config.json',
  'config.development.json',
  'deploy.config.json',
  'start.ps1'
];

function copyFileSync(src, dest) {
  try {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    return true;
  } catch (error) {
    console.warn(`⚠️  Failed to copy ${src}: ${error.message}`);
    return false;
  }
}

function copyDirectorySync(src, dest, excludeFiles = []) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  Source directory doesn't exist: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  let copiedCount = 0;

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (excludeFiles.includes(entry.name)) {
      console.log(`   🛡️  Skipping protected: ${entry.name}`);
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath, excludeFiles);
    } else {
      if (copyFileSync(srcPath, destPath)) {
        copiedCount++;
      }
    }
  }

  if (copiedCount > 0) {
    console.log(`   ✅ Copied ${copiedCount} files`);
  }
}

try {
  console.log('📂 Syncing directories...');
  
  // Sync each directory
  for (const dir of SYNC_DIRECTORIES) {
    const srcDir = path.join('development', dir);
    const destDir = path.join('production', dir);
    
    console.log(`\n🔄 Syncing ${dir}/`);
    
    // Remove old directory in production
    if (fs.existsSync(destDir)) {
      try {
        fs.rmSync(destDir, { recursive: true, force: true });
        console.log(`   🗑️  Removed old ${dir}/`);
      } catch (error) {
        console.warn(`   ⚠️  Could not remove old ${dir}/: ${error.message}`);
      }
    }
    
    // Copy new directory
    copyDirectorySync(srcDir, destDir);
  }

  console.log('\n📄 Syncing individual files...');
  
  // Sync individual files
  for (const file of SYNC_FILES) {
    const srcFile = path.join('development', file);
    const destFile = path.join('production', file);
    
    if (fs.existsSync(srcFile)) {
      if (copyFileSync(srcFile, destFile)) {
        console.log(`   ✅ ${file}`);
      }
    } else {
      console.warn(`   ⚠️  ${file} not found in development`);
    }
  }

  console.log('\n🛡️  Protected files (not touched):');
  for (const file of PROTECTED_FILES) {
    const prodFile = path.join('production', file);
    if (fs.existsSync(prodFile)) {
      console.log(`   ✅ ${file} (preserved)`);
    }
  }

  console.log('\n📦 Installing/updating production dependencies...');
  try {
    process.chdir('production');
    execSync('npm install --production', { stdio: 'inherit' });
    process.chdir('..');
    console.log('   ✅ Dependencies updated');
  } catch (error) {
    console.warn('   ⚠️  Failed to update dependencies:', error.message);
  }

  console.log('\n✨ Deployment completed successfully!');
  console.log('\n📋 Next steps:');
  console.log('   • Run: npm run start:prod (to start production server)');
  console.log('   • Run: npm run deploy:commands:prod (if Discord commands changed)');
  console.log('   • Check: production server logs for any issues');
  
} catch (error) {
  console.error('\n❌ Deployment failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}