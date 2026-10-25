import { Codex } from '@openai/codex-sdk';
import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { command, commandEnv, sdkCodexBinary, copilotBinary } from './commands.js';
import {
  parseProposal,
  parseJson,
  nodeSchema,
  nodePath,
  validateTree,
  flatten,
  type RunEntry,
  type RunReport,
  type LiveEvent,
  type ProviderStatus,
  type Settings,
  type LoginProgress,
  type AiReply,
} from '../shared/model.js';
import type { Store } from './store.js';
import type { Devices } from './devices.js';
import type { Automation } from './automation.js';
import { QA_INSTRUCTIONS } from './qa-instructions.js';
import { z } from 'zod';
export class Ai {
  private client?: Promise<CopilotClient>;
  private loginProcess?: ChildProcess;
  private loginRunning = false;
  private active = new Map<string, AbortController>();
  constructor(
    private store: Store,
    private devices: Devices,
    private emit: (event: LoginProgress) => void,
    private openAuth: (url: string) => Promise<void>,
    private automation: Automation,
    private live: (event: LiveEvent) => void,
  ) {}
  private copilot() {
    if (!this.client)
      this.client = (async () => {
        // Native binaries must execute outside Electron's read-only ASAR archive.
        const client = new CopilotClient({
          env: commandEnv,
          logLevel: 'error',
          connection: RuntimeConnection.forStdio({ path: copilotBinary() }),
        });
        await client.start();
        return client;
      })().catch((e) => {
        this.client = undefined;
        throw e;
      });
    return this.client;
  }
  async status(provider: Settings['provider']): Promise<ProviderStatus> {
    try {
      if (provider === 'codex') {
        await command(sdkCodexBinary(), ['login', 'status']);
        let models: ProviderStatus['models'] = [];
        try {
          const cached = JSON.parse(
            await fs.readFile(
              path.join(
                process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'),
                'models_cache.json',
              ),
              'utf8',
            ),
          );
          models = (cached.models ?? [])
            .filter((m: any) => m.visibility !== 'hide')
            .map((m: any) => ({ id: m.slug, name: m.display_name ?? m.slug }));
        } catch {
          /* User can enter an explicit model ID or keep the CLI default. */
        }
        return {
          provider,
          authenticated: true,
          message: 'Session Codex locale disponible',
          models,
        };
      }
      const client = await this.copilot();
      const auth = await client.getAuthStatus();
      const models = auth.isAuthenticated ? await client.listModels() : [];
      return {
        provider,
        authenticated: auth.isAuthenticated,
        message: auth.statusMessage ?? auth.login ?? 'Connexion GitHub requise',
        models: models.map((m) => ({ id: m.id, name: m.name })),
      };
    } catch (e) {
      return { provider, authenticated: false, message: String(e), models: [] };
    }
  }
  async login(provider: Settings['provider']) {
    if (this.loginRunning) throw new Error('Une connexion est déjà en cours');
    this.loginRunning = true;
    const report = (output: string, running = true) => this.emit({ provider, output, running });
    report('Connexion en cours…');
    const binary = provider === 'codex' ? sdkCodexBinary() : copilotBinary();
    const args = provider === 'codex' ? ['login', '--device-auth'] : ['login', '--device-code'];
    const child = spawn(binary, args, {
      env: commandEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.loginProcess = child;
    let output = '';
    let opened = false;
    const append = (data: Buffer) => {
      output = (output + data.toString()).replace(/\x1b\[[0-9;]*m/g, '').slice(-12000);
      report(output);
      if (!opened) {
        const url = output.match(/https:\/\/(?:auth\.openai\.com|github\.com)\/[^\s]+/)?.[0];
        if (url) {
          opened = true;
          void this.openAuth(url).catch((e) => report(output + '\n' + String(e)));
        }
      }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const timer = setTimeout(() => child.kill(), 5 * 60 * 1000);
    const finish = (message: string) => {
      clearTimeout(timer);
      this.loginRunning = false;
      this.loginProcess = undefined;
      report(message, false);
    };
    child.once('error', (e) => finish(e.message));
    child.once('close', (code) => {
      if (provider === 'copilot' && this.client) {
        void this.client.then((c) => c.stop()).catch(() => {});
        this.client = undefined;
      }
      finish(
        `${output}\n${code === 0 ? 'Connexion terminée. Actualisez le statut.' : 'Connexion interrompue ou refusée.'}`,
      );
    });
  }

  cancel(projectId: string) {
    this.active.get(projectId)?.abort();
  }
  private async conversation(temp: string, signal: AbortSignal) {
    const settings = this.store.state.settings;
    if (settings.provider === 'codex') {
      const thread = new Codex({ codexPathOverride: sdkCodexBinary() }).startThread({
        model: settings.codexModel || undefined,
        workingDirectory: temp,
        skipGitRepoCheck: true,
        sandboxMode: 'read-only',
        approvalPolicy: 'never',
        webSearchMode: 'disabled',
        networkAccessEnabled: false,
      });
      return {
        send: async (prompt: string) => (await thread.run(prompt, { signal })).finalResponse,
        close: async () => {},
      };
    }
    const session = await (
      await this.copilot()
    ).createSession({
      model: settings.copilotModel || undefined,
      workingDirectory: temp,
      availableTools: [],
      onPermissionRequest: () => ({ kind: 'denied-by-rules', rules: [] }),
      systemMessage: { mode: 'replace', content: QA_INSTRUCTIONS },
    });
    const abort = () => {
      void session.abort().catch(() => {});
    };
    signal.addEventListener('abort', abort);
    return {
      send: async (prompt: string) => {
        signal.throwIfAborted();
        return (await session.sendAndWait({ prompt }, 120000))?.data.content ?? '';
      },
      close: async () => {
        signal.removeEventListener('abort', abort);
        await session.disconnect();
      },
    };
  }
  async ask(input: {
    projectId: string;
    prompt: string;
    nodeId?: string;
    deviceIds: string[];
  }): Promise<AiReply> {
    if (this.active.has(input.projectId))
      throw new Error('Une demande est déjà en cours pour ce projet');
    if (!input.deviceIds.length)
      throw new Error(
        'Associez un appareil et explorez ses composants avant de générer un scénario.',
      );
    const controller = new AbortController();
    this.active.set(input.projectId, controller);
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberfox-ai-'));
    const owner = 'ai:' + input.projectId;
    let conversation: Awaited<ReturnType<Ai['conversation']>> | undefined;
    try {
      const project = structuredClone(this.store.get(input.projectId));
      const pathNodes = input.nodeId ? nodePath(project.nodes, input.nodeId) : [];
      if (input.nodeId && !pathNodes.length) throw new Error('Élément courant introuvable');
      this.automation.acquire(input.deviceIds, owner);
      const seen = new Map<string, Set<string>>();
      const screens = new Map<string, import('../shared/model.js').Screen>();
      const observe = async (id: string) => {
        const screen = await this.automation.inspect(id, owner);
        screens.set(id, screen);
        const os = this.devices.known.get(id)!.platform;
        const catalog = seen.get(os) ?? new Set();
        for (const c of screen.components) if (c.locator) catalog.add(JSON.stringify(c.locator));
        seen.set(os, catalog);
        return screen;
      };
      const initial = await Promise.all(input.deviceIds.map(observe));
      conversation = await this.conversation(temp, controller.signal);
      let prompt =
        QA_INSTRUCTIONS +
        '\nLanguage: ' +
        this.store.state.settings.language +
        '\nMETADATA ' +
        JSON.stringify({
          project: { name: project.name, platforms: project.platforms, tags: project.tags },
          currentPath: pathNodes.map(({ id, name, kind }) => ({ id, name, kind })),
          parentId: input.nodeId ?? null,
          existingNodes: project.nodes,
          devices: input.deviceIds.map((id) => this.devices.known.get(id)),
          request: input.prompt,
        }) +
        '\nINITIAL SCREENS ' +
        JSON.stringify(initial);
      for (let step = 0; step < 40; step++) {
        controller.signal.throwIfAborted();
        this.live({
          type: 'ai',
          projectId: project.id,
          message: 'Exploration IA · étape ' + (step + 1),
        });
        const raw = await conversation.send(prompt);
        controller.signal.throwIfAborted();
        let decision: any;
        try {
          decision = parseJson(raw);
        } catch {
          prompt = 'Invalid JSON. Follow the response protocol and return only one JSON object.';
          continue;
        }
        if (decision.tool === 'finish') {
          const nodes = z
            .array(nodeSchema)
            .max(100)
            .parse(decision.nodes ?? []);
          for (const n of flatten(nodes)) {
            if (project.nodes.some((old) => flatten([old]).some((x) => x.id === n.id)))
              throw new Error('La proposition réutilise un identifiant existant');
            for (const [os, v] of Object.entries(n.variants)) {
              if (
                v &&
                v.operation !== 'back' &&
                (!v.locator || !seen.get(os)?.has(JSON.stringify(v.locator)))
              )
                throw new Error('La proposition contient un sélecteur non observé pour ' + os);
            }
          }
          const combine = (
            list: import('../shared/model.js').ScenarioNode[],
          ): import('../shared/model.js').ScenarioNode[] =>
            list.map((n) =>
              n.id === input.nodeId
                ? { ...n, children: [...n.children, ...nodes] }
                : { ...n, children: combine(n.children) },
            );
          validateTree(input.nodeId ? combine(project.nodes) : [...project.nodes, ...nodes]);
          const text = String(decision.summary ?? 'Proposition de scénario');
          const current = this.store.get(project.id);
          const saved = await this.store.update({
            id: project.id,
            messages: [
              ...current.messages,
              {
                id: crypto.randomUUID(),
                role: 'user',
                content: input.prompt,
                at: new Date().toISOString(),
              },
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: text,
                at: new Date().toISOString(),
              },
            ],
          });
          return {
            text,
            proposal: nodes.length ? nodes : undefined,
            parentId: input.nodeId,
            baseRevision: saved.revision,
          };
        }
        try {
          const id = z.string().parse(decision.deviceId);
          if (!input.deviceIds.includes(id)) throw new Error('Appareil hors périmètre');
          if (decision.tool === 'inspect') prompt = 'SCREEN ' + JSON.stringify(await observe(id));
          else if (decision.tool === 'perform') {
            const operation = z.enum(['tap', 'type', 'clear', 'back']).parse(decision.operation);
            const component = screens
              .get(id)
              ?.components.find((c) => c.id === decision.componentId);
            if (operation !== 'back' && !component?.locator)
              throw new Error('Composant absent du dernier écran inspecté');
            await this.automation.perform(
              id,
              {
                operation,
                locator: component?.locator,
                value: z
                  .string()
                  .max(5000)
                  .parse(decision.value ?? ''),
                assertion: 'visible',
                expected: '',
                timeoutMs: 10000,
              },
              'action',
              owner,
            );
            prompt = 'ACTION COMPLETED. NEW SCREEN ' + JSON.stringify(await observe(id));
          } else prompt = 'Unknown tool. Use inspect, perform or finish.';
        } catch (e) {
          prompt =
            'TOOL ERROR ' + String(e) + '. Inspect again or finish with an honest explanation.';
        }
      }
      throw new Error('Limite de 40 étapes atteinte ; réduisez le périmètre du scénario.');
    } finally {
      clearTimeout(timeout);
      this.active.delete(input.projectId);
      this.automation.release(owner);
      await conversation?.close();
      await fs.rm(temp, { recursive: true, force: true });
      this.live({ type: 'ai', projectId: input.projectId, message: '' });
    }
  }
  async analyze(entry: RunEntry, report: RunReport): Promise<string> {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberfox-analysis-'));
    let chat: Awaited<ReturnType<Ai['conversation']>> | undefined;
    try {
      chat = await this.conversation(temp, AbortSignal.timeout(120000));
      const node = flatten(report.snapshot).find((n) => n.id === entry.nodeId);
      return await chat.send(
        QA_INSTRUCTIONS +
          '\nAnalyze only, do not use the exploration protocol. Language: ' +
          this.store.state.settings.language +
          '\n' +
          JSON.stringify({
            node,
            platform: entry.platform,
            error: entry.message,
            previousSteps: report.entries
              .filter((e) => e.deviceId === entry.deviceId)
              .slice(-8)
              .map(({ nodeName, status, message }) => ({ nodeName, status, message })),
          }),
      );
    } finally {
      await chat?.close();
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  async stop() {
    for (const controller of this.active.values()) controller.abort();
    this.loginProcess?.kill();
    if (this.client) await (await this.client.catch(() => null))?.stop();
  }
}
