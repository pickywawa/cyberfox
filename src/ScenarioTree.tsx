import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Layers3,
  MousePointer2,
  Plus,
  Play,
  ShieldCheck,
} from 'lucide-react';
import type { ScenarioNode, RunReport, RunStatus } from '../shared/model';
export const nodeIcons = {
  scenario: Layers3,
  action: MousePointer2,
  navigation: Compass,
  test: ShieldCheck,
};
export function nodeStatus(
  report: RunReport | null | undefined,
  id: string,
): RunStatus | undefined {
  const entries = report?.entries.filter((e) => e.nodeId === id && !e.precondition);
  if (!entries?.length) return;
  return entries.some((e) => e.status === 'running')
    ? 'running'
    : entries.some((e) => e.status === 'failed' || e.status === 'blocked')
      ? 'failed'
      : entries.every((e) => e.status === 'passed')
        ? 'passed'
        : entries.at(-1)?.status;
}
export function ScenarioTree({
  nodes,
  selected,
  onSelect,
  onAdd,
  onRun,
  report,
  proposed,
  depth = 0,
}: {
  nodes: ScenarioNode[];
  selected?: string | null;
  onSelect: (id: string) => void;
  onAdd?: (id: string) => void;
  onRun?: (id: string) => void;
  report?: RunReport | null;
  proposed?: Set<string>;
  depth?: number;
}) {
  const [closed, setClosed] = useState(new Set<string>());
  return (
    <div className="tree" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((n) => {
        const Icon = nodeIcons[n.kind];
        const open = !closed.has(n.id);
        return (
          <div key={n.id}>
            <div
              className={`tree-row ${selected === n.id ? 'selected' : ''} state-${nodeStatus(report, n.id) ?? 'idle'} ${proposed?.has(n.id) ? 'proposed' : ''}`}
              style={{ paddingLeft: 8 + depth * 15 }}
            >
              <button
                className="tree-toggle"
                disabled={!n.children.length}
                aria-label="Déplier / replier"
                onClick={() =>
                  setClosed((old) => {
                    const next = new Set(old);
                    next.has(n.id) ? next.delete(n.id) : next.add(n.id);
                    return next;
                  })
                }
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <button
                className="tree-item"
                role="treeitem"
                aria-selected={selected === n.id}
                onClick={() => onSelect(n.id)}
              >
                <Icon size={16} className={n.kind} />
                <span>{n.name}</span>
              </button>
              {onRun && n.kind === 'scenario' && (
                <button
                  className="tree-control"
                  aria-label={'Exécuter ' + n.name}
                  onClick={() => onRun(n.id)}
                >
                  <Play size={13} />
                </button>
              )}
              {onAdd && (
                <button
                  className="tree-control"
                  aria-label={'Ajouter dans ' + n.name}
                  onClick={() => onAdd(n.id)}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {open && n.children.length > 0 && (
              <ScenarioTree
                nodes={n.children}
                selected={selected}
                onSelect={onSelect}
                onAdd={onAdd}
                onRun={onRun}
                report={report}
                proposed={proposed}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
