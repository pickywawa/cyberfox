import { IOS_ANONYMOUS_INPUT_SELECTOR } from '../shared/ios-input.js';
export { IOS_ANONYMOUS_INPUT_SELECTOR } from '../shared/ios-input.js';
import { androidApplicationInfo } from './application-info.js';
import { resolveVariant } from '../shared/variables.js';
import { DOMParser } from '@xmldom/xmldom';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { iosCapabilities } from './ios-config.js';
import { prepareAppiumRuntime, prepareWdaRuntime } from './appium-runtime.js';
import { commandEnv, command } from './commands.js';
import { createHash } from 'node:crypto';
import type {
  Device,
  Screen,
  Component,
  Locator,
  Variant,
  ScenarioNode,
  Settings,
  LiveEvent,
} from '../shared/model.js';
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
export function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value
    .split("'")
    .map((s) => `'${s}'`)
    .join(',"\'",')})`;
}
export function parseScreen(xml: string, deviceId: string): Screen {
  const components: Component[] = [];
  const os = deviceId.startsWith('android:') ? 'android' : 'ios';
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const iosNames = new Map<string, number>();
  if (os === 'ios') {
    const elements = doc.getElementsByTagName('*');
    for (let index = 0; index < elements.length; index++) {
      const name = elements[index].getAttribute('name');
      if (name) iosNames.set(name, (iosNames.get(name) ?? 0) + 1);
    }
  }
  let width = 0,
    height = 0;
  const walk = (el: Element) => {
    const a = (key: string) => el.getAttribute(key) ?? '';
    const type = a('type') || a('class') || el.tagName;
    const text = a('text') || a('label') || a('value');
    const label = a('content-desc') || a('name') || a('label') || text;
    let rect = {
      x: Number(a('x')),
      y: Number(a('y')),
      width: Number(a('width')),
      height: Number(a('height')),
    };
    const bounds = a('bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (bounds)
      rect = {
        x: +bounds[1],
        y: +bounds[2],
        width: +bounds[3] - +bounds[1],
        height: +bounds[4] - +bounds[2],
      };
    width = Math.max(width, rect.x + rect.width);
    height = Math.max(height, rect.y + rect.height);
    let locator: Locator | undefined;
    if (os === 'android' && a('resource-id')) locator = { using: 'id', value: a('resource-id') };
    else if (os === 'android' && a('content-desc'))
      locator = { using: 'accessibility id', value: a('content-desc') };
    else if (
      os === 'ios' &&
      /^XCUIElementType(TextField|SecureTextField)$/.test(type) &&
      ((!label && !text) || /^[|\u200b\u200c\u200d]+$/.test(a('name')))
    )
      // Flutter can expose its caret as the name and replace TextField with
      // SecureTextField on focus. Neither the caret nor that transient role is an ID.
      locator = { using: 'xpath', value: IOS_ANONYMOUS_INPUT_SELECTOR };
    else if (os === 'ios' && a('name'))
      locator =
        (iosNames.get(a('name')) ?? 0) > 1 && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(type)
          ? { using: 'xpath', value: `//${type}[@name=${xpathLiteral(a('name'))}]` }
          : { using: 'accessibility id', value: a('name') };
    else if (text && type)
      locator = {
        using: 'xpath',
        value:
          os === 'android'
            ? `//*[@class=${xpathLiteral(type)} and @text=${xpathLiteral(text)}]`
            : `//${type}[@label=${xpathLiteral(text)} or @value=${xpathLiteral(text)}]`,
      };
    // Empty iOS inputs (including Flutter PIN fields) may have no accessible
    // name, label or value. Keep their observed native role available; the
    // executor still requires exactly one match before interacting.
    else if (
      os === 'ios' &&
      /^XCUIElementType(TextField|SecureTextField|TextView|SearchField)$/.test(type)
    )
      locator = { using: 'xpath', value: `//${type}` };
    if (
      locator &&
      rect.width > 0 &&
      rect.height > 0 &&
      a('visible') !== 'false' &&
      a('displayed') !== 'false'
    )
      components.push({
        id: createHash('sha256').update(JSON.stringify(locator)).digest('hex').slice(0, 20),
        type,
        label: a('password') === 'true' || type.includes('SecureText') ? '[secure field]' : label,
        text: a('password') === 'true' || type.includes('SecureText') ? '[secure]' : text,
        locator,
        rect,
        enabled: a('enabled') !== 'false',
        password: a('password') === 'true' || type.includes('SecureText'),
      });
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === 1) walk(child as unknown as Element);
    }
  };
  if (doc.documentElement) walk(doc.documentElement as unknown as Element);
  return { deviceId, components, width, height, capturedAt: new Date().toISOString() };
}
export class Automation {
  private sessions = new Map<string, string>();
  private connecting = new Map<string, Promise<string>>();
  private server?: ChildProcess;
  private starting?: Promise<void>;
  private failures = new Map<string, string>();
  private xcodeLog = '';
  private logBuffer = '';
  private stopping = false;
  private keepAwakeTimer: ReturnType<typeof setInterval>;
  private keepAwakeRunning = false;
  private queued = new Map<string, number>();
  private keepAwakeStates = new Map<
    string,
    {
      state: 'waiting' | 'active' | 'paused' | 'locked' | 'error';
      detail?: string;
      lastActivity?: string;
    }
  >();
  async keepAwakeTick() {
    if (this.keepAwakeRunning || this.stopping) return;
    if (!this.settings().iosKeepAwake) {
      this.keepAwakeStates.clear();
      return;
    }
    this.keepAwakeRunning = true;
    const selected = new Set(this.selectedDevices?.() ?? []);
    try {
      for (const [id, session] of this.sessions) {
        const device = this.device(id);
        if (
          !selected.has(id) ||
          device?.platform !== 'ios' ||
          device.kind === 'simulator' ||
          device.status !== 'ready'
        )
          continue;
        const previous = this.keepAwakeStates.get(id);
        const paused = () => !!this.leases.get(id) && !this.leases.get(id)!.startsWith('ai:');
        if ((this.queued.get(id) ?? 0) > 0 || paused()) {
          this.keepAwakeStates.set(id, { ...previous, state: 'paused' });
          continue;
        }
        try {
          await this.serial(id, async () => {
            if (
              this.stopping ||
              !this.settings().iosKeepAwake ||
              !this.selectedDevices?.().includes(id) ||
              paused() ||
              this.sessions.get(id) !== session
            )
              return;
            const execute = (script: string, args: unknown[] = []) =>
              this.request('/session/' + session + '/execute/sync', 'POST', { script, args }, 5000);
            const locked = await execute('mobile: isLocked');
            if (locked !== false) {
              this.keepAwakeStates.set(id, {
                ...previous,
                state: locked === true ? 'locked' : 'error',
                detail: locked === true ? undefined : 'État de verrouillage non reconnu.',
              });
              return;
            }
            if (
              this.stopping ||
              !this.settings().iosKeepAwake ||
              !this.selectedDevices?.().includes(id) ||
              paused()
            )
              return;
            await execute('mobile: pressButton', [{ name: 'volumeup' }]);
            await execute('mobile: pressButton', [{ name: 'volumedown' }]);
            this.keepAwakeStates.set(id, {
              state: 'active',
              lastActivity: new Date().toISOString(),
            });
          });
        } catch (error) {
          this.keepAwakeStates.set(id, {
            ...previous,
            state: 'error',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.keepAwakeRunning = false;
    }
  }

  connectionState(id: string) {
    return {
      connected: this.sessions.has(id),
      sessionId: this.sessions.get(id),
      connecting: this.connecting.has(id),
      starting: !!this.starting,
      failure: this.failures.get(id),
      keepAwake: this.keepAwakeStates.get(id),
    };
  }
  async openWdaProject(id: string) {
    if (process.platform !== 'darwin')
      throw new Error('Le projet WebDriverAgent doit être ouvert avec Xcode sur Mac.');
    const device = this.device(id);
    if (!device || device.platform !== 'ios')
      throw new Error('Sélectionnez un iPhone dans Cyberfox avant d’ouvrir son projet WDA.');
    const modules = path
      .resolve(import.meta.dirname, '../../node_modules')
      .replace('app.asar/', 'app.asar.unpacked/');
    return path.join(
      await prepareWdaRuntime(modules, this.runtimeHome, id),
      'WebDriverAgent.xcodeproj',
    );
  }
  private locks = new Map<string, Promise<unknown>>();
  private leases = new Map<string, string>();
  constructor(
    private device: (id: string) => Device | undefined,
    private settings: () => Settings,
    private emit: (event: LiveEvent) => void,
    private runtimeHome = path.join(os.tmpdir(), 'cyberfox-appium-' + process.pid),
    private selectedDevices?: () => string[],
  ) {
    this.keepAwakeTimer = setInterval(() => void this.keepAwakeTick(), 20000);
    this.keepAwakeTimer.unref();
  }
  acquire(ids: string[], owner: string) {
    for (const id of ids)
      if (this.leases.has(id))
        throw new Error('Appareil déjà utilisé par une exécution ou une exploration IA');
    for (const id of ids) this.leases.set(id, owner);
  }
  release(owner: string) {
    for (const [id, value] of this.leases) if (value === owner) this.leases.delete(id);
  }
  private check(id: string, owner?: string) {
    const held = this.leases.get(id);
    if (held && held !== owner)
      throw new Error('Appareil occupé par une exécution ou une exploration IA');
  }
  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    this.queued.set(id, (this.queued.get(id) ?? 0) + 1);
    const pending = (this.locks.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(fn)
      .finally(() => {
        const count = (this.queued.get(id) ?? 1) - 1;
        if (count) this.queued.set(id, count);
        else this.queued.delete(id);
        if (this.locks.get(id) === pending) this.locks.delete(id);
      });
    this.locks.set(id, pending);
    return pending;
  }
  private base() {
    return this.settings().appiumUrl.replace(/\/$/, '');
  }
  async request(
    route: string,
    method = 'GET',
    body?: unknown,
    timeout = 30000,
    signal?: AbortSignal,
  ): Promise<any> {
    const response = await fetch(this.base() + route, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    });
    const json = (await response.json()) as any;
    if (!response.ok || json.value?.error) {
      const error = new Error(json.value?.message ?? `Appium HTTP ${response.status}`);
      (error as any).code = json.value?.error;
      throw error;
    }
    return json.value;
  }
  private async ensureServer() {
    try {
      await this.request('/status', 'GET', undefined, 1500);
      return;
    } catch {}
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const url = new URL(this.base());
      const nodeModules = path
        .resolve(import.meta.dirname, '../../node_modules')
        .replace('app.asar/', 'app.asar.unpacked/');
      const home = await prepareAppiumRuntime(nodeModules, this.runtimeHome);
      const script = path
        .resolve(import.meta.dirname, '../../node_modules/appium/build/lib/main.js')
        .replace('app.asar/', 'app.asar.unpacked/');
      this.server = spawn(
        process.execPath,
        [
          script,
          '--address',
          url.hostname === 'localhost' ? '127.0.0.1' : url.hostname.replace(/[\[\]]/g, ''),
          '--port',
          url.port || '80',
          '--base-path',
          url.pathname,
          '--log-level',
          'info',
        ],
        {
          env: { ...commandEnv, APPIUM_HOME: home, ELECTRON_RUN_AS_NODE: '1' },
          cwd: home,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      let failure = '';
      const collect = (b: Buffer) => {
        const text = b.toString().replace(/\x1b\[[0-9;]*m/g, '');
        failure = (failure + text).slice(-4000);
        this.logBuffer += text;
        const lines = this.logBuffer.split('\n');
        this.logBuffer = lines.pop() ?? '';
        for (const line of lines)
          if (line.includes('[Xcode]')) this.xcodeLog = (this.xcodeLog + line + '\n').slice(-16000);
      };
      this.server.stdout?.on('data', collect);
      this.server.stderr?.on('data', collect);
      this.server.on('error', (e) => {
        failure = e.message;
      });
      for (let i = 0; i < 60; i++) {
        try {
          await this.request('/status', 'GET', undefined, 1000);
          return;
        } catch {}
        if (this.server.exitCode !== null) break;
        await delay(500);
      }
      throw new Error('Appium ne démarre pas : ' + failure);
    })().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  private async session(id: string) {
    if (this.stopping) throw new Error('Cyberfox est en cours de fermeture.');
    const current = this.sessions.get(id);
    if (current) return current;
    if (this.connecting.has(id)) return this.connecting.get(id)!;
    const pending = (async () => {
      const device = this.device(id);
      if (!device || device.status !== 'ready') throw new Error('Appareil non connecté');
      await this.ensureServer();
      const caps: Record<string, unknown> = {
        platformName: device.platform === 'android' ? 'Android' : 'iOS',
        'appium:automationName': device.platform === 'android' ? 'UiAutomator2' : 'XCUITest',
        'appium:udid': id.substring(id.indexOf(':') + 1),
        'appium:noReset': true,
        'appium:newCommandTimeout': 600,
        'appium:deviceName': device.name,
      };
      if (device.platform === 'android') {
        caps['appium:autoLaunch'] = false;
        caps['appium:systemPort'] =
          8200 +
          [...this.sessions.keys(), ...this.connecting.keys()]
            .filter((s) => s.startsWith('android:'))
            .indexOf(id);
      } else {
        this.xcodeLog = '';
        Object.assign(caps, iosCapabilities(this.settings(), device));
        if ((this.settings().iosWdaMode ?? 'build') === 'build') {
          const nodeModules = path
            .resolve(import.meta.dirname, '../../node_modules')
            .replace('app.asar/', 'app.asar.unpacked/');
          const bootstrap = await prepareWdaRuntime(nodeModules, this.runtimeHome, id);
          caps['appium:bootstrapPath'] = bootstrap;
          caps['appium:agentPath'] = path.join(bootstrap, 'WebDriverAgent.xcodeproj');
          caps['appium:derivedDataPath'] = path.join(bootstrap, 'DerivedData');
        }
        caps['appium:autoLaunch'] = false;
        caps['appium:wdaLocalPort'] =
          8101 +
          [...this.sessions.keys(), ...this.connecting.keys()]
            .filter((s) => !s.startsWith('android:'))
            .indexOf(id);
      }
      const value = await this.request(
        '/session',
        'POST',
        { capabilities: { alwaysMatch: caps, firstMatch: [{}] } },
        180000,
      );
      const sessionId = value.sessionId;
      if (!sessionId) throw new Error('Appium : session sans identifiant');
      this.failures.delete(id);
      this.sessions.set(id, sessionId);
      return sessionId;
    })()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const detail =
          message +
          (!id.startsWith('android:') && this.xcodeLog ? '\n\nXcode :\n' + this.xcodeLog : '');
        this.failures.set(id, detail);
        if (!id.startsWith('android:')) {
          const reasons = this.xcodeLog
            .split('\n')
            .filter((line) =>
              /error:|No profiles|No Accounts|requires a development team|signing certificate|provisioning profile/i.test(
                line,
              ),
            )
            .slice(-5)
            .join('\n');
          throw new Error(
            `Connexion iOS impossible. Ouvrez Cyberfox → Paramètres → Appareils pour configurer WebDriverAgent. Le menu d’état de l’iPhone contient le diagnostic Xcode.\n${message}${reasons ? '\n' + reasons : ''}`,
          );
        }
        throw error;
      })
      .finally(() => this.connecting.delete(id));
    this.connecting.set(id, pending);
    return pending;
  }
  async applications(
    id: string,
    mode: 'current' | 'list',
  ): Promise<{ id: string; name: string }[]> {
    this.check(id);
    return this.serial(id, async () => {
      const device = this.device(id);
      if (!device || device.status !== 'ready') throw new Error('Appareil non connecté.');
      if (mode === 'current') {
        const session = await this.session(id);
        const app =
          device.platform === 'android'
            ? { bundleId: await this.request(`/session/${session}/appium/device/current_package`) }
            : await this.request(`/session/${session}/execute/sync`, 'POST', {
                script: 'mobile: activeAppInfo',
                args: [],
              });
        if (
          !app?.bundleId ||
          ['com.apple.springboard', 'com.android.systemui'].includes(app.bundleId)
        )
          throw new Error(
            'Aucune application détectée au premier plan. Ouvrez votre application puis réessayez.',
          );
        return [{ id: app.bundleId, name: app.name || app.bundleId }];
      }
      if (device.platform === 'android') {
        const output = (
          await command('adb', [
            '-s',
            id.replace(/^android:/, ''),
            'shell',
            'pm',
            'list',
            'packages',
          ])
        ).toString();
        return [
          ...new Set(
            output
              .split(/\r?\n/)
              .filter((line) => line.startsWith('package:'))
              .map((line) => line.slice(8).trim())
              .filter(Boolean),
          ),
        ]
          .sort()
          .map((id) => ({ id, name: id }));
      }
      let apps;
      if (id.startsWith('sim:')) {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberfox-apps-'));
        try {
          const file = path.join(directory, 'apps.plist');
          await fs.writeFile(file, await command('xcrun', ['simctl', 'listapps', id.slice(4)]));
          apps = JSON.parse(
            (await command('plutil', ['-convert', 'json', '-o', '-', file])).toString(),
          );
        } finally {
          await fs.rm(directory, { recursive: true, force: true });
        }
      } else {
        const session = await this.session(id);
        apps = {};
        for (const applicationType of ['User', 'System']) {
          Object.assign(
            apps,
            await this.request(`/session/${session}/execute/sync`, 'POST', {
              script: 'mobile: listApps',
              args: [
                {
                  applicationType,
                  returnAttributes: ['CFBundleIdentifier', 'CFBundleDisplayName', 'CFBundleName'],
                },
              ],
            }),
          );
        }
      }
      return Object.entries(apps ?? {})
        .map(([id, value]) => {
          const app = value as Record<string, string>;
          return { id, name: app.CFBundleDisplayName || app.CFBundleName || id };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  async applicationInfo(id: string, application: string) {
    this.check(id);
    return this.serial(id, async () => {
      const device = this.device(id);
      if (!device || device.status !== 'ready') throw new Error('Appareil non connecté.');
      if (device.platform === 'android')
        return androidApplicationInfo(id.replace(/^android:/, ''), application);
      const session = await this.session(id);
      const apps = await this.request(`/session/${session}/execute/sync`, 'POST', {
        script: 'mobile: listApps',
        args: [{ returnAttributes: ['CFBundleIdentifier', 'CFBundleDisplayName', 'CFBundleName'] }],
      });
      const app = apps?.[application];
      if (!app) throw new Error('Application introuvable ; saisissez son nom manuellement.');
      return {
        id: application,
        name: String(app.CFBundleDisplayName || app.CFBundleName || application),
      };
    });
  }
  async ensureApplication(
    id: string,
    application: string,
    owner?: string,
    restart = false,
    signal?: AbortSignal,
  ) {
    this.check(id, owner);
    return this.serial(id, async () => {
      signal?.throwIfAborted();
      const session = await this.session(id);
      const route = `/session/${session}/execute/sync`;
      const args = [
        this.device(id)?.platform === 'ios' ? { bundleId: application } : { appId: application },
      ];
      if (restart)
        await this.request(route, 'POST', { script: 'mobile: terminateApp', args }, 30000, signal);
      const state = await this.request(
        route,
        'POST',
        { script: 'mobile: queryAppState', args },
        30000,
        signal,
      );
      if (state !== 4)
        await this.request(route, 'POST', { script: 'mobile: activateApp', args }, 30000, signal);
    });
  }
  async inspect(id: string, owner?: string): Promise<Screen> {
    this.check(id, owner);
    return this.serial(id, async () => {
      const session = await this.session(id);
      try {
        const screen = parseScreen(await this.request(`/session/${session}/source`), id);
        this.emit({ type: 'device', deviceId: id, ready: true });
        return screen;
      } catch (e) {
        if ((e as any).code === 'invalid session id') this.sessions.delete(id);
        throw e;
      }
    });
  }
  async screenshot(id: string): Promise<string | undefined> {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    return `data:image/png;base64,${await this.request(`/session/${s}/screenshot`)}`;
  }
  async perform(
    id: string,
    variant: Variant,
    kind: ScenarioNode['kind'],
    owner?: string,
    signal?: AbortSignal,
    variables: Record<string, string> = {},
  ) {
    variant = resolveVariant(variant, variables, process.env);
    this.check(id, owner);
    return this.serial(id, async () => {
      signal?.throwIfAborted();
      const session = await this.session(id);
      signal?.throwIfAborted();
      const execute = (route: string, method = 'GET', body?: unknown) =>
        this.request(route, method, body, 30000, signal);
      const route = `/session/${session}`;
      if (variant.operation === 'back' && kind !== 'test') {
        await execute(route + '/back', 'POST', {});
        return;
      }
      if (!variant.locator)
        throw new Error(
          'Aucun composant associé à cet élément pour cet OS. Explorez l’écran et choisissez un composant.',
        );
      const deadline = Date.now() + variant.timeoutMs;
      let matches: any[] = [];
      let failure = 'Composant introuvable';
      let pointed = false;
      const point = async (matches: any[]) => {
        if (pointed || !matches.length) return;
        const eid = matches[0][ELEMENT] ?? matches[0].ELEMENT;
        const rect = await execute(route + '/element/' + encodeURIComponent(eid) + '/rect');
        const screen = parseScreen(await execute(route + '/source'), id);
        this.emit({
          type: 'pointer',
          deviceId: id,
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          width: screen.width,
          height: screen.height,
        });
        pointed = true;
      };
      do {
        signal?.throwIfAborted();
        matches = await execute(route + '/elements', 'POST', variant.locator);
        if (matches.length > 1) throw new Error(`Sélecteur ambigu : ${matches.length} composants`);
        if (matches.length === 1) await point(matches);
        if (kind !== 'test') {
          if (matches.length) break;
        } else if (variant.assertion === 'absent') {
          if (!matches.length) return;
          failure = 'Le composant devrait être absent';
        } else if (matches.length) {
          const eid = matches[0][ELEMENT] ?? matches[0].ELEMENT;
          const at = route + '/element/' + encodeURIComponent(eid);
          try {
            const visible = await execute(at + '/displayed');
            if (!visible) failure = 'Composant non visible';
            else if (variant.assertion === 'enabled' && !(await execute(at + '/enabled')))
              failure = 'Composant désactivé';
            else if (variant.assertion === 'text') {
              const text = await execute(at + '/text');
              if (text === variant.expected) break;
              failure = `Texte attendu « ${variant.expected} », obtenu « ${text} »`;
            } else break;
          } catch (error) {
            if ((error as any).code !== 'stale element reference') throw error;
            failure = 'Composant remplacé pendant l’attente';
          }
        }
        if (Date.now() >= deadline) throw new Error(failure);
        await delay(250, undefined, { signal });
      } while (true);
      const element = matches[0][ELEMENT] ?? matches[0].ELEMENT;
      let target = route + `/element/${encodeURIComponent(element)}`;
      if (kind === 'test') {
        return;
      } else if (variant.operation === 'type') {
        const value = variant.value;
        const refreshTarget = async () => {
          while (true) {
            const found = await execute(route + '/elements', 'POST', variant.locator);
            if (found.length > 1) throw new Error(`Sélecteur ambigu : ${found.length} composants`);
            if (found.length === 1) {
              target =
                route + '/element/' + encodeURIComponent(found[0][ELEMENT] ?? found[0].ELEMENT);
              return;
            }
            if (Date.now() >= deadline)
              throw new Error('Champ de saisie introuvable après activation');
            await delay(100, undefined, { signal });
          }
        };
        const ios = this.device(id)?.platform === 'ios';
        const prepareInput = async (operation: 'click' | 'clear') => {
          for (let attempt = 0; ; attempt++) {
            try {
              await execute(target + '/' + operation, 'POST', {});
              return;
            } catch (error) {
              if (!ios || (error as any).code !== 'stale element reference' || attempt >= 2)
                throw error;
              await refreshTarget();
            }
          }
        };
        // Clearing an empty Flutter input may return without focusing it. Focus
        // explicitly so TextField -> SecureTextField happens BEFORE sending text.
        if (ios) {
          await prepareInput('click');
          await refreshTarget();
        }
        await prepareInput('clear');
        if (ios) await refreshTarget();
        // Never retry value: an error after submission cannot prove no text was sent.
        await execute(target + '/value', 'POST', { text: value });
      } else if (variant.operation === 'clear') await execute(target + '/clear', 'POST', {});
      else await execute(target + '/click', 'POST', {});
    });
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.keepAwakeTimer);
    await Promise.race([Promise.allSettled([...this.locks.values()]), delay(500)]);
    await Promise.allSettled(
      [...this.sessions.values()].map((s) =>
        this.request(`/session/${s}`, 'DELETE', undefined, 1500),
      ),
    );
    this.sessions.clear();
    this.server?.kill();
  }
}
