import { formatError } from '../error.ts';
import type {
  AgentEvent,
  AgentResult,
  ToolOutcome,
} from '../../agent/run/types.ts';

export type ChatEvent =
  | {
    type: 'user_message';
    content: string;
    runId: number;
    sessionId: number;
  }
  | (AgentEvent & {
    runId: number;
    sessionId: number;
  })
  | {
    type: 'session_boundary';
    sessionId: number;
  };

export type ChatEntry =
  | {
    id: string;
    type: 'user';
    content: string;
  }
  | {
    id: string;
    type: 'assistant';
    content: string;
    refusal: boolean;
  }
  | {
    id: string;
    type: 'tool';
    name: string;
    status: ToolOutcome['status'];
    summary: string | undefined;
  }
  | {
    id: string;
    type: 'notice';
    level: 'info' | 'warning' | 'error';
    message: string;
  }
  | {
    id: string;
    type: 'divider';
    label: string;
  };

export interface ActiveResponse {
  id: string;
  runId: number;
  turn: number;
  text: string;
  refusal: boolean;
}

export type ChatActivity =
  | { type: 'thinking' }
  | { type: 'compacting' }
  | { type: 'waiting'; modelId: string }
  | {
    type: 'tool';
    name: string;
    callId: string;
  };

export interface ChatState {
  completed: ChatEntry[];
  active: ActiveResponse | null;
  activity: ChatActivity | null;
}

export const INITIAL_CHAT_STATE: ChatState = {
  completed: [],
  active: null,
  activity: null,
};

export function applyChatEvent(
  state: ChatState,
  event: ChatEvent,
): ChatState {
  switch (event.type) {
    case 'user_message': {
      return appendItem(state, {
        id: `user:${event.sessionId}:${event.runId}`,
        type: 'user',
        content: event.content,
      });
    }
    case 'turn_start': {
      return {
        ...state,
        activity: { type: 'thinking' },
      };
    }
    case 'text_delta': {
      return updateActive(state, event, false);
    }
    case 'refusal_delta': {
      return updateActive(state, event, true);
    }
    case 'text_done': {
      return finishText(state, event);
    }
    case 'tool_start': {
      return {
        ...state,
        activity: {
          type: 'tool',
          name: event.call.name,
          callId: event.call.call_id,
        },
      };
    }
    case 'tool_end': {
      const current = state.activity?.type === 'tool'
        && state.activity.callId === event.call.call_id
        ? state.activity
        : undefined;
      return {
        ...appendItem(state, {
          id: `tool:${event.sessionId}:${event.runId}:${event.call.call_id}`,
          type: 'tool',
          name: event.call.name,
          status: event.status,
          summary: event.status === 'completed'
            ? undefined
            : summarizeToolOutput(event.output),
        }),
        activity: current ? null : state.activity,
      };
    }
    case 'compaction_start': {
      return {
        ...state,
        activity: { type: 'compacting' },
      };
    }
    case 'compaction_end': {
      return {
        ...state,
        activity: null,
      };
    }
    case 'queue': {
      return {
        ...state,
        activity: event.waitingFor === undefined
          ? null
          : { type: 'waiting', modelId: event.waitingFor },
      };
    }
    case 'done': {
      return finishRun(state, event);
    }
    case 'session_boundary': {
      return appendItem({
        ...state,
        active: null,
        activity: null,
      }, {
        id: `divider:${event.sessionId}:${state.completed.length}`,
        type: 'divider',
        label: 'New conversation',
      });
    }
  }
}

function updateActive(
  state: ChatState,
  event: Extract<
    ChatEvent,
    { type: 'text_delta' | 'refusal_delta' }
  >,
  refusal: boolean,
): ChatState {
  const sameTurn = state.active?.runId === event.runId
    && state.active.turn === event.turn;
  const active = sameTurn && state.active
    ? state.active
    : {
      id: assistantId(event.sessionId, event.runId, event.turn),
      runId: event.runId,
      turn: event.turn,
      text: '',
      refusal: false,
    };
  return {
    ...state,
    activity: null,
    active: {
      ...active,
      text: active.text + event.delta,
      refusal: active.refusal || refusal,
    },
  };
}

function finishText(
  state: ChatState,
  event: Extract<ChatEvent, { type: 'text_done' }>,
): ChatState {
  const sameTurn = state.active?.runId === event.runId
    && state.active.turn === event.turn;
  const active = sameTurn ? state.active : null;
  const refusal = Boolean(active?.refusal)
    || (event.parts?.some(part => part.type === 'refusal') ?? false);
  const content = event.text || active?.text || '';
  const completed = content
    ? [...state.completed, {
      id: active?.id
        ?? assistantId(event.sessionId, event.runId, event.turn),
      type: 'assistant' as const,
      content,
      refusal,
    }]
    : state.completed;
  return {
    completed,
    active: sameTurn ? null : state.active,
    activity: null,
  };
}

function finishRun(
  state: ChatState,
  event: Extract<ChatEvent, { type: 'done' }>,
): ChatState {
  const sameRun = state.active?.runId === event.runId;
  const active = sameRun ? state.active : null;
  const completed = active?.text
    ? [...state.completed, {
      id: active.id,
      type: 'assistant' as const,
      content: active.text,
      refusal: active.refusal,
    }]
    : state.completed;
  const notice = resultNotice(event.result, event.sessionId, event.runId);
  return {
    completed: notice ? [...completed, notice] : completed,
    active: sameRun ? null : state.active,
    activity: null,
  };
}

function resultNotice(
  result: AgentResult,
  sessionId: number,
  runId: number,
): ChatEntry | null {
  const id = `notice:${sessionId}:${runId}:done`;
  if (result.stopReason === 'error') {
    return {
      id,
      type: 'notice',
      level: 'error',
      message: formatError(result.error, 'Conversation failed.'),
    };
  }
  if (result.stopReason === 'stalled') {
    return {
      id,
      type: 'notice',
      level: 'warning',
      message: 'Stopped after repeated tool calls without new information.',
    };
  }
  if (result.stopReason === 'cancelled') {
    return {
      id,
      type: 'notice',
      level: 'warning',
      message: 'Conversation cancelled.',
    };
  }
  return null;
}

function summarizeToolOutput(output: string): string | undefined {
  const normalized = output.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > 160
    ? `${normalized.slice(0, 157)}...`
    : normalized;
}

function assistantId(
  sessionId: number,
  runId: number,
  turn: number,
): string {
  return `assistant:${sessionId}:${runId}:${turn}`;
}

function appendItem(
  state: ChatState,
  item: ChatEntry,
): ChatState {
  return {
    ...state,
    completed: [...state.completed, item],
  };
}
