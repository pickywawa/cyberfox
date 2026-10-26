import {
  flatten,
  type CampaignDetail,
  type ReplayFrame,
  type RunEntry,
  type ScreenReference,
  type OS,
} from './model.js';

export function campaignFrames(detail: CampaignDetail | null): ReplayFrame[] {
  return (detail?.reports ?? [])
    .flatMap((report) =>
      report.entries
        .filter((entry) => !entry.precondition && entry.kind !== 'scenario' && !!entry.completedAt)
        .map((entry) => ({ runId: report.id, entry })),
    )
    .sort(
      (a, b) =>
        a.entry.completedAt!.localeCompare(b.entry.completedAt!) ||
        (a.runId === b.runId
          ? (a.entry.sequence ?? 0) - (b.entry.sequence ?? 0)
          : a.runId.localeCompare(b.runId)) ||
        a.entry.id.localeCompare(b.entry.id),
    );
}
export interface MappedScreen {
  key: string;
  screen: ScreenReference;
  passed: number;
  failed: number;
  actions: number;
  entries: ReplayFrame[];
}
export function screenMap(detail: CampaignDetail) {
  const screens = new Map<string, MappedScreen>();
  const edges = new Map<string, { from: string; to: string; count: number }>();
  const key = (screen: ScreenReference) => screen.platform + ':' + screen.id;
  const add = (screen: ScreenReference) => {
    const id = key(screen);
    if (!screens.has(id))
      screens.set(id, { key: id, screen, passed: 0, failed: 0, actions: 0, entries: [] });
    return screens.get(id)!;
  };
  for (const frame of campaignFrames(detail)) {
    const entry = frame.entry;
    if (entry.screenBefore) add(entry.screenBefore);
    if (entry.screenAfter) add(entry.screenAfter);
    const target =
      entry.kind === 'navigation'
        ? (entry.screenAfter ?? entry.screenBefore)
        : (entry.screenBefore ?? entry.screenAfter);
    if (target) {
      const screen = add(target);
      screen.entries.push(frame);
      if (entry.kind === 'test') {
        if ((entry.outcome ?? entry.status) === 'passed') screen.passed++;
        if ((entry.outcome ?? entry.status) === 'failed') screen.failed++;
      } else screen.actions++;
    }
    if (
      entry.screenBefore &&
      entry.screenAfter &&
      key(entry.screenBefore) !== key(entry.screenAfter)
    ) {
      const from = key(entry.screenBefore),
        to = key(entry.screenAfter),
        id = from + '>' + to;
      const edge = edges.get(id) ?? { from, to, count: 0 };
      edge.count++;
      edges.set(id, edge);
    }
  }
  return { screens: [...screens.values()], edges: [...edges.values()] };
}
export function campaignText(detail: CampaignDetail) {
  const { campaign, reports } = detail;
  const frames = campaignFrames(detail);
  const tests = frames.filter(({ entry }) => entry.kind === 'test');
  const passed = tests.filter(({ entry }) => (entry.outcome ?? entry.status) === 'passed').length;
  const failed = tests.filter(({ entry }) => (entry.outcome ?? entry.status) === 'failed').length;
  const map = screenMap(detail);
  const safe = (value: string) => value.replace(/[\r\n\t]+/g, ' ');
  const lines = [
    `Campagne : ${safe(campaign.label)}`,
    `Créée le : ${campaign.createdAt}`,
    `État : ${campaign.status === 'completed' ? 'Terminée' : 'Ouverte'}`,
    `Exécutions : ${reports.length}`,
    `Vérifications : ${tests.length} — succès : ${passed} — échecs : ${failed}`,
    '',
    'ÉCRANS',
    ...map.screens.map(
      (s) =>
        `${s.screen.platform} · ${safe(s.screen.name)} [${s.screen.id}] : ${s.passed} succès${s.failed ? `, ${s.failed} échecs` : ''}, ${s.actions} actions/navigations${s.screen.identified ? '' : ' (identité non confirmée)'}`,
    ),
    '',
    'TRANSITIONS OBSERVÉES',
    ...map.edges.map((e) => `${e.from} → ${e.to} (${e.count})`),
    '',
    'EXÉCUTIONS',
  ];
  for (const report of reports) {
    lines.push(`${report.startedAt} · ${report.status} · ${report.id}`);
    const kinds = new Map(flatten(report.snapshot).map((n) => [n.id, n.kind]));
    for (const entry of report.entries) {
      if (entry.precondition || (entry.kind ?? kinds.get(entry.nodeId)) === 'scenario') continue;
      lines.push(
        `  ${entry.platform} · ${safe(entry.nodeName)} · ${entry.outcome ?? entry.status} · ${safe(entry.screenAfter?.name ?? entry.screenBefore?.name ?? 'Écran non identifié')}`,
      );
      if (entry.operationMessage || entry.message)
        lines.push('    ' + safe(entry.operationMessage ?? entry.message));
      if (entry.screenshotError) lines.push('    Capture indisponible.');
      if (entry.analysis) lines.push('    Analyse : ' + safe(entry.analysis));
    }
  }
  return lines.join('\n');
}

