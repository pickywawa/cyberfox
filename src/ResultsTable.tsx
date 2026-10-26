import { useState } from 'react';
import { ChevronDown, Image, Bot } from 'lucide-react';
import { flatten, type ReplayFrame, type RunReport } from '../shared/model';
import { PlatformIcon } from './PlatformIcon';
import { api } from './bridge';
import type { L } from './NodeEditor';

export function ResultsTable({
  reports,
  selectedFrame,
  L,
  onFrame,
  onError,
}: {
  reports: RunReport[];
  selectedFrame?: ReplayFrame | null;
  L: L;
  onFrame?: (frame: ReplayFrame) => void;
  onError: (e: unknown) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const rows = reports.flatMap((report) =>
    report.entries
      .filter((e) => e.kind !== 'scenario' && !e.precondition)
      .map((entry) => ({ report, entry })),
  );
  const labels: Record<string, string> = {
    passed: L('Réussi', 'Passed'),
    failed: L('Échec', 'Failed'),
    blocked: L('Bloqué', 'Blocked'),
    running: L('En cours', 'Running'),
    skipped: L('Ignoré', 'Skipped'),
    cancelled: L('Annulé', 'Cancelled'),
  };
  const visible = rows.filter(
    ({ entry: e }) =>
      (filter === 'all' || (e.outcome ?? e.status) === filter) &&
      (e.nodeName + ' ' + (e.screenAfter?.name ?? e.screenBefore?.name ?? ''))
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="results-table-section">
      <div className="results-table-toolbar">
        <input
          type="search"
          aria-label={L('Rechercher une étape', 'Search steps')}
          placeholder={L('Rechercher une étape ou un écran…', 'Search steps or screens…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={L('Filtrer les résultats', 'Filter results')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{L('Tous les résultats', 'All results')}</option>
          {Object.entries(labels).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        <small>
          {visible.length} / {rows.length}
        </small>
      </div>
      <div className="results-table-scroll">
        <table className="results-table">
          <thead>
            <tr>
              <th>OS</th>
              <th>{L('Étape', 'Step')}</th>
              <th>{L('Écran', 'Screen')}</th>
              <th>{L('Résultat', 'Result')}</th>
              <th>{L('Durée', 'Duration')}</th>
              <th>
                <span className="muted">{L('Détails', 'Details')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ report, entry: e }) => {
              const key = report.id + e.id,
                status = e.outcome ?? e.status;
              const screen =
                e.kind === 'navigation' ? e.screenAfter : (e.screenBefore ?? e.screenAfter);
              return (
                <ResultRow
                  key={key}
                  selected={selectedFrame?.runId === report.id && selectedFrame.entry.id === e.id}
                  open={expanded === key}
                  toggle={() => setExpanded(expanded === key ? null : key)}
                  report={report}
                  entry={e}
                  status={status}
                  label={labels[status] ?? status}
                  screen={screen?.name}
                  L={L}
                  onFrame={onFrame}
                  onError={onError}
                />
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={6} className="muted">
                  {L('Aucune étape à afficher.', 'No steps to show.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ResultRow({
  report,
  entry: e,
  open,
  selected,
  toggle,
  status,
  label,
  screen,
  L,
  onFrame,
  onError,
}: {
  report: RunReport;
  entry: RunReport['entries'][number];
  open: boolean;
  selected: boolean;
  toggle: () => void;
  status: string;
  label: string;
  screen?: string;
  L: L;
  onFrame?: (frame: ReplayFrame) => void;
  onError: (e: unknown) => void;
}) {
  const node = flatten(report.snapshot).find((node) => node.id === e.nodeId);
  const variant = node?.variants[e.platform];
  const kinds: Record<string, string> = {
    action: L('Action', 'Action'),
    navigation: L('Navigation', 'Navigation'),
    test: L('Vérification', 'Check'),
  };
  const operations: Record<string, string> = {
    tap: L('Appuyer', 'Tap'),
    type: L('Saisir', 'Type'),
    clear: L('Effacer', 'Clear'),
    back: L('Retour', 'Back'),
    assert: L('Vérifier', 'Assert'),
  };
  const duration = e.finishedAt
    ? Math.max(0, Date.parse(e.finishedAt) - Date.parse(e.startedAt)) / 1000
    : null;
  return (
    <>
      <tr
        className={'result-row state-' + status + (selected ? ' selected' : '')}
        tabIndex={0}
        aria-selected={selected}
        onClick={(event) => {
          if (!(event.target as Element).closest('button, a, input, select'))
            onFrame?.({ runId: report.id, entry: e });
        }}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault();
            onFrame?.({ runId: report.id, entry: e });
          }
        }}
      >
        <td title={e.platform === 'ios' ? 'iOS' : 'Android'}>
          <PlatformIcon platform={e.platform} size={14} />
        </td>
        <td className="result-step" title={e.nodeName}>
          {e.nodeName}
          <small>{new Date(e.startedAt).toLocaleString()}</small>
        </td>
        <td className="result-screen" title={screen}>
          {screen ?? '—'}
        </td>
        <td>
          <span className={'result-status state-' + status}>
            <span className={'result-dot ' + status} />
            {label}
          </span>
        </td>
        <td className="result-duration">{duration === null ? '—' : duration.toFixed(1) + ' s'}</td>
        <td>
          <div className="result-row-actions">
            {e.screenshot && onFrame && (
              <button
                className="icon-button"
                title={L('Voir la capture', 'View capture')}
                aria-label={L('Voir la capture', 'View capture') + ' · ' + e.nodeName}
                onClick={() => onFrame({ runId: report.id, entry: e })}
              >
                <Image size={14} />
              </button>
            )}
            <button
              className="icon-button"
              aria-expanded={open}
              aria-label={L('Détails', 'Details') + ' · ' + e.nodeName}
              onClick={toggle}
            >
              <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="result-expanded">
          <td colSpan={6}>
            <p>{e.operationMessage ?? e.message}</p>
            {e.analysis && (
              <div className="failure-analysis">
                <Bot size={14} />
                <p>{e.analysis}</p>
              </div>
            )}
            <dl className="result-action-info">
              <div>
                <dt>{L('Type', 'Type')}</dt>
                <dd>{kinds[e.kind ?? node?.kind ?? 'action']}</dd>
              </div>
              {variant && (
                <div>
                  <dt>{L('Opération', 'Operation')}</dt>
                  <dd>{operations[variant.operation] ?? variant.operation}</dd>
                </div>
              )}
              <div>
                <dt>{L('Début', 'Started')}</dt>
                <dd>{new Date(e.startedAt).toLocaleString()}</dd>
              </div>
              {e.finishedAt && (
                <div>
                  <dt>{L('Fin', 'Finished')}</dt>
                  <dd>{new Date(e.finishedAt).toLocaleString()}</dd>
                </div>
              )}
              <div>
                <dt>{L('Écran', 'Screen')}</dt>
                <dd>{screen ?? '—'}</dd>
              </div>
            </dl>
            {e.screenshotError && <p className="muted">{e.screenshotError}</p>}
            {status === 'failed' && e.analysisState !== 'off' && (
              <button
                disabled={e.analysisState === 'running' || e.analysisState === 'done'}
                onClick={() => void api.analyze({ runId: report.id, entryId: e.id }).catch(onError)}
              >
                <Bot size={14} />
                {L('Analyser avec l’IA', 'Analyze with AI')}
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
