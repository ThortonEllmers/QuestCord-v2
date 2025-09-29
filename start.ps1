# QuestCord Startup Menu
# Enhanced PowerShell script with development and deployment options
# Updated for production/development folder structure

[CmdletBinding()]
param(
    [string]$Mode = ""
)

$ErrorActionPreference = 'Stop'

# Use the script's directory as working dir
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

# Display menu function
function Show-Menu {
    try {
        Clear-Host
    } catch {
        # Fallback if Clear-Host fails
        Write-Host "`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n`n"
    }
    Write-Host ""
    Write-Host "    ======================================================================" -ForegroundColor Cyan
    Write-Host "                                                                      " -ForegroundColor Cyan
    Write-Host "                            QQQQQ  UU   UU EEEEEEE SSSSSS  TTTTTT    " -ForegroundColor Cyan
    Write-Host "                            QQ QQ  UU   UU EE      SS        TT      " -ForegroundColor Cyan
    Write-Host "                            QQQQQ  UU   UU EEEEE   SSSSSS    TT      " -ForegroundColor Yellow
    Write-Host "                            QQ QQ  UU   UU EE           SS   TT      " -ForegroundColor Yellow
    Write-Host "                            QQQQQ   UUUUU  EEEEEEE SSSSSS    TT      " -ForegroundColor Magenta
    Write-Host "                                                                      " -ForegroundColor Cyan
    Write-Host "                              CCCCC  OOOO  RRRRR  DDDD               " -ForegroundColor Cyan
    Write-Host "                              CC     OO OO RR  RR DD  DD             " -ForegroundColor Yellow
    Write-Host "                              CC     OO OO RRRRR  DD  DD             " -ForegroundColor Yellow
    Write-Host "                              CC     OO OO RR  RR DD  DD             " -ForegroundColor Magenta
    Write-Host "                              CCCCC  OOOO  RR  RR DDDD               " -ForegroundColor Magenta
    Write-Host "                                                                      " -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    ======================================================================" -ForegroundColor DarkCyan
    Write-Host "                        ULTIMATE LAUNCHER v2.0                           " -ForegroundColor White
    Write-Host "                     Discord Bot Management System                      " -ForegroundColor Gray
    Write-Host "                    Production/Development Environment                  " -ForegroundColor Gray
    Write-Host "    ======================================================================" -ForegroundColor DarkCyan
    Write-Host ""
    Write-Host "    [PROD] PRODUCTION OPTIONS (Port 3000):" -ForegroundColor Green
    Write-Host "      1. [*] Start Production Server (Bot + Worker + Tunnel)" -ForegroundColor White
    Write-Host "      2. [*] Start Production Server Only (No Tunnel)" -ForegroundColor White
    Write-Host "      3. [*] Start Production Bot Only" -ForegroundColor White
    Write-Host ""
    Write-Host "    [DEV] DEVELOPMENT OPTIONS (Port 3001):" -ForegroundColor Yellow
    Write-Host "      4. [+] Setup Development Environment" -ForegroundColor White
    Write-Host "      5. [*] Start Development Server (localhost:3001)" -ForegroundColor White
    Write-Host "      6. [*] Start Development Bot + Worker" -ForegroundColor White
    Write-Host ""
    Write-Host "    [DEPLOY] DEPLOYMENT OPTIONS:" -ForegroundColor Magenta
    Write-Host "      7. [>>] Deploy Development to Production (Safe)" -ForegroundColor White
    Write-Host "      8. [BAK] Create Backup (Production)" -ForegroundColor White
    Write-Host "      9. [<<] Rollback to Previous Version" -ForegroundColor White
    Write-Host ""
    Write-Host "    [TEST] DISCORD COMMAND TESTING:" -ForegroundColor Blue
    Write-Host "     10. [?] Test Discord Commands (Production)" -ForegroundColor White
    Write-Host "     11. [?] Test Discord Commands (Development)" -ForegroundColor White
    Write-Host ""
    Write-Host "    [UTIL] UTILITIES:" -ForegroundColor Blue
    Write-Host "     12. [OK] Verify Setup" -ForegroundColor White
    Write-Host "     13. [CMD] Deploy Discord Commands (Production)" -ForegroundColor White
    Write-Host "     14. [CMD] Deploy Discord Commands (Development)" -ForegroundColor White
    Write-Host ""
    Write-Host "     0. [X] Exit" -ForegroundColor Red
    Write-Host ""
    Write-Host "    ======================================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

# Install dependencies function for both environments
function Install-Dependencies {
    param([string]$Environment = "both")
    
    if ($Environment -eq "both" -or $Environment -eq "root") {
        Write-Host "==> Installing root dependencies..." -ForegroundColor Cyan
        npm install
        if ($LASTEXITCODE -ne 0) { throw "Root npm install failed ($LASTEXITCODE)" }
        Write-Host "✅ Root dependencies installed" -ForegroundColor Green
    }
    
    if ($Environment -eq "both" -or $Environment -eq "production") {
        Write-Host "==> Installing production dependencies..." -ForegroundColor Green
        Set-Location production
        npm install --production
        if ($LASTEXITCODE -ne 0) { 
            Set-Location $here
            throw "Production npm install failed ($LASTEXITCODE)" 
        }
        Set-Location $here
        Write-Host "✅ Production dependencies installed" -ForegroundColor Green
    }
    
    if ($Environment -eq "both" -or $Environment -eq "development") {
        Write-Host "==> Installing development dependencies..." -ForegroundColor Yellow
        Set-Location development
        npm install
        if ($LASTEXITCODE -ne 0) { 
            Set-Location $here
            throw "Development npm install failed ($LASTEXITCODE)" 
        }
        Set-Location $here
        Write-Host "✅ Development dependencies installed" -ForegroundColor Yellow
    }
}

# Start production server (updated for new structure)
function Start-Production {
    param([bool]$IncludeTunnel = $true)
    
    Write-Host "==> Starting Production Environment..." -ForegroundColor Cyan
    
    Install-Dependencies -Environment "production"
    
    Write-Host "==> Deploying Discord commands..." -ForegroundColor Cyan
    npm run deploy:commands:prod
    if ($LASTEXITCODE -ne 0) { throw "npm run deploy:commands:prod failed ($LASTEXITCODE)" }
    
    # Start the main bot/web server
    Write-Host "==> Starting Production Bot/Web Server (Port 3000)..." -ForegroundColor Cyan
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "Write-Host 'QuestCord Production Server - Port 3000' -ForegroundColor Green; npm run start:prod"
    )
    
    Start-Sleep -Seconds 2
    
    # Start the worker service
    Write-Host "==> Starting Production Worker..." -ForegroundColor Cyan
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "Write-Host 'QuestCord Production Worker' -ForegroundColor Yellow; npm run worker:prod"
    )
    
    Start-Sleep -Seconds 2
    
    # Start tunnel if requested
    if ($IncludeTunnel) {
        Write-Host "==> Starting Cloudflare Tunnel..." -ForegroundColor Cyan
        Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
            "-NoExit",
            "-ExecutionPolicy", "Bypass",
            "-Command", "Write-Host 'QuestCord Tunnel' -ForegroundColor Magenta; cloudflared tunnel run questcord"
        )
    }
    
    Write-Host ""
    Write-Host "✅ Production environment started!" -ForegroundColor Green
    Write-Host "   • Bot/Web Server: http://localhost:3000" -ForegroundColor White
    Write-Host "   • Worker: Running in background" -ForegroundColor White
    Write-Host "   • Database: production/data.sqlite" -ForegroundColor White
    if ($IncludeTunnel) {
        Write-Host "   • Tunnel: questcord.fun" -ForegroundColor White
    }
}

