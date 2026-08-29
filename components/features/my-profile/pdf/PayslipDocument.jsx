import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { Letterhead, PageFooter, PairList, StackedPair, SummaryRow, Table } from "./chrome";
import { styles } from "./theme";
import {
  amountInWords,
  findValue,
  formatAmount,
  parseAmount,
  splitPayableDays,
  splitPeriod,
  stripPrefix,
} from "./format";

const AMOUNT_COLUMNS = (withYtd) =>
  [
    { key: "sr", label: "Sr", width: withYtd ? "8%" : "10%" },
    { key: "component", label: "Component", width: withYtd ? "34%" : "58%" },
    { key: "amount", label: "Amount", width: withYtd ? "28%" : "32%", align: "right" },
    withYtd ? { key: "ytd", label: "Year To Date", width: "30%", align: "right" } : null,
  ].filter(Boolean);

function toRows(items) {
  return (items || []).map((item, index) => ({
    sr: String(index + 1),
    component: item.label,
    amount: formatAmount(item.value),
    ytd: item.ytd ? formatAmount(item.ytd) : "",
  }));
}

/**
 * Mirrors the ERP's Salary Slip print format. Every value comes from props;
 * blocks the data does not carry (Year To Date, the tax footers) are simply
 * omitted rather than shown empty.
 */
export function PayslipDocument({ slip, employee, account, company }) {
  const period = splitPeriod(slip.period || slip.subtitle || "");
  const days = splitPayableDays(slip.payableDays ?? findValue(slip.meta, "Payable days"));

  const earnings = slip.earnings || [];
  const deductions = slip.deductions || [];
  const withEarningYtd = earnings.some((item) => item.ytd);
  const withDeductionYtd = deductions.some((item) => item.ytd);
  const hasBreakdown = earnings.length > 0 || deductions.length > 0;

  const net = parseAmount(slip.netPay);
  const rounded = slip.roundedTotal ?? (net === null ? null : Math.round(net));

  const title =
    period.start && period.end
      ? `Payslip of (${period.start} - ${period.end})`
      : `Payslip - ${slip.title || slip.month || ""}`;

  return (
    <Document title={title} author={company.name}>
      <Page size="A4" style={styles.page}>
        <Letterhead company={company} title={title} />

        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={styles.col}>
            <PairList
              labelWidth={86}
              items={[
                { label: "Employee:", value: employee.employeeCode },
                { label: "Employee Name:", value: employee.name },
                { label: "Department:", value: employee.department },
                { label: "Designation:", value: employee.designation },
                { label: "Bank Name:", value: findValue(account.salary, "Bank name") },
                { label: "Bank Account No:", value: findValue(account.salary, "Account number") },
                { label: "PAN Number:", value: findValue(account.statutory, "PAN") },
              ]}
            />
          </View>
          <View style={styles.gap} />
          <View style={styles.col}>
            <PairList
              labelWidth={86}
              items={[
                { label: "Start Date:", value: slip.startDate ?? period.start },
                { label: "End Date:", value: slip.endDate ?? period.end },
                { label: "Working Days:", value: slip.workingDays ?? days?.working },
                { label: "Payment Days:", value: slip.paymentDays ?? days?.payment },
                { label: "Loss Of Pay:", value: slip.lossOfPay ?? days?.lossOfPay },
                { label: "Date of Joining:", value: stripPrefix(employee.joinedOn, "Joined") },
                { label: "UAN Number:", value: findValue(account.statutory, "UAN") },
              ]}
            />
          </View>
        </View>

        {/* With no component breakdown - a register row rather than a full slip -
            the summary takes the whole width instead of leaving empty columns. */}
        <View style={[styles.row, { marginTop: 6 }]}>
          {hasBreakdown ? (
            <>
              <View style={styles.col}>
                <Table columns={AMOUNT_COLUMNS(withEarningYtd)} rows={toRows(earnings)} />
              </View>
              <View style={styles.gap} />
            </>
          ) : null}
          <View style={styles.col}>
            <Table columns={AMOUNT_COLUMNS(withDeductionYtd)} rows={toRows(deductions)} />

            <View style={{ marginTop: 4 }}>
              <SummaryRow label="Gross Pay:" value={formatAmount(slip.grossPay)} />
              <SummaryRow label="Total Deduction:" value={formatAmount(slip.totalDeductions)} />
              <SummaryRow label="Net Pay:" value={formatAmount(slip.netPay)} />
              {rounded !== null ? (
                <SummaryRow label="Rounded Total:" value={formatAmount(rounded)} strong />
              ) : null}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { width: 80 }]}>Total in words:</Text>
                <Text style={[styles.pairValue, { textAlign: "left" }]}>
                  {slip.netPayInWords ?? amountInWords(rounded ?? slip.netPay)}
                </Text>
              </View>
              {slip.incomeTaxSlab ? (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { width: 80 }]}>Income Tax Slab:</Text>
                  <Text style={[styles.pairValue, { textAlign: "left" }]}>{slip.incomeTaxSlab}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {(slip.taxSummary?.length || slip.incomeTaxSummary?.length) ? (
          <View style={[styles.row, { marginTop: 16 }]}>
            <View style={styles.col}>
              {(slip.taxSummary || []).map((item, index) => (
                <StackedPair key={index} label={item.label} value={formatAmount(item.value)} />
              ))}
            </View>
            <View style={styles.gap} />
            <View style={styles.col}>
              {(slip.incomeTaxSummary || []).map((item, index) => (
                <StackedPair key={index} label={item.label} value={formatAmount(item.value)} />
              ))}
            </View>
          </View>
        ) : null}

        <PageFooter company={company} />
      </Page>
    </Document>
  );
}

/** Every slip in the register, one summary table plus month-by-month rows. */
export function PayslipRegisterDocument({ payslips, employee, company }) {
  const slips = payslips.slips || [];

  return (
    <Document title="Payslip register" author={company.name}>
      <Page size="A4" style={styles.page}>
        <Letterhead company={company} title="Payslip Register" />

        <View style={{ marginTop: 10 }}>
          <PairList
            labelWidth={86}
            items={[
              { label: "Employee:", value: employee.employeeCode },
              { label: "Employee Name:", value: employee.name },
              { label: "Designation:", value: employee.designation },
              { label: "Slips:", value: String(slips.length) },
            ]}
          />
        </View>

        <View style={{ marginTop: 6 }}>
          <Table
            zebra
            columns={[
              { key: "sr", label: "Sr", width: "6%" },
              { key: "month", label: "Month", width: "20%" },
              { key: "period", label: "Period", width: "26%" },
              { key: "gross", label: "Gross", width: "16%", align: "right" },
              { key: "deductions", label: "Deductions", width: "16%", align: "right" },
              { key: "netPay", label: "Net Pay", width: "16%", align: "right" },
            ]}
            rows={slips.map((slip, index) => ({
              sr: String(index + 1),
              month: slip.month,
              period: slip.period,
              gross: formatAmount(slip.gross),
              deductions: formatAmount(slip.deductions),
              netPay: formatAmount(slip.netPay),
            }))}
          />
        </View>

        {payslips.summary?.length ? (
          <View style={{ marginTop: 14 }}>
            {payslips.summary.map((item, index) => (
              <SummaryRow
                key={index}
                label={`${item.label}:`}
                value={formatAmount(item.value)}
                strong={!!item.strong}
              />
            ))}
          </View>
        ) : null}

        <PageFooter company={company} />
      </Page>
    </Document>
  );
}
