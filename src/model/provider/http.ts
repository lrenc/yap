import { TimeoutError } from './errors.ts';

const MAX_MESSAGE_BODY = 200;

export class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  readonly headers: Headers;
  readonly url: string;

  constructor(response: Response, body: string) {
    const detail = body.length > MAX_MESSAGE_BODY
      ? `${body.slice(0, MAX_MESSAGE_BODY)}...`
      : body;
    const reason = detail || response.statusText;
    super(`HTTP ${response.status}${reason ? `: ${reason}` : ''}`);
    this.name = 'HttpError';
    this.status = response.status;
    this.body = body;
    this.headers = response.headers;
    this.url = response.url;
  }
}

export interface PostJsonOptions {
  headers?: HeadersInit;
  signal?: AbortSignal | null;
  fetch?: typeof globalThis.fetch;
  timeout?: number | undefined;
}

function withTimeout(
  timeout: number | undefined,
  signal: AbortSignal | undefined,
): { signal: AbortSignal | undefined; dispose: () => void } {
  if (timeout === undefined) {
    return { signal, dispose: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new TimeoutError(`Request timed out after ${timeout}ms`)
    );
  }, timeout);
  return {
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

export async function postJson(
  url: string,
  body: unknown,
  options: PostJsonOptions = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const combined = withTimeout(options.timeout, options.signal ?? undefined);
  let response: Response;

  try {
    response = await (options.fetch ?? globalThis.fetch)(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: combined.signal ?? null,
    });
  } catch (error) {
    const reason = combined.signal?.reason;
    if (
      reason instanceof TimeoutError
      && !(error instanceof TimeoutError)
    ) {
      throw reason;
    }
    throw error;
  } finally {
    combined.dispose();
  }

  if (!response.ok) {
    throw new HttpError(response, await response.text());
  }
  return response;
}
