// Line icons, drawn in the text colour (same stroke style as Nova Check).
const ICONS = {
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  save: '<path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-1"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7H10"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  winMin: '<path d="M6 12h12"/>',
  winMax: '<rect x="6.5" y="6.5" width="11" height="11" rx="1"/>',
  winRestore: '<rect x="6" y="9" width="9" height="9" rx="1"/><path d="M9 9V7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2"/>',
  winClose: '<path d="M7 7l10 10M17 7L7 17"/>',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svg = (name) => `<svg class="icon" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
const drawIcons = (root = document) => $$('i[data-icon]', root).forEach((i) => (i.outerHTML = svg(i.dataset.icon)));

let data = null; // the latest check
let tiles = []; // every on/off tile on the overview, for the summary and the report
let lists = {}; // anti-cheat, launchers… after matching
let checking = false;

// ---------- small helpers ----------

const GiB = 1024 ** 3;
const size = (b) => (b >= 1024 * GiB ? `${(b / 1024 / GiB).toFixed(2)} TB` : `${Math.round(b / GiB)} GB`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const when = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `today ${time(iso)}` : `${day(iso)} ${time(iso)}`;
};

function uptime(iso) {
  let s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  s %= 60;
  return `${d ? `${d} d ` : ''}${h} h ${m} m ${s} s`;
}

let toastTimer = 0;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- turning the readings into on / off tiles ----------
// state: on | off | part (set up but not running, or only some of it) | unknown | na (not on this PC)

const tile = (id, name, state, detail, place, about) => ({ id, name, state, detail, place, about });
const onOff = (b) => (b ? 'on' : 'off');

function securityGroups(d) {
  const s = d.security;
  const run = s.dgRunning || [];
  const conf = s.dgConfigured || [];
  const feat = new Set(s.features || []);
  const home = /Home/i.test(d.system.os);
  const otherAv = (s.antivirus || []).find((a) => a.on && !/Defender/i.test(a.name));
  const feature = (id, name, key, about, homeMissing) =>
    homeMissing && home ? tile(id, name, 'na', 'not on Windows Home', 'features', about) : tile(id, name, onOff(feat.has(key)), 'Windows feature', 'features', about);

  const hvciSet = conf.includes(2) || s.hvciKey === 1;
  const fw = s.firewall || [];
  const fwOn = fw.filter((f) => f.on);
  const def = s.defender;

  let uac;
  if (s.uac === 0) uac = tile('uac', 'User Account Control', 'off', 'apps get admin without asking', 'uac');
  else if (s.uacPrompt === 0) uac = tile('uac', 'User Account Control', 'part', 'never notifies', 'uac');
  else uac = tile('uac', 'User Account Control', 'on', s.uacPrompt === 2 ? 'always notifies' : 'notifies for changes', 'uac');
  uac.about = 'Asks before an app gets admin rights.';

  const bl = s.bitlocker;
  const encryption =
    bl == null || bl === 0
      ? tile('bitlocker', 'BitLocker', 'na', home ? 'not on Windows Home' : 'not set up', 'encryption')
      : tile('bitlocker', 'BitLocker', [1, 3, 6].includes(bl) ? 'on' : bl === 5 ? 'part' : 'off', { 1: 'drive encrypted', 2: 'drive not encrypted', 3: 'encrypting…', 4: 'decrypting…', 5: 'suspended', 6: 'encrypted, locked' }[bl], 'encryption');
  encryption.about = 'Encrypts the Windows drive so it can\'t be read if the PC is stolen.';

  return [
    {
      title: 'Core isolation',
      tiles: [
        tile('hvci', 'Memory integrity', run.includes(2) ? 'on' : hvciSet ? 'part' : 'off', run.includes(2) ? 'HVCI running' : hvciSet ? 'on after a restart' : 'HVCI', 'coreIsolation', "Stops drivers Windows doesn't trust from loading into its core. Can cost a little gaming performance."),
        tile('vbs', 'Virtualisation-based security', s.vbs === 2 ? 'on' : s.vbs === 1 ? 'part' : 'off', s.vbs === 2 ? 'VBS running' : s.vbs === 1 ? 'set up, not running' : 'VBS', 'coreIsolation', 'Runs the most sensitive parts of Windows in a walled-off area. Memory integrity and Credential Guard sit on top of it.'),
        tile('credguard', 'Credential Guard', run.includes(1) ? 'on' : conf.includes(1) ? 'part' : 'off', 'protects saved sign-ins', 'coreIsolation', 'Keeps saved passwords and sign-in tokens away from other programs.'),
        tile('stack', 'Kernel stack protection', onOff(run.includes(5)), 'hardware-enforced', 'coreIsolation', 'Uses the CPU to stop a common kind of attack on Windows itself.'),
        tile('lsa', 'LSA protection', onOff([1, 2].includes(s.lsa)), 'local security authority', 'coreIsolation', 'Stops other programs reading the Windows sign-in process.'),
      ],
    },
    {
      title: 'Boot and hardware',
      tiles: [
        tile('cpuvirt', 'CPU virtualisation', onOff(s.cpuVirt), /AMD/i.test(d.system.cpu) ? 'SVM, set in the BIOS' : 'VT-x, set in the BIOS', null, 'Lets the CPU run virtual machines. Needed for VBS, WSL and Hyper-V.'),
        tile('hypervisor', 'Hypervisor', onOff(s.hypervisor), s.hypervisor ? 'Windows is running on it' : 'not running', 'features', "Windows' own hypervisor. Starts when VBS, WSL, Hyper-V or Virtual Machine Platform need it."),
        tile('secureboot', 'Secure Boot', s.secureBoot === 1 ? 'on' : s.secureBoot === 0 ? 'off' : 'unknown', d.system.firmware || 'UEFI', 'deviceSecurity', 'Only lets signed software start the PC. Some games need it on.'),
        tile('tpm', 'TPM', s.tpm ? (s.tpm.ok ? 'on' : 'part') : 'off', s.tpm ? s.tpm.name.replace('Trusted Platform Module', 'TPM') : 'not found', 'deviceSecurity', 'Security chip that stores keys. Windows 11 and some games need it.'),
        tile('sigcheck', 'Driver signature checks', onOff(!s.noIntegrity), s.noIntegrity ? 'turned off at boot' : 'drivers must be signed', 'sysinfo', 'Windows only loads drivers that are signed.'),
        tile('testsign', 'Test signing mode', onOff(s.testSigning), s.testSigning ? 'unsigned test drivers allowed' : 'normal', 'sysinfo', 'Lets unsigned test drivers load. Normally off. Most anti-cheats refuse to run with it on.'),
        tile('kdebug', 'Kernel debugging', onOff(s.kernelDebug), s.kernelDebug ? 'debugger can attach' : 'normal', 'sysinfo', 'Lets a debugger attach to Windows itself. Normally off.'),
        tile('spectre', 'Spectre / Meltdown fixes', s.specOverride == null || s.specOverride === 0 ? 'on' : s.specOverride === 3 ? 'off' : 'part', s.specOverride === 3 ? 'turned off in the registry' : s.specOverride == null ? 'Windows default' : 'forced', null, 'CPU security fixes. Turning them off can give a little speed back.'),
      ],
    },
    {
      title: 'Protection',
      tiles: [
        !def
          ? tile('defender', 'Defender antivirus', 'unknown', "couldn't read", 'virus')
          : tile('defender', 'Defender antivirus', def.av && def.realtime ? 'on' : def.av ? 'part' : 'off', def.av && def.realtime ? 'real-time on' : def.av ? 'real-time off' : otherAv ? `${otherAv.name} instead` : 'turned off', 'virus'),
        tile('tamper', 'Tamper protection', def ? onOff(def.tamper) : 'unknown', 'stops apps changing Defender', 'virus', 'Stops other programs turning Defender settings off.'),
        tile('firewall', 'Firewall', !fw.length ? 'unknown' : fwOn.length === fw.length ? 'on' : fwOn.length ? 'part' : 'off', !fw.length ? '' : fwOn.length === fw.length ? 'all networks' : fwOn.length ? `${fwOn.map((f) => f.name).join(', ')} only` : 'every network', 'firewall', 'Blocks unwanted connections coming into the PC.'),
        tile('smartapp', 'Smart App Control', s.smartApp === 1 ? 'on' : s.smartApp === 2 ? 'part' : s.smartApp === 0 ? 'off' : 'unknown', s.smartApp === 2 ? 'evaluation mode' : 'blocks untrusted apps', 'smartApp', 'Blocks apps that are unsigned or unknown. Once off it can only come back with a reset.'),
        tile('smartscreen', 'SmartScreen', s.smartScreen === 'Off' ? 'off' : 'on', s.smartScreen === 'Off' ? 'apps and files' : s.smartScreen === 'RequireAdmin' ? 'blocks unknown apps' : 'warns on unknown apps', 'appBrowser', 'Warns before running apps and files downloaded from the internet.'),
        tile('blocklist', 'Vulnerable driver blocklist', s.blocklist === 0 ? 'off' : 'on', s.blocklist == null ? 'Windows default' : 'blocks known bad drivers', 'coreIsolation', 'Stops drivers with known security holes from loading.'),
        uac,
        encryption,
      ],
    },
    {
      title: 'Virtual machines',
      tiles: [
        feature('hyperv', 'Hyper-V', 'Microsoft-Hyper-V-All', 'Full virtual machines built into Windows.', true),
        feature('vmp', 'Virtual Machine Platform', 'VirtualMachinePlatform', 'Needed by WSL 2 and Android apps.'),
        feature('whp', 'Windows Hypervisor Platform', 'HypervisorPlatform', 'Lets other VM apps (VirtualBox, VMware, emulators) use the Windows hypervisor.'),
        feature('wsl', 'WSL', 'Microsoft-Windows-Subsystem-Linux', 'Linux inside Windows.'),
        feature('sandbox', 'Windows Sandbox', 'Containers-DisposableClientVM', 'A throwaway copy of Windows for testing files.', true),
      ],
    },
  ];
}

function gamingTiles(d) {
  const g = d.gaming;
  const build = parseInt(d.system.build, 10) || 0;
  const dflt = (v) => (v == null ? 'Windows default' : '');
  const windowed = g.windowedOpt ?? (build >= 26100 ? 1 : 0);
  return [
    tile('gamemode', 'Game Mode', onOff((g.gameMode ?? 1) === 1), dflt(g.gameMode) || 'puts games first', 'gameMode', 'Gives the game priority and holds back Windows Update while you play.'),
    tile('hags', 'GPU scheduling', g.hags === 2 ? 'on' : g.hags === 1 ? 'off' : 'unknown', 'hardware-accelerated', 'graphics', 'Lets the graphics card manage its own memory. Needed for NVIDIA frame generation.'),
    tile('windowed', 'Windowed game optimisations', onOff(windowed === 1), dflt(g.windowedOpt) || 'lower latency in windowed', 'graphics', 'Makes windowed and borderless games run with the same latency as full screen.'),
    tile('gamedvr', 'Game Bar captures', onOff((g.gameDvr ?? 1) === 1), 'Game DVR', 'captures', 'Lets Xbox Game Bar record clips. Can cost a few frames.'),
    tile('bgrec', 'Background recording', onOff(g.bgRecording === 1), 'records the last few minutes', 'captures', 'Keeps recording in the background so you can save what just happened. Costs frames.'),
    tile('gamebarpad', 'Game Bar controller button', onOff((g.gameBarPad ?? 1) === 1), 'Xbox button opens Game Bar', 'gameBar'),
    tile('mouseaccel', 'Enhance pointer precision', onOff(g.mouseAccel === '1'), 'mouse acceleration', 'mouse', 'Speeds the pointer up when you move the mouse fast. Most players keep it off.'),
    tile('faststart', 'Fast startup', onOff(g.fastStartup === 1), 'half-hibernates on shut down', 'powerButtons', 'Shut down saves part of Windows to disk so the PC starts faster. Restart skips it.'),
    tile('transparency', 'Transparency effects', onOff((g.transparency ?? 1) === 1), 'see-through menus', 'colours'),
    tile('dark', 'Dark mode', onOff(g.darkMode === 0), 'for apps', 'colours'),
  ];
}

// ---------- finding apps, anti-cheats and tools ----------

function matcher(d) {
  const procs = d.processes || [];
  const procLower = new Set(procs.map((p) => p.toLowerCase()));
  const svcs = [...(d.services || []), ...(d.drivers || [])];
  const driverNames = new Set((d.drivers || []).map((x) => x.n));
  return (entry) => {
    const app = entry.app ? (d.apps || []).find((a) => entry.app.test(a.n)) : null;
    const procRunning = (entry.proc || []).some((p) => (typeof p === 'string' ? procLower.has(p.toLowerCase()) : procs.some((x) => p.test(x))));
    const found = entry.svc ? svcs.filter((x) => entry.svc.test(x.n)) : [];
    const running = procRunning || found.some((x) => x.s === 'Running');
    const status = running ? 'running' : app || found.length ? 'installed' : 'none';
    let extra = entry.note || '';
    if (found.length && !entry.note) extra = found.map((x) => `${x.n}${driverNames.has(x.n) ? ' driver' : ''}`).join(' · ');
    if (app?.v && !found.length) extra = [app.v, entry.note].filter(Boolean).join(' · ');
    // things that are part of something else (VAC in Steam) go with it, so no button of their own
    const uninstall = app?.u && !entry.note ? app.n : null;
    return { name: entry.name, status, extra, uninstall, note: entry.note };
  };
}

function matchLists(d) {
  const find = matcher(d);
  const out = {};
  for (const key of ['antiCheat', 'launchers', 'overlays', 'tools']) out[key] = CATALOG[key].map(find);
  return out;
}

// ---------- drawing the overview ----------

const STATE_WORD = { on: 'Enabled', off: 'Disabled', part: 'Partly enabled', unknown: 'Unknown', na: 'Not available' };

function tileHtml(t, changed) {
  const title = [changed ? `Changed since last check (was ${STATE_WORD[changed].toLowerCase()})` : '', t.about || '', t.place ? 'Click to open where this is changed.' : '']
    .filter(Boolean)
    .join('\n');
  return `<div class="tile ${t.state}${t.place ? ' link' : ''}${changed ? ' changed' : ''}" ${t.place ? `data-place="${t.place}"` : ''} title="${esc(title)}">
    <span class="t-text">
      <span class="t-name">${esc(t.name)}</span>
      ${STATE_WORD[t.state] ? `<span class="t-status">${STATE_WORD[t.state]}</span>` : ''}
      ${t.detail ? `<span class="t-detail">${esc(t.detail)}</span>` : ''}
    </span>
    ${t.state === 'info' ? '' : '<i class="switch"></i>'}
  </div>`;
}

function card(title, body, { cls = '', meta = '', metaLit = false } = {}) {
  return `<section class="card glass ${cls}">
    <div class="card-head"><h2>${esc(title)}</h2>${meta ? `<span class="meta${metaLit ? ' lit' : ''}">${esc(meta)}</span>` : ''}</div>
    ${body}
  </section>`;
}

const rows = (pairs) => `<dl class="rows">${pairs.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;

function systemCard(d) {
  const s = d.system;
  const gpus = (s.gpus || []).map((g) => `${esc(g.name)}<br /><small>driver ${esc(g.driver)}${g.date ? ` · ${day(g.date)}` : ''}</small>`).join('<br />');
  return card(
    'System',
    rows([
      ['Windows', `${esc(s.os)} ${esc(s.release || '')} <small>build ${esc(s.build)}</small>`],
      ['Installed', day(s.installed)],
      ['Up for', `<span id="uptime">${uptime(s.booted)}</span>`],
      ['Firmware', `${esc(s.firmware)} · ${esc(s.arch)}`],
      ['BIOS', `${esc(s.bios)} <small>${day(s.biosDate)}</small>`],
      ['Board', esc(s.board)],
      ['CPU', `${esc(s.cpu)} <small>${s.cores} cores · ${s.threads} threads</small>`],
      ['GPU', gpus],
      ['RAM', `${Math.round(s.ramBytes / GiB)} GB${s.ramSpeed ? ` @ ${s.ramSpeed} MHz` : ''} <small>${s.ramSticks} stick${s.ramSticks === 1 ? '' : 's'}</small>`],
      ['PC name', `${esc(s.computer)} <small>signed in as ${esc(s.user)}</small>`],
      ['Admin', s.admin ? 'Yes, FLAMEZ CHECKER can read everything' : 'No, a few things may show as unknown'],
    ]),
  );
}

function softwareCard(d) {
  const sw = d.software;
  const vc = new Map();
  for (const a of d.apps || []) {
    if (!/Visual C\+\+/i.test(a.n) || !/Redistributable/i.test(a.n)) continue;
    // newer ones are named "v14" instead of "2015-2022"
    const found = a.n.match(/Visual C\+\+ (\d{4}(?:-\d{4})?|v14)\b/i)?.[1];
    if (!found) continue;
    const year = /^v14$/i.test(found) ? 'v14 (2015+)' : found;
    const arch = a.n.match(/\b(x64|x86|arm64)\b/i)?.[1]?.toLowerCase() || 'x86'; // the oldest ones leave x86 unsaid
    if (!vc.has(year)) vc.set(year, new Map());
    const had = vc.get(year).get(arch);
    if (!had || had.localeCompare(a.v, undefined, { numeric: true }) < 0) vc.get(year).set(arch, a.v);
  }
  const vcHtml = [...vc.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, arches]) => `<span class="pill" title="${esc([...arches].map(([a, v]) => `${a} ${v}`).join('\n'))}">${esc(year)}<small>${[...arches.keys()].sort().join(' · ')}</small></span>`)
    .join('');

  const rel = sw.netFx?.release || 0;
  const fx = rel >= 533320 ? '4.8.1' : rel >= 528040 ? '4.8' : rel >= 461808 ? '4.7.2' : rel >= 461308 ? '4.7.1' : rel >= 460798 ? '4.7' : rel ? '4.6 or older' : 'not found';

  const kinds = { 'Microsoft.NETCore.App': '.NET', 'Microsoft.WindowsDesktop.App': 'Desktop', 'Microsoft.AspNetCore.App': 'ASP.NET' };
  const dotnet = (sw.dotnet || []).filter((x) => x.kind === 'Microsoft.WindowsDesktop.App' || x.kind === 'Microsoft.NETCore.App');
  const newest = new Map();
  for (const x of dotnet) newest.set(x.v.split('.')[0], x.v);
  const dotnetHtml = newest.size ? [...newest.values()].map((v) => `<span class="pill">${esc(v)}</span>`).join('') : '<small>none installed</small>';

  return card(
    'Software',
    rows([
      ['DirectX', `12 <small>d3d12 ${esc(sw.directx || '?')}</small>`],
      ['Visual C++', vcHtml || '<small>none found</small>'],
      ['.NET Framework', `${fx} <small>${esc(sw.netFx?.version || '')}</small>`],
      ['.NET', dotnetHtml],
      ['WebView2', sw.webview2 ? esc(sw.webview2) : '<small>not found</small>'],
      ['PowerShell', esc(sw.powershell)],
    ]),
  );
}

