export interface TestStreamOptions {
  close?: boolean;
  onCancel?: (reason: unknown) => void;
}

export function byteStream(
  chunks: readonly (string | Uint8Array)[],
  options: TestStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const close = options.close ?? true;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
        );
      }
      if (close) {
        controller.close();
      }
    },
    cancel(reason) {
      options.onCancel?.(reason);
    },
  });
}

export function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
