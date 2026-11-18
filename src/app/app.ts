import { resolve } from 'node:path';
import { Session } from '../agent/session/session.ts';
import { readFileTool } from '../tools/files/read-file.ts';
import { readDirectoryTool } from '../tools/files/read-directory.ts';
import { ClientFactory } from './clients.ts';
import { executeCommand, isCommand } from './commands.ts';
import { requireModel } from './models.ts';
import { nextCommandIndex } from './queue.ts';
import { PromptRepository } from './settings/prompts.ts';
import { FileSecretStore } from './settings/secrets.ts';
import type { AppConfig } from './settings/schema.ts';
import { SettingsStore } from './settings/store.ts';

import type { AgentEvent } from '../agent/run/types.ts';
import type { RunConfigSnapshot } from '../agent/types.ts';
import type { AgentTool } from '../tools/types.ts';
import type {
  AdmissionResult,
  QueueBlock,
  RunAdmission,
} from './queue.ts';

export type AppPanel =
  | { type: 'model' }
  | { type: 'config'; modelId: string; providerId: string }
  | { type: 'prompt' };

export interface InitError {
  source: 'settings' | 'secrets';
  message: string;
}

export type ConfigChange =
  | 'model'
  | 'reasoningEffort'
  | 'prompt'
  | 'apiKey';

export type AppEvent =
  | (AgentEvent & { runId: number; sessionId: number })
  | {
    type: 'userMessage';
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
    type: 'sessionBoundary';
    sessionId: number;
  }
  | {
    type: 'configChanged';
    change: ConfigChange;
  }
  | {
    type: 'inputQueue';
    pending: number;
    paused: boolean;
    blocked: QueueBlock | null;
  };

export interface AppOptions {
  cwd?: string;
  settings?: SettingsStore;
  secrets?: FileSecretStore;
  prompts?: PromptRepository;
  tools?: AgentTool[];
  admitRun?: RunAdmission;
}

interface InputQueueState {
  pending: number;
  paused: boolean;
  blocked: QueueBlock | null;
}

export class App {
  readonly cwd: string;
  readonly secrets: FileSecretStore;
  readonly prompts: PromptRepository;
  readonly #settings: SettingsStore;
  readonly #clients: ClientFactory;
  readonly #tools: AgentTool[];
  readonly #admitRun: RunAdmission;
  readonly #inputQueue: string[] = [];
  readonly #listeners = new Set<(event: AppEvent) => void>();
  readonly #idleWaiters = new Set<() => void>();
  readonly #runTasks = new Set<Promise<void>>();
  readonly #warnings = new Set<string>();

  #config: AppConfig | null = null;
  #errors: InitError[] = [];
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #session: Session | null = null;
  #sessionId: number | undefined;
  #nextSessionId = 0;
  #nextRunId = 0;

  #panel: AppPanel | null = null;
  #panelSaves = 0;
  #blocked: QueueBlock | null = null;
  #recheckPending = false;
  #admissionController: AbortController | null = null;
  #missingPrompt: string | undefined;
  #draining = false;
  #disposed = false;
  #generation = 0;
  #lastQueueState: InputQueueState | undefined;

  constructor(options: AppOptions = {}) {
    this.cwd = resolve(options.cwd ?? process.cwd());
    this.secrets = options.secrets ?? new FileSecretStore();
    this.#settings = options.settings ?? new SettingsStore();
    this.prompts = options.prompts ?? new PromptRepository();
    this.#admitRun = options.admitRun ?? (() => this.#checkApiKeyAdmission());
    this.#clients = new ClientFactory(this.secrets);
    this.#tools = options.tools
      ? [...options.tools]
      : [
        readFileTool(this.cwd),
        readDirectoryTool(this.cwd),
      ];
  }

  get pendingCount(): number {
    return this.#inputQueue.length;
  }

  setModel(modelId: string): Promise<void> {
    return this.#updateConfig('model', () =>
      this.#settings.setModel(modelId));
  }

  setReasoningEffort(
    modelId: string,
    effort: string | undefined,
  ): Promise<void> {
    return this.#updateConfig('reasoningEffort', () =>
      this.#settings.setReasoningEffort(modelId, effort));
  }

