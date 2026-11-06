export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class SSEError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSEError';
  }
}
