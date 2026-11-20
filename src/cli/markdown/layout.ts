export function blockSpacing(compact: boolean): {
  paddingLeft?: number;
  paddingRight?: number;
  marginBottom?: number;
} {
  return compact ? {} : {
    paddingLeft: 3,
    paddingRight: 2,
    marginBottom: 1,
  };
}
