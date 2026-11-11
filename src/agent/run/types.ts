import type { ModelSelection } from '../../model/types.ts';
import type {
  FunctionCall,
  OpenAIResponse,
} from '../../model/provider/openai/types.ts';

export interface RunOptions {
  signal?: AbortSignal;
}

export interface ToolOutcome {
  status: 'completed' | 'error' | 'skipped';
  output: string;
  details?: unknown;
}

export type AgentEvent =
  {
    type: 'queue';
    waitingFor: string | null;
  }
  | {
    type: 'compaction_start';
  }
  | {
    type: 'compaction_end';
    status: 'completed' | 'error' | 'cancelled';
  }
  | ({
    type: 'turn_start';
    turn: number;
  } & ModelSelection)
  | {
    type: 'text_delta';
    turn: number;
    delta: string;
  }
  | {
    type: 'refusal_delta';
    turn: number;
    delta: string;
  }
  | {
    type: 'text_done';
    turn: number;
    text: string;
  }
  | {
    type: 'tool_start';
    call: FunctionCall;
  }
  | ({
    type: 'tool_end';
    call: FunctionCall;
  } & ToolOutcome)
  | {
    type: 'done';
    result: AgentResult;
  };

export interface AgentResult {
  stopReason: 'completed' | 'interrupted' | 'stalled' | 'cancelled' | 'error';
  response: OpenAIResponse | null;
  turns: number;
  error?: unknown;
}
