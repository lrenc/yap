import { Fragment, memo } from 'react';
import { Box, Text, useWindowSize } from 'ink';
import info from '../../../package.json' with { type: 'json' };
import { isMacOS, isWindows } from '../../utils/env.ts';
import { useTheme } from '../theme/index.ts';

const version = `v${info.version}`;

const logoRows: readonly [string, string][] = [
  ['.BWWWWB.', 'BBWWWWBB'],
  ['BWKWWKWB', 'BWWKKWWB'],
  ['.WWRRWW.', '..G..G..'],
];

export const StartUp = memo(function StartUp() {
  const theme = useTheme();
  const { columns } = useWindowSize();
  const isLimited = process.env.TERM_PROGRAM === 'Apple_Terminal'
    || process.env.TERM === 'dumb';
  const showLogo = columns >= 16 + version.length
    && !isLimited;

  return (
    <Box paddingX={1} paddingTop={1} flexDirection='column' rowGap={1}>
      <Box columnGap={2}>
        <Box flexShrink={0}>
          {showLogo ? <Logo /> : <Text bold>YAP</Text>}
        </Box>
        <Box flexDirection='column' flexGrow={1} minWidth={0}>
          <Text wrap='truncate-end'>
            {showLogo && <Text bold>YAP </Text>}
            <Text dimColor>{version}</Text>
          </Text>
          <Text dimColor wrap='truncate-end'>
            / commands · Enter send · Ctrl+C exit
          </Text>
        </Box>
      </Box>
      {isLimited && (
        <Text color={theme.colors.feedback.warning} wrap='wrap'>
          For a better experience, use a recommended terminal:
          {' '}{getTerminals()}
        </Text>
      )}
    </Box>
  );
});

function getTerminals(): string {
  if (isMacOS()) {
    return 'iTerm2 or Ghostty';
  }
  if (isWindows()) {
    return 'Windows Terminal or WezTerm';
  }
  return 'GNOME Terminal or Kitty';
}

function Logo() {
  const theme = useTheme();
  const colored = !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0';
  const palette: Record<string, string> = {
    R: theme.colors.brand.logo.red,
    G: theme.colors.brand.logo.green,
    B: theme.colors.brand.logo.blue,
    W: theme.colors.brand.logo.white,
    K: theme.colors.brand.logo.black,
  };

  return (
    <Text>
      {logoRows.map(([top, bottom], index) => (
        <Fragment key={index}>
          {index > 0 && '\n'}
          {Array.from(top, (pixel, column) => (
            <LogoCell
              key={column}
              top={pixel}
              bottom={bottom.charAt(column)}
              colored={colored}
              palette={palette}
            />
          ))}
        </Fragment>
      ))}
    </Text>
  );
}

function LogoCell({ top, bottom, colored, palette }: {
  top: string;
  bottom: string;
  colored: boolean;
  palette: Readonly<Record<string, string>>;
}) {
  const upper = !colored && top === 'K' ? undefined : palette[top];
  const lower = !colored && bottom === 'K' ? undefined : palette[bottom];
  let char = ' ';

  if (upper && lower) {
    char = colored && upper !== lower ? '\u2580' : '\u2588';
  } else if (upper) {
    char = '\u2580';
  } else if (lower) {
    char = '\u2584';
  }

  const foreground = upper ?? lower;
  const background = char === '\u2580' && upper ? lower : undefined;

  return (
    <Text
      {...(colored && foreground ? { color: foreground } : {})}
      {...(colored && background ? { backgroundColor: background }: {})}
    >
      {char}
    </Text>
  );
}
