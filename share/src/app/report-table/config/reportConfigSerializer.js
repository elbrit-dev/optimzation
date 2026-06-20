function pad(level) {
  return '    '.repeat(level);
}

function toJsStringLiteral(s) {
  return (
    '"' +
    String(s)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') +
    '"'
  );
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
    const itemPad = pad(level + 1);
    const items = val.map((v) => itemPad + serializeValue(v, level + 1));
    return '[\n' + items.join(',\n') + ',\n' + pad(level) + ']';
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val);
    if (entries.length === 0) return '{}';
    const propPad = pad(level + 1);
    const lines = entries.map(([k, v]) => {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : toJsStringLiteral(k);
      return propPad + key + ': ' + serializeValue(v, level + 1);
    });
    return '{\n' + lines.join(',\n') + ',\n' + pad(level) + '}';
  }
  return String(val);
}

/** Serialize a report config object to a JS object literal string (no export wrapper). */
export function serializeReportConfigToJs(configObj) {
  return serializeValue(configObj, 0);
}
