import { useEffect, useState } from 'react';
import { Plus, Save, Search, Trash2 } from 'lucide-react';
import { variablesSchema, type Project } from '../shared/model';
import type { L } from './NodeEditor';
export function VariablesPanel({
  project,
  onSave,
  onClose,
  L,
}: {
  project: Project;
  onSave: (variables: Project['variables']) => Promise<void>;
  onClose: () => void;
  L: L;
}) {
  const [rows, setRows] = useState<{ id: string; key: string; value: string }[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setRows(
      Object.entries(project.variables ?? {}).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value,
      })),
    );
    setError('');
    setNotice('');
  }, [project.id, project.variables]);
  function change(id: string, patch: { key?: string; value?: string }) {
    setRows((old) => old.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setNotice('');
    setError('');
  }
  async function save() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const names = rows.map((row) => row.key.trim());
      if (new Set(names).size !== names.length)
        throw new Error(L('Chaque clé doit être unique.', 'Each key must be unique.'));
      if (names.some((key) => !key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)))
        throw new Error(
          L(
            'Clé requise : lettres, chiffres et _, sans chiffre au début.',
            'Keys are required: letters, digits and _, without a leading digit.',
          ),
        );
      const variables = variablesSchema.parse(
        Object.fromEntries(rows.map((row, i) => [names[i], row.value])),
      );
      await onSave(variables);
      setNotice(L('Variables enregistrées dans le projet.', 'Variables saved in the project.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="variables-panel">
      <div className="modal-body">
        <div className="variables-context">
          <strong>{project.name}</strong>
          <span className="badge">
            {rows.length}{' '}
            {rows.length > 1 ? L('variables', 'variables') : L('variable', 'variable')}
          </span>
        </div>
        <p className="muted">
          {L(
            'Clés et valeurs propres à ce projet, enregistrées en clair. Utilisez une référence comme ${QA_USERNAME} dans vos éléments de scénario.',
            'Project-specific keys and values, saved as plain text. Use a reference such as ${QA_USERNAME} in scenario items.',
          )}
        </p>
        <div className="variables-tools">
          <label className="variables-search">
            <Search size={14} />
            <input
              aria-label={L('Rechercher une variable', 'Search variables')}
              placeholder={L('Rechercher une clé…', 'Search keys…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              setRows((old) => [...old, { id: crypto.randomUUID(), key: '', value: '' }]);
              setQuery('');
              setNotice('');
            }}
          >
            <Plus size={14} />
            {L('Ajouter une variable', 'Add variable')}
          </button>
        </div>
        {!rows.length && (
          <div className="empty-variables">
            {L(
              'Aucune variable. Ajoutez par exemple QA_USERNAME et QA_PASSWORD.',
              'No variables. For example, add QA_USERNAME and QA_PASSWORD.',
            )}
          </div>
        )}
        {rows.length > 0 &&
          !rows.some((row) => row.key.toLowerCase().includes(query.toLowerCase())) && (
            <p className="empty-variables">
              {L(
                'Aucune variable ne correspond à cette recherche.',
                'No variables match this search.',
              )}
            </p>
          )}
        <div className="variable-rows">
          {rows
            .filter((row) => row.key.toLowerCase().includes(query.toLowerCase()))
            .map((row) => (
              <div className="variable-row" key={row.id}>
                <label>
                  {L('Clé', 'Key')}
                  <input
                    aria-label={L('Clé de variable ', 'Variable key ') + (rows.indexOf(row) + 1)}
                    value={row.key}
                    onChange={(e) => change(row.id, { key: e.target.value })}
                    placeholder="QA_USERNAME"
                    maxLength={100}
                  />
                  <code>{'${' + (row.key || 'CLE') + '}'}</code>
                </label>
                <label>
                  {L('Valeur', 'Value')}
                  <textarea
                    aria-label={
                      L('Valeur de variable ', 'Variable value ') + (rows.indexOf(row) + 1)
                    }
                    value={row.value}
                    onChange={(e) => change(row.id, { value: e.target.value })}
                    maxLength={20000}
                    rows={2}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label={
                    L('Supprimer la variable ', 'Delete variable ') +
                    (row.key || rows.indexOf(row) + 1)
                  }
                  onClick={() => {
                    setRows((old) => old.filter((item) => item.id !== row.id));
                    setNotice('');
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="save-notice" role="status">
            {notice}
          </p>
        )}
      </div>
      <footer>
        <button onClick={onClose}>{L('Fermer', 'Close')}</button>
        <button className="primary" disabled={saving} onClick={() => void save()}>
          <Save size={14} />
          {L('Enregistrer les variables', 'Save variables')}
        </button>
      </footer>
    </section>
  );
}
