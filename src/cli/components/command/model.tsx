import { useState } from 'react';
import { useInput } from 'ink';
import type { Model } from '../../../app/types.ts';
import { formatError } from '../../error.ts';
import { useLock } from '../../hooks/use-lock.ts';
import { useSelection } from '../../hooks/use-selection.ts';
import { SelectList } from '../select-list.tsx';
import { Panel, PanelStatus } from './panel.tsx';

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
  const [error, setError] = useState<string | undefined>();

  const select = async () => {
    const model = models[selection.current()];
    if (!model) {
      return;
    }
    setError(undefined);
    const saved = await saveLock.run(
      () => onSave(model.id),
      cause => setError(formatError(cause, 'Cannot save model.')),
    );
    if (saved) {
      onClose();
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
      footer='↑/↓ move · Enter select'
    >
      <SelectList
        items={models.map(model => ({
          key: model.id,
          label: model.name,
          checked: model.id === currentModelId,
        }))}
        selectedIndex={selection.index}
      />
      <PanelStatus busy={saveLock.locked} error={error} />
    </Panel>
  );
}
