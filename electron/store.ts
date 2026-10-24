import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  nodeSchema,
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
    const defaults: Settings = {
      theme: 'system',
      language: 'fr',
      projectsDirectory: path.join(this.documents, 'Cyberfox', 'Projects'),
      provider: 'codex',
      codexModel: '',
      copilotModel: '',
      wdaDeviceId: '',
      wdaUrl: 'http://127.0.0.1:8100',
    };
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
              JSON.parse(
                await fs.readFile(path.join(entry.directory, 'cyberfox.project.json'), 'utf8'),
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
  }) {
    return this.transaction(async () => {
      const current = this.get(input.id);
      const next = projectSchema.parse({ ...current, ...input });
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
