import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Model } from '../../../app/types.ts';
import { formatError } from '../../error.ts';
import { createDraft } from '../../state/input.ts';
import type { Draft } from '../../types.ts';
import { useLock } from '../../hooks/use-lock.ts';
import { useSelection } from '../../hooks/use-selection.ts';
import { useTheme } from '../../theme/index.ts';
import { Editor } from '../input/editor.tsx';
import { SelectList } from '../select-list.tsx';
import { Panel, PanelStatus } from './panel.tsx';

type Field = 'apiKey' | 'reasoningEffort';

type View =
  | { type: 'fields' }
  | { type: 'api-key'; draft: Draft }
  | { type: 'effort' }
  | { type: 'confirm-clear' };

export interface ConfigPanelProps {
  model: Model;
  currentEffort?: string;
  hasApiKey: () => Promise<boolean>;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onClearApiKey: () => Promise<void>;
  onSaveEffort: (effort: string | undefined) => Promise<void>;
  onComplete: () => void;
  onClose: () => void;
}

export function ConfigPanel({
  model,
  currentEffort,
  hasApiKey,
  onSaveApiKey,
  onClearApiKey,
  onSaveEffort,
  onComplete,
  onClose,
}: ConfigPanelProps) {
  const theme = useTheme();
  const [view, setView] = useState<View>({ type: 'fields' });
  const viewRef = useRef<View>(view);
  const [configured, setConfigured] = useState<boolean | undefined>();
  const effort = currentEffort;
  const saveLock = useLock();
  const [status, setStatus] = useState<Partial<Record<Field, string>>>({});
  const efforts = ['default', ...(model.reasoningEfforts ?? [])];
  const fields = useSelection(2);
  const effortOptions = useSelection(efforts.length);

  const changeView = (next: View) => {
    viewRef.current = next;
    setView(next);
  };

  useEffect(() => {
    let active = true;
    void hasApiKey()
      .then(value => {
        if (active) {
          setConfigured(value);
        }
      })
      .catch(cause => {
        if (active) {
          setConfigured(false);
          setStatus(current => ({
            ...current,
            apiKey: formatError(cause, 'Cannot read API Key status.'),
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [model.id]);

  const saveApiKey = async (value: string) => {
    if (!value.trim()) {
      setStatus(current => ({
        ...current,
        apiKey: 'API Key must not be empty.',
      }));
      return;
    }
    const succeeded = await saveLock.run(
      () => onSaveApiKey(value),
      error => setStatus(current => ({
        ...current,
        apiKey: formatError(error, 'Cannot save API Key.'),
      })),
    );
    if (succeeded) {
      onComplete();
    }
  };

  const clearApiKey = async () => {
    const succeeded = await saveLock.run(
      () => onClearApiKey(),
      error => setStatus(current => ({
        ...current,
        apiKey: formatError(error, 'Cannot clear API Key.'),
      })),
    );
    if (succeeded) {
      onComplete();
    }
  };

  const saveEffort = async (option: string) => {
    const value = option === 'default' ? undefined : option;
    const succeeded = await saveLock.run(
      () => onSaveEffort(value),
      error => setStatus(current => ({
        ...current,
        reasoningEffort: formatError(error, 'Save failed.'),
      })),
    );
    if (succeeded) {
      onComplete();
    }
  };

  useInput((input, key) => {
    const current = viewRef.current;
    if (saveLock.locked) {
      return;
    }
    if (current.type === 'fields') {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow) {
        fields.previous();
        return;
      }
      if (key.downArrow) {
        fields.next();
        return;
      }
      if (input === 'c' && fields.current() === 0 && configured) {
        changeView({ type: 'confirm-clear' });
        return;
      }
      if (key.return) {
        if (fields.current() === 0) {
          changeView({ type: 'api-key', draft: createDraft('') });
        } else {
          const selected = effort
            ? Math.max(0, efforts.indexOf(effort))
            : 0;
          effortOptions.select(selected);
          changeView({ type: 'effort' });
        }
      }
      return;
    }
    if (current.type === 'effort') {
      if (key.escape) {
        fields.select(1);
        changeView({ type: 'fields' });
        return;
      }
      if (key.upArrow) {
        effortOptions.previous();
        return;
      }
      if (key.downArrow) {
        effortOptions.next();
        return;
      }
      if (key.return) {
        const option = efforts[effortOptions.current()];
        if (option) {
          void saveEffort(option);
        }
      }
      return;
    }
    if (current.type === 'confirm-clear') {
      if (key.escape) {
        fields.select(0);
        changeView({ type: 'fields' });
      } else if (key.return) {
        void clearApiKey();
      }
    }
  }, {
    isActive: view.type !== 'api-key',
  });

  const apiStatus = status.apiKey;
  const effortStatus = status.reasoningEffort;

  return (
    <Panel
      footer={
        view.type === 'fields'
          ? '↑/↓ move · Enter edit · c clear key'
          : view.type === 'api-key'
            ? 'Enter save · Esc cancel'
            : view.type === 'effort'
              ? '↑/↓ move · Enter save · Esc back'
              : 'Enter confirm · Esc cancel'
      }
    >
      {view.type === 'fields' ? (
        <Box flexDirection='column'>
          <SelectList
            items={[
              {
                key: 'api-key',
                label: 'API Key',
                detail: configured === undefined
                  ? 'checking...'
                  : configured ? 'configured' : 'not configured',
              },
              {
                key: 'reasoning-effort',
                label: 'Reasoning Effort',
                detail: effort ?? 'default',
              },
            ]}
            selectedIndex={fields.index}
          />
          {apiStatus ? (
            <Text color={theme.colors.feedback.error}>
              API Key: {apiStatus}
            </Text>
          ) : null}
          {effortStatus ? (
            <Text color={theme.colors.feedback.error}>
              Reasoning Effort: {effortStatus}
            </Text>
          ) : null}
        </Box>
      ) : null}

      {view.type === 'api-key' ? (
        <Box flexDirection='column'>
          <Text>API Key for {model.name}</Text>
          <Editor
            draft={view.draft}
            focus={!saveLock.locked}
            maxRows={1}
            onDraftChange={draft => changeView({ type: 'api-key', draft })}
            onEscape={() => {
              fields.select(0);
              changeView({ type: 'fields' });
            }}
            onSubmit={value => void saveApiKey(value)}
            placeholder='Enter API Key'
          />
          <PanelStatus busy={saveLock.locked} error={apiStatus} />
        </Box>
      ) : null}

      {view.type === 'effort' ? (
        <Box flexDirection='column'>
          <SelectList
            items={efforts.map(option => ({
              key: option,
              label: option,
              checked: (effort ?? 'default') === option,
            }))}
            selectedIndex={effortOptions.index}
          />
          <PanelStatus busy={saveLock.locked} error={effortStatus} />
        </Box>
      ) : null}

      {view.type === 'confirm-clear' ? (
        <>
          <Text color={theme.colors.feedback.warning}>
            Clear the stored API Key? Press Enter to confirm.
          </Text>
          {apiStatus ? (
            <Text color={theme.colors.feedback.error}>{apiStatus}</Text>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
