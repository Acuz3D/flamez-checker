# Reads what is turned on and off on this PC and prints it as JSON for FLAMEZ.
# Only reads; nothing here changes a setting (uninstalling is done by the app,
# and only when asked). Works without admin.
# Run with -Part a (system, security, settings), -Part b (apps, services,
# storage) or -Part c (drivers); FLAMEZ runs all three at once since each
# takes a few seconds.
param([string]$Part = 'all')
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Reg($path, $name) { (Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue).$name }
function Iso($d) { if ($d) { ([datetime]$d).ToString('o') } }

$out = [ordered]@{ at = (Get-Date).ToString('o') }

if ($Part -in 'a', 'all') {

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS
$board = Get-CimInstance Win32_BaseBoard
$gpus = @(Get-CimInstance Win32_VideoController)
$mem = @(Get-CimInstance Win32_PhysicalMemory)
$nt = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
# the Windows licence (this id is Windows itself, not Office)
$lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1
# Windows keeps the version it updated from here for a few days, so you can go back
$old = Get-Item -LiteralPath "$env:SystemDrive\Windows.old" -Force

$system = [ordered]@{
  os        = ($os.Caption -replace '^Microsoft ', '')
  edition   = $nt.EditionID
  release   = $nt.DisplayVersion
  build     = "$($nt.CurrentBuild).$($nt.UBR)"
  activated = $(if ($lic) { $lic.LicenseStatus -eq 1 } else { $null })
  licence   = $(if ($lic) { "$($lic.ProductKeyChannel)" } else { $null })
  previous  = $(if ($old) { Iso $old.CreationTime } else { $null })
  drive     = $env:SystemDrive.TrimEnd(':')
  installed = Iso $os.InstallDate
  booted    = Iso $os.LastBootUpTime
  arch      = $os.OSArchitecture
  firmware  = $(switch (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control' 'PEFirmwareType') { 2 { 'UEFI' } 1 { 'Legacy BIOS' } default { "$env:firmware_type" } })
  bios      = "$($bios.Manufacturer) $($bios.SMBIOSBIOSVersion)".Trim()
  biosDate  = Iso $bios.ReleaseDate
  board     = "$($board.Manufacturer) $($board.Product)".Trim()
  cpu       = "$($cpu.Name)".Trim()
  cores     = $cpu.NumberOfCores
  threads   = $cpu.NumberOfLogicalProcessors
  gpus      = @($gpus | ForEach-Object { [ordered]@{ name = $_.Name; driver = $_.DriverVersion; date = (Iso $_.DriverDate) } })
  ramBytes  = ($mem | Measure-Object Capacity -Sum).Sum
  ramSpeed  = ($mem | Select-Object -First 1).ConfiguredClockSpeed
  ramSticks = $mem.Count
  computer  = $env:COMPUTERNAME
  user      = $env:USERNAME
  admin     = $isAdmin
}

# ---------- security ----------

$dg = Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard
$dgRunning = @($dg.SecurityServicesRunning)
$dgConfigured = @($dg.SecurityServicesConfigured)
$features = @(Get-CimInstance Win32_OptionalFeature -Filter 'InstallState=1' | ForEach-Object Name)
$tpm = Get-CimInstance Win32_PnPEntity -Filter "PNPClass='SecurityDevices'" | Where-Object Name -match 'Trusted Platform' | Select-Object -First 1
$startOptions = "$(Reg 'HKLM:\SYSTEM\CurrentControlSet\Control' 'SystemStartOptions')"
$mp = Get-MpComputerStatus
$firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name = "$($_.Name)"; on = [bool]$_.Enabled } })
$bitlocker = (New-Object -ComObject Shell.Application).NameSpace("$env:SystemDrive\").Self.ExtendedProperty('System.Volume.BitLockerProtection')

$security = [ordered]@{
  cpuVirt         = [bool]($cpu.VirtualizationFirmwareEnabled -or $cs.HypervisorPresent)
  hypervisor      = [bool]$cs.HypervisorPresent
  features        = $features
  vbs             = $dg.VirtualizationBasedSecurityStatus # 0 off, 1 set up but not running, 2 running
  dgRunning       = $dgRunning   # 1 Credential Guard, 2 memory integrity, 3 Secure Launch, 5 kernel stack protection
  dgConfigured    = $dgConfigured
  dgAvailable     = @($dg.AvailableSecurityProperties) # 3 = DMA protection
  hvciKey         = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled'
  secureBoot      = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' 'UEFISecureBootEnabled'
  tpm             = $(if ($tpm) { [ordered]@{ name = $tpm.Name; ok = ($tpm.Status -eq 'OK') } } else { $null })
  uac             = Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'EnableLUA'
  uacPrompt       = Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'ConsentPromptBehaviorAdmin'
  blocklist       = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Config' 'VulnerableDriverBlocklistEnable'
  smartApp        = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' 'VerifiedAndReputablePolicyState'
  lsa             = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RunAsPPL'
  testSigning     = $startOptions -match 'TESTSIGNING'
  noIntegrity     = $startOptions -match 'DISABLE_INTEGRITY_CHECKS'
  kernelDebug     = $startOptions -match '(^|\s)DEBUG'
  specOverride    = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' 'FeatureSettingsOverride'
  defender        = $(if ($mp) { [ordered]@{ av = $mp.AntivirusEnabled; realtime = $mp.RealTimeProtectionEnabled; tamper = $mp.IsTamperProtected; mode = "$($mp.AMRunningMode)" } } else { $null })
  firewall        = $firewall
  bitlocker       = $bitlocker # 1 on, 2 off, 3 encrypting, 4 decrypting, 5 suspended, 6 on and locked
  smartScreen     = Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' 'SmartScreenEnabled'
  antivirus       = @(Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct | ForEach-Object {
      $hex = '{0:x6}' -f [int]$_.productState
      [ordered]@{ name = $_.displayName; on = ($hex.Substring(2, 2) -in '10', '11'); upToDate = ($hex.Substring(4, 2) -eq '00') }
    })
}

# ---------- gaming and everyday settings ----------

$gameBar = 'HKCU:\Software\Microsoft\GameBar'
$dxPrefs = "$(Reg 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' 'DirectXUserGlobalSettings')"
$scheme = "$(powercfg /getactivescheme)"

$gaming = [ordered]@{
  gameMode     = Reg $gameBar 'AutoGameModeEnabled'
  gameDvr      = Reg 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled'
  bgRecording  = Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'HistoricalCaptureEnabled'
  gameBarPad   = Reg $gameBar 'UseNexusForGameBarEnabled'
  hags         = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode'
  windowedOpt  = $(if ($dxPrefs -match 'SwapEffectUpgradeEnable=(\d)') { [int]$Matches[1] } else { $null })
  vrrOpt       = $(if ($dxPrefs -match 'VRROptimizeEnable=(\d)') { [int]$Matches[1] } else { $null })
  mouseAccel   = Reg 'HKCU:\Control Panel\Mouse' 'MouseSpeed'
  fastStartup  = Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' 'HiberbootEnabled'
  powerPlan    = $(if ($scheme -match '\((.+)\)') { $Matches[1] } else { $null })
  transparency = Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency'
  darkMode     = Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'AppsUseLightTheme'
}

$out.system = $system; $out.security = $security; $out.gaming = $gaming
}

