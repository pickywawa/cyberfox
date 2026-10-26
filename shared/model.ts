import { migrateIosCaretInputs } from './ios-input.js';
import { z } from 'zod';
export const platforms = ['android', 'ios', 'flutter'] as const;
export type OS = 'android' | 'ios';
export const locatorSchema = z.object({
  using: z.enum(['id', 'accessibility id', 'xpath']),
  value: z.string().min(1).max(3000),
});
export type Locator = z.infer<typeof locatorSchema>;
export const variantSchema = z.object({
  locator: locatorSchema.optional(),
  operation: z.enum(['tap', 'type', 'clear', 'back', 'assert']).default('tap'),
  value: z.string().max(5000).default(''),
  assertion: z.enum(['visible', 'absent', 'text', 'enabled']).default('visible'),
  expected: z.string().max(5000).default(''),
  timeoutMs: z.number().int().min(0).max(60000).default(10000),
});
export type Variant = z.infer<typeof variantSchema>;
export const screenDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(180),
  variants: z.object({
    android: z.object({ markers: z.array(locatorSchema).min(1).max(12) }).optional(),
    ios: z.object({ markers: z.array(locatorSchema).min(1).max(12) }).optional(),
  }),
});
export type ScreenDefinition = z.infer<typeof screenDefinitionSchema>;
export interface ScreenReference {
  id: string;
  name: string;
  platform: OS;
  identified: boolean;
}
export interface ScenarioNode {
  screen?: ScreenDefinition;
  id: string;
  name: string;
  kind: 'scenario' | 'action' | 'test' | 'navigation';
  description: string;
  tags: string[];
  preconditionId: string | null;
  childrenOnPreconditionFailure: boolean;
  blocking: boolean;
  variants: Partial<Record<OS, Variant>>;
  children: ScenarioNode[];
}
export const nodeSchema: z.ZodType<ScenarioNode> = z.lazy(() =>
  z.object({
    screen: screenDefinitionSchema.optional(),
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(180),
    kind: z.enum(['scenario', 'action', 'test', 'navigation']),
    description: z.string().max(5000).default(''),
    tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    preconditionId: z.string().nullable().default(null),
    childrenOnPreconditionFailure: z.boolean().default(false),
    blocking: z.boolean().default(false),
    variants: z
      .object({ android: variantSchema.optional(), ios: variantSchema.optional() })
      .default({}),
    children: z.array(nodeSchema).max(500).default([]),
  }),
);
export const applicationsSchema = z.object({
  android: z
    .string()
    .trim()
    .max(255)
    .regex(/^[A-Za-z0-9_.]*$/)
    .default(''),
  ios: z
    .string()
    .trim()
    .max(255)
    .regex(/^[A-Za-z0-9_.-]*$/)
    .default(''),
});
export const applicationDetailsSchema = z.object({
  android: z
    .object({
      id: z.string().max(255),
      name: z.string().max(180),
      icon: z
        .string()
        .max(1000000)
        .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
    })
    .optional(),
  ios: z
    .object({
      id: z.string().max(255),
      name: z.string().max(180),
      icon: z
        .string()
        .max(1000000)
        .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
    })
    .optional(),
});
export const projectInput = z.object({
  applications: applicationsSchema.optional(),
  applicationDetails: applicationDetailsSchema.optional(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(
      (v) =>
        !/[<>:"/\\|?*\x00-\x1f]/.test(v) &&
        v !== '.' &&
        v !== '..' &&
        !/[. ]$/.test(v) &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(v),
      'Nom de dossier invalide',
    ),
  platforms: z.array(z.enum(platforms)).min(1).max(3),
});
const localUrl = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  }, 'Adresse HTTP locale requise');
export const settingsSchema = z.object({
  creationMaxDecisions: z.number().int().min(1).max(500).default(40),
  creationTimeoutMinutes: z.number().int().min(1).max(120).default(10),
  creationPrompt: z.string().max(20000).default(''),
  creationReplay: z.boolean().default(true),
  creationQuestions: z.boolean().default(true),
  explorationMode: z.enum(['interactive', 'auto-approve']).default('interactive'),
  theme: z.enum(['system', 'light', 'dark', 'midnight', 'dracula', 'forest', 'sunset']),
  language: z.enum(['fr', 'en']),
  projectsDirectory: z.string().min(1),
  provider: z.enum(['codex', 'copilot']),
  codexModel: z.string().max(100),
  reasoningEffort: z.enum(['default', 'low', 'medium', 'high']).default('default'),
  copilotModel: z.string().max(100),
  wdaDeviceId: z.string().max(100).default(''),
  wdaUrl: localUrl,
  appiumUrl: localUrl.default('http://127.0.0.1:4723'),
  iosTeamId: z.string().max(40).default(''),
  iosWdaBundleId: z.string().max(180).default(''),
  iosKeepAwake: z.boolean().default(false),
  iosWdaMode: z.enum(['build', 'preinstalled', 'external']).default('build'),
  iosXcodeConfigFile: z.string().max(2000).default(''),
  iosPlatformVersion: z.string().max(30).default(''),
  checkUpdatesOnStart: z.boolean().default(true),
  autoDownloadUpdates: z.boolean().default(false),
  analysisMode: z.enum(['automatic', 'ask', 'off']).default('ask'),
  devicesDetached: z.boolean().default(false),
  aiDetached: z.boolean().default(false),
  leftWidth: z.number().min(180).max(600).default(254),
  rightWidth: z.number().min(280).max(1600).default(430),
  chatHeight: z.number().min(130).max(800).default(230),
});
export type Settings = z.infer<typeof settingsSchema>;
export const variablesSchema = z.record(
  z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .max(100)
    .refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key)),
  z.string().max(20000),
);
export const chatSessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  createdAt: z.string(),
});
export type ChatSession = z.infer<typeof chatSessionSchema>;
export interface Project {
  activeCampaignId?: string | null;
  id: string;
  name: string;
  directory: string;
  platforms: (typeof platforms)[number][];
  tab: 'creation' | 'execution' | 'variables';
  applications?: z.infer<typeof applicationsSchema>;
  applicationDetails?: z.infer<typeof applicationDetailsSchema>;
  variables: Record<string, string>;
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  nodes: ScenarioNode[];
  tags: string[];
  messages: Message[];
  createdAt: string;
  revision: number;
  selectedNodeId: string | null;
  deviceIds: Partial<Record<OS, string>>;
}
export interface Message {
  sessionId?: string;
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
}
export interface Workspace {
  settings: Settings;
  projects: Project[];
  activeProjectId: string | null;
}
export interface Device {
  id: string;
  name: string;
  platform: OS;
  kind: 'usb' | 'simulator' | 'network' | 'manual';
  status: 'ready' | 'unauthorized' | 'offline';
  detail: string;
  osVersion?: string;
  developerMode?: string;
  ddiReady?: boolean;
}
export interface DeviceCheck {
  id: string;
  label: string;
  state: 'ok' | 'error' | 'pending' | 'unknown';
  detail: string;
  fix?: string;
  log?: string;
  documentation?: string;
}
export interface DeviceHealth {
  deviceId: string;
  checkedAt: string;
  checks: DeviceCheck[];
}
export interface DeviceScan {
  devices: Device[];
  diagnostics: string[];
}
export interface ProviderStatus {
  provider: 'codex' | 'copilot';
  authenticated: boolean;
  message: string;
  models: { id: string; name: string }[];
  lastUsage?: { input: number; output: number };
  quota?: { label: string; usedPercent: number; resetAt?: string };
}
export interface LoginProgress {
  provider: 'codex' | 'copilot';
  output: string;
  running: boolean;
}
export interface ReplayResult {
  platform: OS;
  status: 'passed' | 'failed' | 'blocked' | 'skipped';
  message: string;
}
export interface AiReply {
  replay?: ReplayResult[];
  text: string;
  proposal?: ScenarioNode[];
  parentId?: string;
  baseRevision?: number;
}
export interface Component {
  id: string;
  type: string;
  label: string;
  text: string;
  locator?: Locator;
  rect: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  password: boolean;
}
export interface Screen {
  deviceId: string;
  components: Component[];
  width: number;
  height: number;
  capturedAt: string;
}
export type RunStatus = 'running' | 'passed' | 'failed' | 'skipped' | 'blocked' | 'cancelled';
export interface RunEntry {
  kind?: ScenarioNode['kind'];
  outcome?: RunStatus;
  completedAt?: string;
  sequence?: number;
  operationMessage?: string;
  screenBefore?: ScreenReference;
  screenAfter?: ScreenReference;
  screenshotError?: string;
  id: string;
  nodeId: string;
  nodeName: string;
  deviceId: string;
  platform: OS;
  status: RunStatus;
  message: string;
  startedAt: string;
  finishedAt?: string;
  screenshot?: string;
  analysis?: string;
  analysisState?: 'pending' | 'running' | 'done' | 'off';
  precondition?: boolean;
}
export interface RunReport {
  platforms?: OS[];
  campaignId?: string;
  id: string;
  projectId: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  entries: RunEntry[];
  snapshot: ScenarioNode[];
  persistenceError?: string;
}
export const campaignSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  label: z.string().trim().min(1).max(180),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['open', 'completed']).default('open'),
});
export type Campaign = z.infer<typeof campaignSchema>;
export interface CampaignDetail {
  campaign: Campaign;
  reports: RunReport[];
}
export interface ReplayFrame {
  runId: string;
  entry: RunEntry;
}
export type LiveEvent =
  | { type: 'update'; status: import('./update.js').UpdateStatus }
  | { type: 'device'; deviceId: string; ready: boolean }
  | { type: 'run'; report: RunReport }
  | { type: 'pointer'; deviceId: string; x: number; y: number; width: number; height: number }
  | { type: 'ai'; projectId: string; message: string }
  | {
      type: 'ai-question';
      projectId: string;
      questionId: string;
      question: string;
      variableName?: string;
    }
  | { type: 'replay'; projectId: string; frame: ReplayFrame | null }
  | { type: 'workspace' };
