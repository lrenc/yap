import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { defineTool } from '../define.ts';
import { pathResolver, pathSchema } from '../internal/path.ts';
import { truncateLines } from '../internal/truncate.ts';
import type { AgentTool } from '../types.ts';

const DEFAULT_LIMIT = 500;

export function readDirTool(directory = process.cwd()): AgentTool {
  const resolvePath = pathResolver(directory);

  return defineTool({
    name: 'read_directory',
    description:
      'List entries in one directory, sorted alphabetically. Includes dotfiles; directory names end with "/". Does not recurse. Output is limited to 50 KiB.',
    parameters: pathSchema.extend({
      path: pathSchema.shape.path.nullable()
        .describe(
          'Directory path, relative to the workspace or absolute; supports ~. Pass null for the workspace root.',
        ),

      limit: z.number().int().min(1).nullable()
        .describe(
          `Maximum entries to return. Pass null to use ${DEFAULT_LIMIT}. Output may be truncated further at 50 KiB.`,
        ),
    }),
    async execute({ path, limit }, signal) {
      const target = resolvePath(path ?? '.');
      const entries = await readdir(target, {
        withFileTypes: true,
      });
      signal.throwIfAborted();
      entries.sort((a, b) => (
        a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
      ));
      const lines: string[] = [];
      const maxEntries = limit ?? DEFAULT_LIMIT;
      let limitReached = false;
      for (const entry of entries) {
        signal.throwIfAborted();
        if (lines.length >= maxEntries) {
          limitReached = true;
          break;
        }
        let isDirectory = entry.isDirectory();
        if (entry.isSymbolicLink()) {
          try {
            isDirectory = (await stat(join(target, entry.name))).isDirectory();
          } catch (error) {
            continue;
          }
        }
        lines.push(`${entry.name}${isDirectory ? '/' : ''}\n`);
      }
      signal.throwIfAborted();
      if (lines.length === 0) {
        return '(empty directory)';
      }
      const page = truncateLines(lines, {
        limit: maxEntries,
      });
      const notices: string[] = [];
      if (limitReached) {
        notices.push(
          `${maxEntries} entries limit reached. Use limit=${maxEntries * 2} for more`
        );
      }
      if (page.byteLimitReached) {
        notices.push('50 KiB limit reached');
      }
      const content = page.content.slice(0, -1);
      return (
        notices.length > 0
          ? `${content}\n\n[${notices.join('. ')}]`
          : content
      );
    },
  });
}
