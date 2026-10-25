import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
async function main() {
  if (process.versions.electron) {
    const { app, session } = await import('electron');
    app.setPath('userData', path.join(process.env.CYBERFOX_PROXY_TEMP, 'config'));
    await app.whenReady();
    try {
      const { Updater } = await import('../dist-electron/electron/updater.js');
      const directory = path.join(process.env.CYBERFOX_PROXY_TEMP, 'downloads');
      const result = await (async () => {
        const { createServer } = await import('node:http');
        const { createHash } = await import('node:crypto');
        const data = Buffer.from('proxy transported installer');
        let requests = 0;
        const server = createServer((req, res) => {
          requests++;
          if (req.url.includes('/meta')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                tag_name: 'v0.3.0',
                assets: [
                  {
                    name: 'Cyberfox-0.3.0-mac-arm64.dmg',
                    size: data.length,
                    digest: 'sha256:' + createHash('sha256').update(data).digest('hex'),
                    browser_download_url:
                      'https://github.com/pickywawa/cyberfox/releases/download/v0.3.0/Cyberfox-0.3.0-mac-arm64.dmg',
                  },
                ],
              }),
            );
          } else res.end(data);
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const network = session.fromPartition('cyberfox-proxy-test');
        await network.setProxy({ mode: 'fixed_servers', proxyRules: 'http=127.0.0.1:' + port });
        try {
          const updater = new Updater({
            version: '0.2.0',
            platform: 'darwin',
            arch: 'arm64',
            directory: directory,
            fetch: (url, init) =>
              network.fetch(
                url.includes('api.github.com')
                  ? 'http://updates.invalid/meta'
                  : 'http://updates.invalid/asset',
                init,
              ),
            refreshProxy: () => network.forceReloadProxyConfig(),
            emit: () => {},
            open: async () => {},
          });
          await updater.check();
          await updater.download();
          return { state: updater.state.state, requests };
        } finally {
          await network.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      })();
      if (result.state !== 'ready' || result.requests !== 2)
        throw new Error(JSON.stringify(result));
      console.log('Chromium proxy metadata + verified download:', JSON.stringify(result));
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  } else {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'cyberfox-proxy-'));
    try {
      const { default: executable } = await import('electron');
      const { stdout } = await promisify(execFile)(
        executable,
        [path.resolve('tests/updater-proxy.mjs')],
        {
          env: { ...process.env, CYBERFOX_PROXY_TEMP: temp },
          timeout: 45000,
        },
      );
      console.log(stdout.trim());
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
