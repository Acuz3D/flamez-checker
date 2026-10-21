const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flamez', {
  check: () => ipcRenderer.invoke('check:run'),
  swapLast: (now) => ipcRenderer.invoke('last:swap', now),
  open: (place) => ipcRenderer.invoke('place:open', place),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  driversOnline: (gpuNames) => ipcRenderer.invoke('drivers:online', gpuNames),
  copyReport: (text) => ipcRenderer.invoke('report:copy', text),
  saveReport: (text) => ipcRenderer.invoke('report:save', text),
  about: () => ipcRenderer.invoke('app:about'),
  minimise: () => ipcRenderer.send('win:min'),
  maximise: () => ipcRenderer.send('win:max'),
  close: () => ipcRenderer.send('win:close'),
  onMaximised: (cb) => ipcRenderer.on('maximized', (_e, on) => cb(on)),
});
