export function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}

export function isSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isSafeInteger(value)
  );
}

export function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

export function isUndefined(value: unknown): value is undefined {
  return typeof value === 'undefined';
}