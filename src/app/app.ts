import { resolve } from 'node:path';
import { Agent } from '../agent/agent.ts';
import type { AgentRuntimeConfig } from '../agent/ports.ts';
import { FileSecretStore } from '../agent/settings/secrets.ts';
import { PromptRepository } from '../agent/settings/prompts.ts';
import { SettingsStore } from '../agent/settings/store.ts';
import { executeCommand, isCommand } from './commands.ts';
import { nextCommandIndex } from './queue.ts';

import type {
  AdmissionResult,
  QueueBlock,
  RunAdmission,
} from '../agent/admission.ts';
import type { AgentEvent } from '../agent/run/types.ts';
import type { AgentTool } from '../tools/types.ts';

export type AppPanel =
  | { type: 'model' }
  | { type: 'config'; modelId: string; providerId: string }
  | { type: 'prompt' };

export interface InitError {
  source: 'settings' | 'secrets';
  message: string;
}

export interface QueuedMessage {
  id: number;
  content: string;
}

type ConfigChange =
  | 'model'
  | 'reasoningEffort'
  | 'prompt'
  | 'apiKey';

export type AppEvent =
  | (AgentEvent & { runId: number; sessionId: number })
  | {
    type: 'userMessage';
    queueId: number;
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
    type: 'initErrors';
    errors: readonly InitError[];
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
    blocked: QueueBlock | null;
    messages: readonly QueuedMessage[];
  };

interface AppOptions {
  cwd?: string;
  settings?: SettingsStore;
  secrets?: FileSecretStore;
  prompts?: PromptRepository;
  tools?: AgentTool[] | undefined;
  admitRun?: RunAdmission | undefined;
}

interface InputQueueState {
  pending: number;
  blocked: QueueBlock | null;
  messages: readonly QueuedMessage[];
}

interface QueuedInput {
  id: number;
  input: string;
}

export class App {
  readonly cwd: string;
  readonly #agent: Agent;
  readonly #admitRun: RunAdmission;
  readonly #inputQueue: QueuedInput[] = [];
  readonly #listeners = new Set<(event: AppEvent) => void>();
  readonly #idleWaiters = new Set<() => void>();
  readonly #runTasks = new Set<Promise<void>>();
  readonly #warnings = new Set<string>();

  #errors: InitError[] = [];
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #nextInputId = 0;

  #panel: AppPanel | null = null;
  #panelSaves = 0;
  #blocked: QueueBlock | null = null;
  #recheckPending = false;
  #admissionController: AbortController | null = null;
  #draining = false;
  #disposed = false;
  #generation = 0;
  #lastQueueState: InputQueueState | undefined;

