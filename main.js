const { app, BrowserWindow, ipcMain, dialog, shell, screen, clipboard, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// keep the saved last check in the same place it was before the app was renamed FLAMEZ CHECKER
app.setPath('userData', path.join(app.getPath('appData'), 'FLAMEZ'));

if (!app.requestSingleInstanceLock()) app.exit(0);

let win = null;

// ---------- reading the PC ----------

// PowerShell can't read inside the app package, so the installed app keeps the script beside it
const script = path.join(__dirname, 'checker.ps1').replace('app.asar', 'app.asar.unpacked');

function runPart(part) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Part', part],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 90000 },
      (err, stdout) => {
        if (err && !stdout) return reject(err);
        try {
          resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim()));
        } catch (e) {
          reject(new Error(`Couldn't read the ${{ a: 'settings', b: 'apps', c: 'drivers' }[part]} check: ${e.message}`));
        }
      },
    );
  });
}

function monitors() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    name: d.label || `Display ${i + 1}`,
    width: Math.round(d.size.width * d.scaleFactor),
    height: Math.round(d.size.height * d.scaleFactor),
    hz: Math.round(d.displayFrequency || 0),
    scale: Math.round(d.scaleFactor * 100),
    primary: d.id === primary,
  }));
}

// each part takes a few seconds, so they run side by side; if only the
// drivers part fails, the rest still shows
ipcMain.handle('check:run', async () => {
  const [a, b, c] = await Promise.all([runPart('a'), runPart('b'), runPart('c').catch((e) => ({ driversError: e.message }))]);
  uninstallers = new Map((b.apps || []).filter((x) => x.u).map((x) => [x.n, x.u]));
  return { ...c, ...b, ...a, monitors: monitors() };
});

// ---------- uninstalling ----------
// The page only sends an app's name; the command comes from what the last
// check read from Windows' list of installed apps.

let uninstallers = new Map();

// '"C:\x\unins000.exe" /x' or 'C:\x y\uninst.exe' → the program and what to pass it
function splitCommand(cmd) {
  const m = cmd.match(/^"([^"]+)"\s*(.*)$/) || cmd.match(/^(.+?\.exe)(?:\s+(.*))?$/i);
  if (!m) return null;
  let [, file, args = ''] = m;
  // MsiExec /I opens the repair screen; /X removes
  if (/msiexec(\.exe)?$/i.test(file)) args = args.replace(/\/I\s*(\{[^}]+\})/i, '/X$1');
  return { file, args: args.trim() };
}

ipcMain.handle('app:uninstall', async (_e, name) => {
  const cmd = splitCommand(uninstallers.get(name) || '');
  if (!cmd) return { ok: false, error: `Windows doesn't list an uninstaller for ${name}.` };
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Uninstall',
    message: `Uninstall ${name}?`,
    detail: "This opens its own uninstaller. Games that use it won't start until it's installed again; most put it back when you next launch the game.",
    buttons: ['Uninstall', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return { ok: false };
  // Start-Process goes through the shell, so uninstallers that need admin get the Windows prompt
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '$a = @{ FilePath = $env:FZ_FILE }; if ($env:FZ_ARGS) { $a.ArgumentList = $env:FZ_ARGS }; Start-Process @a -ErrorAction Stop'],
      { windowsHide: true, timeout: 60000, env: { ...process.env, FZ_FILE: cmd.file, FZ_ARGS: cmd.args } },
      (err, _out, stderr) => resolve(err ? { ok: false, error: /cancel/i.test(stderr) ? 'Cancelled.' : `Couldn't start the uninstaller (${String(stderr || err.message).trim().split('\n')[0]}).` } : { ok: true }),
    );
  });
});

// ---------- driver releases online ----------
// NVIDIA lists every driver for each card, with direct download links.
// AMD and Intel don't, so the app links to their download pages instead.

const NV_PRODUCTS = 'https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3';
const NV_DRIVERS = 'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php';
let nvProducts = null; // fetched once per session

async function nvProductList() {
  if (!nvProducts) {
    const xml = await (await net.fetch(NV_PRODUCTS)).text();
    nvProducts = [...xml.matchAll(/<LookupValue[^>]*ParentID="(\d+)"[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Value>(\d+)<\/Value>/g)].map((m) => ({ psid: m[1], name: m[2].trim(), pfid: m[3] }));
  }
  return nvProducts;
}

const plainName = (s) => s.toLowerCase().replace(/^nvidia\s+/, '').replace(/\s+/g, ' ').trim();
const decode = (s) => {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, ' '));
  } catch {
    return String(s);
  }
};

async function nvReleases(gpuName) {
  const product = (await nvProductList()).find((p) => plainName(p.name) === plainName(gpuName));
  if (!product) return { error: `NVIDIA's site doesn't list "${gpuName}".` };
  const list = async (studio) => {
    const q = new URLSearchParams({
      func: 'DriverManualLookup', psid: product.psid, pfid: product.pfid, osID: '57', languageCode: '1033',
      beta: '0', isWHQL: '0', dltype: '-1', dch: '1', upCRD: studio ? '1' : '0', qnf: '0', sort1: '0', numberOfResults: '100',
    });
    const json = await (await net.fetch(`${NV_DRIVERS}?${q}`)).json();
    return (json.IDS || []).map(({ downloadInfo: d }) => ({
      version: d.Version, date: d.ReleaseDateTime, name: decode(d.Name), url: d.DownloadURL, size: d.DownloadURLFileSize, notes: d.DetailsURL,
    }));
  };
  const [gameReady, studio] = await Promise.all([list(false), list(true)]);
  return { product: product.name, gameReady, studio };
}

