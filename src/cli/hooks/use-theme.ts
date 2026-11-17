import { useContext } from 'react';
import { ThemeContext } from '../theme/theme-provider.tsx';

export function useTheme() {
  return useContext(ThemeContext);
}
