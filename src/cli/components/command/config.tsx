import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Model } from '../../../app/types.ts';
import { createDraft } from '../../state/input.ts';
import type { Draft } from '../../types.ts';
import { useLock } from '../../hooks/use-lock.ts';
import { useSelection } from '../../hooks/use-selection.ts';
import { Editor } from '../input/editor.tsx';
import { SelectList } from '../select-list.tsx';
import { Panel } from './panel.tsx';

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
  onComplete: (message: string) => void;
  onClose: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Save failed.';
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
  const [view, setView] = useState<View>({ type: 'fields' });
  const viewRef = useRef<View>(view);
  const [configured, setConfigured] = useState<boolean | null>(null);
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
      .catch(() => {
        if (active) {
          setConfigured(false);
          setStatus(current => ({
            ...current,
            apiKey: 'Cannot read API Key status.',
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
    if (!saveLock.tryLock()) {
      return;
    }
    let completed: string | undefined;
    try {
      await onSaveApiKey(value);
      completed = 'API Key saved; applies from the next run.';
    } catch {
      setStatus(current => ({
        ...current,
        apiKey: 'Cannot save API Key.',
      }));
    } finally {
      saveLock.unlock();
      if (completed) {
        onComplete(completed);
      }
    }
  };

  const clearApiKey = async () => {
    if (!saveLock.tryLock()) {
      return;
    }
    let completed: string | undefined;
    try {
      await onClearApiKey();
      completed = 'API Key cleared.';
    } catch {
      setStatus(current => ({
        ...current,
        apiKey: 'Cannot clear API Key.',
      }));
    } finally {
      saveLock.unlock();
      if (completed) {
        onComplete(completed);
      }
    }
  };

  const saveEffort = async (option: string) => {
    if (!saveLock.tryLock()) {
      return;
    }
    let completed: string | undefined;
    try {
      const value = option === 'default' ? undefined : option;
      await onSaveEffort(value);
      completed = `${option} saved; applies from the next run.`;
    } catch (error) {
      setStatus(current => ({
        ...current,
        reasoningEffort: errorMessage(error),
      }));
    } finally {
      saveLock.unlock();
      if (completed) {
        onComplete(completed);
      }
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
          ? '↑/↓ move · Enter edit · c clear key · Esc close'
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
                detail: configured === null
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
            <Text color='#7F848E'>
              API Key: {apiStatus}
            </Text>
          ) : null}
          {effortStatus ? (
            <Text color='#7F848E'>
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
          {saveLock.locked ? <Text color='#7F848E'>Saving...</Text> : null}
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
          {saveLock.locked ? <Text color='#7F848E'>Saving...</Text> : null}
        </Box>
      ) : null}

      {view.type === 'confirm-clear' ? (
        <Text color='#E5C07B'>
          Clear the stored API Key? Press Enter to confirm.
        </Text>
      ) : null}
    </Panel>
  );
}
