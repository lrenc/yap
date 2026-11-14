import { useState } from 'react';
import { Static, Box, Text } from 'ink';
import { homedir } from 'node:os';
import { sep } from 'node:path';
import { App } from '../app/app.ts';
import { isCommand, suggestCommands } from '../app/commands.ts';
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
import { useSelection } from './hooks/use-selection.ts';

const startupItems: 'startup'[] = ['startup'];

function displayPath(path: string): string {
  const home = homedir();
  return path === home
    ? '~'
    : path.startsWith(`${home}${sep}`)
      ? `~${path.slice(home.length)}`
      : path;
}

export interface TerminalProps {
  app?: App;
}

export function Terminal({ app }: TerminalProps = {}) {
  const [runtime] = useState(() => app ?? new App());
  const [draft, setDraft] = useState('');
  const commands = suggestCommands(draft);
  const commandSelection = useSelection(commands.length);
  const state = useApp(runtime);
  const config = (() => {
    try {
      return runtime.settings.config;
    } catch {
      return null;
    }
  })();
  const currentModel = config
    ? models.find(model => model.id === config.activeModelId)
    : undefined;
  const reasoningEffort = currentModel
    ? config?.modelSettings[currentModel.id]?.reasoningEffort
      ?? currentModel.params.reasoning?.effort
      ?? 'default'
    : undefined;
  const status = currentModel
    ? [
      ...(config?.activePrompt ? [config.activePrompt] : []),
      currentModel.name,
      reasoningEffort,
      displayPath(runtime.cwd),
    ].join(' · ')
    : null;

  const submit = (value: string) => {
    if (!value.trim()) {
      return;
    }
    const matches = suggestCommands(value);
    const selected = matches[
      Math.min(commandSelection.current(), matches.length - 1)
    ];
    if (selected) {
      runtime.submit(selected.name);
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

  const changeDraft = (
    value: string,
    reason: 'input' | 'submit',
  ) => {
    setDraft(value);
    if (reason === 'input') {
      commandSelection.select(0);
    }
  };

  const navigateSuggestions = (direction: 'up' | 'down'): boolean => {
    if (state.panel || !commands.length) {
      return false;
    }
    direction === 'up'
      ? commandSelection.previous()
      : commandSelection.next();
    return true;
  };

  const completePanel = (message: string) => {
    runtime.notice(message);
    runtime.closePanel();
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
          <Panel>
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
          onComplete={completePanel}
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
        onComplete={completePanel}
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
        onDraftChange={changeDraft}
        onNavigate={navigateSuggestions}
        placeholder={
          state.ready
            ? 'Ask anything...'
            : 'Loading configuration...'
        }
        onSubmit={submit}
      />
      {currentModel ? (
        <Box paddingX={1}>
          <Text color='#7F848E' wrap='truncate-end'>
            {status}
          </Text>
        </Box>
      ) : null}
      {renderPanel()}
      {state.panel ? null : (
        <Suggestions
          input={draft}
          selectedIndex={commandSelection.index}
        />
      )}
    </>
  );
}
