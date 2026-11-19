import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { PromptSource } from '../../../app/types.ts';
import { isValidPromptName } from '../../../prompt/validation.ts';
import { formatError } from '../../error.ts';
import { createDraft } from '../../state/input.ts';
import type { Draft } from '../../types.ts';
import { useLock } from '../../hooks/use-lock.ts';
import { useSelection } from '../../hooks/use-selection.ts';
import { useTheme } from '../../theme/index.ts';
import { Editor } from '../input/editor.tsx';
import { SelectList } from '../select-list.tsx';
import { Panel, PanelStatus } from './panel.tsx';

type View =
  | { type: 'list' }
  | { type: 'name'; value: Draft }
  | {
    type: 'editor';
    mode: 'add' | 'edit';
    name: string;
    content: Draft;
  }
  | { type: 'confirmDelete'; name: string };

interface PromptPanelProps {
  prompts: PromptSource;
  activePrompt: string | undefined;
  maxBodyRows?: number | undefined;
  trackSave: <T>(save: Promise<T>) => Promise<T>;
  onCreate: (name: string, content: string) => Promise<void>;
  onUpdate: (name: string, content: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onSelect: (name: string | undefined) => Promise<void>;
  onComplete: () => void;
  onClose: () => void;
}

export function PromptPanel({
  prompts,
  activePrompt,
  maxBodyRows,
  trackSave,
  onCreate,
  onUpdate,
  onDelete,
  onSelect,
  onComplete,
  onClose,
}: PromptPanelProps) {
  const theme = useTheme();
  const [view, setView] = useState<View>({ type: 'list' });
  const viewRef = useRef<View>(view);
  const [names, setNames] = useState<string[]>([]);
  const [active, setActive] = useState<string | undefined>(activePrompt);
  const saveLock = useLock();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const entries = ['default', ...names];
  const list = useSelection(entries.length);
  const maxListRows = maxBodyRows === undefined
    ? undefined
    : Math.max(
      1,
      maxBodyRows
        - (loading ? 1 : 0)
        - (saveLock.locked ? 1 : 0)
        - (error === undefined ? 0 : 1),
    );

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
    setError(undefined);
    const succeeded = await saveLock.run(async () => {
      const value = name === 'default' ? undefined : name;
      await trackSave(onSelect(value));
      setActive(value);
    }, cause => setError(formatError(cause, 'Prompt operation failed.')));
    if (succeeded) {
      onComplete();
    }
  };

  const edit = async (name: string) => {
    setLoading(true);
    setError(undefined);
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
    setError(undefined);
    const succeeded = await saveLock.run(async () => {
      await trackSave(
        mode === 'add'
          ? onCreate(name, contentValue.value)
          : onUpdate(name, contentValue.value)
      );
    }, cause => setError(formatError(cause, 'Prompt operation failed.')));
    if (succeeded) {
      onComplete();
    }
  };

  const deletePrompt = async (name: string) => {
    setError(undefined);
    let deleted = false;
    const succeeded = await saveLock.run(async () => {
      await trackSave((async () => {
        await onDelete(name);
        deleted = true;
        if (active === name) {
          await onSelect(undefined);
        }
      })());
      if (active === name) {
        setActive(undefined);
      }
    }, cause => {
      if (deleted && active === name) {
        setActive(undefined);
      }
      setError(formatError(cause, 'Prompt operation failed.'));
    });
    if (succeeded) {
      onComplete();
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
  };

  useInput((input, key) => {
    const current = viewRef.current;
    if (current.type === 'confirmDelete') {
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
      setError(undefined);
      changeView({ type: 'name', value: createDraft('') });
      return;
    }
    if (input === 'e' && selected && selected !== 'default') {
      void edit(selected);
      return;
    }
    if (input === 'd' && selected && selected !== 'default') {
      setError(undefined);
      changeView({ type: 'confirmDelete', name: selected });
    }
  }, {
    isActive: view.type === 'list' || view.type === 'confirmDelete',
  });

  let footer: string;
  if (view.type === 'list') {
    footer = '↑/↓ move · a add · e edit · d delete';
  } else if (view.type === 'name') {
    footer = 'Enter continue · Esc back';
  } else if (view.type === 'editor') {
    footer = 'Shift+Enter newline · Enter save · Esc cancel';
  } else {
    footer = 'Enter confirm delete · Esc cancel';
  }

  return (
    <Panel footer={footer}>
      {view.type === 'list' ? (
        <Box flexDirection='column'>
          {loading ? (
            <Text color={theme.colors.text.muted}>Loading Prompts...</Text>
          ) : null}
          <SelectList
            items={entries.map(entry => ({
              key: entry,
              label: entry,
              checked: (active ?? 'default') === entry,
            }))}
            selectedIndex={list.index}
            maxRows={maxListRows}
          />
        </Box>
      ) : null}

      {view.type === 'name' ? (
        <Box flexDirection='column'>
          <Text>New Prompt name</Text>
          <Text color={theme.colors.text.muted}>
            Up to 16 characters; no whitespace; must be a valid file name.
          </Text>
          <Editor
            draft={view.value}
            focus
            maxRows={1}
            onDraftChange={value => changeView({ type: 'name', value })}
            onEscape={() => changeView({ type: 'list' })}
            onSubmit={name => {
              if (!isValidPromptName(name)) {
                setError(
                  'Use a valid file name up to 16 characters without whitespace; "default" is reserved.'
                );
                return;
              }
              setError(undefined);
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

      {view.type === 'confirmDelete' ? (
        <Text color={theme.colors.feedback.warning}>
          Delete “{view.name}”
          {active === view.name ? ' and restore the default Prompt' : ''}?
        </Text>
      ) : null}

      <PanelStatus busy={saveLock.locked} error={error} />
    </Panel>
  );
}
