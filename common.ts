export const PLUGIN_ANSI = '\x1b[92m';

export const PLUGIN_FOLDER = './plugins';

export function ansiWrapper(ansi: string, string: string): string {
  return ansi + string + '\x1b[0m';
}
