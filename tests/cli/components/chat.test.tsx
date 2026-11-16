import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import {
  Chat,
  ChatEntryView,
} from '../../../src/cli/components/chat.tsx';
import type { ChatState } from '../../../src/cli/state/chat.ts';

describe('Chat', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('renders completed messages, tools, and streaming text', async () => {
    const chat: ChatState = {
      completed: [
        { id: 'user', type: 'user', content: 'question' },
        {
          id: 'assistant',
          type: 'assistant',
          content: 'answer',
          refusal: false,
        },
        {
          id: 'tool',
          type: 'tool',
          name: 'read_file',
          status: 'completed',
          summary: undefined,
        },
      ],
      active: {
        id: 'active',
        runId: 1,
        sessionId: 1,
        turn: 2,
        text: 'streaming',
        refusal: false,
      },
      activity: null,
    };
    rendered = render(
      <>
        {chat.completed.map(item => (
          <ChatEntryView key={item.id} item={item} />
        ))}
        <Chat chat={chat} />
      </>,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('question');
    expect(frame).toContain('answer');
    expect(frame).toContain('read_file');
    expect(frame).not.toContain('⚙');
    expect(frame).toContain('streaming▌');
  });

  test('renders active work status', async () => {
    rendered = render(
      <Chat
        chat={{
          completed: [],
          active: null,
          activity: { type: 'compacting' },
        }}
      />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(rendered.lastFrame()).toContain('Compacting context...');
  });
});