export type CampaignExportFormat = 'text' | 'csv' | 'markdown' | 'confluence';
export function campaignExport(detail: CampaignDetail, format: CampaignExportFormat = 'text') {
  if (format === 'text') return campaignText(detail);
  const headers = [
    'Exécution',
    'OS',
    'Étape',
    'Écran',
    'Résultat',
    'Durée (s)',
    'Message',
    'Analyse',
  ];
  const rows = detail.reports.flatMap((report) =>
    report.entries
      .filter((entry) => entry.kind !== 'scenario' && !entry.precondition)
      .map((entry) => [
        report.startedAt,
        entry.platform === 'ios' ? 'iOS' : 'Android',
        entry.nodeName,
        (entry.kind === 'navigation'
          ? entry.screenAfter
          : (entry.screenBefore ?? entry.screenAfter)
        )?.name ?? '',
        entry.outcome ?? entry.status,
        entry.finishedAt
          ? String(Math.max(0, Date.parse(entry.finishedAt) - Date.parse(entry.startedAt)) / 1000)
          : '',
        entry.operationMessage ?? entry.message,
        entry.analysis ?? '',
      ]),
  );
  if (format === 'csv') {
    const cell = (value: string) =>
      '"' + (/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
    return '\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  }
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[\r\n]+/g, ' ')
      .replace(format === 'confluence' ? /[{}\[\]\\]/g : /[\\`*_\[\]]/g, (value) => '\\' + value)
      .replace(/\|/g, format === 'markdown' ? '\\|' : '&#124;');
  const title = escape(detail.campaign.label);
  if (format === 'confluence')
    return (
      `h1. ${title}\n\n||${headers.join('||')}||\n` +
      rows.map((row) => '|' + row.map(escape).join('|') + '|').join('\n')
    );
  return (
    `# ${title}\n\n| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n` +
    rows.map((row) => '| ' + row.map(escape).join(' | ') + ' |').join('\n')
  );
}

/** Hide untested screens while retaining observed paths through them. */
export function testedScreenMap(detail: CampaignDetail) {
  const raw = screenMap(detail);
  const screens = raw.screens.filter((screen) =>
    screen.entries.some((f) => f.entry.kind === 'test'),
  );
  const visible = new Set(screens.map((screen) => screen.key));
  const edges: typeof raw.edges = [];
  for (const source of screens) {
    const queue = [{ key: source.key, count: Infinity }];
    const visited = new Set([source.key]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      for (const edge of raw.edges.filter((edge) => edge.from === current.key)) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        const count = Math.min(current.count, edge.count);
        if (visible.has(edge.to)) edges.push({ from: source.key, to: edge.to, count });
        else queue.push({ key: edge.to, count });
      }
    }
  }
  return { screens, edges };
}

/** Latest result per step/OS; retries must not inflate completion. */
export function campaignCompletion(
  detail: CampaignDetail,
  project: Pick<import('./model.js').Project, 'nodes' | 'platforms'>,
) {
  const planned = new Set<string>();
  const platforms = project.platforms.includes('flutter') ? ['android', 'ios'] : project.platforms;
  for (const node of flatten(project.nodes))
    if (node.kind !== 'scenario') for (const os of platforms) planned.add(os + ':' + node.id);
  const latest = new Map<string, string>();
  for (const report of [...detail.reports].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const kinds = new Map(flatten(report.snapshot).map((node) => [node.id, node.kind]));
    for (const entry of report.entries) {
      if (entry.precondition || (entry.kind ?? kinds.get(entry.nodeId)) === 'scenario') continue;
      const key = entry.platform + ':' + entry.nodeId;
      planned.add(key);
      latest.set(key, entry.outcome ?? entry.status);
    }
  }
  const completed = [...planned].filter((key) =>
    ['passed', 'failed'].includes(latest.get(key) ?? ''),
  ).length;
  return {
    completed,
    total: planned.size,
    percent: planned.size ? Math.round((completed / planned.size) * 100) : 0,
  };
}
