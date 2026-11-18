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