# Start development server (updated for new structure)
function Start-Development {
    Write-Host "==> Starting Development Environment..." -ForegroundColor Yellow
    
    Install-Dependencies -Environment "development"
    
    # Check if dev database exists
    if (!(Test-Path "development/data-dev.sqlite")) {
        Write-Host "==> Creating development database..." -ForegroundColor Yellow
        npm run init:dev
        if ($LASTEXITCODE -ne 0) { throw "Development database creation failed" }
    }
    
    Write-Host "==> Deploying Discord commands to development bot..." -ForegroundColor Yellow
    npm run deploy:commands:dev
    if ($LASTEXITCODE -ne 0) { 
        Write-Host "⚠️  Discord command deployment failed - continuing anyway..." -ForegroundColor Yellow
    }
    
    # Start development server
    Write-Host "==> Starting Development Server (Port 3001)..." -ForegroundColor Yellow
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "Write-Host 'QuestCord Development Server - http://localhost:3001' -ForegroundColor Yellow; npm run start:dev"
    )
    
    Write-Host ""
    Write-Host "✅ Development environment started!" -ForegroundColor Green
    Write-Host "   • Development Server: http://localhost:3001" -ForegroundColor White
    Write-Host "   • Database: development/data-dev.sqlite" -ForegroundColor White
    Write-Host "   • Environment: development" -ForegroundColor White
}

