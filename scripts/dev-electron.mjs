import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import electron from 'electron';
import { outputFingerprint } from './dev-output.mjs';
let fingerprint = outputFingerprint('dist-electron');
let child,
  timer,
  restarting = false,
  stopping = false;
function terminate(target) {
  target.kill('SIGTERM');
  const force = setTimeout(() => {
    if (target.exitCode === null) target.kill('SIGKILL');
  }, 8000);
  target.once('exit', () => clearTimeout(force));
}
function start() {
  fingerprint = outputFingerprint('dist-electron');
  child = spawn(electron, ['.'], { env: { ...process.env, CYBERFOX_DEV: '1' }, stdio: 'inherit' });
  console.log(`[Cyberfox dev] Electron PID ${child.pid}`);
  child.once('exit', () => {
    child = undefined;
    if (restarting && !stopping) {
      restarting = false;
      start();
    } else if (!stopping) process.exit(0);
  });
}
const watcher = watch('dist-electron', { recursive: true }, (_, file) => {
  if (!file || !/\.(?:js|cjs)$/.test(file) || stopping) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    let next;
    try {
      next = outputFingerprint('dist-electron');
    } catch {
      return;
    } // A compilation may briefly replace a file.
    if (next === fingerprint) return;
    fingerprint = next;
    if (restarting) return;
    console.log('[Cyberfox dev] Backend changed; restarting Electron…');
    restarting = true;
    if (child) terminate(child);
    else {
      restarting = false;
      start();
    }
  }, 700);
});
function stop() {
  stopping = true;
  clearTimeout(timer);
  watcher.close();
  if (child) terminate(child);
  else process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start();
