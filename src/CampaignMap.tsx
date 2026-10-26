import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2 } from 'lucide-react';
import { testedScreenMap, campaignFrames } from '../shared/campaigns';
import type { CampaignDetail, ReplayFrame } from '../shared/model';
import { PlatformIcon } from './PlatformIcon';
import { CaptureImage } from './CaptureImage';
import type { L } from './NodeEditor';

export function CampaignMap({
  detail,
  onSelect,
  L,
}: {
  detail: CampaignDetail;
  onSelect: (frame: ReplayFrame) => void;
  L: L;
}) {
  const raw = testedScreenMap(detail);
  const tested = raw.screens.filter((s) => s.entries.some((f) => f.entry.kind === 'test'));
  const byScreen = new Map<string, typeof tested>();
  for (const screen of tested) {
    const key = screen.screen.identified ? screen.screen.id : screen.key;
    byScreen.set(key, [...(byScreen.get(key) ?? []), screen]);
  }
  const groups = [...byScreen].map(([key, screens]) => ({
    key,
    name: screens[0].screen.name,
    screens,
    entries: screens.flatMap((s) => s.entries).filter((f) => f.entry.kind === 'test'),
  }));
  const frames = campaignFrames(detail);
  const captureFor = (group: (typeof groups)[number]) =>
    [...frames]
      .reverse()
      .find(
        (f) =>
          f.entry.screenshot &&
          group.screens.some(
            (s) =>
              s.screen.platform === f.entry.platform && s.screen.id === f.entry.screenAfter?.id,
          ),
      ) ?? [...group.entries].reverse().find((frame) => !!frame.entry.screenshot);
  const host = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const arrow = useId();
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (selected) popup.current?.showPopover();
  }, [selected]);
  const columns = width >= 530 ? Math.max(2, Math.floor(width / 270)) : 1;
  const cardWidth = (width - (columns - 1) * 28) / columns;
  const at = (i: number) => ({
    x: (i % columns) * (cardWidth + 28),
    y: Math.floor(i / columns) * 270,
  });
  const groupOf = (key: string) => groups.findIndex((g) => g.screens.some((s) => s.key === key));
  const screen = groups.find((g) => g.key === selected);
  const capture = screen && captureFor(screen);
  const open = (event: React.MouseEvent<HTMLButtonElement>, key: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(rect.right + 8, innerWidth - 440)),
      top: Math.max(8, Math.min(rect.top, innerHeight - 440)),
    });
    setSelected(key);
    if (key === selected) popup.current?.showPopover();
  };
  return (
    <div className="campaign-map" ref={host}>
      {!groups.length ? (
        <p className="note">
          {L('Aucun écran associé à un test exécuté.', 'No screens with executed tests.')}
        </p>
      ) : (
        <div
          className="screen-map-canvas"
          style={{ height: Math.ceil(groups.length / columns) * 270 - 20 }}
        >
          <svg className="screen-map-links" width={width} height="100%" aria-hidden="true">
            <defs>
              <marker id={arrow} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" fill="currentColor" />
              </marker>
            </defs>
            {raw.edges.map((edge) => {
              const from = groupOf(edge.from),
                to = groupOf(edge.to);
              if (from < 0 || to < 0 || from === to) return null;
              const a = at(from),
                b = at(to);
              return (
                <path
                  className="screen-map-edge"
                  key={edge.from + edge.to}
                  d={
                    a.y === b.y
                      ? `M${a.x + (b.x > a.x ? cardWidth : 0)},${a.y + 122} L${b.x + (b.x > a.x ? 0 : cardWidth)},${b.y + 122}`
                      : `M${a.x + cardWidth / 2},${a.y + 245} C${a.x + cardWidth / 2},${a.y + 270} ${b.x + cardWidth / 2},${b.y - 25} ${b.x + cardWidth / 2},${b.y}`
                  }
                  markerEnd={`url(#${arrow})`}
                />
              );
            })}
          </svg>
          {groups.map((group, i) => {
            const frame = captureFor(group),
              pos = at(i);
            return (
              <button
                type="button"
                key={group.key}
                className="screen-map-card"
                style={{ left: pos.x, top: pos.y, width: cardWidth }}
                aria-label={group.name}
                aria-haspopup="dialog"
                onClick={(e) => open(e, group.key)}
              >
                <div
                  className="screen-map-thumbnail"
                  title={L('Capture après l’étape', 'Capture after step')}
                >
                  {frame ? (
                    <CaptureImage
                      projectId={detail.campaign.projectId}
                      campaignId={detail.campaign.id}
                      runId={frame.runId}
                      entry={frame.entry}
                      alt={group.name}
                    />
                  ) : (
                    <span className="muted">{L('Capture indisponible', 'No capture')}</span>
                  )}
                </div>
                <b title={group.name}>{group.name}</b>
                <div className="screen-map-counts">
                  {(['ios', 'android'] as const).map((os) => {
                    const screens = group.screens.filter((s) => s.screen.platform === os);
                    return screens.length ? (
                      <span
                        key={os}
                        title={
                          (os === 'ios' ? 'iOS' : 'Android') +
                          ' · ' +
                          L('tests réussis / échoués', 'passed / failed tests')
                        }
                      >
                        <PlatformIcon platform={os} size={11} />
                        <span>{screens.reduce((n, s) => n + s.passed, 0)} ✓</span>
                        {screens.some((s) => s.failed) && (
                          <span className="map-failed">
                            {screens.reduce((n, s) => n + s.failed, 0)} ✕
                          </span>
                        )}
                      </span>
                    ) : null;
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {createPortal(
        <div
          ref={popup}
          popover="auto"
          className="screen-map-popover"
          role="dialog"
          aria-label={screen?.name ?? L('Détails de l’écran', 'Screen details')}
          style={{ ...position, maxHeight: `calc(100vh - ${position.top + 12}px)` }}
          onToggle={(e) => {
            if (e.newState === 'closed') setSelected(null);
          }}
        >
          {screen && (
            <>
              <header>
                <b>{screen.name}</b>
                <button
                  className="icon-button"
                  aria-label={L('Fermer', 'Close')}
                  onClick={() => popup.current?.hidePopover()}
                >
                  <X size={16} />
                </button>
              </header>
              <div className="screen-map-popup-body">
                {capture && (
                  <CaptureImage
                    projectId={detail.campaign.projectId}
                    campaignId={detail.campaign.id}
                    runId={capture.runId}
                    entry={capture.entry}
                    alt={screen.name}
                  />
                )}
                <div className="screen-map-test-list">
                  {screen.entries.map((frame) => (
                    <button
                      key={frame.runId + frame.entry.id}
                      onClick={() => {
                        popup.current?.hidePopover();
                        onSelect(frame);
                      }}
                    >
                      <PlatformIcon platform={frame.entry.platform} size={12} />
                      <span>
                        <b>{frame.entry.nodeName}</b>
                        <small>{new Date(frame.entry.completedAt!).toLocaleString()}</small>
                      </span>
                      <span
                        className={
                          'result-status state-' + (frame.entry.outcome ?? frame.entry.status)
                        }
                      >
                        {{
                          passed: '✓',
                          failed: '✕',
                          blocked: '⊘',
                          skipped: '−',
                          cancelled: '−',
                          running: '…',
                        }[frame.entry.outcome ?? frame.entry.status] ?? '−'}
                      </span>
                      <Maximize2 size={12} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
