import { createClient } from '../model/provider/openai/client.ts';
import type { OpenAIClient } from '../model/provider/openai/types.ts';
import type { AgentModel } from '../model/types.ts';
import { models } from './models.ts';
import { providers } from './providers.ts';
import type { SecretStore } from './settings/secrets.ts';
import type { Model, Provider } from './types.ts';

export class ClientFactory {
  readonly #secrets: SecretStore;
  readonly #models: readonly Model[];
  readonly #providers: readonly Provider[];
  readonly #createClient: typeof createClient;
  readonly #clients = new Map<
    string,
    { key: string; client: OpenAIClient }
  >();

  constructor(
    secrets: SecretStore,
    options: {
      models?: readonly Model[];
      providers?: readonly Provider[];
      createClient?: typeof createClient;
    } = {},
  ) {
    this.#secrets = secrets;
    this.#models = options.models ?? models;
    this.#providers = options.providers ?? providers;
    this.#createClient = options.createClient ?? createClient;
  }

  async getClient(providerId: string): Promise<OpenAIClient> {
    const provider = this.#providers.find(item => item.id === providerId);
    if (!provider) {
      throw new Error('Unknown Provider; check the model configuration.');
    }

    let key: string | undefined;
    try {
      key = (await this.#secrets.getApiKey(provider.id))?.trim();
    } catch (error) {
      this.#clients.delete(provider.id);
      throw error;
    }
    if (!key) {
      this.#clients.delete(provider.id);
      throw new Error(
        `Missing API Key for ${provider.name}. Set it with /config.`
      );
    }

    const cached = this.#clients.get(provider.id);
    if (cached?.key === key) {
      return cached.client;
    }

    // Existing Runs retain their captured client; new Runs must use this key.
    this.#clients.delete(provider.id);
    const client = this.#createClient({
      apiKey: key,
      baseURL: provider.baseURL,
    });
    this.#clients.set(provider.id, { key, client });
    return client;
  }

  async getModel(modelId: string): Promise<AgentModel> {
    const model = this.#models.find(item => item.id === modelId);
    if (!model) {
      throw new Error('Unknown model; select a model with /model.');
    }
    return {
      id: model.id,
      contextWindow: model.contextWindow,
      params: structuredClone(model.params),
      ...(model.reasoningEfforts === undefined
        ? {}
        : { reasoningEfforts: [...model.reasoningEfforts] }),
      client: await this.getClient(model.providerId),
    };
  }
}
