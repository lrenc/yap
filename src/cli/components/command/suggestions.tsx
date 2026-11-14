import { Box, Text } from 'ink';
import { suggestCommands } from '../../../app/commands.ts';
import { Panel } from './panel.tsx';

const VISIBLE_COMMANDS = 5;

export function Suggestions({ input }: { input: string }) {
  if (!input.startsWith('/') || /\s/u.test(input)) {
    return null;
  }
  const suggestions = suggestCommands(input).slice(0, VISIBLE_COMMANDS);
  const visibleRows = Math.max(1, suggestions.length);

  return (
    <Panel
      height={VISIBLE_COMMANDS}
      paddingX={3}
    >
      {suggestions.length > 0 ? suggestions.map(command => (
        <Box key={command.name} height={1} flexShrink={0}>
          <Box width={12} flexShrink={0}>
            <Text color='#61AFEF'>{command.name}</Text>
          </Box>
          <Text color='#B4B5BC' wrap='truncate-end'>
            {command.description}
          </Text>
        </Box>
      )) : (
        <Text color='#7F848E'>No matching commands</Text>
      )}
      {Array.from(
        { length: VISIBLE_COMMANDS - visibleRows },
        (_value, index) => (
          <Text key={`padding-${index}`}> </Text>
        ),
      )}
    </Panel>
  );
}
