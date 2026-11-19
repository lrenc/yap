const invalidNameChars = /[<>:"/\\|?*\p{Cc}\s]/u;
const reservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export function isValidPromptName(name: string): boolean {
  const length = Array.from(name).length;
  return (
    length >= 1
    && length <= 16
    && name !== 'default'
    && name !== '.'
    && name !== '..'
    && !name.endsWith('.')
    && !invalidNameChars.test(name)
    && !reservedName.test(name)
  );
}
