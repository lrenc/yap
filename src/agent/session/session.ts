import { Context } from '../../context/context.ts';
import { checkPendingInput, selectRunConfig } from '../run/request.ts';
import { Run } from '../run/run.ts';
import type { AgentEvent, AgentResult, RunOptions } from '../run/types.ts';
import type { AgentConfig, RunConfigResolver } from '../types.ts';
import type { AgentTool } from '../../tools/types.ts';
import type {
  WaitingState,
  ResolverOptions,
  SessionOptions,
} from './types.ts';

interface QueuedRun {
  run: Run;
  messages: string[];
  admitted: boolean;
  waitingFor: string | null;
  onAbort: () => void;
}

export class Session {
  readonly #queue: QueuedRun[] = [];
  readonly #tools: AgentTool[];
  readonly #context = new Context();
  readonly #resolveRunConfig: RunConfigResolver;
  readonly #legacy: {
    agent: AgentConfig;
    options: SessionOptions;
  } | undefined;

  #cancelling = false;
  #active: Run | null = null;
  #pendingMessages: string[] = [];
  #draining = false;

  constructor(agent: AgentConfig, options: SessionOptions);
  constructor(
    agent: Pick<AgentConfig, 'tools'>,
    options: ResolverOptions,
  );
  constructor(
    agent: AgentConfig | Pick<AgentConfig, 'tools'>,
    options: SessionOptions | ResolverOptions,
  ) {
    this.#tools = agent.tools;
    if ('resolveRunConfig' in options) {
      this.#resolveRunConfig = options.resolveRunConfig;
    } else if (
      'models' in agent
      && 'instructions' in agent
    ) {
      this.#legacy = { agent, options };
      this.#resolveRunConfig = () => (
        selectRunConfig(agent, options.getModelSelection())
      );
    } else {
      throw new Error(
        'Model selection requires an agent configuration'
      );
    }
  }

  run(
    content: string | readonly string[],
    options: RunOptions = {},
  ): Promise<AgentResult> {
    const messages = typeof content === 'string' ? [content] : content;
    return this.#submit(messages, false, options).result;
  }

  runStream(
    content: string | readonly string[],
    options: RunOptions = {},
  ): AsyncIterableIterator<AgentEvent> {
    const messages = typeof content === 'string' ? [content] : content;
    return this.#submit(messages, true, options).stream;
  }

  cancel(): void {
    this.#cancelling = true;
    this.#pendingMessages = [];
    try {
      this.#active?.cancel();
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

  #submit(
    input: readonly string[],
    streaming: boolean,
    options: RunOptions,
  ): Run {
    const messages = [...input];
    if (
      messages.length === 0 ||
      messages.some(content => !content.trim())
    ) {
      throw new Error('Message must not be empty');
    }
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
      return run;
    }
    if (this.#legacy) {
      const { agent, options } = this.#legacy;
      const config = selectRunConfig(agent, options.getModelSelection());
      const input = this.#pendingInput();
      for (const item of this.#queue) {
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
      waitingFor: null,
      onAbort: () => this.#cancelQueued(item),
    };
    this.#queue.push(item);
    run.signal.addEventListener('abort', item.onAbort, { once: true });
    this.#schedule();
    return run;
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
    const index = this.#queue.indexOf(item);
    if (index < 0) {
      return;
    }
    this.#queue.splice(index, 1);
    item.run.signal.removeEventListener('abort', item.onAbort);
    item.run.finish({
      stopReason: 'cancelled', response: null, turns: 0,
    });
    if (!this.#cancelling) {
      this.#schedule();
    }
  }

  #refreshQueue(): number {
    if (!this.#legacy) {
      for (const item of this.#queue) {
        item.admitted = true;
      }
      return this.#queue.length;
    }
    if (this.#queue.every(item => item.admitted)) {
      return this.#queue.length;
    }
    try {
      const { agent, options } = this.#legacy;
      const config = selectRunConfig(agent, options.getModelSelection());
      const modelId = config.model.id;
      const ready = options.isReady?.(modelId) !== false;
      const input = ready ? this.#pendingInput() : [];
      let count = 0;
      for (let index = 0; index < this.#queue.length;) {
        const item = this.#queue[index];
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
    if (this.#queue.some((item, index) => (
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
        batch = this.#queue.splice(0, count);
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
