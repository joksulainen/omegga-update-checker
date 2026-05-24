export const PLUGIN_ANSI = '\x1b[92m';

export function ansiWrapper(ansi: string, string: string): string {
  return ansi + string + '\x1b[0m';
}
