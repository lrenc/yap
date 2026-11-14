import { Box, Text } from 'ink';

export interface SelectListItem {
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
  return (
    <Box flexDirection='column'>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        const label = (
          <Text color={selected ? '#61AFEF' : '#C6C7CD'}>
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
              <Text color='#7F848E'>  {item.detail}</Text>
            ) : null}
            {item.checked ? (
              <Text color={selected ? '#61AFEF' : '#C6C7CD'}>  ✓</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
