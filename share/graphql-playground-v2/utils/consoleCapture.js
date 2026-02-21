/**
 * Serialize a value for display in the console. Handles circular references safely.
 */
function serializeForDisplay(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'function') return '[Function]';
      return val;
    }, 2);
  } catch (e) {
    return String(value);
  }
}

/**
 * Run a function while capturing console.log, console.warn, and console.error.
 * @param {Function} fn - Async function to run (will be awaited)
 * @param {Function} onLog - Callback for each log: (level, args) => void. level is 'log'|'warn'|'error', args is the raw arguments array
 * @returns {Promise<*>} The return value of fn
 */
export async function runWithConsoleCapture(fn, onLog) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const capture = (level) => (...args) => {
    if (onLog) onLog(level, args);
    const method = level === 'log' ? originalLog : level === 'warn' ? originalWarn : originalError;
    method.apply(console, args);
  };

  console.log = capture('log');
  console.warn = capture('warn');
  console.error = capture('error');

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

/**
 * Convert raw console args to a display string and preview.
 * @param {Array} args - Raw arguments from console.log/warn/error
 * @returns {{ content: string, preview: string }}
 */
export function argsToLogEntry(args) {
  if (!args || args.length === 0) {
    return { content: '', preview: '' };
  }
  const parts = args.map((arg) => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    return serializeForDisplay(arg);
  });
  const content = parts.join(' ');
  const firstLine = content.split('\n')[0] || '';
  const preview = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  return { content, preview };
}
