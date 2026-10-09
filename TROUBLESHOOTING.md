# Troubleshooting Guide

This comprehensive guide covers common issues, error messages, and their solutions for BellePoule Modern users.

## 📋 Table of Contents

1. [FFF File Parsing Problems](#fff-file-parsing-problems)
2. [Remote Score Connection Issues](#remote-score-connection-issues)
3. [Database Problems](#database-problems)
4. [Performance Issues](#performance-issues)
5. [Application Startup Issues](#application-startup-issues)
6. [Import/Export Failures](#importexport-failures)
7. [Network and Firewall Issues](#network-and-firewall-issues)
8. [System-Specific Issues](#system-specific-issues)

## 🇫🇷 FFF File Parsing Problems

### Issue: Names with Commas Not Recognized

**Symptoms**:

- Error: "Line X: Format invalide - au moins NOM et PRENOM requis"
- Fencer count is lower than expected
- Names with hyphens or commas show as garbled text

**Common Problem Examples**:

```
LE-FLOCH,JEAN-BAPTISTE,15/03/1995,M,FRA,,12345678,ÎLE-DE-FRANCE,SAINT-CLOUD,12
D'URBAN,JEAN,10/05/1998,M,FRA,,98765432,RHÔNE-ALPES,LYON-URBAN,25
```

**Solutions**:

#### 1. Automatic Detection (Recommended)

BellePoule Modern automatically detects mixed formats. Ensure:

- File is saved as UTF-8
- No extra spaces before/after lines
- Consistent format throughout file

#### 2. Manual Format Correction

Convert mixed format to standard FFF:

**Before (problematic)**:

```
LE-FLOCH,JEAN-BAPTISTE,15/03/1995,M,FRA,,12345678,ÎLE-DE-FRANCE,SAINT-CLOUD,12
```

**After (correct)**:

```
LE-FLOCH;JEAN-BAPTISTE;M;15/03/1995;FRA;ÎLE-DE-FRANCE;SAINT-CLOUD;12345678;12
```

#### 3. Quoted Format (Alternative)

```
"LE-FLOCH";"JEAN-BAPTISTE";"M";"15/03/1995";"FRA";"ÎLE-DE-FRANCE";"SAINT-CLOUD";"12345678";"12"
```

#### 4. Excel Conversion Steps

1. Open file in Excel
2. Select "Data" → "From Text/CSV"
3. Set delimiter to semicolon (;)
4. Select "UTF-8" encoding
5. Load and re-export with proper formatting

### Issue: Special Characters Lost (Accents, Ñ, etc.)

**Symptoms**:

- French accents become `?` or garbled text
- Names like `Édouard` appear as `?douard`
- Club names with special characters corrupted

**Causes**:

- File saved with wrong encoding (ASCII instead of UTF-8)
- BOM (Byte Order Mark) interference
- Text editor not supporting UTF-8

**Solutions**:

#### 1. Check and Fix Encoding

**Windows**:

- Open with Notepad++ → Encoding → "Convert to UTF-8"
- Save file with UTF-8 encoding

**Mac/Linux**:

```bash
# Check current encoding
file -I filename.csv

# Convert to UTF-8
iconv -f ISO-8859-1 -t UTF-8 input.csv > output_utf8.csv

# Remove BOM if present
sed -i '1s/^\xEF\xBB\xBF//' filename.csv
```

#### 2. Use Proper Text Editors

- **Notepad++** (Windows): Full UTF-8 support
- **Sublime Text**: Multi-platform, UTF-8 aware
- **Visual Studio Code**: Built-in UTF-8 handling
- **TextEdit** (Mac): Save with UTF-8 option

#### 3. Validate Before Import

Test with a small sample:

```
DUPONT;Édouard;M;15/03/1995;FRA;Île-de-France;Paris Escrime;12345678;12
MARTÍNEZ;José;M;22/07/1998;ESP;Madrid;Real Madrid;87654321;5
```

### Issue: Date Format Not Recognized

**Symptoms**:

- Error: "Ligne X: Date non reconnue 'YYYY-MM-DD'"
- Birth dates not imported
- Warnings about invalid date formats

**Problem Formats**:

```
1995-03-15    # Wrong order
15.03.1995    # Wrong separator
15-MAR-1995   # Text month
15/03/95      # 2-digit year
```

**Solutions**:

#### 1. Supported Date Formats

Use these formats for compatibility:

- `DD/MM/YYYY` (recommended): `15/03/1995`
- `DD-MM-YYYY`: `15-03-1995`
- `YYYY/MM/DD`: `1995/03/15`
- `YYYY-MM-DD`: `1995-03-15`

#### 2. Batch Date Conversion

**Excel Method**:

1. Select date column
2. Data → Text to Columns
3. Choose date format: DMY or MDY
4. Format cells as dd/mm/yyyy

**Text Editor Method** (Regex):

- Find: `(\d{4})-(\d{2})-(\d{2})`
- Replace: `\3/\2/\1`

#### 3. Manual Entry for Edge Cases

For persistent date issues:

1. Import with empty dates
2. Edit fencer profiles individually
3. Enter dates manually through the interface

### Issue: Header Detection Problems

**Symptoms**:

- First line of fencer data skipped
- Import reports 0 fancers
- Header lines treated as data

**Common Headers**:

```
FFF;UTF8;X
NOM;PRENOM;SEXE;DATE_NAISSANCE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT
Nom;Prénom;Sexe;Date de naissance;Nation;Ligue;Club;Licence;Classement
```

**Solutions**:

#### 1. Clean Header Lines

Keep only data lines:

```
DUPONT;Jean;M;15/03/1995;FRA;Île-de-France;Paris Escrime;12345678;12
MARTIN;Marie;F;22/07/1998;FRA;Provence;Marseille Club;87654321;8
```

#### 2. Use Consistent Header

```
NOM;PRENOM;SEXE;DATE_NAISSANCE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT
```

## 📱 Remote Score Connection Issues

### Issue: "Impossible de se connecter"

**Symptoms**:

- Tablets show connection error
- Browser can't reach the scoring interface
- Status shows offline/disconnected

**Diagnosis Steps**:

#### 1. Check Network Connectivity

```bash
# On main computer
ipconfig  # Windows
ifconfig  # Mac/Linux

# From tablet
ping 192.168.1.100  # Replace with computer IP
```

#### 2. Verify Server Status

**In BellePoule Modern**:

1. Check the "📡 Saisie distante" tab
2. Panel must read "Saisie distante active"
3. Note the displayed network URL and port (8066, or the next free port if 8066 was busy)

**Expected**:

```
https://192.168.1.100:8066      (http:// if HTTPS is unchecked)
```

#### 3. Test Server Locally

On the main computer, open browser:

```
https://localhost:8066/lobby
```

If this fails, the server isn't running. With HTTPS, accept the self-signed certificate
warning first (also on each tablet).

**Solutions**:

#### 1. Restart Remote Server

1. Go to the "📡 Saisie distante" tab
2. Stop the remote scoring
3. Wait 5 seconds
4. Start it again (check the network interface selected in **Réseau**)

#### 2. Check Network Configuration

**WiFi Network Requirements**:

- Same network for all devices
- No captive portals (hotel/coffee shop networks)
- DHCP enabled (not static IP conflicts)

**Network Troubleshooting**:

```bash
# Check if port is open
netstat -an | findstr 8066  # Windows
netstat -an | grep 8066     # Mac/Linux

# Test with telnet
telnet localhost 8066
```

#### 3. Firewall Configuration

**Windows Defender**:

1. Open Windows Defender Firewall
2. Allow "BellePoule Modern" through firewall
3. Add port 8066 to allowed ports

**Mac/Linux**:

```bash
# Check firewall status
sudo ufw status  # Ubuntu
sudo pfctl -s rules  # macOS

# Temporarily disable for testing (not recommended for production)
sudo ufw disable  # Ubuntu
```

#### 4. Antivirus Interference

Temporarily disable antivirus to test:

- Norton, McAfee, Kaspersky
- Corporate security software
- Network-level firewalls

### Issue: "Mot de passe incorrect" / redirect loop on `/login`

There are no per-referee access codes: each arena has an optional password (8 characters
min.) set in the "📡 Saisie distante" tab.

**Solutions**:

1. Check the arena password (or the shared "MDP commun"); clear it to allow free access.
2. "Trop de tentatives": login attempts are rate-limited per IP and arena with progressive
   blocking — wait and retry.
3. Cookies must be allowed (no private browsing): the session is kept in an HttpOnly
   cookie `bp_token_arena{N}` for 8 hours.
4. After a server restart, tablets must log in again.

### Issue: Certificate warning on tablets

HTTPS uses a self-signed certificate generated on the organiser's computer. Accept the
warning once per device (compare the SHA-256 fingerprint shown in the app), or uncheck
**🔒 HTTPS** and restart the remote scoring to use plain HTTP.

### Issue: "Scores not synchronizing"

**Symptoms**:

- Referee submits scores but they don't appear
- Main interface shows old scores
- Connection drops intermittently

**Diagnosis**:

#### 1. Check WebSocket Connection

Look at the header of the referee tablet:

- "Connecté" (green dot): OK
- "Déconnecté" (red dot): socket lost — entry keeps working offline
- 📴 N badge: N score saves queued offline, synchronised automatically on reconnection (⟳ Sync...)

#### 2. Test Manual Sync

1. Finish a match on the tablet (🏁 Terminer → Confirmer)
2. Check the pool/tableau in the application
3. If not appearing: the finish request must succeed online — reconnect and confirm again, or enter the score manually in the application

**Solutions**:

#### 1. Refresh Tablet Browser

1. Press F5 or swipe to refresh
2. Wait for reconnection
3. Test score submission again

#### 2. Check Network Stability

Test with continuous ping:

```bash
ping 192.168.1.100 -t  # Windows (continuous)
ping 192.168.1.100      # Mac/Linux
```

#### 3. Restart Both Sides

1. Save all pending scores
2. Stop remote server
3. Refresh all tablets
4. Restart server
5. Reconnect referees

## 🗄️ Database Problems

### Issue: "Database corrupted"

**Symptoms**:

- Application crashes on startup
- Competition data lost
- Error messages about database files

**Causes**:

- Unexpected shutdown during save
- Disk full during database operation
- File permission issues

**Solutions**:

#### 1. Automatic Recovery

BellePoule Modern has automatic backup:

- Check for backup files in database directory
- Look for `.backup` or `.old` extensions

#### 2. Manual Database Recovery

**Database Locations** (fichier `bellepoule.db`) :

- **Windows**: `%APPDATA%\BellePoule Modern\bellepoule.db`
- **macOS**: `~/Library/Application Support/BellePoule Modern/bellepoule.db`
- **Linux**: `~/.config/BellePoule Modern/bellepoule.db`

> **Sauvegarde automatique** : La base est sauvegardée toutes les **2 minutes** via autosave, et à chaque fermeture de l'application. L'écriture est atomique (fichier `.tmp` puis renommage) pour éviter la corruption en cas de coupure.

**Recovery Steps**:

1. Navigate to database directory
2. Look for recent backup files
3. Replace corrupted file with backup
4. Restart application

#### 3. Export Competition Data

If database accessible but problematic:

1. Open each competition
2. Export to XML format
3. Create new competition
4. Import exported data

### Issue: "Competition not saving"

**Symptoms**:

- Changes not saved after closing
- Auto-save not working
- Manual save fails

**Troubleshooting**:

#### 1. Check Disk Space

```bash
# Windows
dir C:

# Mac/Linux
df -h
```

Ensure at least 500MB free space.

#### 2. Check File Permissions

**Database directory should be writable**:

- Right-click database folder
- Properties → Security
- Ensure write permissions for your user

**Linux/Mac**:

```bash
ls -la ~/.config/bellepoule-modern/
chmod 755 ~/.config/bellepoule-modern/
```

#### 3. Check Antivirus Interference

Some antivirus software blocks database writes:

- Add BellePoule Modern to exceptions
- Disable real-time scanning temporarily
- Use Windows Defender exclusions

### Issue: "Duplicate fencer entries"

**Symptoms**:

- Same fencer appears multiple times
- Competition lists have duplicates
- Ranking calculations incorrect

**Prevention**:

#### 1. Import Validation

Before import, check for duplicates:

- Same name + birth date
- Same license number
- Same club + similar names

#### 2. Merge Duplicates

1. **Identify duplicates**: Sort by name or license
2. **Select best record**: Most complete information
3. **Delete others**: Remove duplicate entries
4. **Re-import missing data**: Add missing fencers only

## ⚡ Performance Issues

### Issue: Slow application response

**Symptoms**:

- Application freezes during operations
- Long delays when switching tabs
- Memory usage constantly increasing

**Causes**:

- Large competitions (>500 fencers)
- Memory leaks
- Disk I/O bottlenecks
- Background processes

**Solutions**:

#### 1. Optimize Competition Size

**Split Large Competitions**:

1. Export current competition
2. Create multiple smaller competitions
3. Manage each separately
4. Merge results if needed

#### 2. Memory Management

**Close Unused Applications**:

- Browser tabs
- Other office applications
- Background processes

**Restart Application**:

- Memory cleared on restart
- Temporary files cleaned
- Database connections reset

#### 3. Hardware Optimization

**Minimum Requirements Check**:

- **RAM**: 4GB minimum, 8GB recommended
- **CPU**: Modern dual-core or better
- **Storage**: SSD preferred over HDD
- **Display**: Dedicated GPU helps with rendering

**System Cleanup**:

```bash
# Clear temporary files
# Windows
%temp%
del /q /f /s %TEMP%\*

# Mac/Linux
rm -rf /tmp/*
rm -rf ~/.cache/*
```

### Issue: Pool generation takes forever

**Symptoms**:

- "Generating pools..." for minutes
- Application becomes unresponsive
- Memory usage spikes during generation

**Causes**:

- Too many fencers for single pool format
- Complex separation rules
- Inefficient algorithm with large datasets

**Solutions**:

#### 1. Optimize Pool Settings

**Reduce Pool Size**:

- Smaller pools (4-5 fencers instead of 6-7)
- More pools with fewer fencers
- Balance for reasonable calculation time

**Simplify Separation Rules**:

- Disable club separation temporarily
- Use only essential separation rules
- Test with minimal rules first

#### 2. Use Multiple Pool Rounds

**Instead of** 1 round with 6 pools:

- **Use** 2 rounds with 3 pools each
- Better performance
- More equitable competition

#### 3. Manual Pool Assignment

For very large competitions:

1. Generate minimal pools automatically
2. Manually adjust assignments
3. Use import/export for bulk changes

## 🚀 Application Startup Issues

### Issue: Application won't start

**Symptoms**:

- Double-click icon does nothing
- Error message on launch
- Brief splash screen then crash

**Windows-Specific**:

#### 1. Missing Visual C++ Redistributables

**Install Microsoft Visual C++ Redistributable**:

- Download from Microsoft website
- Install both x86 and x64 versions
- Restart computer

#### 2. .NET Framework Issues

**Check .NET Framework**:

- Windows 10+: .NET Framework 4.8+ usually included
- Install latest version if missing

#### 3. Windows Defender SmartScreen

**Bypass SmartScreen**:

1. Right-click application → "Properties"
2. Click "Unblock" if present
3. Run application again

**macOS-Specific**:

#### 1. Gatekeeper Protection

**Allow Application**:

1. Right-click BellePoule Modern → "Open"
2. Click "Open" in security dialog
3. Only needed once

#### 2. Missing System Extensions

**Install Required Dependencies**:

```bash
# Install XQuartz (if needed)
brew install --cask xquartz

# Update system packages
brew update && brew upgrade
```

**Linux-Specific**:

#### 1. Missing Libraries

**Install Required Packages**:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xvfb libatspi2.0-0 libdrm2 libxcomposite-dev libxdamage1 libxrandr2 libgbm1 libxkbcommon0 libasound2

# Fedora
sudo dnf install gtk3 libnotify nss libXtst Xvfb at-spi2-core libdrm libXcomposite libXdamage libXrandr libgbm libxkbcommon alsa-lib

# Arch Linux
sudo pacman -S gtk3 libnotify nss libxtst xorg-server-xvfb at-spi2-core libdrm libxcomposite libxdamage libxrandr libgbm libxkbcommon alsa-lib
```

#### 2. Permission Issues

**Fix File Permissions**:

```bash
# Make executable
chmod +x BellePoule.Modern.AppImage

# Fix ownership
sudo chown $USER:$USER BellePoule.Modern.AppImage
```

### Issue: Update fails to install

**Symptoms**:

- Update download fails
- Installation error after download
- Rollback to previous version

**Solutions**:

#### 1. Manual Update

1. Download latest version from GitHub releases
2. Close current application
3. Install new version
4. Copy competition data if needed

#### 2. Clear Update Cache

**Windows**:

```cmd
del /q /f /s "%APPDATA%\bellepoule-modern\updates\*"
```

**Mac/Linux**:

```bash
rm -rf ~/.config/bellepoule-modern/updates/*
```

#### 3. Network Issues

- Check internet connection
- Disable VPN temporarily
- Try different network
- Download from browser instead

## 📤 Import/Export Failures

### Issue: Export produces empty files

**Symptoms**:

- Export completes but files are empty
- Only headers, no data
- File size is 0 bytes

**Causes**:

- No fencer data in competition
- Permissions issues on export directory
- Export format incompatibility

**Solutions**:

#### 1. Verify Competition Data

1. Check fencer list has entries
2. Ensure competition has phases
3. Verify matches have scores

#### 2. Check Export Location

**Choose different directory**:

- Desktop instead of Documents
- External drive with more space
- Temporary folder for testing

#### 3. Test Different Format

- Try XML instead of CSV
- Use simple format first
- Gradually add complexity

### Issue: Import shows wrong encoding

**Symptoms**:

- Accented characters become question marks
- Names corrupted with special characters
- Asian/Arabic characters lost

**Solutions**:

#### 1. Force UTF-8 Encoding

**Save file with UTF-8 BOM**:

- Open in advanced text editor
- "Save As" → "UTF-8 with BOM"
- Import again

#### 2. Use Text Encoding Converter

**Online Tools**:

- Convert files to UTF-8
- Validate character encoding
- Download converted file

#### 3. Manual Character Replacement

For persistent issues:

1. Export problematic names
2. Replace characters manually
3. Import corrected file

## 🔥 Network and Firewall Issues

### Issue: Remote scoring blocked by firewall

**Symptoms**:

- Tablets can't connect
- Connection timeout errors
- Works on localhost but not network

**Solutions**:

#### 1. Configure Windows Firewall

**Add Port Exception**:

1. Open Windows Defender Firewall
2. Advanced Settings → Inbound Rules
3. New Rule → Port → TCP
4. Port: 8066
5. Allow connection
6. Select all profiles
7. Name: "BellePoule Modern Remote"

**Add Application Exception**:

1. Programs → Allow app through firewall
2. Browse to BellePoule Modern executable
3. Check both private and public networks

#### 2. Configure Mac Firewall

**System Preferences** → **Security & Privacy** → **Firewall**:

1. Click "Firewall Options"
2. Add BellePoule Modern
3. Set to "Allow incoming connections"

#### 3. Corporate Network Issues

**Contact IT Department**:

- Request port 8066 opened
- Allow BellePoule Modern executable
- Configure network exceptions

#### 4. Router Configuration

**Port Forwarding** (advanced):

1. Access router admin panel
2. Port forwarding section
3. Forward port 8066 to computer IP
4. Note: Use only for controlled networks

## 💻 System-Specific Issues

### Windows 10/11 Specific

#### Issue: High DPI Scaling Problems

**Symptoms**:

- Interface too small/large
- Text blurry on high-res displays
- Button positioning issues

**Solutions**:

1. Right-click BellePoule Modern → Properties
2. Compatibility tab
3. "Override high DPI scaling"
4. Set to "Application"
5. Check "Disable display scaling on high DPI"

#### Issue: Windows Defender False Positive

**Symptoms**:

- Application blocked as malware
- Security warning on startup
- Automatic removal

**Solutions**:

1. Open Windows Security
2. Virus & threat protection
3. Protection history
4. Restore quarantined file
5. Add exclusion for BellePoule Modern

### macOS Specific

#### Issue: macOS Gatekeeper Block

**Symptoms**:

- "App can't be opened because Apple cannot check it"
- Security warning on first launch

**Solutions**:

1. System Preferences → Security & Privacy
2. General tab
3. Click "Open Anyway" for BellePoule Modern
4. Enter admin password
5. Click "Open" in confirmation dialog

#### Issue: Notarization Issues

**Symptoms**:

- Application damaged after macOS update
- Can't open after system upgrade

**Solutions**:

1. Download latest version from GitHub
2. Trash old application
3. Install new version
4. Run and approve if prompted

### Linux Specific

#### Issue: AppImage Won't Run

**Symptoms**:

- Permission denied error
- Nothing happens when double-clicking
- "Cannot execute binary file"

**Solutions**:

```bash
# Make executable
chmod +x BellePoule.Modern.AppImage

# Try running from terminal
./BellePoule.Modern.AppImage

# Check dependencies
ldd BellePoule.Modern.AppImage

# Install missing libraries
sudo apt install $(ldd BellePoule.Modern.AppImage | grep "not found" | awk '{print $1}')
```

#### Issue: Wayland Compatibility

**Symptoms**:

- Window doesn't appear
- Graphics rendering issues
- Input not working

**Solutions**:

```bash
# Run with XWayland
GDK_BACKEND=x11 ./BellePoule.Modern.AppImage

# Or disable Wayland for specific session
# Edit /etc/gdm3/custom.conf
# Uncomment: WaylandEnable=false
```

## 🧪 Diagnostic Tools

### System Information Collection

Use built-in diagnostic tool:

1. **Menu > Help > System Information**
2. Copy all information
3. Include in bug report

### Log Files Location

**Windows**: `%APPDATA%/bellepoule-modern/logs/`
**Mac**: `~/Library/Logs/bellepoule-modern/`
**Linux**: `~/.local/share/bellepoule-modern/logs/`

### Network Diagnostics

```bash
# Test local connection
curl http://localhost:8066

# Test network connection
curl http://YOUR_IP:8066

# Check open ports
netstat -an | grep 8066
```

### Performance Monitoring

**Windows**:

- Task Manager → Performance tab
- Resource Monitor for detailed stats

**Mac/Linux**:

```bash
# Check memory usage
top -p $(pgrep BellePoule)

# Monitor disk I/O
iotop -o

# Check system load
uptime
```

## 📞 Getting Help

### Built-in Bug Reporter

1. **Menu > Help > Report Bug** (Ctrl+Shift+I)
2. Automatically includes:
   - Application version and build
   - System information
   - Error logs
3. Describe your issue in detail

### Community Support

- **GitHub Issues**: [Report bugs](https://github.com/klinnex/bellepoule-modern/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/klinnex/bellepoule-modern/discussions)
- **Documentation**: [Online Wiki](https://github.com/klinnex/bellepoule-modern/wiki)

### Emergency Recovery

If application completely unusable:

1. Export all competitions to XML format
2. Uninstall BellePoule Modern
3. Download and reinstall latest version
4. Import competitions from XML backups

---

**🎯 Prevention Tips**:

- Regular competition backups
- Keep application updated
- Test imports with small samples first
- Document custom formats and settings
- Train multiple staff members

**📚 Additional Resources**:

- [Installation Guide](INSTALLATION.md)
- [User Manual](USER_MANUAL.md)
- [File Format Specifications](FILE_FORMATS.md)
- [Development Guide](DEVELOPMENT_GUIDE.md)
