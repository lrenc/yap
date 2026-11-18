import { Context } from '../../context/context.ts';
import { checkPendingInput } from '../run/request.ts';
import { Run } from '../run/run.ts';
import type { AgentEvent, AgentResult, RunOptions } from '../run/types.ts';
import type { RunConfigResolver, RunConfigSnapshot } from '../types.ts';
import type { AgentTool } from '../../tools/types.ts';
import type {
  SessionRun,
  SessionOptions,
  WaitingState,
} from './types.ts';

interface QueuedRun {
  run: Run;
  messages: string[];
  admitted: boolean;
  waitingFor: string | undefined;
  onAbort: () => void;
}

interface SubmittedRun {
  runId: number;
  run: Run;
}

export class Session {
  readonly id: number;
  readonly #runQueue: QueuedRun[] = [];
  readonly #tools: AgentTool[];
  readonly #context = new Context();
  readonly #resolveRunConfig: RunConfigResolver;
  readonly #resolveQueueConfig: (() => RunConfigSnapshot) | null;
  readonly #isReady: ((modelId: string) => boolean) | null;
  readonly #allocateRunId: (() => number) | null;

  #cancelling = false;
  #nextRunId = 0;
  #active: Run | null = null;
  #pendingMessages: string[] = [];
  #draining = false;

  constructor(
    agent: Pick<{ tools: AgentTool[] }, 'tools'>,
    options: SessionOptions,
  ) {
    if (options.isReady && !options.resolveQueueConfig) {
      throw new Error('isReady requires resolveQueueConfig');
    }
    this.id = options.id ?? 0;
    this.#tools = agent.tools;
    this.#resolveRunConfig = options.resolveRunConfig;
    this.#resolveQueueConfig = options.resolveQueueConfig ?? null;
    this.#isReady = options.isReady ?? null;
    this.#allocateRunId = options.allocateRunId ?? null;
  }

  run(
    content: string | readonly string[],
    options: RunOptions = {},
  ): Promise<AgentResult> {
    const messages = typeof content === 'string' ? [content] : content;
    return this.#submit(messages, false, options).run.result;
  }

  runStream(
    content: string | readonly string[],
    options: RunOptions = {},
  ): AsyncIterableIterator<AgentEvent> {
    const messages = typeof content === 'string' ? [content] : content;
    return this.#submit(messages, true, options).run.stream;
  }

  submitStream(
    content: string | readonly string[],
    options: RunOptions = {},
  ): SessionRun {
    const messages = typeof content === 'string' ? [content] : content;
    const submitted = this.#submit(messages, true, options);
    return {
      runId: submitted.runId,
      stream: submitted.run.stream,
    };
  }

