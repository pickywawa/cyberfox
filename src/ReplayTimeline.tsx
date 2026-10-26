import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import type { ReplayFrame } from '../shared/model';
import type { L } from './NodeEditor';

export function ReplayTimeline({
  frames,
  selected,
  onSelect,
  L,
}: {
  frames: ReplayFrame[];
  selected: ReplayFrame | null;
  onSelect: (frame: ReplayFrame | null) => void;
  L: L;
}) {
  const [playing, setPlaying] = useState(false);
  const state = useRef({ frames, selected, onSelect });
  state.current = { frames, selected, onSelect };
  useEffect(() => {
    if (!selected) setPlaying(false);
  }, [selected?.entry.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { frames, selected, onSelect } = state.current;
      const index = selected
        ? frames.findIndex((frame) => frame.entry.id === selected.entry.id)
        : -1;
      if (!frames.length || index >= frames.length - 1) {
        setPlaying(false);
        return;
      }
      onSelect(frames[index + 1]);
    }, 1000);
    return () => clearInterval(timer);
  }, [playing]);
  if (!frames.length) return null;
  const index = selected
    ? Math.max(
        0,
        frames.findIndex((frame) => frame.entry.id === selected.entry.id),
      )
    : frames.length - 1;
  return (
    <aside
      className="replay-timeline"
      aria-label={L('Progression des captures', 'Capture timeline')}
    >
      <button
        className={selected ? '' : 'active'}
        onClick={() => {
          setPlaying(false);
          onSelect(null);
        }}
        title={L('Revenir au direct', 'Return to live')}
      >
        {L('Direct', 'Live')}
      </button>
      <button
        aria-label={
          playing
            ? L('Pause des captures', 'Pause capture playback')
            : L('Lire les captures', 'Play captures')
        }
        onClick={() => {
          if (!playing && (!selected || index === frames.length - 1)) onSelect(frames[0]);
          setPlaying(!playing);
        }}
      >
        {playing ? <Pause size={12} /> : <Play size={12} />}
      </button>
      <span>
        {index + 1}/{frames.length}
      </span>
      <input
        type="range"
        aria-label={L('Parcourir les captures', 'Browse captures')}
        aria-valuetext={`${index + 1} · ${frames[index].entry.nodeName}`}
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={index}
        onChange={(event) => {
          setPlaying(false);
          onSelect(frames[Number(event.target.value)]);
        }}
      />
      <button
        disabled={index === 0}
        onClick={() => onSelect(frames[index - 1])}
        aria-label={L('Étape précédente', 'Previous step')}
      >
        ↑
      </button>
      <button
        disabled={index === frames.length - 1}
        onClick={() => onSelect(frames[index + 1])}
        aria-label={L('Étape suivante', 'Next step')}
      >
        ↓
      </button>
    </aside>
  );
}
