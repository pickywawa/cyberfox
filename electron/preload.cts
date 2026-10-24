import { contextBridge, ipcRenderer } from 'electron';
import type { Bridge, LoginProgress } from '../shared/model.js';
const bridge: Bridge = {
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
  screenshot: (id) => ipcRenderer.invoke('devices:screenshot', id),
};
contextBridge.exposeInMainWorld('cyberfox', bridge);
