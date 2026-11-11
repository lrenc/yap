import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { z } from 'zod';

export const pathSchema = z.strictObject({
  path: z.string()
    .regex(/\S/, 'path must contain non-whitespace characters')
    .describe('Relative or absolute path; supports ~.')
});

export function pathResolver(directory: string) {
  const base = resolve(expandHome(directory));
  return (input: string): string => resolve(base, expandHome(input));
}

function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/') || path.startsWith(`~${sep}`)) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
