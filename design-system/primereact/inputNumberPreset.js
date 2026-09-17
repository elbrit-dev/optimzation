/* PrimeReact InputNumber — design-system PassThrough preset.
 *
 * Part of the input cluster (structural rule B in
 * docs/PRIMEREACT_SWEEP.md): InputNumber renders an InputText internally, so it
 * has to come off the theme at the same time as `inputtext` joins the registry.
 *
 * Small on purpose. The inner field's styling comes from the global `inputtext`
 * entry — that instance inherits `unstyled` from this component — so all this
 * adds is the wrapper and the optional spinner buttons.
 */
const SPIN =
  'inline-flex w-6 items-center justify-center rounded-sm text-ds-secondary ' +
  'transition-colors hover:bg-brand-tint-weak hover:text-brand-text';

export const inputNumberPt = {
  root: { className: 'relative inline-flex w-full items-stretch' },
  buttonGroup: { className: 'flex flex-col' },
  incrementButton: { root: SPIN },
  decrementButton: { root: SPIN },
};

export default inputNumberPt;