# Start development bot and worker (updated for new structure)
function Start-DevelopmentFull {
    Write-Host "==> Starting Full Development Environment..." -ForegroundColor Yellow
    
    Install-Dependencies -Environment "development"
    
    # Start development bot/server
    Write-Host "==> Starting Development Bot/Web Server (Port 3001)..." -ForegroundColor Yellow
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "Write-Host 'QuestCord Development Server - Port 3001' -ForegroundColor Yellow; npm run start:dev"
    )
    
    Start-Sleep -Seconds 2
    
    # Start development worker
    Write-Host "==> Starting Development Worker..." -ForegroundColor Yellow
    Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", "Write-Host 'QuestCord Development Worker' -ForegroundColor Yellow; npm run worker:dev"
    )
    
    Write-Host ""
    Write-Host "✅ Full development environment started!" -ForegroundColor Green
    Write-Host "   • Server: http://localhost:3001" -ForegroundColor White
    Write-Host "   • Worker: Development mode" -ForegroundColor White
    Write-Host "   • Database: development/data-dev.sqlite" -ForegroundColor White
}

# Setup development environment (updated for new structure)
function Setup-Development {
    Write-Host "==> Setting up Development Environment..." -ForegroundColor Cyan
    
    Install-Dependencies -Environment "development"
    
    Write-Host "==> Creating development database..." -ForegroundColor Cyan
    npm run init:dev
    if ($LASTEXITCODE -ne 0) { throw "Development setup failed" }
    
    Write-Host ""
    Write-Host "✅ Development environment setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "1. Edit development/.env with your Discord bot credentials" -ForegroundColor White
    Write-Host "2. Create a separate Discord bot application for development" -ForegroundColor White
    Write-Host "3. Create a test Discord server for development" -ForegroundColor White
    Write-Host "4. Use option 5 to start the development server" -ForegroundColor White
    Write-Host ""
    Write-Host "✨ NEW: Database and .env files are protected during deployment!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
    [System.Console]::ReadLine() | Out-Null
}

# Deploy to production (updated to use new script)
function Deploy-Production {
    Write-Host "==> Safe Production Deployment" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "🛡️  This deployment protects:" -ForegroundColor Green
    Write-Host "   • Production databases (.sqlite files)" -ForegroundColor White
    Write-Host "   • Production .env files" -ForegroundColor White
    Write-Host "   • Backup directories" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  This will deploy development changes to production!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Are you sure you want to proceed? (y/N): " -ForegroundColor Yellow -NoNewline
    $confirm = [System.Console]::ReadLine()
    
    if ($confirm -eq "y" -or $confirm -eq "Y") {
        Write-Host "==> Starting safe deployment..." -ForegroundColor Magenta
        npm run deploy
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Safe deployment completed!" -ForegroundColor Green
            Write-Host "🛡️  Your databases and .env files were protected!" -ForegroundColor Green
            Write-Host "Your production server needs to be restarted." -ForegroundColor Yellow
        }
    } else {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
    }
    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
    [System.Console]::ReadLine() | Out-Null
}

# Create backup (updated for new structure)
function Create-Backup {
    Write-Host "==> Creating Production Backup..." -ForegroundColor Cyan
    npm run backup:prod
    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
    [System.Console]::ReadLine() | Out-Null
}

