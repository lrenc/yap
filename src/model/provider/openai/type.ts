export interface OpenAIClientOptions {
  apiKey: string;
  baseURL: string;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  idleTimeout?: number;
}

export interface OpenAIClient {
  readonly endpoint?: string;
  create(
    params: ResponseCreateParams,
    options?: RequestOptions,
  ): Promise<OpenAIResponse>;

  stream(
    params: ResponseCreateParams,
    options?: RequestOptions,
  ): Promise<AsyncGenerator<ResponseStreamEvent>>;
}

export interface ResponseCreateParams {
  model: string;
  input: string | ResponseInputItem[];
  instructions?: string;
  tools?: FunctionTool[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  parallel_tool_calls?: boolean;
  store?: boolean;
  max_output_tokens?: number;
  include?: string[];
  reasoning?: { effort: string };
}

export type ResponseInputItem =
  ResponseInputMessage
  | ResponseOutputItem
  | FunctionCallOutput;

export interface ResponseInputMessage {
  type?: 'message';
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string;
  phase?: 'commentary' | 'final_answer' | null;
}

export interface FunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface FunctionCall {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface FunctionCallOutput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export interface OpenAIResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'incomplete';
  output: ResponseOutputItem[];
  error?: ResponseError | null;
  incomplete_details?: { reason?: string } | null;
  usage?: ResponseUsage | null;
}

export interface ResponseUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  } | null;
  output_tokens_details?: {
    reasoning_tokens?: number;
  } | null;
}

export type ResponseOutputItem =
  ResponseOutputMessage
  | FunctionCall
  | ResponseReasoningItem;

export interface ResponseOutputMessage {
  type: 'message';
  id: string;
  role: 'assistant';
  phase?: 'commentary' | 'final_answer' | null;
  content: (
    { type: 'output_text'; text: string }
    | { type: 'refusal'; refusal: string }
  )[];
}

export interface ResponseReasoningItem {
  type: 'reasoning';
  id: string;
  summary: { type: 'summary_text'; text: string }[];
  content?: { type: 'reasoning_text'; text: string }[];
  encrypted_content?: string | null;
}

export interface ResponseError {
  code?: string | null;
  message: string;
}

export type ResponseStreamEvent =
  {
    type: 'response.output_text.delta';
    item_id: string;
    output_index: number;
    delta: string;
  }
  | {
    type: 'response.output_text.done';
    item_id: string;
    output_index: number;
    text: string;
  }
  | {
    type: 'response.refusal.delta';
    item_id: string;
    output_index: number;
    delta: string;
  }
  | {
    type: 'response.refusal.done';
    item_id: string;
    output_index: number;
    refusal: string;
  }
  | {
    type: 'response.function_call_arguments.delta';
    item_id: string;
    output_index: number;
    delta: string;
  }
  | {
    type: 'response.function_call_arguments.done';
    item_id: string;
    output_index: number;
    arguments: string;
  }
  | {
    type: 'response.output_item.done';
    output_index: number;
    item: ResponseOutputItem;
  }
  | {
    type: 'response.completed' | 'response.failed' | 'response.incomplete';
    response: OpenAIResponse;
  };
