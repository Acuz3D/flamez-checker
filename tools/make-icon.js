// Makes icon.png and icon.ico from the FLAMEZ logo in art/logo-original.png
// (the chrome F on its cyan glow). Run with: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const art = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'art/logo-original.png')).toString('base64');

// square around the F, rounded corners
const draw = `(async (src, sizes) => {
  const img = new Image(); img.src = src; await img.decode();
  const side = Math.min(img.width, img.height) * 0.97;
  const cx = img.width * 0.54, cy = img.height * 0.53;
  const out = {};
  for (const s of sizes) {
    const c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.beginPath(); g.roundRect(0, 0, s, s, s * 0.14); g.clip();
    g.fillStyle = '#090a10'; g.fillRect(0, 0, s, s);
    g.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, s, s);
    out[s] = c.toDataURL('image/png');
  }
  return out;
})`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body></body>');
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngs = await win.webContents.executeJavaScript(`${draw}(${JSON.stringify(art)}, ${JSON.stringify(sizes)})`);
  const buf = (s) => Buffer.from(pngs[s].split(',')[1], 'base64');
  fs.writeFileSync(path.join(root, 'icon.png'), buf(512));

  // .ico holding PNGs, one per size up to 256
  const icoSizes = sizes.filter((s) => s <= 256);
  const header = Buffer.alloc(6 + 16 * icoSizes.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;
  const bodies = icoSizes.map((s, i) => {
    const b = buf(s);
    const e = 6 + 16 * i;
    header.writeUInt8(s === 256 ? 0 : s, e); header.writeUInt8(s === 256 ? 0 : s, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(b.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += b.length;
    return b;
  });
  fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([header, ...bodies]));
  console.log('done');
  app.quit();
});
