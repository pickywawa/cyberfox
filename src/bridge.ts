import {
  settingsSchema,
  migrateProject,
  validateTree,
  flatten,
  type Bridge,
  type Workspace,
} from '../shared/model';
const key = 'cyberfox.preview.v1';
const defaults: Workspace = {
  settings: settingsSchema.parse({
    theme: 'dark',
    language: 'fr',
    projectsDirectory: 'Aperçu navigateur — stockage local',
    provider: 'codex',
    codexModel: '',
    copilotModel: '',
    wdaDeviceId: '',
    wdaUrl: 'http://127.0.0.1:8100',
  }),
  projects: [],
  activeProjectId: null,
};
function load(): Workspace {
  const raw = JSON.parse(localStorage.getItem(key) ?? JSON.stringify(defaults));
  return {
    ...raw,
    settings: settingsSchema.parse(raw.settings),
    projects: raw.projects.map(migrateProject),
  };
}
function save(state: Workspace) {
  localStorage.setItem(key, JSON.stringify(state));
}
export const isDesktop = !!window.cyberfox;
export const api: Bridge = window.cyberfox ?? {
  load: async () => load(),
  settingsSave: async (settings) => {
    const state = load();
    state.settings = settings;
    save(state);
    return settings;
  },
  projectCreate: async (input) => {
    const state = load();
    if (state.projects.some((p) => p.name.toLowerCase() === input.name.toLowerCase()))
      throw new Error('Ce projet existe déjà');
    const project = {
      ...input,
      id: crypto.randomUUID(),
      directory: `${state.settings.projectsDirectory}/${input.name}`,
      tab: 'creation' as const,
      nodes: [],
      tags: [],
      revision: 0,
      selectedNodeId: null,
      deviceIds: {},
      messages: [],
      createdAt: new Date().toISOString(),
    };
    state.projects.push(project);
    state.activeProjectId = project.id;
    save(state);
    return project;
  },
  projectSelect: async (id) => {
    const state = load();
    state.activeProjectId = id;
    save(state);
  },
  projectUpdate: async (input) => {
    const state = load();
    const index = state.projects.findIndex((p) => p.id === input.id);
    if (index < 0) throw new Error('Projet introuvable');
    if (input.nodes) validateTree(input.nodes);
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== state.projects[index].revision
    )
      throw new Error('Le projet a changé');
    state.projects[index] = {
      ...state.projects[index],
      ...input,
      deviceIds: { ...state.projects[index].deviceIds, ...input.deviceIds },
      revision: state.projects[index].revision + (input.nodes || input.tags ? 1 : 0),
    };
    state.projects[index].tags = [
      ...new Set([
        ...state.projects[index].tags,
        ...flatten(state.projects[index].nodes).flatMap((n) => n.tags),
      ]),
    ];
    save(state);
    return state.projects[index];
  },
  chooseDirectory: async () => null,
  revealProject: async () => {},
  providerStatus: async (provider) => ({
    provider,
    authenticated: false,
    message: 'Disponible dans l’application Electron / Available in Electron',
    models: [],
  }),
  login: async () => {
    throw new Error(
      'Ouvrez Cyberfox dans Electron pour connecter votre compte. / Open Electron to connect your account.',
    );
  },
  onLogin: () => () => {},
  aiAsk: async () => {
    throw new Error('L’IA nécessite l’application Electron. / AI requires Electron.');
  },
  devicesScan: async () => ({
    devices: [],
    diagnostics: [
      'Détection USB et simulateurs disponible dans Electron. / USB and simulator discovery is available in Electron.',
    ],
  }),
  aiCancel: async () => {},
  onEvent: () => () => {},
  inspect: async () => {
    throw new Error('Exploration disponible dans Electron');
  },
  perform: async () => {
    throw new Error('Pilotage disponible dans Electron');
  },
  runStart: async () => {
    throw new Error('Exécution disponible dans Electron');
  },
  runCancel: async () => {},
  runCurrent: async () => null,
  analyze: async () => {},
  detachDevices: async (value) => {
    const state = load();
    state.settings.devicesDetached = value;
    save(state);
  },
  screenshot: async () => {
    throw new Error('Electron requis');
  },
};
