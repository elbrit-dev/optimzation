import React from "react";
import { Image, Text, View } from "@react-pdf/renderer";
import { absoluteAssetUrl, COLORS, styles } from "./theme";

export const DEFAULT_COMPANY = {
  name: "Elbrit Lifesciences Private Limited",
  addressLines: [
    "Level 4, A Wing, Dynasty Business Park,",
    "Andheri Kurla Road, Andheri (E),",
    "Mumbai - 400059, Maharashtra.",
  ],
  cin: "U74999TZ2014PTC029965",
  supportEmail: "support@elbrit.org",
  supportPhone: "1800 257 3579",
  // Served from /public. Any absolute URL or path works; blank hides the slot
  // while still reserving its space, so the layout never shifts.
  logoUrl: "/logo.png",
};

/**
 * Letterhead. The logo slot always occupies its space so the layout does not
 * shift once a logo is supplied; today it simply renders empty.
 */
export function Letterhead({ company, title }) {
  return (
    <View>
      <View style={styles.logoSlot}>
        {company.logoUrl ? <Image src={absoluteAssetUrl(company.logoUrl)} style={styles.logoImage} /> : null}
      </View>
      <View style={styles.companyBlock}>
        <Text style={styles.companyName}>{company.name}</Text>
        {(company.addressLines || []).map((line, index) => (
          <Text key={index} style={styles.companyLine}>
            {line}
          </Text>
        ))}
      </View>
      {title ? <Text style={styles.docTitle}>{title}</Text> : null}
    </View>
  );
}

export function PageFooter({ company }) {
  return (
    <View style={styles.footer} fixed>
      {company.cin ? <Text style={styles.footerText}>CIN: {company.cin}</Text> : null}
      {company.supportEmail || company.supportPhone ? (
        <Text style={styles.footerText}>
          In case of any queries or disputes, please email at: {company.supportEmail} or call us at:{" "}
          {company.supportPhone}
        </Text>
      ) : null}
    </View>
  );
}

/** Bold label followed by its value, as used across the payslip header. */
export function Pair({ label, value, labelWidth = 78 }) {
  return (
    <View style={styles.pairRow}>
      <Text style={[styles.pairLabel, { width: labelWidth }]}>{label}</Text>
      <Text style={styles.pairValue}>{value ?? ""}</Text>
    </View>
  );
}

export function PairList({ items, labelWidth }) {
  return (
    <View>
      {items
        .filter((item) => item && item.value !== undefined && item.value !== null && item.value !== "")
        .map((item, index) => (
          <Pair key={`${item.label}-${index}`} label={item.label} value={item.value} labelWidth={labelWidth} />
        ))}
    </View>
  );
}

/**
 * Ruled table. `columns` is [{ key, label, width, align }] where width is a
 * percentage string. Header repeats across page breaks; rows never split.
 */
export function Table({ columns, rows, zebra = false }) {
  if (!rows || !rows.length) return null;

  return (
    <View style={styles.table}>
      <View style={styles.tr} fixed>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[styles.th, { width: column.width, textAlign: column.align || "left" }]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View
          key={index}
          style={[
            styles.tr,
            zebra && index % 2 === 1 ? { backgroundColor: COLORS.zebra } : null,
          ]}
          wrap={false}
        >
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[styles.td, { width: column.width, textAlign: column.align || "left" }]}
            >
              {row[column.key] ?? ""}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function SummaryRow({ label, value, strong = false }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong ? styles.summaryStrong : null]}>{label}</Text>
      <Text style={[styles.summaryValue, strong ? styles.summaryStrong : null]}>{value}</Text>
    </View>
  );
}

/** Label/value stacked in two columns, for the payslip's tax footer. */
export function StackedPair({ label, value, labelWidth = 96 }) {
  return (
    <View style={[styles.pairRow, { marginBottom: 7 }]}>
      <Text style={[styles.pairLabel, { width: labelWidth }]}>{label}</Text>
      <Text style={[styles.pairValue, { textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function SectionHeading({ title, note }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </>
  );
}

/**
 * Renders the heading together with the first row inside a single wrap={false}
 * block, so a section title can never be stranded at the foot of a page; the
 * remaining rows flow and break normally.
 *
 * react-pdf's own `minPresenceAhead` is a no-op for this shape - verified at
 * 96, 140 and 200 - hence doing it by hand.
 */
function HeadedRows({ title, note, rows, renderRows }) {
  const [first, ...rest] = rows;
  return (
    <View>
      <View wrap={false}>
        <SectionHeading title={title} note={note} />
        {renderRows([first], true)}
      </View>
      {rest.length ? renderRows(rest, false) : null}
    </View>
  );
}

/**
 * The profile's building block: a ruled grid of label-over-value cells, three
 * across. Stacking the label above its value fits roughly three times as many
 * fields per page as a full-width Field/Value table.
 */
export function GridSection({ title, note, items, columns = 3 }) {
  const cells = (items || []).filter((item) => item && item.label);
  if (!cells.length) return null;

  const width = `${100 / columns}%`;
  const pad = (count) => `${(100 / columns) * count}%`;

  const gridRow = (row, key) => (
    <View key={key} style={styles.gridRow}>
      {row.map((item, index) => (
        <View key={index} style={[styles.gridCell, { width }]}>
          <Text style={styles.gridLabel}>{item.label}</Text>
          <Text style={styles.gridValue}>{String(item.value ?? "")}</Text>
        </View>
      ))}
      {/* Pad the final row so its right-hand rule lines up with the rest. */}
      {row.length < columns ? (
        <View style={[styles.gridCell, { width: pad(columns - row.length) }]} />
      ) : null}
    </View>
  );

  return (
    <HeadedRows
      title={title}
      note={note}
      rows={chunk(cells, columns)}
      renderRows={(slice, isFirst) => (
        <View style={[styles.grid, isFirst ? null : { borderTopWidth: 0 }]}>
          {slice.map((row, index) => gridRow(row, index))}
        </View>
      )}
    />
  );
}

/** Heading plus a ruled table, with the same keep-together guarantee. */
export function TableSection({ title, note, columns, rows, zebra = true }) {
  if (!rows || !rows.length) return null;

  const header = (
    <View style={styles.tr}>
      {columns.map((column) => (
        <Text
          key={column.key}
          style={[styles.th, { width: column.width, textAlign: column.align || "left" }]}
        >
          {column.label}
        </Text>
      ))}
    </View>
  );

  const bodyRow = (row, index) => (
    <View
      key={index}
      style={[styles.tr, zebra && index % 2 === 1 ? { backgroundColor: COLORS.zebra } : null]}
      wrap={false}
    >
      {columns.map((column) => (
        <Text
          key={column.key}
          style={[styles.td, { width: column.width, textAlign: column.align || "left" }]}
        >
          {row[column.key] ?? ""}
        </Text>
      ))}
    </View>
  );

  return (
    <HeadedRows
      title={title}
      note={note}
      rows={rows}
      renderRows={(slice, isFirst) => (
        <View style={[styles.table, isFirst ? null : { borderTopWidth: 0 }]}>
          {isFirst ? header : null}
          {slice.map((row, index) => bodyRow(row, isFirst ? index : index + 1))}
        </View>
      )}
    />
  );
}
