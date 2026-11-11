import { LoopGuard } from './guard.ts';
import { getModelBudget } from '../../context/compaction/budget.ts';
import { compact } from '../../context/compaction/compact.ts';
import type { Context } from '../../context/context.ts';
import type { CompactionBudget, RequestInfo } from '../../context/types.ts';
import { buildRequest, captureRequest } from './request.ts';
import { functionCalls, responseText } from './response.ts';
import { RunStream } from './stream.ts';
import { executeTool } from './tool-call.ts';
import type {
  OpenAIResponse,
  FunctionCall,
  OpenAIClient,
  ResponseCreateParams,
  ResponseInputItem,
} from '../../model/provider/openai/types.ts';
import { getModel } from '../../model/lookup.ts';
import type { AgentModel, ModelSelection } from '../../model/types.ts';
import type { AgentConfig } from '../types.ts';
import type {
  AgentEvent,
  AgentResult,
  RunOptions,
  ToolOutcome,
} from './types.ts';

const STALLED_INSTRUCTIONS = `
Repeated tool calls have produced no new successful information.
Do not call any more tools. Using only the available context, provide a concise, user-facing response that covers:
- confirmed findings and completed work
- unfinished or unverified work
- concrete blockers or the next useful step, if known

If the task could not be completed, say so directly.
Do not invent missing results or present unfinished work as completed.
`.trim();

export class Run {
  readonly content: string;
  readonly signal: AbortSignal;
  readonly result: Promise<AgentResult>;
  readonly stream: RunStream;

  readonly #agent: AgentConfig;
  readonly #context: Context;
  readonly #getModelSelection: () => ModelSelection;
  readonly #streaming: boolean;
  readonly #controller = new AbortController();
  readonly #guard = new LoopGuard();

  #execution: Promise<AgentResult> | null = null;
  #requestController: AbortController | null = null;
  #interrupted = false;
  #turns = 0;
  #stalled = false;
  #finished = false;
  #resolve!: (result: AgentResult) => void;

  constructor(agent: AgentConfig, context: Context, options: RunOptions & {
    content: string;
    getModelSelection: () => ModelSelection;
    streaming: boolean;
  }) {
    this.#agent = agent;
    this.#context = context;
    this.#getModelSelection = options.getModelSelection;
    this.#streaming = options.streaming;
    this.content = options.content;
    this.signal = options.signal
      ? AbortSignal.any([
        this.#controller.signal,
        options.signal,
      ])
      : this.#controller.signal;
    this.stream = new RunStream(() => this.cancel());
    this.result = new Promise(resolve => {
      this.#resolve = resolve;
    });
  }

  notifyQueue(waitingFor: string | null): void {
    this.#emit({ type: 'queue', waitingFor });
  }

  execute(): Promise<AgentResult> {
    if (this.#execution) {
      return this.#execution;
    }
    if (this.#finished) {
      return this.result;
    }
    this.#execution = this.#run();
    return this.#execution;
  }

