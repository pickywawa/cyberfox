import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { DeviceCheck } from '../shared/model';
import { api } from './bridge';
import type { L } from './NodeEditor';

export function DeviceStatus({
  id,
  mirror,
  loading,
  onSettings,
  onReconnect,
  L,
}: {
  id: string;
  mirror: boolean;
  loading: boolean;
  onSettings: () => void;
  onReconnect: () => void;
  L: L;
}) {
  const [checks, setChecks] = useState<DeviceCheck[]>([]);
  const [selected, setSelected] = useState<string>();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    setChecks([]);
    const refresh = async () => {
      if (!api.deviceHealth) return;
      try {
        const result = await api.deviceHealth(id);
        if (!disposed)
          setChecks((previous) =>
            JSON.stringify(previous) === JSON.stringify(result.checks) ? previous : result.checks,
          );
      } catch (e) {
        if (!disposed)
          setChecks([
            {
              id: 'diagnostics',
              label: L('Diagnostic', 'Diagnostics'),
              state: 'error',
              detail: String(e),
            },
          ]);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [id, loading]);
  useEffect(() => {
    if (!selected) return;
    const click = (e: MouseEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !(e.target as Element).closest?.('.device-status-button')
      )
        setSelected(undefined);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(undefined);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [selected]);
  const all: DeviceCheck[] = [
    ...checks,
    {
      id: 'mirror',
      label: L('Miroir', 'Mirror'),
      state: mirror ? 'ok' : loading ? 'pending' : 'error',
      detail: mirror
        ? L(
            'Une capture écran a été reçue. Le miroir ne garantit pas que le contrôle des composants est prêt.',
            'A screenshot was received. Mirroring does not guarantee component automation is ready.',
          )
        : L('Aucune capture reçue.', 'No screenshot received.'),
      fix: L(
        'Sur iPhone, WebDriverAgent doit fonctionner pour capturer l’écran. Consultez son statut puis reconnectez.',
        'On iPhone, WebDriverAgent must work to capture the screen. Check its status then reconnect.',
      ),
    },
  ];
  function open(event: React.MouseEvent<HTMLButtonElement>, target: string) {
    const r = event.currentTarget.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(r.left, innerWidth - 368)),
      top: Math.max(8, Math.min(r.bottom + 8, innerHeight - 380)),
    });
    setSelected(selected === target ? undefined : target);
  }
  return (
    <div className="device-status-bar" aria-label={L('État des composants', 'Component status')}>
      <button
        className={
          'icon-button device-status-button status-overview' +
          (all.some((check) => check.state === 'error') ? ' has-errors' : '')
        }
        aria-label={L('Diagnostic de l’appareil', 'Device diagnostics')}
        title={L('Diagnostic de l’appareil', 'Device diagnostics')}
        aria-expanded={!!selected}
        onClick={(e) => open(e, 'all')}
        onContextMenu={(e) => {
          e.preventDefault();
          open(e, 'all');
        }}
      >
        <Activity size={15} />
      </button>
      {selected &&
        createPortal(
          <div
            className="device-status-popover"
            ref={panel}
            role="dialog"
            aria-label={L('Diagnostic de l’appareil', 'Device diagnostics')}
            style={position}
          >
            <b>{L('État des composants', 'Component status')}</b>
            {all.map((check) => (
              <details key={check.id} open={selected === check.id || check.state === 'error'}>
                <summary>
                  <span className={'status-dot status-' + check.state} />
                  {check.label}
                  <small>
                    {L(
                      (
                        {
                          ok: 'Opérationnel',
                          error: 'Erreur',
                          pending: 'En cours',
                          unknown: 'Non vérifié',
                        } as const
                      )[check.state],
                      (
                        {
                          ok: 'Ready',
                          error: 'Error',
                          pending: 'In progress',
                          unknown: 'Unverified',
                        } as const
                      )[check.state],
                    )}
                  </small>
                </summary>
                <p>{check.detail}</p>
                {check.fix && <p className="note">{check.fix}</p>}
                {check.log && (
                  <details>
                    <summary>{L('Journal technique', 'Technical log')}</summary>
                    <pre>{check.log}</pre>
                  </details>
                )}
              </details>
            ))}
            <button
              onClick={() => {
                setSelected(undefined);
                onSettings();
              }}
            >
              {L('Cyberfox → Paramètres → Appareils', 'Cyberfox → Settings → Devices')}
            </button>
            <button
              onClick={() => {
                setSelected(undefined);
                onReconnect();
              }}
            >
              {L('Reconnecter', 'Reconnect')}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
