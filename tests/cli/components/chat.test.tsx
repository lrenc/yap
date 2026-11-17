import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Chat, ChatEntryView } from '../../../src/cli/components/chat.tsx';
import type {
  ChatEntry,
  ChatState,
} from '../../../src/cli/state/chat.ts';

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
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('question');
    expect(frame).toContain('answer');
    expect(frame).toContain('read_file');
    expect(frame).not.toContain('⚙');
    expect(frame).not.toContain('You');
    expect(frame).not.toContain('YAP');
    expect(frame).toContain('streaming▌');
    expect(frame).toContain('› question');
    const lines = frame.split('\n');
    const questionLine = lines.find(line => line.includes('question'))!;
    const answerLine = lines.find(line => line.includes('answer'))!;
    expect(questionLine.indexOf('question'))
      .toBe(answerLine.indexOf('answer'));
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

  test('renders Markdown before the streaming response', async () => {
    const items: ChatEntry[] = [
      {
        id: 'assistant:1:1:1',
        type: 'assistant',
        content: '## first line\n\nsecond line',
        refusal: false,
      },
    ];
    rendered = render(
      <>
        {items.map(item => (
          <ChatEntryView key={item.id} item={item} />
        ))}
        <Chat
          chat={{
            completed: items,
            active: {
              id: 'assistant:1:1:1',
              runId: 1,
              turn: 1,
              text: 'latest **line**',
              refusal: false,
            },
            activity: null,
          }}
        />
      </>,
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).not.toContain('YAP');
    expect(frame).not.toContain('##');
    expect(frame).not.toContain('**');
    expect(frame.indexOf('first line')).toBeLessThan(
      frame.indexOf('second line'),
    );
    expect(frame.indexOf('second line')).toBeLessThan(
      frame.indexOf('latest line▌'),
    );
  });
});
