import { getModelBudget } from '../../context/compaction/budget.ts';
import { Context } from '../../context/context.ts';
import { summaryMessages } from '../../context/history.ts';
import { estimateTokens } from '../../context/tokens.ts';
import { getModel } from '../../model/lookup.ts';
import type { AgentModel } from '../../model/types.ts';
import type { ResponseInputItem } from '../../model/provider/openai/types.ts';
import { buildRequest } from '../run/request.ts';
import { Run } from '../run/run.ts';
import type { AgentEvent, AgentResult, RunOptions } from '../run/types.ts';
import type { AgentConfig } from '../types.ts';
import type { SessionOptions, WaitingState } from './types.ts';

interface QueuedRun {
  run: Run;
  admitted: boolean;
  waitingFor: string | null;
  onAbort: () => void;
}

export class Session {
  readonly #queue: QueuedRun[] = [];
  readonly #agent: AgentConfig;
  readonly #context = new Context();
  readonly #getModelSelection: SessionOptions['getModelSelection'];
  readonly #isReady: SessionOptions['isReady'];

  #cancelling = false;
  #active: Run | null = null;
  #draining = false;

  constructor(agent: AgentConfig, options: SessionOptions) {
    this.#agent = agent;
    this.#isReady = options.isReady;
    this.#getModelSelection = options.getModelSelection;
  }

  run(content: string, options: RunOptions = {}): Promise<AgentResult> {
    return this.#submit(content, false, options).result;
  }

  runStream(
    content: string, options: RunOptions = {}
  ): AsyncIterableIterator<AgentEvent> {
    return this.#submit(content, true, options).stream;
  }

  cancel(): void {
    this.#cancelling = true;
    try {
      this.#active?.cancel();
      // Abort listeners may remove waiting entries synchronously.
      for (const { run } of [...this.#queue]) {
        run.cancel();
      }
    } finally {
      this.#cancelling = false;
    }
    this.#schedule();
  }

  get waiting(): WaitingState | null {
    const index = this.#queue.findIndex(item => !item.admitted);
    const waitingFor = this.#queue[index]?.waitingFor;
    return waitingFor === undefined || waitingFor === null
      ? null
      : {
        modelId: waitingFor,
        count: this.#queue.length - index,
      };
  }

  resume(): void {
    this.#schedule();
  }

  #submit(content: string, streaming: boolean, options: RunOptions): Run {
    if (!content.trim()) {
      throw new Error('Message must not be empty');
    }
    const run = new Run(this.#agent, this.#context, {
      ...options,
      content,
      getModelSelection: this.#getModelSelection,
      streaming,
    });
    if (run.signal.aborted) {
      run.finish({
        stopReason: 'cancelled',
        response: null,
        turns: 0,
      });
      return run;
    }
    const { modelId, reasoningEffort } = this.#getModelSelection();
    const model = getModel(this.#agent.models, modelId);
    const input = this.#inputWithReserve();
    for (const { run } of this.#queue) {
      input.push({
        role: 'user',
        content: run.content,
      });
    }
    input.push({ role: 'user', content });
    this.#checkInput(input, model, reasoningEffort);
    const item: QueuedRun = {
      run,
      admitted: false,
      waitingFor: null,
      onAbort: () => this.#cancelQueued(item),
    };
    this.#queue.push(item);
    run.signal.addEventListener('abort', item.onAbort, { once: true });
    this.#schedule();
    return run;
  }

