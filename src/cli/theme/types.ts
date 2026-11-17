export interface Theme {
  colors: {
    text: {
      primary: string;
      secondary: string;
      muted: string;
    };
    feedback: {
      info: string;
      warning: string;
      error: string;
    };
    surface: {
      composer: string;
      userMessage: string;
    };
    role: {
      userPrompt: string;
      agent: string;
      path: string;
      refusal: string;
      activity: string;
    };
    selection: {
      active: string;
      label: string;
      detail: string;
      checked: string;
    };
    markdown: {
      heading: string;
      subheading: string;
      link: string;
      cursor: string;
      inlineCode: string;
      inlineCodeBackground: string;
      codeText: string;
      codeBackground: string;
      treeBranch: string;
      tableHeaderRule: string;
      tableRowRule: string;
      tableColumnRule: string;
    };
    brand: {
      logo: {
        red: string;
        green: string;
        blue: string;
        white: string;
        black: string;
      };
    };
  };
}
