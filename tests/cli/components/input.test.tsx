import { afterEach, describe, expect, test } from 'bun:test';
import { useState } from 'react';
import { Box } from 'ink';
import { render } from 'ink-testing-library';
import { Input } from '../../../src/cli/components/input.tsx';
import { createDraft } from '../../../src/cli/state/input.ts';
import type { Draft } from '../../../src/cli/types.ts';

async function waitForRender(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

function ControlledInput({
  focus = true,
  onSubmit,
}: {
  focus?: boolean;
  onSubmit?: (value: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(''));

  return (
    <Input
      draft={draft}
      focus={focus}
      onDraftChange={setDraft}
      placeholder=''
      {...(onSubmit ? { onSubmit } : {})}
    />
  );
}

describe('Input', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('renders the placeholder when the input is empty', async () => {
    rendered = render(
      <Box width={20}>
        <Input
          draft={createDraft('')}
          focus
          placeholder='Ask anything...'
        />
      </Box>,
    );
    await waitForRender();

    expect(rendered.lastFrame()).toContain('Ask anything...');
  });

  test('grows to fit content below the row limit', async () => {
    rendered = render(
      <Box width={20}>
        <Input
          draft={createDraft('one\ntwo\nthree\nfour')}
          focus
          placeholder=''
        />
      </Box>,
    );
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('one');
    expect(frame).toContain('two');
    expect(frame).toContain('three');
    expect(frame).toContain('four');
  });

  test('scrolls the viewport when content exceeds maxRows', async () => {
    rendered = render(
      <Box width={20}>
        <Input
          draft={createDraft('one\ntwo\nthree\nfour')}
          focus
          maxRows={3}
          placeholder=''
        />
      </Box>,
    );
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('two');
    expect(frame).toContain('three');
    expect(frame).toContain('four');
    expect(frame).not.toContain('one');
  });

  test('edits the draft from terminal input', async () => {
    rendered = render(
      <Box width={20}>
        <ControlledInput />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('hello');
    await waitForRender();

    expect(rendered.lastFrame()).toContain('hello');
  });

  test('submits the current value with Enter', async () => {
    let submitted = '';
    rendered = render(
      <Box width={20}>
        <ControlledInput
          onSubmit={value => {
            submitted = value;
          }}
        />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('hello');
    await waitForRender();
    rendered.stdin.write('\r');
    await waitForRender();

    expect(submitted).toBe('hello');
  });

  test('inserts a newline with Shift+Enter', async () => {
    let submitted = false;
    rendered = render(
      <Box width={20}>
        <ControlledInput
          onSubmit={() => {
            submitted = true;
          }}
        />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('one');
    await waitForRender();
    rendered.stdin.write('\x1b[13;2u');
    await waitForRender();
    rendered.stdin.write('two');
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('one');
    expect(frame).toContain('two');
    expect(submitted).toBe(false);
  });

  test('moves vertically between input lines', async () => {
    rendered = render(
      <Box width={20}>
        <ControlledInput />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('one');
    await waitForRender();
    rendered.stdin.write('\x1b[13;2u');
    await waitForRender();
    rendered.stdin.write('two');
    await waitForRender();
    rendered.stdin.write('\x1b[A');
    await waitForRender();
    rendered.stdin.write('X');
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('oneX');
    expect(frame).toContain('two');
  });

  test('inserts a newline with Alt+Enter', async () => {
    rendered = render(
      <Box width={20}>
        <ControlledInput />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('one');
    await waitForRender();
    rendered.stdin.write('\x1b\r');
    await waitForRender();
    rendered.stdin.write('two');
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('one');
    expect(frame).toContain('two');
  });

  test('does not insert a Kitty protocol response into the input', async () => {
    rendered = render(
      <Box width={20}>
        <ControlledInput />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('\x1b[?0u');
    rendered.stdin.write('hello');
    await waitForRender();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('hello');
    expect(frame).not.toContain('[?0u');
  });

  test('ignores input while unfocused', async () => {
    rendered = render(
      <Box width={20}>
        <ControlledInput focus={false} />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('hidden');
    await waitForRender();

    expect(rendered.lastFrame()).not.toContain('hidden');
  });
});
