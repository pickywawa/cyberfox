import { z } from 'zod';
export const platforms = ['android', 'ios', 'flutter'] as const;
export const nodeSchema: z.ZodType<ScenarioNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(180),
    kind: z.enum(['folder', 'navigation', 'test', 'assertion']),
    description: z.string().max(5000),
    children: z.array(nodeSchema).max(100),
  }),
);
export interface ScenarioNode {
  id: string;
  name: string;
  kind: 'folder' | 'navigation' | 'test' | 'assertion';
  description: string;
  children: ScenarioNode[];
}
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
export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark', 'midnight', 'dracula', 'forest', 'sunset']),
  language: z.enum(['fr', 'en']),
  projectsDirectory: z.string().min(1),
  provider: z.enum(['codex', 'copilot']),
  codexModel: z.string().max(100),
  copilotModel: z.string().max(100),
  wdaDeviceId: z.string().max(100).default(''),
  wdaUrl: z
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
    }, 'WebDriverAgent doit être local'),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Project {
  id: string;
  name: string;
  directory: string;
  platforms: (typeof platforms)[number][];
  tab: 'creation' | 'execution';
  nodes: ScenarioNode[];
  messages: Message[];
  createdAt: string;
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
  platform: 'android' | 'ios';
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
}
export interface Bridge {
  load(): Promise<Workspace>;
  settingsSave(settings: Settings): Promise<Settings>;
  projectCreate(input: z.infer<typeof projectInput>): Promise<Project>;
  projectSelect(id: string): Promise<void>;
  projectUpdate(input: {
    id: string;
    tab?: Project['tab'];
    nodes?: ScenarioNode[];
  }): Promise<Project>;
  chooseDirectory(): Promise<string | null>;
  revealProject(id: string): Promise<void>;
  providerStatus(provider: Settings['provider']): Promise<ProviderStatus>;
  login(provider: Settings['provider']): Promise<void>;
  onLogin(callback: (progress: LoginProgress) => void): () => void;
  aiAsk(input: {
    projectId: string;
    prompt: string;
    nodeId?: string;
    deviceIds: string[];
  }): Promise<AiReply>;
  devicesScan(): Promise<DeviceScan>;
  screenshot(id: string): Promise<string>;
}
declare global {
  interface Window {
    cyberfox?: Bridge;
  }
}
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
export function parseProposal(text: string): ScenarioNode[] | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  try {
    const value = JSON.parse(fenced?.[1] ?? text);
    return z.object({ nodes: z.array(nodeSchema).min(1).max(100) }).parse(value).nodes;
  } catch {
    return undefined;
  }
}