  constructor(options: AppOptions = {}) {
    this.cwd = resolve(options.cwd ?? process.cwd());
    const secrets = options.secrets ?? new FileSecretStore();
    const settings = options.settings ?? new SettingsStore();
    const prompts = options.prompts ?? new PromptRepository();
    this.#agent = new Agent({
      cwd: this.cwd,
      settings,
      secrets,
      prompts,
      tools: options.tools,
      onNotice: (message, level) => this.#notice(message, level),
    });
    this.#admitRun = options.admitRun
      ?? (context => this.#agent.admit(context));
  }

  get pendingCount(): number {
    return this.#inputQueue.length;
  }

  get models() {
    return this.#agent.models;
  }

  get currentModel() {
    return this.#agent.currentModel;
  }

  setModel(modelId: string): Promise<void> {
    return this.#updateConfig('model', () =>
      this.#agent.setModel(modelId));
  }

  setReasoningEffort(
    modelId: string,
    effort: string | undefined,
  ): Promise<void> {
    return this.#updateConfig('reasoningEffort', () =>
      this.#agent.setReasoningEffort(modelId, effort));
  }

  setActivePrompt(name: string | undefined): Promise<void> {
    return this.#updateConfig('prompt', () =>
      this.#agent.setActivePrompt(name));
  }

  createPrompt(name: string, content: string): Promise<void> {
    return this.#updateConfig('prompt', () =>
      this.#agent.createPrompt(name, content));
  }

  updatePrompt(name: string, content: string): Promise<void> {
    return this.#updateConfig('prompt', () =>
      this.#agent.updatePrompt(name, content));
  }

  deletePrompt(name: string): Promise<void> {
    return this.#updateConfig('prompt', () => this.#agent.deletePrompt(name));
  }

  listPrompts(): Promise<string[]> {
    return this.#agent.listPrompts();
  }

  readPrompt(name: string): Promise<string | undefined> {
    return this.#agent.readPrompt(name);
  }

  hasApiKey(providerId: string): Promise<boolean> {
    return this.#agent.hasApiKey(providerId);
  }

  setApiKey(providerId: string, apiKey: string): Promise<void> {
    return this.#updateConfig('apiKey', () =>
      this.#agent.setApiKey(providerId, apiKey));
  }

  clearApiKey(providerId: string): Promise<void> {
    return this.#updateConfig('apiKey', () =>
      this.#agent.clearApiKey(providerId));
  }

  get panel(): AppPanel | null {
    return this.#panel ? { ...this.#panel } : null;
  }

  get config(): AgentRuntimeConfig | null {
    return this.#agent.config;
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
    this.#inputQueue.push({
      id: ++this.#nextInputId,
      input,
    });
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
    this.#agent.reportPromptWarnings();
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
    this.#agent.cancel();
    this.closePanel();
    this.#notifyQueue({ settle: true });
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.cancel();
    this.#agent.dispose();
    this.#listeners.clear();
    this.#settleIdle();
  }

  async #load(sources: InitError['source'][]): Promise<void> {
    const results = await Promise.allSettled(sources.map(source => {
      return Promise.resolve().then(() =>
        source === 'settings'
          ? this.#agent.loadSettings()
          : this.#agent.loadSecrets(),
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
      }
    }
    this.#emit({
      type: 'initErrors',
      errors: this.#errors.map(error => ({ ...error })),
    });
    this.#reportWarnings(this.#agent.settingsWarnings);
    this.#reportWarnings(this.#agent.secretWarnings);
    if (
      !this.#disposed
      && sources.includes('settings')
      && !this.#errors.some(error => error.source === 'settings')
    ) {
      try {
        await this.#agent.prepare();
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
        && this.#nextCommandIndex(this.#blocked) < 0
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
    this.#configChanged(change);
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
        const item = this.#inputQueue[0];
        if (item === undefined) {
          break;
        }
        if (isCommand(item.input)) {
          this.#inputQueue.shift();
          if (!(await this.#drainCommand(item.input))) {
            break;
          }
          continue;
        }

        if (!(await this.#drainMessage(item))) {
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

  async #drainMessage(item: QueuedInput): Promise<boolean> {
    const generation = this.#generation;
    this.#recheckPending = false;
    const admission = await this.#runAdmission(item.input);
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
    this.#acceptRun(item);
    return true;
  }

  async #drainBlocked(block: QueueBlock): Promise<boolean> {
    this.#blocked = block;
    this.#emitQueue();
    const commandIndex = this.#nextCommandIndex(block);
    if (commandIndex < 0) {
      return false;
    }
    const [command] = this.#inputQueue.splice(commandIndex, 1);
    if (command === undefined) {
      return false;
    }
    return this.#drainCommand(command.input);
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

  #acceptRun(item: QueuedInput): void {
    this.#inputQueue.shift();
    this.#blocked = null;
    this.#startRun(item.input, item.id);
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
      models: this.#agent.models,
      settings: {
        setModel: modelId => this.setModel(modelId),
        setActivePrompt: name => this.setActivePrompt(name),
      },
      prompts: {
        read: name => this.#agent.readPrompt(name),
      },
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
    } else if (result.type === 'newSession') {
      const sessionId = this.#agent.newSession();
      if (sessionId !== undefined) {
        this.#emit({
          type: 'sessionBoundary', sessionId,
        });
      }
    } else if (result.type === 'panelRequest') {
      let panel: AppPanel;
      if (result.panel === 'config') {
        const model = this.#agent.currentModel;
        if (!model) {
          this.#notice('Unknown model; select a model with /model.', 'error');
          return;
        }
        panel = {
          type: 'config',
          modelId: model.id,
          providerId: model.providerId,
        };
      } else {
        panel = { type: result.panel };
      }
      this.#updatePanel(panel);
    }
  }

  #startRun(input: string, queueId: number): void {
    const run = this.#agent.runStream(input);
    const task = this.#consumeRun(
      run.stream,
      input,
      run.runId,
      run.sessionId,
      queueId,
    )
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
    queueId: number,
  ): Promise<void> {
    let finished = false;
    try {
      this.#emit({
        type: 'userMessage',
        queueId,
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
      blocked: this.#blocked === null ? null : { ...this.#blocked },
      messages: this.#inputQueue
        .filter(item => !isCommand(item.input))
        .map(item => ({
          id: item.id,
          content: item.input,
        })),
    };
    const previous = this.#lastQueueState;
    if (
      !force
      && previous !== undefined
      && previous.pending === next.pending
      && previous.blocked?.type === next.blocked?.type
      && previous.blocked?.message === next.blocked?.message
      && sameQueuedMessages(previous.messages, next.messages)
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
      || this.#nextCommandIndex(this.#blocked) >= 0;
  }

  #nextCommandIndex(block: QueueBlock): number {
    return nextCommandIndex(
      this.#inputQueue.map(item => item.input),
      block,
    );
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

function sameQueuedMessages(
  previous: readonly QueuedMessage[],
  next: readonly QueuedMessage[],
): boolean {
  return previous.length === next.length && previous.every((
    message,
    index,
  ) => {
    const candidate = next[index];
    return candidate?.id === message.id
      && candidate.content === message.content;
  });
}
