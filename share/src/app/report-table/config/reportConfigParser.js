export function deserializeReportConfig(jsString) {
  if (!jsString?.trim()) return null;
  try {
    const code = jsString.trim().replace(/;\s*$/, '').trim();
    const result = new Function('return (' + code + ')')();
    if (result === null || typeof result !== 'object' || Array.isArray(result)) return null;
    return result;
  } catch {
    return null;
  }
}
