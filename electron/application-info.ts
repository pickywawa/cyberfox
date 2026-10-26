import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { command, commandEnv } from './commands.js';

export function parseApplicationBadging(text: string) {
  const name =
    text.match(/^application-label:'(.*)'$/m)?.[1] ??
    text.match(/^application: label='(.*?)'/m)?.[1];
  const icon = text.match(/^application: .*?icon='([^']+)'/m)?.[1];
  return { name, icon };
}

/** Reads installed APK metadata without launching or changing the application. */
export async function androidApplicationInfo(serial: string, application: string) {
  const sdk = commandEnv.ANDROID_HOME;
  const builds = await fs.readdir(path.join(sdk, 'build-tools')).catch(() => [] as string[]);
  const tools = builds.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  let aapt: string | undefined;
  for (const version of tools) {
    const candidate = path.join(
      sdk,
      'build-tools',
      version,
      process.platform === 'win32' ? 'aapt.exe' : 'aapt',
    );
    if (
      await fs.access(candidate).then(
        () => true,
        () => false,
      )
    ) {
      aapt = candidate;
      break;
    }
  }
  if (!aapt)
    throw new Error(
      'Android SDK build-tools (aapt) requis pour lire le nom et l’icône. Vous pouvez saisir le nom manuellement.',
    );
  const packages = (
    await command('adb', ['-s', serial, 'shell', 'pm', 'path', application])
  ).toString();
  const apk =
    packages
      .split(/\r?\n/)
      .find((line) => line.startsWith('package:') && line.endsWith('/base.apk'))
      ?.slice(8) ??
    packages
      .split(/\r?\n/)
      .find((line) => line.startsWith('package:'))
      ?.slice(8);
  if (!apk) throw new Error('Application non installée sur cet appareil.');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberfox-app-info-'));
  try {
    const local = path.join(temp, 'application.apk');
    await command('adb', ['-s', serial, 'pull', apk, local], { timeout: 60000 });
    const metadata = parseApplicationBadging(
      (await command(aapt, ['dump', 'badging', local])).toString(),
    );
    let icon: string | undefined;
    if (metadata.icon && !metadata.icon.startsWith('-') && !metadata.icon.includes('..')) {
      try {
        const bytes = await command('unzip', ['-p', local, metadata.icon]);
        const png = await sharp(bytes, { limitInputPixels: 16000000 })
          .resize(96, 96, { fit: 'inside' })
          .png()
          .toBuffer();
        icon = 'data:image/png;base64,' + png.toString('base64');
      } catch {
        /* Adaptive icons or unavailable unzip: keep the name without an invented icon. */
      }
    }
    return { id: application, name: metadata.name ?? application, ...(icon ? { icon } : {}) };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