// the Uninstall button, or when Windows has no uninstaller for it, a way to remove what it came with
function removeBtn(i) {
  if (i.uninstall) return `<button class="dl" data-uninstall="${esc(i.uninstall)}" title="Run ${esc(i.uninstall)}'s uninstaller">Uninstall</button>`;
  const why = i.note ? `It's ${i.note}, so it goes when that is uninstalled.` : 'It has no uninstaller of its own. It came with a game, and uninstalling that game removes it.';
  return `<button class="dl" data-place="apps" title="${esc(why)}">Apps</button>`;
}

function findsCard(title, items, { note = '', cls = '', removable = false } = {}) {
  const rank = { running: 0, installed: 1 };
  const found = items.filter((i) => i.status !== 'none').sort((a, b) => rank[a.status] - rank[b.status]);
  const missing = items.filter((i) => i.status === 'none');
  const running = found.filter((i) => i.status === 'running').length;
  const body = `
    ${
      found.length
        ? `<div class="finds">${found
            .map(
              (i) => `<div class="find ${i.status}">
          <span class="f-name">${esc(i.name)}</span><span class="f-extra">${esc(i.extra)}</span>
          <span class="state ${i.status}">${i.status === 'running' ? 'Running' : 'Installed'}</span>
          ${removable ? removeBtn(i) : ''}
        </div>`,
            )
            .join('')}</div>`
        : '<p class="none-found">None found.</p>'
    }
    ${missing.length ? `<p class="none-found"><b>Not found:</b> ${missing.map((i) => esc(i.name)).join(', ')}</p>` : ''}
    ${note ? `<p class="note">${esc(note)}</p>` : ''}`;
  return card(title, body, { cls, meta: found.length ? `${found.length} found${running ? ` · ${running} running` : ''}` : '', metaLit: running > 0 });
}

