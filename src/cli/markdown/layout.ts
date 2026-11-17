export const ASSISTANT_INDENT = {
  left: 3,
  right: 2,
} as const;

export function blockSpacing(compact: boolean): {
  paddingLeft?: number;
  paddingRight?: number;
  marginBottom?: number;
} {
  return compact ? {} : {
    paddingLeft: ASSISTANT_INDENT.left,
    paddingRight: ASSISTANT_INDENT.right,
    marginBottom: 1,
  };
}
