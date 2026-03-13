function indent(str, level) {
  const pad = '    '.repeat(level);
  return str.split('\n').map(line => pad + line).join('\n');
}

/** Escape a string for use as a JS double-quoted string literal */
function toJsStringLiteral(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t') + '"';
}

function serializeValue(val, level = 0) {
  if (val === null || val === undefined) return String(val);
  if (typeof val === 'function') return val.toString();
  if (typeof val === 'boolean' || typeof val === 'number') return String(val);
  if (typeof val === 'string') {
    if (val.includes('\n')) {
      return '`' + val.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
    }
    return toJsStringLiteral(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const items = val.map(v => indent(serializeValue(v, level + 1), level + 1));
    return '[\n' + items.join(',\n') + ',\n' + '    '.repeat(level) + ']';
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([k, v]) => {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : toJsStringLiteral(k);
      return indent(key + ': ' + serializeValue(v, level + 1), level + 1);
    });
    return '{\n' + lines.join(',\n') + ',\n' + '    '.repeat(level) + '}';
  }
  return String(val);
}

const EXPORT_PREFIX = 'export const defaultDataTableConfig = ';
const EXPORT_SUFFIX = ';\n';

export function serializeConfigToJs(configObj) {
  const objectStr = serializeValue(configObj, 0);
  return '/**\n * DataTable config preset\n */\n' + EXPORT_PREFIX + objectStr + EXPORT_SUFFIX;
}

export function deserializeJsToConfig(jsString) {
  let toEval = jsString.trim();
  // Strip optional leading comment block (serializer adds /** ... */ before export)
  toEval = toEval.replace(/^\/\*\*[\s\S]*?\*\/\s*/s, '');
  // Strip export const defaultDataTableConfig = 
  toEval = toEval.replace(/^export\s+const\s+defaultDataTableConfig\s*=\s*/s, '');
  // Strip trailing semicolon
  toEval = toEval.replace(/;\s*$/s, '').trim();
  // eslint-disable-next-line no-new-func
  return new Function('return (' + toEval + ')')();
}
