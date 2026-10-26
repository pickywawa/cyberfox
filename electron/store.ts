import { migrateIosCaretInputs } from '../shared/ios-input.js';
import { validateScreenDefinitions } from './screen-identity.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  applicationsSchema,
  applicationDetailsSchema,
  campaignSchema,
  nodeSchema,
  variablesSchema,
  chatSessionSchema,
  migrateProject,
  validateTree,
  projectInput,
  settingsSchema,
  type Project,
  type Settings,
  type Workspace,
} from '../shared/model.js';
const projectSchema = z.object({
  id: z.string(),
  name: projectInput.shape.name,
  directory: z.string(),
  platforms: projectInput.shape.platforms,
  tab: z.enum(['creation', 'execution', 'variables']),
  applicationDetails: applicationDetailsSchema.default({}),
  applications: applicationsSchema.default({ android: '', ios: '' }),
  variables: variablesSchema.default({}),
  chatSessions: z.array(chatSessionSchema).default([]),
  activeCampaignId: z.string().uuid().nullable().default(null),
  activeChatSessionId: z.string().nullable().default(null),
  nodes: z.array(nodeSchema),
  selectedNodeId: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  revision: z.number().int().default(0),
  deviceIds: z.object({ android: z.string().optional(), ios: z.string().optional() }).default({}),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      sessionId: z.string().optional(),
      content: z.string(),
      at: z.string(),
    }),
  ),
  createdAt: z.string(),
});
export class Store {
  state!: Workspace;
  private queue = Promise.resolve();
  constructor(
    private configDirectory: string,
    private documents: string,
  ) {}
  async load() {
    await fs.mkdir(this.configDirectory, { recursive: true });
    const defaults: Settings = settingsSchema.parse({
      theme: 'system',
      language: 'fr',
      projectsDirectory: path.join(this.documents, 'Cyberfox', 'Projects'),
      provider: 'codex',
      codexModel: '',
      copilotModel: '',
      wdaDeviceId: '',
      wdaUrl: 'http://127.0.0.1:8100',
    });
    try {
      const raw = JSON.parse(
        await fs.readFile(path.join(this.configDirectory, 'workspace.json'), 'utf8'),
      );
      this.state = {
        settings: settingsSchema.parse(raw.settings),
        projects: [],
        activeProjectId: raw.activeProjectId ?? null,
      };
      for (const entry of raw.projects ?? []) {
        try {
          this.state.projects.push(
            projectSchema.parse(
              migrateProject(
                JSON.parse(
                  await fs.readFile(path.join(entry.directory, 'cyberfox.project.json'), 'utf8'),
                ),
              ),
            ),
          );
        } catch (error) {
          console.warn('Project unavailable:', entry.directory, String(error));
        }
      }
      if (!this.state.projects.some((p) => p.id === this.state.activeProjectId))
        this.state.activeProjectId = null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(`Impossible de lire la configuration : ${String(error)}`);
      this.state = { settings: defaults, projects: [], activeProjectId: null };
    }
    return this.state;
  }
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  private async atomic(file: string, value: unknown) {
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
      await fs.rename(temp, file);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }
  private persist() {
    return this.atomic(path.join(this.configDirectory, 'workspace.json'), {
      ...this.state,
      projects: this.state.projects.map(({ id, name, directory }) => ({ id, name, directory })),
    });
  }
  get(id: string) {
    const p = this.state.projects.find((p) => p.id === id);
    if (!p) throw new Error('Projet introuvable');
    return p;
  }
  saveSettings(input: unknown) {
    return this.transaction(async () => {
      const settings = settingsSchema.parse(input);
      if (!path.isAbsolute(settings.projectsDirectory))
        throw new Error('Le répertoire doit être un chemin absolu');
      const previous = this.state.settings;
      this.state.settings = settings;
      try {
        await this.persist();
      } catch (e) {
        this.state.settings = previous;
        throw e;
      }
      return settings;
    });
  }
  create(input: unknown) {
    return this.transaction(async () => {
      const data = projectInput.parse(input);
      const directory = path.join(this.state.settings.projectsDirectory, data.name);
      await fs.mkdir(this.state.settings.projectsDirectory, { recursive: true });
      await fs.mkdir(directory); // Never overwrite an existing project or unrelated directory.
      const project: Project = {
        ...data,
        id: randomUUID(),
        directory,
        tab: 'creation',
        variables: {},
        chatSessions: [
          { id: randomUUID(), name: 'Session 1', createdAt: new Date().toISOString() },
        ],
        activeChatSessionId: null,
        tags: [],
        revision: 0,
        selectedNodeId: null,
        deviceIds: {},
        nodes: [],
        messages: [],
        createdAt: new Date().toISOString(),
      };
      project.activeChatSessionId = project.chatSessions[0].id;
      const previous = this.state.activeProjectId;
      try {
        await this.atomic(path.join(directory, 'cyberfox.project.json'), project);
        this.state.projects.push(project);
        this.state.activeProjectId = project.id;
        await this.persist();
      } catch (e) {
        this.state.projects = this.state.projects.filter((p) => p.id !== project.id);
        this.state.activeProjectId = previous;
        await fs.rm(path.join(directory, 'cyberfox.project.json'), { force: true });
        await fs.rmdir(directory).catch(() => {});
        throw e;
      }
      return project;
    });
  }
  async latestReport(projectId: string): Promise<import('../shared/model.js').RunReport | null> {
    const directory = path.join(this.get(projectId).directory, 'reports');
    let files: string[];
    try {
      files = (await fs.readdir(directory)).filter((f) => /^[a-zA-Z0-9-]+\.json$/.test(f));
    } catch {
      return null;
    }
    const reports = await Promise.all(
      files.map(async (file) => {
        try {
          return JSON.parse(
            await fs.readFile(path.join(directory, file), 'utf8'),
          ) as import('../shared/model.js').RunReport;
        } catch {
          return null;
        }
      }),
    );
    return (
      reports
        .filter(
          (r): r is import('../shared/model.js').RunReport =>
            !!r && r.projectId === projectId && Array.isArray(r.entries),
        )
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    );
  }
  private campaignDirectory(projectId: string, campaignId: string) {
    z.string().uuid().parse(campaignId);
    return path.join(this.get(projectId).directory, 'campaigns', campaignId);
  }
  async listCampaigns(projectId: string): Promise<import('../shared/model.js').Campaign[]> {
    const directory = path.join(this.get(projectId).directory, 'campaigns');
    const files = await fs.readdir(directory).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const campaigns = await Promise.all(
      files
        .filter((id) => z.string().uuid().safeParse(id).success)
        .map(async (id) => {
          const campaign = campaignSchema.parse(
            JSON.parse(await fs.readFile(path.join(directory, id, 'campaign.json'), 'utf8')),
          );
          if (campaign.projectId !== projectId || campaign.id !== id)
            throw new Error('Campagne incohérente');
          return campaign;
        }),
    );
    return campaigns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async createCampaign(input: { projectId: string; label?: string }) {
    const campaign = campaignSchema.parse({
      id: randomUUID(),
      projectId: input.projectId,
      label: input.label || 'Campagne ' + new Date().toLocaleString('fr-FR'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'open',
    });
    await this.transaction(async () => {
      const directory = this.campaignDirectory(input.projectId, campaign.id);
      await fs.mkdir(directory, { recursive: true });
      await this.atomic(path.join(directory, 'campaign.json'), campaign);
    });
    await this.update({ id: input.projectId, activeCampaignId: campaign.id });
    return campaign;
  }
  async loadCampaign(
    projectId: string,
    campaignId: string,
  ): Promise<import('../shared/model.js').CampaignDetail> {
    const directory = this.campaignDirectory(projectId, campaignId);
    const campaign = campaignSchema.parse(
      JSON.parse(await fs.readFile(path.join(directory, 'campaign.json'), 'utf8')),
    );
    if (campaign.projectId !== projectId || campaign.id !== campaignId)
      throw new Error('Campagne incohérente');
    const files = await fs.readdir(path.join(directory, 'reports')).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const reports = await Promise.all(
      files
        .filter((file) => /^[a-zA-Z0-9-]+\.json$/.test(file))
        .map(async (file) => {
          const report = JSON.parse(
            await fs.readFile(path.join(directory, 'reports', file), 'utf8'),
          ) as import('../shared/model.js').RunReport;
          if (
            report.projectId !== projectId ||
            report.campaignId !== campaignId ||
            report.id + '.json' !== file ||
            !Array.isArray(report.entries)
          )
            throw new Error('Rapport incohérent');
          return report;
        }),
    );
    return { campaign, reports: reports.sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
  }
  updateCampaign(input: {
    projectId: string;
    campaignId: string;
    label?: string;
    status?: 'open' | 'completed';
  }) {
    return this.transaction(async () => {
      const { campaign } = await this.loadCampaign(input.projectId, input.campaignId);
      const next = campaignSchema.parse({
        ...campaign,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date().toISOString(),
      });
      await this.atomic(
        path.join(this.campaignDirectory(input.projectId, input.campaignId), 'campaign.json'),
        next,
      );
      return next;
    });
  }
  async cleanCampaigns(projectId: string, campaignId?: string) {
    await this.transaction(async () => {
      const campaigns = campaignId
        ? [(await this.loadCampaign(projectId, campaignId)).campaign]
        : await this.listCampaigns(projectId);
      for (const campaign of campaigns) {
        const directory = this.campaignDirectory(projectId, campaign.id);
        await fs.rm(path.join(directory, 'reports'), { recursive: true, force: true });
        await fs.rm(path.join(directory, 'captures'), { recursive: true, force: true });
        await this.atomic(path.join(directory, 'campaign.json'), {
          ...campaign,
          status: 'open',
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }
  private reportDirectory(projectId: string, campaignId?: string) {
    return campaignId
      ? path.join(this.campaignDirectory(projectId, campaignId), 'reports')
      : path.join(this.get(projectId).directory, 'reports');
  }
  async saveCapture(
    report: import('../shared/model.js').RunReport,
    entryId: string,
    image: string,
  ) {
    z.string().uuid().parse(report.id);
    z.string().uuid().parse(entryId);
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image))
      throw new Error('Format de capture invalide');
    const directory = path.join(
      this.reportDirectory(report.projectId, report.campaignId),
      '..',
      'captures',
    );
    await fs.mkdir(directory, { recursive: true });
    const file = report.id + '-' + entryId + '.png';
    try {
      await fs.writeFile(path.join(directory, file), Buffer.from(image.slice(22), 'base64'), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return 'capture:' + file;
  }
  async saveReport(report: import('../shared/model.js').RunReport) {
    const directory = this.reportDirectory(report.projectId, report.campaignId);
    z.string().uuid().parse(report.id);
    await fs.mkdir(directory, { recursive: true });
    const copy = structuredClone(report);
    for (const entry of copy.entries) {
      if (!entry.screenshot?.startsWith('data:image/png;base64,')) continue;
      entry.screenshot = await this.saveCapture(report, entry.id, entry.screenshot);
    }
    await this.atomic(path.join(directory, report.id + '.json'), copy);
  }
  async reportScreenshot(input: {
    projectId: string;
    campaignId?: string;
    runId: string;
    entryId: string;
  }) {
    z.string().uuid().parse(input.runId);
    z.string().uuid().parse(input.entryId);
    const directory = this.reportDirectory(input.projectId, input.campaignId);
    try {
      const buffer = await fs.readFile(
        path.join(directory, '..', 'captures', input.runId + '-' + input.entryId + '.png'),
      );
      return 'data:image/png;base64,' + buffer.toString('base64');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const report = JSON.parse(
      await fs.readFile(path.join(directory, input.runId + '.json'), 'utf8'),
    ) as import('../shared/model.js').RunReport;
    const entry = report.entries.find((entry) => entry.id === input.entryId);
    if (entry?.screenshot?.startsWith('data:image/png;base64,')) return entry.screenshot;
    if (entry?.screenshot !== 'capture:' + input.runId + '-' + input.entryId + '.png') return null;
    const buffer = await fs.readFile(
      path.join(directory, '..', 'captures', input.runId + '-' + input.entryId + '.png'),
    );
    return 'data:image/png;base64,' + buffer.toString('base64');
  }
  select(id: string) {
    return this.transaction(async () => {
      this.get(id);
      const previous = this.state.activeProjectId;
      this.state.activeProjectId = id;
      try {
        await this.persist();
      } catch (e) {
        this.state.activeProjectId = previous;
        throw e;
      }
    });
  }
  update(input: {
    id: string;
    name?: string;
    platforms?: Project['platforms'];
    applicationDetails?: Project['applicationDetails'];
    applications?: Project['applications'];
    tab?: Project['tab'];
    nodes?: Project['nodes'];
    messages?: Project['messages'];
    tags?: string[];
    variables?: Project['variables'];
    chatSessions?: Project['chatSessions'];
    activeCampaignId?: string | null;
    activeChatSessionId?: string | null;
    deviceIds?: Project['deviceIds'];
    expectedRevision?: number;
    selectedNodeId?: string | null;
  }) {
    return this.transaction(async () => {
      const current = this.get(input.id);
      if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision)
        throw new Error('Le projet a changé. Rechargez la proposition.');
      const next = projectSchema.parse({
        ...current,
        ...input,
        nodes: migrateIosCaretInputs(input.nodes ?? current.nodes),
        deviceIds: { ...current.deviceIds, ...input.deviceIds },
        revision:
          current.revision +
          (input.nodes || input.tags || input.platforms || input.applications ? 1 : 0),
      });
      if (
        next.activeChatSessionId &&
        !next.chatSessions.some((session) => session.id === next.activeChatSessionId)
      )
        throw new Error('Session IA introuvable');
      if (new Set(next.chatSessions.map((session) => session.id)).size !== next.chatSessions.length)
        throw new Error('Sessions IA dupliquées');
      validateTree(next.nodes);
      validateScreenDefinitions(next.nodes);
      next.tags = [
        ...new Set([
          ...next.tags,
          ...next.nodes.flatMap(function all(n): string[] {
            return [...n.tags, ...n.children.flatMap(all)];
          }),
        ]),
      ];
      const ids = new Set<string>();
      const check = (nodes: Project['nodes'], depth = 0) => {
        if (depth > 20) throw new Error('Arbre trop profond');
        for (const n of nodes) {
          if (ids.has(n.id)) throw new Error('Identifiants dupliqués');
          ids.add(n.id);
          check(n.children, depth + 1);
        }
      };
      check(next.nodes);
      await this.atomic(path.join(current.directory, 'cyberfox.project.json'), next);
      const index = this.state.projects.indexOf(current);
      this.state.projects[index] = next;
      try {
        if (input.name !== undefined) await this.persist();
      } catch (error) {
        this.state.projects[index] = current;
        await this.atomic(path.join(current.directory, 'cyberfox.project.json'), current);
        throw error;
      }
      return next;
    });
  }
}
