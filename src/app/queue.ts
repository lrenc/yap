import { isCommand } from './commands.ts';

export interface QueueBlock {
  readonly type: string;
  readonly message: string;
}

export type AdmissionResult =
  | { type: 'ready' }
  | { type: 'blocked'; block: QueueBlock }
  | { type: 'rejected'; error: unknown };

export interface AdmissionContext {
  readonly input: string;
  readonly signal: AbortSignal;
}

export type RunAdmission = (
  context: AdmissionContext,
) => AdmissionResult | Promise<AdmissionResult>;

export function overtakingCommandIndex(
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
