export const MAX_OUTPUT_BYTES = 50 * 1024;

export function truncateLines(
  lines: readonly string[],
  { start = 0, limit }: { start?: number; limit: number },
) {
  let end = start;
  let bytes = 0;
  let byteLimitReached = false;
  for (const line of lines.slice(start, start + limit)) {
    const size = Buffer.byteLength(line, 'utf8');
    if (bytes + size > MAX_OUTPUT_BYTES) {
      byteLimitReached = true;
      break;
    }
    bytes += size;
    end += 1;
  }
  return {
    content: lines.slice(start, end).join(''),
    lineCount: end - start,
    byteLimitReached,
  };
}
