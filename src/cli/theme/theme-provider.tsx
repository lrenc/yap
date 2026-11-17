import { createContext, type ReactNode } from 'react';
import { darkTheme } from './dark.ts';
import type { Theme } from './types.ts';

const ThemeContext = createContext<Theme>(darkTheme);

export function ThemeProvider({
  children,
  theme = darkTheme,
}: {
  children: ReactNode;
  theme?: Theme;
}) {
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export { ThemeContext };
