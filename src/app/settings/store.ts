import { homedir } from 'node:os';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { readJson, writeJson } from '../../utils/json.ts';
import { models } from '../models.ts';
import { ensureDirectory, repairPermissions } from './permissions.ts';
import {
  parseConfig,
  promptNameSchema,
  validateReasoningEffort,
  type AppConfig,
} from './schema.ts';

function loadError(path: string, error: unknown): Error {
  let detail = 'cannot read file';
  if (error instanceof ZodError) {
    detail = error.issues.map(issue => {
      const field = issue.path[0];
      const location = field === 'modelSettings'
        ? 'modelSettings'
        : ['version', 'activeModelId', 'activePrompt'].includes(String(field))
          ? String(field)
          : 'config';
      return `${location}: ${issue.code}`;
    }).join('; ');
  } else if (
    error instanceof Error
    && error.message === `Invalid JSON in ${path}`
  ) {
    detail = 'invalid JSON';
  }
  return new Error(
    `Cannot load configuration ${path}: ${detail}`
  );
}

export class SettingsStore {
  readonly filePath: string;

  #current: AppConfig | undefined;
  #warningMessages: string[] = [];
  #pending: Promise<void> = Promise.resolve();

  constructor(readonly rootDirectory = join(homedir(), '.yap')) {
    this.filePath = join(rootDirectory, 'config.json');
  }

  get config(): AppConfig {
    return structuredClone(this.#requireConfig());
  }

  get warnings(): readonly string[] {
    return [...this.#warningMessages];
  }

  load(): Promise<void> {
    return this.#enqueue(async () => {
      this.#current = undefined;
      this.#warningMessages = [];
      this.#warningMessages = [
        await repairPermissions(this.rootDirectory, 0o700),
        await repairPermissions(this.filePath, 0o600),
      ].filter(message => message !== undefined);
      let parsed: ReturnType<typeof parseConfig>;
      try {
        parsed = await readJson(this.filePath, parseConfig) ?? parseConfig({});
      } catch (error) {
        throw loadError(this.filePath, error);
      }
      this.#current = parsed.config;
      if (parsed.needsRepair) {
        try {
          await this.#persist(parsed.config);
        } catch { }
      }
    });
  }

  setModel(modelId: string): Promise<void> {
    return this.#enqueue(async () => {
      const config = this.#requireConfig();
      if (!models.some(model => model.id === modelId)) {
        throw new Error(`Unknown model ID: ${modelId}`);
      }
      await this.#save({
        ...config,
        activeModelId: modelId,
      });
    });
  }

  setReasoningEffort(
    modelId: string,
    effort: string | undefined,
  ): Promise<void> {
    return this.#enqueue(async () => {
      const config = this.#requireConfig();
      validateReasoningEffort(modelId, effort);
      const settings = {
        ...config.modelSettings[modelId]
      };
      if (effort === undefined) {
        delete settings.reasoningEffort;
      } else {
        settings.reasoningEffort = effort;
      }
      await this.#save({
        ...config,
        modelSettings: {
          ...config.modelSettings,
          [modelId]: settings,
        },
      });
    });
  }

  setActivePrompt(name: string | null): Promise<void> {
    return this.#enqueue(async () => {
      const config = this.#requireConfig();
      if (name !== null && !promptNameSchema.safeParse(name).success) {
        throw new Error('Invalid Prompt name');
      }
      await this.#save({
        ...config,
        activePrompt: name,
      });
    });
  }

  #requireConfig(): AppConfig {
    if (!this.#current) {
      throw new Error(
        `Configuration must be loaded successfully before use: ${this.filePath}`
      );
    }
    return this.#current;
  }

  async #persist(config: AppConfig): Promise<void> {
    await ensureDirectory(this.rootDirectory);
    await writeJson(this.filePath, config, { mode: 0o600 });
  }

  async #save(config: AppConfig): Promise<void> {
    try {
      await this.#persist(config);
    } catch {
      throw new Error(`Cannot save configuration ${this.filePath}`);
    }
    this.#current = config;
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#pending.then(operation);
    this.#pending = result.catch(() => {});
    return result;
  }
}
