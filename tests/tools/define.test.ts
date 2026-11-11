import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineTool } from '../../src/tools/define.ts';

describe('defineTool', () => {
  test('generates a JSON schema and parses arguments before execution', async () => {
    let received = 0;
    const tool = defineTool({
      name: 'double',
      description: 'Double a number',
      parameters: z.object({
        value: z.coerce.number(),
      }),
      async execute({ value }) {
        received = value;
        return value * 2;
      },
    });

    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        value: { type: 'number' },
      },
      required: ['value'],
    });
    expect(await tool.execute(
      { value: '21' },
      new AbortController().signal,
    )).toBe(42);
    expect(received).toBe(21);
  });

  test('does not execute when schema parsing fails', async () => {
    let called = false;
    const tool = defineTool({
      name: 'strict',
      description: 'Require a string',
      parameters: z.object({
        value: z.string(),
      }),
      async execute() {
        called = true;
        return 'ok';
      },
    });

    await expect(tool.execute(
      { value: 42 },
      new AbortController().signal,
    )).rejects.toThrow();
    expect(called).toBe(false);
  });

  test('does not execute after cancellation', async () => {
    let called = false;
    const tool = defineTool({
      name: 'cancelled',
      description: 'Should not run',
      parameters: z.object({}),
      async execute() {
        called = true;
        return 'ok';
      },
    });
    const controller = new AbortController();
    controller.abort();

    await expect(tool.execute(
      {},
      controller.signal,
    )).rejects.toThrow();
    expect(called).toBe(false);
  });
});
