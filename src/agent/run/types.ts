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

export type AgentTextPart =
  | { type: 'outputText'; text: string }
  | { type: 'refusal'; refusal: string }

export type AgentEvent =
  | {
    type: 'queue';
    waitingFor: string | undefined;
  }
  | {
    type: 'compactionStart';
  }
  | {
    type: 'compactionEnd';
    status: 'completed' | 'error' | 'cancelled';
  }
  | ({
    type: 'turnStart';
    turn: number;
  } & ModelSelection)
  | {
    type: 'textDelta';
    turn: number;
    delta: string;
  }
  | {
    type: 'refusalDelta';
    turn: number;
    delta: string;
  }
  | {
    type: 'textDone';
    turn: number;
    text: string;
    parts?: AgentTextPart[];
  }
  | {
    type: 'toolStart';
    call: FunctionCall;
  }
  | ({
    type: 'toolEnd';
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
