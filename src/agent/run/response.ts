import type { FunctionCall, ResponseOutputItem } from '../../model/provider/openai/types.ts';

export function responseText(
  output: readonly ResponseOutputItem[],
): string {
  let text = '';
  for (const item of output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        text += part.type === 'refusal'
          ? part.refusal
          : part.text;
      }
    }
  }
  return text;
}

export function functionCalls(
  output: readonly ResponseOutputItem[],
): FunctionCall[] {
  return structuredClone(
    output.filter(item => item.type === 'function_call')
  );
}
