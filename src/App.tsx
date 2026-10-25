import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowRight,
  Bot,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  Plus,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api, isDesktop } from './bridge';
import { Fox, Modal, NewProject, SettingsModal } from './ui';
import { ScenarioTree } from './ScenarioTree';
import { NodeEditor, type L } from './NodeEditor';
import { DevicePanel } from './DevicePanel';
import { RunReport } from './RunReport';
import { ProposalDialog } from './ProposalDialog';
import {
  flatten,
  makeNode,
  mapNodes,
  nodePath,
  requiredOS,
  variantSchema,
  type AiReply,
  type Component,
  type DeviceScan,
  type OS,
  type Project,
  type ProjectUpdate,
  type ProviderStatus,
  type RunReport as Report,
  type ScenarioNode,
  type Settings,
  type Workspace,
} from '../shared/model';
const detachedWindow = new URLSearchParams(location.search).get('devices') === '1';
export function App() {
  const [state, setState] = useState<Workspace>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [error, setError] = useState('');
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [statuses, setStatuses] = useState<Partial<Record<Settings['provider'], ProviderStatus>>>(
    {},
  );
  const [scan, setScan] = useState<DeviceScan>({ devices: [], diagnostics: [] });
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef<Promise<void> | null>(null);
  const [paired, setPaired] = useState<Partial<Record<OS, boolean>>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [proposal, setProposal] = useState<{ projectId: string; reply: AiReply } | null>(null);
  const [analysisRequests, setAnalysisRequests] = useState<
    Array<{
      runId: string;
      entryId: string;
      name: string;
    }>
  >([]);
  const analysisPrompt = analysisRequests[0] ?? null;
  const closeAnalysis = () => setAnalysisRequests((old) => old.slice(1));
  const asked = useRef(new Set<string>());
  const [deleteId, setDeleteId] = useState<string>();
  const [resizing, setResizing] = useState(false);
  const [layout, setLayout] = useState({ left: 254, right: 430, chat: 230 });
  const L: L = (fr, en) => (state?.settings.language === 'en' ? en : fr);
  const project = state?.projects.find((p) => p.id === state.activeProjectId);
  const selected = project?.selectedNodeId;
  const node =
    project && selected ? flatten(project.nodes).find((n) => n.id === selected) : undefined;
  const ready = !!statuses[state?.settings.provider ?? 'codex']?.authenticated;
  const notify = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  async function reload() {
    const current = await api.load();
    setState(current);
  }
  async function status(provider: Settings['provider']) {
    const s = await api.providerStatus(provider);
    setStatuses((old) => ({ ...old, [provider]: s }));
    return s;
  }
  const mutationQueue = useRef(Promise.resolve());
  function mutateProject(
    id: string,
    build: (project: Project) => Omit<ProjectUpdate, 'id'>,
  ): Promise<Project> {
    let result: Project;
    const task = mutationQueue.current.then(async () => {
      const latest = await api.load();
      const current = latest.projects.find((p) => p.id === id);
      if (!current) throw new Error('Projet introuvable');
      const patch = build(current);
      result = await api.projectUpdate({
        id,
        ...patch,
        expectedRevision: patch.expectedRevision ?? (patch.nodes ? current.revision : undefined),
      });
      setState((s) =>
        s ? { ...s, projects: s.projects.map((p) => (p.id === result.id ? result : p)) } : s,
      );
    });
    mutationQueue.current = task.catch(() => {});
    return task.then(() => result!);
  }
  function update(input: ProjectUpdate) {
    return mutateProject(input.id, () => input);
  }
  useEffect(() => {
    void reload().catch(notify);
    void refresh();
    return api.onEvent((event) => {
      if (event.type === 'device') {
        const p = stateRef.current?.projects.find(
          (p) => p.id === stateRef.current?.activeProjectId,
        );
        for (const os of ['android', 'ios'] as const)
          if (p?.deviceIds[os] === event.deviceId)
            setPaired((old) => ({ ...old, [os]: event.ready }));
      }
      if (event.type === 'workspace') void reload().catch(notify);
      if (event.type === 'run') {
        const current = stateRef.current;
        if (event.report.projectId === current?.activeProjectId) setReport(event.report);
        if (!detachedWindow && current?.settings.analysisMode === 'ask')
          for (const entry of event.report.entries)
            if (
              entry.status === 'failed' &&
              entry.analysisState === 'pending' &&
              !asked.current.has(entry.id)
            ) {
              asked.current.add(entry.id);
              setAnalysisRequests((old) => [
                ...old,
                { runId: event.report.id, entryId: entry.id, name: entry.nodeName },
              ]);
            }
      }
      if (event.type === 'ai' && event.projectId === stateRef.current?.activeProjectId)
        setAiProgress(event.message);
    });
  }, []);
  useEffect(() => {
    if (!state) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        state.settings.theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : state.settings.theme;
      document.documentElement.lang = state.settings.language;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state?.settings.theme, state?.settings.language]);
  useEffect(() => {
    if (state) void status(state.settings.provider);
  }, [state?.settings.provider]);
  useEffect(() => {
    if (state && !resizing)
      setLayout({
        left: state.settings.leftWidth,
        right: state.settings.rightWidth,
        chat: state.settings.chatHeight,
      });
  }, [state?.settings.leftWidth, state?.settings.rightWidth, state?.settings.chatHeight]);
  useEffect(() => {
    setPaired({});
    setReport(null);
    if (project) void api.runCurrent(project.id).then(setReport).catch(notify);
  }, [project?.id]);
  async function refresh() {
    if (scanningRef.current) return scanningRef.current;
    const task = (async () => {
      setScanning(true);
      try {
        setScan(await api.devicesScan());
      } catch (e) {
        notify(e);
      } finally {
        setScanning(false);
        scanningRef.current = null;
      }
    })();
    scanningRef.current = task;
    return task;
  }
  async function selectProject(id: string) {
    try {
      await mutationQueue.current;
      await api.projectSelect(id);
      await reload();
    } catch (e) {
      notify(e);
    }
  }
  async function add(parentId?: string) {
    if (!project) return;
    const created = makeNode(
      parentId ? 'action' : 'scenario',
      parentId ? L('Nouvelle action', 'New action') : L('Nouveau scénario', 'New scenario'),
      requiredOS(project),
    );
    const insert = (nodes: ScenarioNode[]): ScenarioNode[] =>
      nodes.map((n) =>
        n.id === parentId
          ? { ...n, children: [...n.children, created] }
          : { ...n, children: insert(n.children) },
      );
    try {
      await mutateProject(project.id, (current) => ({
        nodes: parentId ? insert(current.nodes) : [...current.nodes, created],
        selectedNodeId: created.id,
      }));
    } catch (e) {
      notify(e);
    }
  }
  async function patchNode(patch: Partial<ScenarioNode>) {
    const current = stateRef.current?.projects.find(
      (p) => p.id === stateRef.current?.activeProjectId,
    );
    if (!current?.selectedNodeId) return;
    try {
      await mutateProject(current.id, (latest) => ({
        nodes: mapNodes(latest.nodes, (n) =>
          n.id === current.selectedNodeId
            ? { ...n, ...patch }
            : patch.kind && patch.kind !== 'test' && n.preconditionId === current.selectedNodeId
              ? { ...n, preconditionId: null }
              : n,
        ),
      }));
    } catch (e) {
      notify(e);
    }
  }
  async function remove() {
    if (!project || !deleteId) return;
    const ids = new Set(flatten(nodePath(project.nodes, deleteId).slice(-1)).map((n) => n.id));
    const prune = (nodes: ScenarioNode[]): ScenarioNode[] =>
      nodes
        .filter((n) => !ids.has(n.id))
        .map((n) => ({
          ...n,
          preconditionId: n.preconditionId && ids.has(n.preconditionId) ? null : n.preconditionId,
          children: prune(n.children),
        }));
    try {
      await update({ id: project.id, nodes: prune(project.nodes), selectedNodeId: null });
      setDeleteId(undefined);
    } catch (e) {
      notify(e);
    }
  }
  async function selectDevice(os: OS, id: string) {
    if (!project) return;
    try {
      setPaired((old) => ({ ...old, [os]: false }));
      await update({ id: project.id, deviceIds: { ...project.deviceIds, [os]: id } });
    } catch (e) {
      notify(e);
    }
  }
  async function bind(os: OS, component: Component) {
    if (!node || node.kind === 'scenario') {
      setError(
        L(
          'Sélectionnez une action, une navigation ou un test.',
          'Select an action, navigation or test.',
        ),
      );
      return;
    }
    await patchNode({
      variants: {
        ...node.variants,
        [os]: {
          ...variantSchema.parse({ operation: node.kind === 'test' ? 'assert' : 'tap' }),
          ...node.variants[os],
          locator: component.locator,
        },
      },
    });
  }
  async function play(os: OS) {
    if (!node || !project?.deviceIds[os]) return;
    try {
      const variant = node.variants[os];
      if (!variant) throw new Error(L('Élément non configuré', 'Item not configured'));
      await api.perform({ deviceId: project.deviceIds[os]!, variant, kind: node.kind });
    } catch (e) {
      notify(e);
    }
  }
  async function start(nodeId?: string) {
    if (!project) return;
    try {
      const r = await api.runStart({
        projectId: project.id,
        nodeId,
        deviceIds: Object.values(project.deviceIds).filter(Boolean) as string[],
      });
      setReport((old) => (old?.id === r.id && old.finishedAt ? old : r));
      await update({ id: project.id, tab: 'execution' });
    } catch (e) {
      notify(e);
    }
  }
  async function ask(prompt: string) {
    if (!project) return false;
    setBusy(true);
    setAiProgress(L('Exploration des appareils…', 'Exploring devices…'));
    try {
      const reply = await api.aiAsk({
        projectId: project.id,
        prompt,
        nodeId: project.selectedNodeId ?? undefined,
        deviceIds: requiredOS(project)
          .filter((os) => paired[os] && project.deviceIds[os])
          .map((os) => project.deviceIds[os]!),
      });
      await reload();
      if (reply.proposal) setProposal({ projectId: project.id, reply });
      return true;
    } catch (e) {
      notify(e);
      return false;
    } finally {
      setBusy(false);
      setAiProgress('');
    }
  }
  async function detach() {
    try {
      await api.detachDevices(!state!.settings.devicesDetached);
      await reload();
    } catch (e) {
      notify(e);
    }
  }
  function resize(which: 'left' | 'right' | 'chat', event: React.PointerEvent) {
    event.preventDefault();
    const start = event.clientX,
      startY = event.clientY;
    const initial = { ...layout };
    setResizing(true);
    let latest = { ...layout };
    const move = (e: PointerEvent) => {
      latest = {
        ...initial,
        [which]:
          which === 'chat'
            ? Math.max(130, Math.min(innerHeight - 300, initial.chat + startY - e.clientY))
            : which === 'left'
              ? Math.max(190, Math.min(500, initial.left + e.clientX - start))
              : Math.max(
                  290,
                  Math.min(innerWidth - initial.left - 380, initial.right + start - e.clientX),
                ),
      };
      setLayout(latest);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      setResizing(false);
      const s = stateRef.current;
      if (s)
        void api
          .settingsSave({
            ...s.settings,
            leftWidth: latest.left,
            rightWidth: latest.right,
            chatHeight: latest.chat,
          })
          .then((saved) => setState((old) => (old ? { ...old, settings: saved } : old)))
          .catch(notify);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
  }
  if (!state)
    return (
      <div className="fatal">
        <LoaderCircle className="spin" />
        Cyberfox{error && <p role="alert">{error}</p>}
      </div>
    );
  const devicePanel = (
    <DevicePanel
      project={project}
      scan={scan}
      scanning={scanning}
      onRefresh={() => void refresh()}
      onSelect={(os, id) => void selectDevice(os, id)}
      onReady={(os, value) =>
        setPaired((old) => (old[os] === value ? old : { ...old, [os]: value }))
      }
      onBind={(os, c) => void bind(os, c)}
      onPerform={(os) => void play(os)}
      detached={detachedWindow}
      onDetach={() => void detach()}
      L={L}
    />
  );
  const missing = project
    ? requiredOS(project).filter((os) => !project.deviceIds[os] || !paired[os])
    : [];
  return (
    <div className={'app-shell ' + (resizing ? 'resizing' : '')}>
      {!detachedWindow && (
        <header className="titlebar">
          <div className="brand">
            <Fox small />
            <b>cyberfox</b>
            <span className="version">0.2</span>
          </div>
          <div
            className="global-tabs"
            role="tablist"
            aria-label={L('Espace de test', 'Test workspace')}
          >
            {(['creation', 'execution'] as const).map((tab) => (
              <button
                role="tab"
                aria-selected={(project?.tab ?? 'creation') === tab}
                key={tab}
                className={(project?.tab ?? 'creation') === tab ? 'active' : ''}
                onClick={() => project && void update({ id: project.id, tab }).catch(notify)}
              >
                {tab === 'creation' ? <Sparkles size={15} /> : <Play size={15} />}{' '}
                {tab === 'creation' ? L('Création', 'Creation') : L('Exécution', 'Execution')}
              </button>
            ))}
          </div>
          <div className="title-center">
            {project?.name ?? L('Atelier QA mobile', 'Mobile QA workspace')}
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
      )}
      {!isDesktop && (
        <div className="preview-banner">
          {L(
            'Aperçu navigateur · le pilotage USB et l’IA nécessitent Electron',
            'Browser preview · USB automation and AI require Electron',
          )}
        </div>
      )}
      {detachedWindow ? (
        <div className="detached-devices">{devicePanel}</div>
      ) : (
        <div
          className="workspace resizable-workspace"
          style={
            {
              '--left-width': layout.left + 'px',
              '--right-width': state.settings.devicesDetached ? '0px' : layout.right + 'px',
            } as CSSProperties
          }
        >
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
                    <span key={p}>{p === 'ios' ? 'iOS' : p}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="section-head">
              <span>
                <GitBranch size={14} />
                {L('SCÉNARIOS', 'SCENARIOS')}
              </span>
              <div>
                {project?.tab === 'execution' && (
                  <button
                    className="icon-button"
                    aria-label={L('Tout exécuter', 'Run all')}
                    disabled={report?.status === 'running'}
                    onClick={() => void start()}
                  >
                    <Play size={15} />
                  </button>
                )}
                <button
                  className="icon-button"
                  disabled={!project}
                  aria-label={L('Ajouter un scénario', 'Add scenario')}
                  onClick={() => void add()}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="tree-scroll">
              {!project ? (
                <div className="side-empty">
                  <FolderOpen />
                  <b>{L('Aucun projet', 'No project')}</b>
                </div>
              ) : project.nodes.length ? (
                <ScenarioTree
                  nodes={project.nodes}
                  selected={selected}
                  onSelect={(id) =>
                    void update({ id: project.id, selectedNodeId: id }).catch(notify)
                  }
                  onAdd={project.tab === 'creation' ? (id) => void add(id) : undefined}
                  onRun={
                    project.tab === 'execution' && report?.status !== 'running'
                      ? (id) => void start(id)
                      : undefined
                  }
                  report={project.tab === 'execution' ? report : undefined}
                />
              ) : (
                <div className="side-empty">
                  <GitBranch />
                  <b>{L('Aucun scénario', 'No scenarios')}</b>
                  <button onClick={() => void add()}>
                    <Plus size={14} />
                    {L('Créer un scénario', 'Create scenario')}
                  </button>
                </div>
              )}
            </div>
            <button className="new-project-button" onClick={() => setNewProject(true)}>
              <Plus size={15} />
              {L('Nouveau projet', 'New project')}
            </button>
            <div className="sidebar-footer">
              <span>
                <ShieldCheck size={14} />
                {L('Vos tests, votre contrôle', 'Your tests, your control')}
              </span>
              <button className="icon-button" onClick={() => setSettingsTab('projects')}>
                <Settings2 size={15} />
              </button>
            </div>
          </aside>
          <div
            role="separator"
            aria-label={L('Redimensionner les scénarios', 'Resize scenarios')}
            aria-orientation="vertical"
            className="resize-handle vertical"
            onPointerDown={(e) => resize('left', e)}
          />
          <main className="center">
            <nav className="breadcrumbs" aria-label={L('Chemin du scénario', 'Scenario path')}>
              <button
                onClick={() => project && void update({ id: project.id, selectedNodeId: null })}
              >
                <FolderOpen size={14} />
                {project?.name ?? L('Espace de travail', 'Workspace')}
              </button>
              {project &&
                selected &&
                nodePath(project.nodes, selected).map((n) => (
                  <span key={n.id}>
                    <ChevronRight size={12} />
                    <button onClick={() => void update({ id: project.id, selectedNodeId: n.id })}>
                      {n.name}
                    </button>
                  </span>
                ))}
            </nav>
            <div className="center-content">
              {project?.tab === 'creation' && missing.length > 0 && (
                <div className="missing-device-warning" role="alert">
                  <TriangleAlert size={30} />
                  <div>
                    <b>
                      {L('Exploration IA incomplète', 'Incomplete AI exploration')} ·{' '}
                      {missing.map((os) => (os === 'ios' ? 'iOS' : 'Android')).join(' + ')}
                    </b>
                    <p>
                      {L(
                        'L’IA ne pourra pas générer ni valider le scénario de cet OS tant qu’un appareil n’est pas associé et ses composants accessibles. Branchez le mobile, sélectionnez-le à droite puis explorez son écran.',
                        'AI cannot generate or validate this OS scenario until a device is selected and its components are accessible. Connect a phone, select it on the right and inspect its screen.',
                      )}
                    </p>
                  </div>
                </div>
              )}
              {!project ? (
                <div className="welcome">
                  <span className="overline">
                    <Sparkles size={13} />
                    QA MOBILE
                  </span>
                  <Fox />
                  <h1>
                    {L('Vos parcours.', 'Your journeys.')}
                    <br />
                    <span>{L('Un nouvel instinct.', 'A new instinct.')}</span>
                  </h1>
                  <p>
                    {L(
                      'Explorez les composants. Construisez vos scénarios. Vérifiez chaque OS.',
                      'Explore components. Build scenarios. Verify each OS.',
                    )}
                  </p>
                  {ready ? (
                    <button className="primary" onClick={() => setNewProject(true)}>
                      <Plus size={16} />
                      {L('Créer un nouveau projet', 'Create a new project')}
                    </button>
                  ) : (
                    <button className="primary" onClick={() => setSettingsTab('ai')}>
                      <Bot size={16} />
                      {L('Configurer mon IA', 'Configure my AI')}
                    </button>
                  )}
                </div>
              ) : project.tab === 'execution' ? (
                <RunReport
                  report={report}
                  L={L}
                  onStart={() => void start()}
                  onCancel={() => void api.runCancel()}
                  onError={notify}
                />
              ) : node ? (
                <NodeEditor
                  node={node}
                  project={project}
                  onChange={patchNode}
                  onDelete={() => setDeleteId(node.id)}
                  onPlay={(os) => void play(os)}
                  L={L}
                />
              ) : (
                <div className="creation-heading">
                  <div>
                    <span className="eyebrow">
                      {L('CONSTRUIRE UN PARCOURS', 'BUILD A JOURNEY')}
                    </span>
                    <h1>{L('Que souhaitez-vous tester ?', 'What would you like to test?')}</h1>
                    <p>
                      {L(
                        'Créez un scénario ou demandez à l’IA d’explorer les appareils connectés.',
                        'Create a scenario or ask AI to explore connected devices.',
                      )}
                    </p>
                    <button onClick={() => void add()}>
                      <Plus size={16} />
                      {L('Ajouter un scénario', 'Add scenario')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div
              role="separator"
              aria-label={L('Redimensionner le chat', 'Resize chat')}
              aria-orientation="horizontal"
              className="resize-handle horizontal"
              onPointerDown={(e) => resize('chat', e)}
            />
            <section className="chat-panel" style={{ height: layout.chat }}>
              <div className="chat-history">
                {project?.messages.map((m) => (
                  <article key={m.id} className={'message ' + m.role}>
                    <b>{m.role === 'assistant' ? 'Cyberfox' : L('Vous', 'You')}</b>
                    <p>{m.content}</p>
                  </article>
                ))}
                {aiProgress && (
                  <div className="thinking">
                    <LoaderCircle size={14} className="spin" />
                    {aiProgress}
                  </div>
                )}
              </div>
              {!ready && project && (
                <button className="configure-ai-inline" onClick={() => setSettingsTab('ai')}>
                  <Bot size={15} />
                  {L(
                    'Configurer l’IA pour explorer et générer vos tests',
                    'Configure AI to explore and generate tests',
                  )}
                </button>
              )}
              <Prompt
                L={L}
                disabled={
                  !project ||
                  !ready ||
                  busy ||
                  missing.length === requiredOS(project ?? { platforms: ['android'] }).length
                }
                busy={busy}
                onSubmit={ask}
                onCancel={() => project && void api.aiCancel(project.id)}
              />
            </section>
          </main>
          {!state.settings.devicesDetached && (
            <>
              <div
                role="separator"
                aria-label={L('Redimensionner les appareils', 'Resize devices')}
                aria-orientation="vertical"
                className="resize-handle vertical"
                onPointerDown={(e) => resize('right', e)}
              />
              {devicePanel}
            </>
          )}
        </div>
      )}
      {!detachedWindow && (
        <footer className="statusbar">
          <span>
            <span className="dot green" />
            {L('Espace local', 'Local workspace')}
          </span>
          <span>
            {project
              ? flatten(project.nodes).length + ' ' + L('éléments', 'items')
              : L('Aucun projet ouvert', 'No open project')}
          </span>
          <span className="status-right">
            {L(
              'Exploration par composants · Android / iOS',
              'Component-based exploration · Android / iOS',
            )}
          </span>
          {state.settings.devicesDetached && (
            <button className="text-button" onClick={() => void detach()}>
              <ExternalLink size={12} />
              {L('Réintégrer les appareils', 'Dock devices')}
            </button>
          )}
        </footer>
      )}
      {error && (
        <div className="toast" role="alert">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label={L('Fermer', 'Close')}
            onClick={() => setError('')}
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
            await api.projectCreate(input);
            await reload();
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
          refreshStatus={status}
          onClose={() => setSettingsTab(null)}
          onSave={async (settings) => {
            await api.settingsSave(settings);
            await reload();
          }}
        />
      )}
      {proposal &&
        (() => {
          const p = state.projects.find((p) => p.id === proposal.projectId);
          return p ? (
            <ProposalDialog
              project={p}
              reply={proposal.reply}
              L={L}
              onClose={() => setProposal(null)}
              onAccept={async (nodes) => {
                await update({ id: p.id, nodes, expectedRevision: proposal.reply.baseRevision });
                setProposal(null);
              }}
            />
          ) : null;
        })()}
      {deleteId && (
        <Modal
          title={L('Supprimer cet élément ?', 'Delete this item?')}
          onClose={() => setDeleteId(undefined)}
        >
          <div className="modal-body">
            <p>
              {L(
                'L’élément et ses enfants seront supprimés du projet. Les rapports existants sont conservés.',
                'This item and its children will be deleted. Existing reports are preserved.',
              )}
            </p>
          </div>
          <footer>
            <button onClick={() => setDeleteId(undefined)}>{L('Annuler', 'Cancel')}</button>
            <button className="danger-button" onClick={() => void remove()}>
              {L('Supprimer', 'Delete')}
            </button>
          </footer>
        </Modal>
      )}
      {analysisPrompt && (
        <Modal
          title={L('Analyser cet échec ?', 'Analyze this failure?')}
          onClose={() => closeAnalysis()}
        >
          <div className="modal-body">
            <h3>{analysisPrompt.name}</h3>
            <p>
              {L(
                'L’IA examinera le test et les traces de l’échec. Les autres tests continuent. Aucune modification ne sera appliquée.',
                'AI will examine the test and failure traces. Other tests continue. No changes will be applied.',
              )}
            </p>
          </div>
          <footer>
            <button onClick={() => closeAnalysis()}>
              {L('Continuer sans analyse', 'Continue without analysis')}
            </button>
            <button
              className="primary"
              onClick={() => {
                void api.analyze(analysisPrompt).catch(notify);
                closeAnalysis();
              }}
            >
              <Bot size={15} />
              {L('Analyser', 'Analyze')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
function Prompt({
  L,
  disabled,
  busy,
  onSubmit,
  onCancel,
}: {
  L: L;
  disabled: boolean;
  busy: boolean;
  onSubmit: (prompt: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!disabled && value.trim() && (await onSubmit(value.trim()))) setValue('');
  }
  return (
    <form className="exploration-prompt" onSubmit={submit}>
      <textarea
        aria-label={L('Demande à l’IA', 'AI request')}
        disabled={busy}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={L(
          'Décrivez un parcours à explorer sur les appareils…',
          'Describe a journey to explore on devices…',
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div>
        <small>
          <Sparkles size={12} />
          {L('Explorer · générer · valider', 'Explore · generate · approve')}
        </small>
        {busy ? (
          <button type="button" onClick={onCancel}>
            <Square size={14} />
            {L('Arrêter', 'Stop')}
          </button>
        ) : (
          <button
            type="submit"
            className="primary"
            disabled={disabled || !value.trim()}
            aria-label={L('Envoyer', 'Send')}
          >
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
