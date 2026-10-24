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
function Fox({ small = false }: { small?: boolean }) {
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
function Empty({
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
function Modal({
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
export function App() {
  const [state, setState] = useState<Workspace>();
  const [fatal, setFatal] = useState('');
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [statuses, setStatuses] = useState<Partial<Record<Settings['provider'], ProviderStatus>>>(
    {},
  );
  const [scan, setScan] = useState<DeviceScan>({ devices: [], diagnostics: [] });
  const [scanning, setScanning] = useState(false);
  const [deviceIds, setDeviceIds] = useState<string[]>(['', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ projectId: string; nodes: ScenarioNode[] } | null>(
    null,
  );
  const [nodeDraft, setNodeDraft] = useState<{ parentId?: string } | null>(null);
  const L: Translate = (fr, en) => (state?.settings.language === 'en' ? en : fr);
  const project = state?.projects.find((p) => p.id === state.activeProjectId);
  const ready = !!statuses[state?.settings.provider ?? 'codex']?.authenticated;
  useEffect(() => {
    api
      .load()
      .then(setState)
      .catch((e) => setFatal(String(e)));
  }, []);
  useEffect(() => {
    if (!state) return;
    const root = document.documentElement;
    root.lang = state.settings.language;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (root.dataset.theme =
        state.settings.theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : state.settings.theme);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state?.settings.theme, state?.settings.language]);
  useEffect(() => {
    if (state) void refreshStatus(state.settings.provider);
  }, [state?.settings.provider]);
  useEffect(() => {
    void refreshDevices();
  }, []);
  useEffect(() => {
    setSelected(undefined);
    setDeviceIds(['', '']);
  }, [state?.activeProjectId]);
  function report(e: unknown) {
    setError(e instanceof Error ? e.message : String(e));
  }
  async function refreshStatus(provider: Settings['provider']) {
    const s = await api.providerStatus(provider);
    setStatuses((old) => ({ ...old, [provider]: s }));
    return s;
  }
  async function refreshDevices() {
    setScanning(true);
    try {
      setScan(await api.devicesScan());
    } catch (e) {
      report(e);
    } finally {
      setScanning(false);
    }
  }
  function replaceProject(p: Project) {
    setState((s) =>
      s ? { ...s, projects: s.projects.map((old) => (old.id === p.id ? p : old)) } : s,
    );
  }
  async function selectProject(id: string) {
    try {
      await api.projectSelect(id);
      setState((s) => (s ? { ...s, activeProjectId: id } : s));
    } catch (e) {
      report(e);
    }
  }
  async function updateProject(
    p: Project,
    changes: { tab?: Project['tab']; nodes?: ScenarioNode[] },
  ) {
    const next = await api.projectUpdate({ id: p.id, ...changes });
    replaceProject(next);
    return next;
  }
  async function changeTab(tab: Project['tab']) {
    if (project)
      try {
        await updateProject(project, { tab });
      } catch (e) {
        report(e);
      }
  }
  async function ask(prompt: string) {
    if (!project) return false;
    const id = project.id;
    setBusy(true);
    try {
      const reply: AiReply = await api.aiAsk({
        projectId: id,
        prompt,
        nodeId: selected,
        deviceIds: deviceIds.filter(Boolean),
      });
      const latest = await api.load();
      setState((s) => (s ? { ...s, projects: latest.projects } : s));
      if (reply.proposal) setProposal({ projectId: id, nodes: reply.proposal });
      return true;
    } catch (e) {
      report(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function applyProposal() {
    if (!proposal || !state) return;
    try {
      const latest = await api.load();
      const p = latest.projects.find((p) => p.id === proposal.projectId);
      if (!p) throw new Error(L('Projet introuvable', 'Project not found'));
      const rekey = (nodes: ScenarioNode[]): ScenarioNode[] =>
        nodes.map((n) => ({ ...n, id: crypto.randomUUID(), children: rekey(n.children) }));
      await updateProject(p, { nodes: [...p.nodes, ...rekey(proposal.nodes)] });
      setProposal(null);
    } catch (e) {
      report(e);
    }
  }
  const path = project && selected ? nodePath(project.nodes, selected) : [];
  const node = path.at(-1);
  const nodes = project ? flatten(project.nodes) : [];
  if (fatal)
    return (
      <div className="fatal">
        <CircleAlert />
        <h1>Cyberfox</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>Réessayer / Retry</button>
      </div>
    );
  if (!state)
    return (
      <div className="fatal">
        <LoaderCircle className="spin" />
        Cyberfox
      </div>
    );
  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="brand">
          <Fox small />
          <b>cyberfox</b>
          <span className="version">0.1</span>
        </div>
        <div className="title-center">
          {project?.name ?? L('Votre atelier de QA mobile', 'Your mobile QA workspace')}
        </div>
        <div className="title-actions">
          <span className="badge">
            <span className={'dot ' + (ready ? 'green' : '')} />
            {ready
              ? state.settings.provider === 'codex'
                ? 'Codex'
                : 'Copilot'
              : L('IA non connectée', 'AI disconnected')}
          </span>
          <button
            className="icon-button"
            aria-label={L('Paramètres', 'Settings')}
            onClick={() => setSettingsTab('appearance')}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>
      {!isDesktop && (
        <div className="preview-banner">
          <Monitor size={13} />
          {L(
            'Aperçu navigateur · projets stockés localement · IA et appareils disponibles dans Electron',
            'Browser preview · locally stored projects · AI and devices available in Electron',
          )}
        </div>
      )}
      <div className="workspace">
        <aside className="sidebar">
          <div className="project-picker">
            <label className="eyebrow" htmlFor="project-select">
              {L('PROJET COURANT', 'CURRENT PROJECT')}
            </label>
            <div className="picker-row">
              <FolderOpen size={18} />
              <select
                id="project-select"
                value={project?.id ?? ''}
                onChange={(e) => void selectProject(e.target.value)}
              >
                <option value="" disabled>
                  {L('Aucun projet', 'No project')}
                </option>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                className="icon-button bordered"
                aria-label={L('Nouveau projet', 'New project')}
                onClick={() => setNewProject(true)}
              >
                <Plus size={17} />
              </button>
            </div>
            {project && (
              <div className="platform-tags">
                {project.platforms.map((p) => (
                  <span key={p}>
                    {p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Flutter'}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="section-head">
            <span>
              <GitBranch size={14} />
              {L('SCÉNARIOS', 'SCENARIOS')}
            </span>
            <button
              className="icon-button"
              disabled={!project}
              aria-label={L('Ajouter un élément', 'Add item')}
              onClick={() => setNodeDraft({})}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="tree-scroll">
            {!project ? (
              <div className="side-empty">
                <Folder size={27} />
                <b>{L('Aucun projet', 'No project')}</b>
                <p>
                  {L(
                    'Créez un projet pour organiser vos scénarios.',
                    'Create a project to organize your scenarios.',
                  )}
                </p>
              </div>
            ) : !project.nodes.length ? (
              <div className="side-empty">
                <GitBranch size={27} />
                <b>{L('Tout commence ici', 'It starts here')}</b>
                <p>
                  {L(
                    'Ajoutez une navigation, un test, ou décrivez votre parcours à l’IA.',
                    'Add a navigation, a test, or describe your journey to AI.',
                  )}
                </p>
                <button onClick={() => setNodeDraft({})}>
                  <Plus size={14} />
                  {L('Ajouter un élément', 'Add item')}
                </button>
              </div>
            ) : (
              <Tree nodes={project.nodes} selected={selected} onSelect={setSelected} L={L} />
            )}
          </div>
          <button className="new-project-button" onClick={() => setNewProject(true)}>
            <Plus size={16} />
            {L('Nouveau projet', 'New project')}
          </button>
          <div className="sidebar-footer">
            <span>
              <ShieldCheck size={14} />
              {L('Vos tests, votre contrôle', 'Your tests, your control')}
            </span>
            <button
              className="icon-button"
              aria-label={L('Paramètres du projet', 'Project settings')}
              onClick={() => setSettingsTab('projects')}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </aside>
        <main className="center">
          <div className="tabs" role="tablist" aria-label={L('Espace de test', 'Test workspace')}>
            <button
              role="tab"
              aria-selected={(project?.tab ?? 'creation') === 'creation'}
              className={(project?.tab ?? 'creation') === 'creation' ? 'active' : ''}
              onClick={() => void changeTab('creation')}
            >
              <Sparkles size={15} />
              {L('Création', 'Creation')}
            </button>
            <button
              role="tab"
              aria-selected={project?.tab === 'execution'}
              className={project?.tab === 'execution' ? 'active' : ''}
              onClick={() => void changeTab('execution')}
            >
              <Play size={15} />
              {L('Exécution', 'Execution')}
            </button>
            <span className="tab-caption">{L('ATELIER MOBILE', 'MOBILE WORKSPACE')}</span>
          </div>
          <nav className="breadcrumbs" aria-label={L('Chemin du scénario', 'Scenario path')}>
            <button onClick={() => setSelected(undefined)}>
              <FolderOpen size={14} />
              {project?.name ?? L('Espace de travail', 'Workspace')}
            </button>
            {path.map((n) => (
              <span key={n.id}>
                <ChevronRight size={12} />
                <button onClick={() => setSelected(n.id)}>{n.name}</button>
              </span>
            ))}
          </nav>
          <div className="center-content">
            {!ready ? (
              <div className="welcome">
                <span className="overline">
                  <Sparkles size={13} />
                  {L('LA QA, AVEC UN COUP D’AVANCE', 'QA, ONE STEP AHEAD')}
                </span>
                <Fox />
                <h1>
                  {L('Vos parcours.', 'Your journeys.')}
                  <br />
                  <span>{L('Un nouvel instinct.', 'A new instinct.')}</span>
                </h1>
                <p>
                  {L(
                    'Créez, explorez et rejouez vos scénarios mobiles, avec une IA à vos côtés.',
                    'Create, explore and replay mobile scenarios with AI by your side.',
                  )}
                </p>
                <button className="primary hero-button" onClick={() => setSettingsTab('ai')}>
                  <Bot size={17} />
                  {L('Configurer mon IA', 'Configure my AI')}
                  <ArrowRight size={16} />
                </button>
                <span className="subtle">Codex · GitHub Copilot</span>
                <div className="welcome-features">
                  <div>
                    <GitBranch />
                    <b>{L('Des parcours organisés', 'Organized journeys')}</b>
                    <small>
                      {L(
                        'Navigation et assertions, réunies.',
                        'Navigation and assertions, together.',
                      )}
                    </small>
                  </div>
                  <div>
                    <Smartphone />
                    <b>{L('Au plus près du mobile', 'Connected to mobile')}</b>
                    <small>Android · iOS · Flutter</small>
                  </div>
                  <div>
                    <ShieldCheck />
                    <b>{L('Vous gardez la main', 'You stay in control')}</b>
                    <small>
                      {L('Chaque modification est validée.', 'Every change is reviewed.')}
                    </small>
                  </div>
                </div>
              </div>
            ) : !project ? (
              <Empty
                icon={<FolderOpen />}
                title={L('Un projet, vos premiers scénarios', 'One project, your first scenarios')}
                action={
                  <button className="primary" onClick={() => setNewProject(true)}>
                    <Plus size={16} />
                    {L('Créer un nouveau projet', 'Create a new project')}
                  </button>
                }
              >
                {L(
                  'Votre IA est prête. Choisissez les plateformes de votre application pour commencer.',
                  'Your AI is ready. Choose your application platforms to get started.',
                )}
              </Empty>
            ) : project.tab === 'execution' ? (
              <Empty
                icon={<Play />}
                title={L('Prêt pour les prochaines étapes', 'Ready for the next steps')}
              >
                <p>
                  {L(
                    'Vos scénarios sont conservés. Le moteur de rejeu Appium sera connecté dans une prochaine étape.',
                    'Your scenarios are saved. The Appium replay engine will be connected in a next step.',
                  )}
                </p>
                <span className="badge">
                  {nodes.filter((n) => n.kind === 'test').length}{' '}
                  {L('tests préparés', 'tests prepared')}
                </span>
                <p className="note">
                  {L(
                    'Aucun test n’est exécuté ni marqué comme réussi dans cette version.',
                    'No test is run or marked as passed in this version.',
                  )}
                </p>
              </Empty>
            ) : (
              <>
                <div className="creation-heading">
                  <div>
                    <span className="eyebrow">
                      {L('CONSTRUIRE UN PARCOURS', 'BUILD A JOURNEY')}
                    </span>
                    <h1>
                      {node?.name ??
                        L('Que souhaitez-vous tester ?', 'What would you like to test?')}
                    </h1>
                    <p>
                      {node?.description ??
                        L(
                          'Décrivez un objectif. Transformez-le en scénario vérifiable.',
                          'Describe a goal. Turn it into a verifiable scenario.',
                        )}
                    </p>
                  </div>
                  <div className="heading-icon">
                    {node ? (
                      (() => {
                        const Icon = icons[node.kind];
                        return <Icon />;
                      })()
                    ) : (
                      <Sparkles />
                    )}
                  </div>
                </div>
                {node ? (
                  <div className="node-detail">
                    <span className={'kind ' + node.kind}>
                      {
                        {
                          folder: L('Groupe', 'Group'),
                          navigation: L('Navigation', 'Navigation'),
                          test: L('Test', 'Test'),
                          assertion: L('Assertion', 'Assertion'),
                        }[node.kind]
                      }
                    </span>
                    <h3>{L('Critère / description', 'Criterion / description')}</h3>
                    <p>{node.description || L('Aucune description', 'No description')}</p>
                    <button onClick={() => setNodeDraft({ parentId: node.id })}>
                      <Plus size={15} />
                      {L('Ajouter un enfant', 'Add child')}
                    </button>
                  </div>
                ) : (
                  <div className="suggestions">
                    {[
                      [
                        Compass,
                        L('Un parcours de connexion', 'A sign-in journey'),
                        L(
                          'Prépare un scénario de connexion et vérifie que le profil est accessible.',
                          'Prepare a sign-in scenario and verify the profile is accessible.',
                        ),
                      ],
                      [
                        TestTube2,
                        L('Un cas à vérifier', 'A case to verify'),
                        L(
                          'Propose les tests à vérifier sur cet écran, avec leurs résultats attendus.',
                          'Propose tests for this screen, including expected outcomes.',
                        ),
                      ],
                      [
                        ShieldCheck,
                        L('Un regard sur les erreurs', 'A look at failures'),
                        L(
                          'Quels cas d’erreur et quelles assertions prévoir pour cette application ?',
                          'What error cases and assertions should we plan for this app?',
                        ),
                      ],
                    ].map(([Icon, title, prompt]) => {
                      const I = Icon as typeof Compass;
                      return (
                        <button
                          className="suggestion"
                          key={String(title)}
                          disabled={busy}
                          onClick={() => void ask(String(prompt))}
                        >
                          <I size={19} />
                          <span>{String(title)}</span>
                          <ArrowRight size={14} />
                        </button>
                      );
                    })}
                  </div>
                )}
                {project.messages.length > 0 ? (
                  <div className="conversation">
                    {project.messages.map((m) => (
                      <article key={m.id} className={'message ' + m.role}>
                        <div className="message-avatar">
                          {m.role === 'assistant' ? <Bot size={16} /> : <MousePointer2 size={15} />}
                        </div>
                        <div>
                          <b>{m.role === 'assistant' ? 'Cyberfox' : L('Vous', 'You')}</b>
                          <time>
                            {new Date(m.at).toLocaleTimeString(state.settings.language, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          <pre>{m.content}</pre>
                          {m.role === 'assistant' && parseProposal(m.content) && (
                            <button
                              onClick={() =>
                                setProposal({
                                  projectId: project.id,
                                  nodes: parseProposal(m.content)!,
                                })
                              }
                            >
                              <GitBranch size={14} />
                              {L('Examiner la proposition', 'Review proposal')}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="canvas-placeholder">
                    <div className="orbit">
                      <GitBranch size={28} />
                    </div>
                    <b>
                      {L(
                        'Du premier geste au résultat attendu',
                        'From the first tap to the expected result',
                      )}
                    </b>
                    <p>
                      {L(
                        'Votre arbre de scénarios se construit ici.',
                        'Your scenario tree starts here.',
                      )}
                    </p>
                    <span className="badge">
                      <Circle size={9} />
                      {L('Aucune modification automatique', 'No automatic changes')}
                    </span>
                  </div>
                )}
                {busy && (
                  <div className="thinking">
                    <LoaderCircle size={15} className="spin" />
                    {L('L’IA prépare sa réponse…', 'AI is preparing a response…')}
                  </div>
                )}
              </>
            )}
          </div>
          <Prompt
            L={L}
            disabled={!ready || !project || busy}
            busy={busy}
            provider={state.settings.provider}
            hasDevices={deviceIds.some(Boolean)}
            onSubmit={ask}
          />
        </main>
        <aside className="devices-pane">
          <div className="device-header">
            <span>
              <Smartphone size={16} />
              {L('Appareils', 'Devices')}
            </span>
            <div>
              <span className="badge">{deviceIds.filter(Boolean).length}/2</span>
              <button
                className="icon-button"
                aria-label={L('Actualiser les appareils', 'Refresh devices')}
                onClick={() => void refreshDevices()}
                disabled={scanning}
              >
                <RefreshCw size={15} className={scanning ? 'spin' : ''} />
              </button>
            </div>
          </div>
          <div className="device-hint">
            <Usb size={14} />
            {L('USB ou simulateur. À vous de choisir.', 'USB or simulator. Your choice.')}
          </div>
          <div className={'device-slots ' + (deviceIds[1] ? 'dual' : '')}>
            {[0, 1].map((slot) => (
              <DeviceSlot
                key={slot}
                slot={slot}
                id={deviceIds[slot]}
                otherId={deviceIds[1 - slot]}
                devices={scan.devices.filter(
                  (d) =>
                    !!project &&
                    (project.platforms.includes(d.platform) ||
                      (project.platforms.includes('flutter') &&
                        !project.platforms.includes('android') &&
                        !project.platforms.includes('ios'))),
                )}
                disabled={!project}
                onChange={(id) =>
                  setDeviceIds((ids) => ids.map((old, i) => (i === slot ? id : old)))
                }
                L={L}
              />
            ))}
          </div>
          <details className="device-diagnostics">
            <summary>
              <CircleAlert size={13} />
              {L('Aide à la connexion', 'Connection help')}
            </summary>
            <p>
              {L(
                'Android : débogage USB et autorisation sur le téléphone. iOS : Mac, Xcode, mode développeur et WebDriverAgent pour un iPhone physique.',
                'Android: USB debugging and device authorization. iOS: Mac, Xcode, Developer Mode, and WebDriverAgent for a physical iPhone.',
              )}
            </p>
            {scan.diagnostics.map((d) => (
              <p key={d}>{d}</p>
            ))}
          </details>
          <div className="device-footer">
            <span className="dot" />
            {L(
              'Miroir en lecture seule · captures actualisées',
              'Read-only mirror · refreshed screenshots',
            )}
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          <span className="dot green" />
          {L('Espace local', 'Local workspace')}
        </span>
        <span>
          {project
            ? `${nodes.length} ${L('éléments', 'items')}`
            : L('Aucun projet ouvert', 'No open project')}
        </span>
        <span className="status-right">
          {L('Conçu pour explorer. Pensé pour vérifier.', 'Built to explore. Designed to verify.')}
        </span>
        <span>Android / iOS / Flutter</span>
      </footer>
      {error && (
        <div className="toast" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError('')}
            aria-label={L('Fermer', 'Close')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {newProject && (
        <NewProject
          L={L}
          root={state.settings.projectsDirectory}
          onClose={() => setNewProject(false)}
          onCreate={async (input) => {
            const p = await api.projectCreate(input);
            setState((s) =>
              s ? { ...s, projects: [...s.projects, p], activeProjectId: p.id } : s,
            );
            setNewProject(false);
          }}
        />
      )}
      {settingsTab && (
        <SettingsModal
          L={L}
          tab={settingsTab}
          setTab={setSettingsTab}
          settings={state.settings}
          statuses={statuses}
          refreshStatus={refreshStatus}
          onClose={() => setSettingsTab(null)}
          onSave={async (settings) => {
            const saved = await api.settingsSave(settings);
            setState((s) => (s ? { ...s, settings: saved } : s));
          }}
        />
      )}
      {nodeDraft && project && (
        <NodeModal
          L={L}
          onClose={() => setNodeDraft(null)}
          onSave={async (n) => {
            const insert = (list: ScenarioNode[]): ScenarioNode[] =>
              list.map((old) =>
                old.id === nodeDraft.parentId
                  ? { ...old, children: [...old.children, n] }
                  : { ...old, children: insert(old.children) },
              );
            await updateProject(project, {
              nodes: nodeDraft.parentId ? insert(project.nodes) : [...project.nodes, n],
            });
            setSelected(n.id);
            setNodeDraft(null);
          }}
        />
      )}
      {proposal && (
        <Modal
          wide
          title={L('Examiner le scénario proposé', 'Review proposed scenario')}
          onClose={() => setProposal(null)}
        >
          <div className="modal-body">
            <div className="notice">
              <ShieldCheck size={18} />
              {L(
                'Ces éléments seront ajoutés au projet sans modifier les scénarios existants. Aucun test n’a été exécuté.',
                'These items will be added without modifying existing scenarios. No test has been executed.',
              )}
            </div>
            <Tree nodes={proposal.nodes} L={L} onSelect={() => {}} />
            <div className="proposal-details">
              {flatten(proposal.nodes).map((n) => (
                <p key={n.id}>
                  <b>{n.name}</b>
                  <br />
                  {n.description}
                </p>
              ))}
            </div>
          </div>
          <footer>
            <button onClick={() => setProposal(null)}>{L('Plus tard', 'Later')}</button>
            <button className="primary" onClick={() => void applyProposal()}>
              <Check size={16} />
              {L('Ajouter au projet', 'Add to project')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
function Tree({
  nodes,
  selected,
  onSelect,
  L,
  depth = 0,
}: {
  nodes: ScenarioNode[];
  selected?: string;
  onSelect: (id: string) => void;
  L: Translate;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <div className="tree" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((n) => {
        const Icon = icons[n.kind];
        const open = !collapsed.has(n.id);
        return (
          <div key={n.id}>
            <div
              className={'tree-row ' + (selected === n.id ? 'selected' : '')}
              style={{ paddingLeft: 10 + depth * 16 }}
            >
              <button
                className="tree-toggle"
                aria-label={L('Déplier / replier', 'Expand / collapse')}
                disabled={!n.children.length}
                onClick={() =>
                  setCollapsed((old) => {
                    const s = new Set(old);
                    s.has(n.id) ? s.delete(n.id) : s.add(n.id);
                    return s;
                  })
                }
              >
                {n.children.length ? (
                  open ? (
                    <ChevronDown size={12} />
                  ) : (
                    <ChevronRight size={12} />
                  )
                ) : (
                  <span />
                )}
              </button>
              <button
                role="treeitem"
                aria-selected={selected === n.id}
                className="tree-item"
                onClick={() => onSelect(n.id)}
              >
                <Icon size={16} className={n.kind} />
                <span>{n.name}</span>
                {n.children.length > 0 && <small>{n.children.length}</small>}
              </button>
            </div>
            {open && n.children.length > 0 && (
              <Tree
                nodes={n.children}
                selected={selected}
                onSelect={onSelect}
                L={L}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
function Prompt({
  L,
  disabled,
  busy,
  provider,
  hasDevices,
  onSubmit,
}: {
  L: Translate;
  disabled: boolean;
  busy: boolean;
  provider: string;
  hasDevices: boolean;
  onSubmit: (v: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled || !value.trim()) return;
    const prompt = value.trim();
    if (await onSubmit(prompt)) setValue('');
  }
  return (
    <div className="prompt-zone">
      <form className="prompt-box" onSubmit={submit}>
        <textarea
          aria-label={L('Demande à l’IA', 'AI request')}
          placeholder={L(
            'Décrivez le scénario que vous imaginez…',
            'Describe the scenario you have in mind…',
          )}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="prompt-bottom">
          <span>
            <Sparkles size={13} />
            {provider === 'codex' ? 'Codex' : 'GitHub Copilot'}
            <span className="prompt-separator">·</span>
            {L('Proposition de scénario', 'Scenario proposal')}
          </span>
          <button
            className="send-button"
            type="submit"
            disabled={disabled || !value.trim()}
            aria-label={L('Envoyer', 'Send')}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={17} />}
          </button>
        </div>
      </form>
      <small>
        {hasDevices
          ? L(
              'Les captures des appareils sélectionnés seront transmises à votre fournisseur IA.',
              'Screenshots from selected devices will be sent to your AI provider.',
            )
          : L(
              'L’IA propose. Vous validez. Aucun parcours n’est exécuté à votre insu.',
              'AI proposes. You approve. No journey runs without your knowledge.',
            )}
      </small>
    </div>
  );
}
function DeviceSlot({
  slot,
  id,
  otherId,
  devices,
  disabled,
  onChange,
  L,
}: {
  slot: number;
  id: string;
  otherId: string;
  devices: Device[];
  disabled: boolean;
  onChange: (id: string) => void;
  L: Translate;
}) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const device = devices.find((d) => d.id === id);
  const last = useRef('');
  useEffect(() => {
    last.current = id;
    setImage('');
    setError('');
    if (!device || device.status !== 'ready' || paused) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const capture = async () => {
      try {
        const next = await api.screenshot(id);
        if (!disposed && last.current === id) {
          setImage(next);
          setError('');
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      } finally {
        if (!disposed) timer = setTimeout(capture, 1500);
      }
    };
    void capture();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [id, device?.status, paused]);
  return (
    <section className={'device-slot ' + (id ? 'connected' : '')}>
      <div className="device-select">
        <Smartphone size={14} />
        <select
          aria-label={L(`Appareil ${slot + 1}`, `Device ${slot + 1}`)}
          disabled={disabled}
          value={id}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {L(`Sélectionner un appareil ${slot + 1}`, `Select device ${slot + 1}`)}
          </option>
          {devices.map((d) => (
            <option key={d.id} value={d.id} disabled={d.id === otherId}>
              {d.name} · {d.platform === 'ios' ? 'iOS' : 'Android'}
              {d.status !== 'ready' ? ` · ${d.status}` : ''}
            </option>
          ))}
        </select>
        {id && (
          <button
            className="icon-button"
            aria-label={L('Retirer l’appareil', 'Remove device')}
            onClick={() => onChange('')}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {id ? (
        <>
          <div className="mirror-controls">
            <span className="badge">
              <span className={'dot ' + (image && !error ? 'green' : '')} />
              {device?.kind === 'simulator' ? 'Simulator' : 'USB'}
            </span>
            <button className="text-button" onClick={() => setPaused((p) => !p)}>
              {paused ? L('Reprendre', 'Resume') : L('Pause', 'Pause')}
            </button>
          </div>
          <div className="mirror-screen">
            {image && (
              <img alt={L('Miroir de l’écran mobile', 'Mobile screen mirror')} src={image} />
            )}
            <div className="mirror-overlay">
              {error ? (
                <p role="status">
                  <CircleAlert size={18} />
                  {error}
                </p>
              ) : !image ? (
                <LoaderCircle className="spin" />
              ) : null}
            </div>
          </div>
          <small className="device-detail">{device?.detail}</small>
        </>
      ) : (
        <div className="device-empty">
          <div className="phone-outline">
            <div className="phone-notch" />
            <div className="phone-center">
              {slot === 0 ? <Smartphone size={25} /> : <Plus size={24} />}
            </div>
            <div className="phone-home" />
          </div>
          <b>
            {slot === 0
              ? L('Votre application, ici', 'Your app, right here')
              : L('Un deuxième regard', 'A second perspective')}
          </b>
          <p>
            {slot === 0
              ? L(
                  'Branchez un mobile ou démarrez un simulateur.',
                  'Connect a phone or start a simulator.',
                )
              : L('Comparez Android et iOS côte à côte.', 'Compare Android and iOS side by side.')}
          </p>
        </div>
      )}
    </section>
  );
}
function NewProject({
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
function NodeModal({
  L,
  onClose,
  onSave,
}: {
  L: Translate;
  onClose: () => void;
  onSave: (n: ScenarioNode) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<ScenarioNode['kind']>('navigation');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal title={L('Ajouter un élément', 'Add item')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onSave({
              id: crypto.randomUUID(),
              name: name.trim(),
              kind,
              description,
              children: [],
            });
          } catch (e) {
            setError(String(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="modal-body">
          <label>
            {L('Type', 'Type')}
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {Object.keys(icons).map((k) => (
                <option key={k} value={k}>
                  {
                    {
                      folder: L('Groupe', 'Group'),
                      navigation: 'Navigation',
                      test: 'Test',
                      assertion: 'Assertion',
                    }[k as typeof kind]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            {L('Nom', 'Name')}
            <input
              autoFocus
              required
              value={name}
              maxLength={180}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {L('Description et résultat attendu', 'Description and expected result')}
            <textarea
              value={description}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>
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
          <button className="primary" disabled={saving || !name.trim()}>
            <Plus size={15} />
            {L('Ajouter', 'Add')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function SettingsModal({
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
                  'L’IA propose des scénarios à valider. Elle ne peut pas modifier vos tests ni piloter le mobile dans cette première version. Les demandes et les captures sélectionnées sont envoyées au fournisseur choisi.',
                  'AI proposes scenarios for review. It cannot modify your tests or control devices in this first version. Requests and selected screenshots are sent to your chosen provider.',
                )}
              </div>
            </>
          )}
          {tab === 'devices' && (
            <>
              <span className="eyebrow">{L('CONNEXIONS MOBILES', 'MOBILE CONNECTIONS')}</span>
              <h3>{L('Miroir des appareils', 'Device mirroring')}</h3>
              <p className="muted">
                {L(
                  'Android USB et émulateur : ADB. Simulateur iOS : Xcode. iPhone USB : libimobiledevice et WebDriverAgent déjà lancé.',
                  'Android USB and emulator: ADB. iOS Simulator: Xcode. USB iPhone: libimobiledevice and an already running WebDriverAgent.',
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
