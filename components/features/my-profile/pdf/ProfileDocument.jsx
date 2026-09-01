import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { GridSection, Letterhead, PageFooter, PairList, TableSection } from "./chrome";
import { styles } from "./theme";
import { stripPrefix } from "./format";

// Section notes are written for the screen. The export carries full values, so
// drop any clause that promises masking rather than repeat it untruthfully.
function exportNote(note) {
  if (!note) return note;
  return String(note)
    .split(/\s+[-–·]\s+/)
    .filter((clause) => !/mask/i.test(clause))
    .join(" - ");
}

/**
 * The ERP's stock Employee print format crams every field into one collapsing
 * grid. This keeps the same letterhead and footer but groups the data into the
 * sections the profile screen uses, each a ruled three-column grid.
 */
export function ProfileDocument({ data, company }) {
  const { employee, personalInfo, roleDetails, accountDetails } = data;
  const leaveBalance = data.leaveBalance || {};

  const identity = [employee.designation, employee.department, employee.division, employee.headquarters]
    .filter(Boolean)
    .join(" · ");

  const coverage = accountDetails.insuranceCoverage;
  const insurance = accountDetails.insurance || [];

  return (
    <Document title={`${employee.name} - Employee profile`} author={company.name}>
      <Page size="A4" style={styles.page}>
        <Letterhead company={company} title="Employee Profile" />

        <View style={{ marginTop: 12 }}>
          <Text style={styles.personName}>{employee.name}</Text>
          <Text style={styles.personMeta}>{identity}</Text>
        </View>
        <View style={styles.rule} />

        <View style={styles.row}>
          <View style={styles.col}>
            <PairList
              labelWidth={78}
              items={[
                { label: "Employee:", value: employee.employeeCode },
                { label: "Status:", value: employee.status },
              ]}
            />
          </View>
          <View style={styles.gap} />
          <View style={styles.col}>
            <PairList
              labelWidth={78}
              items={[
                { label: "Joined:", value: stripPrefix(employee.joinedOn, "Joined") },
                { label: "Tenure:", value: employee.tenure },
              ]}
            />
          </View>
        </View>

        <GridSection
          title="Personal information"
          note={personalInfo.overviewNote}
          items={personalInfo.overview}
        />
        <GridSection title="Contact" note={personalInfo.contactNote} items={personalInfo.contact} />
        <GridSection
          title="Reporting and role"
          note={roleDetails.reportingNote}
          items={roleDetails.reporting}
        />

        <TableSection
          title="Leave balance"
          note={leaveBalance.note}
          columns={[
            { key: "type", label: "Leave type", width: "34%" },
            { key: "balance", label: "Balance", width: "22%", align: "right" },
            { key: "detail", label: "Allocation", width: "44%" },
          ]}
          rows={(leaveBalance.items || []).map((item) => ({
            type: item.label,
            balance: String(item.value ?? ""),
            detail: String(item.caption ?? ""),
          }))}
        />

        <GridSection
          title="Salary account"
          note={exportNote(accountDetails.salaryNote)}
          items={accountDetails.salary}
        />
        <GridSection
          title="Statutory"
          note={accountDetails.statutoryNote}
          items={accountDetails.statutory}
        />
        <GridSection
          title="Health insurance"
          note={accountDetails.insuranceNote}
          items={[
            coverage
              ? {
                  label: coverage.label,
                  value: [coverage.value, coverage.caption].filter(Boolean).join(" · "),
                }
              : null,
            ...insurance,
          ].filter(Boolean)}
        />

        <PageFooter company={company} />
      </Page>
    </Document>
  );
}

/**
 * Stand-in for an HR-issued document that has no file attached yet. States
 * plainly what it is so it can never be mistaken for the issued letter.
 */
export function DocumentRecordDocument({ doc, employee, company }) {
  return (
    <Document title={doc.name} author={company.name}>
      <Page size="A4" style={styles.page}>
        <Letterhead company={company} title="Document Record" />

        <View style={{ marginTop: 12 }}>
          <Text style={styles.personName}>{doc.name}</Text>
          <Text style={styles.personMeta}>
            {[employee.name, employee.employeeCode].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={styles.rule} />

        <GridSection
          title="Document record"
          columns={2}
          items={[
            { label: "Document", value: doc.name },
            { label: "Issued", value: String(doc.issued ?? "").replace(/^Issued\s+/i, "") },
            { label: "Format", value: [doc.format, doc.size].filter(Boolean).join(" · ") },
            { label: "Employee", value: `${employee.name} (${employee.employeeCode})` },
            { label: "Designation", value: employee.designation },
          ]}
        />

        <View style={styles.spacer14} />
        <Text style={styles.sectionNote}>
          Generated from the profile record. The issued document itself is held by HR - raise a Help
          desk request for a certified copy.
        </Text>

        <PageFooter company={company} />
      </Page>
    </Document>
  );
}
