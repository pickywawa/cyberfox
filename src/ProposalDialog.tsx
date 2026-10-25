import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { flatten, nodePath, type AiReply, type Project, type ScenarioNode } from '../shared/model';
import { Modal } from './ui';
import { ScenarioTree } from './ScenarioTree';
import { NodeEditor, type L } from './NodeEditor';
export function mergeProposal(project: Project, reply: AiReply): ScenarioNode[] {
  if (!reply.proposal) return project.nodes;
  if (!reply.parentId) return [...project.nodes, ...reply.proposal];
  let found = false;
  const insert = (nodes: ScenarioNode[]): ScenarioNode[] =>
    nodes.map((n) => {
      if (n.id === reply.parentId) {
        found = true;
        return { ...n, children: [...n.children, ...reply.proposal!] };
      }
      return { ...n, children: insert(n.children) };
    });
  const nodes = insert(project.nodes);
  if (!found) throw new Error('Le parent de la proposition n’existe plus');
  return nodes;
}
export function ProposalDialog({
  project,
  reply,
  onClose,
  onAccept,
  L,
}: {
  project: Project;
  reply: AiReply;
  onClose: () => void;
  onAccept: (nodes: ScenarioNode[]) => Promise<void>;
  L: L;
}) {
  const [selection, setSelection] = useState(reply.proposal?.[0]?.id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  let nodes: ScenarioNode[] = [];
  try {
    nodes = mergeProposal(project, reply);
  } catch (e) {
    return (
      <Modal title={L('Proposition obsolète', 'Outdated proposal')} onClose={onClose}>
        <p>{String(e)}</p>
      </Modal>
    );
  }
  const proposed = new Set(flatten(reply.proposal ?? []).map((n) => n.id));
  const node = flatten(nodes).find((n) => n.id === selection);
  const preview = { ...project, nodes };
  return (
    <Modal wide title={L('Valider les nouveaux éléments', 'Review new items')} onClose={onClose}>
      <div className="proposal-intro">
        <ShieldCheck size={19} />
        <div>
          <b>{L('Votre arbre, enrichi en bleu', 'Your tree, with additions in blue')}</b>
          <p>{reply.text}</p>
          <small>
            {L('Insertion dans : ', 'Insert into: ')}
            {reply.parentId
              ? nodePath(project.nodes, reply.parentId)
                  .map((n) => n.name)
                  .join(' / ')
              : project.name}
          </small>
        </div>
        <span className="badge">+{proposed.size}</span>
      </div>
      <div className="proposal-workspace">
        <div className="proposal-tree">
          <ScenarioTree
            nodes={nodes}
            selected={selection}
            onSelect={setSelection}
            proposed={proposed}
          />
        </div>
        <div className="proposal-editor">
          {node && <NodeEditor node={node} project={preview} L={L} readOnly />}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <footer>
        <button onClick={onClose} disabled={busy}>
          {L('Décliner', 'Decline')}
        </button>
        <button
          className="primary"
          disabled={busy || !proposed.size}
          onClick={async () => {
            setBusy(true);
            try {
              await onAccept(nodes);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Check size={16} />
          {L('Accepter et ajouter au projet', 'Accept and add to project')}
        </button>
      </footer>
    </Modal>
  );
}
