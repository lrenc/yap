import { resolve } from 'node:path';
import { Session } from '../agent/session/session.ts';
import { readFileTool } from '../tools/files/read-file.ts';
import { readDirectoryTool } from '../tools/files/read-directory.ts';
import { ClientFactory } from './clients.ts';
import { executeCommand, isCommand } from './commands.ts';
import { models } from './models.ts';
import { PromptRepository } from './settings/prompts.ts';
import { FileSecretStore } from './settings/secrets.ts';
import { SettingsStore } from './settings/store.ts';

import type { AgentEvent } from '../agent/run/types.ts';
import type { RunConfigSnapshot } from '../agent/types.ts';
import type { AgentTool } from '../tools/types.ts';

export type AppPanel =
  | { type: 'model' }
  | { type: 'config'; modelId: string; providerId: string }
  | { type: 'prompt' };

export interface InitError {
  source: 'settings' | 'secrets';
  message: string;
}

export type AppEvent =
  | (AgentEvent & { runId: number; sessionId: number })
  | {
    type: 'user_message';
    content: string;
    runId: number;
    sessionId: number;
  }
  | {
    type: 'notice';
    level: 'info' | 'warning' | 'error';
    message: string;
  }
  | {
    type: 'panel';
    panel: AppPanel | null;
  }
  | {
    type: 'session_boundary';
    sessionId: number;
  }
  | {
    type: 'input_queue';
    pending: number;
    running: boolean;
    paused: boolean;
  };

export interface AppOptions {
  cwd?: string;
  settings?: SettingsStore;
  secrets?: FileSecretStore;
  prompts?: PromptRepository;
  tools?: AgentTool[];
}

export class App {
  readonly cwd: string;
  readonly settings: SettingsStore;
  readonly secrets: FileSecretStore;
  readonly prompts: PromptRepository;
  readonly #clients: ClientFactory;
  readonly #tools: AgentTool[];
  readonly #queue: string[] = [];
  readonly #listeners = new Set<(event: AppEvent) => void>();
  readonly #idleWaiters = new Set<() => void>();
  readonly #runTasks = new Set<Promise<void>>();
  readonly #warnings = new Set<string>();

  #errors: InitError[] = [];
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #session: Session | null = null;
  #sessionId: number | null = null;
  #nextSessionId = 0;
  #nextRunId = 0;

  #panel: AppPanel | null = null;
  #panelSaves = 0;
  #missingPrompt: string | null = null;
  #draining = false;
  #disposed = false;
  #generation = 0;

  constructor(options: AppOptions = {}) {
    this.cwd = resolve(options.cwd ?? process.cwd());
    this.secrets = options.secrets ?? new FileSecretStore();
    this.settings = options.settings ?? new SettingsStore();
    this.prompts = options.prompts ?? new PromptRepository();
    this.#clients = new ClientFactory(this.secrets);
    this.#tools = options.tools
      ? [...options.tools]
      : [
        readFileTool(this.cwd),
        readDirectoryTool(this.cwd),
      ];
  }

  get sessionId(): number | null {
    return this.#sessionId;
  }

  get running(): boolean {
    return this.#runTasks.size > 0;
  }

  get pendingCount(): number {
    return this.#queue.length;
  }

  get panel(): AppPanel | null {
    return this.#panel ? { ...this.#panel } : null;
  }

  get initErrors(): readonly InitError[] {
    return this.#errors.map(error => ({ ...error }));
  }

  subscribe(listener: (event: AppEvent) => void): () => void {
    if (!this.#disposed) {
      this.#listeners.add(listener);
    }
    return () => {
      this.#listeners.delete(listener);
    };
  }

