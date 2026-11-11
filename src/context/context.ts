import { calibrateTokens } from './calibration.ts';
import { planCompaction } from './compaction/plan.ts';
import { summaryMessages, toInput } from './history.ts';
import { estimateTokens } from './tokens.ts';
import type {
  OpenAIResponse,
  FunctionCall,
  ResponseCreateParams,
  ResponseInputItem,
} from '../model/provider/openai/types.ts';
import type { CompactionPlan, HistoryEntry, RequestInfo } from './types.ts';

export class Context {
  readonly #history: HistoryEntry[] = [];
  readonly #boundaries: number[] = [];

  #summary = '';
  #pendingStart: number | undefined;
  #contextStart = 0;

  get contextStart(): number {
    return this.#contextStart;
  }

  getHistory(): HistoryEntry[] {
    return structuredClone(this.#history);
  }

  addUserMessage(content: string): void {
    const start = this.#history.length;
    this.#history.push({
      type: 'user',
      message: { role: 'user', content },
    });
    this.#boundaries.push(start);
    if (this.#pendingStart === undefined) {
      this.#pendingStart = start;
    }
  }

  addResponse(response: OpenAIResponse, request?: RequestInfo): void {
    if (response.status !== 'completed') {
      throw new Error(
        response.error?.message ?? `Model response: ${response.status}`
      );
    }
    const entry: HistoryEntry = {
      type: 'response',
      responseId: response.id,
      output: response.output,
    };
    if (response.usage !== undefined) {
      entry.usage = response.usage;
    }
    if (request !== undefined) {
      entry.request = request;
    }
    const start = this.#history.length;
    this.#history.push(structuredClone(entry));
    if (entry.output.length > 0) {
      this.#boundaries.push(start);
    }
    this.#pendingStart = undefined;
  }

  addToolResult(call: FunctionCall, output: string): void {
    this.#history.push({
      type: 'tool_result',
      result: {
        type: 'function_call_output',
        call_id: call.call_id,
        output,
      },
    });
  }

  toInput(): ResponseInputItem[] {
    return this.#buildInput(this.#contextStart, this.#summary);
  }

  estimate({ params, request }: {
    params: ResponseCreateParams;
    request: RequestInfo,
  }): number {
    return calibrateTokens({
      history: this.#history,
      contextStart: this.#contextStart,
      request,
    }) ?? estimateTokens(params);
  }

  pendingInput(): ResponseInputItem[] {
    return this.#pendingStart === undefined
      ? []
      : this.#buildInput(this.#pendingStart, '');
  }

  requiredInput(): ResponseInputItem[] {
    const start = this.#requiredStart();
    return start === undefined ? [] : this.#buildInput(start, '');
  }

  preview(plan: CompactionPlan, summary: string): ResponseInputItem[] {
    return this.#buildInput(plan.keepFrom, summary.trim());
  }

  #buildInput(start: number, summary: string): ResponseInputItem[] {
    const input = toInput(this.#history.slice(start));
    if (summary) {
      input.unshift(...summaryMessages(summary));
    }
    return structuredClone(input);
  }

  plan({ keepRecentTokens, keepLimit }: {
    keepRecentTokens: number;
    keepLimit: number;
  }): CompactionPlan {
    const plan = planCompaction({
      history: this.#history,
      boundaries: this.#boundaries,
      requiredStart: this.#requiredStart(),
      keepRecentTokens,
      keepLimit,
    });
    return {
      historyLength: this.#history.length,
      contextStart: this.#contextStart,
      requiredStart: this.#requiredStart(),
      summary: this.#summary,
      prefix: structuredClone(toInput(plan.prefix)),
      keepFrom: plan.keepFrom,
    };
  }

  commit(plan: CompactionPlan, summary: string): void {
    if (
      plan.historyLength !== this.#history.length
      || plan.contextStart !== this.#contextStart
      || plan.requiredStart !== this.#requiredStart()
      || plan.summary !== this.#summary
    ) {
      throw new Error('Context changed since compaction was planned');
    }
    const boundary = this.#boundaries.indexOf(plan.keepFrom);
    if (
      boundary <= 0
      || plan.requiredStart === undefined
      || plan.keepFrom > plan.requiredStart
    ) {
      throw new Error('Invalid compaction boundary');
    }
    const text = summary.trim();
    if (!text) {
      throw new Error('Summary must not be empty');
    }

    this.#summary = text;
    this.#contextStart = plan.keepFrom;
    // 只移除被摘要覆盖的边界
    this.#boundaries.splice(0, boundary);
  }

  #requiredStart(): number | undefined {
    return this.#pendingStart ?? this.#boundaries.at(-1);
  }
}