# Rollback (updated for new structure)
function Start-Rollback {
    Write-Host "==> Production Rollback" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  WARNING: This will replace your current production data!" -ForegroundColor Red
    Write-Host ""
    Set-Location production
    node scripts/rollback.js
    Set-Location $here
    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
    [System.Console]::ReadLine() | Out-Null
}

# Verify setup (updated for new structure)
function Verify-Setup {
    Write-Host "==> Verifying Setup..." -ForegroundColor Cyan
    Write-Host ""
    
    $files = @(
        @{Path = "production/.env"; Name = "Production environment file"},
        @{Path = "development/.env"; Name = "Development environment file"},
        @{Path = "production/config.json"; Name = "Production config"},
        @{Path = "development/config.json"; Name = "Development config"},
        @{Path = "production/src"; Name = "Production source code"},
        @{Path = "development/src"; Name = "Development source code"},
        @{Path = "deploy-dev-to-prod.js"; Name = "Safe deployment script"}
    )
    
    foreach ($file in $files) {
        if (Test-Path $file.Path) {
            Write-Host "✅ $($file.Name)" -ForegroundColor Green
        } else {
            Write-Host "❌ $($file.Name)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "🏗️  Environment Structure:" -ForegroundColor Cyan
    Write-Host "   • Production: Port 3000, production/.env, production/data.sqlite" -ForegroundColor Green
    Write-Host "   • Development: Port 3001, development/.env, development/data-dev.sqlite" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "🛡️  Deployment Protection: Databases and .env files are safe!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your Discord ID: 378501056008683530" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
    [System.Console]::ReadLine() | Out-Null
}

# Test Discord commands (updated for new structure)
function Test-DiscordCommands {
    param([bool]$Development = $false)
    
    try {
        $env = if ($Development) { "Development" } else { "Production" }
        $port = if ($Development) { "3001" } else { "3000" }
        $color = if ($Development) { "Yellow" } else { "Green" }
    
    Write-Host "==> Testing Discord Commands ($env)..." -ForegroundColor $color
    Write-Host ""
    Write-Host "DISCORD COMMAND TEST MENU ($env)" -ForegroundColor $color
    Write-Host "========================================" -ForegroundColor $color
    Write-Host ""
    Write-Host "Your Discord ID: 378501056008683530" -ForegroundColor Cyan
    Write-Host "Test these commands in your Discord server:" -ForegroundColor White
    Write-Host ""
    
    Write-Host "DEPLOYMENT COMMANDS (Owner Only):" -ForegroundColor Magenta
    Write-Host "   - /deploy status     - Check deployment status" -ForegroundColor White
    Write-Host "   - /deploy backup     - Create manual backup" -ForegroundColor White  
    Write-Host "   - /deploy deploy     - Deploy to production" -ForegroundColor White
    Write-Host "   - /deploy rollback   - Rollback deployment" -ForegroundColor White
    Write-Host "   - /deploy restart    - Restart server" -ForegroundColor White
    Write-Host ""
    
    Write-Host "GENERAL COMMANDS:" -ForegroundColor Blue
    Write-Host "   - /info             - Bot information" -ForegroundColor White
    Write-Host "   - /help             - Command help" -ForegroundColor White
    Write-Host "   - /boss             - Boss battle commands" -ForegroundColor White
    Write-Host "   - /inventory        - View inventory" -ForegroundColor White
    Write-Host "   - /shop             - Access shop" -ForegroundColor White
    Write-Host ""
    
    Write-Host "WEB INTERFACE:" -ForegroundColor Green
    Write-Host "   - http://localhost:$port - Web interface" -ForegroundColor White
    if (!$Development) {
        Write-Host "   - https://questcord.fun - Live website" -ForegroundColor White
    }
    Write-Host ""
    
    Write-Host "TEST INSTRUCTIONS:" -ForegroundColor Yellow
    Write-Host "1. Make sure your $env bot is running" -ForegroundColor White
    Write-Host "2. Go to your Discord test server" -ForegroundColor White
    Write-Host "3. Try the commands listed above" -ForegroundColor White
    Write-Host "4. Check the web interface in your browser" -ForegroundColor White
    Write-Host "5. Verify all features are working correctly" -ForegroundColor White
        Write-Host ""
        
        Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
        [System.Console]::ReadLine() | Out-Null
    } catch {
        Write-Host ""
        Write-Host "Error in Test-DiscordCommands: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
        [System.Console]::ReadLine() | Out-Null
    }
}

# Deploy Discord commands (updated for new structure)
function Deploy-Commands {
    param([bool]$Development = $false)
    
    if ($Development) {
        Write-Host "==> Deploying Discord Commands (Development)..." -ForegroundColor Yellow
        npm run deploy:commands:dev
    } else {
        Write-Host "==> Deploying Discord Commands (Production)..." -ForegroundColor Green
        npm run deploy:commands:prod
    }
    
    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
    [System.Console]::ReadLine() | Out-Null
}

# Main menu loop
if ($Mode -eq "") {
    do {
        try {
            Show-Menu
            Write-Host "Select option (0-14): " -ForegroundColor White -NoNewline
            $choice = [System.Console]::ReadLine()
        
        switch ($choice) {
            "1" { Start-Production -IncludeTunnel $true }
            "2" { Start-Production -IncludeTunnel $false }
            "3" { 
                Install-Dependencies -Environment "production"
                Write-Host "==> Starting Production Bot Only (Port 3000)..." -ForegroundColor Green
                Start-Process -FilePath "powershell.exe" -WorkingDirectory $here -ArgumentList @(
                    "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", 
                    "Write-Host 'QuestCord Production Bot - Port 3000' -ForegroundColor Green; npm run start:prod"
                )
                Write-Host "✅ Production bot started!" -ForegroundColor Green
            }
            "4" { Setup-Development }
            "5" { Start-Development }
            "6" { Start-DevelopmentFull }
            "7" { Deploy-Production }
            "8" { Create-Backup }
            "9" { Start-Rollback }
            "10" { 
                try {
                    Test-DiscordCommands -Development $false
                } catch {
                    Write-Host ""
                    Write-Host "Error executing option 10: $($_.Exception.Message)" -ForegroundColor Red
                    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
                    [System.Console]::ReadLine() | Out-Null
                }
            }
            "11" { 
                try {
                    Test-DiscordCommands -Development $true
                } catch {
                    Write-Host ""
                    Write-Host "Error executing option 11: $($_.Exception.Message)" -ForegroundColor Red
                    Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
                    [System.Console]::ReadLine() | Out-Null
                }
            }
            "12" { Verify-Setup }
            "13" { Deploy-Commands -Development $false }
            "14" { Deploy-Commands -Development $true }
            "0" { 
                Write-Host ""
                Write-Host "    ======================================" -ForegroundColor Cyan
                Write-Host "     Thank you for using QuestCord!" -ForegroundColor Yellow
                Write-Host "         See you next time!" -ForegroundColor Magenta
                Write-Host "    ======================================" -ForegroundColor Cyan
                Write-Host ""
                exit 
            }
            default { 
                Write-Host ""
                Write-Host "    [X] Invalid option. Please select 0-14." -ForegroundColor Red
                Start-Sleep -Seconds 2
            }
        }
        
        if ($choice -ne "0" -and $choice -in @("1","2","3","5","6")) {
            Write-Host ""
            Write-Host "Press Enter to return to menu..." -ForegroundColor Yellow -NoNewline
            [System.Console]::ReadLine() | Out-Null
        }
        
        } catch {
            Write-Host ""
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Press Enter to continue..." -ForegroundColor Yellow -NoNewline
            [System.Console]::ReadLine() | Out-Null
        }
        
    } while ($choice -ne "0")
} else {
    # Direct mode execution
    switch ($Mode.ToLower()) {
        "production" { Start-Production }
        "dev" { Start-Development }
        "development" { Start-Development }
        "setup" { Setup-Development }
        default { 
            Write-Host "Unknown mode: $Mode" -ForegroundColor Red
            Write-Host "Available modes: production, dev, setup" -ForegroundColor Yellow
        }
    }
}