function antivirusCard(d) {
  const avs = d.security.antivirus || [];
  const active = avs.filter((a) => a.on);
  const body = avs.length
    ? `<div class="finds">${avs
        .map(
          (a) => `<div class="find ${a.on ? 'running' : ''}">
        <span class="f-name">${esc(a.name)}</span><span class="f-extra">${a.upToDate ? 'up to date' : 'out of date'}</span>
        <span class="state ${a.on ? 'running' : ''}">${a.on ? 'Enabled' : 'Disabled'}</span>
      </div>`,
        )
        .join('')}</div>${active.length ? '' : '<p class="note">No antivirus is switched on.</p>'}`
    : '<p class="none-found">Windows Security didn\'t list any antivirus.</p>';
  return card('Antivirus', body, { meta: active.length ? `${active.length} enabled` : 'none enabled' });
}

function storageCard(d) {
  const disks = (d.disks || [])
    .map(
      (k) => `<div class="disk">
      <div class="disk-name">Disk ${esc(k.id)} · ${esc(k.name)}</div>
      <div class="disk-meta">${esc([k.bus, k.media !== 'Unspecified' ? k.media : '', size(k.size), k.style, k.health].filter(Boolean).join(' · '))}</div>
    </div>`,
    )
    .join('');
  const vols = (d.volumes || [])
    .filter((v) => v.size)
    .map((v) => {
      const used = 1 - v.free / v.size;
      return `<div class="vol">
        <div class="vol-line"><b>${esc(v.letter)}:${v.label ? ` ${esc(v.label)}` : ''}</b><span>${size(v.free)} free of ${size(v.size)}</span></div>
        <div class="bar"><i style="width:${(used * 100).toFixed(1)}%"></i></div>
      </div>`;
    })
    .join('');
  return card('Storage', `${disks}<div class="sub" style="margin-top:14px">Drives</div>${vols}`);
}

function screensCard(d) {
  const mons = d.monitors || [];
  return card(
    'Monitors',
    rows(mons.map((m, i) => [`Display ${i + 1}`, `${m.width} × ${m.height} @ ${m.hz} Hz <small>${esc(m.name)} · ${m.scale}%${m.primary ? ' · primary' : ''}</small>`])),
    { meta: `${mons.length} connected` },
  );
}

