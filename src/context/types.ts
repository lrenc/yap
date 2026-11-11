import type {
  FunctionCallOutput,
  ResponseInputItem,
  ResponseInputMessage,
  ResponseOutputItem,
  ResponseUsage
} from '../model/provider/openai/types.ts';

export interface RequestInfo {
  model: string;
  endpoint?: string;
  signature: string;
  contextStart: number;
  hasExtraInput: boolean;
}

export type HistoryEntry =
  {
    type: 'user';
    message: ResponseInputMessage & { role: 'user' };
  }
  | {
    type: 'response';
    responseId: string;
    output: ResponseOutputItem[];
    usage?: ResponseUsage | null;
    request?: RequestInfo;
  }
  | {
    type: 'tool_result';
    result: FunctionCallOutput
  };

export interface CompactionBudget {
  // 预留空间
  reserveTokens: number;
  // 近期消息保留原文的 token 目标
  keepRecentTokens: number;
  // 摘要输出上限
  maxSummaryTokens: number;
  margin: number;
  threshold: number;
}

export interface CompactionPlan {
  historyLength: number;
  contextStart: number;
  requiredStart: number | undefined;
  summary: string;
  prefix: ResponseInputItem[];
  keepFrom: number;
}

export type CompactionResult =
  { status: 'completed' }
  | { status: 'cancelled' | 'error'; error: unknown };
