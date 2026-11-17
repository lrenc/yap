import { palette } from './palette.ts';
import type { Theme } from './types.ts';

export const darkTheme = {
  colors: {
    text: {
      primary: palette.gray100,
      secondary: palette.gray500,
      muted: palette.gray600,
    },
    feedback: {
      info: palette.gray500,
      warning: palette.yellow,
      error: palette.red,
      success: palette.green,
    },
    surface: {
      composer: palette.gray800,
      userMessage: palette.gray850,
      code: palette.gray900,
    },
    role: {
      userPrompt: palette.gray500,
      agent: palette.yellow,
      model: palette.yellow,
      path: palette.green,
      refusal: palette.yellow,
      activity: palette.gray600,
    },
    selection: {
      active: palette.blue,
      label: palette.gray400,
      detail: palette.gray600,
      checked: palette.blue,
    },
    markdown: {
      heading: palette.blue,
      subheading: palette.green,
      link: palette.blue,
      cursor: palette.blue,
      inlineCode: palette.yellow,
      inlineCodeBackground: palette.gray900,
      codeText: palette.gray100,
      codeBackground: palette.gray900,
      treeBranch: palette.gray600,
      tableHeaderRule: palette.gray600,
      tableRowRule: palette.gray700,
      tableColumnRule: palette.gray700,
    },
    brand: {
      logo: {
        red: palette.logoRed,
        green: palette.logoGreen,
        blue: palette.logoBlue,
        white: palette.logoWhite,
        black: palette.logoBlack,
      },
    },
  },
} satisfies Theme;
