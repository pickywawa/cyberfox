import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { command } from './commands.js';
import type { Device, DeviceScan } from '../shared/model.js';
export function parseAdb(text: string): Device[] {
  return text
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const [id, status, ...rest] = line.trim().split(/\s+/);
      if (!id || !['device', 'unauthorized', 'offline'].includes(status)) return [];
      const model = rest
        .find((s) => s.startsWith('model:'))
        ?.slice(6)
        .replaceAll('_', ' ');
      return [
        {
          id: `android:${id}`,
          name: model ?? id,
          platform: 'android' as const,
          kind: id.startsWith('emulator-')
            ? ('simulator' as const)
            : rest.some((s) => s.startsWith('usb:')) ||
                (!id.includes(':') && !id.startsWith('adb-'))
              ? ('usb' as const)
              : ('network' as const),
          status: status === 'device' ? ('ready' as const) : (status as 'unauthorized' | 'offline'),
          detail: status === 'unauthorized' ? 'Autoriser le débogage USB sur le téléphone' : id,
        },
      ];
    });
}
export class Devices {
  known = new Map<string, Device>();
  constructor(
    private wdaConfig: () => { url: string; udid: string; mode?: string; platformVersion?: string },
  ) {}
  async scan(): Promise<DeviceScan> {
    const devices: Device[] = [];
    const diagnostics: string[] = [];
    const tasks = [
      (async () => {
        try {
          devices.push(...parseAdb((await command('adb', ['devices', '-l'])).toString()));
        } catch {
          diagnostics.push(
            'ADB indisponible : installer Android Platform Tools et activer le débogage USB.',
          );
        }
      })(),
    ];
    if (process.platform === 'darwin')
      tasks.push(
        (async () => {
          try {
            const data = JSON.parse(
              (await command('xcrun', ['simctl', 'list', 'devices', '--json'])).toString(),
            );
            for (const list of Object.values(data.devices) as any[][])
              for (const d of list)
                if (d.isAvailable)
                  devices.push({
                    id: `sim:${d.udid}`,
                    name: d.name,
                    platform: 'ios',
                    kind: 'simulator',
                    status: d.state === 'Booted' ? 'ready' : 'offline',
                    detail:
                      d.state === 'Booted'
                        ? 'Simulator · démarré'
                        : 'Démarrer ce simulateur dans Xcode',
                  });
          } catch {
            diagnostics.push('Simulateurs iOS indisponibles : installer Xcode et ses runtimes.');
          }
        })(),
        (async () => {
          const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberfox-devices-'));
          try {
            const file = path.join(temp, 'devices.json');
            await command('xcrun', ['devicectl', 'list', 'devices', '--json-output', file]);
            const data = JSON.parse(await fs.readFile(file, 'utf8'));
            for (const d of data.result?.devices ?? []) {
              if (d.hardwareProperties?.reality !== 'physical') continue;
              const udid = d.hardwareProperties.udid;
              if (!udid) continue;
              if (d.deviceProperties?.developerModeStatus !== 'enabled')
                diagnostics.push(
                  `${d.deviceProperties.name} : activer le mode développeur sur l’iPhone.`,
                );
              if (d.deviceProperties?.ddiServicesAvailable === false)
                diagnostics.push(
                  `${d.deviceProperties.name} : services développeur iOS (DDI) indisponibles. Ouvrir Xcode → Window → Devices and Simulators et terminer la préparation de l’iPhone.`,
                );
              devices.push({
                id: 'ios:' + udid,
                name: d.deviceProperties.name,
                osVersion: d.deviceProperties.osVersionNumber,
                developerMode: d.deviceProperties.developerModeStatus,
                ddiReady: d.deviceProperties.ddiServicesAvailable,
                platform: 'ios',
                kind: d.connectionProperties?.transportType === 'wired' ? 'usb' : 'network',
                status:
                  d.connectionProperties?.pairingState === 'paired' &&
                  d.deviceProperties?.bootState === 'booted'
                    ? 'ready'
                    : 'offline',
                detail: udid + ' · ' + d.connectionProperties?.transportType,
              });
            }
          } catch {
            diagnostics.push('iPhone USB : vérifier Xcode, la confiance et le mode développeur.');
          } finally {
            await fs.rm(temp, { recursive: true, force: true });
          }
        })(),
      );
    await Promise.all(tasks);
    const config = this.wdaConfig();
    if (process.platform !== 'darwin' && config.udid && config.mode && config.mode !== 'build') {
      devices.push({
        id: 'ios:' + config.udid,
        name: 'iPhone · ' + config.udid,
        platform: 'ios',
        kind: 'manual',
        status: 'ready',
        osVersion: config.platformVersion,
        detail: 'Configuration manuelle · connexion à vérifier',
      });
    }
    this.known = new Map(devices.map((d) => [d.id, d]));
    return { devices, diagnostics };
  }
  automationScreenshot?: (id: string) => Promise<string | undefined>;
  async screenshot(id: string): Promise<string> {
    const d = this.known.get(id);
    if (!d || d.status !== 'ready') throw new Error('Appareil non connecté');
    const automated = await this.automationScreenshot?.(id);
    if (automated) return automated;
    let buffer: Buffer;
    if (d.platform === 'android')
      buffer = await command('adb', ['-s', id.slice(8), 'exec-out', 'screencap', '-p'], {
        timeout: 10000,
      });
    else if (id.startsWith('sim:'))
      buffer = await command(
        'xcrun',
        ['simctl', 'io', id.slice(4), 'screenshot', '--type=png', '-'],
        { timeout: 10000 },
      );
    else {
      // WDA does not report its physical UDID; require explicit user association to this tunnel.
      const config = this.wdaConfig();
      if (config.udid !== id.slice(4))
        throw new Error(
          'Le miroir iOS nécessite WebDriverAgent. Attendez la connexion automatique ou utilisez Reconnecter. Si elle échoue, vérifiez Xcode et la signature WebDriverAgent dans Cyberfox → Paramètres → Appareils. Un tunnel manuel doit être associé au bon UDID.',
        );
      const base = config.url.replace(/\/$/, '');
      const status = (await fetch(`${base}/status`, { signal: AbortSignal.timeout(5000) }).then(
        (r) => r.json(),
      )) as any;
      if (!status.value?.ready)
        throw new Error(
          'WebDriverAgent n’est pas prêt. Vérifier le tunnel et le lancement sur cet iPhone.',
        );
      const response = await fetch(`${base}/screenshot`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`WebDriverAgent HTTP ${response.status}`);
      const data = (await response.json()) as { value: string };
      buffer = Buffer.from(data.value, 'base64');
    }
    if (
      buffer.length > 20 * 1024 * 1024 ||
      buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      throw new Error('Capture PNG invalide');
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
}
