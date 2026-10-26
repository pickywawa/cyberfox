import type { Variant } from './model.js';
export function resolveVariables(
  text: string,
  variables: Record<string, string>,
  environment: Record<string, string | undefined> = {},
): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => {
    if (Object.hasOwn(variables, key)) return variables[key];
    const fallback = environment['CYBERFOX_SECRET_' + key];
    if (fallback !== undefined) return fallback;
    throw new Error('Variable absente du projet : ' + key);
  });
}
export function resolveVariant(
  variant: Variant,
  variables: Record<string, string>,
  environment: Record<string, string | undefined> = {},
): Variant {
  return {
    ...variant,
    value: resolveVariables(variant.value, variables, environment),
    expected: resolveVariables(variant.expected, variables, environment),
    locator: variant.locator
      ? {
          ...variant.locator,
          value: resolveVariables(variant.locator.value, variables, environment),
        }
      : undefined,
  };
}