function networkCard(d) {
  const nets = d.network || [];
  const body = nets.length
    ? `<div class="finds">${nets
        .map((n) => {
          const vpn = CATALOG.vpn.test(`${n.name} ${n.desc}`);
          return `<div class="find ${vpn ? 'running' : ''}">
          <span class="f-name">${esc(n.name)}</span><span class="f-extra">${esc(n.desc)}</span>
          <span class="state ${vpn ? 'running' : ''}">${vpn ? 'VPN' : esc(n.speed)}</span>
        </div>`;
        })
        .join('')}</div>`
    : '<p class="none-found">Not connected.</p>';
  return card('Network', body, { meta: `${nets.length} connected` });
}

function gamingCard(d, gaming, changes) {
  const plan = d.gaming.powerPlan;
  return card(
    'Gaming and Windows',
    `<div class="tiles">${gaming.map((t) => tileHtml(t, changes[t.id])).join('')}${tileHtml({ ...tile('power', 'Power plan', 'info', plan || "couldn't read", 'power') })}</div>`,
    { cls: 'wide' },
  );
}

function securityCard(groups, changes) {
  const all = groups.flatMap((g) => g.tiles);
  const on = all.filter((t) => t.state === 'on').length;
  return card(
    'Security',
    groups.map((g) => `<div class="sub">${esc(g.title)}</div><div class="tiles">${g.tiles.map((t) => tileHtml(t, changes[t.id])).join('')}</div>`).join(''),
    { cls: 'wide', meta: `${on} of ${all.length} enabled` },
  );
}

// ---------- what changed since the last check ----------

function snapshot(groups, gaming) {
  const states = {};
  for (const t of [...groups.flatMap((g) => g.tiles), ...gaming]) states[t.id] = { name: t.name, state: t.state };
  for (const [key, items] of Object.entries(lists)) for (const i of items) states[`${key}:${i.name}`] = { name: i.name, state: i.status === 'none' ? 'none' : 'found' };
  return { at: data.at, states };
}

const CHANGE_WORD = { on: 'on', off: 'off', part: 'partly on', unknown: 'unknown', na: 'n/a', found: 'installed', none: 'not found' };

function summaryHtml(groups, gaming, changeList, before) {
  const all = [...groups.flatMap((g) => g.tiles), ...gaming];
  const count = (st) => all.filter((t) => t.state === st).length;
  const runningAc = lists.antiCheat.filter((i) => i.status === 'running').length;
  const runningOv = lists.overlays.filter((i) => i.status === 'running').length;
  let changes;
  if (!before) changes = '<span>First check. Next time, anything that changed shows here.</span>';
  else if (!changeList.length) changes = `<span class="eyebrow">Since ${esc(when(before.at))}</span><span>Nothing changed.</span>`;
  else
    changes = `<span class="eyebrow">Since ${esc(when(before.at))}</span>${changeList
      .map((c) => `<span class="change">${esc(c.name)} <i>${esc(CHANGE_WORD[c.from])} →</i> ${esc(CHANGE_WORD[c.to])}</span>`)
      .join('')}`;
  return `
    <div class="sum-title">
      <span class="eyebrow">Checked ${esc(when(data.at))}</span>
      <h1>${esc(data.system.computer)}</h1>
      <p>${esc(data.system.cpu)} · ${esc(data.system.gpus?.[0]?.name || '')} · ${Math.round(data.system.ramBytes / GiB)} GB</p>
    </div>
    <div class="sum-stats">
      <div class="stat lit"><b>${count('on')}</b><span>Enabled</span></div>
      <div class="stat"><b>${count('part')}</b><span>Partly</span></div>
      <div class="stat faint"><b>${count('off')}</b><span>Disabled</span></div>
      <div class="stat ${runningAc ? 'lit' : 'faint'}"><b>${runningAc}</b><span>Anti-cheats running</span></div>
      <div class="stat ${runningOv ? 'lit' : 'faint'}"><b>${runningOv}</b><span>Overlays running</span></div>
    </div>
    <div class="changes">${changes}</div>`;
}

async function drawOverview() {
  const groups = securityGroups(data);
  const gaming = gamingTiles(data);
  lists = matchLists(data);
  tiles = [...groups.flatMap((g) => g.tiles), ...gaming];

  const now = snapshot(groups, gaming);
  const before = await flamez.swapLast(now);
  const changes = {};
  const changeList = [];
  if (before?.states) {
    for (const [id, cur] of Object.entries(now.states)) {
      const was = before.states[id];
      if (was && was.state !== cur.state) {
        changes[id] = was.state;
        changeList.push({ name: cur.name, from: was.state, to: cur.state });
      }
    }
  }

  $('#summary').innerHTML = summaryHtml(groups, gaming, changeList, before);
  const stack = (...cards) => `<div class="stack">${cards.join('')}</div>`;
  $('#cards').innerHTML = [
    stack(systemCard(data), antivirusCard(data)),
    securityCard(groups, changes),
    gamingCard(data, gaming, changes),
    softwareCard(data),
    findsCard('Anti-cheat', lists.antiCheat, { removable: true, note: 'Kernel anti-cheats load a driver; "Running" means it is loaded right now. Uninstall opens the anti-cheat\'s own uninstaller; press Refresh when it\'s done.' }),
    findsCard('Launchers', lists.launchers),
    findsCard('Overlays and recording', lists.overlays),
    findsCard('Debug and inspect tools', lists.tools, { note: "Some anti-cheats won't let a game start while one of these is open." }),
    storageCard(data),
    stack(screensCard(data), networkCard(data)),
  ].join('');
}

// ---------- services and drivers page ----------

const svcView = { kind: 'services', state: 'all', mode: 'all', search: '', sort: 'd', up: false };
const MODE_WORD = { Auto: 'Automatic', Manual: 'Manual', Disabled: 'Disabled', Boot: 'Boot', System: 'System' };

function drawServices() {
  const all = (svcView.kind === 'services' ? data.services : data.drivers) || [];
  const q = svcView.search.trim().toLowerCase();
  const modeOk = (m) => svcView.mode === 'all' || m === svcView.mode || (svcView.mode === 'Auto' && (m === 'Boot' || m === 'System'));
  const list = all
    .filter((x) => (svcView.state === 'all' || x.s === svcView.state) && modeOk(x.m) && (!q || `${x.d} ${x.n}`.toLowerCase().includes(q)))
    .sort((a, b) => String(a[svcView.sort] ?? '').localeCompare(String(b[svcView.sort] ?? ''), undefined, { sensitivity: 'base' }) * (svcView.up ? -1 : 1));

  const running = all.filter((x) => x.s === 'Running').length;
  $('#svc-kind-label').textContent = svcView.kind === 'services' ? 'Services' : 'Drivers';
  $('#svc-counts').innerHTML = `${all.length} total<i>·</i>${running} running<i>·</i>${all.length - running} stopped${list.length !== all.length ? `<i>·</i>${list.length} shown` : ''}`;

  $$('#svc-table th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.sort === svcView.sort);
    th.classList.toggle('up', th.dataset.sort === svcView.sort && svcView.up);
  });

  $('#svc-table tbody').innerHTML = list.length
    ? list
        .map((x) => {
          const mode = x.m === 'Auto' && x.late ? 'Automatic (delayed)' : MODE_WORD[x.m] || x.m;
          const cls = x.m === 'Disabled' ? 'off' : ['Auto', 'Boot', 'System'].includes(x.m) ? 'auto' : '';
          return `<tr title="${esc(x.desc || '')}">
          <td>${esc(x.d)}</td><td class="dim">${esc(x.n)}</td>
          <td><span class="state ${x.s === 'Running' ? 'running' : ''}">${esc(x.s)}</span></td>
          <td class="mode ${cls}">${esc(mode)}</td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="4" class="empty">Nothing matches.</td></tr>';
}

function bindSeg(id, key) {
  $(`#${id}`).addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    $$(`#${id} .chip`).forEach((c) => c.classList.toggle('active', c === b));
    svcView[key] = b.dataset.v;
    if (key === 'kind') $('#svc-open').hidden = b.dataset.v !== 'services';
    drawServices();
  });
}

// ---------- start-up page ----------

