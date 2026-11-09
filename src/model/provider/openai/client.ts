import { isSafeInteger, isObject } from '../../../utils/guards.ts';
import { postJson } from '../http.ts';
import { readSSE } from '../sse.ts';
import { cancellable } from '../stream.ts';
import { OpenAIError } from './errors.ts';
import type {
  OpenAIClient,
  OpenAIClientOptions,
  OpenAIResponse,
  RequestOptions,
  ResponseCreateParams,
  ResponseStreamEvent,
} from './type.ts';

const STATUSES = [
  'queued', 'in_progress', 'completed', 'failed', 'cancelled', 'incomplete',
];

const TERMINAL_EVENTS = [
  'response.completed', 'response.failed', 'response.incomplete',
];

export function createClient(options: OpenAIClientOptions): OpenAIClient {
  const baseURL = options.baseURL.replace(/\/+$/, '');
  const endpoint = `${baseURL}/responses`;

  function post(
    params: ResponseCreateParams & { stream: boolean },
    requestOptions: RequestOptions = {},
  ): Promise<Response> {
    return postJson(endpoint, params, {
      fetch: options.fetch ?? globalThis.fetch,
      signal: requestOptions.signal ?? null,
      timeout: requestOptions.timeout,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: params.stream ? 'text/event-stream' : 'application/json',
      },
    });
  }

  return {
    get endpoint() {
      return endpoint;
    },

    async create(params, requestOptions) {
      const response = await post({ ...params, stream: false }, requestOptions);
      const result = parseResponse(await response.json());
      if (result.status === 'failed') {
        throw new OpenAIError(result.error?.message ?? 'Responses request failed', {
          code: result.error?.code ?? undefined,
        });
      }
      return result;
    },

    async stream(params, requestOptions) {
      const response = await post({ ...params, stream: true }, requestOptions);
      const contentType = response.headers.get('content-type')
        ?.split(';')[0]?.trim().toLowerCase();
      if (!response.body || contentType !== 'text/event-stream') {
        await response.body?.cancel().catch(() => {});
        throw new OpenAIError(
          'Expected a text/event-stream response body'
        );
      }
      const idleTimeout = requestOptions?.idleTimeout;
      return streamResponse(
        response.body,
        idleTimeout === undefined ? {} : { idleTimeout },
      );
    },
  };
}

function streamResponse(
  body: ReadableStream<Uint8Array>,
  options: { idleTimeout?: number },
): AsyncGenerator<ResponseStreamEvent> {
  const source = readSSE(body, options);
  let closed = false;
  return cancellable(parseEvents(source, () => closed), () => {
    closed = true;
    return source.return(undefined);
  });
}

async function* parseEvents(
  source: AsyncGenerator<{ event: string; data: string }>,
  closed: () => boolean,
): AsyncGenerator<ResponseStreamEvent> {
  for await (const { data } of source) {
    if (closed()) {
      return;
    }
    if (data === '[DONE]') {
      break;
    }
    const event = parseEvent(data);
    if (event === null) {
      continue;
    }
    yield event;
    if (TERMINAL_EVENTS.includes(event.type)) {
      return;
    }
  }
  if (!closed()) {
    throw new OpenAIError(
      'Responses stream has no terminal event'
    );
  }
}

function parseEvent(data: string): ResponseStreamEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (error) {
    throw new OpenAIError('Invalid Responses event JSON', {
      cause: error,
    });
  }
  if (!isObject(value) || typeof value.type !== 'string') {
    throw new OpenAIError('Invalid Responses event');
  }

  switch (value.type) {
    case 'response.output_text.delta':
    case 'response.function_call_arguments.delta': {
      validateStringFields(value, ['item_id', 'delta']);
      validateOutputIndex(value);
      return value as ResponseStreamEvent;
    }
    case 'response.output_text.done': {
      validateStringFields(value, ['item_id', 'text']);
      validateOutputIndex(value);
      return value as ResponseStreamEvent;
    }
    case 'response.refusal.delta': {
      validateStringFields(value, ['item_id', 'delta']);
      validateOutputIndex(value);
      return value as ResponseStreamEvent;
    }
    case 'response.function_call_arguments.done': {
      validateStringFields(value, ['item_id', 'arguments']);
      validateOutputIndex(value);
      return value as ResponseStreamEvent;
    }
    case 'response.refusal.done': {
      validateStringFields(value, ['item_id', 'refusal']);
      validateOutputIndex(value);
      return value as ResponseStreamEvent;
    }
    case 'response.output_item.done': {
      validateOutputItem(value.item);
      validateOutputIndex(value);
      return value as ResponseStreamEvent;
    }
    case 'response.completed':
    case 'response.failed':
    case 'response.incomplete': {
      const response = parseResponse(value.response);
      if (response.status !== value.type.slice('response.'.length)) {
        throw new OpenAIError('Responses event/status mismatch');
      }
      return value as ResponseStreamEvent;
    }
    case 'error': {
      const code = typeof value.code === 'string' ? value.code : undefined;
      throw new OpenAIError(
        `Responses error${code ? ` (${code})` : ''}: ${String(value.message)}`,
        { code },
      );
    }
    default: {
      return null;
    }
  }
}

function validateOutputIndex(event: Record<string, unknown>) {
  if (!isSafeInteger(event.output_index) || event.output_index < 0) {
    throw new OpenAIError('Invalid Responses output index');
  }
}

function validateStringFields(event: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    if (typeof event[field] !== 'string') {
      throw new OpenAIError(
        `Invalid Responses event: ${String(event.type)}`
      );
    }
  }
}

function parseResponse(value: unknown): OpenAIResponse {
  if (
    !isObject(value)
    || typeof value.id !== 'string'
    || typeof value.status !== 'string'
    || !STATUSES.includes(value.status)
    || !Array.isArray(value.output)
  ) {
    throw new OpenAIError('Invalid Responses response');
  }
  const callIds = new Set<string>();
  for (const item of value.output) {
    validateOutputItem(item);
    if (item.type === 'function_call') {
      if (callIds.has(item.call_id)) {
        throw new OpenAIError(`Duplicate Responses tool call: ${item.call_id}`);
      }
      callIds.add(item.call_id);
    }
  }
  return value as unknown as OpenAIResponse;
}

function validateOutputItem(value: unknown): void {
  if (!isObject(value)) {
    throw new OpenAIError('Invalid Responses output item');
  }

  switch (value.type) {
    case 'message': {
      if (
        typeof value.id === 'string'
        && value.role === 'assistant'
        && Array.isArray(value.content)
        && value.content.every(part => isObject(part) && (
          (
            part.type === 'output_text'
            && typeof part.text === 'string'
          )
          || (
            part.type === 'refusal'
            && typeof part.refusal === 'string'
          )
        ))
      ) {
        return;
      }
      break;
    }
    case 'function_call': {
      if (
        typeof value.call_id === 'string'
        && typeof value.name === 'string'
        && typeof value.arguments === 'string'
      ) {
        return;
      }
      break;
    }
    case 'reasoning': {
      if (
        typeof value.id === 'string'
        && Array.isArray(value.summary)
        && value.summary.every(
          part => (
            isObject(part)
            && part.type === 'summary_text'
            && typeof part.text === 'string'
          )
        )
      ) {
        return;
      }
      break;
    }
  }

  throw new OpenAIError(
    `Invalid Responses output item ${String(value.type)}`
  );
}
