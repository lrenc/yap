import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { SelectList } from '../../../src/cli/components/select-list.tsx';

describe('SelectList', () => {
  let rendered: ReturnType<typeof render> | undefined;

  afterEach(() => {
    rendered?.unmount();
    rendered = undefined;
  });

  test('renders selection, details and checked state consistently', async () => {
    rendered = render(
      <SelectList
        selectedIndex={1}
        items={[
          { key: 'first', label: 'First', detail: 'default' },
          {
            key: 'second',
            label: 'Second',
            detail: 'active',
            checked: true,
          },
        ]}
      />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('  First');
    expect(frame).toContain('default');
    expect(frame).toContain('› Second');
    expect(frame).toContain('active');
    expect(frame).toContain('✓');
  });
});
