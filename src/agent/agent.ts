import { resolve } from 'node:path';
import { FileSecretStore } from './settings/secrets.ts';
import { PromptRepository } from './settings/prompts.ts';
import { SettingsStore } from './settings/store.ts';
import { ClientFactory } from './clients.ts';
import { models } from './models.ts';
import { readDirectoryTool } from '../tools/files/read-directory.ts';
import { readFileTool } from '../tools/files/read-file.ts';
import { Session } from './session/session.ts';
import type { AdmissionContext, AdmissionResult } from './admission.ts';
import type {
  AgentPrompts,
  AgentRuntimeConfig,
  AgentSecrets,
  AgentSettings,
} from './ports.ts';
import type { SessionRun } from './session/types.ts';
import type { Model, RunConfigSnapshot } from './types.ts';
import type { AgentTool } from '../tools/types.ts';

type NoticeLevel = 'info' | 'warning' | 'error';

export interface AgentOptions {
  cwd?: string;
  instructions?: string;
  settings?: AgentSettings;
  secrets?: AgentSecrets;
  prompts?: AgentPrompts;
  tools?: AgentTool[];
  clients?: Pick<ClientFactory, 'getModel'>;
  onNotice?: (message: string, level: NoticeLevel) => void;
}

export interface AgentRun extends SessionRun {
  readonly sessionId: number;
}

export class Agent {
  readonly cwd: string;
  readonly instructions: string;
  readonly models: readonly Model[];
  readonly tools: AgentTool[];

  readonly #settings: AgentSettings;
  readonly #secrets: AgentSecrets;
  readonly #prompts: AgentPrompts;
  readonly #clients: Pick<ClientFactory, 'getModel'>;
  readonly #onNotice: (message: string, level: NoticeLevel) => void;
  readonly #warnings = new Set<string>();

  #session: Session | null = null;
  #nextSessionId = 0;
  #nextRunId = 0;
  #missingPrompt: string | undefined;
  #disposed = false;

  constructor({
    cwd = process.cwd(),
    instructions = '',
    settings = new SettingsStore(),
    secrets = new FileSecretStore(),
    prompts = new PromptRepository(),
    tools,
    clients,
    onNotice,
  }: AgentOptions = {}) {
    this.cwd = resolve(cwd);
    this.instructions = instructions;
    this.#settings = settings;
    this.#secrets = secrets;
    this.#prompts = prompts;
    this.models = models;
    this.tools = tools
      ? [...tools]
      : [
        readFileTool(this.cwd),
        readDirectoryTool(this.cwd),
      ];

    const modelIds = new Set<string>();
    for (const model of this.models) {
      if (modelIds.has(model.id)) {
        throw new Error('Model IDs must be unique');
      }
      modelIds.add(model.id);
    }

    const toolNames = new Set<string>();
    for (const tool of this.tools) {
      if (toolNames.has(tool.name)) {
        throw new Error('Tool names must be unique');
      }
      toolNames.add(tool.name);
    }

    this.#clients = clients ?? new ClientFactory(this.#secrets);
    this.#onNotice = onNotice ?? (() => {});
  }

  get config(): AgentRuntimeConfig | null {
    try {
      return this.#settings.config;
    } catch {
      return null;
    }
  }

  get settingsWarnings(): readonly string[] {
    return this.#settings.warnings;
  }

  get secretWarnings(): readonly string[] {
    return this.#secrets.warnings;
  }

  get currentModel(): Model | null {
    const config = this.config;
    return config
      ? this.models.find(model => model.id === config.activeModelId) ?? null
      : null;
  }

  get hasSession(): boolean {
    return this.#session !== null;
  }

  get currentSessionId(): number | undefined {
    return this.#session?.id;
  }

  loadSettings(): Promise<void> {
    this.#assertActive();
    return this.#settings.load();
  }

  loadSecrets(): Promise<void> {
    this.#assertActive();
    return this.#secrets.load();
  }

  setModel(modelId: string): Promise<void> {
    this.#assertActive();
    return this.#settings.setModel(modelId);
  }

  setReasoningEffort(
    modelId: string,
    effort: string | undefined,
  ): Promise<void> {
    this.#assertActive();
    return this.#settings.setReasoningEffort(modelId, effort);
  }

  setActivePrompt(name: string | undefined): Promise<void> {
    this.#assertActive();
    return this.#settings.setActivePrompt(name);
  }

  createPrompt(name: string, content: string): Promise<void> {
    this.#assertActive();
    return this.#prompts.create(name, content);
  }

  updatePrompt(name: string, content: string): Promise<void> {
    this.#assertActive();
    return this.#prompts.update(name, content);
  }

