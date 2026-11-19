import { isCommand } from './commands.ts';
import type { QueueBlock } from '../agent/admission.ts';

export function nextCommandIndex(
  queue: readonly string[],
  blocked: QueueBlock | null,
): number {
  if (blocked === null) {
    return -1;
  }
  for (let index = 1; index < queue.length; index += 1) {
    const input = queue[index];
    if (input !== undefined && isCommand(input)) {
      return index;
    }
  }
  return -1;
}
