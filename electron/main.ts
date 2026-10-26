import { campaignExport } from '../shared/campaigns.js';
import { restoreWindowState, saveWindowState } from './window-state.js';
import { app, BrowserWindow, dialog, ipcMain, shell, session, screen, Menu } from 'electron';
import path from 'node:path';
import { z } from 'zod';
import { Store } from './store.js';
import { Devices } from './devices.js';
import { Ai } from './ai.js';
import { Automation } from './automation.js';
import { DeviceDiagnostics } from './device-health.js';
import { Updater } from './updater.js';
import { Runner } from './runner.js';
import {
  nodeSchema,
  variablesSchema,
  chatSessionSchema,
  applicationsSchema,
  applicationDetailsSchema,
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
const replaySelections = new Map<string, import('../shared/model.js').ReplayFrame | null>();
const replayVersions = new Map<string, number>();
let store: Store;
const allowed = new Set<BrowserWindow>();
const isDev = process.env.CYBERFOX_DEV === '1';
if (isDev) {
  // Let local development tools inspect the actual Electron renderer and its IPC bridge.
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', '0');
  process.on('SIGTERM', () => app.quit());
}
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(app.getAppPath(), 'build/icon.png');
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
function installMenu() {
  const fr = store.state.settings.language === 'fr';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      {
        label: fr ? 'Fichier' : 'File',
        submenu: [
          {
            id: 'new-project',
            label: fr ? 'Nouveau projet…' : 'New project…',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              if (window && !window.isDestroyed()) {
                window.show();
                window.focus();
                window.webContents.send('project:new');
              }
            },
          },
          {
            id: 'edit-project',
            label: fr ? 'Modifier le projet courant…' : 'Edit current project…',
            enabled: !!store.state.activeProjectId,
            click: () => {
              if (window && !window.isDestroyed()) {
                window.show();
                window.focus();
                window.webContents.send('project:edit');
              }
            },
          },
          { type: 'separator' as const },
          { role: 'quit' as const },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}
let detachedAi: BrowserWindow | undefined;
async function createWindow(devicesOnly = false, aiOnly = false) {
  const auxiliary = devicesOnly || aiOnly;
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const stateKey = devicesOnly ? 'devices' : aiOnly ? 'ai' : 'main';
  const defaults = {
    width: auxiliary ? 900 : 1510,
    height: 960,
    minWidth: auxiliary ? 360 : 1000,
    minHeight: 600,
  };
  const saved = restoreWindowState(
    stateFile,
    stateKey,
    screen.getAllDisplays().map((display) => display.workArea),
    defaults,
  );
  const win = new BrowserWindow({
    ...saved.bounds,
    minWidth: auxiliary ? 360 : 1000,
    minHeight: 600,
    title: devicesOnly ? 'Cyberfox · Appareils' : aiOnly ? 'Cyberfox · IA' : 'Cyberfox',
    icon: appIcon,
    backgroundColor: '#16171d',
    titleBarStyle: auxiliary ? 'default' : 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    if (win.isDestroyed()) return;
    try {
      saveWindowState(stateFile, stateKey, {
        bounds: win.getNormalBounds(),
        maximized: win.isMaximized(),
      });
    } catch (error) {
      console.warn('Window state could not be saved:', String(error));
    }
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('maximize', scheduleSave);
  win.on('unmaximize', scheduleSave);
  win.on('close', (event) => {
    clearTimeout(saveTimer);
    persist();
    if (!auxiliary && !quitting) {
      event.preventDefault();
      app.quit();
    }
  });
  win.on('closed', () => clearTimeout(saveTimer));
  if (saved.maximized) win.maximize();
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
    } else if (aiOnly) {
      detachedAi = undefined;
      if (!quitting)
        void store
          .saveSettings({ ...store.state.settings, aiDetached: false })
          .then(() => emit({ type: 'workspace' }));
    } else window = undefined;
  });
  if (aiOnly) detachedAi = win;
  else if (devicesOnly) detached = win;
  else window = win;
  if (isDev)
    await win.loadURL(
      'http://127.0.0.1:5173' + (devicesOnly ? '?devices=1' : aiOnly ? '?ai=1' : ''),
    );
  else
    await win.loadFile(path.join(import.meta.dirname, '../../dist/index.html'), {
      query: devicesOnly ? { devices: '1' } : aiOnly ? { ai: '1' } : {},
    });
  return win;
}
app
  .whenReady()
  .then(async () => {
    if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
    store = new Store(app.getPath('userData'), app.getPath('documents'));
    await store.load();
    installMenu();
    const devices = new Devices(() => ({
      url: store.state.settings.wdaUrl,
      udid: store.state.settings.wdaDeviceId,
      mode: store.state.settings.iosWdaMode,
      platformVersion: store.state.settings.iosPlatformVersion,
    }));
    automation = new Automation(
      (id) => devices.known.get(id),
      () => store.state.settings,
      emit,
      path.join(app.getPath('userData'), 'appium'),
      () => {
        const project = store.state.projects.find((p) => p.id === store.state.activeProjectId);
        return project ? Object.values(project.deviceIds).filter((id): id is string => !!id) : [];
      },
    );
    devices.automationScreenshot = (id) => automation.screenshot(id);
    const diagnostics = new DeviceDiagnostics(automation, () => store.state.settings);
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
      installMenu();
      emit({ type: 'workspace' });
      return result;
    };
    register('workspace:load', z.undefined(), () => store.state);
    register('settings:save', settingsSchema, (s) =>
      mutation(
        store.saveSettings({
          ...s,
          devicesDetached: store.state.settings.devicesDetached,
          aiDetached: store.state.settings.aiDetached,
        }),
      ).then((result) => {
        installMenu();
        return result;
      }),
    );
    register('project:create', projectInput, (p) => mutation(store.create(p)));
    register(
      'project:application-info',
      z.object({
        projectId: z.string().optional(),
        deviceId: z.string().optional(),
        platform: z.enum(['android', 'ios']),
        application: z
          .string()
          .min(1)
          .max(255)
          .regex(/^[A-Za-z0-9_.-]+$/),
      }),
      async (input) => {
        const id =
          input.deviceId ??
          (input.projectId ? store.get(input.projectId).deviceIds[input.platform] : undefined);
        if (!id)
          throw new Error('Associez un appareil pour lire les informations de l’application.');
        if (devices.known.get(id)?.platform !== input.platform)
          throw new Error('Appareil incompatible avec cette plateforme.');
        return automation.applicationInfo(id, input.application);
      },
    );
    register(
      'project:applications',
      z.object({
        projectId: z.string().optional(),
        deviceId: z.string().optional(),
        platform: z.enum(['android', 'ios']),
        mode: z.enum(['current', 'list']),
      }),
      async (input) => {
        const id =
          input.deviceId ??
          (input.projectId ? store.get(input.projectId).deviceIds[input.platform] : undefined);
        if (!id)
          throw new Error('Associez un appareil à cette plateforme pour choisir une application.');
        if (devices.known.get(id)?.platform !== input.platform)
          throw new Error('Appareil incompatible avec cette plateforme.');
        return automation.applications(id, input.mode);
      },
    );
    register('project:select', z.string(), (id) => mutation(store.select(id)));
    register(
      'project:update',
      z.object({
        id: z.string(),
        name: projectInput.shape.name.optional(),
        platforms: projectInput.shape.platforms.optional(),
        activeCampaignId: z.string().uuid().nullable().optional(),
        applicationDetails: applicationDetailsSchema.optional(),
        applications: applicationsSchema.optional(),
        tab: z.enum(['creation', 'execution', 'variables']).optional(),
        variables: variablesSchema.optional(),
        chatSessions: z.array(chatSessionSchema).max(500).optional(),
        activeChatSessionId: z.string().nullable().optional(),
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
    register(
      'ai:answer',
      z.object({
        projectId: z.string(),
        questionId: z.string(),
        answer: z.string().trim().min(1).max(16000),
      }),
      (p) => ai.answer(p),
    );
    register('ai:status', provider, (p) => ai.status(p));
    register('ai:login', provider, (p) => ai.login(p));
    register('ai:logout', provider, (p) => ai.logout(p));
    register(
      'ai:ask',
      z.object({
        projectId: z.string(),
        prompt: z.string().trim().min(1).max(16000),
        sessionId: z.string().optional(),
        nodeId: z.string().optional(),
        deviceIds: z.array(z.string()).max(2),
      }),
      (p) => ai.ask(p),
    );
    register('ai:cancel', z.string(), (id) => ai.cancel(id));
    register('devices:scan', z.undefined(), () => devices.scan());
    register('devices:health', z.string(), (id) => diagnostics.health(devices.known.get(id), id));
    register('devices:open-wda', z.string(), async (id) => {
      const file = await automation.openWdaProject(id);
      const error = await shell.openPath(file);
      if (error) throw new Error(error);
    });
    register(
      'devices:documentation',
      z.enum(['provisioning', 'windows', 'tunnels', 'preinstalled']),
      (topic) =>
        shell.openExternal(
          {
            provisioning:
              'https://appium.github.io/appium-xcuitest-driver/latest/getting-started/provisioning-profile/',
            windows:
              'https://appium.github.io/appium-xcuitest-driver/latest/guides/non-macos-hosts/',
            tunnels:
              'https://appium.github.io/appium-xcuitest-driver/latest/guides/remotexpc-tunnels-real-devices/',
            preinstalled:
              'https://appium.github.io/appium-xcuitest-driver/latest/guides/run-preinstalled-wda/',
          }[topic],
        ),
    );
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
        projectId: z.string().optional(),
        variant: variantSchema,
        kind: z.enum(['scenario', 'action', 'navigation', 'test']),
      }),
      (p) =>
        automation.perform(
          p.deviceId,
          p.variant,
          p.kind,
          undefined,
          undefined,
          p.projectId ? store.get(p.projectId).variables : {},
        ),
    );
    register('campaign:list', z.string(), (id) => store.listCampaigns(id));
    register(
      'campaign:create',
      z.object({ projectId: z.string(), label: z.string().trim().min(1).max(180).optional() }),
      (input) => mutation(store.createCampaign(input)),
    );
    const campaignInput = z.object({ projectId: z.string(), campaignId: z.string().uuid() });
    register('campaign:load', campaignInput, (input) =>
      runner.loadCampaign(input.projectId, input.campaignId),
    );
    register(
      'campaign:update',
      campaignInput.extend({
        label: z.string().trim().min(1).max(180).optional(),
        status: z.enum(['open', 'completed']).optional(),
      }),
      (input) => {
        if (runner.isRunning() && input.status)
          throw new Error('Attendez la fin de l’exécution avant de terminer la campagne.');
        return mutation(store.updateCampaign(input));
      },
    );
    register(
      'campaign:clean',
      z.object({ projectId: z.string(), campaignId: z.string().uuid().optional() }),
      (input) => mutation(runner.cleanCampaigns(input.projectId, input.campaignId)),
    );
    register(
      'campaign:export',
      campaignInput.extend({
        format: z.enum(['text', 'csv', 'markdown', 'confluence']).optional(),
      }),
      async (input) =>
        campaignExport(await runner.loadCampaign(input.projectId, input.campaignId), input.format),
    );
    register(
      'run:screenshot',
      z.object({
        projectId: z.string(),
        campaignId: z.string().uuid().optional(),
        runId: z.string().uuid(),
        entryId: z.string().uuid(),
      }),
      (input) => store.reportScreenshot(input),
    );
    register('replay:current', z.string(), (id) => {
      store.get(id);
      return replaySelections.get(id) ?? null;
    });
    register(
      'replay:select',
      z.object({
        projectId: z.string(),
        frame: z
          .object({ runId: z.string().uuid(), entry: z.object({ id: z.string().uuid() }) })
          .nullable(),
      }),
      async (input) => {
        store.get(input.projectId);
        const version = (replayVersions.get(input.projectId) ?? 0) + 1;
        replayVersions.set(input.projectId, version);
        const frame = input.frame
          ? await runner.replayFrame(input.projectId, input.frame.runId, input.frame.entry.id)
          : null;
        if (replayVersions.get(input.projectId) !== version) return;
        replaySelections.set(input.projectId, frame);
        emit({ type: 'replay', projectId: input.projectId, frame });
      },
    );
    register(
      'run:start',
      z.object({
        resetCampaign: z.boolean().optional(),
        projectId: z.string(),
        campaignId: z.string().uuid().optional(),
        platform: z.enum(['android', 'ios']).optional(),
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
    register('ai:detach', z.boolean(), async (value) => {
      await store.saveSettings({ ...store.state.settings, aiDetached: value });
      if (value) {
        if (detachedAi) detachedAi.focus();
        else await createWindow(false, true);
      } else detachedAi?.close();
      emit({ type: 'workspace' });
    });
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
    if (store.state.settings.aiDetached) await createWindow(false, true);
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
      if (!window && !quitting) void createWindow();
    });
  })
  .catch((e) => {
    console.error('Cyberfox startup failed:', e);
    dialog.showErrorBox('Cyberfox', String(e));
    app.quit();
  });
app.on('window-all-closed', () => {
  app.quit();
});
app.on('before-quit', (e) => {
  if (!quitting) {
    e.preventDefault();
    quitting = true;
    runner?.cancel();
    const deadline = setTimeout(() => app.quit(), 5000);
    void Promise.allSettled([ai?.stop(), runner?.stop()]).finally(async () => {
      await automation?.stop();
      clearTimeout(deadline);
      app.quit();
    });
  }
});
