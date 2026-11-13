import { homedir } from 'node:os';
import { join } from 'node:path';
import { readJson, writeJson } from '../../utils/json.ts';
import { ensureDirectory, repairPermissions } from './permissions.ts';
import { providerSecretsSchema, type ProviderSecrets } from './schema.ts';

export interface SecretStore {
  getApiKey(providerId: string): Promise<string | undefined>;
  setApiKey(providerId: string, apiKey: string): Promise<void>;
  clearApiKey(providerId: string): Promise<void>;
}

export class FileSecretStore implements SecretStore {
  readonly filePath: string;
  #current: ProviderSecrets | undefined;
  #warningMessages: string[] = [];
  #pending: Promise<void> = Promise.resolve();

  constructor(readonly rootDirectory = join(homedir(), '.yap')) {
    this.filePath = join(rootDirectory, 'secrets.json');
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
      try {
        this.#current = await readJson(
          this.filePath,
          value => providerSecretsSchema.parse(value),
        ) ?? providerSecretsSchema.parse({});
      } catch (error) {
        throw new Error(
          `Cannot load secrets ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`,
          {
            cause: error,
          },
        );
      }
    });
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    const { providers } = this.#requireSecrets();
    return Object.hasOwn(providers, providerId)
      ? providers[providerId]?.apiKey
      : undefined;
  }

  setApiKey(providerId: string, apiKey: string): Promise<void> {
    return this.#enqueue(async () => {
      const secrets = this.#requireSecrets();
      const key = typeof apiKey === 'string' ? apiKey.trim() : '';
      if (!key) {
        throw new Error('API Key must not be empty');
      }
      await this.#save({
        ...secrets,
        providers: {
          ...secrets.providers,
          [providerId]: { apiKey: key },
        },
      });
    });
  }

  clearApiKey(providerId: string): Promise<void> {
    return this.#enqueue(async () => {
      const secrets = this.#requireSecrets();
      const providers = { ...secrets.providers };
      delete providers[providerId];
      await this.#save({ ...secrets, providers });
    });
  }

  #requireSecrets(): ProviderSecrets {
    if (!this.#current) {
      throw new Error(
        `Secrets must be loaded successfully before use: ${this.filePath}`
      );
    }
    return this.#current;
  }

  async #save(secrets: ProviderSecrets): Promise<void> {
    try {
      await ensureDirectory(this.rootDirectory);
      await writeJson(this.filePath, secrets, { mode: 0o600 });
    } catch (error) {
      throw new Error(`Cannot save secrets ${this.filePath}`, { cause: error });
    }
    this.#current = secrets;
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.#pending.then(operation);
    this.#pending = result.catch(() => {});
    return result;
  }
}
