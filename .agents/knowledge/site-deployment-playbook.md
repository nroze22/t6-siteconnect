# Site Deployment Playbook

> Comprehensive guide for deploying, configuring, troubleshooting, and maintaining TalOS SiteConnect at clinical research sites.

---

## Table of Contents

1. [Hardware Requirements](#1-hardware-requirements)
2. [Supported Operating Systems](#2-supported-operating-systems)
3. [Installation Guide](#3-installation-guide)
4. [IT Security Assessment Package](#4-it-security-assessment-package)
5. [Troubleshooting Guide](#5-troubleshooting-guide)
6. [Data Backup and Restore](#6-data-backup-and-restore)
7. [Uninstall Procedures](#7-uninstall-procedures)
8. [Update Procedures](#8-update-procedures)

---

## 1. Hardware Requirements

### Tier Overview

| Tier | RAM | CPU | Free Disk | LLM Model | Available Features |
|------|-----|-----|-----------|-----------|-------------------|
| **Minimum** | 4 GB | 2 cores (x64) | 2 GB | None | Rule-based screening, data import/export, analytics, sponsor pitches (template-based only) |
| **Recommended** | 8 GB | 4 cores (x64 or ARM) | 8 GB | Gemma-1B (Q8_0, ~1.2 GB) | All Minimum features + basic AI screening, column auto-mapping, simple entity extraction |
| **Optimal** | 16 GB+ | 4+ cores (x64 or ARM) | 12 GB | BioMistral-7B (Q4_K_M, ~4.5 GB) | All features: full AI screening, complex criteria parsing, NER from clinical notes, AI-powered pitch content |

### Detailed Requirements

**CPU:**
- x86_64 (Intel/AMD) with SSE4.2 or AVX2 support (most CPUs from 2013+)
- Apple Silicon (M1/M2/M3) fully supported and recommended for macOS — leverages Metal GPU acceleration for LLM inference
- ARM64 Windows is NOT currently supported

**RAM:**
- Minimum tier: 4 GB total system RAM; SiteConnect uses ~500 MB without LLM
- Recommended tier: 8 GB total; Gemma-1B requires ~2 GB during inference
- Optimal tier: 16 GB total; BioMistral-7B requires ~6-8 GB during inference
- Available RAM matters more than total RAM — close other applications during screening if near the threshold

**Disk:**
- Application binary: ~150 MB (includes WebView2 bootstrapper on Windows)
- Gemma-1B model (Q8_0): ~1.2 GB
- BioMistral-7B model (Q4_K_M): ~4.5 GB
- BioMistral-7B model (Q5_K_M, optimal quality): ~5.3 GB
- Patient database: ~1 MB per 1,000 patients (with indexes and embeddings)
- Embedding model (all-MiniLM-L6-v2): ~80 MB
- Temporary space during import: up to 2x the size of the import file

**Display:**
- Minimum resolution: 1280x720
- Recommended: 1920x1080 or higher
- Scaling: 100%-200% display scaling supported

### Performance Expectations by Tier

| Operation | Minimum Tier | Recommended Tier | Optimal Tier |
|-----------|-------------|-----------------|--------------|
| Data import (10,000 patients) | 15-30 sec | 10-20 sec | 8-15 sec |
| Rule-based screening (1,000 patients, 10 criteria) | 2-5 sec | 1-3 sec | 1-2 sec |
| AI screening per criterion per patient | N/A | 1-3 sec (Gemma) | 3-8 sec (BioMistral) |
| Full AI screening (1,000 patients, 10 criteria) | N/A | 3-8 hours | 8-22 hours |
| Vector similarity search (10,000 patients) | 1-2 sec | <1 sec | <1 sec |
| Report/pitch generation | 1-2 sec (template) | 5-10 sec (AI) | 10-20 sec (AI) |

**Note on AI screening time**: AI screening is designed to run as a background batch process. Users can continue working while screening runs. Progress is displayed in real-time. Screening can be paused and resumed.

---

## 2. Supported Operating Systems

### Windows

| Version | Architecture | Status |
|---------|-------------|--------|
| Windows 11 | x64 | Fully Supported |
| Windows 10 (21H2+) | x64 | Fully Supported |
| Windows 10 (older) | x64 | Best Effort (may work, not tested) |
| Windows Server | Any | Not Supported |
| Windows on ARM | ARM64 | Not Supported |

**Windows prerequisites:**
- Microsoft WebView2 Runtime (bundled with installer; also pre-installed on Windows 11 and recent Windows 10 updates)
- Microsoft Visual C++ Redistributable 2019+ (bundled with installer)

### macOS

| Version | Architecture | Status |
|---------|-------------|--------|
| macOS 15 (Sequoia) | Apple Silicon | Fully Supported |
| macOS 14 (Sonoma) | Apple Silicon, Intel | Fully Supported |
| macOS 13 (Ventura) | Apple Silicon, Intel | Fully Supported |
| macOS 12 (Monterey) | Apple Silicon, Intel | Supported |
| macOS 11 (Big Sur) | Apple Silicon, Intel | Not Supported |

**macOS prerequisites:**
- No additional prerequisites; all dependencies bundled in the .app bundle
- Gatekeeper must allow the application (handled by code signing + notarization)

### Linux

Linux is **not officially supported** in the initial release. Tauri v2 supports Linux, and a future release may add Linux builds. The primary constraint is testing and support resources, not technical feasibility.

---

## 3. Installation Guide

### Standard Install (Download from Web)

**Step 1: Download the installer**

Navigate to the TalOS SiteConnect download page (URL provided by your TalOS representative). Select the correct installer for your operating system:
- Windows: `TalOS-SiteConnect-1.x.x-x64-setup.exe`
- macOS Intel: `TalOS-SiteConnect-1.x.x-x64.dmg`
- macOS Apple Silicon: `TalOS-SiteConnect-1.x.x-aarch64.dmg`

If you are unsure which macOS version to download: click the Apple menu, select "About This Mac." If the Chip field says "Apple M1/M2/M3," download the Apple Silicon version. If it says "Intel," download the Intel version.

**Step 2: Run the installer**

*Windows:*
1. Double-click the `.exe` installer
2. If Windows SmartScreen appears: click "More info" then "Run anyway" (the installer is signed; SmartScreen reputation builds over time)
3. Accept the license agreement
4. Choose the installation directory (default: `C:\Program Files\TalOS SiteConnect\`)
5. Click "Install" and wait for completion
6. Click "Finish" to launch the application

*macOS:*
1. Double-click the `.dmg` file to mount it
2. Drag the "TalOS SiteConnect" icon to the Applications folder
3. Eject the DMG
4. Open "TalOS SiteConnect" from Applications
5. If Gatekeeper prompts "TalOS SiteConnect is from an identified developer": click "Open"
6. If Gatekeeper blocks the app (should not happen with notarization): go to System Settings > Privacy & Security > click "Open Anyway"

**Step 3: First-run setup wizard**

On first launch, SiteConnect presents a setup wizard:

1. **Welcome screen**: Brief overview of the application
2. **Create passphrase**: Enter a strong passphrase (minimum 12 characters, recommended 16+). This passphrase encrypts all patient data. **If lost, data cannot be recovered.** Write it down and store securely per your site's password policy.
3. **Confirm passphrase**: Re-enter the passphrase for verification
4. **Hardware check**: The application detects available RAM, CPU, and disk space. Displays which tier the system qualifies for and which LLM models can run.
5. **Model selection** (if hardware permits):
   - "No AI model" — rule-based screening only
   - "Gemma-1B (Recommended for 8GB systems)" — downloads ~1.2 GB
   - "BioMistral-7B (Recommended for 16GB+ systems)" — downloads ~4.5 GB
6. **Model download** (if selected): Progress bar with estimated time. Download can be paused and resumed. SHA-256 checksum verification runs automatically after download.
7. **Setup complete**: Application opens to the main dashboard

### USB Edge Pack Install (Air-Gapped)

For sites with no internet access or strict network policies, the USB Edge Pack provides a complete offline installation.

**USB Edge Pack contents:**
```
USB Drive/
├── installers/
│   ├── TalOS-SiteConnect-1.x.x-x64-setup.exe
│   ├── TalOS-SiteConnect-1.x.x-x64.dmg
│   └── TalOS-SiteConnect-1.x.x-aarch64.dmg
├── models/
│   ├── gemma-1b-q8_0.gguf
│   ├── biomistral-7b-q4_k_m.gguf
│   ├── all-MiniLM-L6-v2.onnx
│   └── checksums.sha256
├── studies/
│   └── (pre-loaded study definitions, if applicable)
├── README.txt
└── verify.bat / verify.sh
```

**Step 1: Verify USB integrity**

Run the verification script before installation:
- Windows: Double-click `verify.bat`
- macOS: Open Terminal, navigate to USB, run `./verify.sh`

This verifies SHA-256 checksums of all files on the USB against expected values.

**Step 2: Install the application**

Follow the same platform-specific installation steps as the standard install, but run the installer from the USB drive.

**Step 3: First-run setup wizard (modified for USB)**

The setup wizard detects the USB drive and offers to copy models directly instead of downloading:

1. Welcome, passphrase creation, and hardware check proceed as normal
2. **Model selection**: "Install from USB" option appears alongside download options
3. **Model copy**: Files are copied from USB to the application's data directory. Checksum verification runs on the copied files.
4. **Pre-loaded studies** (if included): Option to import study definitions from USB
5. Setup complete

**Step 4: Eject and secure the USB drive**

After installation, eject the USB drive. Store it in a secure location per your site's removable media policy. The USB does not contain any patient data.

### Model Download Details

If downloading models after installation (from Settings > AI Model):

- Downloads use HTTPS from TalOS CDN
- Progress is displayed with: percentage, download speed, estimated time remaining
- **Pause/resume**: Click "Pause" to stop the download. The partial file is retained. Click "Resume" to continue from where it left off.
- **Verification**: After download completes, SHA-256 checksum is computed and compared against the expected value. If verification fails, the file is deleted and the user is prompted to retry.
- **Disk space check**: Before starting the download, available disk space is verified. If insufficient, a clear message is shown.

---

## 4. IT Security Assessment Package

Pre-built responses to common IT security questionnaire questions. These can be provided to site IT departments during the security review process.

### Data and Privacy

**Q: Does this application transmit PHI (Protected Health Information)?**
A: No. All patient data processing occurs locally on the workstation. No patient data is transmitted over any network. The application functions fully offline. An optional, opt-in telemetry feature transmits only k-anonymized aggregate statistics (e.g., "847 patients screened for diabetes study") — never individual patient data. Telemetry is off by default.

**Q: What patient data does it store?**
A: Imported patient data (demographics, diagnoses, medications, lab results) is stored in a SQLCipher-encrypted SQLite database on the local disk. The database is encrypted with AES-256-CBC, with the encryption key derived from a user-provided passphrase via PBKDF2-HMAC-SHA512 (256,000 iterations).

**Q: Does this modify our EMR or any clinical system?**
A: No. SiteConnect is a read-only tool. It imports data from CSV or Excel files exported from the EMR. It has no ability to write back to the EMR, connect to EMR databases, or modify any clinical system. It does not install drivers, browser extensions, or system services that interact with other applications.

**Q: How is data encrypted?**
A: Patient data is encrypted at rest using AES-256-CBC via SQLCipher (an open-source, audited encryption extension for SQLite). The encryption key is derived from a user-chosen passphrase using PBKDF2-HMAC-SHA512 with 256,000 iterations. Each database page includes an HMAC-SHA512 for integrity verification.

**Q: What happens if the device is lost or stolen?**
A: All patient data on the device is encrypted at rest. Without the user's passphrase, the data is computationally infeasible to access. The database file is indistinguishable from random data. SQLCipher's PBKDF2 key derivation with 256,000 iterations provides strong resistance to brute-force attacks.

### Network and Architecture

**Q: Does this require network access?**
A: No. SiteConnect is fully functional offline. Network access is only used for: (1) downloading the application installer and AI model files during initial setup, (2) optionally importing study definitions from ClinicalTrials.gov, and (3) optional opt-in telemetry. None of these involve patient data transmission.

**Q: What network ports does it use?**
A: SiteConnect uses only localhost (127.0.0.1) ports for internal communication between the application frontend and the LLM inference sidecar. No external-facing network ports are opened. Typical internal port: 8384 (configurable). Firewall rules do not need to be modified.

**Q: Does it require a VPN or network connection to a cloud service?**
A: No. There is no cloud component. All processing — including AI/LLM inference — runs locally on the workstation.

**Q: What external services does it connect to?**
A: Only when explicitly initiated by the user: (1) TalOS CDN for model downloads (HTTPS, certificate-pinned), (2) ClinicalTrials.gov API for study imports (HTTPS), (3) TalOS API for opt-in telemetry (HTTPS, certificate-pinned). All connections use TLS 1.2+. No connections are made automatically or in the background.

### Compliance

**Q: Is it HIPAA compliant?**
A: SiteConnect operates under the HIPAA "preparatory to research" provision (45 CFR 164.512(i)(1)(ii)). Patient data is used by covered entity workforce members to determine study feasibility — not for research itself. No Business Associate Agreement (BAA) is required because no PHI is transmitted to TalOS or any third party. Data remains entirely within the covered entity's control on their own workstation.

**Q: Can multiple users share it?**
A: The current version is single-user per installation. Each installation has one passphrase and one encrypted database. Multi-user support with role-based access is planned for a future release. For sites requiring multiple users, install separate instances on separate workstations or user profiles.

**Q: Is there an audit trail?**
A: Yes. SiteConnect maintains a local, append-only audit log of all sensitive operations (data imports, screening runs, exports, setting changes, login attempts). The audit log is stored in the encrypted database with HMAC-SHA256 integrity checksums on each entry. The audit log can be exported for review.

**Q: Has it undergone a security audit?**
A: [To be completed based on actual audit status. Include references to: penetration testing reports, code review results, SQLCipher's independent audit history, and Tauri's security architecture documentation.]

### Installation and Maintenance

**Q: Does it require administrator/root privileges?**
A: Installation requires administrator privileges (standard for application installation). After installation, the application runs under the standard user account with no elevated privileges.

**Q: Does it install any system services, drivers, or kernel extensions?**
A: No. SiteConnect is a user-space application. It installs no services, drivers, scheduled tasks, kernel extensions, or startup items. The LLM sidecar runs as a child process of the main application and terminates when the application closes.

**Q: How do we uninstall it?**
A: Standard OS uninstall process (Windows: Add/Remove Programs; macOS: drag to Trash). An optional "Secure Wipe" feature overwrites the encrypted database file with random data before deletion, providing defense-in-depth beyond the existing encryption.

**Q: How are updates delivered?**
A: Updates are delivered as new installer packages (same distribution channel as initial install). The application checks for updates on launch (if network-connected) and notifies the user. Updates are never installed automatically — the user must explicitly download and install. For air-gapped sites, updated USB Edge Packs are provided.

---

## 5. Troubleshooting Guide

### Application Will Not Start

**Windows: "WebView2 Runtime is not installed"**
- Cause: Microsoft WebView2 Runtime is missing (rare on Windows 11, possible on Windows 10)
- Fix: Download and install WebView2 Runtime from https://developer.microsoft.com/en-us/microsoft-edge/webview2/
- The SiteConnect installer normally handles this automatically; this error indicates the bootstrapper failed

**Windows: "VCRUNTIME140.dll not found"**
- Cause: Visual C++ Redistributable is missing
- Fix: Download and install Microsoft Visual C++ Redistributable 2019 (x64) from https://aka.ms/vs/17/release/vc_redist.x64.exe

**Windows: SmartScreen blocks the application**
- Cause: Application reputation has not been established with SmartScreen (common for new releases, even with valid Authenticode signature)
- Fix: Click "More info" then "Run anyway." This is a one-time action.

**macOS: "TalOS SiteConnect cannot be opened because the developer cannot be verified"**
- Cause: Gatekeeper is blocking the application (should not happen if notarization is current)
- Fix: Go to System Settings > Privacy & Security > scroll down to the security message > click "Open Anyway"
- If this persists, run in Terminal: `xattr -cr /Applications/TalOS\ SiteConnect.app`

**macOS: Application crashes immediately on launch**
- Cause: Likely a code signing or entitlements issue
- Fix: Check Console.app for crash reports. Verify the app is properly signed: `codesign --verify --deep /Applications/TalOS\ SiteConnect.app`

**Both platforms: Application shows white/blank screen**
- Cause: WebView failed to initialize
- Fix:
  1. Check if another instance is already running (check Task Manager / Activity Monitor)
  2. Delete the WebView cache directory:
     - Windows: `%APPDATA%\com.talos.siteconnect\EBWebView\`
     - macOS: `~/Library/WebKit/com.talos.siteconnect/`
  3. Restart the application

### LLM Not Loading

**"Insufficient memory to load model"**
- Cause: Not enough free RAM for the selected model
- Fix:
  1. Close other applications to free memory
  2. Switch to a smaller model (Gemma-1B instead of BioMistral-7B)
  3. Use a more aggressive quantization (Q4_K_S instead of Q4_K_M)
  4. If no model can fit, use rule-based screening only

**"Model file corrupted or missing"**
- Cause: Model file failed checksum verification, or the file was deleted/moved
- Fix:
  1. Go to Settings > AI Model
  2. Click "Verify Model" — if verification fails, click "Re-download"
  3. For USB installs, re-copy the model file from the USB Edge Pack
  4. Ensure the model file is in the expected location:
     - Windows: `%APPDATA%\com.talos.siteconnect\models\`
     - macOS: `~/Library/Application Support/com.talos.siteconnect/models/`

**"LLM sidecar failed to start"**
- Cause: The llama.cpp sidecar process could not be spawned
- Fix:
  1. Check if another process is using the sidecar port (default: 8384)
  2. macOS: Check System Settings > Privacy & Security > Developer Tools — ensure Terminal/SiteConnect is allowed
  3. Restart the application

**Slow LLM inference**
- Cause: CPU-only inference on a system without AVX2, or insufficient RAM causing swap usage
- Fix:
  1. Apple Silicon: Verify Metal GPU acceleration is being used (check log output for "Metal" backend)
  2. Intel/AMD: Verify AVX2 support. On Windows, check with CPU-Z. Without AVX2, inference is significantly slower.
  3. Check Activity Monitor / Task Manager for swap/page file usage — if the system is swapping, the model is too large for available RAM

### Import Errors

**"Unable to read file: encoding error"**
- Cause: The file uses an encoding other than UTF-8 (common with older EMR exports using Windows-1252 or ISO-8859-1)
- Fix:
  1. Open the file in a text editor (Notepad++, VS Code)
  2. Re-save with UTF-8 encoding
  3. Or: specify the encoding in the import dialog (SiteConnect supports UTF-8, Windows-1252, ISO-8859-1)

**"Date format not recognized"**
- Cause: Dates in the file use a format not automatically detected
- Fix: In the import dialog, manually specify the date format:
  - US format: MM/DD/YYYY
  - ISO format: YYYY-MM-DD
  - European format: DD/MM/YYYY
  - With time: YYYY-MM-DD HH:MM:SS
  - Excel serial date: (numeric value — SiteConnect converts automatically)

**"File is locked by another program"**
- Cause: The CSV/Excel file is open in another application (Excel commonly holds file locks)
- Fix: Close the file in Excel (or other application) before importing. Alternatively, make a copy of the file and import the copy.

**"Column mapping failed"**
- Cause: Column headers could not be automatically mapped to SiteConnect fields
- Fix: Use the manual column mapping interface. See `biomistral-clinical-prompts.md` Section 5 for the AI-assisted mapping feature (requires LLM).

**Import hangs or is extremely slow**
- Cause: Very large file (100,000+ rows) or complex Excel workbook
- Fix:
  1. For large files, split into batches of 50,000 rows
  2. For Excel files with complex formatting, save as CSV first
  3. Close unnecessary applications to free memory
  4. Check disk space — imports require temporary space

### Slow Screening

**Screening takes hours**
- Cause: AI screening with BioMistral-7B processes each patient-criterion pair through the LLM (3-8 seconds each). For 1,000 patients x 10 criteria = 10,000 evaluations.
- Fix:
  1. Use rule-based screening first (seconds), then AI screening only for criteria that cannot be evaluated by rules
  2. Reduce batch size: screen 100-200 patients at a time
  3. Use Gemma-1B for initial pass (faster), BioMistral-7B only for complex criteria
  4. Let screening run overnight as a background process

### Database Issues

**"Database is locked"**
- Cause: Another instance of SiteConnect is running, or the previous instance did not shut down cleanly
- Fix:
  1. Check Task Manager / Activity Monitor for other SiteConnect processes
  2. If found, terminate them
  3. If not found, the lock file may be stale:
     - Windows: Delete `%APPDATA%\com.talos.siteconnect\siteconnect.db-wal` and `siteconnect.db-shm`
     - macOS: Delete `~/Library/Application Support/com.talos.siteconnect/siteconnect.db-wal` and `siteconnect.db-shm`
  4. Restart SiteConnect

**"Incorrect passphrase" (but passphrase is correct)**
- Cause: Database file may be corrupted, or the wrong database file is being opened
- Fix:
  1. Verify you are using the correct passphrase (check for caps lock, input method)
  2. If the database file was moved or copied, ensure it was not corrupted during transfer
  3. If the database is corrupted beyond recovery, restore from backup (see Section 6)

---

## 6. Data Backup and Restore

### Backup Strategy

**What to back up:**
- The encrypted database file (`siteconnect.db`)
- Location:
  - Windows: `%APPDATA%\com.talos.siteconnect\siteconnect.db`
  - macOS: `~/Library/Application Support/com.talos.siteconnect/siteconnect.db`

**What NOT to back up (can be regenerated):**
- Model files (re-downloadable)
- WAL/SHM files (SQLite journal files — transient)
- WebView cache

**How to back up:**
1. Close SiteConnect completely (ensure no process is running)
2. Copy the `siteconnect.db` file to your backup location (external drive, network share, etc.)
3. The backup file is encrypted — it requires the passphrase to access, so it is safe to store on non-encrypted media

**Backup frequency recommendation:**
- After every major data import
- Weekly if actively used
- Before any application update

### Restore from Backup

1. Close SiteConnect completely
2. Rename the current database file (e.g., `siteconnect.db.old`)
3. Copy the backup file to the database location with the name `siteconnect.db`
4. Launch SiteConnect and enter the passphrase that was active when the backup was created
5. Verify data integrity by checking patient counts and running an audit log integrity check

**Important**: If the passphrase was changed after the backup was created, the backup requires the OLD passphrase. Keep a record of passphrase changes and which backups correspond to which passphrase.

### Export as Backup Alternative

For a portable, human-readable backup:
1. Export all patients to CSV (with PHI — requires passphrase re-entry)
2. Export all screening results to CSV
3. Export audit log to CSV
4. Store these files securely

**Caveat**: Re-importing from CSV does not restore screening results, study configurations, or audit history. It only restores patient data. The encrypted database backup is the preferred backup method.

---

## 7. Uninstall Procedures

### Standard Uninstall

**Windows:**
1. Open Settings > Apps > Apps & features
2. Find "TalOS SiteConnect"
3. Click "Uninstall"
4. Follow the uninstall wizard

Remaining after standard uninstall (manual cleanup if desired):
- `%APPDATA%\com.talos.siteconnect\` (database, models, configuration)
- Registry key: `HKCU\Software\TalOS\SiteConnect` (window position, UI preferences)

**macOS:**
1. Drag "TalOS SiteConnect" from Applications to Trash
2. Empty Trash

Remaining after standard uninstall (manual cleanup if desired):
- `~/Library/Application Support/com.talos.siteconnect/` (database, models, configuration)
- `~/Library/Preferences/com.talos.siteconnect.plist` (UI preferences)
- `~/Library/WebKit/com.talos.siteconnect/` (WebView cache)
- Keychain entry: "com.talos.siteconnect" (session key)

### Secure Wipe Uninstall

For complete data destruction:

**Option A: Use the in-app Secure Wipe feature (before uninstalling)**
1. Open SiteConnect > Settings > Data Management
2. Click "Secure Wipe All Data"
3. Enter passphrase to confirm
4. The application overwrites the database file with random data (3 passes) and deletes it
5. Then proceed with standard uninstall

**Option B: Manual secure wipe (after uninstalling)**

*Windows (PowerShell, run as Administrator):*
```powershell
# Overwrite database file with random data
$dbPath = "$env:APPDATA\com.talos.siteconnect\siteconnect.db"
if (Test-Path $dbPath) {
    $size = (Get-Item $dbPath).Length
    $random = New-Object byte[] $size
    (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($random)
    [System.IO.File]::WriteAllBytes($dbPath, $random)
    Remove-Item $dbPath -Force
}

# Remove entire data directory
Remove-Item "$env:APPDATA\com.talos.siteconnect" -Recurse -Force

# Remove registry entries
Remove-Item "HKCU:\Software\TalOS\SiteConnect" -Recurse -Force -ErrorAction SilentlyContinue
```

*macOS (Terminal):*
```bash
# Overwrite database file with random data
DB_PATH=~/Library/Application\ Support/com.talos.siteconnect/siteconnect.db
if [ -f "$DB_PATH" ]; then
    dd if=/dev/urandom of="$DB_PATH" bs=1 count=$(stat -f%z "$DB_PATH") 2>/dev/null
    rm -f "$DB_PATH"
fi

# Remove entire data directory
rm -rf ~/Library/Application\ Support/com.talos.siteconnect/
rm -rf ~/Library/WebKit/com.talos.siteconnect/
rm -f ~/Library/Preferences/com.talos.siteconnect.plist

# Remove Keychain entry
security delete-generic-password -s "com.talos.siteconnect" 2>/dev/null
```

**Note on SSD secure wipe limitations**: On SSDs, overwriting a file does not guarantee the original data is destroyed at the physical level (due to wear leveling). However, since the database is encrypted with AES-256, the data is already protected. The secure wipe provides defense-in-depth, not primary protection.

---

## 8. Update Procedures

### Auto-Update Flow (Network Connected)

1. On application launch, SiteConnect checks for updates via HTTPS to TalOS CDN
2. If an update is available, a non-intrusive banner appears: "Update available: v1.3.0. What's new | Update now | Remind me later"
3. Clicking "Update now" downloads the new installer in the background
4. Download is verified (SHA-256 checksum + code signature)
5. User is prompted to restart and install: "Ready to update. The application will close and reopen. Your data will not be affected."
6. Installer runs, updates the application binary, and relaunches
7. Audit log entry: `{"action": "app_updated", "from": "1.2.0", "to": "1.3.0"}`

**Important**: Updates NEVER run automatically. The user always has the choice to update now, later, or skip.

### Manual Update

1. Download the new installer from the TalOS download page (or receive via USB)
2. Close SiteConnect completely
3. Run the new installer — it will detect the existing installation and perform an in-place upgrade
4. Launch SiteConnect — the new version opens with existing data intact
5. If the database schema has changed, a migration runs automatically on first launch

### Update via USB Edge Pack

1. Receive updated USB Edge Pack from TalOS
2. Run the verification script on the USB
3. Close SiteConnect
4. Run the installer from the USB (same as standard install — installer detects existing installation)
5. If model files have been updated, the setup wizard offers to copy new models from USB

### Rollback

If an update causes issues:

1. Download the previous version installer from TalOS (specify version to your representative)
2. Close SiteConnect
3. Run the previous version installer
4. **Database compatibility note**: If the update included a database migration, rolling back may require restoring from a pre-update backup. SiteConnect automatically creates a backup before running migrations, stored at:
   - Windows: `%APPDATA%\com.talos.siteconnect\backups\pre-migration-{version}-{timestamp}.db`
   - macOS: `~/Library/Application Support/com.talos.siteconnect/backups/pre-migration-{version}-{timestamp}.db`

### Model Updates

LLM model updates are independent of application updates:

1. Go to Settings > AI Model
2. If a newer model version is available (and network is connected), "Update available" appears
3. Click "Download update" — the new model downloads alongside the existing one
4. After download + verification, the application switches to the new model
5. The old model file is retained for 30 days (in case rollback is needed), then automatically cleaned up

### Version Support Policy

| Release Type | Support Duration | Notes |
|-------------|-----------------|-------|
| Major (1.x → 2.x) | 12 months from successor release | May include breaking database migrations |
| Minor (1.1 → 1.2) | 6 months from successor release | Database migrations are backward-compatible |
| Patch (1.1.0 → 1.1.1) | Superseded immediately | Bug fixes only; no database changes |
