import {
  useEffect,
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
  createDraft,
  editInput,
  layoutInput,
} from '../state/input.ts';
import type { Draft } from '../types.ts';

const VISIBLE_ROWS = 3;

export interface InputProps {
  draft: Draft;
  focus: boolean;
  placeholder: string;
  onSubmit?: (value: string) => void;
}

export function Input({
  draft,
  focus,
  placeholder,
  onSubmit,
}: InputProps) {
  const [editingDraft, setEditingDraft] = useState<Draft>(
    () => createDraft(draft.value, draft.cursor),
  );
  const { value, cursor } = editingDraft;
  const ref = useRef<DOMElement>(null);
  const { width, hasMeasured } = useBoxMetrics(ref);
  const { setCursorPosition } = useCursor();
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setEditingDraft(current => (
      current.value === draft.value && current.cursor === draft.cursor
        ? current
        : createDraft(draft.value, draft.cursor)
    ));
  }, [draft.value, draft.cursor]);

  useInkInput((input, key) => {
    if (key.return) {
      onSubmit?.(editingDraft.value);
      return;
    }
    setEditingDraft(current => editInput(current, input, key));
  }, { isActive: focus });

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
  const lines = useMemo(() => (
    canLayout
      ? layoutInput(displayValue, displayCursor, width)
      : []
  ), [canLayout, displayValue, displayCursor, width]);
  const activeRow = Math.max(
    0,
    lines.findIndex(line => line.cursor >= 0),
  );
  const start = Math.max(0, activeRow - (VISIBLE_ROWS - 1));
  const activeLine = lines[activeRow];

  setCursorPosition(focus && activeLine ? {
    x: origin.x + stringWidth(
      activeLine.text.slice(0, activeLine.cursor)
    ),
    y: origin.y + activeRow - start,
  } : undefined);

  return (
    <Box ref={ref} flexDirection='column' flexGrow={1} flexBasis={0} minWidth={0}>
      {lines.slice(start, start + VISIBLE_ROWS).map((line, index) => (
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
