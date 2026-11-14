import { Text } from 'ink';
import { suggestCommands } from '../../../app/commands.ts';
import { Panel } from './panel.tsx';
import { SelectList } from '../select-list.tsx';

const VISIBLE_COMMANDS = 5;

export function Suggestions({
  input,
  selectedIndex,
}: {
  input: string;
  selectedIndex: number;
}) {
  if (!input.startsWith('/') || /\s/u.test(input)) {
    return null;
  }
  const suggestions = suggestCommands(input).slice(0, VISIBLE_COMMANDS);
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
