import type { Input } from './commands.ts';
import type { QueueBlock } from '../agent/admission.ts';

export function nextCommandIndex(
  queue: readonly Input[],
  blocked: QueueBlock | null,
): number {
  if (blocked === null) {
    return -1;
  }
  for (let index = 1; index < queue.length; index += 1) {
    const item = queue[index];
    if (item?.type === 'command') {
      return index;
    }
  }
  return -1;
}
