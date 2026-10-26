import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, ShieldCheck, MousePointer2, Smartphone, Play } from 'lucide-react';
import {
  flatten,
  nodePath,
  requiredOS,
  variantSchema,
  type Project,
  type ScenarioNode,
  type Variant,
  type OS,
} from '../shared/model';
import { nodeIcons } from './ScenarioTree';
export type L = (fr: string, en: string) => string;
export function NodeEditor({
  node,
  project,
  onChange,
  onDelete,
  onPlay,
  L,
  readOnly = false,
}: {
  node: ScenarioNode;
  project: Project;
  onChange?: (patch: Partial<ScenarioNode>) => Promise<void>;
  onDelete?: () => void;
  onPlay?: (os: OS) => void;
  L: L;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(node);
  const [tag, setTag] = useState('');
  const previousServerNode = useRef(node);
  useEffect(() => {
    const baseline = previousServerNode.current;
    previousServerNode.current = node;
    setDraft((current) => {
      if (current.id !== node.id) return node;
      const next = { ...node };
      for (const key of [
        'name',
        'screen',
        'description',
        'tags',
        'kind',
        'preconditionId',
        'childrenOnPreconditionFailure',
        'blocking',
      ] as const)
        if (JSON.stringify(current[key]) !== JSON.stringify(baseline[key]))
          (next as any)[key] = current[key];
      next.variants = { ...node.variants };
      for (const os of ['android', 'ios'] as const) {
        const local = current.variants[os],
          old = baseline.variants[os];
        if (local) {
          const merged = { ...node.variants[os] } as Variant;
          for (const key of Object.keys(local) as (keyof Variant)[])
            if (JSON.stringify(local[key]) !== JSON.stringify(old?.[key]))
              (merged as any)[key] = local[key];
          next.variants[os] = merged;
        }
      }
      return next;
    });
  }, [node]);
  const path = nodePath(project.nodes, node.id);
  const parent = path.at(-2);
  const siblings = parent?.children ?? project.nodes;
  const index = siblings.findIndex((n) => n.id === node.id);
  const previous = siblings[index - 1];
  const Icon = nodeIcons[node.kind];
  const change = (patch: Partial<ScenarioNode>) => {
    setDraft((old) => ({ ...old, ...patch }));
    void onChange?.(patch);
  };
  const variant = (os: OS, patch: Partial<Variant>) =>
    change({
      variants: {
        ...draft.variants,
        [os]: {
          ...variantSchema.parse({ operation: node.kind === 'test' ? 'assert' : 'tap' }),
          ...draft.variants[os],
          ...patch,
        },
      },
    });
  const behavior =
    draft.variants[requiredOS(project)[0]] ??
    variantSchema.parse({ operation: node.kind === 'test' ? 'assert' : 'tap' });
  const common = (patch: Partial<Variant>) =>
    change({
      variants: Object.fromEntries(
        requiredOS(project).map((os) => [
          os,
          {
            ...variantSchema.parse({ operation: node.kind === 'test' ? 'assert' : 'tap' }),
            ...draft.variants[os],
            ...patch,
          },
        ]),
      ),
    });
  return (
    <div className="node-editor">
      {Object.keys(project.variables ?? {}).length > 0 && (
        <p className="note">
          {L('Variables disponibles : ', 'Available variables: ')}
          {Object.keys(project.variables)
            .map((key) => '${' + key + '}')
            .join(' · ')}
        </p>
      )}
      <div className="editor-title">
        <span className={'kind ' + node.kind}>
          <Icon size={14} />
          {node.kind === 'scenario'
            ? L('Scénario', 'Scenario')
            : node.kind === 'action'
              ? L('Action', 'Action')
              : node.kind === 'test'
                ? L('Test · assertion', 'Test · assertion')
                : L('Navigation', 'Navigation')}
        </span>
        {!readOnly && (
          <button
            className="danger-button"
            aria-label={L('Supprimer cet élément', 'Delete this item')}
            onClick={onDelete}
          >
            <Trash2 size={14} />
            {L('Supprimer', 'Delete')}
          </button>
        )}
      </div>
      <div className="editor-grid">
        {node.kind !== 'scenario' && (
          <label>
            {L('Type', 'Type')}
            <select
              disabled={readOnly}
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as ScenarioNode['kind'];
                change({
                  kind,
                  screen: kind === 'navigation' ? draft.screen : undefined,
                  variants: Object.fromEntries(
                    requiredOS(project).map((os) => [
                      os,
                      {
                        ...draft.variants[os],
                        ...variantSchema.parse({
                          ...draft.variants[os],
                          operation: kind === 'test' ? 'assert' : 'tap',
                        }),
                      },
                    ]),
                  ),
                });
              }}
            >
              <option value="action">Action</option>
              <option value="navigation">Navigation</option>
              <option value="test">Test · assertion</option>
            </select>
          </label>
        )}
        <label>
          {L('Nom', 'Name')}
          <input
            disabled={readOnly}
            value={draft.name}
            maxLength={180}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onBlur={() => {
              if (draft.name.trim() && draft.name !== node.name)
                change({ name: draft.name.trim() });
            }}
          />
        </label>
      </div>
      {draft.kind === 'navigation' && (
        <section className="navigation-screen-editor">
          <h3>{L('Écran destination', 'Destination screen')}</h3>
          <p className="muted">
            {L(
              'Une identité stable et des repères distinctifs identifient l’écran. Sélectionnez des composants de destination dans le miroir pour ajouter des repères.',
              'A stable identity and distinctive markers identify the screen. Select destination components in the mirror to add markers.',
            )}
          </p>
          <div className="editor-grid">
            <label>
              {L('Identifiant unique de l’écran', 'Unique screen identifier')}
              <input
                disabled={readOnly}
                value={draft.screen?.id ?? ''}
                placeholder="login"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    screen: {
                      id: event.target.value,
                      name: draft.screen?.name ?? draft.name,
                      variants: draft.screen?.variants ?? {},
                    },
                  })
                }
                onBlur={() => {
                  if (draft.screen?.id.trim()) void change({ screen: draft.screen });
                }}
              />
            </label>
            <label>
              {L('Nom de l’écran', 'Screen name')}
              <input
                disabled={readOnly}
                value={draft.screen?.name ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    screen: {
                      id: draft.screen?.id || draft.id,
                      name: event.target.value,
                      variants: draft.screen?.variants ?? {},
                    },
                  })
                }
                onBlur={() => {
                  if (draft.screen?.name.trim()) void change({ screen: draft.screen });
                }}
              />
            </label>
          </div>
          {requiredOS(project).map((os) => (
            <div key={os}>
              <b>{os === 'ios' ? 'iOS' : 'Android'}</b>
              {draft.screen?.variants[os]?.markers.map((marker, index) => (
                <div className="screen-marker-row" key={index}>
                  <code>
                    {marker.using} · {marker.value}
                  </code>
                  {!readOnly && (
                    <button
                      onClick={() => {
                        if (!draft.screen) return;
                        const markers = draft.screen.variants[os]!.markers.filter(
                          (_, i) => i !== index,
                        );
                        const variants = { ...draft.screen.variants };
                        if (markers.length) variants[os] = { markers };
                        else delete variants[os];
                        void change({ screen: { ...draft.screen, variants } });
                      }}
                    >
                      {L('Retirer', 'Remove')}
                    </button>
                  )}
                </div>
              ))}
              {!draft.screen?.variants[os] && (
                <p className="note">
                  {L('Aucun repère configuré pour cet OS.', 'No markers configured for this OS.')}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
      <label>
        {L('Description facultative', 'Optional description')}
        <textarea
          disabled={readOnly}
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onBlur={() => {
            if (draft.description !== node.description) change({ description: draft.description });
          }}
        />
      </label>
      <label>Tags</label>
      <div className="tag-editor">
        {project.tags.map((t) => (
          <button
            disabled={readOnly}
            className={draft.tags.includes(t) ? 'tag selected' : 'tag'}
            key={t}
            onClick={() =>
              change({
                tags: draft.tags.includes(t)
                  ? draft.tags.filter((v) => v !== t)
                  : [...draft.tags, t],
              })
            }
          >
            {t}
          </button>
        ))}
        {draft.tags
          .filter((t) => !project.tags.includes(t))
          .map((t) => (
            <span className="tag selected" key={t}>
              {t}
            </span>
          ))}
        {!readOnly && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tag.trim()) {
                change({ tags: [...new Set([...draft.tags, tag.trim()])] });
                setTag('');
              }
            }}
          >
            <input
              aria-label={L('Nouveau tag', 'New tag')}
              placeholder={L('Nouveau tag…', 'New tag…')}
              value={tag}
              maxLength={60}
              onChange={(e) => setTag(e.target.value)}
            />
            <button type="submit" aria-label={L('Ajouter le tag', 'Add tag')}>
              <Plus size={14} />
            </button>
          </form>
        )}
      </div>
      <div className="editor-grid">
        <label>
          {L('Précondition · test précédent', 'Precondition · previous test')}
          <select
            disabled={readOnly}
            value={draft.preconditionId ?? ''}
            onChange={(e) => change({ preconditionId: e.target.value || null })}
          >
            <option value="">{L('Aucune', 'None')}</option>
            {previous?.kind === 'test' && <option value={previous.id}>{previous.name}</option>}
          </select>
        </label>
        <label className="toggle-line">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={draft.childrenOnPreconditionFailure}
            onChange={(e) => change({ childrenOnPreconditionFailure: e.target.checked })}
          />
          {L(
            'Exécuter les enfants si la précondition échoue',
            'Run children if precondition fails',
          )}
        </label>
      </div>
      <label className="toggle-line">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={draft.blocking}
          onChange={(e) => change({ blocking: e.target.checked })}
        />
        {L('Échec bloquant pour la suite du scénario', 'Failure blocks the rest of the scenario')}
      </label>
      {node.kind !== 'scenario' && (
        <>
          <div className="notice">
            <MousePointer2 size={16} />
            {L(
              'Cliquez sur un composant dans la vue mobile pour l’associer à cet élément. Les sélecteurs sont conservés séparément pour chaque OS.',
              'Click a component in the mobile view to associate it with this item. Selectors are kept separately for each OS.',
            )}
          </div>
          <div className="behavior-config">
            <h3>{L('Comportement de l’élément', 'Item behavior')}</h3>
            {node.kind === 'test' ? (
              <>
                <label>
                  {L('Vérification', 'Assertion')}
                  <select
                    disabled={readOnly}
                    value={behavior.assertion}
                    onChange={(e) =>
                      common({
                        assertion: e.target.value as Variant['assertion'],
                        operation: 'assert',
                      })
                    }
                  >
                    <option value="visible">{L('Composant visible', 'Component visible')}</option>
                    <option value="absent">{L('Composant absent', 'Component absent')}</option>
                    <option value="text">{L('Texte exact', 'Exact text')}</option>
                    <option value="enabled">{L('Composant activé', 'Component enabled')}</option>
                  </select>
                </label>
                {behavior.assertion === 'text' && (
                  <label>
                    {L('Texte attendu', 'Expected text')}
                    <input
                      value={behavior.expected}
                      disabled={readOnly}
                      onChange={(e) => common({ expected: e.target.value })}
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <label>
                  {L('Interaction', 'Interaction')}
                  <select
                    disabled={readOnly}
                    value={behavior.operation}
                    onChange={(e) => common({ operation: e.target.value as Variant['operation'] })}
                  >
                    <option value="tap">{L('Activer le composant', 'Activate component')}</option>
                    <option value="type">{L('Saisir du texte', 'Type text')}</option>
                    <option value="clear">{L('Vider le champ', 'Clear field')}</option>
                    <option value="back">{L('Retour système', 'System back')}</option>
                  </select>
                </label>
                {behavior.operation === 'type' && (
                  <label>
                    {L('Valeur ou variable', 'Value or variable')}
                    <input
                      disabled={readOnly}
                      value={behavior.value}
                      onChange={(e) => common({ value: e.target.value })}
                    />
                  </label>
                )}
              </>
            )}
          </div>
          <div className="variant-summary">
            {requiredOS(project).map((os) => {
              const v =
                draft.variants[os] ??
                variantSchema.parse({ operation: node.kind === 'test' ? 'assert' : 'tap' });
              return (
                <section key={os}>
                  <header>
                    <Smartphone size={15} />
                    <b>{os === 'ios' ? 'iOS' : 'Android'}</b>
                    <span className={'badge ' + (v.locator ? 'bound' : '')}>
                      {v.locator
                        ? L('Composant associé', 'Component bound')
                        : L('À associer', 'Not bound')}
                    </span>
                    {!readOnly && (
                      <button
                        className="icon-button"
                        title={L('Jouer cet élément', 'Play this item')}
                        onClick={() => onPlay?.(os)}
                      >
                        <Play size={15} />
                      </button>
                    )}
                  </header>
                  <details className="os-technical">
                    <summary>{L('Paramètres propres à cet OS', 'OS-specific parameters')}</summary>
                    <p className="component-label">
                      {v.locator?.value ??
                        L('Aucun composant sélectionné', 'No selected component')}
                    </p>
                    {node.kind === 'test' ? (
                      <>
                        <label>
                          {L('Vérification', 'Assertion')}
                          <select
                            disabled={readOnly}
                            value={v.assertion}
                            onChange={(e) =>
                              variant(os, {
                                assertion: e.target.value as Variant['assertion'],
                                operation: 'assert',
                              })
                            }
                          >
                            <option value="visible">
                              {L('Composant visible', 'Component visible')}
                            </option>
                            <option value="absent">
                              {L('Composant absent', 'Component absent')}
                            </option>
                            <option value="text">{L('Texte exact', 'Exact text')}</option>
                            <option value="enabled">
                              {L('Composant activé', 'Component enabled')}
                            </option>
                          </select>
                        </label>
                        {v.assertion === 'text' && (
                          <label>
                            {L('Texte attendu', 'Expected text')}
                            <input
                              disabled={readOnly}
                              value={v.expected}
                              onChange={(e) => variant(os, { expected: e.target.value })}
                            />
                          </label>
                        )}
                      </>
                    ) : (
                      <>
                        <label>
                          {L('Interaction', 'Interaction')}
                          <select
                            disabled={readOnly}
                            value={v.operation}
                            onChange={(e) =>
                              variant(os, { operation: e.target.value as Variant['operation'] })
                            }
                          >
                            <option value="tap">
                              {L('Activer le composant', 'Activate component')}
                            </option>
                            <option value="type">{L('Saisir du texte', 'Type text')}</option>
                            <option value="clear">{L('Vider le champ', 'Clear field')}</option>
                            <option value="back">{L('Retour système', 'System back')}</option>
                          </select>
                        </label>
                        {v.operation === 'type' && (
                          <label>
                            {L('Valeur ou variable ${NOM}', 'Value or variable ${NAME}')}
                            <input
                              disabled={readOnly}
                              value={v.value}
                              onChange={(e) => variant(os, { value: e.target.value })}
                            />
                          </label>
                        )}
                      </>
                    )}
                    <label>
                      {L('Attente maximale (secondes)', 'Maximum wait (seconds)')}
                      <input
                        disabled={readOnly}
                        type="number"
                        min={0}
                        max={60}
                        value={v.timeoutMs / 1000}
                        onChange={(e) =>
                          variant(os, {
                            timeoutMs: Math.max(0, Math.min(60, Number(e.target.value))) * 1000,
                          })
                        }
                      />
                    </label>
                  </details>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
