import { app, BrowserWindow, dialog, ipcMain, shell, session } from 'electron';
import path from 'node:path';
import { z } from 'zod';
import { Store } from './store.js';
import { Devices } from './devices.js';
import { Ai } from './ai.js';
import { Automation } from './automation.js';
import { Updater } from './updater.js';
import { Runner } from './runner.js';
import {
  nodeSchema,
  projectInput,
  settingsSchema,
  variantSchema,
  type LiveEvent,
} from '../shared/model.js';
if (process.env.CYBERFOX_USER_DATA) app.setPath('userData', process.env.CYBERFOX_USER_DATA);
let window: BrowserWindow | undefined;
let detached: BrowserWindow | undefined;
let ai: Ai;
let automation: Automation;
let runner: Runner;
let store: Store;
const allowed = new Set<BrowserWindow>();
const isDev = process.env.CYBERFOX_DEV === '1';
let quitting = false;
function emit(event: LiveEvent) {
  for (const win of allowed) if (!win.isDestroyed()) win.webContents.send('live:event', event);
}
function register<T>(channel: string, schema: z.ZodType<T>, handler: (arg: T) => unknown) {
  ipcMain.handle(channel, (event, arg) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || !allowed.has(owner) || event.senderFrame !== owner.webContents.mainFrame)
      throw new Error('IPC interdit');
    return handler(schema.parse(arg));
  });
}
async function createWindow(devicesOnly = false) {
  const win = new BrowserWindow({
    width: devicesOnly ? 900 : 1510,
    height: 960,
    minWidth: devicesOnly ? 360 : 1000,
    minHeight: 600,
    title: devicesOnly ? 'Cyberfox · Appareils' : 'Cyberfox',
    backgroundColor: '#16171d',
    titleBarStyle: devicesOnly ? 'default' : 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  allowed.add(win);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  win.on('closed', () => {
    allowed.delete(win);
    if (devicesOnly) {
      detached = undefined;
      if (!quitting)
        void store
          .saveSettings({ ...store.state.settings, devicesDetached: false })
          .then(() => emit({ type: 'workspace' }));
    } else window = undefined;
  });
  if (devicesOnly) detached = win;
  else window = win;
  if (isDev) await win.loadURL('http://127.0.0.1:5173' + (devicesOnly ? '?devices=1' : ''));
  else
    await win.loadFile(path.join(import.meta.dirname, '../../dist/index.html'), {
      query: devicesOnly ? { devices: '1' } : {},
    });
  return win;
}
app
  .whenReady()
  .then(async () => {
    store = new Store(app.getPath('userData'), app.getPath('documents'));
    await store.load();
    const devices = new Devices(() => ({
      url: store.state.settings.wdaUrl,
      udid: store.state.settings.wdaDeviceId,
    }));
    automation = new Automation(
      (id) => devices.known.get(id),
      () => store.state.settings,
      emit,
    );
    devices.automationScreenshot = (id) => automation.screenshot(id);
    ai = new Ai(
      store,
      devices,
      (event) => {
        for (const win of allowed)
          if (!win.isDestroyed()) win.webContents.send('ai:login-progress', event);
      },
      async (url) => {
        const parsed = new URL(url);
        if (
          parsed.protocol !== 'https:' ||
          !['auth.openai.com', 'github.com'].includes(parsed.hostname)
        )
          throw new Error('URL OAuth non autorisée');
        await shell.openExternal(url);
      },
      automation,
      emit,
    );
    runner = new Runner(store, automation, devices, emit, (entry, report) =>
      ai.analyze(entry, report),
    );
    const mutation = async <T>(promise: Promise<T>) => {
      const result = await promise;
      emit({ type: 'workspace' });
      return result;
    };
    register('workspace:load', z.undefined(), () => store.state);
    register('settings:save', settingsSchema, (s) =>
      mutation(store.saveSettings({ ...s, devicesDetached: store.state.settings.devicesDetached })),
    );
    register('project:create', projectInput, (p) => mutation(store.create(p)));
    register('project:select', z.string(), (id) => mutation(store.select(id)));
    register(
      'project:update',
      z.object({
        id: z.string(),
        tab: z.enum(['creation', 'execution']).optional(),
        nodes: z.array(nodeSchema).max(1000).optional(),
        tags: z.array(z.string().min(1).max(60)).max(500).optional(),
        deviceIds: z
          .object({ android: z.string().optional(), ios: z.string().optional() })
          .optional(),
        selectedNodeId: z.string().nullable().optional(),
        expectedRevision: z.number().int().optional(),
      }),
      (p) => mutation(store.update(p)),
    );
    register('directory:choose', z.undefined(), async () => {
      const result = await dialog.showOpenDialog(window!, {
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    });
    register('project:reveal', z.string(), (id) => shell.openPath(store.get(id).directory));
    const provider = z.enum(['codex', 'copilot']);
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
    register('ai:cancel', z.string(), (id) => ai.cancel(id));
    register('devices:scan', z.undefined(), () => devices.scan());
    register('devices:screenshot', z.string(), async (id) => {
      try {
        return await devices.screenshot(id);
      } catch (error) {
        emit({ type: 'device', deviceId: id, ready: false });
        throw error;
      }
    });
    register('devices:inspect', z.string(), async (id) => {
      try {
        return await automation.inspect(id);
      } catch (error) {
        if (!String(error).includes('occupé')) emit({ type: 'device', deviceId: id, ready: false });
        throw error;
      }
    });
    register(
      'devices:perform',
      z.object({
        deviceId: z.string(),
        variant: variantSchema,
        kind: z.enum(['scenario', 'action', 'navigation', 'test']),
      }),
      (p) => automation.perform(p.deviceId, p.variant, p.kind),
    );
    register(
      'run:start',
      z.object({
        projectId: z.string(),
        nodeId: z.string().optional(),
        deviceIds: z.array(z.string()).max(2),
      }),
      (p) => runner.start(p),
    );
    register('run:cancel', z.undefined(), () => runner.cancel());
    register('run:current', z.string(), (id) => runner.current(id));
    register('run:analyze', z.object({ runId: z.string(), entryId: z.string() }), (p) =>
      runner.analyze(p),
    );
    register('devices:detach', z.boolean(), async (value) => {
      await store.saveSettings({ ...store.state.settings, devicesDetached: value });
      if (value) {
        if (detached) detached.focus();
        else await createWindow(true);
      } else detached?.close();
      emit({ type: 'workspace' });
    });
    const network = session.fromPartition('persist:cyberfox-updates');
    await network.setProxy({ mode: 'system' });
    const updater = new Updater({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      directory: path.join(app.getPath('userData'), 'updates'),
      fetch: (url, init) => network.fetch(url, init),
      refreshProxy: async () => {
        await network.forceReloadProxyConfig();
        await network.closeAllConnections();
      },
      emit: (status) => emit({ type: 'update', status }),
      open: async (file) => {
        if (runner.isRunning())
          throw new Error(
            store.state.settings.language === 'fr'
              ? 'Arrêtez l’exécution des tests avant la mise à jour.'
              : 'Stop the test run before updating.',
          );
        const fr = store.state.settings.language === 'fr';
        const result = await dialog.showMessageBox(window!, {
          type: 'question',
          title: fr ? 'Mettre à jour Cyberfox' : 'Update Cyberfox',
          message: fr
            ? 'Ouvrir l’installateur et fermer Cyberfox ?'
            : 'Open the installer and close Cyberfox?',
          detail: fr
            ? 'Sur macOS, glissez Cyberfox dans Applications et remplacez la version existante. Vos projets et paramètres sont conservés.'
            : 'On macOS, drag Cyberfox into Applications and replace the existing version. Your projects and settings are preserved.',
          buttons: fr
            ? ['Ouvrir et fermer Cyberfox', 'Plus tard']
            : ['Open and close Cyberfox', 'Later'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });
        if (result.response !== 0) return;
        const error = await shell.openPath(file);
        if (error) throw new Error(error);
        app.quit();
      },
    });
    register('update:status', z.undefined(), () => updater.state);
    register('update:check', z.undefined(), () => updater.check());
    register('update:download', z.undefined(), () => updater.download());
    register('update:install', z.undefined(), () => updater.install());
    register('update:release', z.undefined(), () =>
      shell.openExternal(
        updater.state.url ?? 'https://github.com/pickywawa/cyberfox/releases/latest',
      ),
    );
    await createWindow();
    if (store.state.settings.devicesDetached) await createWindow(true);
    const checkAutomatically = () =>
      updater
        .check()
        .then((status) => {
          if (
            status.state === 'available' &&
            status.compatible &&
            store.state.settings.autoDownloadUpdates
          )
            return updater.download();
        })
        .catch(() => {});
    if (app.isPackaged && store.state.settings.checkUpdatesOnStart) void checkAutomatically();
    const updateTimer = setInterval(
      () => {
        if (app.isPackaged && store.state.settings.checkUpdatesOnStart) void checkAutomatically();
      },
      4 * 60 * 60 * 1000,
    );
    updateTimer.unref();
    app.on('activate', () => {
      if (!window) void createWindow();
    });
  })
  .catch((e) => {
    dialog.showErrorBox('Cyberfox', String(e));
    app.quit();
  });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (e) => {
  if (!quitting) {
    e.preventDefault();
    quitting = true;
    runner?.cancel();
    void Promise.allSettled([ai?.stop(), automation?.stop()]).finally(() => app.quit());
  }
});