if ($Part -in 'b', 'all') {

# ---------- software ----------

$uninstallKeys = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
$apps = @(Get-ItemProperty $uninstallKeys | Where-Object DisplayName | ForEach-Object {
    [ordered]@{ n = "$($_.DisplayName)".Trim(); v = "$($_.DisplayVersion)"; u = "$($_.UninstallString)".Trim() }
  })
# store apps that matter here (they don't show in the normal list)
foreach ($pkg in 'Microsoft.GamingApp', 'Microsoft.XboxGamingOverlay', 'Microsoft.DirectXRuntime') {
  $p = Get-AppxPackage -Name $pkg | Select-Object -First 1
  if ($p) { $apps += [ordered]@{ n = "appx:$pkg"; v = "$($p.Version)" } }
}

$ndp = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
$dotnet = @()
foreach ($kind in 'Microsoft.NETCore.App', 'Microsoft.WindowsDesktop.App', 'Microsoft.AspNetCore.App') {
  $dir = Join-Path $env:ProgramFiles "dotnet\shared\$kind"
  Get-ChildItem $dir -Directory | ForEach-Object { $dotnet += [ordered]@{ kind = $kind; v = $_.Name } }
}
$software = [ordered]@{
  directx  = (Get-Item "$env:SystemRoot\System32\d3d12.dll").VersionInfo.ProductVersion
  netFx    = [ordered]@{ release = $ndp.Release; version = $ndp.Version }
  dotnet   = $dotnet
  webview2 = Reg 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' 'pv'
  powershell = "$($PSVersionTable.PSVersion)"
}

# ---------- what is running, services and drivers ----------

$processes = @(Get-Process | ForEach-Object ProcessName | Sort-Object -Unique)
$services = @(Get-CimInstance Win32_Service | ForEach-Object {
    [ordered]@{ n = $_.Name; d = $_.DisplayName; s = $_.State; m = $_.StartMode; late = [bool]$_.DelayedAutoStart; desc = $_.Description }
  })
$drivers = @(Get-CimInstance Win32_SystemDriver | ForEach-Object { [ordered]@{ n = $_.Name; d = $_.DisplayName; s = $_.State; m = $_.StartMode } })

# ---------- start-up apps ----------

function StartupState($approvedKey, $name) {
  $bytes = Reg $approvedKey $name
  if ($bytes -is [byte[]] -and $bytes.Length) { return ($bytes[0] % 2 -eq 0) } # even first byte = on
  $true
}
$approved = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved'
$startup = @()
foreach ($src in @(
    @{ key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; ok = "HKCU:\$approved\Run"; where = 'You' },
    @{ key = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; ok = "HKLM:\$approved\Run"; where = 'All users' },
    @{ key = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; ok = "HKLM:\$approved\Run32"; where = 'All users' })) {
  $props = Get-ItemProperty -LiteralPath $src.key
  if (-not $props) { continue }
  foreach ($p in $props.PSObject.Properties) {
    if ($p.Name -like 'PS*') { continue }
    $startup += [ordered]@{ name = $p.Name; cmd = "$($p.Value)"; where = $src.where; on = (StartupState $src.ok $p.Name) }
  }
}
foreach ($src in @(
    @{ dir = [Environment]::GetFolderPath('Startup'); ok = "HKCU:\$approved\StartupFolder"; where = 'You' },
    @{ dir = [Environment]::GetFolderPath('CommonStartup'); ok = "HKLM:\$approved\StartupFolder"; where = 'All users' })) {
  Get-ChildItem -LiteralPath $src.dir -File | Where-Object Name -ne 'desktop.ini' | ForEach-Object {
    $startup += [ordered]@{ name = $_.BaseName; cmd = $_.FullName; where = "$($src.where) (folder)"; on = (StartupState $src.ok $_.Name) }
  }
}

# ---------- storage and network ----------

$disks = @(Get-PhysicalDisk | Sort-Object DeviceId | ForEach-Object {
    $d = Get-Disk -Number $_.DeviceId
    [ordered]@{ id = $_.DeviceId; name = "$($_.FriendlyName)".Trim(); media = "$($_.MediaType)"; bus = "$($_.BusType)"; size = $_.Size; health = "$($_.HealthStatus)"; style = "$($d.PartitionStyle)" }
  })
$volumes = @(Get-Volume | Where-Object DriveLetter | Sort-Object DriveLetter | ForEach-Object {
    [ordered]@{ letter = "$($_.DriveLetter)"; label = $_.FileSystemLabel; fs = $_.FileSystem; size = $_.Size; free = $_.SizeRemaining }
  })
$network = @(Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {
    [ordered]@{ name = $_.Name; desc = $_.InterfaceDescription; speed = "$($_.LinkSpeed)"; virtual = [bool]$_.Virtual }
  })

$out.software = $software; $out.apps = $apps; $out.processes = $processes; $out.services = $services
$out.drivers = $drivers; $out.startup = $startup; $out.disks = $disks; $out.volumes = $volumes; $out.network = $network
}

