import { afterEach, describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import stringWidth from 'string-width';
import { MarkdownMessage } from '../../../src/cli/markdown/markdown.tsx';

describe('MarkdownMessage', () => {
  let rendered: ReturnType<typeof render> | null = null;

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
  });

  test('renders common Markdown as terminal text', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='assistant:1'
        source={[
          '# Title',
          '',
          'Hello **world** with `code` and [link](https://example.com).',
          '',
          '- one',
          '- two',
          '',
          '> quoted',
          '',
          '```ts',
          'const x = 1;',
          '```',
        ].join('\n')}
      />,
    );
    await renderTicks();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('Title');
    expect(frame).toContain(
      'Hello world with code and link (https://example.com).',
    );
    expect(frame).toContain('• one');
    expect(frame).toContain('• two');
    expect(frame).toContain('quoted');
    expect(frame).toContain('const x = 1;');
    expect(frame).not.toContain('**');
    expect(frame).not.toContain('```');
  });

  test('appends the streaming cursor to the active Markdown block', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='active'
        source='streaming **now**'
        streaming
      />,
    );
    await renderTicks();

    expect(rendered.lastFrame()).toContain('streaming now▌');
  });

  test('renders aligned tables and directory trees', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='structured'
        source={[
          '| Name | Count |',
          '| :--- | ---: |',
          '| alpha | 2 |',
          '| beta | 10 |',
          '',
          'src/',
          '├── cli/',
          '│   └── index.tsx',
          '└── app/',
        ].join('\n')}
      />,
    );
    await renderTicks();

    const frame = rendered.lastFrame() ?? '';
    const tableFrame = frame.split('\n\n')[0] ?? '';
    expect(tableFrame).not.toContain('━');
    expect(tableFrame).toContain('────');
    expect(tableFrame).toContain('│');
    expect(tableFrame).not.toContain('┌');
    expect(tableFrame).not.toContain('└');
    expect(frame).toContain('Name');
    expect(frame).toContain('Count');
    expect(frame).toMatch(/\s+10\s*$/mu);
    expect(frame).toContain('├── cli/');
    expect(frame).toContain('│   └── index.tsx');
  });

  test('updates a streaming source after the parse interval', async () => {
    const tree = (source: string) => (
      <MarkdownMessage
        messageId='active'
        source={source}
        streaming
      />
    );
    rendered = render(tree('first'));
    await renderTicks();

    rendered.rerender(tree('first **second**'));
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(rendered.lastFrame()).toContain('first second▌');
    expect(rendered.lastFrame()).not.toContain('**');
  });

  test('coalesces rapid updates into the latest source', async () => {
    const tree = (source: string) => (
      <MarkdownMessage
        messageId='active'
        source={source}
        streaming
      />
    );
    rendered = render(tree('first'));
    await renderTicks();

    rendered.rerender(tree('first\n\nsecond'));
    rendered.rerender(tree('first\n\nsecond\n\nthird'));
    await new Promise(resolve => setTimeout(resolve, 80));

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('first');
    expect(frame).toContain('second');
    expect(frame).toContain('third▌');
  });

  test('reconciles Markdown when streaming finishes', async () => {
    const tree = (source: string, streaming: boolean) => (
      <MarkdownMessage
        messageId='active'
        source={source}
        streaming={streaming}
      />
    );
    rendered = render(tree('[site]\n\nheading', true));
    await renderTicks();

    rendered.rerender(tree(
      '[site]\n\nheading\n\n[site]: https://example.com',
      false,
    ));
    await renderTicks();

    expect(rendered.lastFrame()).toContain(
      'site (https://example.com)',
    );
  });

  test('finishes an incrementally parsed source when streaming ends', async () => {
    const source = '[site]\n\nheading\n\n[site]: https://example.com';
    const tree = (text: string, streaming: boolean) => (
      <MarkdownMessage
        messageId='active'
        source={text}
        streaming={streaming}
      />
    );
    rendered = render(tree('[site]\n\nheading', true));
    await renderTicks();

    rendered.rerender(tree(source, true));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(rendered.lastFrame()).toContain('[site]');

    rendered.rerender(tree(source, false));
    await renderTicks();

    expect(rendered.lastFrame()).toContain(
      'site (https://example.com)',
    );
  });

  test('stacks a wide table when the terminal is too narrow', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='wide-table'
        source={[
          '| Name | Type | Status | Owner | Notes |',
          '| --- | --- | --- | --- | --- |',
          '| alpha | service | active | team | first |',
        ].join('\n')}
      />,
    );
    Object.defineProperty(rendered.stdout, 'columns', {
      configurable: true,
      value: 20,
    });
    rendered.stdout.emit('resize');
    await renderTicks();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('Row 1');
    expect(frame).toContain('Name:');
    expect(frame).toContain('alpha');
    expect(frame).not.toContain('┌');
  });

  test('uses natural table widths', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='full-width-table'
        source={[
          '| Name | Type |',
          '| --- | --- |',
          '| foo | bar |',
          '| longer value | qux |',
        ].join('\n')}
      />,
    );
    Object.defineProperty(rendered.stdout, 'columns', {
      configurable: true,
      value: 60,
    });
    rendered.stdout.emit('resize');
    await renderTicks();

    const dividers = (rendered.lastFrame() ?? '')
      .split('\n')
      .filter(line => line.includes('─'))
      .map(line => stringWidth(line.trimStart()));
    expect(dividers).toEqual([19]);
  });

  test('accounts for link destinations in table widths', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='links-table'
        source={[
          '| Name | Link | Note |',
          '| --- | --- | --- |',
          '| alpha | [site](https://example.com) | ok |',
        ].join('\n')}
      />,
    );
    Object.defineProperty(rendered.stdout, 'columns', {
      configurable: true,
      value: 80,
    });
    rendered.stdout.emit('resize');
    await renderTicks();

    const [header, , row] = (rendered.lastFrame() ?? '').split('\n');
    const dividerColumns = (line = '') => Array.from(line.matchAll(/│/gu))
      .map(match => stringWidth(
        line.slice(0, match.index),
      ));
    expect(dividerColumns(row)).toEqual(dividerColumns(header));
  });

  test('renders header-only tables when stacked', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='header-only-table'
        source={[
          '| A | B | C | D | E |',
          '| --- | --- | --- | --- | --- |',
        ].join('\n')}
      />,
    );
    Object.defineProperty(rendered.stdout, 'columns', {
      configurable: true,
      value: 20,
    });
    rendered.stdout.emit('resize');
    await renderTicks();

    const frame = rendered.lastFrame() ?? '';
    for (const label of ['A', 'B', 'C', 'D', 'E']) {
      expect(frame).toContain(label);
    }
  });

  test('wraps long table cells instead of truncating them', async () => {
    rendered = render(
      <MarkdownMessage
        messageId='wrapped-table'
        source={[
          '| Name | Description |',
          '| --- | --- |',
          '| alpha | this is a long description that should wrap without ellipsis |',
          '| beta | short |',
        ].join('\n')}
      />,
    );
    Object.defineProperty(rendered.stdout, 'columns', {
      configurable: true,
      value: 40,
    });
    rendered.stdout.emit('resize');
    await renderTicks();

    const frame = rendered.lastFrame() ?? '';
    expect(frame).toContain('that should wrap without');
    expect(frame).toContain('ellipsis');
    expect(frame).not.toContain('…');
  });
});

async function renderTicks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}
