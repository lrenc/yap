import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileTool } from '../../../src/tools/files/read-file.ts';
import type { ToolResult } from '../../../src/tools/types.ts';

function output(result: string | ToolResult): string {
  return typeof result === 'string' ? result : result.output;
}

describe('readFileTool', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yap-read-file-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('reads a bounded page and reports the next offset', async () => {
    await writeFile(join(root, 'file.txt'), 'one\ntwo\nthree', 'utf8');
    const tool = readFileTool(root);

    const result = await tool.execute({
      path: 'file.txt',
      offset: null,
      limit: 2,
    }, new AbortController().signal) as ToolResult;

    expect(result.output).toBe(
      'one\ntwo\n\n'
      + '[Showing lines 1-2 of 3. Use offset=3 to continue.]',
    );
    expect(result.details).toEqual({
      offset: 1,
      lineCount: 2,
    });
  });

  test('continues from a one-based offset', async () => {
    await writeFile(join(root, 'file.txt'), 'one\ntwo\nthree\n', 'utf8');
    const tool = readFileTool(root);

    const result = await tool.execute({
      path: 'file.txt',
      offset: 2,
      limit: 1,
    }, new AbortController().signal) as ToolResult;

    expect(result.output).toBe(
      'two\n\n[Showing lines 2-2 of 3. Use offset=3 to continue.]',
    );
  });

  test('preserves CRLF and a missing final newline', async () => {
    await writeFile(join(root, 'file.txt'), 'one\r\ntwo', 'utf8');
    const tool = readFileTool(root);

    const result = await tool.execute({
      path: 'file.txt',
      offset: null,
      limit: null,
    }, new AbortController().signal) as ToolResult;

    expect(result.output).toBe('one\r\ntwo');
    expect(result.details).toEqual({
      offset: 1,
      lineCount: 2,
    });
  });

  test('reads an empty file', async () => {
    await writeFile(join(root, 'empty.txt'), '', 'utf8');
    const tool = readFileTool(root);

    expect(output(await tool.execute({
      path: 'empty.txt',
      offset: null,
      limit: null,
    }, new AbortController().signal))).toBe('');
  });

  test('rejects a directory and an offset beyond the file', async () => {
    await mkdir(join(root, 'directory'));
    await writeFile(join(root, 'file.txt'), 'one\n', 'utf8');
    const tool = readFileTool(root);
    const signal = new AbortController().signal;

    await expect(tool.execute({
      path: 'directory',
      offset: null,
      limit: null,
    }, signal)).rejects.toThrow('Path must be a file');
    await expect(tool.execute({
      path: 'file.txt',
      offset: 2,
      limit: null,
    }, signal)).rejects.toThrow('Offset 2 is beyond end of file (1) line');
  });

  test('does not read after cancellation', async () => {
    await writeFile(join(root, 'file.txt'), 'content', 'utf8');
    const tool = readFileTool(root);
    const controller = new AbortController();
    controller.abort();

    await expect(tool.execute({
      path: 'file.txt',
      offset: null,
      limit: null,
    }, controller.signal)).rejects.toThrow();
  });

  test('describes pagination and enforces the line limit', async () => {
    await writeFile(join(root, 'file.txt'), 'content', 'utf8');
    const tool = readFileTool(root);

    expect(tool.description).toContain('Use the returned offset');
    expect(tool.parameters).toMatchObject({
      properties: {
        path: {
          description: expect.stringContaining('File path'),
        },
        limit: {
          description: expect.stringContaining('from 1 to 2000'),
        },
      },
    });
    await expect(tool.execute({
      path: 'file.txt',
      offset: null,
      limit: 2_001,
    }, new AbortController().signal)).rejects.toThrow();
  });
});