if ($Part -in 'c', 'all') {

# ---------- drivers ----------

# graphics cards, with the maker's id (10DE NVIDIA, 1002 AMD, 8086 Intel)
$out.gpuDrivers = @(Get-CimInstance Win32_VideoController | ForEach-Object {
    [ordered]@{
      name    = $_.Name
      vendor  = $(if ($_.PNPDeviceID -match 'VEN_([0-9A-F]{4})') { $Matches[1] } else { $null })
      version = $_.DriverVersion
      date    = Iso $_.DriverDate
    }
  })

# every graphics driver Windows still keeps, including older ones you can roll back to
$store = @()
$block = [ordered]@{}
foreach ($line in @(pnputil /enum-drivers /class Display) + '') {
  if ($line -match '^\s*([^:]+?):\s+(.*)$') { $block[$Matches[1]] = $Matches[2].Trim() }
  elseif ($block.Count) {
    if ($block['Driver Version'] -match '^(\S+)\s+(\S+)$') {
      $store += [ordered]@{ inf = $block['Published Name']; provider = $block['Provider Name']; date = $Matches[1]; version = $Matches[2] }
    }
    $block = [ordered]@{}
  }
}
$out.driverStore = $store

# drivers from other makers for sound, network, Bluetooth, chipset and storage
$out.deviceDrivers = @(Get-CimInstance Win32_PnPSignedDriver -Filter "DeviceClass='NET' OR DeviceClass='MEDIA' OR DeviceClass='SYSTEM' OR DeviceClass='HDC' OR DeviceClass='SCSIADAPTER' OR DeviceClass='BLUETOOTH'" |
  Where-Object { $_.DeviceName -and $_.DriverProviderName -notmatch '^Microsoft' } |
  ForEach-Object { [ordered]@{ cls = $_.DeviceClass; name = $_.DeviceName; provider = $_.DriverProviderName; version = $_.DriverVersion; date = (Iso $_.DriverDate) } })

# CPU microcode revision loaded by the BIOS / Windows
$rev = (Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0').'Update Revision'
$out.microcode = $(if ($rev -is [byte[]] -and $rev.Length -ge 4) { '0x{0:X8}' -f [BitConverter]::ToUInt32($rev, $(if ($rev.Length -ge 8) { 4 } else { 0 })) } else { $null })
}

$out | ConvertTo-Json -Depth 6 -Compress
