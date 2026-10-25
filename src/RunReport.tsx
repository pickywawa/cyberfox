import { useEffect, useRef } from 'react';
import { Bot, CheckCheck, LoaderCircle, Play, Square } from 'lucide-react';
import type { RunReport as Report } from '../shared/model';
import type { L } from './NodeEditor';
import { api } from './bridge';
import { OSIcon } from './DevicePanel';
export function RunReport({
  report,
  L,
  onStart,
  onCancel,
  onError,
}: {
  report: Report | null;
  L: L;
  onStart: () => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'nearest' }), [report?.entries.length]);
  return (
    <div className="run-report">
      <div className="report-heading">
        <div>
          <span className="eyebrow">{L('RAPPORT EN DIRECT', 'LIVE REPORT')}</span>
          <h1>
            {report
              ? L('Exécution des scénarios', 'Scenario execution')
              : L('Prêt à vérifier', 'Ready to verify')}
          </h1>
        </div>
        {report?.status === 'running' ? (
          <button onClick={onCancel}>
            <Square size={15} />
            {L('Arrêter', 'Stop')}
          </button>
        ) : (
          <button className="primary" onClick={onStart}>
            <Play size={15} />
            {L('Tout exécuter', 'Run all')}
          </button>
        )}
      </div>
      {report ? (
        <>
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
          <div className="report-entries">
            {report.entries.map((e) => (
              <article key={e.id} className={'report-entry state-' + e.status}>
                <div>
                  <OSIcon os={e.platform} />
                  {e.status === 'running' ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <span className={'result-dot ' + e.status} />
                  )}
                  <b>
                    {e.precondition ? L('Précondition · ', 'Precondition · ') : ''}
                    {e.nodeName}
                  </b>
                  <span className="badge">{e.status}</span>
                  <time>{new Date(e.startedAt).toLocaleTimeString()}</time>
                </div>
                <p>{e.message}</p>
                {e.screenshot && (
                  <details>
                    <summary>{L('Capture de l’échec', 'Failure screenshot')}</summary>
                    <img
                      className="failure-capture"
                      src={e.screenshot}
                      alt={L('Écran au moment de l’échec', 'Screen at failure')}
                    />
                  </details>
                )}
                {e.analysis && (
                  <div className="failure-analysis">
                    <Bot size={16} />
                    <p>{e.analysis}</p>
                  </div>
                )}
                {e.status === 'failed' && !e.precondition && e.analysisState !== 'off' && (
                  <button
                    disabled={e.analysisState === 'running' || e.analysisState === 'done'}
                    onClick={() =>
                      void api.analyze({ runId: report.id, entryId: e.id }).catch(onError)
                    }
                  >
                    <Bot size={14} />
                    {e.analysisState === 'running'
                      ? L('Analyse en cours…', 'Analyzing…')
                      : L('Analyser avec l’IA', 'Analyze with AI')}
                  </button>
                )}
              </article>
            ))}
            <div ref={bottom} />
          </div>
          {report.persistenceError && (
            <p className="form-error">
              {L('Sauvegarde du rapport impossible : ', 'Cannot save report: ')}
              {report.persistenceError}
            </p>
          )}
          {report.finishedAt && !report.persistenceError && (
            <p className="note">
              {L(
                'Le résultat original et les analyses sont conservés dans le dossier reports du projet.',
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
