import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  nodeSchema,
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
  name: z.string(),
  directory: z.string(),
  platforms: projectInput.shape.platforms,
  tab: z.enum(['creation', 'execution']),
  nodes: z.array(nodeSchema),
  selectedNodeId: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  revision: z.number().int().default(0),
  deviceIds: z.object({ android: z.string().optional(), ios: z.string().optional() }).default({}),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
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
        tags: [],
        revision: 0,
        selectedNodeId: null,
        deviceIds: {},
        nodes: [],
        messages: [],
        createdAt: new Date().toISOString(),
      };
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
  async saveReport(report: import('../shared/model.js').RunReport) {
    const project = this.get(report.projectId);
    const directory = path.join(project.directory, 'reports');
    await fs.mkdir(directory, { recursive: true });
    await this.atomic(path.join(directory, report.id + '.json'), report);
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
    tab?: Project['tab'];
    nodes?: Project['nodes'];
    messages?: Project['messages'];
    tags?: string[];
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
        deviceIds: { ...current.deviceIds, ...input.deviceIds },
        revision: current.revision + (input.nodes || input.tags ? 1 : 0),
      });
      validateTree(next.nodes);
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
      this.state.projects[this.state.projects.indexOf(current)] = next;
      return next;
    });
  }
}
