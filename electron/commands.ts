import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// Finder-launched apps do not inherit interactive shell PATH.
const extra = [
  path.join(os.homedir(), 'Library/Android/sdk/platform-tools'),
  path.join(os.homedir(), 'Android/Sdk/platform-tools'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
];
let javaHome = process.env.JAVA_HOME;
try {
  if (!javaHome && process.platform === 'darwin')
    javaHome = execFileSync('/usr/libexec/java_home', { encoding: 'utf8' }).trim();
} catch {}
export const commandEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME:
    process.env.ANDROID_HOME ??
    path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk'),
  PATH: [process.env.PATH, ...extra].filter(Boolean).join(path.delimiter),
};
export function command(
  file: string,
  args: string[],
  options: { timeout?: number; binary?: boolean } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    execFile(
      file,
      args,
      {
        env: commandEnv,
        timeout: options.timeout ?? 15000,
        maxBuffer: 24 * 1024 * 1024,
        encoding: 'buffer',
        windowsHide: true,
      },
      (error, stdout, stderr) =>
        error
          ? reject(new Error(`${file}: ${stderr.toString().trim() || error.message}`))
          : resolve(stdout),
    ),
  );
}
export function sdkCodexBinary(): string {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const packageName = `@openai/codex-${process.platform}-${process.arch}`;
  const triple =
    process.platform === 'darwin'
      ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`
      : process.platform === 'win32'
        ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc`
        : `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-unknown-linux-musl`;
  const base = path.resolve(import.meta.dirname, '../../node_modules');
  const candidates = [
    path.join(base, packageName, 'vendor', triple, 'bin', `codex${suffix}`),
    path.join(base, '@openai/codex/vendor', triple, 'codex', `codex${suffix}`),
  ];
  return (
    candidates.find(existsSync)?.replace('app.asar/', 'app.asar.unpacked/') ?? `codex${suffix}`
  );
}
export function copilotBinary(): string {
  const platform =
    process.platform === 'linux' &&
    process.report?.getReport &&
    !(process.report.getReport() as any).header.glibcVersionRuntime
      ? 'linuxmusl'
      : process.platform;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const candidate = path
    .resolve(
      import.meta.dirname,
      `../../node_modules/@github/copilot-${platform}-${process.arch}/copilot${suffix}`,
    )
    .replace('app.asar/', 'app.asar.unpacked/');
  return existsSync(candidate) ? candidate : `copilot${suffix}`;
}
