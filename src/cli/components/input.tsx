import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Text,
  Box,
  measureElement,
  useBoxMetrics,
  useCursor,
  useInput as useInkInput,
  type DOMElement,
} from 'ink';
import stringWidth from 'string-width';
import {
  editInput,
  layoutInput,
  moveVerticalCursor,
  type InputLayout,
} from '../state/input.ts';
import type { Draft } from '../types.ts';

const DEFAULT_MAX_ROWS = 8;
const EMPTY_LAYOUT: InputLayout = {
  rows: [],
  activeRow: 0,
  activeColumn: 0,
};

export interface InputProps {
  draft: Draft;
  focus: boolean;
  placeholder: string;
  maxRows?: number;
  onDraftChange?: (draft: Draft) => void;
  onSubmit?: (value: string) => void;
}

export function Input({
  draft,
  focus,
  placeholder,
  maxRows = DEFAULT_MAX_ROWS,
  onDraftChange,
  onSubmit,
}: InputProps) {
  const { value, cursor } = draft;
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);
  const { setCursorPosition } = useCursor();
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const preferredColumn = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    const { x, y } = measureElement(ref.current);
    setOrigin(previous => (
      previous.x === x && previous.y === y ? previous : { x, y }
    ));
  });

  const displayValue = value || placeholder;
  const displayCursor = value ? cursor : 0;
  const canLayout = hasMeasured && width > 0;
  const layout = useMemo(() => (canLayout
    ? layoutInput(displayValue, displayCursor, width)
    : EMPTY_LAYOUT
  ), [canLayout, displayValue, displayCursor, width]);
  const { rows, activeRow, activeColumn } = layout;
  const start = Math.min(
    Math.max(0, activeRow - maxRows + 1),
    Math.max(0, rows.length - maxRows),
  );
  const activeLine = rows[activeRow];

  useInkInput((input, key) => {
    if (key.upArrow || key.downArrow) {
      const column = preferredColumn.current ?? activeColumn;
      const next = moveVerticalCursor(
        draft,
        layout,
        key.upArrow ? 'up' : 'down',
        column,
      );
      if (next !== draft) {
        preferredColumn.current = column;
        onDraftChange?.(next);
      }
      return;
    }

    preferredColumn.current = null;
    if (key.return) {
      if (key.shift || key.meta) {
        onDraftChange?.(editInput(draft, '\n'));
        return;
      }
      onSubmit?.(draft.value);
      return;
    }
    onDraftChange?.(editInput(draft, input, key));
  }, { isActive: focus });

  setCursorPosition(focus && activeLine ? {
    x: origin.x + stringWidth(
      activeLine.text.slice(0, activeLine.cursor)
    ),
    y: origin.y + activeRow - start,
  } : undefined);

  return (
    <Box ref={ref} flexDirection='column' flexGrow={1} flexBasis={0} minWidth={0}>
      {rows.slice(start, start + maxRows).map((line, index) => (
        <Text
          key={index}
          color={value ? '#E6E6E6' : '#B4B5BC'}
          wrap='truncate-end'
        >
          {line.text}
        </Text>
      ))}
    </Box>
  );
}