  setActivePrompt(name: string | undefined): Promise<void> {
    return this.#updateConfig('prompt', () =>
      this.#settings.setActivePrompt(name));
  }

  createPrompt(name: string, content: string): Promise<void> {
    return this.#updateConfig('prompt', () =>
      this.prompts.create(name, content));
  }

  updatePrompt(name: string, content: string): Promise<void> {
    return this.#updateConfig('prompt', () =>
      this.prompts.update(name, content));
  }

  deletePrompt(name: string): Promise<void> {
    return this.#updateConfig('prompt', () => this.prompts.delete(name));
  }

  setApiKey(providerId: string, apiKey: string): Promise<void> {
    return this.#updateConfig('apiKey', () =>
      this.secrets.setApiKey(providerId, apiKey));
  }

  clearApiKey(providerId: string): Promise<void> {
    return this.#updateConfig('apiKey', () =>
      this.secrets.clearApiKey(providerId));
  }

  get panel(): AppPanel | null {
    return this.#panel ? { ...this.#panel } : null;
  }

  get config(): AppConfig | null {
    return this.#config;
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
    this.#inputQueue.push(input);
    this.#notifyQueue();
  }

  closePanel(): void {
    if (!this.#panel) {
      return;
    }
    this.#updatePanel(null, true);
  }

  trackPanelSave<T>(save: Promise<T>): Promise<T> {
    this.#panelSaves += 1;
    this.#notifyQueue();
    const tracked = save.finally(() => {
      this.#panelSaves -= 1;
      this.#recheckQueue();
    });
    void tracked.catch(() => {});
    return tracked;
  }

  #notice(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
  ): void {
    this.#emit({ type: 'notice', level, message });
  }

  #reportPromptWarnings(): void {
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
    this.#inputQueue.length = 0;
    this.#blocked = null;
    this.#recheckPending = false;
    this.#admissionController?.abort();
    this.#admissionController = null;
    this.#session?.cancel();
    this.closePanel();
    this.#notifyQueue({ settle: true });
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
    if (sources.includes('settings')) {
      this.#config = null;
    }
    const results = await Promise.allSettled(sources.map(source => {
      return Promise.resolve().then(() =>
        source === 'settings' ? this.#settings.load() : this.secrets.load?.(),
      )
    }));
    this.#initialized = true;
    this.#errors = [];
    const settingsIndex = sources.indexOf('settings');
    if (
      settingsIndex >= 0
      && results[settingsIndex]?.status === 'fulfilled'
    ) {
      this.#config = this.#readConfig();
    }
    for (const [index, result] of results.entries()) {
      const source = sources[index]!;
      if (result.status === 'rejected') {
        const message = result.reason instanceof Error
          ? result.reason.message
          : `Cannot initialize ${source}.`;
        this.#errors.push({ source, message });
        this.#notice(message, 'error');
      }
    }
    this.#reportWarnings(this.#settings.warnings);
    this.#reportWarnings(this.secrets.warnings ?? []);
    if (
      !this.#disposed
      && sources.includes('settings')
      && !this.#errors.some(error => error.source === 'settings')
    ) {
      try {
        await this.#loadPrompt(this.#config?.activePrompt);
      } catch (error) {
        this.#notice(
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
      || !this.#inputQueue.length
      || this.#draining
      || this.#panel
      || this.#panelSaves
      || (
        !this.#recheckPending
        && this.#blocked !== null
        && nextCommandIndex(this.#inputQueue, this.#blocked) < 0
      )
    ) {
      return;
    }
    this.#draining = true;
    void Promise.resolve().then(() => this.#drain());
  }

  #recheckQueue(): void {
    this.#notifyQueue({ recheck: true, force: true, settle: true });
  }

  async #updateConfig(
    change: ConfigChange,
    update: () => Promise<void>,
  ): Promise<void> {
    await update();
    this.#config = this.#readConfig();
    this.#configChanged(change);
  }

  #readConfig(): AppConfig | null {
    try {
      return this.#settings.config;
    } catch {
      return null;
    }
  }

  #configChanged(change: ConfigChange): void {
    this.#emit({
      type: 'configChanged',
      change,
    });
    this.#recheckQueue();
  }

  #notifyQueue(options: {
    recheck?: boolean;
    force?: boolean;
    settle?: boolean;
  } = {}): void {
    if (options.recheck) {
      this.#recheckPending = this.#inputQueue.length > 0;
    }
    this.#emitQueue(options.force);
    this.#schedule();
    if (options.settle) {
      this.#settleIdle();
    }
  }

  #updatePanel(panel: AppPanel | null, settle = false): void {
    this.#panel = panel;
    this.#emit({ type: 'panel', panel: this.panel });
    this.#notifyQueue({ settle });
  }

  async #drain(): Promise<void> {
    try {
      while (
        !this.#disposed
        && !this.#panel
        && !this.#panelSaves
        && this.#inputQueue.length
      ) {
        await this.initialize();
        if (this.#disposed || this.#panel || this.#panelSaves) {
          break;
        }
        const input = this.#inputQueue[0];
        if (input === undefined) {
          break;
        }
        if (isCommand(input)) {
          this.#inputQueue.shift();
          if (!(await this.#drainCommand(input))) {
            break;
          }
          continue;
        }

        if (!(await this.#drainMessage(input))) {
          break;
        }
      }
    } catch (error) {
      this.#notice(
        error instanceof Error ? error.message : 'Cannot process input.',
        'error',
      );
    } finally {
      this.#draining = false;
      if (!this.#inputQueue.length) {
        this.#recheckPending = false;
      }
      this.#notifyQueue({ settle: true });
    }
  }

  async #drainMessage(input: string): Promise<boolean> {
    const generation = this.#generation;
    this.#recheckPending = false;
    const admission = await this.#runAdmission(input);
    if (
      this.#disposed
      || generation !== this.#generation
      || this.#panel
      || this.#panelSaves
    ) {
      return false;
    }
    if (admission.type === 'blocked') {
      return this.#drainBlocked(admission.block);
    }
    if (admission.type === 'rejected') {
      this.#rejectAdmission(admission.error);
      return true;
    }
    this.#acceptRun(input);
    return true;
  }

  async #drainBlocked(block: QueueBlock): Promise<boolean> {
    this.#blocked = block;
    this.#emitQueue();
    const commandIndex = nextCommandIndex(
      this.#inputQueue,
      block,
    );
    if (commandIndex < 0) {
      return false;
    }
    const [command] = this.#inputQueue.splice(commandIndex, 1);
    if (command === undefined) {
      return false;
    }
    return this.#drainCommand(command);
  }

  #rejectAdmission(error: unknown): void {
    this.#inputQueue.shift();
    this.#blocked = null;
    this.#emitQueue();
    this.#notice(
      error instanceof Error
        ? error.message
        : 'Cannot start the conversation.',
      'error',
    );
  }

  #acceptRun(input: string): void {
    this.#inputQueue.shift();
    this.#blocked = null;
    this.#emitQueue();
    this.#startRun(input);
  }

  async #runAdmission(input: string): Promise<AdmissionResult> {
    this.#admissionController?.abort();
    const controller = new AbortController();
    this.#admissionController = controller;
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([
        Promise.resolve(this.#admitRun({
          input,
          signal: controller.signal,
        })),
        aborted,
      ]);
    } catch (error) {
      return { type: 'rejected', error };
    } finally {
      controller.signal.removeEventListener('abort', onAbort);
      if (this.#admissionController === controller) {
        this.#admissionController = null;
      }
    }
  }

  async #drainCommand(input: string): Promise<boolean> {
    this.#emitQueue();
    const generation = this.#generation;
    await this.#waitForRuns();
    if (this.#disposed || generation !== this.#generation) {
      return false;
    }
    await this.#command(input);
    return true;
  }

  async #command(input: string): Promise<void> {
    const generation = this.#generation;
    const result = await executeCommand(input, {
      settings: {
        setModel: modelId => this.setModel(modelId),
        setActivePrompt: name => this.setActivePrompt(name),
      },
      prompts: this.prompts,
    });
    if (this.#disposed || generation !== this.#generation) {
      return;
    }
    this.#applyCommandResult(result);
  }

  #applyCommandResult(
    result: Awaited<ReturnType<typeof executeCommand>>,
  ): void {
    this.#reportPromptWarnings();
    if (result.type === 'notice') {
      this.#emit(result);
    } else if (result.type === 'newSession' && this.#sessionId !== undefined) {
      const sessionId = this.#sessionId;
      this.#session = null;
      this.#sessionId = undefined;
      this.#emit({
        type: 'sessionBoundary', sessionId,
      });
    } else if (result.type === 'panelRequest') {
      let panel: AppPanel;
      if (result.panel === 'config') {
        const modelId = this.#settings.config.activeModelId;
        const model = requireModel(modelId);
        panel = {
          type: 'config',
          modelId,
          providerId: model.providerId,
        };
      } else {
        panel = { type: result.panel };
      }
      this.#updatePanel(panel);
    }
  }

  async #checkApiKeyAdmission(): Promise<AdmissionResult> {
    const modelId = this.#settings.config.activeModelId;
    try {
      const model = requireModel(modelId);
      const key = await this.secrets.getApiKey(model.providerId);
      if (!key) {
        return {
          type: 'blocked',
          block: {
            type: 'missingApiKey',
            message: 'waiting for API key',
          },
        };
      }
    } catch (error) {
      return { type: 'rejected', error };
    }
    return { type: 'ready' };
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
    let finished = false;
    try {
      this.#emit({
        type: 'userMessage',
        content: input,
        runId,
        sessionId,
      });
      for await (const event of stream) {
        if (event.type === 'done') {
          finished = true;
        }
        this.#emit({ ...event, runId, sessionId });
      }
      if (!finished) {
        throw new Error('Conversation ended without a result.');
      }
    } catch (error) {
      if (!finished) {
        this.#emit({
          type: 'done',
          result: {
            stopReason: 'error',
            response: null,
            turns: 0,
            error: error instanceof Error
              ? error
              : new Error('Cannot run the conversation.'),
          },
          runId,
          sessionId,
        });
      }
    }
  }

  async #waitForRuns(): Promise<void> {
    while (this.#runTasks.size > 0) {
      await Promise.allSettled([...this.#runTasks]);
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
    return {
      model,
      instructions: prompt.content,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
  }

  async #loadPrompt(name: string | undefined, signal?: AbortSignal) {
    try {
      const prompt = await this.prompts.loadSelected(name);
      signal?.throwIfAborted();
      if (
        prompt.missingPrompt
        && this.#missingPrompt !== prompt.missingPrompt
      ) {
        this.#notice(
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

  #reportWarnings(warnings: readonly string[]): void {
    for (const warning of warnings) {
      if (!this.#warnings.has(warning)) {
        this.#warnings.add(warning);
        this.#notice(warning, 'warning');
      }
    }
  }

  #emitQueue(force = false): void {
    const next: InputQueueState = {
      pending: this.#inputQueue.length,
      paused: this.#panel !== null || this.#panelSaves > 0,
      blocked: this.#blocked === null ? null : { ...this.#blocked },
    };
    const previous = this.#lastQueueState;
    if (
      !force
      && previous !== undefined
      && previous.pending === next.pending
      && previous.paused === next.paused
      && previous.blocked?.type === next.blocked?.type
      && previous.blocked?.message === next.blocked?.message
    ) {
      return;
    }
    this.#lastQueueState = next;
    this.#emit({
      type: 'inputQueue',
      ...next,
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

  #hasRunnableInput(): boolean {
    if (!this.#inputQueue.length) {
      return false;
    }
    return this.#blocked === null
      || nextCommandIndex(this.#inputQueue, this.#blocked) >= 0;
  }

  #isIdle(): boolean {
    return this.#disposed || (
      !this.#draining
      && !this.#hasRunnableInput()
      && !this.#recheckPending
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
