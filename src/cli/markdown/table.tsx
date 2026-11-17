import {
  Fragment,
  useRef,
  type ReactNode,
} from 'react';
import {
  Box,
  Text,
  useBoxMetrics,
  useWindowSize,
  type DOMElement,
} from 'ink';
import stringWidth from 'string-width';
import { MarkdownCursor } from './cursor.tsx';
import { InlineContent, inlineText } from './inline.tsx';
import { blockSpacing } from './layout.ts';
import type { InlineNode } from './types.ts';
import { useTheme, type Theme } from '../theme/index.ts';

type Alignment = 'center' | 'left' | 'right';
type MarkdownColors = Theme['colors']['markdown'];

const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export function MarkdownTable({
  header,
  rows,
  align,
  color,
  compact,
  trailing,
}: {
  header: readonly InlineNode[][];
  rows: readonly InlineNode[][][];
  align: readonly ('center' | 'left' | 'right' | null)[];
  color: string | undefined;
  compact: boolean;
  trailing: boolean;
}) {
  const markdown = useTheme().colors.markdown;
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  const { columns } = useWindowSize();
  const headerText = header.map(inlineText);
  const rowText = rows.map(row => row.map(inlineText));
  const available = Math.max(
    1,
    Math.floor(metrics.clientWidth || columns - (compact ? 0 : 5)),
  );
  const widths = tableWidths([headerText, ...rowText], available);

  return (
    <Box {...blockSpacing(compact)} flexDirection='column'>
      <Box ref={ref} width='100%' flexDirection='column'>
        {widths ? (
          tableLayout(
            header, rows, align, widths,
            color, markdown, trailing,
          )
        ) : (
          stackedLayout(header, rows, color, markdown, trailing)
        )}
      </Box>
    </Box>
  );
}

function tableLayout(
  header: readonly InlineNode[][],
  rows: readonly InlineNode[][][],
  align: readonly ('center' | 'left' | 'right' | null)[],
  widths: readonly number[],
  color: string | undefined,
  markdown: MarkdownColors,
  trailing: boolean,
): ReactNode {
  const contentWidth = tableContentWidth(widths);
  const divider = '─'.repeat(contentWidth);
  return (
    <>
      {tableRow(header, widths, align, color, markdown, true)}
      <Text color={markdown.tableHeaderRule} wrap='truncate-end'>
        {divider}
      </Text>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {tableRow(row, widths, align, color, markdown, false)}
        </Fragment>
      ))}
      {trailing ? <MarkdownCursor /> : null}
    </>
  );
}

function stackedLayout(
  header: readonly InlineNode[][],
  rows: readonly InlineNode[][][],
  color: string | undefined,
  markdown: MarkdownColors,
  trailing: boolean,
): ReactNode {
  const labels = header.map(inlineText);
  if (rows.length === 0) {
    return (
      <Box flexDirection='column'>
        {header.map((cell, index) => (
          <Text key={index} bold {...(color ? { color } : {})}>
            <InlineContent nodes={cell} />
          </Text>
        ))}
        {trailing ? <MarkdownCursor /> : null}
      </Box>
    );
  }
  return rows.map((row, rowIndex) => (
    <Box key={rowIndex} flexDirection='column'>
      <Text bold {...(color ? { color } : {})}>Row {rowIndex + 1}</Text>
      {row.map((cell, cellIndex) => (
        <Text key={cellIndex} wrap='wrap'>
          <Text color={markdown.treeBranch}>
            {labels[cellIndex] ?? `Column ${cellIndex + 1}`}:{' '}
          </Text>
          <InlineContent nodes={cell} />
          {trailing
            && rowIndex === rows.length - 1
            && cellIndex === row.length - 1
            ? <MarkdownCursor />
            : null}
        </Text>
      ))}
    </Box>
  ));
}

function tableWidths(
  rows: readonly (readonly string[])[],
  available: number,
): number[] | null {
  const count = Math.max(1, ...rows.map(row => row.length));
  const overhead = Math.max(0, count - 1) * 3;
  const minimum = count * 3 + overhead;
  if (minimum > available) {
    return null;
  }
  const natural = Array.from({ length: count }, (_value, index) => (
    Math.max(
      3,
      ...rows.map(row => stringWidth(row[index] ?? '')),
    )
  ));
  const budget = available - overhead;
  const naturalTotal = natural.reduce((sum, width) => sum + width, 0);
  return naturalTotal <= budget ? natural : shrinkWidths(natural, budget);
}

