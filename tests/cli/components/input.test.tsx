import { afterEach, describe, expect, test } from 'bun:test';
import { Box } from 'ink';
import { render } from 'ink-testing-library';
import { Input } from '../../../src/cli/components/input.tsx';
import { createDraft } from '../../../src/cli/state/input.ts';

async function waitForRender(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
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

  test('limits long input to the three-line viewport', async () => {
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
    expect(frame).toContain('two');
    expect(frame).toContain('three');
    expect(frame).toContain('four');
    expect(frame).not.toContain('one');
  });

  test('edits the draft from terminal input', async () => {
    rendered = render(
      <Box width={20}>
        <Input draft={createDraft('')} focus placeholder='' />
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
        <Input
          draft={createDraft('')}
          focus
          placeholder=''
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

  test('ignores input while unfocused', async () => {
    rendered = render(
      <Box width={20}>
        <Input
          draft={createDraft('')}
          focus={false}
          placeholder=''
        />
      </Box>,
    );
    await waitForRender();

    rendered.stdin.write('hidden');
    await waitForRender();

    expect(rendered.lastFrame()).not.toContain('hidden');
  });
});
