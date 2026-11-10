import { Static, Box } from 'ink';
import { Composer } from './components/composer.tsx';
import { StartUp } from './components/startup.tsx';

const startupItems: 'startup'[] = ['startup'];

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
      <Composer />
    </>
  );
}
