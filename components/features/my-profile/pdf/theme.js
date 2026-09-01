import { Font, StyleSheet } from "@react-pdf/renderer";

// DejaVu Sans is the face the ERP's own payslip print format uses, so exports
// generated here sit alongside the ones payroll issues. The bundled files are
// subsets - see public/fonts/README.md. The built-in PDF fonts are WinAnsi and
// have no rupee sign, which is the whole reason for embedding at all.
export const PDF_FONT = "DejaVuSans";

let registered = false;

/** Root-relative paths are not resolved by the renderer - give it an origin. */
export function absoluteAssetUrl(path) {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

export function registerPdfFonts(basePath = "/fonts") {
  if (registered) return;
  const base = absoluteAssetUrl(basePath);
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: `${base}/DejaVuSans.ttf`, fontWeight: "normal" },
      { src: `${base}/DejaVuSans-Bold.ttf`, fontWeight: "bold" },
    ],
  });
  // Long unbroken values (policy numbers, PF account codes) should wrap on
  // character boundaries rather than push a table cell out of shape.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export const COLORS = {
  text: "#111111",
  muted: "#666666",
  heading: "#162653",
  accent: "#EB2027",
  border: "#9a9a9a",
  hairline: "#d7d7d7",
  headRow: "#f2f4f8",
  zebra: "#fafbfd",
};

export const SIZES = {
  micro: 6.5,
  cell: 7,
  small: 7.5,
  body: 8,
  label: 8,
  section: 9,
  title: 10,
  company: 12,
  display: 14,
};

export const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT,
    fontSize: SIZES.body,
    color: COLORS.text,
    paddingTop: 34,
    paddingBottom: 54,
    paddingHorizontal: 34,
    lineHeight: 1.35,
  },

  /* ------------------------------- letterhead ------------------------------ */
  logoSlot: { width: 132, height: 34 },
  logoImage: { width: 132, height: 34, objectFit: "contain", objectPosition: "left center" },
  companyBlock: { alignItems: "center", marginTop: -30, marginBottom: 10 },
  companyName: { fontSize: SIZES.company, fontWeight: "bold", textAlign: "center" },
  companyLine: { fontSize: SIZES.small, textAlign: "center", color: COLORS.text },
  docTitle: { fontSize: SIZES.title, fontWeight: "bold", textAlign: "center", marginTop: 8 },

  /* --------------------------------- layout -------------------------------- */
  row: { flexDirection: "row" },
  col: { flex: 1 },
  gap: { width: 16 },
  spacer8: { height: 8 },
  spacer14: { height: 14 },
  rule: { borderTopWidth: 1, borderTopColor: COLORS.text, marginVertical: 6 },
  hairline: { borderTopWidth: 0.5, borderTopColor: COLORS.hairline, marginVertical: 6 },

  /* ------------------------------ label / value ---------------------------- */
  pairRow: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
  pairLabel: { fontWeight: "bold", paddingRight: 6 },
  pairValue: { flex: 1 },

  /* ---------------------------------- grid --------------------------------- */
  grid: { borderTopWidth: 0.7, borderLeftWidth: 0.7, borderColor: COLORS.border },
  gridRow: { flexDirection: "row" },
  gridCell: {
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRightWidth: 0.7,
    borderBottomWidth: 0.7,
    borderColor: COLORS.border,
    justifyContent: "flex-start",
  },
  gridLabel: { fontSize: SIZES.micro, color: COLORS.muted },
  gridValue: { fontSize: SIZES.cell, color: COLORS.text, marginTop: 1 },

  /* --------------------------------- tables -------------------------------- */
  table: {
    borderTopWidth: 0.7,
    borderLeftWidth: 0.7,
    borderColor: COLORS.border,
  },
  tr: { flexDirection: "row" },
  th: {
    fontWeight: "bold",
    fontSize: SIZES.cell,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 0.7,
    borderBottomWidth: 0.7,
    borderColor: COLORS.border,
    backgroundColor: COLORS.headRow,
  },
  td: {
    fontSize: SIZES.cell,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 0.7,
    borderBottomWidth: 0.7,
    borderColor: COLORS.border,
  },

  /* -------------------------------- summary -------------------------------- */
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
  },
  summaryLabel: { fontWeight: "bold" },
  summaryValue: { textAlign: "right" },
  summaryStrong: { fontWeight: "bold", fontSize: SIZES.section },

  /* -------------------------------- sections ------------------------------- */
  sectionTitle: {
    fontSize: SIZES.section,
    fontWeight: "bold",
    color: COLORS.heading,
    marginTop: 12,
    marginBottom: 5,
  },
  sectionNote: { fontSize: SIZES.micro, color: COLORS.muted, marginBottom: 5 },

  /* -------------------------------- identity ------------------------------- */
  personName: { fontSize: SIZES.display, fontWeight: "bold", color: COLORS.heading, lineHeight: 1.2 },
  personMeta: { fontSize: SIZES.small, color: COLORS.muted, marginTop: 4 },

  /* --------------------------------- footer -------------------------------- */
  footer: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 24,
    textAlign: "center",
  },
  footerText: { fontSize: SIZES.micro, color: COLORS.text, textAlign: "center" },
  footerPage: { fontSize: SIZES.micro, color: COLORS.muted, textAlign: "center", marginTop: 3 },
});