function drawStartup() {
  const items = data.startup || [];
  const on = items.filter((i) => i.on).length;
  $('#startup-counts').innerHTML = `${items.length} app${items.length === 1 ? '' : 's'}<i>·</i>${on} enabled<i>·</i>${items.length - on} disabled`;
  $('#startup-list').innerHTML = items.length
    ? items
        .sort((a, b) => b.on - a.on || a.name.localeCompare(b.name))
        .map(
          (i) => `<div class="tile ${i.on ? 'on' : 'off'}" title="${esc(i.cmd)}">
        <span class="t-text"><span class="t-name">${esc(i.name)}</span><span class="t-status">${i.on ? 'Enabled' : 'Disabled'}</span><span class="t-detail">${esc(i.cmd)}</span></span>
        <span class="where">${esc(i.where)}</span>
        <i class="switch"></i>
      </div>`,
        )
        .join('')
    : '<p class="empty">Nothing starts with Windows.</p>';
}

// ---------- drivers page ----------

const GPU_MAKER = { '10DE': 'NVIDIA', '1002': 'AMD', '8086': 'Intel' };
let online = {}; // NVIDIA releases per card name, looked up after each check
let onlineState = 'idle'; // idle | loading | done
const driverView = { channel: 'gameReady', older: false }; // older: also show releases from before this year

// NVIDIA's own number (617.42) from the one Windows shows (32.0.16.1742)
function nvNumber(v) {
  const p = String(v || '').split('.');
  if (p.length < 4) return v;
  const digits = (p[2] + p[3].padStart(4, '0')).slice(-5);
  return `${digits.slice(0, 3)}.${digits.slice(3)}`;
}

