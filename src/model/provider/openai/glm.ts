import { isObject, isSafeInteger } from '../../../utils/guards.ts';
import { OpenAIError } from './errors.ts';
import type {
  AdapterRequest,
  ResponseInputItem,
  ResponseOutputMessage,
  ResponsesAdapter,
} from './types.ts';

export const glmAdapter: ResponsesAdapter = {
  encodeRequest,
  normalizeResponse,
  normalizeEvent,
};

function encodeRequest(params: AdapterRequest): Record<string, unknown> {
  const request = structuredClone(params);
  delete request.parallel_tool_calls;
  delete request.include;
  for (const tool of request.tools ?? []) {
    delete tool.strict;
  }
  const input = typeof request.input === 'string'
    ? request.input
    : request.input.map(encodeInputItem).filter(item => item !== null);
  const toolChoice = request.tool_choice;

  if (
    toolChoice !== undefined
    && toolChoice !== 'auto'
    && toolChoice !== 'none'
  ) {
    throw new OpenAIError(
      'GLM Responses supports only auto or none tool_choice'
    );
  }

  return {
    ...request,
    input,
  };
}

function encodeInputItem(item: ResponseInputItem): unknown | null {
  if ('role' in item && 'content' in item) {
    return {
      type: 'message',
      role: item.role,
      content: encodeContent(item.content),
    };
  }

  switch (item.type) {
    case 'reasoning': {
      const text = item.content
        ?.filter(part => part.type === 'reasoning_text')
        .map(part => part.text)
        .join('\n\n')
        || item.summary.map(part => part.text).join('\n\n');
      return text
        ? {
          type: 'reasoning',
          content: {
            type: 'reasoning_text',
            text,
          },
        }
        : null;
    }
    case 'function_call':
      return {
        type: 'function_call',
        name: item.name,
        call_id: item.call_id,
        arguments: item.arguments,
      };
    case 'function_call_output':
      return {
        type: 'function_call_output',
        call_id: item.call_id,
        output: item.output,
      };
    default:
      return structuredClone(item);
  }
}

function encodeContent(
  content: string | ResponseOutputMessage['content'],
): string | Record<string, unknown>[] {
  if (typeof content === 'string') {
    return content;
  }
  return content.map(part => (
    part.type === 'refusal'
      ? { type: 'output_text', text: part.refusal }
      : { type: 'output_text', text: part.text }
  ));
}

function normalizeResponse(value: unknown): unknown {
  if (!isObject(value) || !Array.isArray(value.output)) {
    return value;
  }
  return {
    ...structuredClone(value),
    output: value.output.map((item, index) => (
      normalizeOutputItem(item, index)
    )),
  };
}

function normalizeEvent(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const event = structuredClone(value);
  if (event.type === 'response.output_item.done') {
    event.item = normalizeOutputItem(
      event.item,
      isSafeInteger(event.output_index) ? event.output_index : undefined,
    );
  } else if (
    event.type === 'response.completed'
    || event.type === 'response.failed'
    || event.type === 'response.incomplete'
  ) {
    event.response = normalizeResponse(event.response);
  }
  return event;
}

function normalizeOutputItem(
  value: unknown,
  outputIndex: number | undefined,
): unknown {
  if (!isObject(value)) {
    return value;
  }

  const item = structuredClone(value);
  delete item.status;
  switch (item.type) {
    case 'message': {
      if (typeof item.id !== 'string') {
        item.id = `message_${outputIndex ?? 0}`;
      }
      if (isObject(item.content)) {
        item.content = [item.content];
      }
      return item;
    }
    case 'reasoning': {
      if (typeof item.id !== 'string') {
        item.id = `reasoning_${outputIndex ?? 0}`;
      }
      if (isObject(item.content)) {
        item.content = [item.content];
      }
      if (item.summary === undefined) {
        item.summary = [];
      }
      return item;
    }
    default:
      return item;
  }
}
