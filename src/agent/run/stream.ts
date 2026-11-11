import type { AgentEvent } from './types.ts';

export class RunStream implements AsyncIterableIterator<AgentEvent> {
  readonly #cancel: () => void;
  readonly #waiters: ((event: IteratorResult<AgentEvent>) => void)[] = [];

  #events: AgentEvent[] = [];
  #closed = false;

  constructor(cancel: () => void) {
    this.#cancel = cancel;
  }

  emit(event: AgentEvent): void {
    if (this.#closed) {
      return;
    }
    const resolve = this.#waiters.shift();
    if (resolve) {
      resolve({
        value: event, done: false,
      });
      return;
    }
    const last = this.#events.at(-1);
    if (
      event.type === 'text_delta'
      && last?.type === 'text_delta'
      && last.turn === event.turn
    ) {
      last.delta += event.delta;
      return;
    }
    this.#events.push(event);
  }

  close(): void {
    this.#closed = true;
    for (const resolve of this.#waiters.splice(0)) {
      resolve({
        value: undefined, done: true,
      });
    }
  }

  next(): Promise<IteratorResult<AgentEvent>> {
    const event = this.#events.shift();
    if (event) {
      return Promise.resolve({
        value: event, done: false,
      });
    }
    if (this.#closed) {
      return Promise.resolve({
        value: undefined, done: true,
      });
    }
    return new Promise(resolve => {
      this.#waiters.push(resolve);
    });
  }

  return(): Promise<IteratorResult<AgentEvent>> {
    this.#cancel();
    this.#events = [];
    this.close();
    return Promise.resolve({
      value: undefined, done: true,
    });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<AgentEvent> {
    return this;
  }
}
