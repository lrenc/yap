import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { Editor } from '../../../../src/cli/components/input/editor.tsx';
import { createDraft } from '../../../../src/cli/state/input.ts';

describe('Editor', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('renders the prompt marker and value', async () => {
    rendered = render(
      <Editor
        draft={createDraft('secret')}
        focus
        maxRows={1}
        onDraftChange={() => {}}
        placeholder='Enter value'
      />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('› secret');
  });
});
