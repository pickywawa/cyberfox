import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { z } from 'zod';
import { Store } from './store.js';
import { Devices } from './devices.js';
import { Ai } from './ai.js';
import { nodeSchema, projectInput, settingsSchema } from '../shared/model.js';
const userData = process.env.CYBERFOX_USER_DATA;
if (userData) app.setPath('userData', userData);
let window: BrowserWindow | undefined;
let ai: Ai;
const isDev = process.env.CYBERFOX_DEV === '1';
function register<T>(channel: string, schema: z.ZodType<T>, handler: (arg: T) => unknown) {
  ipcMain.handle(channel, (event, arg) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error('IPC interdit');
    return handler(schema.parse(arg));
  });
}
const provider = z.enum(['codex', 'copilot']);
async function createWindow() {
  window = new BrowserWindow({
    width: 1510,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    title: 'Cyberfox',
    backgroundColor: '#16171d',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window?.webContents.getURL()) event.preventDefault();
  });
  if (isDev) await window.loadURL('http://127.0.0.1:5173');
  else await window.loadFile(path.join(import.meta.dirname, '../../dist/index.html'));
}
app
  .whenReady()
  .then(async () => {
    const store = new Store(app.getPath('userData'), app.getPath('documents'));
    await store.load();
    const devices = new Devices(() => ({
      url: store.state.settings.wdaUrl,
      udid: store.state.settings.wdaDeviceId,
    }));
    ai = new Ai(
      store,
      devices,
      (event) => window?.webContents.send('ai:login-progress', event),
      async (url) => {
        const parsed = new URL(url);
        if (
          parsed.protocol !== 'https:' ||
          !['auth.openai.com', 'github.com'].includes(parsed.hostname)
        )
          throw new Error('URL OAuth non autorisée');
        await shell.openExternal(url);
      },
    );
    register('workspace:load', z.undefined(), () => store.state);
    register('settings:save', settingsSchema, (s) => store.saveSettings(s));
    register('project:create', projectInput, (p) => store.create(p));
    register('project:select', z.string(), (id) => store.select(id));
    register(
      'project:update',
      z.object({
        id: z.string(),
        tab: z.enum(['creation', 'execution']).optional(),
        nodes: z.array(nodeSchema).max(1000).optional(),
      }),
      (p) => store.update(p),
    );
    register('directory:choose', z.undefined(), async () => {
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    });
    register('project:reveal', z.string(), (id) => shell.openPath(store.get(id).directory));
    register('ai:status', provider, (p) => ai.status(p));
    register('ai:login', provider, (p) => ai.login(p));
    register(
      'ai:ask',
      z.object({
        projectId: z.string(),
        prompt: z.string().trim().min(1).max(16000),
        nodeId: z.string().optional(),
        deviceIds: z.array(z.string()).max(2),
      }),
      (p) => ai.ask(p),
    );
    register('devices:scan', z.undefined(), () => devices.scan());
    register('devices:screenshot', z.string(), (id) => devices.screenshot(id));
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox('Cyberfox', String(error));
    app.quit();
  });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let closing = false;
app.on('before-quit', (event) => {
  if (ai && !closing) {
    event.preventDefault();
    closing = true;
    void ai.stop().finally(() => app.quit());
  }
});
