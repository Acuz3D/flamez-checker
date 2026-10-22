// What FLAMEZ CHECKER looks for. Each entry is found by any of:
//   app  – a name in Installed apps (store apps show as "appx:<package>")
//   proc – a running program (exact name without .exe, or a pattern)
//   svc  – a Windows service or driver name
// Add to these lists to look for something new.
window.CATALOG = {
  antiCheat: [
    { name: 'Easy Anti-Cheat', svc: /^EasyAntiCheat/i, app: /^Easy ?Anti-?Cheat/i },
    { name: 'BattlEye', svc: /^(BEService|BEDaisy)$/i },
    { name: 'Riot Vanguard', svc: /^(vgc|vgk)$/i, app: /^Riot Vanguard/i },
    { name: 'FACEIT', svc: /^FACEIT/i, app: /^FACEIT/i },
    { name: 'ESEA', svc: /^ESEADriver/i, app: /^ESEA/i },
    { name: 'EA Javelin', svc: /^EAAntiCheat/i, app: /^EA ?Anti-?Cheat/i },
    { name: 'Ubisoft Anti-Cheat', svc: /^sen_(service|driver)$/i, app: /^Ubisoft Anti-?Cheat/i },
    { name: 'PunkBuster', svc: /^PnkBstr/i, app: /PunkBuster/i },
    { name: 'GameGuard', svc: /^(npggsvc|GameGuard)/i },
    { name: 'XIGNCODE3', svc: /^xhunter/i },
    { name: 'Anti-Cheat Expert', svc: /^(ACE-|AntiCheatExpert)/i },
    { name: 'mhyprot (HoYoverse)', svc: /^mhyprot/i },
    { name: 'EQU8', svc: /^EQU8/i },
    { name: 'Denuvo Anti-Cheat', svc: /denuvo/i },
    { name: 'VAC', note: 'part of Steam', app: /^Steam$/i, proc: ['steam'] },
    { name: 'Hyperion', note: 'part of Roblox', app: /^Roblox Player/i, proc: ['RobloxPlayerBeta'] },
  ],

  launchers: [
    { name: 'Steam', app: /^Steam$/i, proc: ['steam'] },
    { name: 'Epic Games', app: /^Epic Games Launcher/i, proc: ['EpicGamesLauncher'] },
    { name: 'Battle.net', app: /^Battle\.net/i, proc: ['Battle.net'] },
    { name: 'EA app', app: /^EA app$/i, proc: ['EADesktop'] },
    { name: 'Ubisoft Connect', app: /^Ubisoft (Connect|Game Launcher)/i, proc: ['upc', 'UbisoftConnect'] },
    { name: 'GOG Galaxy', app: /^GOG GALAXY/i, proc: ['GalaxyClient'] },
    { name: 'Riot Client', app: /^(Riot Client|VALORANT|League of Legends)/i, proc: ['RiotClientServices', 'Riot Client'] },
    { name: 'Rockstar Games', app: /^Rockstar Games Launcher/i, proc: ['RockstarService'] },
    { name: 'Xbox app', app: /^appx:Microsoft\.GamingApp$/i, proc: ['XboxPcApp'] },
    { name: 'Roblox', app: /^Roblox Player/i, proc: ['RobloxPlayerBeta'] },
    { name: 'Minecraft', app: /^Minecraft Launcher/i, proc: ['MinecraftLauncher', 'Minecraft'] },
  ],

  overlays: [
    { name: 'Discord', app: /^Discord$/i, proc: ['Discord'] },
    { name: 'Medal', app: /^Medal/i, proc: ['medal', 'Medal'] },
    { name: 'OBS Studio', app: /^OBS Studio/i, proc: ['obs64'] },
    { name: 'NVIDIA overlay', app: /^NVIDIA (App|GeForce Experience)/i, proc: ['NVIDIA Overlay', 'NVIDIA app'] },
    { name: 'AMD Software', app: /^AMD Software/i, proc: ['RadeonSoftware'] },
    { name: 'Xbox Game Bar', app: /^appx:Microsoft\.XboxGamingOverlay$/i, proc: ['GameBar'] },
    { name: 'Steam overlay', note: 'only while a game is open', proc: ['GameOverlayUI'] },
    { name: 'Overwolf', app: /^Overwolf/i, proc: ['Overwolf'] },
    { name: 'RTSS', app: /RivaTuner Statistics Server/i, proc: ['RTSS'] },
    { name: 'MSI Afterburner', app: /^MSI Afterburner/i, proc: ['MSIAfterburner'] },
    { name: 'SteelSeries GG', app: /^SteelSeries GG/i, proc: ['SteelSeriesGG'] },
    { name: 'Corsair iCUE', app: /iCUE/i, proc: ['iCUE'] },
    { name: 'Razer Synapse', app: /^Razer Synapse/i, proc: ['Razer Synapse 3', 'RazerAppEngine'] },
    { name: 'Logitech G HUB', app: /^Logitech G HUB/i, proc: ['lghub'] },
    { name: 'Parsec', app: /^Parsec/i, proc: ['parsecd'] },
    { name: 'Wallpaper Engine', app: /^Wallpaper Engine/i, proc: ['wallpaper64', 'wallpaper32'] },
    { name: 'Nova Live', app: /^Nova Live/i, proc: ['Nova Live'] },
    { name: 'Nova Grid', app: /^Nova Grid/i, proc: ['Nova Grid'] },
  ],

  tools: [
    { name: 'Cheat Engine', app: /^Cheat Engine/i, proc: [/^cheatengine/i] },
    { name: 'x64dbg', proc: ['x64dbg', 'x32dbg'] },
    { name: 'IDA', app: /^IDA /i, proc: ['ida64', 'ida'] },
    { name: 'Process Explorer', proc: ['procexp', 'procexp64'] },
    { name: 'System Informer', app: /^(System Informer|Process Hacker)/i, proc: ['SystemInformer', 'ProcessHacker'] },
    { name: 'Process Monitor', proc: ['Procmon', 'Procmon64'] },
    { name: 'Autoruns', proc: ['Autoruns', 'Autoruns64'] },
    { name: 'Wireshark', app: /^Wireshark/i, proc: ['Wireshark'] },
    { name: 'Fiddler', app: /^(Progress Telerik )?Fiddler/i, proc: ['Fiddler', 'Fiddler Everywhere'] },
    { name: 'HTTP Debugger', app: /^HTTP Debugger/i, proc: ['HTTPDebuggerUI'], svc: /^HTTPDebugger/i },
    { name: 'dnSpy', proc: ['dnSpy'] },
    { name: 'ReClass.NET', proc: ['ReClass.NET'] },
    { name: 'HxD', app: /^HxD/i, proc: ['HxD', 'HxD64'] },
  ],

  // every Windows release, newest first, from Microsoft's release information pages
  // (learn.microsoft.com/windows/release-health). end = last update for Home and Pro,
  // entEnd = for Enterprise and Education. Add new ones at the top.
  windows11: [
    { v: '26H2', build: 26300, out: '2026-09-29', end: '2028-10-10', entEnd: '2029-10-09' },
    { v: '26H1', build: 28000, out: '2026-02-10', end: '2028-03-14', entEnd: '2029-03-13', newPcs: true },
    { v: '25H2', build: 26200, out: '2025-09-30', end: '2027-10-12', entEnd: '2028-10-10' },
    { v: '24H2', build: 26100, out: '2024-10-01', end: '2026-10-13', entEnd: '2027-10-12' },
    { v: '23H2', build: 22631, out: '2023-10-31', end: '2025-11-11', entEnd: '2026-11-10' },
    { v: '22H2', build: 22621, out: '2022-09-20', end: '2024-10-08', entEnd: '2025-10-14' },
    { v: '21H2', build: 22000, out: '2021-10-04', end: '2023-10-10', entEnd: '2024-10-08' },
  ],
  windows10: [
    { v: '22H2', build: 19045, out: '2022-10-18', end: '2025-10-14' },
    { v: '21H2', build: 19044, out: '2021-11-16', end: '2023-06-13' },
    { v: '21H1', build: 19043, out: '2021-05-18', end: '2022-12-13' },
    { v: '20H2', build: 19042, out: '2020-10-20', end: '2022-05-10' },
    { v: '2004', build: 19041, out: '2020-05-27', end: '2021-12-14' },
    { v: '1909', build: 18363, out: '2019-11-12', end: '2021-05-11' },
    { v: '1903', build: 18362, out: '2019-05-21', end: '2020-12-08' },
    { v: '1809', build: 17763, out: '2018-11-13', end: '2020-11-10' },
    { v: '1803', build: 17134, out: '2018-04-30', end: '2019-11-12' },
    { v: '1709', build: 16299, out: '2017-10-17', end: '2019-04-09' },
    { v: '1703', build: 15063, out: '2017-04-05', end: '2018-10-09' },
    { v: '1607', build: 14393, out: '2016-08-02', end: '2018-04-10' },
    { v: '1511', build: 10586, out: '2015-11-10', end: '2017-10-10' },
    { v: '1507', build: 10240, out: '2015-07-29', end: '2017-05-09' },
  ],

  // network adapters that are a VPN or virtual network
  vpn: /WireGuard|WARP|Cloudflare|TAP-Windows|OpenVPN|Tailscale|NordLynx|Proton|Mullvad|ZeroTier|Hamachi|Radmin|ExpressVPN|Surfshark/i,
};
