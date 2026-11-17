import { useEffect, useReducer } from 'react';
import type { App, AppEvent, AppPanel, InitError } from '../../app/app.ts';
import type { QueueBlock } from '../../app/queue.ts';
import {
  applyChatEvent,
  INITIAL_CHAT_STATE,
  type ChatState,
} from '../state/chat.ts';

export interface AppFeedback {
  id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface AppUiState {
  panel: AppPanel | null;
  feedback: AppFeedback[];
  chat: ChatState;
  pending: number;
  paused: boolean;
  blocked: QueueBlock | null;
  ready: boolean;
  initErrors: readonly InitError[];
}

type Action =
  | { type: 'event'; event: AppEvent }
  | { type: 'ready'; errors: readonly InitError[] };

const INITIAL_STATE: AppUiState = {
  panel: null,
  feedback: [],
  chat: INITIAL_CHAT_STATE,
  pending: 0,
  paused: false,
  blocked: null,
  ready: false,
  initErrors: [],
};

function reduceAppState(
  state: AppUiState,
  action: Action,
): AppUiState {
  if (action.type === 'ready') {
    return {
      ...state,
      ready: true,
      initErrors: action.errors,
    };
  }
  const { event } = action;
  if (
    event.type === 'session_boundary'
    || (event.type !== 'notice' && 'runId' in event)
  ) {
    return {
      ...state,
      chat: applyChatEvent(
        state.chat,
        event,
      ),
    };
  }
  switch (event.type) {
    case 'notice': {
      return {
        ...state,
        feedback: [
          ...state.feedback.slice(-4),
          {
            id: Date.now() + Math.random(),
            level: event.level,
            message: event.message,
          },
        ],
      };
    }
    case 'panel': {
      return {
        ...state,
        panel: event.panel,
      };
    }
    case 'input_queue': {
      return {
        ...state,
        pending: event.pending,
        paused: event.paused,
        blocked: event.blocked,
      };
    }
    default: {
      return state;
    }
  }
}

export function useApp(app: App): AppUiState {
  const [state, dispatch] = useReducer(reduceAppState, INITIAL_STATE);

  useEffect(() => {
    let active = true;
    const unsubscribe = app.subscribe(event => {
      if (active) {
        dispatch({ type: 'event', event });
      }
    });
    void app.initialize().finally(() => {
      if (active) {
        dispatch({ type: 'ready', errors: app.initErrors });
      }
    });
    return () => {
      active = false;
      unsubscribe();
      app.dispose();
    };
  }, [app]);

  return state;
}
