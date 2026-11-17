import { glmAdapter } from './glm.ts';
import type { AdapterName, ResponsesAdapter } from './types.ts';

const openAIAdapter: ResponsesAdapter = {
  encodeRequest: params => params,
  normalizeResponse: value => value,
  normalizeEvent: value => value,
};

export function getAdapter(
  name: AdapterName,
): ResponsesAdapter {
  return name === 'glm' ? glmAdapter : openAIAdapter;
}