  async #run(): Promise<AgentResult> {
    const result = await this.#executeLoop();
    this.finish(result);
    return result;
  }

  async #executeLoop(): Promise<AgentResult> {
    let stopReason: AgentResult['stopReason'] = 'completed';
    let response: OpenAIResponse | null = null;
    let error: unknown;
    try {
      while (true) {
        if (this.signal.aborted) {
          stopReason = 'cancelled';
          break;
        }
        if (this.#interrupted) {
          stopReason = 'interrupted';
          break;
        }
        const { modelId, reasoningEffort } = this.#getModelSelection();
        const model = getModel(this.#agent.models, modelId);
        const client = model.client;
        const budget = getModelBudget({
          contextWindow: model.contextWindow,
          maxOutputTokens: model.params.max_output_tokens,
        });
        const captured = captureRequest(
          this.#buildRequest(model, reasoningEffort), {
            endpoint: client.endpoint,
            contextStart: this.#context.contextStart,
            hasExtraInput: this.#stalled,
          }
        );
        if (this.#context.estimate(captured) > budget.threshold) {
          await this.#compact(model, budget, captured.params);
          continue;
        }
        this.#turns += 1;
        const effort = captured.params.reasoning?.effort;
        this.#emit({
          type: 'turn_start',
          turn: this.#turns,
          modelId: captured.params.model,
          ...(effort === undefined ? {} : {
            reasoningEffort: effort,
          }),
        });
        const next = await this.#requestModel(client, captured.params);
        // 请求返回后仍有一次异步调度，接纳前需再次确认运行状态。
        if (!next || this.signal.aborted || this.#interrupted) {
          continue;
        }
        response = next;
        const calls = this.#acceptResponse(response, captured.request);
        if (calls.length === 0) {
          if (this.#stalled) {
            stopReason = 'stalled';
          }
          break;
        }
        await this.#runTools(calls);
        if (this.signal.aborted || this.#interrupted) {
          continue;
        }
        // 收尾只允许一次请求，即使模型仍返回工具调用也必须结束
        if (this.#stalled) {
          stopReason = 'stalled';
          break;
        }
        this.#stalled = this.#guard.endTurn();
      }
    } catch (cause) {
      error = cause;
      if (this.signal.aborted) {
        stopReason = 'cancelled';
      } else if (this.#interrupted) {
        stopReason = 'interrupted';
      } else {
        stopReason = 'error';
      }
    }
    return {
      stopReason,
      response,
      turns: this.#turns,
      error,
    };
  }

  async #compact(
    model: AgentModel,
    budget: CompactionBudget,
    params: ResponseCreateParams,
  ): Promise<void> {
    this.#emit({ type: 'compaction_start' });
    const result = await this.#withRequest(signal => compact({
      context: this.#context,
      budget,
      client: model.client,
      modelId: model.id,
      contextWindow: model.contextWindow,
      signal,
      buildRequest: input => ({
        ...params, input: this.#prepareInput(input),
      }),
    }));
    this.#emit({
      type: 'compaction_end',
      status: result.status,
    });
    if (result.status !== 'completed') {
      throw result.error;
    }
  }

  async #requestModel(
    client: OpenAIClient,
    params: ResponseCreateParams,
  ): Promise<OpenAIResponse | undefined> {
    return this.#withRequest(async signal => {
      try {
        signal.throwIfAborted();
        const response = this.#streaming
          ? await this.#readStream(client, params, signal)
          : await client.create(params, { signal });
        signal.throwIfAborted();
        if (!response) {
          throw new Error('Missing final model response');
        }
        return response;
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    });
  }

  async #readStream(
    client: OpenAIClient,
    params: ResponseCreateParams,
    signal: AbortSignal,
  ): Promise<OpenAIResponse | undefined> {
    const stream = await client.stream(params, { signal });
    let response: OpenAIResponse | undefined;
    for await (const event of stream) {
      if (signal.aborted) {
        break;
      }
      if (event.type === 'response.output_text.delta') {
        this.#emit({
          type: 'text_delta',
          turn: this.#turns,
          delta: event.delta,
        });
      } else if (event.type === 'response.refusal.delta') {
        this.#emit({
          type: 'refusal_delta',
          turn: this.#turns,
          delta: event.delta,
        });
      }
      if ('response' in event) {
        response = event.response;
      }
    }
    return response;
  }

  #buildRequest(
    model: AgentModel, reasoningEffort: string | undefined,
  ): ResponseCreateParams {
    const params = buildRequest(
      this.#agent,
      model,
      this.#prepareInput(this.#context.toInput()),
      reasoningEffort,
    );
    if (this.#stalled) {
      params.tool_choice = 'none';
    }
    return params;
  }

  #prepareInput(input: ResponseInputItem[]): ResponseInputItem[] {
    if (this.#stalled) {
      input.push({
        role: 'developer',
        content: STALLED_INSTRUCTIONS,
      });
    }
    return input;
  }

  #acceptResponse(
    response: OpenAIResponse, request: RequestInfo
  ): FunctionCall[] {
    this.#context.addResponse(response, request);
    this.#emitTextDone(response.output);
    return functionCalls(response.output);
  }

  #emitTextDone(output: OpenAIResponse['output']): void {
    if (!this.#streaming) {
      return;
    }
    this.#emit({
      type: 'text_done',
      turn: this.#turns,
      text: responseText(output),
    });
  }

  async #runTools(calls: FunctionCall[]): Promise<void> {
    for (const call of calls) {
      let result: ToolOutcome;
      if (this.#stalled) {
        result = {
          status: 'skipped',
          output: JSON.stringify({
            error: 'Not executed: run stalled.',
          }),
        };
      } else if (this.signal.aborted || this.#interrupted) {
        result = {
          status: 'skipped',
          output: JSON.stringify({
            error: 'Not executed: run cancelled or interrupted.',
          }),
        };
      } else {
        this.#emit({
          type: 'tool_start',
          call: structuredClone(call),
        });
        result = await executeTool({
          tools: this.#agent.tools,
          call,
          signal: this.signal,
        });
      }
      this.#context.addToolResult(call, result.output);
      this.#emit({
        type: 'tool_end',
        call: structuredClone(call),
        ...result,
      });
      if (result.status === 'completed') {
        this.#guard.record(call, result.output);
      }
    }
  }

  interrupt(): void {
    this.#interrupted = true;
    // 新输入只中止模型请求，已经开始的工具仍使用整个 Run 的取消信号。
    this.#requestController?.abort();
  }

  cancel(): void {
    this.#controller.abort();
  }

  finish(result: AgentResult): void {
    if (this.#finished) {
      return;
    }
    this.#finished = true;
    this.#emit({ type: 'done', result });
    this.stream.close();
    this.#resolve(result);
  }

  #emit(event: AgentEvent): void {
    if (this.#streaming) {
      this.stream.emit(event);
    }
  }

  async #withRequest<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    this.#requestController = controller;
    const signal = AbortSignal.any([
      this.signal,
      controller.signal,
    ]);
    try {
      return await operation(signal);
    } finally {
      if (this.#requestController === controller) {
        this.#requestController = null;
      }
    }
  }
}
