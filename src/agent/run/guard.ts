import { createHash } from 'node:crypto';
import { isObject } from '../../utils/guards.ts';
import type { FunctionCall } from '../../model/provider/openai/types.ts';

export class LoopGuard {
  readonly #recent = new Set<string>();
  #progress = false;
  #state = 0;

  record(call: FunctionCall, output: string): void {
    let args = call.arguments;
    try {
      const value: unknown = JSON.parse(args);
      args = JSON.stringify(sortKeys(value));
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }
      // 参数嵌套过深时按原内容比较
    }
    const key = createHash('sha256')
      .update(JSON.stringify([call.name, args, output]))
      .digest('hex');

    if (!this.#recent.has(key)) {
      this.#progress = true;
    }
    // 重复结果也刷新顺序，让纪录始终覆盖最近使用的结果
    this.#recent.delete(key);
    this.#recent.add(key);
    if (this.#recent.size > 32) {
      const oldest = this.#recent.values().next().value;
      if (oldest !== undefined) {
        this.#recent.delete(oldest);
      }
    }
  }

  endTurn(): boolean {
    this.#state = this.#progress ? 0 : this.#state + 1
    this.#progress = false;
    return this.#state >= 3;
  }

}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value)
      .sort()
      .map(key => [key, sortKeys(value[key])])
    );
  }
  return value;
}