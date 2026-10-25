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
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} onCancel={onClose}>
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
  L,
  root,
  onClose,
  onCreate,
}: {
  L: Translate;
  root: string;
  onClose: () => void;
  onCreate: (v: { name: string; platforms: Project['platforms'] }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [platforms, setPlatforms] = useState<Project['platforms']>(['android', 'ios']);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onCreate(projectInput.parse({ name, platforms }));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={L('Nouveau projet', 'New project')} onClose={onClose}>
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
                {p === 'android' ? <Smartphone /> : p === 'ios' ? <Smartphone /> : <Layers3 />}
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
          <div className="directory-preview">
            <Folder size={15} />
            <span>
              {root}/{name || '…'}
            </span>
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
          <button className="primary" disabled={saving || !name.trim() || !platforms.length}>
            {saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}{' '}
            {L('Créer le projet', 'Create project')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function SettingsModal({
  L,
  tab,
  setTab,
  settings,
  statuses,
  refreshStatus,
  onClose,
  onSave,
}: {
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [login, setLogin] = useState({ output: '', running: false });
  useEffect(
    () =>
      api.onLogin((progress) => {
        if (progress.provider === draft.provider) setLogin(progress);
      }),
    [draft.provider],
  );
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
    ['ai', L('Intégration IA', 'AI integration'), Bot],
    ['devices', L('Appareils', 'Devices'), Smartphone],
    ['execution', L('Exécution', 'Execution'), Play],
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
                    ? L('Session disponible', 'Session available')
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
                disabled={!isDesktop || login.running}
                onClick={async () => {
                  try {
                    setLogin({ output: L('Connexion en cours…', 'Connecting…'), running: true });
                    await api.login(draft.provider);
                  } catch (e) {
                    setError(String(e));
                    setLogin({ output: '', running: false });
                  }
                }}
              >
                <Bot size={16} />
                {L('Connecter mon compte', 'Connect my account')}
              </button>
              {login.output && (
                <pre className="login-output" role="status">
                  {login.output}
                </pre>
              )}
              <label>
                {L('Modèle', 'Model')}
                <input
                  list="ai-models"
                  value={draft.provider === 'codex' ? draft.codexModel : draft.copilotModel}
                  onChange={(e) =>
                    update(
                      draft.provider === 'codex' ? 'codexModel' : 'copilotModel',
                      e.target.value,
                    )
                  }
                  placeholder={L('Modèle par défaut du fournisseur', 'Provider default model')}
                />
                <datalist id="ai-models">
                  {status?.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <p className="note">
                {draft.provider === 'codex'
                  ? L(
                      'Catalogue local Codex si disponible ; vous pouvez saisir un identifiant de modèle autorisé par votre compte. Vide = modèle par défaut de Codex.',
                      'Local Codex catalog when available; you can enter a model ID allowed by your account. Empty = Codex default.',
                    )
                  : L(
                      'Les modèles proposés sont récupérés depuis votre compte Copilot. Une offre autorisant Copilot CLI est nécessaire.',
                      'Suggested models are retrieved from your Copilot account. A plan allowing Copilot CLI is required.',
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
              <label>
                Appium
                <input
                  value={draft.appiumUrl}
                  onChange={(e) => update('appiumUrl', e.target.value)}
                />
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
                WebDriverAgent Bundle ID
                <input
                  value={draft.iosWdaBundleId}
                  onChange={(e) => update('iosWdaBundleId', e.target.value.trim())}
                />
              </label>
              <p className="note">
                {L(
                  'Appium démarre automatiquement sur le port local configuré. iOS physique nécessite un compte Apple dans Xcode et un profil de développement autorisant cet iPhone. Les réglages de tunnel ci-dessous servent de secours au miroir.',
                  'Appium starts automatically on the configured local port. Physical iOS needs an Apple account in Xcode and a development profile allowing this iPhone. Tunnel settings below are a mirroring fallback.',
                )}
              </p>
              <label>
                {L('UDID de l’iPhone associé au tunnel', 'iPhone UDID associated with the tunnel')}
                <input
                  value={draft.wdaDeviceId}
                  onChange={(e) => update('wdaDeviceId', e.target.value.trim())}
                  placeholder="000081…"
                />
              </label>
              <label>
                WebDriverAgent · iPhone
                <input value={draft.wdaUrl} onChange={(e) => update('wdaUrl', e.target.value)} />
              </label>
              <p className="note">
                {L(
                  'Adresse HTTP locale du tunnel WebDriverAgent. Associez explicitement le tunnel à l’UDID de l’iPhone choisi. Le miroir utilise des captures PNG périodiques, pas un flux vidéo.',
                  'Local HTTP address of the WebDriverAgent tunnel. Explicitly associate the tunnel with the selected iPhone UDID. Mirroring uses periodic PNG screenshots, not a video stream.',
                )}
              </p>
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
