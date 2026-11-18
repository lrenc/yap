export interface AgentRuntimeConfig {
  activeModelId: string;
  modelSettings: Readonly<Record<string, {
    readonly [key: string]: unknown;
    readonly reasoningEffort?: string | undefined;
  }>>;
  activePrompt?: string | undefined;
}

export interface AgentSettings {
  readonly config: AgentRuntimeConfig;
  readonly warnings: readonly string[];
  load(): Promise<void>;
  setModel(modelId: string): Promise<void>;
  setReasoningEffort(
    modelId: string,
    effort: string | undefined,
  ): Promise<void>;
  setActivePrompt(name: string | undefined): Promise<void>;
}

export interface AgentSecrets {
  readonly warnings: readonly string[];
  load(): Promise<void>;
  getApiKey(providerId: string): Promise<string | undefined>;
  setApiKey(providerId: string, apiKey: string): Promise<void>;
  clearApiKey(providerId: string): Promise<void>;
}

export interface AgentPromptSelection {
  readonly content: string;
  readonly missingPrompt: string | undefined;
}

export interface AgentPrompts {
  readonly warnings: readonly string[];
  loadSelected(activePrompt: string | undefined): Promise<AgentPromptSelection>;
  list(): Promise<string[]>;
  create(name: string, content: string): Promise<void>;
  update(name: string, content: string): Promise<void>;
  delete(name: string): Promise<void>;
  read(name: string): Promise<string | undefined>;
}
