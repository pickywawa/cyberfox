import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins } from 'lucide-react';
import type { ProviderStatus } from '../shared/model';
import type { L } from './NodeEditor';

export function TokenUsage({ status, L }: { status?: ProviderStatus; L: L }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, bottom: 8 });
  return (
    <>
      <button
        type="button"
        className="icon-button token-usage-button"
        aria-label={L('Consommation de tokens', 'Token usage')}
        title={L('Consommation de tokens', 'Token usage')}
        popoverTarget={id}
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(rect.left, innerWidth - 288)),
            bottom: Math.max(8, innerHeight - rect.top + 8),
          });
        }}
      >
        <Coins size={14} />
      </button>
      {createPortal(
        <div
          id={id}
          popover="auto"
          className="token-usage-popover"
          style={position}
          onToggle={(event) => setOpen(event.newState === 'open')}
          role="dialog"
          aria-label={L('Consommation de tokens', 'Token usage')}
        >
          <b>{L('Consommation de tokens', 'Token usage')}</b>
          {status?.lastUsage ? (
            <>
              <p>{L('Dernier échange', 'Last exchange')}</p>
              <dl>
                <div>
                  <dt>{L('Entrée', 'Input')}</dt>
                  <dd>{status.lastUsage.input.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>{L('Sortie', 'Output')}</dt>
                  <dd>{status.lastUsage.output.toLocaleString()}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="muted">{L('Aucune consommation disponible.', 'No usage available.')}</p>
          )}
          {status?.quota && (
            <p>
              {status.quota.usedPercent.toFixed(0)}% · {status.quota.label}
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
