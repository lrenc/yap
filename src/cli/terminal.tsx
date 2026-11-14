import { useState } from 'react';
import { Static, Box, Text } from 'ink';
import { App } from '../app/app.ts';
import { isCommand } from '../app/commands.ts';
import { models } from '../app/models.ts';
import { ConfigPanel } from './components/command/config.tsx';
import { Feedback } from './components/command/feedback.tsx';
import { ModelPanel } from './components/command/model.tsx';
import { Panel } from './components/command/panel.tsx';
import { PromptPanel } from './components/command/prompt.tsx';
import { Suggestions } from './components/command/suggestions.tsx';
import { Composer } from './components/input/composer.tsx';
import { StartUp } from './components/startup.tsx';
import { useApp } from './hooks/use-app.ts';

const startupItems: 'startup'[] = ['startup'];

export interface TerminalProps {
  app?: App;
}

export function Terminal({ app }: TerminalProps = {}) {
  const [runtime] = useState(() => app ?? new App());
  const [draft, setDraft] = useState('');
  const state = useApp(runtime);
  const config = (() => {
    try {
      return runtime.settings.config;
    } catch {
      return null;
    }
  })();

  const submit = (value: string) => {
    if (!value.trim()) {
      return;
    }
    if (isCommand(value)) {
      runtime.submit(value);
    } else {
      runtime.notice(
        'Conversation is not available yet. '
        + 'Use /model, /config or /prompt.',
        'info',
      );
    }
  };

  const renderPanel = () => {
    const panel = state.panel;
    if (!panel) {
      return null;
    }
    if (panel.type === 'model') {
      return (
        <ModelPanel
          models={models}
          currentModelId={config?.activeModelId ?? models[0]!.id}
          onSave={modelId => runtime.trackPanelSave(
            runtime.settings.setModel(modelId)
          )}
          onClose={() => runtime.closePanel()}
        />
      );
    }
    if (panel.type === 'config') {
      const model = models.find(item => item.id === panel.modelId);
      if (!model) {
        return (
          <Panel
            footer='Esc close'
          >
            <Text color='#E06C75'>Unknown configured model.</Text>
          </Panel>
        );
      }
      const effort =
        config?.modelSettings[model.id]?.reasoningEffort;
      return (
        <ConfigPanel
          model={model}
          {...(effort === undefined ? {} : { currentEffort: effort })}
          hasApiKey={async () => Boolean(
            await runtime.secrets.getApiKey(panel.providerId)
          )}
          onSaveApiKey={apiKey => runtime.trackPanelSave(
            runtime.secrets.setApiKey(panel.providerId, apiKey)
          )}
          onClearApiKey={() => runtime.trackPanelSave(
            runtime.secrets.clearApiKey(panel.providerId)
          )}
          onSaveEffort={value => runtime.trackPanelSave(
            runtime.settings.setReasoningEffort(model.id, value)
          )}
          onClose={() => runtime.closePanel()}
        />
      );
    }
    return (
      <PromptPanel
        prompts={runtime.prompts}
        activePrompt={config?.activePrompt ?? null}
        trackSave={save => runtime.trackPanelSave(save)}
        onSelect={name => runtime.settings.setActivePrompt(name)}
        onClose={() => runtime.closePanel()}
      />
    );
  };

  return (
    <>
      <Static items={startupItems}>
        {() => (
          <Box key='startup' flexDirection='column' marginBottom={1}>
            <StartUp />
          </Box>
        )}
      </Static>
      <Feedback
        feedback={state.feedback}
        pending={state.pending}
        paused={state.paused}
      />
      {state.initErrors.filter(error => (
        !state.feedback.some(item => item.message === error.message)
      )).map(error => (
        <Box key={`${error.source}-${error.message}`} paddingX={1}>
          <Text color='#E06C75'>{error.message}</Text>
        </Box>
      ))}
      <Composer
        focus={state.panel === null}
        onDraftChange={setDraft}
        placeholder={
          state.ready
            ? 'Use /model, /config or /prompt'
            : 'Loading configuration...'
        }
        onSubmit={submit}
      />
      {renderPanel()}
      {state.panel ? null : <Suggestions input={draft} />}
    </>
  );
}