ipcMain.handle('drivers:online', async (_e, gpuNames) => {
  const out = {};
  for (const name of gpuNames) {
    try {
      out[name] = await nvReleases(name);
    } catch (e) {
      out[name] = { error: `Couldn't reach NVIDIA (${e.message}).` };
    }
  }
  return out;
});

// download and support links open in the browser, but only for driver makers' sites
const LINK_SITES = ['nvidia.com', 'amd.com', 'intel.com', 'msi.com', 'asus.com', 'gigabyte.com', 'asrock.com', 'realtek.com', 'mediatek.com', 'microsoft.com', 'bing.com'];

ipcMain.handle('link:open', async (_e, url) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || !LINK_SITES.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`))) return false;
  await shell.openExternal(u.href);
  return true;
});

// ---------- what was on last time, to show what changed ----------

const lastFile = () => path.join(app.getPath('userData'), 'last-check.json');

ipcMain.handle('last:swap', (_e, now) => {
  let before = null;
  try {
    before = JSON.parse(fs.readFileSync(lastFile(), 'utf8'));
  } catch {}
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(lastFile(), JSON.stringify(now, null, 2));
  return before;
});

// ---------- opening the Windows page where a setting is changed ----------

const sys32 = (file) => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', file);

const PLACES = {
  coreIsolation: 'windowsdefender://coreisolation',
  virus: 'windowsdefender://threatsettings',
  firewall: 'windowsdefender://network',
  smartApp: 'windowsdefender://smartapp',
  appBrowser: 'windowsdefender://appbrowser',
  deviceSecurity: 'windowsdefender://devicesecurity',
  windowsSecurity: 'windowsdefender://',
  uac: { open: sys32('UserAccountControlSettings.exe') },
  features: { open: sys32('OptionalFeatures.exe') },
  encryption: 'ms-settings:deviceencryption',
  gameMode: 'ms-settings:gaming-gamemode',
  gameBar: 'ms-settings:gaming-gamebar',
  captures: 'ms-settings:gaming-gamedvr',
  graphics: 'ms-settings:display-advancedgraphics',
  mouse: { run: ['control.exe', 'main.cpl,,2'] },
  power: { run: ['control.exe', 'powercfg.cpl'] },
  powerButtons: { run: ['control.exe', '/name', 'Microsoft.PowerOptions', '/page', 'pageGlobalSettings'] },
  colours: 'ms-settings:colors',
  display: 'ms-settings:display',
  storage: 'ms-settings:storagesense',
  network: 'ms-settings:network-status',
  apps: 'ms-settings:appsfeatures',
  about: 'ms-settings:about',
  startupApps: 'ms-settings:startupapps',
  services: { open: sys32('services.msc') },
  deviceManager: { open: sys32('devmgmt.msc') },
  sysinfo: { open: sys32('msinfo32.exe') },
  update: 'ms-settings:windowsupdate',
  activation: 'ms-settings:activation',
  productKey: { open: sys32('changepk.exe') },
  recovery: 'ms-settings:recovery',
  insider: 'ms-settings:windowsinsider',
};

ipcMain.handle('place:open', async (_e, key) => {
  const place = PLACES[key];
  if (!place) return false;
  if (typeof place === 'string') await shell.openExternal(place);
  else if (place.open) await shell.openPath(place.open);
  else spawn(place.run[0], place.run.slice(1), { detached: true, stdio: 'ignore' }).unref();
  return true;
});

// ---------- the report ----------

ipcMain.handle('report:copy', (_e, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('report:save', async (_e, text) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save report',
    defaultPath: path.join(app.getPath('desktop'), `FLAMEZ CHECKER report ${stamp}.txt`),
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, text);
  shell.showItemInFolder(filePath);
  return filePath;
});

// ---------- updates ----------
// New versions come from the GitHub releases. They download in the background;
// the page offers a restart, and otherwise it installs when the app closes.

const UPDATE_EVERY = 6 * 60 * 60 * 1000;

function startUpdates() {
  if (!app.isPackaged) return; // npm start has nothing to update
  const send = (state, info = {}) => win?.webContents.send('update', { state, version: info.version, percent: info.percent });
  autoUpdater.on('update-available', (info) => send('downloading', info));
  autoUpdater.on('download-progress', (p) => send('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send('ready', info));
  autoUpdater.on('error', () => send('none')); // offline or GitHub down: try again next time
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_EVERY);
}

ipcMain.on('update:install', () => autoUpdater.quitAndInstall(true, true));

// ---------- window ----------

ipcMain.handle('app:about', () => ({ version: app.getVersion() }));
ipcMain.on('win:min', () => win?.minimize());
ipcMain.on('win:max', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
ipcMain.on('win:close', () => win?.close());

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 860,
    minHeight: 560,
    show: false,
    backgroundColor: '#04070a',
    title: 'FLAMEZ CHECKER',
    // the top bar doubles as the title bar, with its own minimise / close
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  createWindow();
  win.webContents.once('did-finish-load', startUpdates);
});
app.on('window-all-closed', () => app.quit());
