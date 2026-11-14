export interface Draft {
  value: string;
  cursor: number;
}

export type DraftChangeReason = 'input' | 'submit';
