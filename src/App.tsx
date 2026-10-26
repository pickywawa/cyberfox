import { sessionTitle } from '../shared/session-title';
import { TokenUsage } from './TokenUsage';
import { useCampaigns } from './useCampaigns';
import { CampaignPanel } from './CampaignPanel';
import { ReplayTimeline } from './ReplayTimeline';
import { campaignFrames } from '../shared/campaigns';
import type { ReplayFrame } from '../shared/model';
import { PlatformIcon } from './PlatformIcon';
import { CentralPanel } from './CentralPanel';
import { ContentWidthSelect } from './ContentWidthSelect';
import { SpeechDictation } from './SpeechDictation';
import { VariablesPanel } from './VariablesPanel';
import { selectUsbDevices } from '../shared/device-selection';
import { useUpdateStatus, UpdateProgress } from './UpdatePanel';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeftToLine,
  ArrowUp,
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
  Variable,
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
const aiWindow = new URLSearchParams(location.search).get('ai') === '1';
const detachedWindow = new URLSearchParams(location.search).get('devices') === '1';
export function App() {
  const updateStatus = useUpdateStatus();
  const [state, setState] = useState<Workspace>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [error, setError] = useState('');
  const [aiQuestion, setAiQuestion] = useState<{
    projectId: string;
    questionId: string;
    question: string;
    variableName?: string;
  } | null>(null);
  const [aiAnswer, setAiAnswer] = useState('');
  const [editProject, setEditProject] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [variablesProjectId, setVariablesProjectId] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [statuses, setStatuses] = useState<Partial<Record<Settings['provider'], ProviderStatus>>>(
    {},
  );
  const [scan, setScan] = useState<DeviceScan>({ devices: [], diagnostics: [] });
  const [scanning, setScanning] = useState(false);
  const autoSelecting = useRef(false);
  const manualDisconnect = useRef(new Map<string, Set<OS>>());
  const usbSignature = useRef('');
  const scanningRef = useRef<Promise<void> | null>(null);
  const [paired, setPaired] = useState<Partial<Record<OS, boolean>>>({});
  const [rerunPrompt, setRerunPrompt] = useState<{ projectId: string; campaignId: string } | null>(
    null,
  );
  const [startingRun, setStartingRun] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [replayFrame, setReplayFrame] = useState<ReplayFrame | null>(null);
  const [viewReportId, setViewReportId] = useState<string | null>(null);
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
  const campaignState = useCampaigns(project, report, (error) => notify(error));
  const campaignDetail = campaignState.detail;
  const frames = campaignFrames(campaignDetail);
  const viewedReport =
    campaignDetail?.reports.find((report) => report.id === viewReportId) ??
    campaignDetail?.reports.at(-1) ??
    null;
  const campaignRunning =
    report?.status === 'running' ||
    !!campaignDetail?.reports.some((report) => report.status === 'running');
  const canRunCampaign =
    !!campaignDetail &&
    campaignDetail.campaign.status === 'open' &&
    !campaignRunning &&
    !!project?.nodes.length;
  const progressEntries = new Map<string, import('../shared/model').RunEntry>();
  for (const report of campaignDetail?.reports ?? [])
    for (const entry of report.entries)
      if (!entry.precondition) progressEntries.set(entry.nodeId + ':' + entry.platform, entry);
  const campaignProgress = viewReportId
    ? viewedReport
    : viewedReport
      ? { ...viewedReport, entries: [...progressEntries.values()] }
      : null;
  const treeNodes =
    project?.tab === 'execution' && viewReportId && viewedReport?.snapshot.length
      ? viewedReport.snapshot
      : (project?.nodes ?? []);
  function selectReplay(frame: ReplayFrame | null) {
    setReplayFrame(frame);
    setViewReportId(frame?.runId ?? null);
    if (project) void api.replaySelect?.({ projectId: project.id, frame }).catch(notify);
  }
  useEffect(() => {
    setReplayFrame(null);
    setViewReportId(null);
    if (detachedWindow && project && api.replayCurrent)
      void api.replayCurrent(project.id).then(setReplayFrame).catch(notify);
  }, [project?.id, project?.activeCampaignId]);
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
  useEffect(
    () =>
      api.onLogin((event) => {
        if (!event.running) void status(event.provider);
      }),
    [],
  );
  const aiSettingsQueue = useRef(Promise.resolve());
  function updateAiSettings(
    patch: Partial<
      Pick<Settings, 'codexModel' | 'copilotModel' | 'reasoningEffort' | 'explorationMode'>
    >,
  ) {
    aiSettingsQueue.current = aiSettingsQueue.current
      .then(async () => {
        const latest = await api.load();
        await api.settingsSave({ ...latest.settings, ...patch });
        await reload();
      })
      .catch(notify);
  }
  useEffect(() => api.onNewProject?.(() => setNewProject(true)), []);
  useEffect(() => api.onEditProject?.(() => setEditProject(true)), []);
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
    void refresh(true);
    const timer = setInterval(() => void refresh(true), 5000);
    const unsubscribe = api.onEvent((event) => {
      if (event.type === 'device') {
        const p = stateRef.current?.projects.find(
          (p) => p.id === stateRef.current?.activeProjectId,
        );
        for (const os of ['android', 'ios'] as const)
          if (p?.deviceIds[os] === event.deviceId)
            setPaired((old) => (old[os] === event.ready ? old : { ...old, [os]: event.ready }));
      }
      if (event.type === 'replay' && event.projectId === stateRef.current?.activeProjectId) {
        setReplayFrame(event.frame);
        setViewReportId(event.frame?.runId ?? null);
      }
      if (event.type === 'workspace') void reload().catch(notify);
      if (event.type === 'run') {
        const current = stateRef.current;
        if (event.report.projectId === current?.activeProjectId) setReport(event.report);
        if (!detachedWindow && !aiWindow && current?.settings.analysisMode === 'ask')
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
      if (event.type === 'ai-question') {
        setAiQuestion(event);
        setAiAnswer('');
      }
      if (event.type === 'ai' && !event.message)
        setAiQuestion((q) => (q?.projectId === event.projectId ? null : q));
      if (event.type === 'ai' && event.projectId === stateRef.current?.activeProjectId)
        setAiProgress(event.message);
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
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
  useEffect(() => {
    if (!project || detachedWindow || aiWindow || autoSelecting.current) return;
    const skip = manualDisconnect.current.get(project.id);
    const ids = selectUsbDevices(project, scan.devices, skip);
    if (JSON.stringify(ids) === JSON.stringify(project.deviceIds)) return;
    autoSelecting.current = true;
    void mutateProject(project.id, (current) => ({
      deviceIds: selectUsbDevices(current, scan.devices, skip),
    }))
      .catch(notify)
      .finally(() => {
        autoSelecting.current = false;
      });
  }, [project?.id, JSON.stringify(project?.deviceIds), scan.devices]);
  async function refresh(silent = false) {
    if (scanningRef.current) return scanningRef.current;
    const task = (async () => {
      if (!silent) setScanning(true);
      try {
        const result = await api.devicesScan();
        const signature = result.devices
          .filter((d) => d.kind === 'usb' && d.status === 'ready')
          .map((d) => d.id)
          .sort()
          .join('|');
        if (signature !== usbSignature.current) {
          manualDisconnect.current.clear();
          usbSignature.current = signature;
        }
        setScan((previous) => {
          const devices =
            JSON.stringify([...previous.devices].sort((a, b) => a.id.localeCompare(b.id))) ===
            JSON.stringify([...result.devices].sort((a, b) => a.id.localeCompare(b.id)))
              ? previous.devices
              : result.devices;
          const diagnostics =
            JSON.stringify(previous.diagnostics) === JSON.stringify(result.diagnostics)
              ? previous.diagnostics
              : result.diagnostics;
          return devices === previous.devices && diagnostics === previous.diagnostics
            ? previous
            : { devices, diagnostics };
        });
      } catch (e) {
        if (!silent) notify(e);
      } finally {
        if (!silent) setScanning(false);
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
    const sharedScreenId = flatten(current.nodes).find((node) => node.id === current.selectedNodeId)
      ?.screen?.id;
    try {
      await mutateProject(current.id, (latest) => ({
        nodes: mapNodes(latest.nodes, (n) =>
          n.id === current.selectedNodeId
            ? { ...n, ...patch }
            : patch.screen && sharedScreenId && n.screen?.id === sharedScreenId
              ? { ...n, screen: patch.screen }
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
    if ((project.deviceIds[os] ?? '') === id) return;
    try {
      const skip = manualDisconnect.current.get(project.id) ?? new Set<OS>();
      if (id) skip.delete(os);
      else skip.add(os);
      manualDisconnect.current.set(project.id, skip);
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
    if (project.tab === 'execution') {
      await start(node.id, os);
      return;
    }
    try {
      const variant = node.variants[os];
      if (!variant) throw new Error(L('Élément non configuré', 'Item not configured'));
      await api.perform({
        deviceId: project.deviceIds[os]!,
        variant,
        kind: node.kind,
        projectId: project.id,
      });
    } catch (e) {
      notify(e);
    }
  }
  async function start(nodeId?: string, os?: OS, resetCampaign?: boolean) {
    if (startingRun) return;
    if (!project) return;
    if (!canRunCampaign) {
      notify(
        L(
          'Créez ou ouvrez une campagne de test avant de lancer.',
          'Create or open a test campaign before running.',
        ),
      );
      return;
    }
    if (!nodeId && resetCampaign === undefined && campaignDetail?.reports.length) {
      setRerunPrompt({ projectId: project.id, campaignId: campaignDetail.campaign.id });
      return;
    }
    setRerunPrompt(null);
    setStartingRun(true);
    try {
      if (resetCampaign) {
        selectReplay(null);
        setReport(null);
      }
      setViewReportId(null);
      const r = await api.runStart({
        resetCampaign,
        projectId: project.id,
        campaignId: project.activeCampaignId ?? undefined,
        platform: os,
        nodeId,
        deviceIds: os
          ? [project.deviceIds[os]!].filter(Boolean)
          : (Object.values(project.deviceIds).filter(Boolean) as string[]),
      });
      setReport((old) => (old?.id === r.id && old.finishedAt ? old : r));
      await update({ id: project.id, tab: 'execution' });
      await campaignState.refresh();
    } catch (e) {
      notify(e);
      await campaignState.refresh().catch(notify);
    } finally {
      setStartingRun(false);
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
        sessionId: project.activeChatSessionId ?? undefined,
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
      void status(state!.settings.provider);
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
  async function detachAi() {
    try {
      await api.detachAi(!state!.settings.aiDetached);
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
      replay={project?.tab === 'execution' ? replayFrame : null}
      historyFrames={frames}
      onLive={() => selectReplay(null)}
      onBindScreen={
        node?.kind === 'navigation'
          ? (os, component) => {
              if (!component.locator) return;
              const screen = node.screen ?? {
                id: 'screen-' + node.id,
                name: node.name,
                variants: {},
              };
              const markers = screen.variants[os]?.markers ?? [];
              if (
                !markers.some(
                  (marker) => JSON.stringify(marker) === JSON.stringify(component.locator),
                )
              )
                void patchNode({
                  screen: {
                    ...screen,
                    variants: {
                      ...screen.variants,
                      [os]: { markers: [...markers, component.locator] },
                    },
                  },
                });
            }
          : undefined
      }
      onSettings={() => setSettingsTab('devices')}
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
  const projectApplicationName = project
    ? requiredOS(project)
        .map((os) => {
          const id = project.applications?.[os];
          return id && project.applicationDetails?.[os]?.id === id
            ? project.applicationDetails[os]?.name
            : undefined;
        })
        .find(Boolean) ||
      requiredOS(project)
        .map((os) => project.applications?.[os])
        .find(Boolean)
    : undefined;
  const chatMessages =
    project?.messages.filter(
      (message) =>
        !project.activeChatSessionId ||
        message.sessionId === project.activeChatSessionId ||
        (!message.sessionId && project.chatSessions?.[0]?.id === project.activeChatSessionId),
    ) ?? [];
  const chatControls = (
    <div className="chat-ai-identity chat-ai-controls">
      <span className={'dot ' + (ready ? 'green' : '')} />
      <b>{state.settings.provider === 'codex' ? 'Codex' : 'GitHub Copilot'}</b>
      <ContentWidthSelect
        aria-label={L('Modèle IA du chat', 'Chat AI model')}
        disabled={busy}
        value={
          state.settings.provider === 'codex'
            ? state.settings.codexModel
            : state.settings.copilotModel
        }
        onChange={(e) =>
          updateAiSettings({
            [state.settings.provider === 'codex' ? 'codexModel' : 'copilotModel']: e.target.value,
          })
        }
      >
        <option value="">{L('Modèle par défaut', 'Default model')}</option>
        {(state.settings.provider === 'codex'
          ? state.settings.codexModel
          : state.settings.copilotModel) &&
          !statuses[state.settings.provider]?.models.some(
            (m) =>
              m.id ===
              (state.settings.provider === 'codex'
                ? state.settings.codexModel
                : state.settings.copilotModel),
          ) && (
            <option
              value={
                state.settings.provider === 'codex'
                  ? state.settings.codexModel
                  : state.settings.copilotModel
              }
            >
              {state.settings.provider === 'codex'
                ? state.settings.codexModel
                : state.settings.copilotModel}
            </option>
          )}
        {statuses[state.settings.provider]?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </ContentWidthSelect>
      <ContentWidthSelect
        aria-label={L('Effort IA du chat', 'Chat AI effort')}
        disabled={busy}
        value={state.settings.reasoningEffort ?? 'default'}
        onChange={(e) =>
          updateAiSettings({
            reasoningEffort: e.target.value as Settings['reasoningEffort'],
          })
        }
      >
        <option value="default">{L('Effort par défaut', 'Default effort')}</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </ContentWidthSelect>
      <ContentWidthSelect
        aria-label={L('Mode d’exploration', 'Exploration mode')}
        disabled={busy}
        value={state.settings.explorationMode}
        onChange={(e) =>
          updateAiSettings({ explorationMode: e.target.value as Settings['explorationMode'] })
        }
        title={L(
          'Auto-approve : crée les variables fournies et poursuit sans popup.',
          'Auto-approve: saves supplied variables and continues without popups.',
        )}
      >
        <option value="interactive">{L('Interactif', 'Interactive')}</option>
        <option value="auto-approve">Auto-approve</option>
      </ContentWidthSelect>
      <TokenUsage status={statuses[state.settings.provider]} L={L} />
      {project && (
        <div className="chat-session-bar">
          <ContentWidthSelect
            aria-label={L('Session IA', 'AI session')}
            disabled={busy}
            value={project.activeChatSessionId ?? project.chatSessions?.[0]?.id ?? ''}
            onChange={(e) =>
              void update({
                id: project.id,
                activeChatSessionId: e.target.value,
              }).catch(notify)
            }
          >
            {(project.chatSessions ?? []).map((session) => (
              <option key={session.id} value={session.id}>
                {/^Session \d+$/.test(session.name) ? session.name : sessionTitle(session.name)}
              </option>
            ))}
          </ContentWidthSelect>
          <button
            type="button"
            className="icon-button"
            aria-label={L('Nouvelle session IA', 'New AI session')}
            title={L('Nouvelle session IA', 'New AI session')}
            disabled={busy}
            onClick={() =>
              void mutateProject(project.id, (latest) => {
                const session = {
                  id: crypto.randomUUID(),
                  name: 'Session ' + ((latest.chatSessions?.length ?? 0) + 1),
                  createdAt: new Date().toISOString(),
                };
                return {
                  chatSessions: [...(latest.chatSessions ?? []), session],
                  activeChatSessionId: session.id,
                };
              }).catch(notify)
            }
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
  const chatPanel = (
    <section
      className="chat-panel"
      style={aiWindow || state.settings.devicesDetached ? undefined : { height: layout.chat }}
    >
      <div className="device-header chat-header">
        <span>
          <Sparkles size={16} />
          {L('Génération assistée par IA', 'AI-assisted generation')}
        </span>
        <button
          className="icon-button panel-detach-button"
          aria-label={
            aiWindow
              ? L('Réintégrer le panneau IA', 'Dock AI panel')
              : L('Externaliser le panneau IA', 'Detach AI panel')
          }
          title={
            aiWindow
              ? L('Réintégrer le panneau IA', 'Dock AI panel')
              : L('Externaliser le panneau IA', 'Detach AI panel')
          }
          onClick={() => void detachAi()}
        >
          {aiWindow ? <ArrowLeftToLine size={16} /> : <ExternalLink size={16} />}
        </button>
      </div>
      <div className="chat-history">
        {chatMessages.map((m) => (
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
        key={(project?.id ?? 'none') + ':' + (project?.activeChatSessionId ?? 'default')}
        L={L}
        disabled={
          !project ||
          !ready ||
          busy ||
          missing.length === requiredOS(project ?? { platforms: ['android'] }).length
        }
        busy={busy}
        controls={chatControls}
        language={state.settings.language}
        onSpeechError={notify}
        onSubmit={ask}
        onCancel={() => project && void api.aiCancel(project.id)}
      />
      {project?.tab === 'creation' && missing.length > 0 && (
        <div className="missing-device-warning prompt-device-warning" role="alert">
          <TriangleAlert size={14} />
          <span>
            {L('Exploration IA incomplète : ', 'Incomplete AI exploration: ')}
            {missing.map((os) => (os === 'ios' ? 'iOS' : 'Android')).join(' + ')}
            {L(
              ' non prêt. Connectez un appareil pour générer ses tests.',
              ' not ready. Connect a device to generate its tests.',
            )}
          </span>
        </div>
      )}
    </section>
  );
  const showChat = !project || project.tab === 'creation';
  return (
    <div className={'app-shell ' + (resizing ? 'resizing' : '')}>
      {!detachedWindow && !aiWindow && (
        <header className="titlebar">
          <div className="brand">
            <Fox small />
            <b>cyberfox</b>
            <span className="version">{__APP_VERSION__}</span>
          </div>
          {!isDesktop && (
            <details className="preview-file-menu">
              <summary>{L('Fichier', 'File')}</summary>
              <div className="file-menu-items">
                <button
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    setNewProject(true);
                  }}
                >
                  {L('Nouveau projet…', 'New project…')}
                </button>
                <button
                  disabled={!project}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    setEditProject(true);
                  }}
                >
                  {L('Modifier le projet courant…', 'Edit current project…')}
                </button>
              </div>
            </details>
          )}
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
            {['available', 'ready', 'downloading'].includes(updateStatus.state) && (
              <button className="new-update-button" onClick={() => setSettingsTab('updates')}>
                {updateStatus.state === 'downloading'
                  ? `${updateStatus.percent}%`
                  : updateStatus.state === 'ready'
                    ? L('Installer', 'Install')
                    : L('Nouveau', 'New')}{' '}
                {updateStatus.version}
              </button>
            )}

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
              aria-label={L('Variables', 'Variables')}
              title={L('Variables du projet', 'Project variables')}
              disabled={!project}
              onClick={() => project && setVariablesProjectId(project.id)}
            >
              <Variable size={17} />
            </button>
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
      {updateStatus.state === 'downloading' && !detachedWindow && !aiWindow && (
        <div className="update-download-banner">
          <UpdateProgress status={updateStatus} L={L} />
        </div>
      )}
      {!isDesktop && (
        <div className="preview-banner">
          {L(
            'Aperçu navigateur · le pilotage USB et l’IA nécessitent Electron',
            'Browser preview · USB automation and AI require Electron',
          )}
        </div>
      )}
      {aiWindow ? (
        <div className="detached-ai">{chatPanel}</div>
      ) : detachedWindow ? (
        <div className="detached-devices">{devicePanel}</div>
      ) : (
        <div
          className={
            'workspace resizable-workspace' +
            (state.settings.devicesDetached && !state.settings.aiDetached && showChat
              ? ' chat-on-right'
              : '')
          }
          style={
            {
              '--left-width': layout.left + 'px',
              '--right-width': layout.right + 'px',
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
                {!project && (
                  <button
                    className="icon-button bordered"
                    aria-label={L('Nouveau projet', 'New project')}
                    onClick={() => setNewProject(true)}
                  >
                    <Plus size={17} />
                  </button>
                )}
              </div>
              {project && (
                <div
                  className="project-app-summary"
                  aria-label={L('Applications du projet', 'Project applications')}
                  title={projectApplicationName}
                >
                  {requiredOS(project).map((os) => (
                    <PlatformIcon key={os} platform={os} size={12} />
                  ))}
                  <span className="project-app-name">
                    {projectApplicationName ||
                      L('Application à configurer', 'Choose an application')}
                  </span>
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
                    disabled={!canRunCampaign || startingRun}
                    onClick={() => void start()}
                  >
                    <Play size={15} />
                  </button>
                )}
                {project?.tab !== 'execution' && (
                  <button
                    className="icon-button"
                    disabled={!project}
                    aria-label={L('Ajouter un scénario', 'Add scenario')}
                    onClick={() => void add()}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="tree-and-replay">
              <div className="tree-scroll">
                {!project ? (
                  <div className="side-empty">
                    <FolderOpen />
                    <b>{L('Aucun projet', 'No project')}</b>
                  </div>
                ) : project.nodes.length ? (
                  <ScenarioTree
                    nodes={project.nodes}
                    selected={
                      project.tab === 'execution' && replayFrame
                        ? replayFrame.entry.nodeId
                        : selected
                    }
                    onSelect={(id) => {
                      void update({ id: project.id, selectedNodeId: id }).catch(notify);
                      if (project.tab === 'execution') {
                        const frame = [...frames]
                          .reverse()
                          .find((frame) => frame.entry.nodeId === id);
                        if (frame) selectReplay(frame);
                      }
                    }}
                    onAdd={project.tab === 'creation' ? (id) => void add(id) : undefined}
                    onRun={
                      project.tab === 'execution' && canRunCampaign && !viewReportId
                        ? (id) => void start(id)
                        : undefined
                    }
                    report={project.tab === 'execution' ? campaignProgress : undefined}
                  />
                ) : (
                  <div className="side-empty">
                    <GitBranch />
                    <b>{L('Aucun scénario', 'No scenarios')}</b>
                    {project.tab === 'creation' && (
                      <button onClick={() => void add()}>
                        <Plus size={14} />
                        {L('Créer un scénario', 'Create scenario')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {project?.tab === 'execution' && (
                <ReplayTimeline
                  frames={frames}
                  selected={replayFrame}
                  onSelect={selectReplay}
                  L={L}
                />
              )}
            </div>
            {!project && (
              <button className="new-project-button" onClick={() => setNewProject(true)}>
                <Plus size={15} />
                {L('Nouveau projet', 'New project')}
              </button>
            )}
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
          <CentralPanel>
            <nav className="breadcrumbs" aria-label={L('Chemin du scénario', 'Scenario path')}>
              <button
                onClick={() => project && void update({ id: project.id, selectedNodeId: null })}
              >
                <FolderOpen size={14} />
                {project?.name ?? L('Espace de travail', 'Workspace')}
              </button>
              {project?.tab === 'execution' && (
                <span>
                  <ChevronRight size={12} />
                  <button onClick={() => selectReplay(null)}>
                    {campaignDetail?.campaign.label ?? L('Campagnes de test', 'Test campaigns')}
                  </button>
                </span>
              )}
              {project &&
                project.tab !== 'execution' &&
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
                <CampaignPanel
                  project={project}
                  campaigns={campaignState.campaigns}
                  detail={campaignDetail}
                  report={viewedReport}
                  selectedFrame={replayFrame}
                  running={campaignRunning}
                  L={L}
                  onCampaignSelect={async (id) => {
                    await update({ id: project.id, activeCampaignId: id || null });
                    selectReplay(null);
                  }}
                  onRefresh={async () => {
                    await campaignState.refresh();
                    selectReplay(null);
                    setViewReportId(null);
                  }}
                  onStart={() => void start()}
                  onCancel={() => void api.runCancel()}
                  onReportSelect={(id) => {
                    const frame = [...frames].reverse().find((frame) => frame.runId === id);
                    if (frame) selectReplay(frame);
                    else {
                      setReplayFrame(null);
                      setViewReportId(id);
                      void api.replaySelect?.({ projectId: project.id, frame: null }).catch(notify);
                    }
                  }}
                  onFrame={(frame) => {
                    selectReplay(frame.entry.completedAt ? frame : null);
                    void update({ id: project.id, selectedNodeId: frame.entry.nodeId }).catch(
                      notify,
                    );
                  }}
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
            {showChat && !state.settings.aiDetached && !state.settings.devicesDetached && (
              <>
                <div
                  role="separator"
                  aria-label={L('Redimensionner le chat', 'Resize chat')}
                  aria-orientation="horizontal"
                  className="resize-handle horizontal"
                  onPointerDown={(e) => resize('chat', e)}
                />
                {chatPanel}
              </>
            )}
          </CentralPanel>
          {state.settings.devicesDetached && !state.settings.aiDetached && showChat && (
            <>
              <div
                role="separator"
                aria-label={L('Redimensionner le chat', 'Resize chat')}
                aria-orientation="vertical"
                className="resize-handle vertical"
                onPointerDown={(e) => resize('right', e)}
              />
              {chatPanel}
            </>
          )}
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
      {!detachedWindow && !aiWindow && (
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
          {state.settings.aiDetached && (
            <button className="text-button" onClick={() => void detachAi()}>
              <ArrowLeftToLine size={12} />
              {L('Réintégrer le panneau IA', 'Dock AI panel')}
            </button>
          )}
          {state.settings.devicesDetached && (
            <button className="text-button" onClick={() => void detach()}>
              <ArrowLeftToLine size={12} />
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
      {editProject && project && (
        <NewProject
          key={project.id}
          project={project}
          L={L}
          root={state.settings.projectsDirectory}
          onClose={() => setEditProject(false)}
          onCreate={async (input) => {
            await update({ id: project.id, ...input, expectedRevision: project.revision });
            setEditProject(false);
          }}
        />
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
      {rerunPrompt &&
        rerunPrompt.projectId === project?.id &&
        rerunPrompt.campaignId === project.activeCampaignId && (
          <Modal
            title={L('Relancer tous les tests', 'Run all tests again')}
            onClose={() => setRerunPrompt(null)}
          >
            <div className="modal-body">
              <p>
                {L(
                  'Cette campagne contient déjà des résultats. Voulez-vous repartir de zéro ?',
                  'This campaign already contains results. Start fresh?',
                )}
              </p>
              <p className="muted">
                {L(
                  'Nettoyer supprime les résultats et captures de cette campagne, puis relance l’application avant les tests. Les données de l’application sont conservées.',
                  'Cleaning deletes this campaign’s results and screenshots, then restarts the app before testing. App data is preserved.',
                )}
              </p>
            </div>
            <footer>
              <button onClick={() => setRerunPrompt(null)}>{L('Annuler', 'Cancel')}</button>
              <button onClick={() => void start(undefined, undefined, false)}>
                {L('Conserver et exécuter', 'Keep and run')}
              </button>
              <button className="primary" onClick={() => void start(undefined, undefined, true)}>
                {L('Nettoyer et relancer', 'Clean and restart')}
              </button>
            </footer>
          </Modal>
        )}
      {aiQuestion && (
        <Modal
          title={
            aiQuestion.variableName
              ? L('Enregistrer la variable', 'Save variable')
              : L('Préciser la demande', 'Clarify request')
          }
          onClose={() => {
            void api.aiCancel(aiQuestion.projectId);
            setAiQuestion(null);
          }}
        >
          <div className="modal-body exploration-question">
            {aiQuestion.variableName && (
              <span className="exploration-variable">{'${' + aiQuestion.variableName + '}'}</span>
            )}
            <p className="exploration-question-text">{aiQuestion.question}</p>
            <p className="muted">
              {aiQuestion.variableName
                ? L(
                    'La valeur sera enregistrée dans les variables du projet et utilisée pour cette exploration et les prochains scénarios.',
                    'The value will be saved in project variables and used for this exploration and future scenarios.',
                  )
                : L(
                    'Précisez le résultat attendu pour poursuivre. Pour les identifiants déjà enregistrés, indiquez le nom de la variable.',
                    'Clarify the expected outcome to continue. For saved credentials, provide the variable name.',
                  )}
            </p>
            {!aiQuestion.variableName && (
              <label>
                {L('Votre réponse', 'Your answer')}
                <textarea
                  autoFocus
                  rows={4}
                  placeholder={L('Saisissez votre précision…', 'Enter your clarification…')}
                  value={aiAnswer}
                  onChange={(e) => setAiAnswer(e.target.value)}
                />
              </label>
            )}
          </div>
          <footer>
            <button
              onClick={() => {
                void api.aiCancel(aiQuestion.projectId);
                setAiQuestion(null);
              }}
            >
              {L('Arrêter', 'Stop')}
            </button>
            <button
              className="primary"
              disabled={!aiQuestion.variableName && !aiAnswer.trim()}
              onClick={async () => {
                try {
                  await api.aiAnswer({
                    projectId: aiQuestion.projectId,
                    questionId: aiQuestion.questionId,
                    answer: aiQuestion.variableName ? 'approve' : aiAnswer,
                  });
                  setAiQuestion(null);
                } catch (e) {
                  notify(e);
                }
              }}
            >
              {aiQuestion.variableName
                ? L('Créer et reprendre', 'Create and resume')
                : L('Répondre et reprendre', 'Answer and resume')}
            </button>
          </footer>
        </Modal>
      )}
      {project && variablesProjectId === project.id && (
        <Modal
          title={L('Variables du projet', 'Project variables')}
          wide
          onClose={() => setVariablesProjectId(null)}
        >
          <VariablesPanel
            key={project.id}
            project={project}
            L={L}
            onClose={() => setVariablesProjectId(null)}
            onSave={async (variables) => {
              await update({ id: project.id, variables });
            }}
          />
        </Modal>
      )}
      {settingsTab && (
        <SettingsModal
          project={project}
          onApplicationsSave={async (applications) => {
            if (project) await update({ id: project.id, applications });
          }}
          iosDeviceId={project?.deviceIds.ios}
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
  language,
  onSpeechError,
  controls,
  L,
  disabled,
  busy,
  onSubmit,
  onCancel,
}: {
  language: 'fr' | 'en';
  onSpeechError: (message: string) => void;
  controls: ReactNode;
  L: L;
  disabled: boolean;
  busy: boolean;
  onSubmit: (prompt: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [dictating, setDictating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const panel = textarea?.closest<HTMLElement>('.chat-panel');
    if (!textarea || !panel) return;
    const resize = () => {
      const header = panel.querySelector<HTMLElement>('.chat-header')?.offsetHeight ?? 40;
      const toolbar =
        textarea.parentElement?.querySelector<HTMLElement>('.prompt-toolbar')?.offsetHeight ?? 28;
      const warning = panel.querySelector<HTMLElement>('.prompt-device-warning')?.offsetHeight ?? 0;
      const maximum = Math.max(
        46,
        Math.min(
          320,
          window.innerHeight * 0.4,
          panel.clientHeight - header - toolbar - warning - 40,
        ),
      );
      textarea.style.height = '0px';
      const height = Math.max(46, Math.min(textarea.scrollHeight, maximum));
      textarea.style.height = height + 'px';
      textarea.style.overflowY = textarea.scrollHeight > height ? 'auto' : 'hidden';
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [value]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!disabled && !dictating && value.trim() && (await onSubmit(value.trim()))) setValue('');
  }
  return (
    <form className="exploration-prompt" onSubmit={submit}>
      <textarea
        ref={textareaRef}
        aria-label={L('Demande à l’IA', 'AI request')}
        disabled={busy || dictating}
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
      <div className="prompt-toolbar">
        {controls}
        <div className="prompt-actions">
          <SpeechDictation
            value={value}
            language={language}
            disabled={busy}
            L={L}
            onText={setValue}
            onListeningChange={setDictating}
            onError={onSpeechError}
          />
          {busy ? (
            <button type="button" onClick={onCancel}>
              <Square size={14} />
              {L('Arrêter', 'Stop')}
            </button>
          ) : (
            <button
              type="submit"
              className="primary prompt-send-button"
              disabled={disabled || dictating || !value.trim()}
              aria-label={L('Envoyer', 'Send')}
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
