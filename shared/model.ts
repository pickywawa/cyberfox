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
export interface ScenarioNode {
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
export const projectInput = z.object({
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
  theme: z.enum(['system', 'light', 'dark', 'midnight', 'dracula', 'forest', 'sunset']),
  language: z.enum(['fr', 'en']),
  projectsDirectory: z.string().min(1),
  provider: z.enum(['codex', 'copilot']),
  codexModel: z.string().max(100),
  copilotModel: z.string().max(100),
  wdaDeviceId: z.string().max(100).default(''),
  wdaUrl: localUrl,
  appiumUrl: localUrl.default('http://127.0.0.1:4723'),
  iosTeamId: z.string().max(40).default(''),
  iosWdaBundleId: z.string().max(180).default('com.pickywawa.cyberfox.WebDriverAgentRunner'),
  checkUpdatesOnStart: z.boolean().default(true),
  autoDownloadUpdates: z.boolean().default(false),
  analysisMode: z.enum(['automatic', 'ask', 'off']).default('ask'),
  devicesDetached: z.boolean().default(false),
  leftWidth: z.number().min(180).max(600).default(254),
  rightWidth: z.number().min(280).max(1600).default(430),
  chatHeight: z.number().min(130).max(800).default(230),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Project {
  id: string;
  name: string;
  directory: string;
  platforms: (typeof platforms)[number][];
  tab: 'creation' | 'execution';
  nodes: ScenarioNode[];
  tags: string[];
  messages: Message[];
  createdAt: string;
  revision: number;
  selectedNodeId: string | null;
  deviceIds: Partial<Record<OS, string>>;
}
export interface Message {
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
  kind: 'usb' | 'simulator';
  status: 'ready' | 'unauthorized' | 'offline';
  detail: string;
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
}
export interface LoginProgress {
  provider: 'codex' | 'copilot';
  output: string;
  running: boolean;
}
export interface AiReply {
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
  id: string;
  projectId: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  entries: RunEntry[];
  snapshot: ScenarioNode[];
  persistenceError?: string;
}
export type LiveEvent =
  | { type: 'update'; status: import('./update.js').UpdateStatus }
  | { type: 'device'; deviceId: string; ready: boolean }
  | { type: 'run'; report: RunReport }
  | { type: 'pointer'; deviceId: string; x: number; y: number; width: number; height: number }
  | { type: 'ai'; projectId: string; message: string }
  | { type: 'workspace' };
export interface ProjectUpdate {
  id: string;
  tab?: Project['tab'];
  nodes?: ScenarioNode[];
  tags?: string[];
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
  projectSelect(id: string): Promise<void>;
  projectUpdate(input: ProjectUpdate): Promise<Project>;
  chooseDirectory(): Promise<string | null>;
  revealProject(id: string): Promise<void>;
  providerStatus(provider: Settings['provider']): Promise<ProviderStatus>;
  login(provider: Settings['provider']): Promise<void>;
  onLogin(callback: (p: LoginProgress) => void): () => void;
  aiAsk(input: {
    projectId: string;
    prompt: string;
    nodeId?: string;
    deviceIds: string[];
  }): Promise<AiReply>;
  aiCancel(projectId: string): Promise<void>;
  devicesScan(): Promise<DeviceScan>;
  screenshot(id: string): Promise<string>;
  inspect(id: string): Promise<Screen>;
  perform(input: { deviceId: string; variant: Variant; kind: ScenarioNode['kind'] }): Promise<void>;
  onEvent(callback: (e: LiveEvent) => void): () => void;
  runStart(input: { projectId: string; nodeId?: string; deviceIds: string[] }): Promise<RunReport>;
  runCancel(): Promise<void>;
  runCurrent(projectId: string): Promise<RunReport | null>;
  analyze(input: { runId: string; entryId: string }): Promise<void>;
  detachDevices(value: boolean): Promise<void>;
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
  return {
    ...raw,
    nodes: convert(raw.nodes ?? [], true),
    tags: raw.tags ?? [],
    revision: raw.revision ?? 0,
    selectedNodeId: raw.selectedNodeId ?? null,
    deviceIds: raw.deviceIds ?? {},
  };
}
