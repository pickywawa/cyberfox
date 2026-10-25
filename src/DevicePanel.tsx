import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  ExternalLink,
  RefreshCw,
  Smartphone,
  Usb,
  LoaderCircle,
  MousePointer2,
  Link2,
  Play,
  ArrowLeftToLine,
} from 'lucide-react';
import { api } from './bridge';
import {
  requiredOS,
  type Component,
  type Device,
  type DeviceScan,
  type LiveEvent,
  type OS,
  type Project,
  type Screen,
} from '../shared/model';
import type { L } from './NodeEditor';
export function OSIcon({ os }: { os: OS }) {
  return os === 'android' ? (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="currentColor"
      className="os-android"
      aria-label="Android"
    >
      <path d="m7 4-2-3 .8-.5L8 3.5a11 11 0 0 1 8 0L18.2.5l.8.5-2 3a9 9 0 0 1 5 8H2a9 9 0 0 1 5-8M7 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2m10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2M3 13h18v6a2 2 0 0 1-2 2h-1v2h-3v-2H9v2H6v-2H5a2 2 0 0 1-2-2Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-label="iOS">
      <path d="M16 1c.3 2-1.4 4-3.4 4 .1-2 1.6-3.7 3.4-4M19.8 17.8C19 19.5 18 22 16 22c-1.2 0-1.8-.8-3.4-.8S10.3 22 9 22c-2 0-5-4.4-5-8.6 0-4.1 2.4-6.2 5-6.2 1.4 0 2.6.9 3.6.9s2.5-1 4.2-1c1.6 0 3 .8 3.8 2-3.5 2-3 6.6-.8 8.7" />
    </svg>
  );
}
function Picker({
  os,
  id,
  devices,
  onChange,
  onRefresh,
  scanning,
  L,
}: {
  os: OS;
  id: string;
  devices: Device[];
  onChange: (id: string) => void;
  onRefresh: () => void;
  scanning: boolean;
  L: L;
}) {
  const [open, setOpen] = useState(false);
  const [simulators, setSimulators] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const listener = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [open]);
  const d = devices.find((d) => d.id === id);
  const item = (device: Device) => (
    <button
      role="option"
      aria-selected={device.id === id}
      key={device.id}
      disabled={device.status !== 'ready'}
      onClick={() => {
        onChange(device.id);
        setOpen(false);
      }}
    >
      <OSIcon os={device.platform} />
      <span>
        <b>{device.name}</b>
        <small>{device.status === 'ready' ? device.detail : device.status}</small>
      </span>
      {device.id === id && <Check size={14} />}
    </button>
  );
  return (
    <div className="device-picker" ref={ref}>
      <button
        className="picker-trigger"
        aria-label={L('Appareil ', 'Device ') + (os === 'ios' ? 'iOS' : 'Android')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) onRefresh();
        }}
      >
        <OSIcon os={os} />
        <span>{d?.name ?? L('Choisir ', 'Select ') + (os === 'ios' ? 'iOS' : 'Android')}</span>
        {scanning ? <LoaderCircle size={13} className="spin" /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div role="listbox" className="device-menu">
          <button
            role="option"
            aria-selected={!id}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {L('Aucun appareil', 'No device')}
          </button>
          {devices.filter((d) => d.platform === os && d.kind === 'usb').map(item)}
          <button className="simulator-group" onClick={() => setSimulators(!simulators)}>
            {simulators ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{' '}
            {L('Simulateurs / émulateurs', 'Simulators / emulators')}
            <span className="badge">
              {devices.filter((d) => d.platform === os && d.kind === 'simulator').length}
            </span>
          </button>
          {simulators &&
            devices.filter((d) => d.platform === os && d.kind === 'simulator').map(item)}
          {!devices.some((d) => d.platform === os) && (
            <p>{L('Aucun appareil détecté', 'No devices found')}</p>
          )}
        </div>
      )}
    </div>
  );
}
export function DevicePanel({
  project,
  scan,
  scanning,
  onRefresh,
  onSelect,
  onReady,
  onBind,
  onPerform,
  detached,
  onDetach,
  L,
}: {
  project?: Project;
  scan: DeviceScan;
  scanning: boolean;
  onRefresh: () => void;
  onSelect: (os: OS, id: string) => void;
  onReady: (os: OS, ready: boolean) => void;
  onBind: (os: OS, component: Component) => void;
  onPerform: (os: OS) => void;
  detached: boolean;
  onDetach: () => void;
  L: L;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => setWide(entries[0].contentRect.width > 620));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const oses = project ? requiredOS(project) : (['android'] as OS[]);
  return (
    <aside className="devices-pane" ref={ref}>
      <div className="device-header">
        <span>
          <Smartphone size={16} />
          {L('Appareils', 'Devices')}
        </span>
        <div>
          <button
            className="icon-button"
            title={
              detached
                ? L('Réintégrer les appareils', 'Dock devices')
                : L('Externaliser les appareils', 'Detach devices')
            }
            aria-label={detached ? 'Réintégrer les appareils' : 'Externaliser les appareils'}
            onClick={onDetach}
          >
            {detached ? <ArrowLeftToLine size={16} /> : <ExternalLink size={16} />}
          </button>
          <button
            className="icon-button"
            aria-label={L('Actualiser les appareils', 'Refresh devices')}
            onClick={onRefresh}
          >
            <RefreshCw size={15} className={scanning ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="device-hint">
        <Usb size={14} />
        {L('Composants réels · aucune action à l’aveugle', 'Real components · no blind actions')}
      </div>
      <div className={'mobile-zones ' + (wide && oses.length === 2 ? 'side-by-side' : '')}>
        {oses.map((os) => (
          <Mobile
            key={os}
            os={os}
            id={project?.deviceIds[os] ?? ''}
            devices={scan.devices}
            scanning={scanning}
            onRefresh={onRefresh}
            onSelect={(id) => onSelect(os, id)}
            onReady={(ready) => onReady(os, ready)}
            onBind={(c) => onBind(os, c)}
            onPerform={() => onPerform(os)}
            canBind={!!project?.selectedNodeId}
            L={L}
          />
        ))}
      </div>
      <details className="device-diagnostics">
        <summary>{L('Diagnostics de connexion', 'Connection diagnostics')}</summary>
        {scan.diagnostics.map((d) => (
          <p key={d}>{d}</p>
        ))}
        <p>
          {L(
            'iOS physique : configurer le Team ID Apple et un profil WebDriverAgent dans les paramètres.',
            'Physical iOS: configure Apple Team ID and a WebDriverAgent provisioning profile in settings.',
          )}
        </p>
      </details>
    </aside>
  );
}
function Mobile({
  os,
  id,
  devices,
  scanning,
  onRefresh,
  onSelect,
  onReady,
  onBind,
  onPerform,
  canBind,
  L,
}: {
  os: OS;
  id: string;
  devices: Device[];
  scanning: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onReady: (value: boolean) => void;
  onBind: (c: Component) => void;
  onPerform: () => void;
  canBind: boolean;
  L: L;
}) {
  const [screen, setScreen] = useState<Screen>();
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [component, setComponent] = useState<Component>();
  const [pointer, setPointer] = useState<Extract<LiveEvent, { type: 'pointer' }>>();
  const [picking, setPicking] = useState(true);
  const img = useRef<HTMLImageElement>(null);
  const device = devices.find((d) => d.id === id);
  const alive = useRef(0);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'pointer' && event.deviceId === id) setPointer(event);
      }),
    [id],
  );
  useEffect(() => {
    if (pointer) {
      const t = setTimeout(() => setPointer(undefined), 1200);
      return () => clearTimeout(t);
    }
  }, [pointer]);
  async function inspect() {
    const generation = alive.current;
    setLoading(true);
    try {
      const s = await api.inspect(id);
      if (generation !== alive.current) return;
      setScreen(s);
      setError('');
      onReady(true);
    } catch (e) {
      if (generation !== alive.current) return;
      setError(String(e));
      if (!String(e).includes('occupé')) onReady(false);
    } finally {
      if (generation === alive.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current++;
    setScreen(undefined);
    setImage('');
    setError('');
    setComponent(undefined);
    onReady(false);
    if (id && device?.status === 'ready') void inspect();
  }, [id, device?.status]);
  useEffect(() => {
    if (!id || device?.status !== 'ready') return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const next = async () => {
      try {
        const image = await api.screenshot(id);
        if (!disposed) setImage(image);
      } catch (e) {
        if (!disposed && !loading) {
          setError((old) => old || String(e));
          onReady(false);
        }
      } finally {
        if (!disposed) timer = setTimeout(next, 1200);
      }
    };
    void next();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [id, device?.status, !!screen]);
  function pick(e: React.MouseEvent<HTMLImageElement>) {
    if (!screen || !img.current) return;
    const box = img.current.getBoundingClientRect();
    const ratio = Math.min(
      box.width / img.current.naturalWidth,
      box.height / img.current.naturalHeight,
    );
    const renderW = img.current.naturalWidth * ratio,
      renderH = img.current.naturalHeight * ratio;
    const x = ((e.clientX - box.left - (box.width - renderW) / 2) / renderW) * screen.width;
    const y = ((e.clientY - box.top - (box.height - renderH) / 2) / renderH) * screen.height;
    const found = screen.components
      .filter(
        (c) =>
          x >= c.rect.x &&
          x <= c.rect.x + c.rect.width &&
          y >= c.rect.y &&
          y <= c.rect.y + c.rect.height,
      )
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0];
    setComponent(found);
    if (!found) {
      setError(
        L(
          'Aucun composant identifiable ici. Explorez à nouveau l’écran.',
          'No identifiable component here. Inspect the screen again.',
        ),
      );
      return;
    }
    if (!picking) void activate(found);
  }
  async function activate(c: Component) {
    try {
      await api.perform({
        deviceId: id,
        variant: {
          locator: c.locator,
          operation: 'tap',
          value: '',
          assertion: 'visible',
          expected: '',
          timeoutMs: 10000,
        },
        kind: 'action',
      });
      await inspect();
    } catch (e) {
      setError(String(e));
    }
  }
  const pointerPosition = () => {
    const el = img.current;
    if (!pointer || !el || !el.naturalWidth) return {};
    const box = el.getBoundingClientRect();
    const scale = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight);
    const w = el.naturalWidth * scale,
      h = el.naturalHeight * scale;
    return {
      left: (box.width - w) / 2 + (pointer.x / pointer.width) * w + 'px',
      top: (box.height - h) / 2 + (pointer.y / pointer.height) * h + 'px',
    };
  };
  return (
    <section className="mobile-zone">
      <Picker
        os={os}
        id={id}
        devices={devices}
        onChange={onSelect}
        onRefresh={onRefresh}
        scanning={scanning}
        L={L}
      />
      {id ? (
        <>
          <div className="mobile-toolbar">
            <span className="badge">
              {loading
                ? L('Connexion…', 'Connecting…')
                : screen
                  ? `${screen.components.length} ${L('composants', 'components')}`
                  : L('Non exploré', 'Not inspected')}
            </span>
            <button
              className={'icon-button ' + (picking ? 'active' : '')}
              title={
                picking
                  ? L('Mode sélection : cliquer pour inspecter', 'Selection mode: click to inspect')
                  : L(
                      'Mode interaction : cliquer pour activer le composant',
                      'Interaction mode: click to activate component',
                    )
              }
              onClick={() => setPicking(!picking)}
            >
              <MousePointer2 size={14} />
            </button>
            <button
              className="icon-button"
              title={L('Explorer l’écran', 'Inspect screen')}
              onClick={() => void inspect()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
            <button
              className="icon-button"
              title={L('Jouer l’élément sélectionné', 'Play selected item')}
              disabled={!canBind || !screen}
              onClick={onPerform}
            >
              <Play size={14} />
            </button>
          </div>
          <div className="live-screen">
            <img
              ref={img}
              src={image || undefined}
              alt={L('Écran ', 'Screen ') + os}
              onClick={pick}
            />
            {pointer && <span className="red-pointer" style={pointerPosition()} />}
            {loading && (
              <div className="screen-loading">
                <LoaderCircle className="spin" />
                <span>
                  {L(
                    'Connexion et exploration des composants…',
                    'Connecting and inspecting components…',
                  )}
                </span>
              </div>
            )}
          </div>
          {error && (
            <div className="device-error" role="alert">
              {error}
            </div>
          )}
          <details className="components-list">
            <summary>
              {L('Explorer les composants', 'Browse components')} ({screen?.components.length ?? 0})
            </summary>
            {screen?.components.map((c) => (
              <button
                key={c.id}
                className={component?.id === c.id ? 'selected' : ''}
                onClick={() => setComponent(c)}
              >
                <span>{c.label || c.type}</span>
                <small>{c.type}</small>
              </button>
            ))}
          </details>
          {component && (
            <div className="component-inspector">
              <b>{component.label || component.type}</b>
              <small>
                {component.locator?.using} · {component.locator?.value}
              </small>
              <button disabled={!canBind} onClick={() => onBind(component)}>
                <Link2 size={13} />
                {L('Associer à l’élément courant', 'Bind to current item')}
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.perform({
                      deviceId: id,
                      variant: {
                        locator: component.locator,
                        operation: 'tap',
                        value: '',
                        assertion: 'visible',
                        expected: '',
                        timeoutMs: 10000,
                      },
                      kind: 'action',
                    });
                    await inspect();
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                <Play size={13} />
                {L('Activer ce composant', 'Activate component')}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="device-empty">
          <OSIcon os={os} />
          <b>{L('Associer un appareil ', 'Pair a device ') + (os === 'ios' ? 'iOS' : 'Android')}</b>
          <p>
            {L(
              'Branchez le téléphone, puis ouvrez la liste.',
              'Connect a phone, then open the device list.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
