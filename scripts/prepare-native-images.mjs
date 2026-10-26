import { access, cp, readdir } from 'node:fs/promises';
import path from 'node:path';

// electron-builder may place sharp's native addon in a nested @img scope while
// hoisting libvips. The addon uses relative dyld/rpath paths, so both packages
// must be siblings on disk before signing. Keep the original package intact.
export default async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources');
  const modules = path.join(resources, 'app.asar.unpacked', 'node_modules');
  const exists = (file) =>
    access(file).then(
      () => true,
      () => false,
    );
  let restored = 0;
  async function visit(folder) {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const location = path.join(folder, entry.name);
      if (entry.name === '@img') {
        const packages = await readdir(location);
        for (const name of packages.filter(
          (name) => name.startsWith('sharp-') && !name.startsWith('sharp-libvips-'),
        )) {
          const library = name.replace('sharp-', 'sharp-libvips-');
          const target = path.join(location, library);
          const source = path.join(context.packager.projectDir, 'node_modules', '@img', library);
          if (!(await exists(target)) && (await exists(source))) {
            await cp(source, target, { recursive: true });
            restored++;
          }
        }
      }
      if (entry.name.startsWith('@')) {
        for (const name of await readdir(location))
          await visit(path.join(location, name, 'node_modules'));
      } else await visit(path.join(location, 'node_modules'));
    }
  }
  await visit(modules);
  console.log(
    `Verified native image package layout; restored ${restored} sibling libvips package(s) before signing`,
  );
}
