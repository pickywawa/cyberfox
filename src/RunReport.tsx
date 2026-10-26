import { useEffect, useRef } from 'react';
import { CheckCheck, LoaderCircle, Play, Square } from 'lucide-react';
import type { RunReport as Report } from '../shared/model';
import type { L } from './NodeEditor';
import { ResultsTable } from './ResultsTable';
export function RunReport({
  report,
  selectedFrame,
  compact = false,
  running,
  canStart = true,
  onFrame,
  L,
  onStart,
  onCancel,
  onError,
}: {
  report: Report | null;
  selectedFrame?: import('../shared/model').ReplayFrame | null;
  compact?: boolean;
  running?: boolean;
  canStart?: boolean;
  onFrame?: (frame: import('../shared/model').ReplayFrame) => void;
  L: L;
  onStart: () => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compact && report?.status === 'running')
      bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [report?.entries.length]);
  const statusLabel = (status: string) =>
    ({
      passed: L('Réussi', 'Passed'),
      failed: L('Échec', 'Failed'),
      running: L('En cours', 'Running'),
      skipped: L('Ignoré', 'Skipped'),
      blocked: L('Bloqué', 'Blocked'),
      cancelled: L('Annulé', 'Cancelled'),
    })[status] ?? status;
  return (
    <div className={'run-report' + (compact ? ' compact-run-report' : '')}>
      {!compact && (
        <div className="report-heading">
          <div>
            <span className="eyebrow">{L('RAPPORT EN DIRECT', 'LIVE REPORT')}</span>
            <h1>
              {report
                ? L('Exécution des scénarios', 'Scenario execution')
                : L('Prêt à vérifier', 'Ready to verify')}
            </h1>
          </div>
          {(running ?? report?.status === 'running') ? (
            <button onClick={onCancel}>
              <Square size={15} />
              {L('Arrêter', 'Stop')}
            </button>
          ) : (
            <button className="primary" onClick={onStart} disabled={!canStart}>
              <Play size={15} />
              {L('Tout exécuter', 'Run all')}
            </button>
          )}
        </div>
      )}
      {report ? (
        <>
          {!compact && (
            <div className="report-summary">
              <span className={'badge state-' + report.status}>
                {report.status === 'running' && <LoaderCircle size={13} className="spin" />}
                {report.status}
              </span>
              <span>
                {report.entries.filter((e) => e.status === 'passed' && !e.precondition).length}{' '}
                {L('réussis', 'passed')}
              </span>
              <span>
                {report.entries.filter((e) => e.status === 'failed' && !e.precondition).length}{' '}
                {L('échecs', 'failures')}
              </span>
              <small>{new Date(report.startedAt).toLocaleString()}</small>
            </div>
          )}
          <ResultsTable
            selectedFrame={selectedFrame}
            reports={[report]}
            L={L}
            onFrame={onFrame}
            onError={onError}
          />
          <div ref={bottom} />
          {report.persistenceError && (
            <p className="form-error">
              {L('Sauvegarde du rapport impossible : ', 'Cannot save report: ')}
              {report.persistenceError}
            </p>
          )}
          {!compact && report.finishedAt && !report.persistenceError && (
            <p className="note">
              {L(
                'Le résultat original, les captures et les analyses sont conservés dans la campagne.',
                'Original results and analyses are saved in the project reports directory.',
              )}
            </p>
          )}
        </>
      ) : (
        <div className="canvas-placeholder">
          <CheckCheck size={35} />
          <p>
            {L(
              'Lancez un scénario depuis son bouton ▶ dans l’arbre ou exécutez tout. Android et iOS avancent en parallèle.',
              'Run a scenario using ▶ in the tree, or run all. Android and iOS run in parallel.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
