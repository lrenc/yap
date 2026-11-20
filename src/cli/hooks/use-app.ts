import { useEffect, useReducer } from 'react';
import type { App } from '../../app/app.ts';
import type {
  AppEvent,
  AppPanel,
  InitError,
  QueuedMessage,
} from '../../app/types.ts';
import type { QueueBlock } from '../../agent/admission.ts';
import {
  applyChatEvent,
  INITIAL_CHAT_STATE,
  type ChatState,
} from '../state/chat.ts';

interface AppFeedback {
  id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

interface AppUiState {
  panel: AppPanel | null;
  feedback: AppFeedback[];
  chat: ChatState;
  queuedMessages: readonly QueuedMessage[];
  blocked: QueueBlock | null;
  ready: boolean;
  initErrors: readonly InitError[];
}

type Action =
  | { type: 'event'; event: AppEvent }
  | { type: 'ready' };

const INITIAL_STATE: AppUiState = {
  panel: null,
  feedback: [],
  chat: INITIAL_CHAT_STATE,
  queuedMessages: [],
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
    };
  }
  const { event } = action;
  if (event.type === 'userMessage') {
    const {
      queueId,
      ...chatEvent
    } = event;
    return {
      ...state,
      queuedMessages: state.queuedMessages.filter(
        message => message.id !== queueId,
      ),
      chat: applyChatEvent(state.chat, chatEvent),
    };
  }
  if (
    event.type === 'sessionBoundary'
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
    case 'initErrors': {
      return {
        ...state,
        initErrors: event.errors,
      };
    }
    case 'panel': {
      return {
        ...state,
        panel: event.panel,
      };
    }
    case 'inputQueue': {
      return {
        ...state,
        queuedMessages: event.messages,
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
        dispatch({ type: 'ready' });
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
