import { useEffect, useState } from 'react';
import { ArrowDownToLine, ExternalLink, RefreshCw, PackageCheck, LoaderCircle } from 'lucide-react';
import { api, isDesktop } from './bridge';
import type { UpdateStatus } from '../shared/update';
import type { L } from './NodeEditor';
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>({
    state: 'idle',
    currentVersion: __APP_VERSION__,
    percent: 0,
    total: 0,
    received: 0,
    compatible: false,
  });
  useEffect(() => {
    void api.updateStatus?.().then(setStatus);
    return api.onEvent((e) => {
      if (e.type === 'update') setStatus(e.status);
    });
  }, []);
  return status;
}
export function UpdateProgress({ status, L }: { status: UpdateStatus; L: L }) {
  return (
    <div className="update-progress">
      <div>
        <span>
          {L('Téléchargement de Cyberfox', 'Downloading Cyberfox')} {status.version}
        </span>
        <b>{status.percent}%</b>
      </div>
      <progress
        aria-label={L('Téléchargement de la mise à jour', 'Update download')}
        value={status.percent}
        max={100}
      />
      <small>
        {(status.received / 1024 / 1024).toFixed(1)} / {(status.total / 1024 / 1024).toFixed(1)} Mo
      </small>
    </div>
  );
}
export function UpdatePanel({ L }: { L: L }) {
  const status = useUpdateStatus();
  const [error, setError] = useState('');
  const action = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <section>
      <span className="eyebrow">CYBERFOX {status.currentVersion}</span>
      <h3>{L('Mises à jour', 'Updates')}</h3>
      <p className="muted">
        {L(
          'Vérification sur les releases publiques GitHub. Le téléchargement utilise le proxy système, PAC et la pile réseau Chromium, avec nouvelles tentatives après un changement réseau.',
          'Checks public GitHub releases. Downloads use the system proxy, PAC and Chromium networking, with retries after network changes.',
        )}
      </p>
      <div className="connection-status">
        <PackageCheck size={17} />
        <b>
          {status.state === 'current'
            ? L('Votre application est à jour', 'Your application is up to date')
            : status.state === 'available'
              ? L('Nouvelle version disponible', 'New version available')
              : status.state === 'ready'
                ? L('Mise à jour prête', 'Update ready')
                : status.state === 'checking'
                  ? L('Vérification…', 'Checking…')
                  : L('Version installée', 'Installed version')}
          {status.version ? ' · ' + status.version : ''}
        </b>
      </div>
      {status.checkedAt && (
        <p className="note">
          {L('Dernière vérification : ', 'Last check: ')}
          {new Date(status.checkedAt).toLocaleString()}
        </p>
      )}
      {status.state === 'downloading' && <UpdateProgress status={status} L={L} />}
      <div className="update-actions">
        <button
          disabled={!isDesktop || status.state === 'checking' || status.state === 'downloading'}
          onClick={() => void action(() => api.updateCheck())}
        >
          <RefreshCw size={15} className={status.state === 'checking' ? 'spin' : ''} />
          {L('Rechercher une mise à jour', 'Check for updates')}
        </button>
        {status.compatible && ['available', 'error'].includes(status.state) && (
          <button className="primary" onClick={() => void action(() => api.updateDownload())}>
            <ArrowDownToLine size={15} />
            {L('Télécharger', 'Download')}
          </button>
        )}
        {status.state === 'ready' && (
          <button className="primary" onClick={() => void action(() => api.updateInstall())}>
            <PackageCheck size={15} />
            {L('Installer la mise à jour', 'Install update')}
          </button>
        )}
        <button onClick={() => void action(() => api.updateRelease())}>
          <ExternalLink size={14} />
          GitHub
        </button>
      </div>
      {status.state === 'available' && !status.compatible && (
        <p className="note">
          {L(
            'Aucun installateur avec empreinte vérifiable pour cette architecture. Consultez les fichiers de la release.',
            'No installer with a verifiable checksum for this architecture. See the release assets.',
          )}
        </p>
      )}
      {status.notes && (
        <details className="release-notes" open>
          <summary>{L('Notes de version', 'Release notes')}</summary>
          <pre>{status.notes}</pre>
        </details>
      )}
      {(error || status.error) && (
        <p className="form-error" role="alert">
          {error || status.error}
        </p>
      )}
      <p className="note">
        {L(
          'Un VPN ou pare-feu qui bloque GitHub doit autoriser github.com, api.github.com et les hôtes de téléchargement GitHub. La vérification TLS reste active.',
          'A VPN or firewall blocking GitHub must allow github.com, api.github.com and GitHub download hosts. TLS verification stays enabled.',
        )}
      </p>
    </section>
  );
}
