import {
  identifyScreen,
  observedDefinition,
  waitForScreenDefinition,
  validateScreenDefinitions,
} from './screen-identity.js';
import { randomUUID } from 'node:crypto';
import {
  flatten,
  requiredOS,
  nodePath,
  type RunReport,
  type RunEntry,
  type ScenarioNode,
  type LiveEvent,
  type Variant,
} from '../shared/model.js';
import type { Store } from './store.js';
import type { Automation } from './automation.js';
import type { Devices } from './devices.js';
export class Runner {
  private reports = new Map<string, RunReport>();
  private active?: { report: RunReport; abort: AbortController };
  private persistence = Promise.resolve();
  private task?: Promise<void>;
  private maintenance = new Set<string>();
  constructor(
    private store: Store,
    private automation: Automation,
    private devices: Devices,
    private emit: (event: LiveEvent) => void,
    private analyzeFailure: (entry: RunEntry, report: RunReport) => Promise<string>,
  ) {}
  async loadCampaign(projectId: string, campaignId: string) {
    const detail = await this.store.loadCampaign(projectId, campaignId);
    for (let index = 0; index < detail.reports.length; index++) {
      const saved = detail.reports[index];
      const memory = this.reports.get(saved.id);
      if (memory) {
        detail.reports[index] = structuredClone(memory);
        continue;
      }
      if (saved.status === 'running') {
        saved.status = 'cancelled';
        saved.finishedAt = new Date().toISOString();
        for (const entry of saved.entries)
          if (entry.status === 'running') {
            entry.status = 'cancelled';
            entry.finishedAt = saved.finishedAt;
            entry.message = 'Exécution interrompue par la fermeture du logiciel';
          }
        await this.store.saveReport(saved);
      }
      for (const entry of saved.entries)
        if (entry.analysisState === 'running') entry.analysisState = 'pending';
      this.reports.set(saved.id, saved);
    }
    return detail;
  }
  async replayFrame(projectId: string, runId: string, entryId: string) {
    const campaignId = this.store.get(projectId).activeCampaignId;
    if (!campaignId) throw new Error('Aucune campagne ouverte');
    let report = this.reports.get(runId);
    if (!report) {
      await this.loadCampaign(projectId, campaignId);
      report = this.reports.get(runId);
    }
    if (!report || report.projectId !== projectId || report.campaignId !== campaignId)
      throw new Error('Capture hors campagne');
    const entry = report.entries.find((entry) => entry.id === entryId);
    if (!entry?.completedAt) throw new Error('Étape sans capture terminée');
    return { runId, entry: structuredClone(entry) };
  }
  async cleanCampaigns(projectId: string, campaignId?: string) {
    if (this.maintenance.has(projectId)) throw new Error('Nettoyage déjà en cours');
    this.maintenance.add(projectId);
    try {
      if (this.active?.report.projectId === projectId)
        throw new Error('Arrêtez l’exécution avant de nettoyer les campagnes.');
      if (
        [...this.reports.values()].some(
          (report) =>
            report.projectId === projectId &&
            (!campaignId || report.campaignId === campaignId) &&
            report.entries.some((entry) => entry.analysisState === 'running'),
        )
      )
        throw new Error('Une analyse est encore en cours.');
      await this.persistence;
      await this.store.cleanCampaigns(projectId, campaignId);
      for (const [id, report] of this.reports)
        if (report.projectId === projectId && (!campaignId || report.campaignId === campaignId))
          this.reports.delete(id);
    } finally {
      this.maintenance.delete(projectId);
    }
  }
  async current(projectId: string) {
    const memory = [...this.reports.values()].reverse().find((r) => r.projectId === projectId);
    if (memory) return memory;
    const saved = await this.store.latestReport(projectId);
    if (saved) {
      for (const entry of saved.entries)
        if (entry.analysisState === 'running') entry.analysisState = 'pending';
      if (saved.status === 'running') {
        saved.status = 'cancelled';
        saved.finishedAt = new Date().toISOString();
        for (const entry of saved.entries)
          if (entry.status === 'running') {
            entry.status = 'cancelled';
            entry.message = 'Exécution interrompue par la fermeture de l’application';
          }
        await this.store.saveReport(saved);
      }
      this.reports.set(saved.id, saved);
    }
    return saved;
  }
  private publish(report: RunReport) {
    const snapshot = structuredClone(report);
    this.emit({ type: 'run', report: snapshot });
    this.persistence = this.persistence
      .catch(() => {})
      .then(() => this.store.saveReport(snapshot))
      .catch((error) => {
        report.persistenceError = String(error);
        this.emit({ type: 'run', report: structuredClone(report) });
      });
  }
  async start(input: {
    resetCampaign?: boolean;
    projectId: string;
    campaignId?: string;
    platform?: import('../shared/model.js').OS;
    nodeId?: string;
    deviceIds: string[];
  }) {
    if (this.active) throw new Error('Une exécution est déjà en cours');
    if (this.maintenance.has(input.projectId)) throw new Error('Nettoyage de campagne en cours');
    const project = this.store.get(input.projectId);
    const campaignId = input.campaignId ?? project.activeCampaignId;
    if (!campaignId)
      throw new Error('Créez ou sélectionnez une campagne avant de lancer les tests.');
    const { campaign } = await this.store.loadCampaign(project.id, campaignId);
    if (campaign.status !== 'open')
      throw new Error('Cette campagne est terminée. Rouvrez-la pour poursuivre.');
    if (this.active) throw new Error('Une exécution est déjà en cours');
    if (this.maintenance.has(project.id)) throw new Error('Nettoyage de campagne en cours');
    const requestedOS = input.platform ? [input.platform] : requiredOS(project);
    if (requestedOS.some((os) => !requiredOS(project).includes(os)))
      throw new Error('OS incompatible avec le projet');
    validateScreenDefinitions(project.nodes);
    const path = input.nodeId ? nodePath(project.nodes, input.nodeId) : [];
    const selected = path.at(-1);
    const parent = path.at(-2);
    const siblingIndex = parent?.children.findIndex((node) => node.id === selected?.id) ?? -1;
    const guard = selected?.preconditionId ? parent?.children[siblingIndex - 1] : undefined;
    const roots = structuredClone(
      !input.nodeId
        ? project.nodes
        : !selected
          ? []
          : selected.kind === 'scenario'
            ? [selected]
            : [
                {
                  ...path[0],
                  name: path[0].name + ' (partiel)',
                  children: [
                    ...(guard ? [{ ...guard, preconditionId: null, children: [] }] : []),
                    selected,
                  ],
                },
              ],
    );
    if (!roots.length) throw new Error('Aucun scénario à exécuter');
    const ids = [...new Set(input.deviceIds)];
    const devices = ids.map((id) => this.devices.known.get(id));
    if (!ids.length) throw new Error('Associez au moins un appareil pour lancer une exécution.');
    if (devices.some((d) => !d || d.status !== 'ready')) throw new Error('Appareil non connecté');
    if (new Set(devices.map((d) => d!.platform)).size !== devices.length)
      throw new Error('Un seul appareil par OS');
    if (devices.some((d) => !requestedOS.includes(d!.platform)))
      throw new Error('Appareil incompatible avec le projet');
    if (input.resetCampaign) {
      if (input.nodeId || input.platform)
        throw new Error('Le nettoyage nécessite une exécution complète.');
      await this.cleanCampaigns(project.id, campaignId);
      if (this.active) throw new Error('Une exécution est déjà en cours');
    }
    const report: RunReport = {
      id: randomUUID(),
      projectId: project.id,
      campaignId,
      platforms: requestedOS,
      startedAt: new Date().toISOString(),
      status: 'running',
      entries: [],
      snapshot: roots,
    };
    const abort = new AbortController();
    this.automation.acquire(ids, report.id);
    this.active = { report, abort };
    this.reports.set(report.id, report);
    this.publish(report);
    for (const os of requestedOS)
      if (!devices.some((d) => d?.platform === os))
        report.entries.push({
          id: randomUUID(),
          nodeId: roots[0].id,
          nodeName: 'Appareil ' + os,
          deviceId: 'missing:' + os,
          platform: os,
          status: 'blocked',
          message: 'Aucun appareil appairé pour cet OS',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
    this.task = this.execute(
      report,
      ids,
      abort,
      structuredClone(project.variables ?? {}),
      project.applications,
      structuredClone(project.nodes),
      input.resetCampaign === true,
    )
      .catch((error) => {
        report.status = 'failed';
        report.finishedAt = new Date().toISOString();
        report.entries.push({
          id: randomUUID(),
          nodeId: 'engine',
          nodeName: 'Moteur',
          deviceId: '',
          platform: 'android',
          status: 'failed',
          message: String(error),
          startedAt: new Date().toISOString(),
        });
        this.publish(report);
      })
      .finally(() => {
        this.automation.release(report.id);
        if (this.active?.report.id === report.id) this.active = undefined;
      });
    return structuredClone(report);
  }
  private async execute(
    report: RunReport,
    deviceIds: string[],
    abort: AbortController,
    variables: Record<string, string>,
    applications: import('../shared/model.js').Project['applications'],
    allNodes: ScenarioNode[],
    restartApplication: boolean,
  ) {
    const outcomes = await Promise.allSettled(
      deviceIds.map(async (deviceId) => {
        const os = this.devices.known.get(deviceId)!.platform;
        const observe = async () => {
          try {
            return identifyScreen(await this.automation.inspect(deviceId, report.id), os, allNodes);
          } catch {
            return {
              id: 'unavailable',
              name: 'Écran indisponible',
              platform: os,
              identified: false,
            };
          }
        };
        const completeCapture = async (entry: RunEntry, outcome = entry.status) => {
          entry.outcome = outcome;
          entry.operationMessage = entry.message;
          entry.screenAfter = await observe();
          try {
            entry.screenshot = await (typeof this.automation.screenshot === 'function'
              ? this.automation.screenshot(deviceId)
              : this.devices.screenshot(deviceId));
            if (!entry.screenshot) entry.screenshotError = 'Aucune image retournée par l’appareil';
            else
              entry.screenshot = await this.store.saveCapture(report, entry.id, entry.screenshot);
          } catch (error) {
            entry.screenshotError = String(error);
            entry.screenshot = undefined;
          }
          entry.completedAt = new Date().toISOString();
          entry.sequence = report.entries.filter((entry) => entry.completedAt).length;
          this.publish(report);
        };
        const application = applications?.[os];
        if (application)
          await this.automation.ensureApplication(
            deviceId,
            application,
            report.id,
            restartApplication,
            abort.signal,
          );
        const add = (node: ScenarioNode, precondition = false): RunEntry => {
          const entry: RunEntry = {
            id: randomUUID(),
            nodeId: node.id,
            nodeName: node.name,
            kind: node.kind,
            deviceId,
            platform: os,
            status: 'running',
            message: precondition ? 'Vérification de la précondition…' : 'En cours…',
            startedAt: new Date().toISOString(),
            precondition,
          };
          report.entries.push(entry);
          this.publish(report);
          return entry;
        };
        const sequence = async (
          nodes: ScenarioNode[],
        ): Promise<{ failed: boolean; halt: boolean }> => {
          let failed = false;
          for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index];
            const entry = add(node);
            if (abort.signal.aborted) {
              entry.status = 'cancelled';
              entry.message = 'Exécution annulée';
              entry.finishedAt = new Date().toISOString();
              this.publish(report);
              continue;
            }
            let allowed = true;
            if (node.preconditionId) {
              const test = nodes[index - 1];
              const guard = add(test, true);
              guard.screenBefore = await observe();
              try {
                const v = test.variants[os];
                if (!v) throw new Error('Précondition non configurée pour ' + os);
                await this.automation.perform(
                  deviceId,
                  v,
                  'test',
                  report.id,
                  abort.signal,
                  variables,
                );
                guard.status = 'passed';
                guard.message = 'Précondition satisfaite';
              } catch (e) {
                allowed = false;
                guard.status = 'skipped';
                guard.message = 'Précondition non satisfaite : ' + String(e);
              }
              await completeCapture(
                guard,
                allowed ? 'passed' : abort.signal.aborted ? 'cancelled' : 'failed',
              );
              guard.finishedAt = new Date().toISOString();
              this.publish(report);
            }
            let ownFailure = false;
            if (!allowed) {
              entry.status = 'skipped';
              entry.message = 'Précondition non satisfaite';
            } else if (node.kind !== 'scenario') {
              entry.screenBefore = await observe();
              try {
                const variant = node.variants[os];
                if (!variant) throw new Error('Élément non configuré pour ' + os);
                if (node.kind === 'navigation' && !node.screen?.variants[os])
                  throw new Error('Identité de l’écran destination non configurée pour ' + os);
                await this.automation.perform(
                  deviceId,
                  variant,
                  node.kind,
                  report.id,
                  abort.signal,
                  variables,
                );
                if (node.kind === 'navigation') {
                  if (!node.screen?.variants[os])
                    throw new Error('Identité de l’écran destination non configurée pour ' + os);
                  await waitForScreenDefinition(
                    () => this.automation.inspect(deviceId, report.id),
                    node.screen,
                    os,
                    allNodes,
                    variant.timeoutMs,
                    abort.signal,
                  );
                }
                entry.status = 'passed';
                entry.message = node.kind === 'test' ? 'Vérification réussie' : 'Action effectuée';
              } catch (e) {
                ownFailure = true;
                failed = true;
                entry.status = abort.signal.aborted ? 'cancelled' : 'failed';
                entry.message = abort.signal.aborted ? 'Annulé' : String(e);
                entry.analysisState =
                  this.store.state.settings.analysisMode === 'off' ? 'off' : 'pending';
                this.publish(report);
                if (this.store.state.settings.analysisMode === 'automatic')
                  void this.analyze({ runId: report.id, entryId: entry.id }).catch(() => {});
              }
              await completeCapture(entry);
            } else {
              entry.message = 'Scénario en cours';
            }
            let child = { failed: false, halt: false };
            if (
              (allowed || node.childrenOnPreconditionFailure) &&
              !(ownFailure && node.blocking) &&
              !abort.signal.aborted
            )
              child = await sequence(node.children);
            else
              for (const descendant of flatten(node.children)) {
                report.entries.push({
                  id: randomUUID(),
                  nodeId: descendant.id,
                  nodeName: descendant.name,
                  deviceId,
                  platform: os,
                  status: abort.signal.aborted ? 'cancelled' : 'skipped',
                  message: 'Parent non exécuté',
                  startedAt: new Date().toISOString(),
                  finishedAt: new Date().toISOString(),
                });
              }
            if (child.failed) {
              failed = true;
              if (entry.status !== 'skipped') {
                entry.status = 'failed';
                entry.message = 'Un ou plusieurs éléments enfants ont échoué';
              }
            }
            if (entry.status === 'running') {
              entry.status = 'passed';
              entry.message = 'Scénario terminé';
            }
            entry.finishedAt = new Date().toISOString();
            this.publish(report);
            if ((ownFailure && node.blocking) || child.halt) {
              for (const rest of flatten(nodes.slice(index + 1)))
                report.entries.push({
                  id: randomUUID(),
                  nodeId: rest.id,
                  nodeName: rest.name,
                  deviceId,
                  platform: os,
                  status: 'blocked',
                  message: 'Échec bloquant précédent',
                  startedAt: new Date().toISOString(),
                  finishedAt: new Date().toISOString(),
                });
              this.publish(report);
              return { failed: true, halt: true };
            }
          }
          return { failed, halt: false };
        };
        for (const root of report.snapshot) await sequence([root]);
      }),
    );
    for (const [index, outcome] of outcomes.entries())
      if (outcome.status === 'rejected') {
        report.entries.push({
          id: randomUUID(),
          nodeId: 'engine',
          nodeName: 'Préparation de l’appareil',
          deviceId: deviceIds[index],
          platform: this.devices.known.get(deviceIds[index])!.platform,
          status: abort.signal.aborted ? 'cancelled' : 'blocked',
          message: String(outcome.reason),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
      }
    report.status = abort.signal.aborted
      ? 'cancelled'
      : report.entries.some((e) => e.status === 'failed' || e.status === 'blocked')
        ? 'failed'
        : 'passed';
    report.finishedAt = new Date().toISOString();
    this.publish(report);
    await this.persistence;
  }
  async stop() {
    this.cancel();
    await this.task;
    await this.persistence;
  }
  isRunning() {
    return !!this.active;
  }
  cancel() {
    this.active?.abort.abort();
  }
  async analyze(input: { runId: string; entryId: string }) {
    const report = this.reports.get(input.runId);
    if (report && this.maintenance.has(report.projectId))
      throw new Error('Nettoyage de campagne en cours');
    const entry = report?.entries.find((e) => e.id === input.entryId);
    if (!report || !entry || entry.status !== 'failed') throw new Error('Échec introuvable');
    if (entry.analysisState === 'running' || entry.analysisState === 'done') return;
    entry.analysisState = 'running';
    this.publish(report);
    try {
      entry.analysis = await this.analyzeFailure(structuredClone(entry), structuredClone(report));
      entry.analysisState = 'done';
    } catch (e) {
      entry.analysis = 'Analyse indisponible : ' + String(e);
      entry.analysisState = 'pending';
    }
    this.publish(report);
    await this.persistence;
  }
}
