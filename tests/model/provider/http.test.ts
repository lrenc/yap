import { describe, expect, test } from 'bun:test';
import {
  HttpError,
  postJson,
} from '../../../src/model/provider/http.ts';
import { TimeoutError } from '../../../src/model/provider/errors.ts';

async function captureError(action: () => Promise<unknown>): Promise<Error> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Expected an Error, received ${String(error)}`);
  }
  throw new Error('Expected action to reject');
}

describe('postJson', () => {
  test('sends a JSON POST request with default headers', async () => {
    let captured: Request | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      captured = new Request(input, init);
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const response = await postJson(
      'https://example.test/v1/responses',
      { value: 42 },
      { fetch: fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(captured?.method).toBe('POST');
    expect(captured?.headers.get('content-type')).toBe('application/json');
    expect(captured?.headers.get('accept')).toBe('application/json');
    expect(await captured?.json()).toEqual({ value: 42 });
  });

  test('preserves caller headers that overlap defaults', async () => {
    let captured: Request | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      captured = new Request(input, init);
      return new Response('{}');
    };

    await postJson('https://example.test', {}, {
      fetch: fetchImpl,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/custom+json',
        'X-Request-Id': 'request-1',
      },
    });

    expect(captured?.headers.get('accept')).toBe('text/event-stream');
    expect(captured?.headers.get('content-type')).toBe(
      'application/custom+json',
    );
    expect(captured?.headers.get('x-request-id')).toBe('request-1');
  });

  test('throws HttpError for a non-success response', async () => {
    const body = 'x'.repeat(250);
    const fetchImpl: typeof fetch = async () => new Response(body, {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'x-error-code': 'invalid' },
    });

    const error = await captureError(() => postJson(
      'https://example.test',
      {},
      { fetch: fetchImpl },
    ));

    expect(error).toBeInstanceOf(HttpError);
    const httpError = error as HttpError;
    expect(httpError.name).toBe('HttpError');
    expect(httpError.status).toBe(400);
    expect(httpError.body).toBe(body);
    expect(httpError.headers.get('x-error-code')).toBe('invalid');
    expect(httpError.message).toBe(`HTTP 400: ${'x'.repeat(200)}...`);
  });

  test('uses status text when an error body is empty', async () => {
    const fetchImpl: typeof fetch = async () => new Response('', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(postJson(
      'https://example.test',
      {},
      { fetch: fetchImpl },
    )).rejects.toThrow('HTTP 503: Service Unavailable');
  });

  test('translates a fetch rejection caused by its request timeout', async () => {
    const fetchImpl: typeof fetch = (_input, init) => new Promise(
      (_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('Missing abort signal'));
          return;
        }
        if (signal.aborted) {
          reject(new Error('Fetch was aborted'));
          return;
        }
        signal.addEventListener(
          'abort',
          () => reject(new Error('Fetch was aborted')),
          { once: true },
        );
      },
    );

    const error = await captureError(() => postJson(
      'https://example.test',
      {},
      { fetch: fetchImpl, timeout: 5 },
    ));

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toBe('Request timed out after 5ms');
  });

  test('propagates caller cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('user cancelled');
    const fetchImpl: typeof fetch = (_input, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(init.signal.reason);
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };
    controller.abort(reason);

    const error = await captureError(() => postJson(
      'https://example.test',
      {},
      { fetch: fetchImpl, signal: controller.signal },
    ));

    expect(error).toBe(reason);
  });

  test('clears its timeout once response headers arrive', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedSignal = init?.signal ?? null;
      return new Response('{}');
    };

    await postJson('https://example.test', {}, {
      fetch: fetchImpl,
      timeout: 5,
    });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(capturedSignal).not.toBeNull();
    expect((capturedSignal as AbortSignal | null)?.aborted).toBe(false);
  });

  test('passes a null signal when no timeout or caller signal is supplied', async () => {
    let capturedSignal: AbortSignal | null | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedSignal = init?.signal;
      return new Response('{}');
    };

    await postJson('https://example.test', {}, { fetch: fetchImpl });

    expect(capturedSignal).toBeNull();
  });
});
