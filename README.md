<p align="center"><img src="docs/logo.png" alt="FLAMEZ" width="150" /></p>

<h1 align="center">FLAMEZ CHECKER</h1>

<p align="center">See everything that's turned on and off on your Windows PC, and get the right drivers, in one place.</p>

<p align="center"><a href="https://github.com/Acuz3D/flamez-checker/releases/latest"><b>⬇ Download the latest version</b></a></p>

![Overview](docs/overview.png)

## What it shows

- **Security**: memory integrity (HVCI), VBS, Credential Guard, Secure Boot, TPM, Defender, tamper protection, firewall, Smart App Control, SmartScreen, the vulnerable driver blocklist, UAC, BitLocker, test signing, Hyper-V, WSL and more, each marked **Enabled** or **Disabled**
- **Gaming and Windows**: Game Mode, GPU scheduling, windowed game optimisations, Game Bar recording, mouse acceleration, fast startup, power plan
- **What's installed and running**: anti-cheats (Easy Anti-Cheat, BattlEye, Vanguard, FACEIT…), game launchers, overlays and recording apps, debug tools
- **Your PC**: Windows version, BIOS, board, CPU, GPU, RAM, disks, monitors, network
- **Changes since last check**: anything that got switched on or off since you last opened it is listed at the top
- **Services** and **Start-up apps**, with search and filters
- Click any setting to open the Windows page where you change it. Copy or save a text report to share

## Drivers

![Drivers](docs/drivers.png)

- Your graphics driver, and whether a newer one is out
- **NVIDIA:** every Game Ready and Studio driver from this year (and older), each with a **Download** button straight from NVIDIA and its release notes
- Older drivers Windows still keeps on your PC, with a shortcut to roll back
- CPU microcode, chipset and chipset software, with a link to the chipset drivers
- BIOS version with a link to your board maker's BIOS downloads
- Sound, network, Bluetooth and storage drivers with their versions

FLAMEZ CHECKER only **reads** your settings. It never changes anything; clicking a setting just opens the right Windows page.

## Install

1. Download `FLAMEZ-CHECKER-Setup-x.x.x.exe` from [Releases](https://github.com/Acuz3D/flamez-checker/releases/latest)
2. Run it. It installs and opens straight away, and adds a shortcut to your Desktop and Start menu
3. Windows may say *"Windows protected your PC"* because the installer isn't signed with a paid certificate. Click **More info → Run anyway**

Windows 10 or 11, 64-bit. Running it as administrator lets it read a few more settings.

## Build it yourself

```
npm install
npm start          # run it
npm run dist       # build the installer into dist/
```
