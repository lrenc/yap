import type {
  OpenAIClient,
  ResponseCreateParams,
  ResponseInputItem,
} from '../../model/provider/openai/types.ts';
import type { Context } from '../context.ts';
import { summaryMessages } from '../history.ts';
import { estimateText, estimateTokens } from '../tokens.ts';
import type { CompactionBudget, CompactionResult } from '../types.ts';
import { summarize } from './summary.ts';

export async function compact({
  context,
  budget,
  client,
  modelId,
  contextWindow,
  signal,
  buildRequest,
}: {
  context: Context,
  budget: CompactionBudget,
  client: OpenAIClient,
  modelId: string;
  contextWindow: number;
  signal: AbortSignal,
  buildRequest: (input: ResponseInputItem[]) => ResponseCreateParams;
}): Promise<CompactionResult> {
  try {
    const fixedTokens = estimateTokens(buildRequest(summaryMessages('')));
    const plan = context.plan({
      keepRecentTokens: budget.keepRecentTokens,
      keepLimit: budget.threshold - fixedTokens - budget.maxSummaryTokens,
    });
    const summary = await summarize({
      prefix: plan.prefix,
      client,
      modelId,
      contextWindow,
      maxSummaryTokens: budget.maxSummaryTokens,
      summary: plan.summary,
      margin: budget.margin,
      signal,
    });
    signal.throwIfAborted();
    if (estimateText(summary) > budget.maxSummaryTokens) {
      throw new Error('Summary exceeds maxSummaryTokens');
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
