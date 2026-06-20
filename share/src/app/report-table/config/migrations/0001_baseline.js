export const version = 1;
export const description = 'Add configVersion field and set to 1';

/** @param {object} config */
export function up(config) {
  return { ...config, configVersion: 1 };
}
