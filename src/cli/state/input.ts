import stringWidth from 'string-width';
import type { Key } from 'ink';
import type { Draft } from '../types.ts';

export interface CursorStop {
  column: number;
  sourceIndex: number;
}

export interface InputRow {
  text: string;
  cursor: number;
  stops: CursorStop[];
}

export interface InputLayout {
  rows: InputRow[];
  activeRow: number;
  activeColumn: number;
}

const segmenter = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

export function normalizeCursor(value: string, cursor: number): number {
  if (!Number.isFinite(cursor)) {
    return 0;
  }

  const position = Math.min(
    Math.max(Math.trunc(cursor), 0),
    value.length,
  );
  if (position === 0 || position === value.length) {
    return position;
  }

  const part = segmenter.segment(value).containing(position);
  if (!part) {
    return value.length;
  }
  const start = part.index;
  const end = start + part.segment.length;
  return position - start < end - position ? start : end;
}

export function createDraft(value: string, cursor = value.length): Draft {
  return {
    value,
    cursor: normalizeCursor(value, cursor),
  };
}

export function editInput(draft: Draft, text: string, key?: Key): Draft {
  const normalized = createDraft(draft.value, draft.cursor);
  if (key && (
    key.ctrl || key.meta
    || key.escape || key.tab || key.return
    || key.upArrow || key.downArrow || key.pageUp || key.pageDown
    || key.eventType === 'release'
  )) {
    return normalized;
  }

  const { value, cursor } = normalized;
  const parts = segmenter.segment(value);
  const prev = parts.containing(cursor - 1)?.index ?? 0;
  const part = parts.containing(cursor);
  const next = part ? part.index + part.segment.length : value.length;
  if (
    key?.leftArrow || key?.rightArrow
    || key?.home || key?.end
  ) {
    let offset = key.leftArrow ? prev : next;
    if (key.home || key.end) {
      offset = key.home ? 0 : value.length;
    }
    return offset === cursor ? normalized : {
      value, cursor: offset,
    };
  }
  const start = key?.backspace ? prev : cursor;
  const end = key?.delete ? next : cursor;
  const inserted = key?.backspace || key?.delete ? '' : text;
  const updated = value.slice(0, start) + inserted + value.slice(end);
  if (updated === value) {
    return normalized;
  }
  return {
    value: updated,
    cursor: normalizeCursor(updated, start + inserted.length),
  };
}

function isLineBreak(segment: string): boolean {
  return (
    segment === '\n'
    || segment === '\r\n'
    || segment === '\r'
  );
}

export function layoutInput(
  value: string,
  cursor: number,
  columns: number,
): InputLayout {
  const widthLimit = Number.isFinite(columns)
    ? Math.max(1, Math.floor(columns))
    : 1;
  const normalizedCursor = normalizeCursor(value, cursor);
  const rows: InputRow[] = [];
  let row: InputRow = { text: '', cursor: -1, stops: [] };
  let width = 0;
  let activeRow = -1;
  let activeColumn = -1;

  const newLine = function(): void {
    rows.push(row);
    row = { text: '', cursor: -1, stops: [] };
    width = 0;
  };

  const recordStop = function(sourceIndex: number): void {
    const previous = row.stops.at(-1);
    if (
      previous?.sourceIndex === sourceIndex
      && previous.column === width
    ) {
      return;
    }
    row.stops.push({
      column: width,
      sourceIndex,
    });
    if (sourceIndex === normalizedCursor && activeRow < 0) {
      activeRow = rows.length;
      activeColumn = width;
      row.cursor = row.text.length;
    }
  };

  const parts = [
    ...segmenter.segment(value),
    { segment: '', index: value.length },
  ];
  for (const { segment, index } of parts) {
    const active = index === normalizedCursor;
    const lineBreak = isLineBreak(segment);
    let text = segment;
    if (lineBreak || segment === '') {
      text = active ? ' ' : '';
    } else if (segment === '\t') {
      text = ' '.repeat(Math.min(4 - width % 4, widthLimit));
    }
    const size = stringWidth(text);
    if (width + size > widthLimit && width > 0) {
      newLine();
    }
    recordStop(index);
    row.text += text;
    width += size;
    if (lineBreak) {
      newLine();
    }
  }
  rows.push(row);

  return {
    rows,
    activeRow: Math.max(0, activeRow),
    activeColumn: Math.max(0, activeColumn),
  };
}

function nearestStop(stops: CursorStop[], column: number): CursorStop {
  return stops.reduce((nearest, stop) => (
    Math.abs(stop.column - column) < Math.abs(nearest.column - column)
      ? stop
      : nearest
  ));
}

export function moveVerticalCursor(
  draft: Draft,
  layout: InputLayout,
  direction: 'up' | 'down',
  preferredColumn = layout.activeColumn,
): Draft {
  const targetRow = layout.activeRow + (direction === 'up' ? -1 : 1);
  const row = layout.rows[targetRow];
  if (!row) {
    return draft;
  }

  const target = nearestStop(row.stops, preferredColumn);
  return target.sourceIndex === draft.cursor
    ? draft
    : {
      value: draft.value,
      cursor: target.sourceIndex,
    };
}
