import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import { defineTool } from '../define.ts';
import { pathResolver, pathSchema } from '../internal/path.ts';
import { TextPage } from '../internal/text-page.ts';
import type { AgentTool } from '../types.ts';

export const MAX_READ_LINES = 2_000;

export function readFileTool(directory = process.cwd()): AgentTool {
  const resolvePath = pathResolver(directory);

  return defineTool({
    name: 'read_file',
    description:
      `Read a UTF-8 text file by lines. Returns at most ${MAX_READ_LINES} lines or 50 KiB, whichever comes first. Use the returned offset to continue pagination.`,
    parameters: pathSchema.extend({
      path: pathSchema.shape.path
        .describe(
          'File path, relative to the workspace or absolute; supports ~.',
        ),
      offset: z.number().int().min(1).nullable()
        .describe(
          '1-based line to start from. Pass null to start at line 1.',
        ),
      limit: z.number().int().min(1).max(MAX_READ_LINES).nullable()
        .describe(
          `Maximum lines to return, from 1 to ${MAX_READ_LINES}. Pass null for ${MAX_READ_LINES}.`,
        ),
    }),
    async execute({ path, offset, limit }, signal) {
      const target = resolvePath(path);
      const stats = await stat(target);
      signal.throwIfAborted();
      if (!stats.isFile()) {
        throw new Error('Path must be a file');
      }
      const start = (offset ?? 1) - 1;
      const page = await readPage(target, {
        start,
        limit: limit ?? MAX_READ_LINES,
        signal,
      });
      signal.throwIfAborted();
      if (
        start >= page.totalLines
        && !(start === 0 && page.totalLines === 0)
      ) {
        const lineUnit = page.totalLines === 1 ? 'line' : 'lines';
        throw new Error(
          `Offset ${start + 1} is beyond end of file (${page.totalLines}) ${lineUnit}`
        );
      }
      const end = start + page.lineCount;
      const output = end < page.totalLines
        ? `${page.content}\n[Showing lines ${start + 1}-${end} of ${page.totalLines}. Use offset=${end + 1} to continue.]`
        : page.content;
      return {
        output,
        details: {
          offset: start + 1,
          lineCount: page.lineCount,
        },
      };
    },
  });
}

async function readPage(path: string, { start, limit, signal }: {
  start: number;
  limit: number;
  signal: AbortSignal;
}) {
  const page = new TextPage({ start, limit });
  const stream = createReadStream(path, {
    encoding: 'utf8',
    highWaterMark: 64 * 1024,
    signal,
  });
  const closed = finished(stream, { cleanup: true });
  void closed.catch(() => {});
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted();
      page.append(chunk);
    }
    await closed;
    return page.finish();
  } finally {
    stream.destroy();
    await closed.catch(() => {});
  }
}
