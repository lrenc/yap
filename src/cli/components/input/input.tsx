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
  usePaste,
  type DOMElement,
} from 'ink';
import stringWidth from 'string-width';
import {
  createDraft,
  editInput,
  layoutInput,
  moveVerticalCursor,
  type InputLayout,
} from '../../state/input.ts';
import type { Draft } from '../../types.ts';

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
  onEscape?: () => void;
  onSubmit?: (value: string) => void;
}

export function Input({
  draft,
  focus,
  placeholder,
  maxRows = DEFAULT_MAX_ROWS,
  onDraftChange,
  onEscape,
  onSubmit,
}: InputProps) {
  const { value, cursor } = draft;
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);
  const { setCursorPosition } = useCursor();
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const draftRef = useRef(draft);
  const preferredColumn = useRef<number | null>(null);

  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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
  const { rows, activeRow } = layout;
  const start = Math.min(
    Math.max(0, activeRow - maxRows + 1),
    Math.max(0, rows.length - maxRows),
  );
  const activeLine = rows[activeRow];

  const changeDraft = (change: (current: Draft) => Draft): void => {
    const current = draftRef.current;
    const next = change(current);
    if (next === current) {
      return;
    }
    draftRef.current = next;
    onDraftChange?.(next);
  };

  const submitDraft = (): void => {
    const submit = onSubmit;
    if (!submit) {
      return;
    }
    const value = draftRef.current.value;
    changeDraft(() => createDraft(''));
    submit(value);
  };

  useInkInput((input, key) => {
    if (key.eventType === 'release') {
      return;
    }
    if (key.escape) {
      onEscape?.();
      return;
    }
    if (key.upArrow || key.downArrow) {
      changeDraft(current => {
        const currentLayout = canLayout
          ? layoutInput(current.value, current.cursor, width)
          : layout;
        const column = preferredColumn.current
          ?? currentLayout.activeColumn;
        const next = moveVerticalCursor(
          current,
          currentLayout,
          key.upArrow ? 'up' : 'down',
          column,
        );
        if (next !== current) {
          preferredColumn.current = column;
        }
        return next;
      });
      return;
    }
    preferredColumn.current = null;
    if (key.return) {
      if (key.shift || key.meta) {
        changeDraft(current => editInput(current, '\n'));
        return;
      }
      submitDraft();
      return;
    }
    // Ink may deliver text and Enter bytes together in one input event.
    const parts = input.split(/\r\n?/u);
    if (parts.length > 1) {
      for (const [index, part] of parts.entries()) {
        if (part) {
          changeDraft(current => editInput(current, part, key));
        }
        if (index < parts.length - 1) {
          submitDraft();
        }
      }
      return;
    }

    changeDraft(current => editInput(current, input, key));
  }, { isActive: focus });

  usePaste(text => {
    preferredColumn.current = null;
    changeDraft(current => editInput(current, text));
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
