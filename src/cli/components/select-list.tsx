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
}: {
  items: readonly SelectListItem[];
  selectedIndex: number;
  labelWidth?: number;
}) {
  const theme = useTheme();
  return (
    <Box flexDirection='column'>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
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
