import { randomUUID } from 'node:crypto';
import {
  flatten,
  requiredOS,
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
  constructor(
    private store: Store,
    private automation: Automation,
    private devices: Devices,
    private emit: (event: LiveEvent) => void,
    private analyzeFailure: (entry: RunEntry, report: RunReport) => Promise<string>,
  ) {}
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
  async start(input: { projectId: string; nodeId?: string; deviceIds: string[] }) {
    if (this.active) throw new Error('Une exécution est déjà en cours');
    const project = this.store.get(input.projectId);
    const roots = structuredClone(
      project.nodes.filter((n) => !input.nodeId || n.id === input.nodeId),
    );
    if (!roots.length) throw new Error('Aucun scénario à exécuter');
    const ids = [...new Set(input.deviceIds)];
    const devices = ids.map((id) => this.devices.known.get(id));
    if (devices.some((d) => !d || d.status !== 'ready')) throw new Error('Appareil non connecté');
    if (new Set(devices.map((d) => d!.platform)).size !== devices.length)
      throw new Error('Un seul appareil par OS');
    if (devices.some((d) => !requiredOS(project).includes(d!.platform)))
      throw new Error('Appareil incompatible avec le projet');
    const report: RunReport = {
      id: randomUUID(),
      projectId: project.id,
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
    for (const os of requiredOS(project))
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
    void this.execute(report, ids, abort)
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
  private async execute(report: RunReport, deviceIds: string[], abort: AbortController) {
    await Promise.all(
      deviceIds.map(async (deviceId) => {
        const os = this.devices.known.get(deviceId)!.platform;
        const add = (node: ScenarioNode, precondition = false): RunEntry => {
          const entry: RunEntry = {
            id: randomUUID(),
            nodeId: node.id,
            nodeName: node.name,
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
              try {
                const v = test.variants[os];
                if (!v) throw new Error('Précondition non configurée pour ' + os);
                await this.automation.perform(deviceId, v, 'test', report.id, abort.signal);
                guard.status = 'passed';
                guard.message = 'Précondition satisfaite';
              } catch (e) {
                allowed = false;
                guard.status = 'skipped';
                guard.message = 'Précondition non satisfaite : ' + String(e);
              }
              guard.finishedAt = new Date().toISOString();
              this.publish(report);
            }
            let ownFailure = false;
            if (!allowed) {
              entry.status = 'skipped';
              entry.message = 'Précondition non satisfaite';
            } else if (node.kind !== 'scenario') {
              try {
                const variant = node.variants[os];
                if (!variant) throw new Error('Élément non configuré pour ' + os);
                await this.automation.perform(
                  deviceId,
                  variant,
                  node.kind,
                  report.id,
                  abort.signal,
                );
                entry.status = 'passed';
                entry.message = node.kind === 'test' ? 'Vérification réussie' : 'Action effectuée';
              } catch (e) {
                ownFailure = true;
                failed = true;
                entry.status = abort.signal.aborted ? 'cancelled' : 'failed';
                entry.message = abort.signal.aborted ? 'Annulé' : String(e);
                entry.screenshot = await this.devices.screenshot(deviceId).catch(() => undefined);
                entry.analysisState =
                  this.store.state.settings.analysisMode === 'off' ? 'off' : 'pending';
                this.publish(report);
                if (this.store.state.settings.analysisMode === 'automatic')
                  void this.analyze({ runId: report.id, entryId: entry.id }).catch(() => {});
              }
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
    report.status = abort.signal.aborted
      ? 'cancelled'
      : report.entries.some((e) => e.status === 'failed' || e.status === 'blocked')
        ? 'failed'
        : 'passed';
    report.finishedAt = new Date().toISOString();
    this.publish(report);
    await this.persistence;
  }
  cancel() {
    this.active?.abort.abort();
  }
  async analyze(input: { runId: string; entryId: string }) {
    const report = this.reports.get(input.runId);
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