export interface ProjectUpdate {
  activeCampaignId?: string | null;
  name?: string;
  platforms?: Project['platforms'];
  applicationDetails?: Project['applicationDetails'];
  applications?: Project['applications'];
  id: string;
  tab?: Project['tab'];
  nodes?: ScenarioNode[];
  tags?: string[];
  variables?: Project['variables'];
  chatSessions?: ChatSession[];
  activeChatSessionId?: string | null;
  deviceIds?: Project['deviceIds'];
  expectedRevision?: number;
  selectedNodeId?: string | null;
}
export interface Bridge {
  updateStatus(): Promise<import('./update.js').UpdateStatus>;
  updateCheck(): Promise<import('./update.js').UpdateStatus>;
  updateDownload(): Promise<import('./update.js').UpdateStatus>;
  updateInstall(): Promise<void>;
  updateRelease(): Promise<void>;
  load(): Promise<Workspace>;
  settingsSave(settings: Settings): Promise<Settings>;
  projectCreate(input: z.infer<typeof projectInput>): Promise<Project>;
  projectApplicationInfo(input: {
    projectId?: string;
    deviceId?: string;
    platform: OS;
    application: string;
  }): Promise<{ id: string; name: string; icon?: string }>;
  projectApplications(input: {
    projectId?: string;
    deviceId?: string;
    platform: OS;
    mode: 'current' | 'list';
  }): Promise<{ id: string; name: string; icon?: string }[]>;
  projectSelect(id: string): Promise<void>;
  onNewProject(callback: () => void): () => void;
  onEditProject(callback: () => void): () => void;
  projectUpdate(input: ProjectUpdate): Promise<Project>;
  chooseDirectory(): Promise<string | null>;
  revealProject(id: string): Promise<void>;
  providerStatus(provider: Settings['provider']): Promise<ProviderStatus>;
  login(provider: Settings['provider']): Promise<void>;
  logout(provider: Settings['provider']): Promise<void>;
  onLogin(callback: (p: LoginProgress) => void): () => void;
  aiAsk(input: {
    projectId: string;
    prompt: string;
    sessionId?: string;
    nodeId?: string;
    deviceIds: string[];
  }): Promise<AiReply>;
  aiAnswer(input: { projectId: string; questionId: string; answer: string }): Promise<void>;
  aiCancel(projectId: string): Promise<void>;
  devicesScan(): Promise<DeviceScan>;
  deviceHealth(id: string): Promise<DeviceHealth>;
  openWdaProject(id: string): Promise<void>;
  openDeviceDocumentation(
    topic: 'provisioning' | 'windows' | 'tunnels' | 'preinstalled',
  ): Promise<void>;
  screenshot(id: string): Promise<string>;
  inspect(id: string): Promise<Screen>;
  perform(input: {
    deviceId: string;
    variant: Variant;
    kind: ScenarioNode['kind'];
    projectId?: string;
  }): Promise<void>;
  onEvent(callback: (e: LiveEvent) => void): () => void;
  campaignList(projectId: string): Promise<Campaign[]>;
  campaignCreate(input: { projectId: string; label?: string }): Promise<Campaign>;
  campaignLoad(input: { projectId: string; campaignId: string }): Promise<CampaignDetail>;
  campaignUpdate(input: {
    projectId: string;
    campaignId: string;
    label?: string;
    status?: Campaign['status'];
  }): Promise<Campaign>;
  campaignClean(input: { projectId: string; campaignId?: string }): Promise<void>;
  campaignExport(input: {
    projectId: string;
    campaignId: string;
    format?: import('./campaigns.js').CampaignExportFormat;
  }): Promise<string>;
  runScreenshot(input: {
    projectId: string;
    campaignId?: string;
    runId: string;
    entryId: string;
  }): Promise<string | null>;
  replayCurrent(projectId: string): Promise<ReplayFrame | null>;
  replaySelect(input: { projectId: string; frame: ReplayFrame | null }): Promise<void>;
  runStart(input: {
    resetCampaign?: boolean;
    projectId: string;
    campaignId?: string;
    platform?: OS;
    nodeId?: string;
    deviceIds: string[];
  }): Promise<RunReport>;
  runCancel(): Promise<void>;
  runCurrent(projectId: string): Promise<RunReport | null>;
  analyze(input: { runId: string; entryId: string }): Promise<void>;
  detachDevices(value: boolean): Promise<void>;
  detachAi(value: boolean): Promise<void>;
}
declare global {
  interface Window {
    cyberfox?: Bridge;
  }
}
export const requiredOS = (p: Pick<Project, 'platforms'>): OS[] =>
  p.platforms.includes('flutter')
    ? ['android', 'ios']
    : p.platforms.filter((s): s is OS => s !== 'flutter');
