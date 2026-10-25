import { DOMParser } from '@xmldom/xmldom';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
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
    else if (os === 'ios' && a('name')) locator = { using: 'accessibility id', value: a('name') };
    else if (text && type)
      locator = {
        using: 'xpath',
        value:
          os === 'android'
            ? `//*[@class=${xpathLiteral(type)} and @text=${xpathLiteral(text)}]`
            : `//${type}[@label=${xpathLiteral(text)} or @value=${xpathLiteral(text)}]`,
      };
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
  private locks = new Map<string, Promise<unknown>>();
  private leases = new Map<string, string>();
  constructor(
    private device: (id: string) => Device | undefined,
    private settings: () => Settings,
    private emit: (event: LiveEvent) => void,
  ) {}
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
    const pending = (this.locks.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
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
          'error',
        ],
        {
          env: { ...commandEnv, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      let failure = '';
      this.server.stdout?.on('data', (b) => {
        failure = (failure + b.toString()).slice(-2000);
      });
      this.server.stderr?.on('data', (b) => {
        failure = (failure + b.toString()).slice(-2000);
      });
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
        caps['appium:autoLaunch'] = false;
        caps['appium:wdaLocalPort'] =
          8101 +
          [...this.sessions.keys(), ...this.connecting.keys()]
            .filter((s) => !s.startsWith('android:'))
            .indexOf(id);
        if (this.settings().iosTeamId) {
          caps['appium:xcodeOrgId'] = this.settings().iosTeamId;
          caps['appium:xcodeSigningId'] = 'Apple Development';
          caps['appium:updatedWDABundleId'] = this.settings().iosWdaBundleId;
          caps['appium:allowProvisioningUpdates'] = true;
          caps['appium:allowProvisioningDeviceRegistration'] = true;
        }
      }
      const value = await this.request(
        '/session',
        'POST',
        { capabilities: { alwaysMatch: caps, firstMatch: [{}] } },
        180000,
      );
      const sessionId = value.sessionId;
      if (!sessionId) throw new Error('Appium : session sans identifiant');
      this.sessions.set(id, sessionId);
      return sessionId;
    })().finally(() => this.connecting.delete(id));
    this.connecting.set(id, pending);
    return pending;
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
  ) {
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
      const target = route + `/element/${encodeURIComponent(element)}`;
      if (kind === 'test') {
        return;
      } else if (variant.operation === 'type') {
        const value = variant.value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key) => {
          const secret = process.env['CYBERFOX_SECRET_' + key];
          if (secret === undefined)
            throw new Error('Variable secrète absente : CYBERFOX_SECRET_' + key);
          return secret;
        });
        await execute(target + '/clear', 'POST', {});
        await execute(target + '/value', 'POST', { text: value });
      } else if (variant.operation === 'clear') await execute(target + '/clear', 'POST', {});
      else await execute(target + '/click', 'POST', {});
    });
  }
  async stop() {
    await Promise.allSettled(
      [...this.sessions.values()].map((s) =>
        this.request(`/session/${s}`, 'DELETE', undefined, 5000),
      ),
    );
    this.sessions.clear();
    this.server?.kill();
  }
}
