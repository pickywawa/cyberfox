import { PlatformIcon } from './PlatformIcon';
import { DeviceSetup } from './DeviceSetup';
import { UpdatePanel } from './UpdatePanel';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  Compass,
  Folder,
  FolderOpen,
  GitBranch,
  Layers3,
  LoaderCircle,
  Monitor,
  MousePointer2,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TestTube2,
  Usb,
  X,
} from 'lucide-react';
import {
  flatten,
  nodePath,
  parseProposal,
  projectInput,
  requiredOS,
  type AiReply,
  type Device,
  type DeviceScan,
  type Project,
  type ProviderStatus,
  type ScenarioNode,
  type Settings,
  type Workspace,
} from '../shared/model';
import { api, isDesktop } from './bridge';
type Translate = (fr: string, en: string) => string;
const icons = { folder: Folder, navigation: Compass, test: TestTube2, assertion: ShieldCheck };
export function Fox({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? 'fox small' : 'fox'} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id={small ? 'foxSmall' : 'foxLarge'}
          x1="8"
          y1="8"
          x2="70"
          y2="75"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent2)" />
        </linearGradient>
      </defs>
      <path
        d="M12 10 34 24 46 24 68 10 64 47 40 70 16 47Z"
        fill={`url(#${small ? 'foxSmall' : 'foxLarge'})`}
      />
      <path d="m16 31 24 14 24-14-9 24-15 15-15-15Z" fill="var(--bg)" opacity=".85" />
      <path d="m24 40 9 4m14 0 9-4" stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
      <path d="m35 54 5 5 5-5Z" fill="var(--accent)" />
    </svg>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <div className="muted empty-copy">{children}</div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      onCancel={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function NewProject({
  project,
  L,
  root,
  onClose,
  onCreate,
}: {
  L: Translate;
  root: string;
  onClose: () => void;
  project?: Project;
  onCreate: (v: {
    name: string;
    platforms: Project['platforms'];
    applications?: Project['applications'];
    applicationDetails?: Project['applicationDetails'];
  }) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? '');
  const [platforms, setPlatforms] = useState<Project['platforms']>(
    project?.platforms ?? ['android', 'ios'],
  );
  const [applications, setApplications] = useState({
    android: project?.applications?.android ?? '',
    ios: project?.applications?.ios ?? '',
  });
  const [details, setDetails] = useState<Project['applicationDetails']>(
    project?.applicationDetails ?? {},
  );
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [sourceDevices, setSourceDevices] = useState<Partial<Record<'android' | 'ios', string>>>(
    project?.deviceIds ?? {},
  );
  useEffect(() => {
    let active = true;
    void api
      .devicesScan()
      .then((scan) => {
        if (!active) return;
        const ready = scan.devices.filter((device) => device.status === 'ready');
        setAvailableDevices(ready);
        setSourceDevices((old) => ({
          android: old.android || ready.find((device) => device.platform === 'android')?.id,
          ios: old.ios || ready.find((device) => device.platform === 'ios')?.id,
        }));
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, []);
  const [detecting, setDetecting] = useState<string | null>(null);
  const [appPicker, setAppPicker] = useState<{
    os: 'android' | 'ios';
    apps: { id: string; name: string }[];
  } | null>(null);
  const [appSearch, setAppSearch] = useState('');
  async function discoverApps(os: 'android' | 'ios', mode: 'current' | 'list') {
    if (!sourceDevices[os]) return;
    setDetecting(os);
    setError('');
    setAppPicker(null);
    setAppSearch('');
    try {
      const apps = await api.projectApplications({
        projectId: project?.id,
        deviceId: sourceDevices[os],
        platform: os,
        mode,
      });
      if (mode === 'list') setAppPicker({ os, apps });
      else if (apps[0]) selectApplication(os, apps[0]);
    } catch (error) {
      setError(String(error));
    } finally {
      setDetecting(null);
    }
  }
  function selectApplication(os: 'android' | 'ios', app: { id: string; name: string }) {
    setApplications((old) => ({ ...old, [os]: app.id }));
    setDetails((old) => ({ ...old, [os]: app }));
    setAppPicker(null);
  }

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onCreate(
        projectInput.parse({
          name,
          platforms,
          applications,
          applicationDetails: Object.fromEntries(
            Object.entries(details ?? {}).filter(
              ([os, detail]) => detail?.id === applications[os as 'android' | 'ios'],
            ),
          ),
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      wide
      title={
        project
          ? L('Configurer le projet', 'Configure project')
          : L('Nouveau projet', 'New project')
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <label>
            {L('Nom du projet', 'Project name')}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={L('Mon application mobile', 'My mobile app')}
              maxLength={80}
              required
            />
          </label>
          <label>{L('Plateformes et technologie', 'Platforms and technology')}</label>
          <div className="platform-options">
            {(['android', 'ios', 'flutter'] as const).map((p) => (
              <label key={p} className={platforms.includes(p) ? 'checked' : ''}>
                <input
                  type="checkbox"
                  checked={platforms.includes(p)}
                  onChange={(e) =>
                    setPlatforms((old) =>
                      e.target.checked ? [...old, p] : old.filter((v) => v !== p),
                    )
                  }
                />
                <PlatformIcon platform={p} size={22} />
                <b>{p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Flutter'}</b>
              </label>
            ))}
          </div>
          <p className="note">
            {L(
              'Flutter peut être associé à Android et iOS. Seules les plateformes choisies sont proposées dans les vues mobiles.',
              'Flutter can be combined with Android and iOS. Only selected platforms are offered in mobile views.',
            )}
          </p>
          <h3>{L('Applications à lancer', 'Applications to launch')}</h3>
          <p className="muted">
            {L(
              'Cyberfox active l’application installée avant l’exploration ou l’exécution si elle n’est pas au premier plan. Laissez vide pour garder l’application courante.',
              'Cyberfox activates the installed app before exploration or execution if it is not in the foreground. Leave empty to keep the current app.',
            )}
          </p>
          <div className="project-applications-grid">
            {requiredOS({ platforms }).map((os) => (
              <div className="project-application-config" key={os}>
                <h4>
                  <PlatformIcon platform={os} />
                  {L('Application', 'Application')} {os === 'ios' ? 'iOS' : 'Android'}
                </h4>
                <label>
                  {os === 'ios'
                    ? 'iOS · Bundle ID'
                    : L('Android · Nom du package', 'Android · Package name')}
                  <input
                    value={applications[os]}
                    disabled={!!detecting}
                    placeholder="com.example.app"
                    maxLength={255}
                    onChange={(e) => setApplications((old) => ({ ...old, [os]: e.target.value }))}
                  />
                </label>
                {
                  <>
                    <label>
                      {L('Appareil source', 'Source device')} · {os === 'ios' ? 'iOS' : 'Android'}
                      <select
                        value={sourceDevices[os] ?? ''}
                        disabled={!!detecting}
                        onChange={(e) => {
                          setSourceDevices((old) => ({ ...old, [os]: e.target.value }));
                          setAppPicker(null);
                        }}
                      >
                        <option value="">
                          {L('Choisir un appareil connecté', 'Choose a connected device')}
                        </option>
                        {sourceDevices[os] &&
                          !availableDevices.some((device) => device.id === sourceDevices[os]) && (
                            <option value={sourceDevices[os]}>
                              {L('Appareil associé non connecté', 'Paired device disconnected')}
                            </option>
                          )}
                        {availableDevices
                          .filter((device) => device.platform === os)
                          .map((device) => (
                            <option key={device.id} value={device.id}>
                              {device.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="application-discovery-actions">
                      <button
                        type="button"
                        disabled={!sourceDevices[os] || !!detecting}
                        onClick={() => void discoverApps(os, 'current')}
                      >
                        <Smartphone size={14} />
                        {L('Application ouverte', 'Current application')}
                      </button>
                      <button
                        type="button"
                        disabled={!sourceDevices[os] || !!detecting}
                        onClick={() => void discoverApps(os, 'list')}
                      >
                        <FolderOpen size={14} />
                        {L('Parcourir les applications', 'Browse applications')}
                      </button>
                    </div>
                    {!sourceDevices[os] && (
                      <p className="note">
                        {L(
                          'Connectez un appareil pour détecter ses applications.',
                          'Connect a device to discover its applications.',
                        )}
                      </p>
                    )}
                    {detecting === os && (
                      <p role="status" className="application-discovery-loading">
                        <LoaderCircle size={14} className="spin" />
                        {L('Lecture de l’appareil…', 'Reading device…')}
                      </p>
                    )}
                    {appPicker?.os === os && (
                      <div className="application-picker">
                        <div className="application-picker-search">
                          <input
                            autoFocus
                            aria-label={L('Rechercher une application', 'Search applications')}
                            placeholder={L('Nom ou identifiant…', 'Name or identifier…')}
                            value={appSearch}
                            onChange={(e) => setAppSearch(e.target.value)}
                          />
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={L(
                              'Fermer la liste des applications',
                              'Close application list',
                            )}
                            onClick={() => setAppPicker(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="application-picker-results">
                          {appPicker.apps
                            .filter((app) =>
                              (app.name + ' ' + app.id)
                                .toLowerCase()
                                .includes(appSearch.toLowerCase()),
                            )
                            .map((app) => (
                              <button
                                type="button"
                                key={app.id}
                                className={applications[os] === app.id ? 'selected' : ''}
                                onClick={() => selectApplication(os, app)}
                              >
                                <strong>{app.name}</strong>
                                {app.name !== app.id && <small>{app.id}</small>}
                                {applications[os] === app.id && <Check size={14} />}
                              </button>
                            ))}
                          {!appPicker.apps.some((app) =>
                            (app.name + ' ' + app.id)
                              .toLowerCase()
                              .includes(appSearch.toLowerCase()),
                          ) && (
                            <p className="note">
                              {L('Aucune application trouvée.', 'No applications found.')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                }
                <label>
                  {L('Nom de l’application', 'Application name')} ·{' '}
                  {os === 'ios' ? 'iOS' : 'Android'}
                  <input
                    value={details?.[os]?.id === applications[os] ? (details[os]?.name ?? '') : ''}
                    maxLength={180}
                    disabled={!applications[os] || !!detecting}
                    onChange={(e) =>
                      setDetails((old) => ({
                        ...old,
                        [os]: {
                          ...(old?.[os]?.id === applications[os] ? old[os] : {}),
                          id: applications[os],
                          name: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
                {details?.[os]?.id === applications[os] && details[os]?.icon && (
                  <img className="project-app-icon" src={details[os]?.icon} alt="" />
                )}
                {
                  <button
                    type="button"
                    disabled={!applications[os] || !sourceDevices[os] || !!detecting}
                    onClick={async () => {
                      setDetecting(os);
                      setError('');
                      try {
                        const info = await api.projectApplicationInfo({
                          projectId: project?.id,
                          deviceId: sourceDevices[os],
                          platform: os,
                          application: applications[os],
                        });
                        setDetails((old) => ({ ...old, [os]: info }));
                      } catch (error) {
                        setError(String(error));
                      } finally {
                        setDetecting(null);
                      }
                    }}
                  >
                    {detecting === os ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {L('Lire le nom et l’icône', 'Read name and icon')}
                  </button>
                }
              </div>
            ))}
          </div>
          <div className="directory-preview">
            <Folder size={15} />
            <span>{project ? project.directory : `${root}/${name || '…'}`}</span>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            {L('Annuler', 'Cancel')}
          </button>
          <button
            className="primary"
            disabled={saving || !!detecting || !name.trim() || !platforms.length}
          >
            {saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}{' '}
            {project
              ? L('Enregistrer le projet', 'Save project')
              : L('Créer le projet', 'Create project')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function SettingsModal({
  project,
  onApplicationsSave,
  iosDeviceId,
  L,
  tab,
  setTab,
  settings,
  statuses,
  refreshStatus,
  onClose,
  onSave,
}: {
  project?: import('../shared/model').Project;
  onApplicationsSave?: (applications: { android: string; ios: string }) => Promise<void>;
  iosDeviceId?: string;
  L: Translate;
  tab: string;
  setTab: (v: string) => void;
  settings: Settings;
  statuses: Partial<Record<Settings['provider'], ProviderStatus>>;
  refreshStatus: (p: Settings['provider']) => Promise<ProviderStatus>;
  onClose: () => void;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [applications, setApplications] = useState({
    android: project?.applications?.android ?? '',
    ios: project?.applications?.ios ?? '',
  });
  const [deviceTab, setDeviceTab] = useState<'ios' | 'android'>('ios');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [login, setLogin] = useState({ output: '', running: false });
  useEffect(
    () =>
      api.onLogin((progress) => {
        if (progress.provider === draft.provider) {
          setLogin(progress);
          if (!progress.running) void refreshStatus(progress.provider);
        }
      }),
    [draft.provider],
  );
  useEffect(() => {
    void refreshStatus(draft.provider);
  }, [draft.provider]);
  const status = statuses[draft.provider];
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((s) => ({ ...s, [key]: value }));
    setNotice('');
  };
  async function check() {
    setChecking(true);
    setError('');
    try {
      await refreshStatus(draft.provider);
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }
  const tabs = [
    ['appearance', L('Apparence', 'Appearance'), Monitor],
    ['projects', L('Projets', 'Projects'), FolderOpen],
    ['creation', L('Création', 'Creation'), Sparkles],
    ['ai', L('Intégration IA', 'AI integration'), Bot],
    ['devices', L('Appareils', 'Devices'), Smartphone],
    ['execution', L('Exécution', 'Execution'), Play],
    ['updates', L('Mises à jour', 'Updates'), RefreshCw],
  ] as const;
  return (
    <Modal wide title={L('Paramètres', 'Settings')} onClose={onClose}>
      <div className="settings-layout">
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === 'updates' && (
            <>
              <UpdatePanel L={L} />
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={draft.checkUpdatesOnStart}
                  onChange={(e) => update('checkUpdatesOnStart', e.target.checked)}
                />
                {L(
                  'Rechercher automatiquement au démarrage et toutes les 4 heures',
                  'Check automatically on startup and every 4 hours',
                )}
              </label>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={draft.autoDownloadUpdates}
                  onChange={(e) => update('autoDownloadUpdates', e.target.checked)}
                />
                {L(
                  'Télécharger automatiquement les nouvelles versions',
                  'Automatically download new versions',
                )}
              </label>
              <p className="note">
                {L(
                  'L’installation demande toujours votre accord avant d’ouvrir le DMG et fermer Cyberfox.',
                  'Installation always asks before opening the installer and closing Cyberfox.',
                )}
              </p>
            </>
          )}
          {tab === 'appearance' && (
            <>
              <span className="eyebrow">
                {L('VOTRE ESPACE, VOTRE STYLE', 'YOUR SPACE, YOUR STYLE')}
              </span>
              <h3>{L('Apparence', 'Appearance')}</h3>
              <p className="muted">
                {L(
                  'Les couleurs familières de Cyberdog, dans votre atelier mobile.',
                  'Familiar Cyberdog colors in your mobile workspace.',
                )}
              </p>
              <label>{L('Thème', 'Theme')}</label>
              <div className="theme-grid">
                {(
                  ['system', 'light', 'dark', 'midnight', 'dracula', 'forest', 'sunset'] as const
                ).map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    className={'theme-option ' + (draft.theme === theme ? 'selected' : '')}
                    onClick={() => update('theme', theme)}
                  >
                    <span className={'swatch ' + theme}>
                      <span />
                      <span />
                      <span />
                    </span>
                    <span>
                      {
                        {
                          system: L('Système', 'System'),
                          light: L('Clair', 'Light'),
                          dark: L('Sombre', 'Dark'),
                          midnight: 'Midnight',
                          dracula: 'Dracula',
                          forest: L('Forêt', 'Forest'),
                          sunset: 'Sunset',
                        }[theme]
                      }
                    </span>
                    {draft.theme === theme && <Check size={13} />}
                  </button>
                ))}
              </div>
              <label>
                {L('Langue', 'Language')}
                <select
                  value={draft.language}
                  onChange={(e) => update('language', e.target.value as 'fr' | 'en')}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </label>
            </>
          )}
          {tab === 'projects' && (
            <>
              <span className="eyebrow">{L('ORGANISATION LOCALE', 'LOCAL ORGANIZATION')}</span>
              {project && (
                <>
                  <h3>
                    {L('Application du projet', 'Project application')} · {project.name}
                  </h3>
                  <label>
                    Android · {L('Nom du package', 'Package name')}
                    <input
                      value={applications.android}
                      placeholder="com.example.app"
                      onChange={(e) => setApplications((s) => ({ ...s, android: e.target.value }))}
                    />
                  </label>
                  <label>
                    iOS · Bundle ID
                    <input
                      value={applications.ios}
                      placeholder="com.example.app"
                      onChange={(e) => setApplications((s) => ({ ...s, ios: e.target.value }))}
                    />
                  </label>
                  <p className="muted">
                    {L(
                      'L’application installée est activée automatiquement avant l’exploration si elle n’est pas au premier plan. Laissez vide pour garder l’application courante.',
                      'The installed app is automatically activated before exploration if it is not in the foreground. Leave empty to keep the current app.',
                    )}
                  </p>
                  <button
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setError('');
                      try {
                        await onApplicationsSave?.(applications);
                        setNotice(L('Application enregistrée', 'Application saved'));
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {L('Enregistrer l’application du projet', 'Save project application')}
                  </button>
                </>
              )}
              <h3>{L('Dossier des projets', 'Projects directory')}</h3>
              <p className="muted">
                {L(
                  'Chaque nouveau projet est enregistré dans un sous-dossier portant son nom.',
                  'Each new project is saved in a subdirectory bearing its name.',
                )}
              </p>
              <label>
                {L('Répertoire par défaut', 'Default directory')}
                <div className="input-row">
                  <input
                    value={draft.projectsDirectory}
                    onChange={(e) => update('projectsDirectory', e.target.value)}
                  />
                  <button
                    disabled={!isDesktop}
                    onClick={async () => {
                      const directory = await api.chooseDirectory();
                      if (directory) update('projectsDirectory', directory);
                    }}
                  >
                    <FolderOpen size={16} />
                    {L('Parcourir', 'Browse')}
                  </button>
                </div>
              </label>
              <div className="notice">
                <Folder size={18} />
                {L(
                  'Ce réglage concerne les nouveaux projets. Les projets existants restent à leur emplacement.',
                  'This setting applies to new projects. Existing projects remain at their current location.',
                )}
              </div>
            </>
          )}
          {tab === 'creation' && (
            <>
              <h3>{L('Création assistée par IA', 'AI-assisted creation')}</h3>
              <label>
                {L('Nombre maximal de décisions', 'Maximum decisions')}
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={draft.creationMaxDecisions}
                  onChange={(e) => update('creationMaxDecisions', Number(e.target.value))}
                />
              </label>
              <label>
                {L(
                  'Durée maximale (minutes, questions comprises)',
                  'Maximum duration (minutes, including questions)',
                )}
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={draft.creationTimeoutMinutes}
                  onChange={(e) => update('creationTimeoutMinutes', Number(e.target.value))}
                />
              </label>
              <label>
                {L('Instructions complémentaires', 'Additional instructions')}
                <textarea
                  rows={8}
                  maxLength={20000}
                  value={draft.creationPrompt}
                  onChange={(e) => update('creationPrompt', e.target.value)}
                />
              </label>
              <p className="muted">
                {L(
                  'Ces instructions complètent les règles embarquées de sécurité et de validation. Les traces sont enregistrées automatiquement dans le projet ; les saisies utilisent des variables.',
                  'These instructions supplement embedded safety and validation rules. Traces are saved automatically in the project; inputs use variables.',
                )}
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.creationReplay}
                  onChange={(e) => update('creationReplay', e.target.checked)}
                />
                {L(
                  'Rejouer avant validation (relance l’application, conserve ses données)',
                  'Replay before review (restarts app, preserves its data)',
                )}
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.creationQuestions}
                  onChange={(e) => update('creationQuestions', e.target.checked)}
                />
                {L(
                  'Autoriser les demandes de précision en mode interactif',
                  'Allow clarification questions in interactive mode',
                )}
              </label>
              <button
                onClick={() =>
                  setDraft((s) => ({
                    ...s,
                    creationMaxDecisions: 40,
                    creationTimeoutMinutes: 10,
                    creationPrompt: '',
                    creationReplay: true,
                    creationQuestions: true,
                  }))
                }
              >
                {L('Rétablir les valeurs par défaut', 'Restore defaults')}
              </button>
            </>
          )}
          {tab === 'ai' && (
            <>
              <span className="eyebrow">{L('VOTRE COPILOTE DE QA', 'YOUR QA COPILOT')}</span>
              <h3>{L('Intégration IA', 'AI integration')}</h3>
              <p className="muted">
                {L(
                  'Connectez votre compte local. Les identifiants sont gérés par les outils officiels, jamais par l’interface.',
                  'Connect your local account. Credentials are managed by official tools, never by the interface.',
                )}
              </p>
              <div className="provider-options">
                {(['codex', 'copilot'] as const).map((p) => (
                  <button
                    key={p}
                    className={draft.provider === p ? 'selected' : ''}
                    onClick={() => {
                      update('provider', p);
                      setLogin({ output: '', running: false });
                      void refreshStatus(p);
                    }}
                  >
                    <Bot size={22} />
                    <b>{p === 'codex' ? 'Codex' : 'GitHub Copilot'}</b>
                    <small>{p === 'codex' ? 'OpenAI' : 'GitHub'}</small>
                    {draft.provider === p && <Check size={15} />}
                  </button>
                ))}
              </div>
              <div className="connection-status">
                <span className={'dot ' + (status?.authenticated ? 'green' : '')} />
                <b>
                  {status?.authenticated
                    ? L('IA connectée · prête à être utilisée', 'AI connected · ready to use')
                    : L('Connexion à vérifier', 'Connection to verify')}
                </b>
                <button onClick={() => void check()} disabled={checking}>
                  {checking ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}{' '}
                  {L('Vérifier', 'Check')}
                </button>
              </div>
              {status && <p className="connection-message">{status.message}</p>}
              <button
                className="primary"
                disabled={!isDesktop || login.running || checking}
                onClick={async () => {
                  try {
                    if (status?.authenticated) {
                      setChecking(true);
                      await api.logout(draft.provider);
                      setLogin({ output: '', running: false });
                      await refreshStatus(draft.provider);
                      return;
                    }
                    setLogin({ output: L('Connexion en cours…', 'Connecting…'), running: true });
                    await api.login(draft.provider);
                  } catch (e) {
                    setError(String(e));
                    setLogin({ output: '', running: false });
                  } finally {
                    setChecking(false);
                  }
                }}
              >
                <Bot size={16} />
                {status?.authenticated
                  ? L('Déconnecter mon compte', 'Disconnect my account')
                  : L('Connecter mon compte', 'Connect my account')}
              </button>
              {status?.authenticated && (
                <p className="note">
                  {L(
                    'Votre compte est connecté : vous pouvez utiliser le chat pour générer des scénarios. Cette session est partagée avec le CLI officiel ; la déconnexion peut aussi affecter son usage dans le terminal. La disponibilité du modèle et les quotas restent soumis à votre abonnement.',
                    'Your account is connected: use the chat to generate scenarios. This session is shared with the official CLI; disconnecting may also affect terminal use. Model access and quotas depend on your subscription.',
                  )}
                </p>
              )}
              {login.output && (
                <pre className="login-output" role="status">
                  {login.output}
                </pre>
              )}
              <label>
                {L('Modèle', 'Model')}
                <select
                  aria-label={L('Modèle', 'Model')}
                  value={draft.provider === 'codex' ? draft.codexModel : draft.copilotModel}
                  onChange={(e) =>
                    update(
                      draft.provider === 'codex' ? 'codexModel' : 'copilotModel',
                      e.target.value,
                    )
                  }
                >
                  <option value="">
                    {L('Modèle par défaut du fournisseur', 'Provider default model')}
                  </option>
                  {(draft.provider === 'codex' ? draft.codexModel : draft.copilotModel) &&
                    !status?.models.some(
                      (m) =>
                        m.id ===
                        (draft.provider === 'codex' ? draft.codexModel : draft.copilotModel),
                    ) && (
                      <option
                        value={draft.provider === 'codex' ? draft.codexModel : draft.copilotModel}
                      >
                        {draft.provider === 'codex' ? draft.codexModel : draft.copilotModel}
                      </option>
                    )}
                  {status?.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="note">
                {draft.provider === 'codex'
                  ? L(
                      'Les modèles proviennent du catalogue local Codex, lorsqu’il est disponible. Le choix « Par défaut » utilise le modèle configuré par Codex.',
                      'Models come from the local Codex catalog when available. Default uses the model configured by Codex.',
                    )
                  : L(
                      'Les modèles proposés sont récupérés depuis votre compte Copilot. Une offre autorisant Copilot CLI est nécessaire.',
                      'Suggested models are retrieved from your Copilot account. A plan allowing Copilot CLI is required.',
                    )}
              </p>
              <label>
                {L('Effort de raisonnement', 'Reasoning effort')}
                <select
                  aria-label={L('Effort de raisonnement', 'Reasoning effort')}
                  value={draft.reasoningEffort ?? 'default'}
                  onChange={(e) =>
                    update('reasoningEffort', e.target.value as Settings['reasoningEffort'])
                  }
                >
                  <option value="default">{L('Par défaut du modèle', 'Model default')}</option>
                  <option value="low">Low — {L('rapide', 'fast')}</option>
                  <option value="medium">Medium — {L('équilibré', 'balanced')}</option>
                  <option value="high">High — {L('approfondi', 'thorough')}</option>
                </select>
              </label>
              <p className="note">
                {L(
                  'Low / medium / high règlent le temps de réflexion, pas le modèle. Un effort élevé peut augmenter la durée et la consommation. Les niveaux acceptés dépendent du modèle ; laissez « Par défaut » en cas de doute. Enregistrez pour appliquer ces choix aux prochaines demandes.',
                  'Low / medium / high set reasoning effort, not the model. Higher effort can increase duration and usage. Accepted levels depend on the model; use Default when unsure. Save to apply these choices to upcoming requests.',
                )}
              </p>
              <div className="notice">
                <ShieldCheck size={18} />
                {L(
                  'L’IA explore les composants et peut naviguer sur les appareils sélectionnés pour générer des propositions. Vous validez les ajouts avant enregistrement. Les observations sont envoyées au fournisseur choisi.',
                  'AI explores components and can navigate selected devices to generate proposals. You approve additions before saving. Observations are sent to your chosen provider.',
                )}
              </div>
            </>
          )}
          {tab === 'execution' && (
            <>
              <span className="eyebrow">QA EN DIRECT</span>
              <h3>{L('Analyse des échecs', 'Failure analysis')}</h3>
              <label>
                {L('Quand un test échoue', 'When a test fails')}
                <select
                  value={draft.analysisMode}
                  onChange={(e) =>
                    update('analysisMode', e.target.value as Settings['analysisMode'])
                  }
                >
                  <option value="automatic">
                    {L('Analyse IA automatique', 'Automatic AI analysis')}
                  </option>
                  <option value="ask">{L('Demander à l’utilisateur', 'Ask the user')}</option>
                  <option value="off">{L('Ne pas analyser', 'Do not analyze')}</option>
                </select>
              </label>
              <p className="note">
                {L(
                  'Le résultat original est conservé. L’analyse ne modifie jamais les tests et ne bloque pas les tests indépendants.',
                  'The original result is preserved. Analysis never changes tests or blocks independent tests.',
                )}
              </p>
            </>
          )}
          {tab === 'devices' && (
            <>
              <span className="eyebrow">{L('CONNEXIONS MOBILES', 'MOBILE CONNECTIONS')}</span>
              <h3>{L('Miroir des appareils', 'Device mirroring')}</h3>
              <p className="muted">
                {L(
                  'Android USB et émulateur : ADB. Simulateur iOS : Xcode. iPhone USB : Xcode et signature WebDriverAgent.',
                  'Android USB and emulator: ADB. iOS Simulator: Xcode. USB iPhone: Xcode and signed WebDriverAgent.',
                )}
              </p>
              <div
                className="device-settings-tabs"
                role="tablist"
                aria-label={L('Plateforme mobile', 'Mobile platform')}
              >
                {(['ios', 'android'] as const).map((os) => (
                  <button
                    key={os}
                    role="tab"
                    aria-selected={deviceTab === os}
                    onClick={() => setDeviceTab(os)}
                  >
                    {os === 'ios' ? 'iOS' : 'Android'}
                  </button>
                ))}
              </div>
              <label>
                Appium
                <input
                  value={draft.appiumUrl}
                  onChange={(e) => update('appiumUrl', e.target.value)}
                />
              </label>
              {deviceTab === 'ios' && (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={draft.iosKeepAwake ?? false}
                      onChange={(e) => update('iosKeepAwake', e.target.checked)}
                    />
                    {L(
                      'Maintenir l’iPhone éveillé (expérimental)',
                      'Keep iPhone awake (experimental)',
                    )}
                  </label>
                  <p className="note">
                    {L(
                      'Désactivé par défaut. Sur l’iPhone physique sélectionné et connecté à WDA, Cyberfox essaie un appui volume + puis − toutes les 20 secondes. Cela peut afficher l’indicateur et modifier légèrement le volume, notamment à ses limites. Suspendu pendant les tests et les commandes mobiles ; actif pendant l’attente IA. Ne déverrouille pas l’iPhone, ne modifie pas le profil d’entreprise et ne garantit pas d’empêcher sa veille. Enregistrez pour activer.',
                      'Off by default. On the selected physical iPhone connected to WDA, Cyberfox tries volume up then down every 20 seconds. This may display the volume indicator and slightly change volume, especially at its limits. Paused during tests and mobile commands; active while waiting for AI. It does not unlock the iPhone, alter company profiles or guarantee prevention of sleep. Save to enable.',
                    )}
                  </p>
                  <label>
                    {L('Mode WebDriverAgent', 'WebDriverAgent mode')}
                    <select
                      value={draft.iosWdaMode ?? 'build'}
                      onChange={(e) =>
                        update('iosWdaMode', e.target.value as Settings['iosWdaMode'])
                      }
                    >
                      <option value="build">
                        {L('Compiler et signer sur ce Mac', 'Build and sign on this Mac')}
                      </option>
                      <option value="preinstalled">
                        {L('WDA déjà installé et signé', 'WDA already installed and signed')}
                      </option>
                      <option value="external">
                        {L(
                          'WDA déjà lancé (adresse externe)',
                          'WDA already running (external URL)',
                        )}
                      </option>
                    </select>
                  </label>
                  <label>
                    {L('Équipe Apple (Team ID)', 'Apple Team ID')}
                    <input
                      value={draft.iosTeamId}
                      onChange={(e) => update('iosTeamId', e.target.value.trim())}
                      placeholder="3ZL6…"
                    />
                  </label>
                  <label>
                    {L(
                      'Bundle ID de base WDA (distinct de l’app TestFlight)',
                      'WDA base Bundle ID (separate from the TestFlight app)',
                    )}
                    <input
                      placeholder="com.pickywawa.cyberfox.WebDriverAgentRunner"
                      value={draft.iosWdaBundleId}
                      onChange={(e) => update('iosWdaBundleId', e.target.value.trim())}
                    />
                  </label>
                  <p className="note">
                    {L('Identifiant final du runner : ', 'Final runner identifier: ')}
                    <code>
                      {draft.iosWdaBundleId
                        ? draft.iosWdaBundleId + '.xctrunner'
                        : '…WebDriverAgentRunner.xctrunner'}
                    </code>
                    <br />
                    {L(
                      'Cet identifiant doit être autorisé par le profil Development de votre équipe. Le nom d’exemple com.pickywawa… n’est pas un profil fourni avec Cyberfox.',
                      'This identifier must be allowed by your team’s Development profile. The example com.pickywawa… is not a profile supplied with Cyberfox.',
                    )}
                  </p>
                  <label>
                    {L(
                      'Fichier .xcconfig de signature (facultatif, profil match)',
                      'Signing .xcconfig file (optional, match profile)',
                    )}
                    <input
                      value={draft.iosXcodeConfigFile ?? ''}
                      onChange={(e) => update('iosXcodeConfigFile', e.target.value)}
                      placeholder="/chemin/vers/wda.xcconfig"
                    />
                  </label>
                  <button
                    disabled={!iosDeviceId}
                    onClick={async () => {
                      try {
                        await api.openWdaProject(iosDeviceId!);
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    {L('Ouvrir le projet WDA dans Xcode', 'Open WDA project in Xcode')}
                  </button>
                  <p className="note">
                    {L(
                      'Sélectionnez un iPhone dans le projet. Dans Xcode : target WebDriverAgentRunner → Signing & Capabilities ; choisir l’équipe et le profil puis Product → Test sur cet iPhone. Enregistrer les réglages Cyberfox avant de reconnecter.',
                      'Select an iPhone in the project. In Xcode: WebDriverAgentRunner target → Signing & Capabilities; choose team and profile, then Product → Test on this iPhone. Save Cyberfox settings before reconnecting.',
                    )}
                  </p>
                  <p className="note">
                    {L(
                      'Appium démarre automatiquement sur le port local configuré. iOS physique nécessite un compte Apple dans Xcode et un profil de développement autorisant cet iPhone. Les réglages de tunnel ci-dessous servent de secours au miroir.',
                      'Appium starts automatically on the configured local port. Physical iOS needs an Apple account in Xcode and a development profile allowing this iPhone. Tunnel settings below are a mirroring fallback.',
                    )}
                  </p>
                  <label>
                    {L(
                      'UDID de l’iPhone associé au tunnel',
                      'iPhone UDID associated with the tunnel',
                    )}
                    <input
                      value={draft.wdaDeviceId}
                      onChange={(e) => update('wdaDeviceId', e.target.value.trim())}
                      placeholder="000081…"
                    />
                  </label>
                  <label>
                    {L(
                      'Version iOS (requise sous Windows/Linux)',
                      'iOS version (required on Windows/Linux)',
                    )}
                    <input
                      value={draft.iosPlatformVersion ?? ''}
                      onChange={(e) => update('iosPlatformVersion', e.target.value)}
                      placeholder="27.0.1"
                    />
                  </label>
                  <label>
                    WebDriverAgent · iPhone
                    <input
                      value={draft.wdaUrl}
                      onChange={(e) => update('wdaUrl', e.target.value)}
                    />
                  </label>
                  <p className="note">
                    {L(
                      'Adresse HTTP locale du tunnel WebDriverAgent. Associez explicitement le tunnel à l’UDID de l’iPhone choisi. Le miroir utilise des captures PNG périodiques, pas un flux vidéo.',
                      'Local HTTP address of the WebDriverAgent tunnel. Explicitly associate the tunnel with the selected iPhone UDID. Mirroring uses periodic PNG screenshots, not a video stream.',
                    )}
                  </p>
                  {deviceTab === 'ios' && <DeviceSetup L={L} />}
                </>
              )}
              {deviceTab === 'android' && (
                <p className="note">
                  {L(
                    'Aucun paramètre spécifique Android pour le moment. La connexion utilise ADB et UiAutomator2.',
                    'No Android-specific settings yet. Connection uses ADB and UiAutomator2.',
                  )}
                </p>
              )}
              <div className="notice">
                <Usb size={18} />
                {L(
                  'Le câble pilote la connexion. Le trafic de l’application continue à utiliser son propre réseau.',
                  'The cable provides device connectivity. App traffic continues to use its own network.',
                )}
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="save-notice" role="status">
              <Check size={14} />
              {notice}
            </p>
          )}
        </div>
      </div>
      <footer>
        <button onClick={onClose}>{L('Fermer', 'Close')}</button>
        <button
          className="primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await onSave(draft);
              setNotice(L('Paramètres enregistrés', 'Settings saved'));
            } catch (e) {
              setError(String(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          <Check size={16} />
          {L('Enregistrer', 'Save')}
        </button>
      </footer>
    </Modal>
  );
}
