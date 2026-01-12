export const saveSettingsForDataSource = (dataSource, settings) => {
  if (typeof window === 'undefined') return;
  const key = `table_settings_${dataSource}`;
  localStorage.setItem(key, JSON.stringify(settings));
};

export const loadSettingsForDataSource = (dataSource) => {
  if (typeof window === 'undefined') return null;
  const key = `table_settings_${dataSource}`;
  const saved = localStorage.getItem(key);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error('Error parsing saved settings', e);
    return null;
  }
};