const newer = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }) > 0;
const webSearch = (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
const linkBtn = (url, label, cls = '') => `<button class="dl ${cls}" data-link="${esc(url)}"><i data-icon="${cls === 'primary' ? 'save' : 'external'}"></i>${esc(label)}</button>`;
// driver store dates come as MM/DD/YYYY
const storeDay = (s) => {
  const [m, d, y] = String(s).split('/');
  return y ? day(new Date(+y, m - 1, +d).toISOString()) : s;
};

function chipsetInfo(d) {
  const amd = /AMD/i.test(d.system.cpu);
  const chip = d.system.board.match(/\b([ABXHZQ]\d{3})/i)?.[1]?.toUpperCase();
  const AM4 = /^(A320|B350|X370|B450|X470|A520|B550|X570)$/;
  const AM5 = /^(A620|B650|X670|B840|B850|X870)$/;
  let page;
  if (amd && chip && (AM4.test(chip) || AM5.test(chip))) page = `https://www.amd.com/en/support/downloads/drivers.html/chipsets/${AM4.test(chip) ? 'am4' : 'am5'}/${chip.toLowerCase()}.html`;
  else if (amd) page = 'https://www.amd.com/en/support/download/drivers.html';
  else page = 'https://www.intel.com/content/www/us/en/support/detect.html';
  const software = (d.apps || [])
    .filter((a) => (amd ? /^AMD (Chipset Software|Ryzen Master|.+ Driver)$/i : /^Intel.*(Chipset|Management Engine|Serial IO|Rapid Storage)/i).test(a.n))
    .sort((a, b) => a.n.localeCompare(b.n));
  return { amd, chip, page, software };
}

function biosPage(board) {
  if (/Micro-Star|MSI/i.test(board)) {
    const model = board.replace(/^Micro-Star International Co\.,? Ltd\.?\s*/i, '').replace(/\s*\(MS-\w+\)\s*$/i, '').trim().replace(/\s+/g, '-');
    return `https://www.msi.com/Motherboard/${model}/support#bios`;
  }
  if (/ASUS/i.test(board)) return 'https://www.asus.com/support/download-center/';
  if (/ASRock/i.test(board)) return 'https://www.asrock.com/support/index.asp';
  if (/Gigabyte/i.test(board)) return 'https://www.gigabyte.com/Support';
  return webSearch(`${board} BIOS download`);
}

function driverPage(provider, name) {
  if (/Realtek/i.test(provider)) return 'https://www.realtek.com/Download/Index?menu_id=297';
  if (/NVIDIA/i.test(provider)) return 'https://www.nvidia.com/en-us/drivers/';
  if (/Advanced Micro Devices|^AMD/i.test(provider)) return chipsetInfo(data).page;
  if (/Intel/i.test(provider)) return 'https://www.intel.com/content/www/us/en/support/detect.html';
  return webSearch(`${name} driver download`);
}

function gpuDriverCard(g) {
  const maker = GPU_MAKER[g.vendor] || 'Other';
  const store = (data.driverStore || []).filter((x) => maker === 'Other' || new RegExp(maker === 'AMD' ? 'AMD|Advanced Micro' : maker, 'i').test(x.provider));
  const isNv = maker === 'NVIDIA';
  const show = (v) => (isNv ? nvNumber(v) : v);
  const installed = show(g.version);

  let releases = '';
  let status = '';
  if (isNv) {
    const info = online[g.name];
    if (onlineState === 'loading' && !info) releases = '<p class="note">Looking up NVIDIA drivers…</p>';
    else if (!info || info.error) releases = `<p class="note">${esc(info?.error || "Couldn't look up NVIDIA drivers.")}</p><div class="r-btns left">${linkBtn('https://www.nvidia.com/en-us/drivers/', 'NVIDIA drivers')}</div>`;
    else {
      const list = info[driverView.channel] || [];
      const latest = list[0];
      if (latest) status = newer(latest.version, installed) ? `<span class="badge hot">Update available · ${esc(latest.version)}</span>` : '<span class="badge ok">Up to date</span>';
      const onPc = new Set(store.map((x) => nvNumber(x.version)));
      // every release from this year, plus older ones when asked
      const year = new Date().getFullYear();
      const thisYear = list.filter((r) => new Date(r.date).getFullYear() >= year);
      const olderCount = list.length - thisYear.length;
      const rowsHtml = (driverView.older ? list : thisYear)
        .map((r, i) => {
          const tags = [r.version === installed ? '<span class="tag on">Installed</span>' : '', i === 0 ? '<span class="tag">Latest</span>' : '', onPc.has(r.version) && r.version !== installed ? '<span class="tag">On this PC</span>' : ''].join('');
          const when = new Date(r.date);
          return `<div class="release ${r.version === installed ? 'current' : ''}">
            <b>${esc(r.version)}</b>${tags}
            <span class="r-meta">${isNaN(when) ? esc(r.date) : day(when.toISOString())} · ${esc(r.size)}</span>
            <span class="r-btns">${r.notes ? linkBtn(r.notes, 'Notes') : ''}${linkBtn(r.url, 'Download', 'primary')}</span>
          </div>`;
        })
        .join('');
      releases = `
        <div class="rel-head">
          <div class="seg" data-act="channel">
            <button class="chip ${driverView.channel === 'gameReady' ? 'active' : ''}" data-v="gameReady">Game Ready</button>
            <button class="chip ${driverView.channel === 'studio' ? 'active' : ''}" data-v="studio">Studio</button>
          </div>
          <span class="r-meta">${thisYear.length} released in ${year}${driverView.older ? ` · ${olderCount} older` : ''}</span>
        </div>
        <div class="releases">${rowsHtml || `<p class="none-found">None released in ${year} yet.</p>`}</div>
        ${olderCount ? `<button class="more" data-act="older">${driverView.older ? `Only show ${year}` : `Show ${olderCount} older drivers`}</button>` : ''}`;
    }
  } else {
    const amdSoftware = maker === 'AMD' ? (data.apps || []).find((a) => /^AMD Software/i.test(a.n)) : null;
    const page =
      maker === 'AMD' ? 'https://www.amd.com/en/support/download/drivers.html' : maker === 'Intel' ? 'https://www.intel.com/content/www/us/en/download/785597/intel-arc-iris-xe-graphics-windows.html' : webSearch(`${g.name} driver download`);
    releases = `<p class="note">${maker === 'Other' ? "Search for this card's drivers:" : `${maker} doesn't share its driver list, so open their page to pick the current or a previous driver.`}${amdSoftware ? ` AMD Software ${esc(amdSoftware.v)} is installed.` : ''}</p>
      <div class="r-btns left">${linkBtn(page, `${maker === 'Other' ? 'Find' : maker} drivers (current and previous)`, 'primary')}</div>`;
  }

  const allReleases = Object.values(online).flatMap((o) => [...(o.gameReady || []), ...(o.studio || [])]);
  const storeRows = [...store]
    .sort((a, b) => (newer(a.version, b.version) ? -1 : 1))
    .map((x) => {
      const inUse = x.version === g.version;
      const release = isNv && allReleases.find((r) => r.version === nvNumber(x.version));
      return `<div class="release ${inUse ? 'current' : ''}">
        <b>${esc(show(x.version))}</b>${inUse ? '<span class="tag on">In use</span>' : '<span class="tag">Previous</span>'}
        <span class="r-meta">${esc(storeDay(x.date))} · ${esc(x.inf)}</span>
        <span class="r-btns">${inUse ? '' : '<button class="dl" data-place="deviceManager"><i data-icon="external"></i>Roll back</button>'}${release && !inUse ? linkBtn(release.url, 'Download', 'primary') : ''}</span>
      </div>`;
    })
    .join('');

  return card(
    'Graphics driver',
    `<div class="drv-top">
      <div><div class="drv-name">${esc(g.name)}</div><div class="r-meta">${esc(maker)} · Windows version ${esc(g.version)}</div></div>
      <div class="drv-installed"><span class="eyebrow">Installed</span><b>${esc(installed)}</b><span class="r-meta">${day(g.date)}</span></div>
      ${status}
    </div>
    ${releases}
    <div class="sub" style="margin-top:16px">Saved on this PC</div>
    <div class="releases">${storeRows || '<p class="none-found">Windows has no other graphics drivers saved.</p>'}</div>
    <p class="note">To go back to a saved driver: Device Manager → Display adapters → your card → Properties → Driver → Roll Back Driver.</p>`,
    { cls: 'wide' },
  );
}

function drawDrivers() {
  if (!data) return;
  const d = data;
  const cs = chipsetInfo(d);
  const gpus = d.gpuDrivers || [];

  const cpuCard = card(
    'CPU and chipset',
    `${rows([
      ['CPU', esc(d.system.cpu)],
      ['Microcode', d.microcode ? `${esc(d.microcode)} <small>loaded by the BIOS / Windows</small>` : "<small>couldn't read</small>"],
      ['Chipset', cs.chip ? `${esc(cs.chip)} <small>${cs.amd ? 'AMD' : 'Intel'}</small>` : '<small>unknown</small>'],
      ...cs.software.map((a) => [a.n.replace(/^(AMD|Intel\S*) /, ''), esc(a.v)]),
    ])}
    ${cs.software.length ? '' : `<p class="note">No ${cs.amd ? 'AMD' : 'Intel'} chipset software found.</p>`}
    <div class="r-btns left">${linkBtn(cs.page, 'Chipset drivers (current and previous)', 'primary')}</div>`,
  );

  const biosCard = card(
    'BIOS',
    `${rows([
      ['Board', esc(d.system.board)],
      ['Version', `${esc(d.system.bios)} <small>${day(d.system.biosDate)}</small>`],
      ['Firmware', esc(d.system.firmware)],
    ])}
    <div class="r-btns left">${linkBtn(biosPage(d.system.board), 'BIOS downloads (current and previous)', 'primary')}</div>
    <p class="note">Only flash a BIOS from your board maker's page, and don't turn the PC off while it updates.</p>`,
  );

  const TYPE = { MEDIA: 'Audio', NET: 'Network', BLUETOOTH: 'Bluetooth', SYSTEM: 'Chipset', HDC: 'Storage', SCSIADAPTER: 'Storage' };
  const seen = new Set();
  const others = (d.deviceDrivers || [])
    .filter((x) => {
      const key = `${x.name}|${x.version}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (TYPE[a.cls] || a.cls).localeCompare(TYPE[b.cls] || b.cls) || a.name.localeCompare(b.name));
  const otherCard = card(
    'Other drivers',
    others.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Type</th><th>Device</th><th>Maker</th><th>Version</th><th>Date</th><th></th></tr></thead>
          <tbody>${others
            .map((x) => `<tr><td class="dim">${esc(TYPE[x.cls] || x.cls)}</td><td>${esc(x.name)}</td><td class="dim">${esc(x.provider)}</td><td>${esc(x.version)}</td><td class="dim">${day(x.date)}</td><td class="r-cell">${linkBtn(driverPage(x.provider, x.name), 'Find')}</td></tr>`)
            .join('')}</tbody></table></div>`
      : "<p class=\"none-found\">No other makers' drivers found.</p>",
    { cls: 'full', meta: `${others.length} drivers` },
  );

  const gpuCards = gpus.length ? gpus.map(gpuDriverCard).join('') : card('Graphics driver', '<p class="none-found">No graphics card found.</p>', { cls: 'wide' });
  $('#driver-cards').innerHTML = `${d.driversError ? `<p class="note">Couldn't read drivers: ${esc(d.driversError)}</p>` : ''}${gpuCards}<div class="stack">${cpuCard}${biosCard}</div>${otherCard}`;
  drawIcons($('#driver-cards'));
}

async function lookUpDrivers() {
  const names = (data.gpuDrivers || []).filter((g) => g.vendor === '10DE').map((g) => g.name);
  if (!names.length) return;
  onlineState = 'loading';
  drawDrivers();
  try {
    online = await flamez.driversOnline(names);
  } catch {
    online = {};
  }
  onlineState = 'done';
  drawDrivers();
}

$('#driver-cards').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-act="channel"] .chip');
  if (chip) {
    driverView.channel = chip.dataset.v;
    drawDrivers();
  }
  if (e.target.closest('[data-act="older"]')) {
    driverView.older = !driverView.older;
    drawDrivers();
  }
});

// ---------- Windows page: which Windows this is and how to change it ----------

// Windows' own edition ids → the names people know, with how high up each sits
const EDITIONS = [
  { name: 'Home', ids: /^Core/, rank: 0, about: 'What most PCs come with.' },
  { name: 'Pro', ids: /^Professional(N)?$|^ProfessionalEducation/, rank: 1, about: 'Adds BitLocker, Hyper-V, Windows Sandbox and Remote Desktop.' },
  { name: 'Pro for Workstations', ids: /^ProfessionalWorkstation/, rank: 2, about: 'Pro for heavy workstation hardware.' },
  { name: 'Education', ids: /^Education/, rank: 2, about: 'Through a school licence.' },
  { name: 'Enterprise', ids: /^(Enterprise|IoTEnterprise)/, rank: 3, about: 'Through a business licence.' },
];
const GO_BACK_DAYS = 10; // how long Windows keeps the version it updated from

function windowsCards(d) {
  const s = d.system;
  const sec = d.security;
  const win11 = /Windows 11/i.test(s.os);
  const current = EDITIONS.find((e) => e.ids.test(s.edition || '')) || EDITIONS.find((e) => s.os.includes(e.name));

  const licence =
    s.activated == null ? '<span class="badge">Activation unknown</span>' : s.activated ? `<span class="badge ok">Activated${s.licence ? ` · ${esc(s.licence)}` : ''}</span>` : '<span class="badge hot">Not activated</span>';
  const yours = card(
    'Your Windows',
    `<div class="drv-top">
      <div><div class="drv-name">${esc(s.os)}</div><div class="r-meta">${esc(s.edition || '')} · ${esc(s.arch)} · installed ${day(s.installed)}</div></div>
      <div class="drv-installed"><span class="eyebrow">Version</span><b>${esc(s.release || '—')}</b><span class="r-meta">build ${esc(s.build)}</span></div>
      ${licence}
    </div>
    <div class="r-btns left">
      <button class="dl primary" data-place="update"><i data-icon="refresh"></i>Check for updates</button>
      <button class="dl" data-place="activation"><i data-icon="external"></i>Activation</button>
      <button class="dl" data-place="about"><i data-icon="external"></i>About this PC</button>
    </div>`,
    { cls: 'wide' },
  );

  // Windows 11's minimum, from what the check already read
  const sysVol = (d.volumes || []).find((v) => v.letter === (s.drive || 'C'));
  const checks = [
    ['64-bit Windows', /64/.test(s.arch), s.arch],
    ['UEFI firmware', s.firmware === 'UEFI', s.firmware || 'unknown'],
    ['Secure Boot', sec.secureBoot === 1, sec.secureBoot === 1 ? 'on' : s.firmware === 'UEFI' ? 'off, can be turned on in the BIOS' : 'needs UEFI'],
    ['TPM 2.0', !!sec.tpm?.ok, sec.tpm ? sec.tpm.name.replace('Trusted Platform Module', 'TPM') : 'not found, often a BIOS setting (fTPM / PTT)'],
    ['4 GB RAM', s.ramBytes >= 4 * GiB, `${Math.round(s.ramBytes / GiB)} GB`],
    ['64 GB drive', sysVol ? sysVol.size >= 64 * GiB : null, sysVol ? `${sysVol.letter}: ${size(sysVol.size)}` : 'unknown'],
  ];
  const passed = checks.filter((c) => c[1]).length;
  const ready = card(
    'Windows 11 ready?',
    `<div class="finds">${checks
      .map(
        ([name, ok, detail]) => `<div class="find ${ok ? 'running' : ''}">
        <span class="f-name">${esc(name)}</span><span class="f-extra">${esc(detail)}</span>
        <span class="state ${ok ? 'running' : ''}">${ok ? 'Yes' : ok === false ? 'No' : '?'}</span>
      </div>`,
      )
      .join('')}</div>
    <p class="note">The CPU has to be on Microsoft's list too. PC Health Check tells you for sure.</p>
    <div class="r-btns left">${linkBtn(webSearch('PC Health Check app download Microsoft'), 'PC Health Check')}</div>`,
    { meta: win11 ? 'already on Windows 11' : `${passed} of ${checks.length}`, metaLit: !win11 && passed === checks.length },
  );

  const editionRows = EDITIONS.map((e) => {
    const isCurrent = e === current;
    const up = current && e.rank > current.rank;
    // only Home → Pro is a simple key upgrade; the others come with their own licence
    const how = isCurrent ? 'this PC' : up ? (e.rank === 1 ? 'upgrade with a key, no reinstall' : e.about) : current ? 'needs a clean install' : '';
    return `<div class="release ${isCurrent ? 'current' : ''}">
      <b>${esc(e.name)}</b>${isCurrent ? '<span class="tag on">Installed</span>' : ''}
      <span class="r-meta" title="${esc(e.about)}">${esc(how)}</span>
      <span class="r-btns">${up && e.rank < 2 ? '<button class="dl" data-place="activation"><i data-icon="external"></i>Upgrade</button>' : ''}</span>
    </div>`;
  }).join('');
  const edition = card(
    'Change edition',
    `<div class="releases">${editionRows}</div>
    <p class="note">Going up (Home → Pro) keeps everything: buy the upgrade in Activation, or type in a key you already have. Going down to a lower edition means reinstalling Windows.</p>
    <div class="r-btns left">
      <button class="dl primary" data-place="activation"><i data-icon="external"></i>Activation</button>
      <button class="dl" data-place="productKey"><i data-icon="external"></i>Enter a product key</button>
    </div>`,
    { cls: 'half' },
  );

  // the version it updated from, if Windows still has it
  const prevAge = s.previous ? (Date.now() - new Date(s.previous)) / 86400000 : null;
  const daysLeft = prevAge == null ? 0 : Math.floor(GO_BACK_DAYS - prevAge);
  const version = card(
    'Change version',
    `<div class="releases">
      <div class="release">
        <b>Newer</b><span class="r-meta">the latest ${win11 ? 'Windows 11' : 'Windows'} update</span>
        <span class="r-btns"><button class="dl primary" data-place="update"><i data-icon="refresh"></i>Windows Update</button></span>
      </div>
      <div class="release current">
        <b>${esc(s.release || 'Now')}</b><span class="tag on">Installed</span><span class="r-meta">build ${esc(s.build)}</span>
      </div>
      <div class="release">
        <b>Previous</b><span class="r-meta">${
          daysLeft > 0 ? `kept for about ${daysLeft} more day${daysLeft === 1 ? '' : 's'}` : s.previous ? 'kept too long ago to go back' : 'not kept on this PC'
        }</span>
        <span class="r-btns">${daysLeft > 0 ? '<button class="dl" data-place="recovery"><i data-icon="external"></i>Go back</button>' : ''}</span>
      </div>
      <div class="release">
        <b>Preview</b><span class="r-meta">test builds before everyone else</span>
        <span class="r-btns"><button class="dl" data-place="insider"><i data-icon="external"></i>Insider Program</button></span>
      </div>
    </div>
    <p class="note">After an update, Windows keeps the old version for ${GO_BACK_DAYS} days so you can go back (Settings → System → Recovery → Go back). After that, only a reinstall goes back.</p>`,
    { cls: 'half' },
  );

  const install = card(
    'Install a different Windows',
    `<div class="releases">
      <div class="release ${win11 ? 'current' : ''}">
        <b>Windows 11</b>${win11 ? '<span class="tag on">Installed</span>' : '<span class="tag">Latest</span>'}
        <span class="r-meta">${win11 ? 'reinstall or make a USB' : 'upgrade in place, keeps your files and apps'}</span>
        <span class="r-btns">${linkBtn('https://www.microsoft.com/software-download/windows11', 'Download from Microsoft', 'primary')}</span>
      </div>
      <div class="release ${win11 ? '' : 'current'}">
        <b>Windows 10</b>${win11 ? '' : '<span class="tag on">Installed</span>'}
        <span class="r-meta">22H2, the last one · no more security updates</span>
        <span class="r-btns">${linkBtn('https://www.microsoft.com/software-download/windows10', 'Download from Microsoft')}</span>
      </div>
    </div>
    <p class="note">Microsoft's page has the Installation Assistant (upgrades this PC), the Media Creation Tool (makes an install USB) and the ISO. Going from Windows 11 back to 10 is a clean install, so back up your files first. Your licence carries over: the same edition activates on either.</p>`,
    { cls: 'full' },
  );

  return `${yours}${ready}${edition}${version}${install}`;
}

function drawWindows() {
  $('#windows-cards').innerHTML = windowsCards(data);
  drawIcons($('#windows-cards'));
}

// ---------- the report ----------

function report() {
  const s = data.system;
  const pad = (t) => `[${STATE_WORD[t.state] || 'Info'}]`.padEnd(18);
  const lines = [
    `FLAMEZ CHECKER - ${s.computer} - ${new Date(data.at).toLocaleString()}`,
    '',
    'SYSTEM',
    `  Windows     ${s.os} ${s.release} (build ${s.build})`,
    `  Licence     ${s.activated == null ? 'unknown' : s.activated ? `activated${s.licence ? `, ${s.licence}` : ''}` : 'not activated'}`,
    `  Firmware    ${s.firmware}, BIOS ${s.bios}`,
    `  Board       ${s.board}`,
    `  CPU         ${s.cpu}`,
    ...(s.gpus || []).map((g) => `  GPU         ${g.name} (driver ${g.driver})`),
    `  RAM         ${Math.round(s.ramBytes / GiB)} GB @ ${s.ramSpeed} MHz`,
    `  Up for      ${uptime(s.booted)}`,
    '',
  ];
  for (const g of securityGroups(data)) {
    lines.push(g.title.toUpperCase());
    for (const t of g.tiles) lines.push(`  ${pad(t)}${t.name}${t.detail ? ` - ${t.detail}` : ''}`);
    lines.push('');
  }
  lines.push('GAMING AND WINDOWS');
  for (const t of gamingTiles(data)) lines.push(`  ${pad(t)}${t.name}${t.detail ? ` - ${t.detail}` : ''}`);
  lines.push(`  Power plan        ${data.gaming.powerPlan || '?'}`, '');
  lines.push('ANTIVIRUS');
  for (const a of data.security.antivirus || []) lines.push(`  [${a.on ? 'Enabled' : 'Disabled'}]`.padEnd(20) + a.name);
  lines.push('');
  const titles = { antiCheat: 'ANTI-CHEAT', launchers: 'LAUNCHERS', overlays: 'OVERLAYS AND RECORDING', tools: 'DEBUG AND INSPECT TOOLS' };
  for (const [key, title] of Object.entries(titles)) {
    lines.push(title);
    const found = lists[key].filter((i) => i.status !== 'none');
    if (!found.length) lines.push('  none found');
    for (const i of found) lines.push(`  [${i.status === 'running' ? 'Running' : 'Installed'}]`.padEnd(20) + i.name + (i.extra ? ` - ${i.extra}` : ''));
    lines.push('');
  }
  lines.push('STORAGE');
  for (const k of data.disks || []) lines.push(`  Disk ${k.id}  ${k.name} - ${k.bus} ${size(k.size)} ${k.style}`);
  for (const v of data.volumes || []) if (v.size) lines.push(`  ${v.letter}:      ${size(v.free)} free of ${size(v.size)}`);
  lines.push('', 'MONITORS');
  for (const m of data.monitors || []) lines.push(`  ${m.width}x${m.height} @ ${m.hz} Hz - ${m.name}${m.primary ? ' (primary)' : ''}`);
  lines.push('', 'DRIVERS');
  for (const g of data.gpuDrivers || []) {
    const nv = g.vendor === '10DE';
    const latest = nv ? online[g.name]?.gameReady?.[0]?.version : null;
    lines.push(`  GPU         ${g.name} - ${nv ? nvNumber(g.version) : g.version}${latest ? ` (latest Game Ready ${latest})` : ''}`);
  }
  for (const a of chipsetInfo(data).software) lines.push(`  Chipset     ${a.n} ${a.v}`);
  lines.push(`  BIOS        ${s.bios} (${day(s.biosDate)})`);
  if (data.microcode) lines.push(`  Microcode   ${data.microcode}`);
  lines.push('', 'START-UP APPS');
  for (const i of data.startup || []) lines.push(`  [${i.on ? 'Enabled' : 'Disabled'}]`.padEnd(20) + i.name);
  return lines.join('\r\n');
}

// ---------- pages, checking and buttons ----------

let page = 'overview';

function showPage(name) {
  page = name;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === name));
  if (!data) return;
  $$('.page').forEach((p) => (p.hidden = p.id !== `page-${name}`));
  $('#main').scrollTop = 0;
}