  initialize(): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    if (this.#initializing) {
      return this.#initializing;
    }
    const sources: InitError['source'][] = this.#initialized
      ? this.#errors.map(error => error.source)
      : ['settings', 'secrets'];
    if (sources.length === 0) {
      return Promise.resolve();
    }
    this.#initializing = this.#load(sources).finally(() => {
      this.#initializing = null;
    });
    return this.#initializing;
  }

  submit(input: string): void {
    if (this.#disposed || !input.trim()) {
      return;
    }
    this.#queue.push(input);
    this.#emitQueue();
    this.#schedule();
  }

  closePanel(): void {
    if (!this.#panel) {
      return;
    }
    this.#panel = null;
    this.#emit({ type: 'panel', panel: null });
    this.#emitQueue();
    this.#schedule();
    this.#settleIdle();
  }

  trackPanelSave<T>(save: Promise<T>): Promise<T> {
    this.#panelSaves += 1;
    this.#emitQueue();
    const tracked = save.finally(() => {
      this.#panelSaves -= 1;
      this.#emitQueue();
      this.#schedule();
      this.#settleIdle();
    });
    void tracked.catch(() => {});
    return tracked;
  }

  notice(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    this.#emit({ type: 'notice', level, message });
  }

  reportPromptWarnings(): void {
    this.#reportWarnings(this.prompts.warnings);
  }

  whenIdle(): Promise<void> {
    if (this.#isIdle()) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.#idleWaiters.add(resolve);
    });
  }

  cancel(): void {
    this.#generation += 1;
    this.#queue.length = 0;
    this.#session?.cancel();
    this.closePanel();
    this.#emitQueue();
    this.#settleIdle();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.cancel();
    this.#listeners.clear();
    this.#settleIdle();
  }

  async #load(sources: InitError['source'][]): Promise<void> {
    const results = await Promise.allSettled(sources.map(source => {
      return Promise.resolve().then(() =>
        source === 'settings' ? this.settings.load() : this.secrets.load?.(),
      )
    }));
    this.#initialized = true;
    this.#errors = [];
    for (const [index, result] of results.entries()) {
      const source = sources[index]!;
      if (result.status === 'rejected') {
        const message = result.reason instanceof Error
          ? result.reason.message
          : `Cannot initialize ${source}.`;
        this.#errors.push({ source, message });
        this.notice(message, 'error');
      }
    }
    this.#reportWarnings(this.settings.warnings);
    this.#reportWarnings(this.secrets.warnings ?? []);
    if (
      !this.#disposed
      && sources.includes('settings')
      && !this.#errors.some(error => error.source === 'settings')
    ) {
      try {
        await this.#loadPrompt(this.settings.config.activePrompt);
      } catch (error) {
        this.notice(
          error instanceof Error
            ? error.message
            : 'Cannot read the selected Prompt.',
          'error',
        );
      }
    }
  }

  #schedule(): void {
    if (
      this.#disposed
      || this.#draining
      || this.#panel
      || this.#panelSaves
      || !this.#queue.length
    ) {
      return;
    }
    this.#draining = true;
    void Promise.resolve().then(() => this.#drain());
  }

  async #drain(): Promise<void> {
    try {
      while (
        !this.#disposed
        && !this.#panel
        && !this.#panelSaves
        && this.#queue.length
      ) {
        await this.initialize();
        if (this.#disposed || this.#panel || this.#panelSaves) {
          break;
        }
        const input = this.#queue.shift();
        if (input === undefined) {
          break;
        }
        if (isCommand(input)) {
          this.#emitQueue();
          const generation = this.#generation;
          await this.#waitForRuns();
          if (this.#disposed || generation !== this.#generation) {
            break;
          }
          await this.#command(input);
        } else {
          this.#startRun(input);
        }
      }
    } catch (error) {
      this.notice(
        error instanceof Error ? error.message : 'Cannot process input.',
        'error',
      );
    } finally {
      this.#draining = false;
      this.#emitQueue();
      this.#schedule();
      this.#settleIdle();
    }
  }

  async #command(input: string): Promise<void> {
    const generation = this.#generation;
    const result = await executeCommand(input, this);
    if (this.#disposed || generation !== this.#generation) {
      return;
    }
    this.reportPromptWarnings();
    if (result.type === 'notice') {
      this.#emit(result);
    } else if (result.type === 'new_session' && this.#sessionId !== null) {
      const sessionId = this.#sessionId;
      this.#session = null;
      this.#sessionId = null;
      this.#emit({
        type: 'session_boundary', sessionId,
      });
    } else if (result.type === 'panel_request') {
      if (result.panel === 'config') {
        const modelId = this.settings.config.activeModelId;
        const model = models.find(item => item.id === modelId);
        if (!model) {
          throw new Error(
            'Unknown model; select a model with /model.'
          );
        }
        this.#panel = {
          type: 'config',
          modelId,
          providerId: model.providerId,
        };
      } else {
        this.#panel = { type: result.panel };
      }
      this.#emit({ type: 'panel', panel: this.panel });
      this.#emitQueue();
    }
  }

  #startRun(input: string): void {
    this.#session ??= new Session({ tools: this.#tools }, {
      resolveRunConfig: signal => this.#resolveConfig(signal),
    });
    this.#sessionId ??= ++this.#nextSessionId;
    const sessionId = this.#sessionId;
    const runId = ++this.#nextRunId;
    const stream = this.#session.runStream(input);
    const task = this.#consumeRun(stream, input, runId, sessionId)
      .finally(() => {
        this.#runTasks.delete(task);
        this.#emitQueue();
        this.#settleIdle();
      });
    this.#runTasks.add(task);
    this.#emitQueue();
    void task.catch(() => {});
  }

  async #consumeRun(
    stream: AsyncIterableIterator<AgentEvent>,
    input: string,
    runId: number,
    sessionId: number,
  ): Promise<void> {
    try {
      this.#emit({
        type: 'user_message',
        content: input,
        runId,
        sessionId,
      });
      for await (const event of stream) {
        this.#emit({ ...event, runId, sessionId });
      }
    } catch (error) {
      this.notice(
        error instanceof Error ? error.message : 'Cannot run the conversation.',
        'error',
      );
    }
  }

  async #waitForRuns(): Promise<void> {
    while (this.#runTasks.size > 0) {
      await Promise.allSettled([...this.#runTasks]);
    }
  }

  async #resolveConfig(signal: AbortSignal): Promise<RunConfigSnapshot> {
    signal.throwIfAborted();
    const config = this.settings.config;
    const [prompt, model] = await Promise.all([
      this.#loadPrompt(config.activePrompt, signal),
      this.#clients.getModel(config.activeModelId),
    ]);
    signal.throwIfAborted();
    const reasoningEffort =
      config.modelSettings[config.activeModelId]?.reasoningEffort;
    return {
      model,
      instructions: prompt.content,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
  }

  async #loadPrompt(name: string | null, signal?: AbortSignal) {
    try {
      const prompt = await this.prompts.loadSelected(name);
      signal?.throwIfAborted();
      if (
        prompt.missingPrompt
        && this.#missingPrompt !== prompt.missingPrompt
      ) {
        this.notice(
          `Prompt "${prompt.missingPrompt}" is missing; using default.`,
          'warning',
        );
      }
      this.#missingPrompt = prompt.missingPrompt;
      return prompt;
    } finally {
      if (!signal?.aborted) {
        this.reportPromptWarnings();
      }
    }
  }

  #reportWarnings(warnings: readonly string[]): void {
    for (const warning of warnings) {
      if (!this.#warnings.has(warning)) {
        this.#warnings.add(warning);
        this.notice(warning, 'warning');
      }
    }
  }

  #emitQueue(): void {
    this.#emit({
      type: 'input_queue',
      pending: this.#queue.length,
      running: this.running,
      paused: this.#panel !== null || this.#panelSaves > 0,
    });
  }

  #emit(event: AppEvent): void {
    if (this.#disposed) {
      return;
    }
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Observers own their errors.
      }
    }
  }

  #isIdle(): boolean {
    return this.#disposed || (
      !this.#draining
      && !this.#queue.length
      && !this.#runTasks.size
      && !this.#panel
      && !this.#panelSaves
    );
  }

  #settleIdle(): void {
    if (!this.#isIdle()) {
      return;
    }
    for (const resolve of this.#idleWaiters) {
      resolve();
    }
    this.#idleWaiters.clear();
  }
}
