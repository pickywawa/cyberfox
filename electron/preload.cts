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
  projectApplicationInfo: (input) => ipcRenderer.invoke('project:application-info', input),
  projectApplications: (input) => ipcRenderer.invoke('project:applications', input),
  projectSelect: (id) => ipcRenderer.invoke('project:select', id),
  onEditProject: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('project:edit', listener);
    return () => ipcRenderer.removeListener('project:edit', listener);
  },
  onNewProject: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('project:new', listener);
    return () => ipcRenderer.removeListener('project:new', listener);
  },
  projectUpdate: (p) => ipcRenderer.invoke('project:update', p),
  chooseDirectory: () => ipcRenderer.invoke('directory:choose'),
  revealProject: (id) => ipcRenderer.invoke('project:reveal', id),
  providerStatus: (p) => ipcRenderer.invoke('ai:status', p),
  login: (p) => ipcRenderer.invoke('ai:login', p),
  logout: (p) => ipcRenderer.invoke('ai:logout', p),
  onLogin: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: LoginProgress) =>
      callback(progress);
    ipcRenderer.on('ai:login-progress', listener);
    return () => ipcRenderer.removeListener('ai:login-progress', listener);
  },
  aiAnswer: (input) => ipcRenderer.invoke('ai:answer', input),
  aiAsk: (input) => ipcRenderer.invoke('ai:ask', input),
  devicesScan: () => ipcRenderer.invoke('devices:scan'),
  deviceHealth: (id) => ipcRenderer.invoke('devices:health', id),
  openWdaProject: (id) => ipcRenderer.invoke('devices:open-wda', id),
  openDeviceDocumentation: (topic) => ipcRenderer.invoke('devices:documentation', topic),
  aiCancel: (id) => ipcRenderer.invoke('ai:cancel', id),
  inspect: (id) => ipcRenderer.invoke('devices:inspect', id),
  perform: (input) => ipcRenderer.invoke('devices:perform', input),
  campaignList: (input) => ipcRenderer.invoke('campaign:list', input),
  campaignCreate: (input) => ipcRenderer.invoke('campaign:create', input),
  campaignLoad: (input) => ipcRenderer.invoke('campaign:load', input),
  campaignUpdate: (input) => ipcRenderer.invoke('campaign:update', input),
  campaignClean: (input) => ipcRenderer.invoke('campaign:clean', input),
  campaignExport: (input) => ipcRenderer.invoke('campaign:export', input),
  runScreenshot: (input) => ipcRenderer.invoke('run:screenshot', input),
  replayCurrent: (input) => ipcRenderer.invoke('replay:current', input),
  replaySelect: (input) => ipcRenderer.invoke('replay:select', input),
  runStart: (input) => ipcRenderer.invoke('run:start', input),
  runCancel: () => ipcRenderer.invoke('run:cancel'),
  runCurrent: (id) => ipcRenderer.invoke('run:current', id),
  analyze: (input) => ipcRenderer.invoke('run:analyze', input),
  detachAi: (value) => ipcRenderer.invoke('ai:detach', value),
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
