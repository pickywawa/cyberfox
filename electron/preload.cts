import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge, LoginProgress } from '../shared/model.js';
const bridge: Bridge = {
  updateStatus: () => ipcRenderer.invoke('update:status'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  updateRelease: () => ipcRenderer.invoke('update:release'),
  load: () => ipcRenderer.invoke('workspace:load'),
  settingsSave: (s) => ipcRenderer.invoke('settings:save', s),
  projectCreate: (p) => ipcRenderer.invoke('project:create', p),
  projectSelect: (id) => ipcRenderer.invoke('project:select', id),
  projectUpdate: (p) => ipcRenderer.invoke('project:update', p),
  chooseDirectory: () => ipcRenderer.invoke('directory:choose'),
  revealProject: (id) => ipcRenderer.invoke('project:reveal', id),
  providerStatus: (p) => ipcRenderer.invoke('ai:status', p),
  login: (p) => ipcRenderer.invoke('ai:login', p),
  onLogin: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: LoginProgress) =>
      callback(progress);
    ipcRenderer.on('ai:login-progress', listener);
    return () => ipcRenderer.removeListener('ai:login-progress', listener);
  },
  aiAsk: (input) => ipcRenderer.invoke('ai:ask', input),
  devicesScan: () => ipcRenderer.invoke('devices:scan'),
  aiCancel: (id) => ipcRenderer.invoke('ai:cancel', id),
  inspect: (id) => ipcRenderer.invoke('devices:inspect', id),
  perform: (input) => ipcRenderer.invoke('devices:perform', input),
  runStart: (input) => ipcRenderer.invoke('run:start', input),
  runCancel: () => ipcRenderer.invoke('run:cancel'),
  runCurrent: (id) => ipcRenderer.invoke('run:current', id),
  analyze: (input) => ipcRenderer.invoke('run:analyze', input),
  detachDevices: (value) => ipcRenderer.invoke('devices:detach', value),
  onEvent: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: import('../shared/model.js').LiveEvent,
    ) => callback(value);
    ipcRenderer.on('live:event', listener);
    return () => ipcRenderer.removeListener('live:event', listener);
  },
  screenshot: (id) => ipcRenderer.invoke('devices:screenshot', id),
};
contextBridge.exposeInMainWorld('cyberfox', bridge);
