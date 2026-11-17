import { z } from 'zod';
import { models } from '../models.ts';
import type { Model } from '../types.ts';

const DEFAULT_MODEL_ID = firstModelId(models);
export const DEFAULT_PROMPT = `
You are YAP, a terminal AI assistant.
Help the user complete tasks carefully. Use tools when they improve accuracy and verify relevant results.
Be concise, state uncertainty and failures clearly, and never claim work you did not do.
`.trim();

function firstModelId(catalog: readonly Model[]): string {
  const model = catalog[0];
  if (!model) {
    throw new Error('At least one model is required');
  }
  return model.id;
}

const invalidFileNameChars = /[<>:"/\\|?*\p{Cc}]/u;
const windowsReservedName =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

function isValidPromptName(name: string): boolean {
  const length = Array.from(name).length;

  return (
    length >= 1
    && length <= 16
    && name !== 'default'
    && name !== '.'
    && name !== '..'
    && !name.endsWith('.')
    && !name.endsWith(' ')
    && !invalidFileNameChars.test(name)
    && !windowsReservedName.test(name)
  );
}

export const promptNameSchema = z.string().refine(
  isValidPromptName,
  'Invalid Prompt name',
);

const modelSettingsSchema = z.looseObject({
  reasoningEffort: z.string().optional(),
});

const appConfigSchema = z.strictObject({
  version: z.literal(1).default(1),
  activeModelId: z.string().default(DEFAULT_MODEL_ID),
  modelSettings: z.record(z.string(), modelSettingsSchema).default({}),
  activePrompt: promptNameSchema
    .nullable()
    .transform(value => value ?? undefined)
    .optional(),
});

export const providerSecretsSchema = z.strictObject({
  version: z.literal(1).default(1),
  providers: z.record(z.string(), z.strictObject({
    apiKey: z.string().trim().min(1, 'API Key must not be empty'),
  })).default({}),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type ProviderSecrets = z.infer<typeof providerSecretsSchema>;

function resolveModelId(
  modelId: string,
  catalog: readonly Model[] = models,
): { modelId: string; needsRepair: boolean } {
  const fallback = firstModelId(catalog);
  const resolved = catalog.some(model => model.id === modelId)
    ? modelId : fallback;
  return {
    modelId: resolved,
    needsRepair: resolved !== modelId,
  };
}

export function parseConfig(value: unknown): {
  config: AppConfig;
  needsRepair: boolean;
} {
  const config = appConfigSchema.parse(value);
  const { modelId, needsRepair } = resolveModelId(config.activeModelId);
  config.activeModelId = modelId;
  return {
    config,
    needsRepair,
  };
}

export function validateReasoningEffort(
  modelId: string,
  effort: string | undefined,
): void {
  const model = models.find(model => model.id === modelId);
  if (!model) {
    throw new Error(
      `Unknown model ID: ${modelId}`
    );
  }
  if (
    effort !== undefined
    && !model.reasoningEfforts?.includes(effort)
  ) {
    throw new Error(
      `Unsupported reasoning effort for model ${modelId}`
    );
  }
}
