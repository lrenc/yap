export type InlineNode =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'strong' | 'em' | 'del';
    children: InlineNode[];
  }
  | {
    type: 'code';
    text: string;
  }
  | {
    type: 'link';
    href: string;
    children: InlineNode[];
  }
  | {
    type: 'break';
  };

export type MarkdownBlock =
  | {
    type: 'paragraph';
    children: InlineNode[];
  }
  | {
    type: 'heading';
    depth: number;
    children: InlineNode[];
  }
  | {
    type: 'code';
    language: string | undefined;
    text: string;
  }
  | {
    type: 'list';
    ordered: boolean;
    start: number;
    items: MarkdownBlock[][];
  }
  | {
    type: 'quote';
    blocks: MarkdownBlock[];
  }
  | {
    type: 'table';
    header: InlineNode[][];
    rows: InlineNode[][][];
    align: ('center' | 'left' | 'right' | null)[];
  }
  | {
    type: 'tree';
    text: string;
  }
  | {
    type: 'hr';
  };