  cancel(): void {
    this.#cancelling = true;
    this.#pendingMessages = [];
    try {
      this.#active?.cancel();
      for (const { run } of [...this.#runQueue]) {
        run.cancel();
      }
    } finally {
      this.#cancelling = false;
    }
    this.#schedule();
  }

  get waiting(): WaitingState | null {
    const index = this.#runQueue.findIndex(item => !item.admitted);
    const waitingFor = this.#runQueue[index]?.waitingFor;
    return waitingFor === undefined
      ? null
      : {
        modelId: waitingFor,
        count: this.#runQueue.length - index,
      };
  }

  resume(): void {
    this.#schedule();
  }

  #submit(
    input: readonly string[],
    streaming: boolean,
    options: RunOptions,
  ): SubmittedRun {
    const messages = [...input];
    if (
      messages.length === 0 ||
      messages.some(content => !content.trim())
    ) {
      throw new Error('Message must not be empty');
    }
    const runId = this.#allocateRunId?.() ?? ++this.#nextRunId;
    const run = new Run({ tools: this.#tools }, this.#context, {
      ...options,
      content: messages.at(-1)!,
      resolveRunConfig: this.#resolveRunConfig,
      streaming,
    });
    if (run.signal.aborted) {
      run.finish({
        stopReason: 'cancelled',
        response: null,
        turns: 0,
      });
      return { runId, run };
    }
    if (this.#resolveQueueConfig) {
      const config = this.#resolveQueueConfig();
      const input = this.#pendingInput();
      for (const item of this.#runQueue) {
        input.push(...item.messages.map(content => ({
          role: 'user' as const,
          content,
        })));
      }
      input.push(...messages.map(content => ({
        role: 'user' as const,
        content,
      })));
      checkPendingInput({ tools: this.#tools }, config, input);
    }
    const item: QueuedRun = {
      run,
      messages,
      admitted: false,
      waitingFor: undefined,
      onAbort: () => this.#cancelQueued(item),
    };
    this.#runQueue.push(item);
    run.signal.addEventListener('abort', item.onAbort, { once: true });
    this.#schedule();
    return { runId, run };
  }

  #pendingInput() {
    const input = this.#context.pendingInput();
    if (this.#active?.hasPendingInput ?? true) {
      input.push(...this.#pendingMessages.map(content => ({
        role: 'user' as const,
        content,
      })));
    }
    return input;
  }

  #cancelQueued(item: QueuedRun): void {
    const index = this.#runQueue.indexOf(item);
    if (index < 0) {
      return;
    }
    this.#runQueue.splice(index, 1);
    item.run.signal.removeEventListener('abort', item.onAbort);
    item.run.finish({
      stopReason: 'cancelled', response: null, turns: 0,
    });
    if (!this.#cancelling) {
      this.#schedule();
    }
  }

  #refreshQueue(): number {
    if (!this.#resolveQueueConfig) {
      for (const item of this.#runQueue) {
        item.admitted = true;
      }
      return this.#runQueue.length;
    }
    if (this.#runQueue.every(item => item.admitted)) {
      return this.#runQueue.length;
    }
    try {
      const config = this.#resolveQueueConfig();
      const modelId = config.model.id;
      const ready = this.#isReady?.(modelId) !== false;
      const input = ready ? this.#pendingInput() : [];
      let count = 0;
      for (let index = 0; index < this.#runQueue.length;) {
        const item = this.#runQueue[index];
        if (!item) {
          break;
        }
        if (ready) {
          const previousLength = input.length;
          input.push(...item.messages.map(content => ({
            role: 'user' as const,
            content,
          })));
          if (!item.admitted) {
            try {
              checkPendingInput({ tools: this.#tools }, config, input);
            } catch (error) {
              input.length = previousLength;
              this.#rejectQueued(index, error);
              continue;
            }
            item.admitted = true;
          }
        }
        if (item.admitted) {
          count += 1;
        }
        const waitingFor = item.admitted ? undefined : modelId;
        if (item.waitingFor !== waitingFor) {
          item.waitingFor = waitingFor;
          item.run.notifyQueue(waitingFor);
        }
        index += 1;
      }
      return count;
    } catch (error) {
      for (let index = this.#runQueue.length - 1; index >= 0; index -= 1) {
        if (!this.#runQueue[index]?.admitted) {
          this.#rejectQueued(index, error);
        }
      }
      return this.#runQueue.length;
    }
  }

  #rejectQueued(index: number, error: unknown): void {
    const [item] = this.#runQueue.splice(index, 1);
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
    if (this.#runQueue.some((item, index) => (
      index < count && !item.run.signal.aborted
    ))) {
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
        batch = this.#runQueue.splice(0, count);
        const run = batch.at(-1)?.run;
        if (!run) {
          break;
        }
        for (const item of batch) {
          const input = item.run;
          input.signal.removeEventListener('abort', item.onAbort);
          if (input !== run) {
            input.finish({
              stopReason: input.signal.aborted ? 'cancelled' : 'interrupted',
              response: null,
              turns: 0,
            });
          }
        }
        this.#active = run;
        this.#pendingMessages.push(...batch.flatMap(item => item.messages));
        await run.execute(this.#pendingMessages);
        if (!run.hasPendingInput) {
          this.#pendingMessages = [];
        }
        this.#active = null;
        batch = [];
        count = this.#refreshQueue();
      }
    } catch (error) {
      this.#pendingMessages = [];
      for (const item of batch) {
        item.run.finish({
          stopReason: item.run.signal.aborted ? 'cancelled' : 'error',
          response: null,
          turns: 0,
          error,
        });
      }
      for (let index = this.#runQueue.length - 1; index >= 0; index -= 1) {
        this.#rejectQueued(index, error);
      }
    } finally {
      this.#active = null;
      this.#draining = false;
      if (this.#runQueue.length > 0) {
        this.#schedule();
      }
    }
  }
}
