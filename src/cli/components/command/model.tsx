import { useState } from 'react';
import { Text, useInput } from 'ink';
import type { Model } from '../../../app/types.ts';
import { useLock } from '../../hooks/use-lock.ts';
import { useSelection } from '../../hooks/use-selection.ts';
import { SelectList } from '../select-list.tsx';
import { Panel } from './panel.tsx';

export interface ModelPanelProps {
  models: readonly Model[];
  currentModelId: string;
  onSave: (modelId: string) => Promise<void>;
  onClose: () => void;
}

export function ModelPanel({
  models,
  currentModelId,
  onSave,
  onClose,
}: ModelPanelProps) {
  const initial = Math.max(
    0,
    models.findIndex(model => model.id === currentModelId),
  );
  const selection = useSelection(models.length, initial);
  const saveLock = useLock();
  const [error, setError] = useState<string | null>(null);

  const select = async () => {
    const model = models[selection.current()];
    if (!model || !saveLock.tryLock()) {
      return;
    }
    setError(null);
    let saved = false;
    try {
      await onSave(model.id);
      saved = true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Cannot save model.'
      );
    } finally {
      saveLock.unlock();
      if (saved) {
        onClose();
      }
    }
  };

  useInput((_input, key) => {
    if (saveLock.locked) {
      return;
    }
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      selection.previous();
      return;
    }
    if (key.downArrow) {
      selection.next();
      return;
    }
    if (key.return) {
      void select();
    }
  });

  return (
    <Panel
      footer='↑/↓ move · Enter select · Esc close'
    >
      <SelectList
        items={models.map(model => ({
          key: model.id,
          label: model.name,
          checked: model.id === currentModelId,
        }))}
        selectedIndex={selection.index}
      />
      {saveLock.locked ? <Text color='#7F848E'>Saving...</Text> : null}
      {error ? <Text color='#E06C75'>{error}</Text> : null}
    </Panel>
  );
}