function tableContentWidth(widths: readonly number[]): number {
  return widths.reduce((total, width) => total + width, 0)
    + Math.max(0, widths.length - 1) * 3;
}

function tableRow(
  cells: readonly InlineNode[][],
  widths: readonly number[],
  align: readonly ('center' | 'left' | 'right' | null)[],
  color: string | undefined,
  markdown: MarkdownColors,
  bold: boolean,
): ReactNode {
  const layouts = widths.map((width, index) => (
    layoutCell(cells[index] ?? [], width)
  ));
  const height = Math.max(1, ...layouts.map(layout => layout.lines.length));
  return Array.from({ length: height }, (_value, lineIndex) => (
    <Text
      key={lineIndex}
      bold={bold}
      {...(color ? { color } : {})}
      wrap='truncate-end'
    >
      {widths.map((width, index) => (
        <Fragment key={index}>
          <MarkdownCellLine
            layout={layouts[index] ?? { lines: [''], nodes: [] }}
            lineIndex={lineIndex}
            width={width}
            align={align[index] ?? 'left'}
          />
          {index < widths.length - 1 ? (
            <Text color={markdown.tableColumnRule}> │ </Text>
          ) : null}
        </Fragment>
      ))}
    </Text>
  ));
}

interface CellLayout {
  lines: string[];
  nodes: readonly InlineNode[] | undefined;
}

function layoutCell(
  nodes: readonly InlineNode[],
  width: number,
): CellLayout {
  const plain = inlineText(nodes).replace(/\s+/gu, ' ').trim();
  const lines = wrapWidth(plain, width);
  return {
    lines,
    nodes: lines.length === 1 ? nodes : undefined,
  };
}

function MarkdownCellLine({
  layout,
  lineIndex,
  width,
  align,
}: {
  layout: CellLayout;
  lineIndex: number;
  width: number;
  align: Alignment;
}): ReactNode {
  const text = layout.lines[lineIndex] ?? '';
  const padding = Math.max(0, width - stringWidth(text));
  let left = 0;
  if (align === 'right') {
    left = padding;
  } else if (align === 'center') {
    left = Math.floor(padding / 2);
  }
  const right = padding - left;
  return (
    <>
      {' '.repeat(left)}
      {lineIndex === 0 && layout.nodes
        ? <InlineContent nodes={layout.nodes} />
        : text}
      {' '.repeat(right)}
    </>
  );
}

function shrinkWidths(
  natural: readonly number[],
  budget: number,
): number[] {
  const widths = [...natural];
  let excess = widths.reduce((sum, width) => sum + width, 0) - budget;
  while (excess > 0) {
    let widest = -1;
    for (let index = 0; index < widths.length; index += 1) {
      const width = widths[index] ?? 3;
      if (
        width > 3
        && (widest < 0 || width > (widths[widest] ?? 3))
      ) {
        widest = index;
      }
    }
    if (widest < 0) {
      break;
    }
    widths[widest] = (widths[widest] ?? 3) - 1;
    excess -= 1;
  }
  return widths;
}

function wrapWidth(value: string, width: number): string[] {
  if (!value) {
    return [''];
  }
  const lines: string[] = [];
  let line = '';
  let lineWidth = 0;
  let lastSpace = -1;

  for (const { segment } of segmenter.segment(value)) {
    const segmentWidth = stringWidth(segment);
    if (segmentWidth === 0) {
      line += segment;
      continue;
    }
    if (lineWidth + segmentWidth > width) {
      if (segment === ' ') {
        lines.push(line.trimEnd());
        line = '';
        lineWidth = 0;
        lastSpace = -1;
        continue;
      }
      if (lastSpace >= 0) {
        lines.push(line.slice(0, lastSpace).trimEnd());
        line = line.slice(lastSpace + 1).trimStart();
        lineWidth = stringWidth(line);
        lastSpace = line.lastIndexOf(' ');
      } else {
        lines.push(line);
        line = '';
        lineWidth = 0;
      }
    }
    line += segment;
    lineWidth += segmentWidth;
    if (segment === ' ') {
      lastSpace = line.length - segment.length;
    }
  }
  lines.push(line.trimEnd());
  return lines.length > 0 ? lines : [''];
}
