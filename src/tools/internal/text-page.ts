import { MAX_OUTPUT_BYTES } from './truncate.ts';

export class TextPage {
  readonly #start: number;
  readonly #limit: number;
  readonly #lines: string[] = [];

  #bytes = 0;
  #byteLimitReached = false;

  #line = '';
  #lineBytes = 0;
  #hasContent = false;

  #totalLines = 0;
  #pendingCR = false;

  constructor({ start, limit }: { start: number; limit: number }) {
    this.#start = start;
    this.#limit = limit;
  }

  append(text: string): void {
    let offset = 0;
    if (this.#pendingCR) {
      if (text.startsWith('\n')) {
        this.#appendText('\n');
        offset = 1;
      }
      this.#finishLine();
      this.#pendingCR = false;
    }
    const endings = /\r\n|\r|\n/g;
    endings.lastIndex = offset;
    for (const match of text.matchAll(endings)) {
      const end = match.index + match[0].length;
      this.#appendText(text.slice(offset, end));
      offset = end;
      if (match[0] === '\r' && end === text.length) {
        this.#pendingCR = true;
      } else {
        this.#finishLine();
      }
    }
    this.#appendText(text.slice(offset));
  }

  finish() {
    if (this.#hasContent) {
      this.#finishLine();
    }
    const lines = this.#lines;
    const totalLines = this.#totalLines;
    return {
      content: lines.join(''),
      lineCount: lines.length,
      totalLines,
    };
  }

  #appendText(text: string): void {
    if (!text) {
      return;
    }
    this.#hasContent = true;
    if (
      this.#totalLines < this.#start
      || this.#lines.length >= this.#limit
      || this.#byteLimitReached
    ) {
      return;
    }
    const size = Buffer.byteLength(text, 'utf8');
    if (this.#bytes + this.#lineBytes + size > MAX_OUTPUT_BYTES) {
      if (this.#lines.length === 0) {
        throw new Error(`Line ${this.#start + 1} exceeds the 50 KiB output limit`);
      }
      this.#byteLimitReached = true;
      this.#line = '';
      return;
    }
    this.#line += text;
    this.#lineBytes += size;
  }

  #finishLine(): void {
    if (this.#line) {
      this.#lines.push(this.#line);
      this.#bytes += this.#lineBytes;
    }
    this.#totalLines += 1;
    this.#line = '';
    this.#lineBytes = 0;
    this.#hasContent = false;
  }
}