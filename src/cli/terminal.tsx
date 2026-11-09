import { Static, Box } from 'ink';
import { Composer } from './components/composer.tsx';
import { StartUp } from './components/startup.tsx';
import { createDraft } from './state/input.ts';

const startupItems: 'startup'[] = ['startup'];
const initialDraft = createDraft('');

export function Terminal() {
  return (
    <>
      <Static items={startupItems}>
        {() => (
          <Box key='startup' flexDirection='column' marginBottom={1}>
            <StartUp />
          </Box>
        )}
      </Static>
      <Composer draft={initialDraft} />
    </>
  );
}
