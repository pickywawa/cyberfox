import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Download,
  Ellipsis,
  FileText,
  Table2,
  FileCode2,
  BookOpen,
  FolderOpen,
  Layers3,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';
import type {
  Campaign,
  CampaignDetail,
  Project,
  ReplayFrame,
  RunReport as Report,
} from '../shared/model';
import {
  campaignFrames,
  testedScreenMap,
  campaignCompletion,
  type CampaignExportFormat,
} from '../shared/campaigns';
import { CampaignMap } from './CampaignMap';
import { RunReport } from './RunReport';
import { api } from './bridge';
import type { L } from './NodeEditor';

export function CampaignPanel({
  project,
  campaigns,
  detail,
  report,
  selectedFrame,
  running,
  L,
  onCampaignSelect,
  onRefresh,
  onStart,
  onCancel,
  onReportSelect,
  onFrame,
  onError,
}: {
  project: Project;
  campaigns: Campaign[];
  detail: CampaignDetail | null;
  report: Report | null;
  selectedFrame?: ReplayFrame | null;
  running: boolean;
  L: L;
  onCampaignSelect: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onStart: () => void;
  onCancel: () => void;
  onReportSelect: (id: string) => void;
  onFrame: (frame: ReplayFrame) => void;
  onError: (error: unknown) => void;
}) {
  const [tab, setTab] = useState<'progress' | 'map'>('progress');
  const [label, setLabel] = useState(detail?.campaign.label ?? '');
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const exportMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setLabel(detail?.campaign.label ?? '');
    setTab('progress');
    setRenaming(false);
    menu.current?.removeAttribute('open');
    exportMenu.current?.removeAttribute('open');
  }, [detail?.campaign.id]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node) {
        if (!menu.current?.contains(event.target)) menu.current?.removeAttribute('open');
        if (!exportMenu.current?.contains(event.target))
          exportMenu.current?.removeAttribute('open');
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        menu.current?.removeAttribute('open');
        exportMenu.current?.removeAttribute('open');
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  const work = async (action: () => Promise<void>) => {
    menu.current?.removeAttribute('open');
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    work(async () => {
      const campaign = await api.campaignCreate({
        projectId: project.id,
        label: L('Campagne', 'Campaign') + ' ' + (campaigns.length + 1),
      });
      await onCampaignSelect(campaign.id);
    });
  const clean = (all: boolean) =>
    work(async () => {
      if (
        !window.confirm(
          L(
            all
              ? 'Effacer les résultats et captures de toutes les campagnes de ce projet ?'
              : 'Effacer les résultats et captures de cette campagne ?',
            all
              ? 'Clear results and captures from all campaigns in this project?'
              : 'Clear this campaign’s results and captures?',
          ),
        )
      )
        return;
      await api.campaignClean({
        projectId: project.id,
        campaignId: all ? undefined : detail?.campaign.id,
      });
      await onRefresh();
    });
  const exportReport = (format: CampaignExportFormat) =>
    work(async () => {
      if (!detail) return;
      const text = await api.campaignExport({
        projectId: project.id,
        campaignId: detail.campaign.id,
        format,
      });
      const url = URL.createObjectURL(
        new Blob([text], {
          type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download =
        'campagne-' +
        detail.campaign.createdAt.slice(0, 10) +
        (format === 'csv'
          ? '.csv'
          : format === 'markdown'
            ? '.md'
            : format === 'confluence'
              ? '-confluence.txt'
              : '.txt');
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const completion = detail
    ? campaignCompletion(detail, project)
    : { completed: 0, total: 0, percent: 0 };
  const exportControl = (
    <details className="report-export-menu" ref={exportMenu}>
      <summary>
        <Download size={14} />
        {L('Exporter', 'Export')}
      </summary>
      <div role="menu" aria-label={L('Formats d’export', 'Export formats')}>
        {(
          [
            ['text', L('Texte', 'Text'), FileText, '.txt'],
            ['csv', 'CSV', Table2, '.csv'],
            ['markdown', 'Markdown', FileCode2, '.md'],
            ['confluence', 'Confluence', BookOpen, 'wiki'],
          ] as const
        ).map(([format, name, Icon, extension]) => (
          <button
            role="menuitem"
            key={format}
            disabled={busy}
            onClick={() => {
              exportMenu.current?.removeAttribute('open');
              void exportReport(format);
            }}
          >
            <Icon size={14} />
            <span>{name}</span>
            <small>{extension}</small>
          </button>
        ))}
      </div>
    </details>
  );
  const frames = campaignFrames(detail);
  const checks = frames.filter(({ entry }) => entry.kind === 'test');
  const passed = checks.filter(({ entry }) => (entry.outcome ?? entry.status) === 'passed').length;
  const failed = checks.filter(({ entry }) => (entry.outcome ?? entry.status) === 'failed').length;
  const mappedScreens = detail
    ? testedScreenMap(detail).screens.filter((s) => s.entries.some((f) => f.entry.kind === 'test'))
        .length
    : 0;
  const date = (value: string) =>
    new Date(value).toLocaleString(L('fr-FR', 'en-US'), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <div className="campaign-panel campaign-workspace">
      <div className="campaign-switcher">
        <div className="campaign-select-wrap">
          <FolderOpen size={15} />
          <select
            aria-label={L('Sélectionner une campagne', 'Select campaign')}
            value={project.activeCampaignId ?? ''}
            disabled={busy}
            onChange={(event) => void work(() => onCampaignSelect(event.target.value))}
          >
            <option value="">{L('Choisir une campagne…', 'Choose a campaign…')}</option>
            {campaigns.map((campaign) => (
              <option value={campaign.id} key={campaign.id}>
                {campaign.label}
                {campaign.status === 'completed' ? ' ✓' : ''} · {date(campaign.createdAt)}
              </option>
            ))}
          </select>
        </div>
        <button
          className="campaign-new-button"
          aria-label={L('Lancer une nouvelle campagne de test', 'Start a new test campaign')}
          disabled={busy}
          onClick={create}
        >
          <Plus size={14} />
          {L('Nouvelle', 'New')}
        </button>
        {!!campaigns.length && (
          <details className="campaign-menu" ref={menu}>
            <summary
              role="button"
              aria-label={L('Actions de campagne', 'Campaign actions')}
              title={L('Actions de campagne', 'Campaign actions')}
            >
              <Ellipsis size={18} />
            </summary>
            <div role="menu">
              {detail && (
                <>
                  <button
                    role="menuitem"
                    disabled={busy}
                    onClick={() => {
                      menu.current?.removeAttribute('open');
                      setLabel(detail.campaign.label);
                      setRenaming(true);
                    }}
                  >
                    <Pencil size={14} />
                    {L('Renommer', 'Rename')}
                  </button>
                  <button
                    role="menuitem"
                    disabled={busy || running}
                    onClick={() =>
                      void work(async () => {
                        await api.campaignUpdate({
                          projectId: project.id,
                          campaignId: detail.campaign.id,
                          status: detail.campaign.status === 'open' ? 'completed' : 'open',
                        });
                        await onRefresh();
                      })
                    }
                  >
                    <CheckCheck size={14} />
                    {detail.campaign.status === 'open'
                      ? L('Terminer la campagne', 'Complete campaign')
                      : L('Rouvrir la campagne', 'Reopen campaign')}
                  </button>
                  <hr />
                  <button
                    role="menuitem"
                    className="danger-menu-item"
                    disabled={busy || running}
                    onClick={() => void clean(false)}
                  >
                    <Trash2 size={14} />
                    {L('Nettoyer cette campagne', 'Clear this campaign')}
                  </button>
                </>
              )}
              <button
                role="menuitem"
                className="danger-menu-item"
                disabled={busy || running}
                onClick={() => void clean(true)}
              >
                <Trash2 size={14} />
                {L('Tout nettoyer', 'Clear all history')}
              </button>
            </div>
          </details>
        )}
      </div>
      {!detail ? (
        <section className="campaign-welcome">
          <div className="campaign-welcome-icon">
            <Layers3 size={27} />
          </div>
          <h1 className="campaign-title">{L('Campagnes de test', 'Test campaigns')}</h1>
          <p>
            {L(
              'Un espace pour suivre vos tests, revoir les captures et cartographier les écrans de votre application.',
              'A space to track tests, review captures and map your application screens.',
            )}
          </p>
          <button className="primary" disabled={busy} onClick={create}>
            <Plus size={15} />
            {L('Créer ma première campagne', 'Create my first campaign')}
          </button>
          {!!campaigns.length && (
            <small>
              {L(
                'Ou choisissez une campagne existante au-dessus pour la reprendre.',
                'Or select an existing campaign above to resume it.',
              )}
            </small>
          )}
        </section>
      ) : (
        <>
          <header className="campaign-overview">
            {renaming ? (
              <form
                className="campaign-rename-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void work(async () => {
                    await api.campaignUpdate({
                      projectId: project.id,
                      campaignId: detail.campaign.id,
                      label,
                    });
                    setRenaming(false);
                    await onRefresh();
                  });
                }}
              >
                <input
                  autoFocus
                  aria-label={L('Libellé de la campagne', 'Campaign label')}
                  value={label}
                  maxLength={180}
                  required
                  onChange={(event) => setLabel(event.target.value)}
                />
                <button
                  aria-label={L('Enregistrer le nom', 'Save name')}
                  disabled={busy || !label.trim()}
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  aria-label={L('Annuler le renommage', 'Cancel rename')}
                  onClick={() => setRenaming(false)}
                >
                  <X size={15} />
                </button>
              </form>
            ) : (
              <h1 className="campaign-title" title={detail.campaign.label}>
                {detail.campaign.label}
              </h1>
            )}
            <div className="campaign-metadata">
              <span className={'campaign-state ' + (running ? 'running' : detail.campaign.status)}>
                <span className="dot" />
                {running
                  ? L('Exécution en cours', 'Running')
                  : detail.campaign.status === 'open'
                    ? L('Ouverte', 'Open')
                    : L('Terminée', 'Completed')}
              </span>
              <span>·</span>
              <time dateTime={detail.campaign.createdAt}>
                {L('Créée le ', 'Created ')}
                {date(detail.campaign.createdAt)}
              </time>
            </div>
          </header>
          <div
            className="campaign-metrics"
            aria-label={L('Bilan de la campagne', 'Campaign summary')}
          >
            <div>
              <b>{detail.reports.length}</b>
              <span>{L('exécutions', 'runs')}</span>
            </div>
            <div className="metric-success">
              <b>{passed}</b>
              <span>{L('vérifications réussies', 'checks passed')}</span>
            </div>
            <div className={failed ? 'metric-failure' : ''}>
              <b>{failed}</b>
              <span>{L('échecs', 'failures')}</span>
            </div>
            <div>
              <b>{mappedScreens}</b>
              <span>{L('écrans observés', 'observed screens')}</span>
            </div>
            <div
              className="campaign-completion"
              title={`${completion.completed} / ${completion.total} ${L('étapes effectuées, réussies ou échouées', 'steps performed, passed or failed')}`}
            >
              <div
                className="completion-ring"
                role="progressbar"
                aria-label={L('Avancement de la campagne', 'Campaign completion')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completion.percent}
                style={{ '--completion': `${completion.percent}%` } as React.CSSProperties}
              >
                <b>{completion.percent}%</b>
              </div>
              <span>{L('effectué', 'completed')}</span>
            </div>
          </div>
          <nav
            className="campaign-tabs"
            role="tablist"
            aria-label={L('Vues de campagne', 'Campaign views')}
          >
            {(['progress', 'map'] as const).map((id) => {
              const Icon = id === 'progress' ? ListChecks : Waypoints;
              return (
                <button role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)}>
                  <Icon size={14} />
                  {id === 'progress'
                    ? L('Progression', 'Progress')
                    : L('Cartographie des écrans', 'Screen map')}
                </button>
              );
            })}
          </nav>
          {tab === 'progress' && (
            <section className="campaign-progress">
              <div className="campaign-run-toolbar">
                <div className="campaign-run-picker">
                  {detail.reports.length ? (
                    <>
                      <span>{L('Exécution', 'Run')}</span>
                      <select
                        aria-label={L('Choisir une exécution', 'Choose a run')}
                        value={report?.id ?? ''}
                        onChange={(event) => onReportSelect(event.target.value)}
                      >
                        {[...detail.reports].reverse().map((report) => (
                          <option value={report.id} key={report.id}>
                            {date(report.startedAt)} · {report.status}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="muted">
                      {L('Prête pour sa première exécution', 'Ready for its first run')}
                    </span>
                  )}
                </div>
                <div className="campaign-run-actions">
                  {exportControl}
                  {running ? (
                    <button onClick={onCancel}>
                      <Square size={13} />
                      {L('Arrêter', 'Stop')}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={onStart}
                      disabled={busy || detail.campaign.status !== 'open' || !project.nodes.length}
                    >
                      <Play size={13} />
                      {L('Tout exécuter', 'Run all')}
                    </button>
                  )}
                </div>
              </div>
              <RunReport
                compact
                report={report}
                selectedFrame={selectedFrame}
                L={L}
                running={running}
                canStart={detail.campaign.status === 'open'}
                onStart={onStart}
                onCancel={onCancel}
                onError={onError}
                onFrame={onFrame}
              />
            </section>
          )}
          {tab === 'map' && <CampaignMap detail={detail} L={L} onSelect={onFrame} />}
        </>
      )}
    </div>
  );
}
