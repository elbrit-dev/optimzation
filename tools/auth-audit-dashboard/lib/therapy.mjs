/**
 * Brand -> therapy area.
 *
 * ERP has no therapy field: the closest thing is `Item.custom_therapeutic_class`,
 * which is prose ("• Sulfonylurea (3rd generation)"), not one of these eleven
 * areas. So this map is lifted from the company's OWN export
 * (Sales Invoice-34.xlsx, Apr-Jun 2024, 49,821 lines) rather than invented: in
 * that file therapy is perfectly consistent per brand — 57 brands, 57 therapies,
 * zero conflicts — so brand is the right key, and a NEW item under a known brand
 * inherits its therapy automatically.
 *
 * TRIGLIMIBRIT is deliberately absent: it carries no therapy in their file either,
 * and guessing one (it is a diabetes combination) would be inventing data. It shows
 * as blank, which is the truth.
 */
export const BRAND_THERAPY = {
  "ACEBRIT": "Pain Management",
  "AMOXIBRIT": "Antibiotics",
  "ARNIBLOC": "Cardiovascular",
  "AURAGEST": "Gynaecology",
  "BENISTAR": "Cardiovascular",
  "BISOBRIT": "Cardiovascular",
  "BRITORVA": "Cardiovascular",
  "BRITVIT": "Vitamins",
  "BRITVOG": "Anti Diabetes",
  "C FERT": "Gynaecology",
  "CALBRIT": "Vitamins",
  "CARTITAB": "Bone Health",
  "CHLORVIX": "Cardiovascular",
  "CILNITAB": "Cardiovascular",
  "CITIBRIT": "Neurology",
  "CZD": "Vitamins",
  "DABITON": "Cardiovascular",
  "DAFAX": "Diabetes",
  "DROXIT": "Gynaecology",
  "ELPROL": "Cardiovascular",
  "ELVIX": "Diabetes",
  "EXIPAM": "Neurology",
  "FENZIT": "Gynaecology",
  "FERTIBRIT": "Gynaecology",
  "FOFA": "Gynaecology",
  "FOLBRIT": "Gynaecology",
  "GLIMIBRIT": "Diabetes",
  "GLIZATO": "Diabetes",
  "IEN": "Vitamins",
  "LARGIX": "Gynaecology",
  "LINATO": "Diabetes",
  "MAXFLORA": "Probiotics",
  "MY20": "Vitamins",
  "MYCISS": "Pain Management",
  "MYCLOP": "Cardiovascular",
  "MYGUT": "Probiotics",
  "MYMAG": "Vitamins",
  "MYWASH": "Gynaecology",
  "NEBILOC": "Cardiovascular",
  "NERO": "Diabetes",
  "NEURONZ": "Vitamins",
  "OLMETOP": "Cardiovascular",
  "ONLY E": "Vitamins",
  "ONLY Q": "Diabetes",
  "PANBRIT": "Anti Diabetes",
  "PREGABRIT": "Diabetes",
  "RABRITON": "Gastroentrology",
  "ROZULA": "Cardiovascular",
  "RUTONZ": "Pain Management",
  "SITADOC": "Diabetes",
  "TELBRIT": "Cardiovascular",
  "TENLIBRIT": "Diabetes",
  "TENLITAB": "Diabetes",
  "TICABRIT": "Cardiovascular",
  "TORBRIT": "Cardiovascular",
  "VEINEX": "Cardiovascular",
  "VILZATO": "Diabetes",
}

/** Therapy areas actually in use, for the filter. */
export const THERAPIES = [...new Set(Object.values(BRAND_THERAPY))].sort()

/** Brands that belong to one therapy — how a therapy filter becomes a brand filter. */
export const brandsForTherapy = (therapy) =>
  Object.entries(BRAND_THERAPY).filter(([, t]) => t === therapy).map(([b]) => b)

export const therapyForBrand = (brand) => BRAND_THERAPY[String(brand || '').trim()] || ''
