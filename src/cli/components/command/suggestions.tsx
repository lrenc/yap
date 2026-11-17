import { Text } from 'ink';
import type { CommandInfo } from '../../../app/commands.ts';
import { useTheme } from '../../theme/index.ts';
import { Panel } from './panel.tsx';
import { SelectList } from '../select-list.tsx';

const VISIBLE_COMMANDS = 5;

export function Suggestions({
  input,
  commands,
  selectedIndex,
}: {
  input: string;
  commands: readonly CommandInfo[];
  selectedIndex: number;
}) {
  const theme = useTheme();
  if (!input.startsWith('/') || /\s/u.test(input)) {
    return null;
  }
  const suggestions = commands.slice(0, VISIBLE_COMMANDS);
  const visibleRows = Math.max(1, suggestions.length);

  return (
    <Panel
      height={VISIBLE_COMMANDS}
    >
      {suggestions.length > 0 ? (
        <SelectList
          labelWidth={12}
          items={suggestions.map(command => ({
            key: command.name,
            label: command.name,
            detail: command.description,
          }))}
          selectedIndex={selectedIndex}
        />
      ) : (
        <Text color={theme.colors.text.muted}>No matching commands</Text>
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
