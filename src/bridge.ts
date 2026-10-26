import { campaignExport } from '../shared/campaigns';
import type { CampaignDetail, Campaign } from '../shared/model';
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
const campaignsKey = 'cyberfox.preview.campaigns.v1';
const campaigns = (): CampaignDetail[] => JSON.parse(localStorage.getItem(campaignsKey) ?? '[]');
const saveCampaigns = (data: CampaignDetail[]) =>
  localStorage.setItem(campaignsKey, JSON.stringify(data));
function findCampaign(projectId: string, campaignId: string) {
  const detail = campaigns().find(
    (detail) => detail.campaign.projectId === projectId && detail.campaign.id === campaignId,
  );
  if (!detail) throw new Error('Campagne introuvable');
  return detail;
}
export const isDesktop = !!window.cyberfox;
export const api: Bridge = window.cyberfox ?? {
  updateStatus: async () => ({
    state: 'idle',
    currentVersion: __APP_VERSION__,
    percent: 0,
    received: 0,
    total: 0,
    compatible: false,
  }),
  updateCheck: async () => {
    throw new Error('Vérification disponible dans Electron');
  },
  updateDownload: async () => {
    throw new Error('Téléchargement disponible dans Electron');
  },
  updateInstall: async () => {},
  updateRelease: async () => {
    window.open('https://github.com/pickywawa/cyberfox/releases/latest', '_blank', 'noopener');
  },
  aiAnswer: async () => {},
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
    const project = migrateProject({
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
    });
    state.projects.push(project);
    state.activeProjectId = project.id;
    save(state);
    return project;
  },
  onNewProject: () => () => {},
  onEditProject: () => () => {},
  projectApplications: async () => {
    throw new Error('Connectez un appareil dans l’application de bureau.');
  },
  projectApplicationInfo: async () => {
    throw new Error('Lecture disponible avec un appareil connecté dans Electron.');
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
      revision:
        state.projects[index].revision +
        (input.nodes || input.tags || input.platforms || input.applications ? 1 : 0),
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
  logout: async () => {
    throw new Error('La déconnexion nécessite Electron.');
  },
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
  deviceHealth: async (id) => ({ deviceId: id, checkedAt: new Date().toISOString(), checks: [] }),
  openWdaProject: async () => {
    throw new Error('Xcode nécessite Cyberfox sur Mac.');
  },
  openDeviceDocumentation: async (topic) => {
    const paths = {
      provisioning: 'getting-started/provisioning-profile/',
      windows: 'guides/non-macos-hosts/',
      tunnels: 'guides/remotexpc-tunnels-real-devices/',
      preinstalled: 'guides/run-preinstalled-wda/',
    };
    window.open(
      'https://appium.github.io/appium-xcuitest-driver/latest/' + paths[topic],
      '_blank',
      'noopener,noreferrer',
    );
  },
  onEvent: () => () => {},
  inspect: async () => {
    throw new Error('Exploration disponible dans Electron');
  },
  perform: async () => {
    throw new Error('Pilotage disponible dans Electron');
  },
  campaignList: async (projectId) =>
    campaigns()
      .filter((detail) => detail.campaign.projectId === projectId)
      .map((detail) => detail.campaign)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  campaignCreate: async (input) => {
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      label: input.label || 'Campagne ' + new Date().toLocaleString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'open',
    };
    saveCampaigns([...campaigns(), { campaign, reports: [] }]);
    const state = load();
    const project = state.projects.find((project) => project.id === input.projectId);
    if (!project) throw new Error('Projet introuvable');
    project.activeCampaignId = campaign.id;
    save(state);
    return campaign;
  },
  campaignLoad: async (input) => findCampaign(input.projectId, input.campaignId),
  campaignUpdate: async (input) => {
    const data = campaigns();
    const detail = data.find(
      (d) => d.campaign.id === input.campaignId && d.campaign.projectId === input.projectId,
    );
    if (!detail) throw new Error('Campagne introuvable');
    detail.campaign = {
      ...detail.campaign,
      ...(input.label ? { label: input.label } : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: new Date().toISOString(),
    };
    saveCampaigns(data);
    return detail.campaign;
  },
  campaignClean: async (input) => {
    const data = campaigns();
    for (const detail of data)
      if (
        detail.campaign.projectId === input.projectId &&
        (!input.campaignId || detail.campaign.id === input.campaignId)
      ) {
        detail.reports = [];
        detail.campaign.status = 'open';
      }
    saveCampaigns(data);
  },
  campaignExport: async (input) =>
    campaignExport(findCampaign(input.projectId, input.campaignId), input.format),
  runScreenshot: async (input) =>
    findCampaign(input.projectId, input.campaignId!)
      .reports.find((report) => report.id === input.runId)
      ?.entries.find((entry) => entry.id === input.entryId)?.screenshot ?? null,
  replayCurrent: async () => null,
  replaySelect: async () => {},
  runStart: async () => {
    throw new Error('Exécution disponible dans Electron');
  },
  runCancel: async () => {},
  runCurrent: async () => null,
  analyze: async () => {},
  detachAi: async (value) => {
    const state = load();
    state.settings.aiDetached = value;
    save(state);
  },
  detachDevices: async (value) => {
    const state = load();
    state.settings.devicesDetached = value;
    save(state);
  },
  screenshot: async () => {
    throw new Error('Electron requis');
  },
};