function setStatus(html) {
  $('#status').innerHTML = html;
}

async function check() {
  if (checking) return;
  checking = true;
  document.body.classList.add('busy');
  $('#refresh-btn').classList.add('spin');
  setStatus('<span class="dot"></span>Checking…');
  const started = performance.now();
  try {
    data = await flamez.check();
    await drawOverview();
    drawServices();
    drawStartup();
    drawWindows();
    drawDrivers();
    lookUpDrivers();
    $('#loading').hidden = true;
    $('#failed').hidden = true;
    showPage(page);
    setStatus(`<span class="dot still"></span>Checked ${esc(time(data.at))} · took ${((performance.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    setStatus('<span class="dot still"></span>Check failed');
    if (!data) {
      $('#loading').hidden = true;
      $('#failed').hidden = false;
      $('#failed-text').textContent = String(err?.message || err).replace(/^Error invoking remote method '[^']+': /, '');
    } else toast("Couldn't check again. Showing the last results.");
  } finally {
    checking = false;
    document.body.classList.remove('busy');
    $('#refresh-btn').classList.remove('spin');
  }
}

// ---------- the spinning F ----------

// A stack of thin layers, front to back, so the F has thickness when it
// turns side-on: chrome on the two faces, a bright bevel next to each,
// darker steel in the middle.
function buildLogo(layers = 44) {
  let html = '';
  for (let i = 0; i < layers; i++) {
    const z = (0.5 - i / (layers - 1)).toFixed(3); // +0.5 is the front, -0.5 the back
    const fromFace = Math.min(i, layers - 1 - i);
    const [cls, src] = fromFace === 0 ? ['face', 'logo.png'] : fromFace <= 2 ? ['rim', 'logo-rim.png'] : ['edge', 'logo-edge.png'];
    html += `<img class="layer ${cls}" src="${src}" style="--z:${z}" alt="" />`;
  }
  $('#spinner').innerHTML = `${html}<div class="shine"></div>`;
}

buildLogo();
drawIcons();

$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) showPage(t.dataset.page);
});

// tiles open the Windows page where that setting is changed
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-place]');
  if (t) flamez.open(t.dataset.place);
  // download and support links open in the browser
  const l = e.target.closest('[data-link]');
  if (l) flamez.openLink(l.dataset.link).then((ok) => ok && toast('Opening in your browser'));
  const u = e.target.closest('[data-uninstall]');
  if (u)
    flamez.uninstall(u.dataset.uninstall).then((r) => {
      if (r.ok) toast("Uninstaller opened. Press Refresh when it's done.");
      else if (r.error) toast(r.error);
    });
});

$('#refresh-btn').addEventListener('click', check);
$('#retry-btn').addEventListener('click', () => {
  $('#failed').hidden = true;
  $('#loading').hidden = false;
  check();
});
$('#copy-btn').addEventListener('click', async () => {
  if (!data) return;
  await flamez.copyReport(report());
  toast('Report copied');
});
$('#save-btn').addEventListener('click', async () => {
  if (!data) return;
  const file = await flamez.saveReport(report());
  if (file) toast('Report saved');
});

$('#svc-search').addEventListener('input', (e) => {
  svcView.search = e.target.value;
  drawServices();
});
bindSeg('svc-kind', 'kind');
bindSeg('svc-state', 'state');
bindSeg('svc-mode', 'mode');
$('#svc-table thead').addEventListener('click', (e) => {
  const th = e.target.closest('th');
  if (!th) return;
  svcView.up = svcView.sort === th.dataset.sort ? !svcView.up : false;
  svcView.sort = th.dataset.sort;
  drawServices();
});
$('#svc-open').addEventListener('click', () => flamez.open('services'));
$('#startup-open').addEventListener('click', () => flamez.open('startupApps'));

$('#win-min').addEventListener('click', () => flamez.minimise());
$('#win-max').addEventListener('click', () => flamez.maximise());
$('#win-close').addEventListener('click', () => flamez.close());
flamez.onMaximised((on) => {
  $('#win-max').innerHTML = svg(on ? 'winRestore' : 'winMax');
  $('#win-max').title = on ? 'Restore' : 'Maximise';
});

// a new version downloads by itself; once it's ready the button restarts into it
flamez.onUpdate((u) => {
  if (u.state === 'ready') {
    $('#update-btn').hidden = false;
    toast(`Version ${u.version} is ready. Restart to update.`);
  }
});
$('#update-btn').addEventListener('click', () => flamez.installUpdate());

document.addEventListener('keydown', (e) => {
  if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
    e.preventDefault();
    check();
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'f' && page === 'services') {
    e.preventDefault();
    $('#svc-search').focus();
  }
});

// keep "Up for" ticking
setInterval(() => {
  const el = $('#uptime');
  if (el && data) el.textContent = uptime(data.system.booted);
}, 1000);

check();
