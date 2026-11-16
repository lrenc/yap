import { formatError } from '../format-error.ts';
import type {
  AgentEvent,
  AgentResult,
  ToolOutcome,
} from '../../agent/run/types.ts';

const MAX_STREAM_PART_CHARS = 4_096;

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
    streamPart?: 'start' | 'continue' | 'end' | 'only';
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
  sessionId: number;
  turn: number;
  text: string;
  refusal: boolean;
  parts: number;
}

export type ChatActivity =
  | { type: 'thinking' }
  | { type: 'compacting' }
  | { type: 'waiting'; modelId: string }
  | {
    type: 'tool';
    id: string;
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
      const id = `tool:${event.sessionId}:${event.runId}:${event.call.call_id}`;
      return {
        ...state,
        activity: {
          type: 'tool',
          id,
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
          id: current?.id
            ?? `tool:${event.sessionId}:${event.runId}:${event.call.call_id}`,
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
      sessionId: event.sessionId,
      turn: event.turn,
      text: '',
      refusal: false,
      parts: 0,
    };
  const text = active.text + event.delta;
  const boundary = text.lastIndexOf('\n');
  if (boundary >= 0) {
    const content = text.slice(0, boundary + 1);
    const nextRefusal = active.refusal || refusal;
    const part = assistantPart(
      { ...active, refusal: nextRefusal },
      content,
      active.parts,
      false,
    );
    return {
      ...state,
      completed: appendAssistantPart(state.completed, part, active.id),
      activity: null,
      active: {
        ...active,
        text: text.slice(boundary + 1),
        refusal: nextRefusal,
        parts: active.parts + 1,
      },
    };
  }
  return {
    ...state,
    activity: null,
    active: {
      ...active,
      text,
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
  const completed = active
    ? finalizeAssistant(state.completed, active, event.text, refusal)
    : event.text
      ? [...state.completed, {
        id: assistantId(event.sessionId, event.runId, event.turn),
        type: 'assistant' as const,
        content: event.text,
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
  const completed = active
    ? finalizeAssistant(
      state.completed,
      active,
      streamedAssistantText(state.completed, active),
      active.refusal,
    )
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

function finalizeAssistant(
  entries: readonly ChatEntry[],
  active: ActiveResponse,
  fallbackText: string,
  refusal: boolean,
): ChatEntry[] {
  const text = fallbackText || active.text;
  if (text !== streamedAssistantText(entries, active)) {
    return replaceAssistantText(entries, active, text, refusal);
  }
  if (active.parts === 0) {
    const content = active.text || text;
    return content
      ? [...entries, {
        id: active.id,
        type: 'assistant',
        content,
        refusal,
      }]
      : [...entries];
  }
  const part = assistantPart(
    { ...active, refusal },
    active.text,
    active.parts,
    true,
  );
  return appendAssistantPart(entries, part, active.id, true);
}

function streamedAssistantText(
  entries: readonly ChatEntry[],
  active: ActiveResponse,
): string {
  const parts: string[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const item = entries[index];
    if (
      item?.type !== 'assistant'
      || !item.id.startsWith(`${active.id}:part:`)
    ) {
      break;
    }
    parts.unshift(item.content);
  }
  return parts.length > 0
    ? `${parts.join('\n')}\n${active.text}`
    : active.text;
}

function replaceAssistantText(
  entries: readonly ChatEntry[],
  active: ActiveResponse,
  text: string,
  refusal: boolean,
): ChatEntry[] {
  let end = entries.length;
  while (end > 0) {
    const item = entries[end - 1];
    if (
      item?.type !== 'assistant'
      || !item.id.startsWith(`${active.id}:part:`)
    ) {
      break;
    }
    end -= 1;
  }
  if (!text) {
    return entries.slice(0, end);
  }

  const source = { ...active, refusal };
  let completed = entries.slice(0, end);
  let start = 0;
  let partIndex = 0;
  while (true) {
    const boundary = text.indexOf('\n', start);
    if (boundary < 0) {
      break;
    }
    completed = appendAssistantPart(
      completed,
      assistantPart(
        source,
        text.slice(start, boundary + 1),
        partIndex,
        false,
      ),
      active.id,
    );
    start = boundary + 1;
    partIndex += 1;
  }
  return appendAssistantPart(
    completed,
    assistantPart(source, text.slice(start), partIndex, true),
    active.id,
    true,
  );
}

function assistantPart(
  active: ActiveResponse,
  content: string,
  index: number,
  final: boolean,
): ChatEntry {
  return {
    id: `${active.id}:part:${index}`,
    type: 'assistant',
    content: final ? content : removeLineBreak(content),
    refusal: active.refusal,
    streamPart: final ? 'end' : index === 0 ? 'start' : 'continue',
  };
}

function removeLineBreak(content: string): string {
  return content.replace(/\r\n$|\r$|\n$/u, '');
}

function appendAssistantPart(
  entries: readonly ChatEntry[],
  part: ChatEntry,
  activeId: string,
  final = false,
): ChatEntry[] {
  if (part.type !== 'assistant') {
    return [...entries, part];
  }
  const previous = entries.at(-1);
  if (
    !previous
    || previous.type !== 'assistant'
    || previous.streamPart === 'end'
    || previous.refusal !== part.refusal
    || !previous.id.startsWith(`${activeId}:part:`)
    || previous.content.length + part.content.length
      + (previous.content ? 1 : 0) > MAX_STREAM_PART_CHARS
  ) {
    return [...entries, part];
  }
  const content = previous.content
    ? part.content
      ? `${previous.content}\n${part.content}`
      : previous.content
    : part.content;
  return [
    ...entries.slice(0, -1),
    {
      ...previous,
      content,
      ...(final ? {
        streamPart: previous.streamPart === 'start'
          ? 'only' as const
          : 'end' as const,
      } : {}),
    },
  ];
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
