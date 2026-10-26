import { requiredOS, type Device, type OS, type Project } from './model.js';
export function selectUsbDevices(
  project: Project,
  devices: Device[],
  skip: ReadonlySet<OS> = new Set(),
) {
  const ids = { ...project.deviceIds };
  for (const os of requiredOS(project)) {
    const selected = devices.find(
      (d) => d.id === ids[os] && d.platform === os && d.status === 'ready',
    );
    if (selected || skip.has(os)) continue;
    const candidate = devices
      .filter((d) => d.platform === os && d.kind === 'usb' && d.status === 'ready')
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (candidate) ids[os] = candidate.id;
  }
  return ids;
}
