import { createHash } from 'node:crypto';
import {
  flatten,
  type OS,
  type Screen,
  type ScenarioNode,
  type ScreenReference,
  type ScreenDefinition,
} from '../shared/model.js';

export function observedDefinition(definition: ScreenDefinition, screen: Screen, platform: OS) {
  const markers = definition.variants[platform]?.markers;
  return (
    !!markers?.length &&
    markers.every(
      (marker) =>
        screen.components.filter(
          (component) =>
            component.locator?.using === marker.using && component.locator.value === marker.value,
        ).length === 1,
    )
  );
}
export function identifyScreen(
  screen: Screen,
  platform: OS,
  nodes: ScenarioNode[],
): ScreenReference {
  const definitions = new Map<string, ScreenDefinition>();
  for (const node of flatten(nodes)) if (node.screen) definitions.set(node.screen.id, node.screen);
  const matches = [...definitions.values()].filter((definition) =>
    observedDefinition(definition, screen, platform),
  );
  if (matches.length === 1)
    return { id: matches[0].id, name: matches[0].name, platform, identified: true };
  const locators = screen.components
    .filter((component) => component.locator && !component.password)
    .map((component) => JSON.stringify(component.locator))
    .sort();
  const hash = createHash('sha256').update(JSON.stringify(locators)).digest('hex').slice(0, 16);
  return {
    id: 'observed-' + hash,
    name: matches.length > 1 ? 'Écran ambigu' : 'Écran non identifié · ' + hash.slice(0, 6),
    platform,
    identified: false,
  };
}
export function validateScreenDefinitions(nodes: ScenarioNode[]) {
  const byId = new Map<string, ScreenDefinition>();
  const signatures = new Map<string, string>();
  for (const node of flatten(nodes)) {
    if (!node.screen) continue;
    if (node.kind !== 'navigation')
      throw new Error('Une identité d’écran doit être définie sur une navigation.');
    const old = byId.get(node.screen.id);
    if (old && JSON.stringify(old) !== JSON.stringify(node.screen))
      throw new Error('Définitions incompatibles pour l’écran ' + node.screen.id);
    byId.set(node.screen.id, node.screen);
    for (const platform of ['android', 'ios'] as const) {
      const markers = node.screen.variants[platform]?.markers;
      if (!markers) continue;
      const signature =
        platform +
        ':' +
        markers
          .map((marker) => JSON.stringify(marker))
          .sort()
          .join('|');
      if (signatures.has(signature) && signatures.get(signature) !== node.screen.id)
        throw new Error('Deux écrans partagent les mêmes marqueurs : ' + platform);
      signatures.set(signature, node.screen.id);
    }
  }
}

export async function waitForScreenDefinition(
  inspect: () => Promise<Screen>,
  definition: ScreenDefinition,
  platform: OS,
  nodes: ScenarioNode[],
  timeoutMs: number,
  signal: AbortSignal,
) {
  const deadline = Date.now() + timeoutMs;
  do {
    signal.throwIfAborted();
    const screen = await inspect();
    if (observedDefinition(definition, screen, platform)) {
      const identity = identifyScreen(screen, platform, nodes);
      if (!identity.identified || identity.id !== definition.id)
        throw new Error('Écran destination ambigu : ' + definition.name);
      return identity;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(
        () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
        Math.min(200, remaining),
      );
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        signal.removeEventListener('abort', abort);
        abort();
      }
    });
  } while (Date.now() <= deadline);
  throw new Error('Écran destination non confirmé : ' + definition.name);
}