  #inputWithReserve(): ResponseInputItem[] {
    const input = this.#context.pendingInput();
    // The summary messages reserve the fixed token cost used by compaction.
    input.unshift(...summaryMessages(''));
    return input;
  }

  #checkInput(
    input: ResponseInputItem[], model: AgentModel,
    reasoningEffort: string | undefined,
  ): void {
    const budget = getModelBudget({
      contextWindow: model.contextWindow,
      maxOutputTokens: model.params.max_output_tokens,
    });
    const request = buildRequest(
      this.#agent, model, input, reasoningEffort,
    );
    if (estimateTokens(request) + budget.maxSummaryTokens > budget.threshold) {
      throw new Error('Pending input exceeds the context budget');
    }
  }

  #cancelQueued(item: QueuedRun): void {
    const index = this.#queue.indexOf(item);
    if (index < 0) {
      return;
    }
    this.#queue.splice(index, 1);
    item.run.signal.removeEventListener('abort', item.onAbort);
    item.run.finish({ stopReason: 'cancelled', response: null, turns: 0 });
    if (!this.#cancelling) {
      this.#schedule();
    }
  }

  #refreshQueue(): number {
    if (this.#queue.every(item => item.admitted)) {
      return this.#queue.length;
    }
    try {
      const { modelId, reasoningEffort } = this.#getModelSelection();
      const model = getModel(this.#agent.models, modelId);
      const ready = this.#isReady?.(modelId) !== false;
      const input = ready ? this.#inputWithReserve() : [];
      let count = 0;
      for (let index = 0; index < this.#queue.length;) {
        const item = this.#queue[index];
        if (!item) {
          break;
        }
        if (ready) {
          input.push({
            role: 'user',
            content: item.run.content,
          });
          if (!item.admitted) {
            try {
              this.#checkInput(input, model, reasoningEffort);
            } catch (error) {
              input.pop();
              this.#rejectQueued(index, error);
              continue;
            }
            item.admitted = true;
          }
        }
        if (item.admitted) {
          count += 1;
        }
        const waitingFor = item.admitted ? null : modelId;
        if (item.waitingFor !== waitingFor) {
          item.waitingFor = waitingFor;
          item.run.notifyQueue(waitingFor);
        }
        index += 1;
      }
      return count;
    } catch (error) {
      for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
        if (!this.#queue[index]?.admitted) {
          this.#rejectQueued(index, error);
        }
      }
      return this.#queue.length;
    }
  }

  #rejectQueued(index: number, error: unknown): void {
    const [item] = this.#queue.splice(index, 1);
    if (!item) {
      return;
    }
    item.run.signal.removeEventListener('abort', item.onAbort);
    item.run.finish({
      stopReason: 'error',
      response: null,
      turns: 0,
      error,
    });
  }

  #schedule(): void {
    const count = this.#refreshQueue();
    if (count === 0) {
      return;
    }
    if (this.#queue.some((item, index) => index < count && !item.run.signal.aborted)) {
      this.#active?.interrupt();
    }
    if (!this.#draining) {
      this.#draining = true;
      void Promise.resolve().then(() => this.#drain());
    }
  }

  async #drain(): Promise<void> {
    let batch: QueuedRun[] = [];
    try {
      let count = this.#refreshQueue();
      while (count > 0) {
        batch = this.#queue.splice(0, count);
        const run = batch.at(-1)?.run;
        if (!run) {
          break;
        }
        for (const item of batch) {
          const input = item.run;
          input.signal.removeEventListener('abort', item.onAbort);
          this.#context.addUserMessage(input.content);
          if (input !== run) {
            input.finish({
              stopReason: input.signal.aborted ? 'cancelled' : 'interrupted',
              response: null,
              turns: 0,
            });
          }
        }
        this.#active = run;
        await run.execute();
        batch = [];
        count = this.#refreshQueue();
      }
    } catch (error) {
      for (const item of batch) {
        item.run.finish({
          stopReason: item.run.signal.aborted ? 'cancelled' : 'error',
          response: null,
          turns: 0,
          error,
        });
      }
      for (let index = this.#queue.length - 1; index >= 0; index -= 1) {
        this.#rejectQueued(index, error);
      }
    } finally {
      this.#active = null;
      this.#draining = false;
      if (this.#queue.length > 0) {
        this.#schedule();
      }
    }
  }
}
