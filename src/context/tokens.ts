import { Buffer } from 'node:buffer';
import type {
  FunctionTool,
  ResponseCreateParams,
  ResponseInputItem,
} from '../model/provider/openai/types.ts';
import type { HistoryEntry } from './types.ts';

const ITEM_OVERHEAD = 4;

// 本地估算 tokens 消耗
export function estimateTokens(
  request: Pick<ResponseCreateParams, 'instructions' | 'tools' | 'input'>,
): number {
  const { instructions, tools, input } = request;
  let tokens = 0;

  if (instructions) {
    tokens += estimateText(instructions) + ITEM_OVERHEAD;
  }
  const items: ResponseInputItem[] = typeof input === 'string'
    ? [{ role: 'user', content: input }]
    : input;

  for (const item of items) {
    tokens += estimateItem(item);
  }
  for (const tool of tools ?? []) {
    tokens += estimateItem(tool);
  }
  return tokens;
}

export function estimateEntry(entry: HistoryEntry): number {
  if (entry.type === 'user') {
    return estimateItem(entry.message);
  }
  if (entry.type === 'tool_result') {
    return estimateItem(entry.result);
  }
  let tokens = 0;
  for (const item of entry.output) {
    tokens += estimateItem(item);
  }
  return tokens;
}

export function estimateItem(item: ResponseInputItem | FunctionTool): number {
  return estimateText(JSON.stringify(item)) + ITEM_OVERHEAD;
}

export function estimateText(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
}