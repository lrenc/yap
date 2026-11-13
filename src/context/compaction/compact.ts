import type {
  OpenAIClient,
  ResponseCreateParams,
  ResponseInputItem,
} from '../../model/provider/openai/types.ts';
import { isUndefined } from '../../utils/guards.ts';
import type { Context } from '../context.ts';
import { summaryMessages } from '../history.ts';
import { estimateText, estimateTokens } from '../tokens.ts';
import type { CompactionBudget, CompactionResult } from '../types.ts';
import { getSummaryLimit } from './budget.ts';
import { summarize } from './summary.ts';

export async function compact({
  budget,
  context,
  modelId,
  client,
  contextWindow,
  signal,
  requestConfig,
  buildRequest,
}: {
  budget: CompactionBudget,
  context: Context,
  modelId: string;
  client: OpenAIClient,
  contextWindow: number;
  signal: AbortSignal,
  requestConfig?: Pick<
    ResponseCreateParams,
    'instructions' | 'include' | 'reasoning'
  >;
  buildRequest: (input: ResponseInputItem[]) => ResponseCreateParams;
}): Promise<CompactionResult> {
  try {
    const required = estimateTokens(buildRequest([
      ...summaryMessages(''),
      ...context.requiredInput(),
    ]));
    const summaryLimit = getSummaryLimit(
      budget.threshold - required,
      budget.maxSummaryTokens,
    );
    if (summaryLimit <= 0) {
      throw new Error('No budget for a summary');
    }
    const summarySample = '\\'.repeat(summaryLimit * 3);
    const reservedTokens = estimateTokens(
      buildRequest(summaryMessages(summarySample))
    );
    const plan = context.plan({
      keepRecentTokens: budget.keepRecentTokens,
      keepLimit: budget.threshold - reservedTokens,
    });
    const summary = await summarize({
      prefix: plan.prefix,
      client,
      modelId,
      contextWindow,
      maxSummaryTokens: summaryLimit,
      summary: plan.summary,
      margin: budget.margin,
      signal,
      ...(isUndefined(requestConfig)
        ? {}
        : { requestConfig }),
    });
    signal.throwIfAborted();
    if (
      estimateText(summary) > summaryLimit
      || estimateTokens(buildRequest(summaryMessages(summary))) > reservedTokens
    ) {
      throw new Error('Summary exceeds available budget');
    }
    const input = context.preview(plan, summary);
    const after = estimateTokens(buildRequest(input));
    const before = estimateTokens(buildRequest(context.toInput()));
    if (
      after > budget.threshold
      || after >= before
    ) {
      throw new Error(
        'Compacted input must shrink and fit the budget'
      );
    }
    signal.throwIfAborted();
    context.commit(plan, summary);
    return { status: 'completed' };
  } catch (error) {
    return failure(error, signal);
  }
}

function failure(error: unknown, signal: AbortSignal): CompactionResult {
  return {
    status: signal.aborted ? 'cancelled' : 'error',
    error,
  };
}
