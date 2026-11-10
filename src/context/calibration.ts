import { isObject, isPositiveInteger } from '../utils/guards.ts';
import type { HistoryEntry, RequestInfo } from './types.ts';
import { estimateEntry } from './tokens.ts';

export function calibrateTokens({ history, contextStart, request }: {
  history: HistoryEntry[];
  contextStart: number;
  request: RequestInfo
}): number | undefined {
  if (
    !request.endpoint?.trim()
    || request.hasExtraInput !== false
    || request.contextStart !== contextStart
  ) {
    return;
  }

  for (let i = history.length - 1; i >= contextStart; i --) {
    const entry = history[i];
    if (
      entry?.type !== 'response'
      || !isCompatible(entry.request, request)
    ) {
      continue;
    }
    let tokens = getUsageTokens(entry.usage);
    if (tokens === undefined) {
      continue;
    }
    // 基准已包含该次响应的输出，只估算后续实际回放的内容
    for (let tail = i + 1; tail < history.length; tail ++) {
      const next = history[tail];
      if (next === undefined) {
        throw new Error('Missing history entry');
      }
      tokens += estimateEntry(next);
    }
    return tokens;
  }
}


function isCompatible(
  prev: RequestInfo | undefined,
  request: RequestInfo,
): boolean {
  const { model, endpoint, signature, contextStart } = request;
  return (
    prev?.hasExtraInput === false
    && prev.model === model
    && prev.endpoint === endpoint
    && prev.signature === signature
    && prev.contextStart === contextStart
  );
}

function getUsageTokens(usage: unknown): number | undefined {
  if (!isObject(usage)) {
    return;
  }
  const {
    total_tokens: total,
    input_tokens: input,
    output_tokens: output,
  } = usage;
  if (isPositiveInteger(total)) {
    return total;
  }
  if (
    total !== undefined
    && total !== null
    && total !== 0
  ) {
    return;
  }
  if (
    (input !== 0 && !isPositiveInteger(input))
    || (output !== 0 && !isPositiveInteger(output))
  ) {
    return;
  }
  const  tokens = input + output;
  return tokens > 0 ? tokens : undefined;
}