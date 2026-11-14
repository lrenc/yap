import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PromptRepository } from '../../../app/settings/prompts.ts';
import { promptNameSchema } from '../../../app/settings/schema.ts';
import { formatError } from '../../format-error.ts';
import { createDraft } from '../../state/input.ts';
import type { Draft } from '../../types.ts';
import { useLock } from '../../hooks/use-lock.ts';
import { useSelection } from '../../hooks/use-selection.ts';
import { Editor } from '../input/editor.tsx';
import { SelectList } from '../select-list.tsx';
import { Panel } from './panel.tsx';

type View =
  | { type: 'list' }
  | { type: 'name'; value: Draft }
  | {
    type: 'editor';
    mode: 'add' | 'edit';
    name: string;
    content: Draft;
  }
  | { type: 'confirm-delete'; name: string };

export interface PromptPanelProps {
  prompts: PromptRepository;
  activePrompt: string | null;
  trackSave: <T>(save: Promise<T>) => Promise<T>;
  onSelect: (name: string | null) => Promise<void>;
  onComplete: (message: string) => void;
  onClose: () => void;
}

export function PromptPanel({
  prompts,
  activePrompt,
  trackSave,
  onSelect,
  onComplete,
  onClose,
}: PromptPanelProps) {
  const [view, setView] = useState<View>({ type: 'list' });
  const viewRef = useRef<View>(view);
  const [names, setNames] = useState<string[]>([]);
  const [active, setActive] = useState(activePrompt);
  const saveLock = useLock();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const entries = ['default', ...names];
  const list = useSelection(entries.length);

  const changeView = (next: View) => {
    viewRef.current = next;
    setView(next);
  };

  const refresh = async () => {
    const next = await prompts.list();
    setNames(next);
    return next;
  };

  useEffect(() => {
    let mounted = true;
    void prompts.list()
      .then(next => {
        if (mounted) {
          setNames(next);
        }
      })
      .catch(cause => {
        if (mounted) {
          setError(formatError(cause, 'Prompt operation failed.'));
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [prompts]);

  const select = async (name: string) => {
    if (!saveLock.tryLock()) {
      return;
    }
    setError(null);
    let completed: string | undefined;
    try {
      const value = name === 'default' ? null : name;
      await trackSave(onSelect(value));
      setActive(value);
      completed = `Prompt changed to ${name}.`;
    } catch (cause) {
      setError(formatError(cause, 'Prompt operation failed.'));
    } finally {
      saveLock.unlock();
      if (completed) {
        onComplete(completed);
      }
    }
  };

  const edit = async (name: string) => {
    setLoading(true);
    setError(null);
    try {
      const content = await prompts.read(name);
      if (content === undefined) {
        throw new Error(`Prompt not found: ${name}`);
      }
      changeView({
        type: 'editor',
        mode: 'edit',
        name,
        content: createDraft(content),
      });
    } catch (cause) {
      setError(formatError(cause, 'Prompt operation failed.'));
    } finally {
      setLoading(false);
    }
  };

  const saveEditor = async (
    mode: 'add' | 'edit',
    name: string,
    contentValue: Draft,
  ) => {
    if (!contentValue.value.trim()) {
      setError('Prompt content must not be empty.');
      return;
    }
    if (!saveLock.tryLock()) {
      return;
    }
    setError(null);
    let completed: string | undefined;
    try {
      await trackSave(
        mode === 'add'
          ? prompts.create(name, contentValue.value)
          : prompts.update(name, contentValue.value)
      );
      completed = `Prompt ${mode === 'add' ? 'created' : 'updated'}: ${name}`;
    } catch (cause) {
      setError(formatError(cause, 'Prompt operation failed.'));
    } finally {
      saveLock.unlock();
      if (completed) {
        onComplete(completed);
      }
    }
  };

  const deletePrompt = async (name: string) => {
    if (!saveLock.tryLock()) {
      return;
    }
    setError(null);
    let deleted = false;
    let completed: string | undefined;
    try {
      await trackSave((async () => {
        await prompts.delete(name);
        deleted = true;
        if (active === name) {
          await onSelect(null);
        }
      })());
      if (active === name) {
        setActive(null);
      }
      completed = `Prompt deleted: ${name}`;
    } catch (cause) {
      if (deleted && active === name) {
        setActive(null);
      }
      setError(formatError(cause, 'Prompt operation failed.'));
    } finally {
      saveLock.unlock();
      if (completed) {
        onComplete(completed);
        return;
      }
      list.select(0);
      changeView({ type: 'list' });
      try {
        await refresh();
      } catch (cause) {
        setError(current => (
          current ?? formatError(cause, 'Prompt operation failed.')
        ));
      }
    }
  };

  useInput((input, key) => {
    const current = viewRef.current;
    if (current.type === 'confirm-delete') {
      if (saveLock.locked) {
        return;
      }
      if (key.escape) {
        changeView({ type: 'list' });
      } else if (key.return) {
        void deletePrompt(current.name);
      }
      return;
    }
    if (current.type !== 'list' || loading || saveLock.locked) {
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      list.previous();
      return;
    }
    if (key.downArrow) {
      list.next();
      return;
    }
    const selected = entries[list.current()];
    if (key.return && selected) {
      void select(selected);
      return;
    }
    if (input === 'a') {
      setError(null);
      changeView({ type: 'name', value: createDraft('') });
      return;
    }
    if (input === 'e' && selected && selected !== 'default') {
      void edit(selected);
      return;
    }
    if (input === 'd' && selected && selected !== 'default') {
      setError(null);
      changeView({ type: 'confirm-delete', name: selected });
    }
  }, {
    isActive: view.type === 'list' || view.type === 'confirm-delete',
  });

  return (
    <Panel
      footer={
        view.type === 'list'
          ? '↑/↓ move · a add · e edit · d delete'
          : view.type === 'name'
            ? 'Enter continue · Esc back'
            : view.type === 'editor'
              ? 'Shift+Enter newline · Enter save · Esc cancel'
              : 'Enter confirm delete · Esc cancel'
      }
    >
      {view.type === 'list' ? (
        <Box flexDirection='column'>
          {loading ? <Text color='#7F848E'>Loading Prompts...</Text> : null}
          <SelectList
            items={entries.map(entry => ({
              key: entry,
              label: entry,
              checked: (active ?? 'default') === entry,
            }))}
            selectedIndex={list.index}
          />
        </Box>
      ) : null}

      {view.type === 'name' ? (
        <Box flexDirection='column'>
          <Text>New Prompt name</Text>
          <Text color='#7F848E'>
            Letters, numbers, hyphens and underscores.
          </Text>
          <Editor
            draft={view.value}
            focus
            maxRows={1}
            onDraftChange={value => changeView({ type: 'name', value })}
            onEscape={() => changeView({ type: 'list' })}
            onSubmit={name => {
              if (!promptNameSchema.safeParse(name).success) {
                setError(
                  'Invalid Prompt name or reserved name "default".'
                );
                return;
              }
              setError(null);
              changeView({
                type: 'editor',
                mode: 'add',
                name,
                content: createDraft(''),
              });
            }}
            placeholder='concise'
          />
        </Box>
      ) : null}

      {view.type === 'editor' ? (
        <Box flexDirection='column'>
          <Text>
            {view.mode === 'add' ? 'New Prompt' : 'Edit Prompt'} · {view.name}
          </Text>
          <Editor
            draft={view.content}
            focus={!saveLock.locked}
            maxRows={10}
            onDraftChange={content => changeView({
              type: 'editor',
              mode: view.mode,
              name: view.name,
              content,
            })}
            onEscape={() => changeView({ type: 'list' })}
            onSubmit={content => void saveEditor(
              view.mode,
              view.name,
              createDraft(content),
            )}
            placeholder='Prompt instructions'
          />
        </Box>
      ) : null}

      {view.type === 'confirm-delete' ? (
        <Text color='#E5C07B'>
          Delete “{view.name}”
          {active === view.name ? ' and restore the default Prompt' : ''}?
        </Text>
      ) : null}

      {saveLock.locked ? <Text color='#7F848E'>Saving...</Text> : null}
      {error ? <Text color='#E06C75'>{error}</Text> : null}
    </Panel>
  );
}
