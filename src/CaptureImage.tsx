import { useEffect, useState } from 'react';
import type { RunEntry } from '../shared/model';
import { api } from './bridge';

export function CaptureImage({
  projectId,
  campaignId,
  runId,
  entry,
  alt,
}: {
  projectId: string;
  campaignId?: string;
  runId: string;
  entry: RunEntry;
  alt: string;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setImage(null);
    setError('');
    if (entry.screenshot?.startsWith('data:image/')) {
      setImage(entry.screenshot);
      return;
    }
    if (!entry.screenshot) {
      setError(entry.screenshotError ?? 'Capture indisponible');
      return;
    }
    void api
      .runScreenshot({ projectId, campaignId, runId, entryId: entry.id })
      .then((image) => {
        if (alive) {
          setImage(image);
          if (!image) setError('Capture indisponible');
        }
      })
      .catch((error) => {
        if (alive) setError(String(error));
      });
    return () => {
      alive = false;
    };
  }, [projectId, campaignId, runId, entry.id, entry.screenshot]);
  return image ? (
    <img className="campaign-capture" src={image} alt={alt} />
  ) : (
    <p className="capture-placeholder" role="status">
      {error || 'Chargement de la capture…'}
    </p>
  );
}
