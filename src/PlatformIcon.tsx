import { Layers3 } from 'lucide-react';
import type { Project } from '../shared/model';
export function PlatformIcon({
  platform,
  size = 13,
}: {
  platform: Project['platforms'][number];
  size?: number;
}) {
  if (platform === 'flutter') return <Layers3 size={size} aria-hidden="true" />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={platform === 'android' ? 'os-android' : undefined}
      aria-label={platform === 'android' ? 'Android' : 'iOS'}
    >
      <path
        d={
          platform === 'android'
            ? 'm7 4-2-3 .8-.5L8 3.5a11 11 0 0 1 8 0L18.2.5l.8.5-2 3a9 9 0 0 1 5 8H2a9 9 0 0 1 5-8M7 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2m10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2M3 13h18v6a2 2 0 0 1-2 2h-1v2h-3v-2H9v2H6v-2H5a2 2 0 0 1-2-2Z'
            : 'M16 1c.3 2-1.4 4-3.4 4 .1-2 1.6-3.7 3.4-4M19.8 17.8C19 19.5 18 22 16 22c-1.2 0-1.8-.8-3.4-.8S10.3 22 9 22c-2 0-5-4.4-5-8.6 0-4.1 2.4-6.2 5-6.2 1.4 0 2.6.9 3.6.9s2.5-1 4.2-1c1.6 0 3 .8 3.8 2-3.5 2-3 6.6-.8 8.7'
        }
      />
    </svg>
  );
}