  deletePrompt(name: string): Promise<void> {
    this.#assertActive();
    return this.#prompts.delete(name);
  }

  listPrompts(): Promise<string[]> {
    this.#assertActive();
    return this.#prompts.list();
  }

  readPrompt(name: string): Promise<string | undefined> {
    this.#assertActive();
    return this.#prompts.read(name);
  }

  reportPromptWarnings(): void {
    this.#assertActive();
    this.#reportPromptWarnings();
  }

  setApiKey(providerId: string, apiKey: string): Promise<void> {
    this.#assertActive();
    return this.#secrets.setApiKey(providerId, apiKey);
  }

  clearApiKey(providerId: string): Promise<void> {
    this.#assertActive();
    return this.#secrets.clearApiKey(providerId);
  }

  async hasApiKey(providerId: string): Promise<boolean> {
    this.#assertActive();
    return Boolean(await this.#secrets.getApiKey(providerId));
  }

  async admit(_context: AdmissionContext): Promise<AdmissionResult> {
    this.#assertActive();
    const modelId = this.#settings.config.activeModelId;
    let model: Model;
    try {
      model = this.#requireModel(modelId);
    } catch (error) {
      return { type: 'rejected', error };
    }

    let key: string | undefined;
    try {
      key = await this.#secrets.getApiKey(model.providerId);
    } catch {
      key = undefined;
    }
    if (!key) {
      return {
        type: 'blocked',
        block: {
          type: 'missingApiKey',
          message: 'waiting for API key',
        },
      };
    }
    return { type: 'ready' };
  }

  async prepare(): Promise<void> {
    this.#assertActive();
    await this.#loadPrompt(this.config?.activePrompt);
  }

  runStream(input: string): AgentRun {
    this.#assertActive();
    if (!input.trim()) {
      throw new Error('Message must not be empty');
    }
    const session = this.#session ??= new Session({ tools: this.tools }, {
      id: ++this.#nextSessionId,
      resolveRunConfig: signal => this.#resolveConfig(signal),
      allocateRunId: () => ++this.#nextRunId,
    });
    const submitted = session.submitStream(input);
    return {
      sessionId: session.id,
      runId: submitted.runId,
      stream: submitted.stream,
    };
  }

  newSession(): number | undefined {
    this.#assertActive();
    const session = this.#session;
    if (!session) {
      return undefined;
    }
    session.cancel();
    this.#session = null;
    return session.id;
  }

  cancel(): void {
    if (this.#disposed) {
      return;
    }
    this.#session?.cancel();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const session = this.#session;
    this.#session = null;
    session?.cancel();
  }

  #requireModel(modelId: string): Model {
    const model = this.models.find(item => item.id === modelId);
    if (!model) {
      throw new Error('Unknown model; select a model with /model.');
    }
    return model;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('Agent has been disposed');
    }
  }

  async #resolveConfig(signal: AbortSignal): Promise<RunConfigSnapshot> {
    signal.throwIfAborted();
    const config = this.#settings.config;
    const [prompt, model] = await Promise.all([
      this.#loadPrompt(config.activePrompt, signal),
      this.#clients.getModel(config.activeModelId),
    ]);
    signal.throwIfAborted();
    const reasoningEffort =
      config.modelSettings[config.activeModelId]?.reasoningEffort;
    const requestedPrompt = config.activePrompt;
    const instructions = requestedPrompt !== undefined
      && prompt.missingPrompt === undefined
      ? prompt.content
      : this.instructions.length > 0
        ? this.instructions
        : prompt.content;
    return {
      model,
      instructions,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
  }

  async #loadPrompt(name: string | undefined, signal?: AbortSignal) {
    try {
      const prompt = await this.#prompts.loadSelected(name);
      signal?.throwIfAborted();
      if (
        prompt.missingPrompt
        && this.#missingPrompt !== prompt.missingPrompt
      ) {
        this.#notify(
          `Prompt "${prompt.missingPrompt}" is missing; using default.`,
          'warning',
        );
      }
      this.#missingPrompt = prompt.missingPrompt;
      return prompt;
    } finally {
      if (!signal?.aborted) {
        this.#reportPromptWarnings();
      }
    }
  }

  #reportPromptWarnings(): void {
    for (const warning of this.#prompts.warnings) {
      if (!this.#warnings.has(warning)) {
        this.#warnings.add(warning);
        this.#notify(warning, 'warning');
      }
    }
  }

  #notify(message: string, level: NoticeLevel): void {
    try {
      this.#onNotice(message, level);
    } catch {
      // Observers own their errors.
    }
  }
}
