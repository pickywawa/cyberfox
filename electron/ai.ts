import { sessionTitle } from '../shared/session-title.js';
import {
  observedDefinition,
  validateScreenDefinitions,
  waitForScreenDefinition,
} from './screen-identity.js';
import { replayProposal } from './proposal-replay.js';
import { aiDecisionJsonSchema, AI_PROTOCOL_REMINDER } from '../shared/ai-protocol.js';
import { Codex } from '@openai/codex-sdk';
import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { command, commandEnv, sdkCodexBinary, copilotBinary } from './commands.js';
import {
  variablesSchema,
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
  private lastUsage?: { input: number; output: number };
  private loginProcess?: ChildProcess;
  private loginRunning = false;
  private active = new Map<string, AbortController>();
  private questions = new Map<string, { id: string; resolve: (answer: string) => void }>();
  answer(input: { projectId: string; questionId: string; answer: string }) {
    const pending = this.questions.get(input.projectId);
    if (!pending || pending.id !== input.questionId) throw new Error('Question expirée');
    pending.resolve(input.answer);
  }
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
          message:
            'Compte Codex connecté. Cyberfox peut utiliser cette session pour générer vos scénarios.',
          lastUsage: this.lastUsage,
          models,
        };
      }
      const client = await this.copilot();
      const auth = await client.getAuthStatus();
      const models = auth.isAuthenticated ? await client.listModels() : [];
      let quota: ProviderStatus['quota'];
      if (auth.isAuthenticated)
        try {
          const snapshots = (await client.rpc.account.getQuota({})).quotaSnapshots;
          const item = snapshots.premium_interactions;
          if (item && !item.isUnlimitedEntitlement && Number.isFinite(item.remainingPercentage))
            quota = {
              label: 'Copilot premium',
              usedPercent: Math.max(0, Math.min(100, 100 - item.remainingPercentage)),
            };
        } catch {
          /* Quotas are optional; unavailable never means zero usage. */
        }
      return {
        provider,
        quota,
        authenticated: auth.isAuthenticated,
        message: auth.statusMessage ?? auth.login ?? 'Connexion GitHub requise',
        models: models.map((m) => ({ id: m.id, name: m.name })),
      };
    } catch (e) {
      return { provider, authenticated: false, message: String(e), models: [] };
    }
  }
  async logout(provider: Settings['provider']) {
    if (this.active.size || this.loginRunning)
      throw new Error(
        'Arrêtez les demandes IA et la connexion en cours avant de vous déconnecter.',
      );
    if (provider === 'codex') {
      await command(sdkCodexBinary(), ['logout']);
      this.lastUsage = undefined;
    } else {
      const client = await this.copilot();
      await client.rpc.account.logout({});
      await client.stop();
      this.client = undefined;
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
  private async conversation(temp: string, signal: AbortSignal, structured = false) {
    const settings = this.store.state.settings;
    if (settings.provider === 'codex') {
      const thread = new Codex({
        codexPathOverride: sdkCodexBinary(),
        config: { features: { shell_tool: false, unified_exec: false, code_mode_host: false } },
      }).startThread({
        model: settings.codexModel || undefined,
        modelReasoningEffort:
          settings.reasoningEffort === 'default' ? undefined : settings.reasoningEffort,
        workingDirectory: temp,
        skipGitRepoCheck: true,
        sandboxMode: 'read-only',
        approvalPolicy: 'never',
        webSearchMode: 'disabled',
        networkAccessEnabled: false,
      });
      return {
        send: async (prompt: string) => {
          const turnTimeout = AbortSignal.timeout(120000);
          let result;
          try {
            result = await thread.run(prompt, {
              signal: AbortSignal.any([signal, turnTimeout]),
              ...(structured ? { outputSchema: aiDecisionJsonSchema } : {}),
            });
          } catch (error) {
            if (turnTimeout.aborted && !signal.aborted)
              throw new Error(
                'Codex n’a pas répondu sous 2 minutes. Les actions déjà réalisées sur les appareils restent effectives. Réessayez depuis l’écran actuel ou choisissez un effort de raisonnement inférieur.',
              );
            throw error;
          }
          if (result.usage)
            this.lastUsage = {
              input: result.usage.input_tokens,
              output: result.usage.output_tokens,
            };
          return result.finalResponse;
        },
        close: async () => {},
      };
    }
    const session = await (
      await this.copilot()
    ).createSession({
      model: settings.copilotModel || undefined,
      reasoningEffort:
        settings.reasoningEffort === 'default' ? undefined : settings.reasoningEffort,
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
    sessionId?: string;
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
    const settings = this.store.state.settings;
    const timeout = setTimeout(
      () => controller.abort(),
      settings.creationTimeoutMinutes * 60 * 1000,
    );
    const traceId = crypto.randomUUID();
    let traceDirectory: string | undefined;
    const actions = new Map<string, import('../shared/model.js').Variant[]>();
    const record = async (entry: unknown) => {
      if (!traceDirectory) return;
      const secrets = Object.values(this.store.get(input.projectId).variables ?? {}).filter(
        Boolean,
      );
      for (const [key, value] of Object.entries(process.env))
        if (key.startsWith('CYBERFOX_SECRET_') && value) secrets.push(value);
      secrets.sort((a, b) => b.length - a.length);
      const serialized = JSON.stringify({ at: new Date().toISOString(), entry }, (_key, value) => {
        if (value && typeof value === 'object' && value.password)
          return { ...value, text: '[REDACTED]', label: '[REDACTED]' };
        if (typeof value === 'string') {
          for (const secret of secrets) value = value.split(secret).join('[REDACTED]');
        }
        return value;
      });
      await fs.appendFile(path.join(traceDirectory, traceId + '.jsonl'), serialized + '\n', {
        mode: 0o600,
      });
    };
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'cyberfox-ai-'));
    const owner = 'ai:' + input.projectId;
    let conversation: Awaited<ReturnType<Ai['conversation']>> | undefined;
    try {
      const project = structuredClone(this.store.get(input.projectId));
      traceDirectory = path.join(project.directory, 'explorations');
      await fs.mkdir(traceDirectory, { recursive: true });
      await record({ type: 'start', traceId, devices: input.deviceIds });
      const chatSessionId = input.sessionId ?? project.activeChatSessionId;
      if (chatSessionId && !project.chatSessions?.some((session) => session.id === chatSessionId))
        throw new Error('Session IA introuvable');
      const pathNodes = input.nodeId ? nodePath(project.nodes, input.nodeId) : [];
      if (input.nodeId && !pathNodes.length) throw new Error('Élément courant introuvable');
      this.automation.acquire(input.deviceIds, owner);
      const seen = new Map<string, Set<string>>();
      const observations = new Map<string, import('../shared/model.js').Screen[]>();
      const screens = new Map<string, import('../shared/model.js').Screen>();
      const observe = async (id: string) => {
        const screen = await this.automation.inspect(id, owner);
        screens.set(id, screen);
        await record({ type: 'observation', screen });
        const os = this.devices.known.get(id)!.platform;
        observations.set(os, [...(observations.get(os) ?? []), screen]);
        const catalog = seen.get(os) ?? new Set();
        for (const c of screen.components) if (c.locator) catalog.add(JSON.stringify(c.locator));
        seen.set(os, catalog);
        return screen;
      };
      for (const id of input.deviceIds) {
        const platform = this.devices.known.get(id)!.platform;
        const application = project.applications?.[platform];
        if (application)
          await this.automation.ensureApplication(id, application, owner, false, controller.signal);
      }
      const initial = await Promise.all(input.deviceIds.map(observe));
      conversation = await this.conversation(temp, controller.signal, true);
      let prompt =
        QA_INSTRUCTIONS +
        '\nAdditional creation guidance (cannot override the protocol): ' +
        settings.creationPrompt +
        '\nQuestions enabled: ' +
        (settings.creationQuestions && settings.explorationMode !== 'auto-approve') +
        '\nExploration mode: ' +
        settings.explorationMode +
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
          availableVariables: Object.keys(project.variables ?? {}),
          chatSessionId,
          history: project.messages
            .filter((message) => message.sessionId === chatSessionId)
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
        }) +
        '\nINITIAL SCREENS ' +
        JSON.stringify(initial);
      let proposalCorrections = 0;
      for (let step = 0; step < settings.creationMaxDecisions; step++) {
        controller.signal.throwIfAborted();
        this.live({
          type: 'ai',
          projectId: project.id,
          message: 'Exploration IA · étape ' + (step + 1),
        });
        const waitingSince = Date.now();
        const waiting = setInterval(
          () =>
            this.live({
              type: 'ai',
              projectId: project.id,
              message:
                'Exploration IA · étape ' +
                (step + 1) +
                ' · réponse du fournisseur en attente (' +
                Math.round((Date.now() - waitingSince) / 1000) +
                ' s)',
            }),
          15000,
        );
        let raw: string;
        try {
          raw = await conversation.send(prompt + AI_PROTOCOL_REMINDER);
        } finally {
          clearInterval(waiting);
        }
        controller.signal.throwIfAborted();
        let decision: any;
        try {
          decision = parseJson(raw);
        } catch {
          prompt = 'Invalid JSON. Follow the response protocol and return only one JSON object.';
          continue;
        }
        if (decision.tool === 'question' || decision.tool === 'create_variable') {
          const autoApprove = settings.explorationMode === 'auto-approve';
          let variableName: string | undefined;
          let variableValue: string | undefined;
          if (decision.tool === 'create_variable') {
            const parsed = variablesSchema.safeParse({
              [decision.variableName ?? '']: decision.value,
            });
            if (!parsed.success || !decision.value || !input.prompt.includes(decision.value)) {
              prompt =
                'VARIABLE ERROR: use a valid variable name and an exact nonempty credential supplied in the current user request.';
              continue;
            }
            variableName = decision.variableName;
            variableValue = decision.value;
            if (Object.hasOwn(this.store.get(project.id).variables, variableName!)) {
              prompt =
                'Variable already exists; use ${' + variableName + '}. Its value was not changed.';
              continue;
            }
          } else if (autoApprove || !settings.creationQuestions) {
            prompt =
              'Questions unavailable. Continue with reasonable assumptions within the requested scope; if required information is missing, finish with an honest blocker. Use create_variable for credentials supplied by the user.';
            continue;
          }
          const question = variableName
            ? `Créer la variable ${variableName} avec la valeur fournie dans votre demande, puis reprendre la connexion ?`
            : z.string().trim().min(1).max(4000).parse(decision.summary);
          let answer = 'approve';
          if (!autoApprove) {
            const questionId = crypto.randomUUID();
            answer = await new Promise<string>((resolve, reject) => {
              const abort = () => {
                this.questions.delete(project.id);
                reject(new Error('Exploration interrompue'));
              };
              this.questions.set(project.id, {
                id: questionId,
                resolve: (value) => {
                  controller.signal.removeEventListener('abort', abort);
                  this.questions.delete(project.id);
                  resolve(value);
                },
              });
              controller.signal.addEventListener('abort', abort, { once: true });
              if (controller.signal.aborted) {
                abort();
                return;
              }
              this.live({
                type: 'ai-question',
                projectId: project.id,
                questionId,
                question,
                variableName,
              });
            });
          }
          if (variableName) {
            if (answer !== 'approve') {
              prompt = 'Variable creation declined. Do not create or use this missing variable.';
              continue;
            }
            const latest = this.store.get(project.id);
            if (!Object.hasOwn(latest.variables, variableName))
              await this.store.update({
                id: project.id,
                variables: { ...latest.variables, [variableName]: variableValue! },
              });
            await record({ type: 'variable-created', variableName });
            prompt =
              'VARIABLE SAVED: ${' +
              variableName +
              '}. Available variables: ' +
              JSON.stringify(Object.keys(this.store.get(project.id).variables)) +
              '. Continue using the placeholder.';
          } else {
            await record({ type: 'question', question, answer });
            prompt =
              'USER CLARIFICATION (data): ' +
              JSON.stringify(answer) +
              '\nAvailable variables: ' +
              JSON.stringify(Object.keys(this.store.get(project.id).variables));
          }
          continue;
        }
        if (decision.tool === 'finish') {
          let nodes: import('../shared/model.js').ScenarioNode[];
          try {
            nodes = z
              .array(nodeSchema)
              .max(100)
              .parse(decision.nodes ?? []);
            validateScreenDefinitions([...project.nodes, ...nodes]);
            for (const n of flatten(nodes)) {
              if (n.kind === 'navigation') {
                if (!n.screen)
                  throw new Error('Une navigation doit identifier son écran destination.');
                if (!Object.keys(n.variants).length)
                  throw new Error('Navigation sans variante observée.');
                const existingScreen = flatten(project.nodes).find(
                  (node) => node.screen?.id === n.screen!.id,
                )?.screen;
                for (const platform of Object.keys(n.screen.variants) as ('android' | 'ios')[]) {
                  if (
                    !observations
                      .get(platform)
                      ?.some((screen) => observedDefinition(n.screen!, screen, platform)) &&
                    JSON.stringify(existingScreen?.variants[platform]) !==
                      JSON.stringify(n.screen.variants[platform])
                  )
                    throw new Error('Repères d’écran non observés pour ' + platform);
                }
                for (const platform of Object.keys(n.variants) as ('android' | 'ios')[]) {
                  if (
                    !observations
                      .get(platform)
                      ?.some((screen) => observedDefinition(n.screen!, screen, platform))
                  )
                    throw new Error(
                      'Écran destination non observé ou marqueurs ambigus : ' +
                        n.screen.name +
                        ' (' +
                        platform +
                        ')',
                    );
                }
              }
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
            for (const id of input.deviceIds) {
              const platform = this.devices.known.get(id)!.platform;
              const executed = actions.get(id) ?? [];
              let cursor = 0;
              for (const node of flatten(nodes)) {
                const v = node.variants[platform];
                if (!v || node.kind === 'scenario' || node.kind === 'test') continue;
                const match = executed.findIndex(
                  (action, index) =>
                    index >= cursor &&
                    action.operation === v.operation &&
                    action.value === v.value &&
                    JSON.stringify(action.locator) === JSON.stringify(v.locator),
                );
                if (match < 0)
                  throw new Error(
                    'Interaction proposée absente de la trace réussie : ' +
                      node.name +
                      ' (' +
                      platform +
                      ')',
                  );
                node.variants[platform] = structuredClone(executed[match]);
                cursor = match + 1;
              }
            }
          } catch (error) {
            controller.signal.throwIfAborted();
            await record({
              type: 'proposal-invalid',
              message: String(error),
              nodes: decision.nodes,
            });
            if (proposalCorrections++ >= 2) throw error;
            prompt =
              'PROPOSAL VALIDATION ERROR: ' +
              String(error) +
              '\nCorrect the proposal and return finish again. Device actions already succeeded; do not repeat login or typing to repair proposal metadata. Preserve grounded steps and assertions. Every navigation MUST include screen:{id,name,variants:{ios:{markers:[{using,value}]}}} (or android), identifying its DESTINATION using unique selectors co-occurring in an observed screen. Reuse existing definitions when applicable. Never invent a destination or markers, and never remove a check to hide a failure. If evidence is insufficient, explain the gap and omit only the unverified step.' +
              '\nPROPOSAL TO CORRECT ' +
              JSON.stringify(decision.nodes) +
              '\nOBSERVED SCREENS ' +
              JSON.stringify(Object.fromEntries(observations));
            continue;
          }
          const replay: import('../shared/model.js').ReplayResult[] = [];
          for (const platform of project.platforms.includes('flutter')
            ? (['android', 'ios'] as const)
            : project.platforms.filter((os): os is 'android' | 'ios' => os !== 'flutter')) {
            const id = input.deviceIds.find(
              (id) => this.devices.known.get(id)?.platform === platform,
            );
            const application = project.applications?.[platform];
            const result: import('../shared/model.js').ReplayResult = {
              platform,
              status: 'blocked',
              message: 'Application à lancer non configurée.',
            };
            if (!settings.creationReplay) {
              result.status = 'skipped';
              result.message = 'Rejeu désactivé.';
            } else if (!id) result.message = 'Appareil absent.';
            else if (!flatten(nodes).some((node) => node.variants[platform]))
              result.message = 'Aucune variante proposée.';
            else if (application) {
              try {
                await this.automation.ensureApplication(
                  id,
                  application,
                  owner,
                  true,
                  controller.signal,
                );
                const screen = await observe(id);
                const fingerprint = (screen: import('../shared/model.js').Screen) =>
                  JSON.stringify(
                    screen.components.map(({ locator, text, enabled }) => ({
                      locator,
                      text,
                      enabled,
                    })),
                  );
                if (
                  fingerprint(screen) !==
                  fingerprint(initial.find((screen) => screen.deviceId === id)!)
                )
                  throw new Error(
                    'État initial non retrouvé après relancement (données conservées).',
                  );
                await replayProposal(
                  nodes,
                  platform,
                  (variant, kind) =>
                    this.automation.perform(
                      id,
                      variant,
                      kind,
                      owner,
                      controller.signal,
                      this.store.get(project.id).variables ?? {},
                    ),
                  record,
                  controller.signal,
                  async (node) => {
                    if (node.kind !== 'navigation') return;
                    if (!node.screen)
                      throw new Error('Écran destination non configuré : ' + node.name);
                    await waitForScreenDefinition(
                      () => this.automation.inspect(id, owner),
                      node.screen,
                      platform,
                      [...project.nodes, ...nodes],
                      node.variants[platform]?.timeoutMs ?? 10000,
                      controller.signal,
                    );
                  },
                );
                result.status = 'passed';
                result.message = 'Rejeu complet avec assertions depuis l’état initial observé.';
              } catch (error) {
                result.status = 'failed';
                result.message = String(error);
              }
            }
            replay.push(result);
          }
          controller.signal.throwIfAborted();
          await record({ type: 'proposal', nodes, replay });
          const text = String(decision.summary ?? 'Proposition de scénario');
          const current = this.store.get(project.id);
          const saved = await this.store.update({
            id: project.id,
            chatSessions: current.chatSessions?.map((session) =>
              session.id === chatSessionId && /^Session \d+$/.test(session.name)
                ? {
                    ...session,
                    name: sessionTitle(
                      typeof decision.sessionTitle === 'string' && decision.sessionTitle.trim()
                        ? decision.sessionTitle
                        : input.prompt,
                    ),
                  }
                : session,
            ),
            messages: [
              ...current.messages,
              {
                id: crypto.randomUUID(),
                role: 'user',
                sessionId: chatSessionId ?? undefined,
                content: input.prompt,
                at: new Date().toISOString(),
              },
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                sessionId: chatSessionId ?? undefined,
                content: text,
                at: new Date().toISOString(),
              },
            ],
          });
          return {
            text,
            replay,
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
            const variant: import('../shared/model.js').Variant = {
              operation,
              locator: operation === 'back' ? undefined : component?.locator,
              value: z
                .string()
                .max(5000)
                .parse(decision.value ?? ''),
              assertion: 'visible',
              expected: '',
              timeoutMs: 10000,
            };
            if (
              operation === 'type' &&
              component?.password &&
              !/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(variant.value)
            )
              throw new Error(
                'Utilisez une variable projet pour saisir un mot de passe : ${VARIABLE_NAME}.',
              );
            await this.automation.perform(
              id,
              variant,
              'action',
              owner,
              controller.signal,
              this.store.get(project.id).variables ?? {},
            );
            actions.set(id, [...(actions.get(id) ?? []), variant]);
            await record({ type: 'action', deviceId: id, variant, status: 'completed' });
            prompt = 'ACTION COMPLETED. NEW SCREEN ' + JSON.stringify(await observe(id));
          } else prompt = 'Unknown tool. Use inspect, perform, question or finish.';
        } catch (e) {
          controller.signal.throwIfAborted();
          await record({ type: 'error', message: String(e) });
          prompt =
            'TOOL ERROR ' + String(e) + '. Inspect again or finish with an honest explanation.';
        }
      }
      throw new Error(
        'Limite de ' +
          settings.creationMaxDecisions +
          ' décisions atteinte ; réduisez le périmètre du scénario.',
      );
    } catch (error) {
      await record({
        type: 'stopped',
        message: String(error),
        cancelled: controller.signal.aborted,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
      this.questions.delete(input.projectId);
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
