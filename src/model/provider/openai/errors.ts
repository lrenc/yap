export class OpenAIError extends Error {
  readonly code: string | undefined;

  constructor(
    message: string,
    options: {
      code?: string | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, {
      cause: options.cause,
    });
    this.name = 'OpenAIError';
    this.code = options.code;
  }
}
