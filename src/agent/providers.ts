import type { Provider } from '../model/types.ts';

export const providers: readonly Provider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    adapter: 'openai',
  },
  {
    id: 'zhipu',
    name: 'Zhipu GLM',
    baseURL: 'https://open.bigmodel.cn/api/v1',
    adapter: 'glm',
  },
];
