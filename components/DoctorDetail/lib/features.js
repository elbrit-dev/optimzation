/**
 * Parts of the doctor detail that are switched OFF for now. Flip one to true to
 * bring it back — the read and the UI both follow this flag, nothing else needs
 * to change.
 *
 *   clinics     the Clinic strip in the hero (chips, address, Map, Directions,
 *               + Add clinic) and the Address read behind it.
 *   pharmacies  the "Rx · N pharmacies" button in the hero and its list. They
 *               are worked out from the POB rows, so there is no read to skip —
 *               only the derivation.
 */
export const FEATURES = Object.freeze({
  clinics: false,
  pharmacies: false,
});
