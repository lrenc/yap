import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/index.ts';

interface SelectListItem {
  key: string;
  label: string;
  detail?: string;
  checked?: boolean;
}

export function SelectList({
  items,
  selectedIndex,
  labelWidth,
  maxRows,
}: {
  items: readonly SelectListItem[];
  selectedIndex: number;
  labelWidth?: number;
  maxRows?: number | undefined;
}) {
  const theme = useTheme();
  const [windowStart, setWindowStart] = useState(0);
  const rowLimit = Math.min(
    items.length,
    Math.max(1, maxRows ?? items.length),
  );
  const maxStart = Math.max(0, items.length - rowLimit);
  const anchor = Math.min(Math.max(0, windowStart), maxStart);
  const activeIndex = Math.min(
    Math.max(0, selectedIndex),
    Math.max(0, items.length - 1),
  );
  const start = activeIndex < anchor
    ? activeIndex
    : activeIndex >= anchor + rowLimit
      ? Math.min(activeIndex - rowLimit + 1, maxStart)
      : anchor;

  useEffect(() => {
    if (start !== windowStart) {
      setWindowStart(start);
    }
  }, [start, windowStart]);

  return (
    <Box flexDirection='column'>
      {items.slice(start, start + rowLimit).map((item, offset) => {
        const index = start + offset;
        const selected = index === activeIndex;
        const label = (
          <Text color={selected
            ? theme.colors.selection.active
            : theme.colors.selection.label}
          >
            {selected ? '›' : ' '} {item.label}
          </Text>
        );
        return (
          <Box key={item.key} height={1} flexShrink={0}>
            {labelWidth === undefined ? label : (
              <Box width={labelWidth} flexShrink={0}>
                {label}
              </Box>
            )}
            {item.detail !== undefined ? (
              <Text color={theme.colors.selection.detail}>
                {'  '}{item.detail}
              </Text>
            ) : null}
            {item.checked ? (
              <Text color={selected
                ? theme.colors.selection.checked
                : theme.colors.selection.label}
              >
                {'  ✓'}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
