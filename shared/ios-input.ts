import type { ScenarioNode } from './model.js';

export const IOS_ANONYMOUS_INPUT_SELECTOR =
  '//*[self::XCUIElementTypeTextField or self::XCUIElementTypeSecureTextField]';

/** Repair caret selectors only when a typing step proves this is an input. */
export function migrateIosCaretInputs(nodes: ScenarioNode[]): ScenarioNode[] {
  const isCaret = (node: ScenarioNode) =>
    node.variants?.ios?.locator?.using === 'accessibility id' &&
    node.variants.ios.locator.value === '|';
  const visit = (list: ScenarioNode[], inputScope: boolean): ScenarioNode[] =>
    list.map((node) => ({
      ...node,
      variants:
        inputScope &&
        isCaret(node) &&
        (node.variants?.ios?.operation === 'type' || node.kind === 'test')
          ? {
              ...node.variants,
              ios: {
                ...node.variants.ios!,
                locator: { using: 'xpath', value: IOS_ANONYMOUS_INPUT_SELECTOR },
              },
            }
          : node.variants,
      children: visit(node.children ?? [], inputScope),
    }));
  const containsCaretInput = (list: ScenarioNode[]): boolean =>
    list.some(
      (node) =>
        (isCaret(node) && node.variants?.ios?.operation === 'type') ||
        containsCaretInput(node.children ?? []),
    );
  // Scope the repair to each scenario so a literal "|" in another scenario is untouched.
  return nodes.map((root) => visit([root], containsCaretInput([root]))[0]);
}
