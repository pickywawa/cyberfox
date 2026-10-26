import { ReplayDevices } from './ReplayDevices';
import { PlatformIcon } from './PlatformIcon';
import { DeviceStatus } from './DeviceStatus';
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
  return <PlatformIcon platform={os} size={17} />;
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
        <ChevronDown size={14} />
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
          {devices.some((d) => d.platform === os && d.kind === 'network') && (
            <small>{L('Réseau', 'Network')}</small>
          )}
          {devices.filter((d) => d.platform === os && d.kind === 'network').map(item)}
          {devices.some((d) => d.platform === os && d.kind === 'manual') && (
            <small>{L('Configuration manuelle', 'Manual configuration')}</small>
          )}
          {devices.filter((d) => d.platform === os && d.kind === 'manual').map(item)}
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
  replay,
  historyFrames = [],
  onLive,
  onBindScreen,
  project,
  scan,
  scanning,
  onRefresh,
  onSettings,
  onSelect,
  onReady,
  onBind,
  onPerform,
  detached,
  onDetach,
  L,
}: {
  replay?: import('../shared/model').ReplayFrame | null;
  historyFrames?: import('../shared/model').ReplayFrame[];
  onLive?: () => void;
  onBindScreen?: (os: OS, component: Component) => void;
  project?: Project;
  scan: DeviceScan;
  scanning: boolean;
  onRefresh: () => void;
  onSettings: () => void;
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
            aria-label={L('Actualiser les appareils', 'Refresh devices')}
            onClick={onRefresh}
          >
            <RefreshCw size={15} className={scanning ? 'spin' : ''} />
          </button>
          <button
            className="icon-button panel-detach-button"
            title={
              detached
                ? L('Réintégrer les appareils', 'Dock devices')
                : L('Externaliser les appareils', 'Detach devices')
            }
            aria-label={
              detached
                ? L('Réintégrer les appareils', 'Dock devices')
                : L('Externaliser les appareils', 'Detach devices')
            }
            onClick={onDetach}
          >
            {detached ? <ArrowLeftToLine size={16} /> : <ExternalLink size={16} />}
          </button>
        </div>
      </div>
      {replay && project && (
        <ReplayDevices
          project={project}
          frame={replay}
          frames={historyFrames}
          onLive={() => onLive?.()}
          L={L}
        />
      )}
      <div className="live-device-content" hidden={!!replay && !!project}>
        <div className="device-hint">
          <Usb size={14} />
          {L('Composants réels · aucune action à l’aveugle', 'Real components · no blind actions')}
        </div>
        <div className={'mobile-zones ' + (wide && oses.length === 2 ? 'side-by-side' : '')}>
          {oses.map((os) => (
            <Mobile
              key={`${project?.id ?? 'none'}:${os}`}
              onBindScreen={onBindScreen ? (component) => onBindScreen(os, component) : undefined}
              os={os}
              id={project?.deviceIds[os] ?? ''}
              devices={scan.devices}
              scanning={scanning}
              onRefresh={onRefresh}
              onSettings={onSettings}
              onSelect={(id) => onSelect(os, id)}
              onReady={(ready) => onReady(os, ready)}
              onBind={(c) => onBind(os, c)}
              onPerform={() => onPerform(os)}
              canBind={!!project?.selectedNodeId}
              L={L}
            />
          ))}
        </div>
      </div>
      <details className="device-diagnostics">
        <summary>{L('Diagnostics de connexion', 'Connection diagnostics')}</summary>
        {scan.diagnostics.map((d) => (
          <p key={d}>{d}</p>
        ))}
        <p>
          {L(
            'iOS physique : configurer le Team ID Apple et un profil WebDriverAgent dans Cyberfox → Paramètres → Appareils.',
            'Physical iOS: configure Apple Team ID and a WebDriverAgent provisioning profile in settings.',
          )}
        </p>
      </details>
    </aside>
  );
}
function Mobile({
  onBindScreen,
  os,
  id,
  devices,
  scanning,
  onRefresh,
  onSettings,
  onSelect,
  onReady,
  onBind,
  onPerform,
  canBind,
  L,
}: {
  onBindScreen?: (component: Component) => void;
  os: OS;
  id: string;
  devices: Device[];
  scanning: boolean;
  onRefresh: () => void;
  onSettings: () => void;
  onSelect: (id: string) => void;
  onReady: (value: boolean) => void;
  onBind: (c: Component) => void;
  onPerform: () => void;
  canBind: boolean;
  L: L;
}) {
  const [screen, setScreen] = useState<Screen>();
  const [image, setImage] = useState('');
  const [mirrorOk, setMirrorOk] = useState(false);
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
    setMirrorOk(false);
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
        if (!disposed) {
          setImage(image);
          setMirrorOk(true);
        }
      } catch (e) {
        if (!disposed) setMirrorOk(false);
        if (!disposed && !loading) {
          setError((old) => old || String(e));
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
            <DeviceStatus
              id={id}
              mirror={mirrorOk}
              loading={loading}
              onSettings={onSettings}
              onReconnect={() => void inspect()}
              L={L}
            />
          </div>
          <div className="live-screen">
            {image ? (
              <img
                ref={img}
                src={image || undefined}
                alt={L('Écran ', 'Screen ') + os}
                onClick={pick}
              />
            ) : (
              <div className="screen-placeholder" role="status">
                <Smartphone size={32} />
                <b>
                  {loading
                    ? L('Connexion à l’appareil…', 'Connecting to device…')
                    : L('Écran indisponible', 'Screen unavailable')}
                </b>
                <p>
                  {loading
                    ? os === 'ios'
                      ? L(
                          'Préparation de WebDriverAgent. La première connexion peut prendre plusieurs minutes.',
                          'Preparing WebDriverAgent. First connection may take several minutes.',
                        )
                      : L('Préparation d’UiAutomator2…', 'Preparing UiAutomator2…')
                    : L(
                        'Consultez le diagnostic ci-dessous et réessayez la connexion.',
                        'Check the diagnosis below and retry the connection.',
                      )}
                </p>
                {!loading && (
                  <button onClick={() => void inspect()}>{L('Reconnecter', 'Reconnect')}</button>
                )}
              </div>
            )}
            {pointer && <span className="red-pointer" style={pointerPosition()} />}
            {loading && image && (
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
              <button onClick={onSettings}>
                {L('Cyberfox → Paramètres → Appareils', 'Cyberfox → Settings → Devices')}
              </button>
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
              {onBindScreen && (
                <button onClick={() => onBindScreen(component)}>
                  <Link2 size={13} />
                  {L(
                    'Ajouter comme repère de l’écran destination',
                    'Add as destination screen marker',
                  )}
                </button>
              )}
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
              'Les téléphones USB autorisés sont sélectionnés et connectés automatiquement.',
              'Authorized USB phones are automatically selected and connected.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
