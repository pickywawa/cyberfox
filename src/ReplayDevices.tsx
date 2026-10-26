import type { Project, ReplayFrame } from '../shared/model';
import { requiredOS } from '../shared/model';
import { CaptureImage } from './CaptureImage';
import { PlatformIcon } from './PlatformIcon';
import type { L } from './NodeEditor';

export function ReplayDevices({
  project,
  frame,
  frames,
  onLive,
  L,
}: {
  project: Project;
  frame: ReplayFrame;
  frames: ReplayFrame[];
  onLive: () => void;
  L: L;
}) {
  const index = frames.findIndex((item) => item.entry.id === frame.entry.id);
  const history = index >= 0 ? frames.slice(0, index + 1) : [frame];
  const oses = [
    ...new Set([...requiredOS(project), ...history.map((frame) => frame.entry.platform)]),
  ];
  return (
    <div className="replay-devices">
      <div className="replay-banner">
        <span>
          {L('Historique', 'History')} ·{' '}
          {new Date(frame.entry.completedAt ?? frame.entry.startedAt).toLocaleString()}
        </span>
        <button onClick={onLive}>{L('Revenir au direct', 'Return to live')}</button>
      </div>
      <div className="replay-device-grid">
        {oses.map((os) => {
          const capture = [...history].reverse().find((item) => item.entry.platform === os);
          return (
            <section className="replay-device" key={os}>
              <h3>
                <PlatformIcon platform={os} />
                {os === 'ios' ? 'iOS' : 'Android'}
              </h3>
              {capture ? (
                <>
                  <b>
                    {capture.entry.screenAfter?.name ??
                      capture.entry.screenBefore?.name ??
                      capture.entry.nodeName}
                  </b>
                  <small>
                    {capture.entry.nodeName} · {capture.entry.outcome ?? capture.entry.status}
                  </small>
                  <time>
                    {new Date(
                      capture.entry.completedAt ?? capture.entry.startedAt,
                    ).toLocaleString()}
                  </time>
                  <CaptureImage
                    projectId={project.id}
                    campaignId={project.activeCampaignId ?? undefined}
                    runId={capture.runId}
                    entry={capture.entry}
                    alt={`${os} · ${capture.entry.nodeName}`}
                  />
                </>
              ) : (
                <p>
                  {L(
                    'Aucune capture à cette étape pour cet OS.',
                    'No capture at this point for this OS.',
                  )}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
