import { useState } from 'react';
import type { EventEmitter } from 'node:events';
import { Box, Text, useWindowSize } from 'ink';
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
import { Chat, CompletedTranscript } from './components/chat.tsx';
import { Composer } from './components/input/composer.tsx';
import { KeyNotice } from './components/key-notice.tsx';
import { Scroller } from './components/scroller.tsx';
import { StartUp } from './components/startup.tsx';
import { useApp } from './hooks/use-app.ts';
import { useKeyStatus } from './hooks/use-key-status.ts';
import { useSelection } from './hooks/use-selection.ts';
import { useTheme } from './theme/index.ts';

const MAX_SUGGESTION_ROWS = 7;
const MAX_FOOTER_ROWS = 16;

function displayPath(path: string): string {
  const home = homedir();
  if (path === home) {
    return '~';
  }
  if (path.startsWith(`${home}${sep}`)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

export interface TerminalProps {
  app?: App;
  wheelEvents?: EventEmitter;
}

export function Terminal({ app, wheelEvents }: TerminalProps = {}) {
  const theme = useTheme();
  const [runtime] = useState(() => app ?? new App());
  const [draft, setDraft] = useState('');
  const [hasNewOutput, setHasNewOutput] = useState(false);
  const commands = suggestCommands(draft);
  const commandSelection = useSelection(commands.length);
  const state = useApp(runtime);
  const { rows } = useWindowSize();
  const liveRows = Math.max(1, rows);
  const maxFooterRows = state.panel
    ? Math.max(1, Math.min(MAX_FOOTER_ROWS, liveRows - 4))
    : Math.max(1, Math.min(MAX_SUGGESTION_ROWS, liveRows - 4));
  const config = runtime.config;
  const currentModel = config
    ? models.find(model => model.id === config.activeModelId) ?? null
    : null;
  const key = useKeyStatus(runtime, currentModel, state.ready);
  const reasoningEffort = currentModel
    ? config?.modelSettings[currentModel.id]?.reasoningEffort
      ?? currentModel.params.reasoning?.effort
      ?? 'default'
    : undefined;
  const modelStatus = currentModel
    ? [
      ...(config?.activePrompt ? [config.activePrompt] : []),
      currentModel.name,
      reasoningEffort,
    ].join(' · ')
    : undefined;
  const pathStatus = currentModel ? displayPath(runtime.cwd) : undefined;
  let pendingStatus = '';
  if (state.blocked) {
    pendingStatus = ` · ${state.blocked.message}`;
  } else if (state.paused) {
    pendingStatus = ' · waiting for panel';
  }
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
    if (!isCommand(value)) {
      key.markAttempted();
    }
    runtime.submit(value);
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

  const moveSuggestions = (direction: 'up' | 'down'): boolean => {
    if (state.panel || !commands.length) {
      return false;
    }
    direction === 'up'
      ? commandSelection.previous()
      : commandSelection.next();
    return true;
  };

  const completePanel = () => runtime.closePanel();

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
            runtime.setModel(modelId)
          )}
          onClose={() => {
            runtime.closePanel()}
          }
        />
      );
    }
    if (panel.type === 'config') {
      const model = models.find(item => item.id === panel.modelId);
      if (!model) {
        return (
          <Panel>
            <Text color={theme.colors.feedback.error}>
              Unknown configured model.
            </Text>
          </Panel>
        );
      }
      const effort =
        config?.modelSettings[model.id]?.reasoningEffort;
      return (
        <ConfigPanel
          model={model}
          {...(effort === undefined ? {} : {
            currentEffort: effort,
          })}
          hasApiKey={async () => Boolean(
            await runtime.secrets.getApiKey(panel.providerId)
          )}
          onSaveApiKey={apiKey => runtime.trackPanelSave(
            runtime.setApiKey(panel.providerId, apiKey)
          )}
          onClearApiKey={() => runtime.trackPanelSave(
            runtime.clearApiKey(panel.providerId)
          )}
          onSaveEffort={value => runtime.trackPanelSave(
            runtime.setReasoningEffort(model.id, value)
          )}
          onComplete={completePanel}
          onClose={() => runtime.closePanel()}
        />
      );
    }
    return (
      <PromptPanel
        prompts={runtime.prompts}
        activePrompt={config?.activePrompt}
        trackSave={save => runtime.trackPanelSave(save)}
        onCreate={(name, content) => runtime.createPrompt(name, content)}
        onUpdate={(name, content) => runtime.updatePrompt(name, content)}
        onDelete={name => runtime.deletePrompt(name)}
        onSelect={name => runtime.setActivePrompt(name)}
        onComplete={completePanel}
        onClose={() => runtime.closePanel()}
      />
    );
  };

  return (
    <Box
      maxHeight={liveRows}
      flexDirection='column'
      overflow='hidden'
    >
      <Scroller
        maxHeight={liveRows}
        onNewOutputChange={setHasNewOutput}
        scrollActive={state.panel === null}
        {...(wheelEvents === undefined ? {} : { wheelEvents })}
      >
        <Box flexDirection='column'>
          <StartUp />
        </Box>
        <CompletedTranscript items={state.chat.completed} />
        <Chat chat={state.chat} />
      </Scroller>
      <Feedback feedback={state.feedback} />
      {state.initErrors.filter(error => (
        !state.feedback.some(item => item.message === error.message)
      )).map(error => (
        <Box key={`${error.source}-${error.message}`} paddingX={1}>
          <Text color={theme.colors.feedback.error}>{error.message}</Text>
        </Box>
      ))}
      {key.status === 'missing' ? (
        <KeyNotice ignored={key.ignored} />
      ) : null}
      <Composer
        focus={state.panel === null}
        newOutput={hasNewOutput && state.panel === null}
        onDraftChange={changeDraft}
        onNavigate={moveSuggestions}
        placeholder={
          !state.ready
            ? 'Loading configuration...'
            : 'Ask anything...'
        }
        onEscape={() => runtime.cancel()}
        onSubmit={submit}
      />
      <Box
        maxHeight={maxFooterRows}
        flexDirection='column'
        flexShrink={0}
        overflow='hidden'
      >
        {currentModel ? (
          <Box paddingX={1}>
            <Text color={theme.colors.text.muted} wrap='truncate-end'>
              <Text color={theme.colors.role.agent}>{modelStatus}</Text>
              {modelStatus && pathStatus ? (
                <Text color={theme.colors.text.muted}> · </Text>
              ) : null}
              {pathStatus ? (
                <Text color={theme.colors.role.path}>{pathStatus}</Text>
              ) : null}
            </Text>
          </Box>
        ) : null}
        {state.pending > 0 ? (
          <Box paddingX={1}>
            <Text color={theme.colors.text.muted}>
              {state.pending} input{state.pending === 1 ? '' : 's'} queued
              {pendingStatus}
            </Text>
          </Box>
        ) : null}
        {renderPanel()}
        {state.panel ? null : (
          <Suggestions
            input={draft}
            commands={commands}
            selectedIndex={commandSelection.index}
          />
        )}
      </Box>
    </Box>
  );
}
