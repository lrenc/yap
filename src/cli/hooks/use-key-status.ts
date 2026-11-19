import { useEffect, useState } from 'react';
import type { App } from '../../app/app.ts';
import type { Model } from '../../model/types.ts';

type KeyStatus = 'checking' | 'configured' | 'missing' | 'error';

interface CheckedKey {
  modelId: string;
  providerId: string;
  status: KeyStatus;
}

export interface KeyStatusResult {
  readonly status: KeyStatus;
  readonly ignored: boolean;
  readonly markAttempted: () => void;
}

export function useKeyStatus(
  app: App,
  model: Model | null,
  enabled: boolean,
): KeyStatusResult {
  const [checked, setChecked] = useState<CheckedKey | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [revision, setRevision] = useState(0);

  const modelId = model?.id;
  const providerId = model?.providerId;
  const status =
    enabled
    && modelId !== undefined
    && providerId !== undefined
    && checked?.modelId === modelId
    && checked.providerId === providerId
      ? checked.status
      : 'checking';

  useEffect(() => {
    setAttempted(false);
  }, [modelId, providerId]);

  useEffect(() => app.subscribe(event => {
    if (
      event.type === 'configChanged'
      || event.type === 'initErrors'
    ) {
      setAttempted(false);
      setRevision(value => value + 1);
    }
  }), [app]);

  useEffect(() => {
    if (!enabled || modelId === undefined || providerId === undefined) {
      setChecked(null);
      return;
    }

    let active = true;
    setChecked({ modelId, providerId, status: 'checking' });
    void app.hasApiKey(providerId)
      .then(configured => {
        if (active) {
          setChecked({
            modelId,
            providerId,
            status: configured ? 'configured' : 'missing',
          });
        }
      })
      .catch(() => {
        if (active) {
          setChecked({
            modelId,
            providerId,
            status: 'error',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    app, enabled, modelId, providerId, revision,
  ]);

  return {
    status,
    ignored: status === 'missing' && attempted,
    markAttempted: () => setAttempted(true),
  };
}
