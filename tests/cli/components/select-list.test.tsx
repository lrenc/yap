import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import { SelectList } from '../../../src/cli/components/select-list.tsx';

describe('SelectList', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
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

  test('keeps the selected item visible within a stable window', async () => {
    const items = Array.from(
      { length: 20 },
      (_value, index) => ({
        key: `item-${index}`,
        label: `Item ${index}`,
      }),
    );
    rendered = render(
      <SelectList
        items={items}
        selectedIndex={0}
        maxRows={5}
      />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    for (let index = 1; index < 15; index += 1) {
      rendered.rerender(
        <SelectList
          items={items}
          selectedIndex={index}
          maxRows={5}
        />,
      );
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    let frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('› Item 14');
    expect(frame).toContain('  Item 10');
    expect(frame).not.toContain('Item 9');

    rendered.rerender(
      <SelectList
        items={items}
        selectedIndex={12}
        maxRows={5}
      />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('› Item 12');
    expect(frame).toContain('  Item 10');
    expect(frame).toContain('  Item 14');

    rendered.rerender(
      <SelectList
        items={items}
        selectedIndex={9}
        maxRows={5}
      />,
    );
    await new Promise(resolve => setTimeout(resolve, 0));

    frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('› Item 9');
    expect(frame).toContain('  Item 13');
    expect(frame).not.toContain('Item 14');
  });
});