export function flatten(nodes: ScenarioNode[]): ScenarioNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
export function nodePath(nodes: ScenarioNode[], id: string): ScenarioNode[] {
  for (const n of nodes) {
    if (n.id === id) return [n];
    const rest = nodePath(n.children, id);
    if (rest.length) return [n, ...rest];
  }
  return [];
}
export function mapNodes(
  nodes: ScenarioNode[],
  fn: (n: ScenarioNode) => ScenarioNode,
): ScenarioNode[] {
  return nodes.map((n) => fn({ ...n, children: mapNodes(n.children, fn) }));
}
export function makeNode(kind: ScenarioNode['kind'], name: string, oses: OS[]): ScenarioNode {
  return {
    id: crypto.randomUUID(),
    kind,
    name,
    description: '',
    tags: [],
    preconditionId: null,
    childrenOnPreconditionFailure: false,
    blocking: false,
    variants:
      kind === 'scenario'
        ? {}
        : Object.fromEntries(
            oses.map((os) => [
              os,
              variantSchema.parse({ operation: kind === 'test' ? 'assert' : 'tap' }),
            ]),
          ),
    children: [],
  };
}
export function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced?.[1] ?? text);
}
export function parseProposal(text: string): ScenarioNode[] | undefined {
  try {
    return z.object({ nodes: z.array(nodeSchema).min(1).max(100) }).parse(parseJson(text)).nodes;
  } catch {
    return undefined;
  }
}
export function validateTree(nodes: ScenarioNode[]) {
  const ids = new Set<string>();
  const visit = (list: ScenarioNode[], depth: number) => {
    if (depth > 20) throw new Error('Arbre trop profond');
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if ((depth === 0) !== (n.kind === 'scenario'))
        throw new Error(
          'Seuls les scénarios sont autorisés à la racine ; aucun scénario imbriqué.',
        );
      if (ids.has(n.id)) throw new Error('Identifiants dupliqués');
      ids.add(n.id);
      if (
        n.preconditionId &&
        (i === 0 || list[i - 1].kind !== 'test' || list[i - 1].id !== n.preconditionId)
      )
        throw new Error('La précondition doit désigner le test immédiatement précédent.');
      visit(n.children, depth + 1);
    }
  };
  visit(nodes, 0);
}
export function migrateProject(raw: any): Project {
  const convert = (nodes: any[], root: boolean): ScenarioNode[] =>
    nodes.map((n) =>
      nodeSchema.parse({
        ...n,
        kind: root
          ? 'scenario'
          : n.kind === 'folder'
            ? 'navigation'
            : n.kind === 'assertion'
              ? 'test'
              : n.kind,
        children: convert(n.children ?? [], false),
      }),
    );
  const sessions: ChatSession[] = raw.chatSessions?.length
    ? raw.chatSessions
    : [
        {
          id: 'legacy-session',
          name: 'Session 1',
          createdAt: raw.createdAt ?? new Date().toISOString(),
        },
      ];
  const activeSession = sessions.some((session) => session.id === raw.activeChatSessionId)
    ? raw.activeChatSessionId
    : sessions[0].id;
  return {
    ...raw,
    tab: raw.tab === 'variables' ? 'creation' : raw.tab,
    variables: variablesSchema.parse(raw.variables ?? {}),
    chatSessions: sessions,
    activeChatSessionId: activeSession,
    messages: (raw.messages ?? []).map((message: Message) => ({
      ...message,
      sessionId: message.sessionId ?? sessions[0].id,
    })),
    nodes: migrateIosCaretInputs(convert(raw.nodes ?? [], true)),
    tags: raw.tags ?? [],
    revision: raw.revision ?? 0,
    activeCampaignId: raw.activeCampaignId ?? null,
    selectedNodeId: raw.selectedNodeId ?? null,
    deviceIds: raw.deviceIds ?? {},
  };
}
