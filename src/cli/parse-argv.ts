export type ParsedArgv = {
  command: string;
  args: Record<string, unknown>;
  json: boolean;
  stdinJson: boolean;
};

/** Flags that may be repeated to pass several values. */
const MULTI_VALUE_FLAGS = new Set(['var']);

export function parseArgv(argv: string[]): ParsedArgv {
  const positional: string[] = [];
  const args: Record<string, unknown> = {};
  let json = false;
  let stdinJson = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--stdin-json') {
      stdinJson = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else if (MULTI_VALUE_FLAGS.has(key) && key in args) {
        // `--var A=1 --var B=2` (config set-env): keep every value. Any other
        // repeated flag resolves to its last value, which the scope guard
        // relies on. A flag passed once still arrives as a plain string.
        const prev = args[key];
        args[key] = Array.isArray(prev) ? [...prev, next] : [prev as string, next];
        i++;
      } else {
        args[key] = next;
        i++;
      }
      continue;
    }
    positional.push(arg);
  }

  // Join all positionals with dashes to form the command name.
  // If the full name isn't a command, the dispatcher will try trimming
  // the last segment and using it as the target ID (e.g. `groups get abc`
  // → command "groups-get", id "abc").
  return { command: positional.join('-'), args, json, stdinJson };
}
