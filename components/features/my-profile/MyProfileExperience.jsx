"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  FileText,
  Landmark,
  ShieldPlus,
  User,
} from "lucide-react";

import {
  downloadDocumentPdf,
  downloadPayslipPdf,
  downloadPayslipRegisterPdf,
  downloadProfilePdf,
  slipFromRow,
} from "./pdf";
import { ProfileAvatar, ProfilePictureEditor, useProfilePicture } from "./profile-picture";

const TABS = [
  { id: "personal", label: "Personal info" },
  { id: "role", label: "Role details" },
  { id: "account", label: "Account details" },
  { id: "documents", label: "Documents" },
  { id: "payslips", label: "Payslips" },
];

// One responsive type scale for the whole screen. Every size steps up at `sm`
// so phones stay compact, and a label always sits a rung below the value or
// heading it describes.
const TEXT = {
  micro: "text-[10px] leading-tight sm:text-[11px]",
  label: "text-[11px] leading-tight sm:text-[12px]",
  body: "text-[12px] leading-snug sm:text-[13px]",
  action: "text-[12px] leading-none sm:text-[13px]",
  tab: "text-[13px] leading-tight sm:text-[14px]",
  value: "text-[13px] leading-snug sm:text-[14px]",
  metric: "text-[15px] leading-tight sm:text-[17px]",
  heading: "text-[15px] leading-tight sm:text-[16px]",
  title: "text-[17px] leading-tight sm:text-[19px]",
};

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Fall back to the first letter of the name rather than a hardcoded letter. */
function initialsOf(employee) {
  return employee?.initials || String(employee?.name || "").trim().charAt(0).toUpperCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Saving a picture needs the ERP User docname, which is `Employee.user_id`.
 * Bind it as `employee.userId`; until a query does, this reads the Company
 * email row, which holds that same address on these employee records. The
 * label is matched exactly so a Personal email row can never be picked up.
 */
function erpUserOf(employee, contact) {
  const bound = String(employee?.userId || "").trim();
  if (bound) return bound;

  const row = asArray(contact).find((item) => /^company email$/i.test(String(item?.label || "").trim()));
  const value = String(row?.value || "").trim();
  return EMAIL.test(value) ? value : "";
}

/* -------------------------------- clipboard ------------------------------ */

async function copyText(value) {
  const text = String(value ?? "");

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand (insecure origin, or permission denied).
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function CopyButton({ value, label = "value", className = "" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = useCallback(async () => {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
      onClick={handleCopy}
      className={cx(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition hover:bg-[#f3f4f6] hover:text-[#333333]",
        copied ? "text-[#00951b]" : "text-[#aaaaaa]",
        className
      )}
    >
      {copied ? (
        <Check aria-hidden className="h-3 w-3" strokeWidth={2} />
      ) : (
        <Clipboard aria-hidden className="h-3 w-3" strokeWidth={1.7} />
      )}
    </button>
  );
}

function RevealButton({ label, revealed, onToggle }) {
  return (
    <button
      type="button"
      aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={revealed}
      title={revealed ? "Hide" : "Show"}
      onClick={onToggle}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#aaaaaa] transition hover:bg-[#f3f4f6] hover:text-[#333333]"
    >
      {revealed ? (
        <EyeOff aria-hidden className="h-3 w-3" strokeWidth={1.7} />
      ) : (
        <Eye aria-hidden className="h-3 w-3" strokeWidth={1.7} />
      )}
    </button>
  );
}

// Fallback mask for a `reveal` field that ships no explicit maskedValue.
function maskValue(value) {
  return String(value ?? "").replace(/[^\s-]/g, "•");
}

function FieldValue({ item }) {
  const [revealed, setRevealed] = useState(false);
  const shown = item.reveal && !revealed ? item.maskedValue ?? maskValue(item.value) : item.value;

  return (
    <div className="min-w-0">
      <div className={cx(TEXT.label, "text-[#aaaaaa]")}>{item.label}</div>
      <div
        className={cx(
          "mt-1 flex min-w-0 items-center gap-1.5 text-[#333333]",
          TEXT.value,
          item.mono && "font-mono tracking-[0.06em]",
          item.muted && "text-[#aaaaaa]"
        )}
      >
        <span className="min-w-0 break-words">{shown}</span>
        {/* Always copies the real value, even while the field reads masked. */}
        {item.copy ? <CopyButton value={item.value} label={item.label} /> : null}
        {item.reveal ? (
          <RevealButton
            label={item.label}
            revealed={revealed}
            onToggle={() => setRevealed((current) => !current)}
          />
        ) : null}
      </div>
    </div>
  );
}

function InfoCard({ title, note, children, className = "" }) {
  return (
    <section className={cx("rounded-[6px] bg-white p-3 shadow-[0_1px_6px_rgba(15,23,42,0.04)] sm:p-4", className)}>
      <div className="mb-3.5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 className={cx(TEXT.heading, "font-bold text-[#162653]")}>{title}</h2>
        {note ? <p className={cx(TEXT.label, "text-[#aaaaaa] sm:text-right")}>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ items, columns = "xl:grid-cols-4" }) {
  return (
    <div className={cx("grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2", columns)}>
      {items.map((item, index) => (
        <FieldValue key={`${item.label}-${index}`} item={item} />
      ))}
    </div>
  );
}

/** The one line that reports how the last picture change went, on both layouts. */
function PictureStatus({ picture, className = "" }) {
  const message = picture.error || picture.notice;
  if (!message) return null;

  return (
    <p
      role={picture.error ? "alert" : "status"}
      aria-live="polite"
      className={cx(TEXT.micro, picture.error ? "text-[#c02026]" : "text-[#00951b]", className)}
    >
      {message}
    </p>
  );
}

function HeaderCard({ data, helpDeskLink, picture }) {
  const employee = data.employee;

  return (
    <section className="rounded-[6px] bg-white px-3 py-4 shadow-[0_1px_6px_rgba(15,23,42,0.04)] sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ProfileAvatar
            initials={initialsOf(employee)}
            pictureUrl={picture.pictureUrl}
            canEdit={picture.canEdit}
            saving={picture.saving}
            onPick={picture.pick}
            className="h-[54px] w-[54px]"
            initialsClassName="text-[22px]"
            badgeClassName="bottom-[-2px] right-[-2px] h-5 w-5"
            iconClassName="h-2.5 w-2.5"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={cx(TEXT.title, "break-words font-bold text-[#162653]")}>{employee.name}</h1>
              {employee.status ? (
                <span
                  className={cx(
                    TEXT.micro,
                    "inline-flex items-center gap-1 rounded-full bg-[#eaf8eb] px-2 py-0.5 font-medium text-[#008a16]"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#12c244]" />
                  {employee.status}
                </span>
              ) : null}
            </div>
            <div className={cx(TEXT.body, "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[#3b3b3b]")}>
              {[employee.designation, employee.headquarters, employee.department, employee.division]
                .filter(Boolean)
                .map((item, index) => (
                  <React.Fragment key={item}>
                    {index > 0 ? <span className="text-[#b6b6b6]">·</span> : null}
                    <span>{item}</span>
                  </React.Fragment>
                ))}
            </div>
            <div className={cx(TEXT.micro, "mt-1.5 flex flex-wrap items-center gap-2 text-[#aaaaaa]")}>
              {employee.employeeCode ? (
                <>
                  <span
                    className={cx(
                      TEXT.micro,
                      "rounded border border-[#d8d8d8] px-1.5 py-0.5 font-mono tracking-[0.1em] text-[#111111]"
                    )}
                  >
                    {employee.employeeCode}
                  </span>
                  <CopyButton value={employee.employeeCode} label="employee code" />
                </>
              ) : null}
              <span>{[employee.joinedOn, employee.tenure].filter(Boolean).join(" · ")}</span>
            </div>
            <PictureStatus picture={picture} className="mt-1.5" />
          </div>
        </div>
        {/* The read-only notice used to sit in a divider row below this one.
            With the note gone, the link joins the actions rather than leaving
            an empty band across the card. */}
        <div className="flex flex-col gap-2 lg:items-end lg:pt-1">
          <div className="flex flex-col gap-2 sm:flex-row">
          {data.payslips.selectedSlip ? (
          <button
            type="button"
            onClick={() => downloadPayslipPdf(data.payslips.selectedSlip, data)}
            className={cx(
              TEXT.action,
              "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-[4px] border border-[#d9d9d9] bg-white px-3 text-[#202020] transition hover:bg-[#f8fafc] active:translate-y-px"
            )}
          >
            Download latest payslip
          </button>
          ) : null}
          <button
            type="button"
            onClick={() => downloadProfilePdf(data)}
            className={cx(
              TEXT.action,
              "inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-[4px] bg-[#1d73f8] px-4 text-white transition hover:bg-[#1265e4] active:translate-y-px"
            )}
          >
            Export profile
          </button>
          </div>
          {helpDeskLink ? (
            <a
              href={helpDeskLink}
              target="_blank"
              rel="noreferrer"
              className={cx(TEXT.label, "text-[#0077ff] hover:underline")}
            >
              Open Help desk
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Tabs({ activeTab, onChange, syncText }) {
  return (
    <div className="border-b border-[#d5d5d5]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        {/* Scrollable on narrow screens, but without the scrollbar chrome -
            Chromium paints a track here even when nothing overflows. */}
        <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={cx(
                  TEXT.tab,
                  "relative shrink-0 px-2 pb-2.5 pt-0.5 font-bold transition sm:px-3",
                  active ? "text-[#162653]" : "text-[#aaaaaa] hover:text-[#666666]"
                )}
              >
                {tab.label}
                {active ? (
                  <span className="absolute bottom-[-1px] left-2 right-2 h-[2px] bg-[#eb2027] sm:left-3 sm:right-3" />
                ) : null}
              </button>
            );
          })}
        </div>
        <p className={cx(TEXT.micro, "pb-2.5 text-[#aaaaaa] lg:text-right")}>{syncText}</p>
      </div>
    </div>
  );
}

function PersonalTab({ data }) {
  const section = data.personalInfo;
  return (
    <div className="space-y-3">
      <InfoCard title="Overview" note={section.overviewNote}>
        <FieldGrid items={asArray(section.overview)} />
      </InfoCard>
      <InfoCard title="Contact" note={section.contactNote}>
        <FieldGrid items={asArray(section.contact)} />
      </InfoCard>
    </div>
  );
}

function RoleTab({ data }) {
  const section = data.roleDetails;
  return (
    <div className="space-y-3">
      <InfoCard title="Reporting and role" note={section.reportingNote}>
        <FieldGrid items={asArray(section.reporting)} />
      </InfoCard>
      <InfoCard title="Leave balance" note={data.leaveBalance.note}>
        <StatTiles items={asArray(data.leaveBalance.items)} />
      </InfoCard>
    </div>
  );
}

function AccountTab({ data }) {
  const section = data.accountDetails;
  const coverage = section.insuranceCoverage;

  return (
    <div className="space-y-3">
      <InfoCard title="Salary account" note={section.salaryNote}>
        <FieldGrid items={asArray(section.salary)} />
      </InfoCard>
      <InfoCard title="Statutory" note={section.statutoryNote}>
        <FieldGrid items={asArray(section.statutory)} />
      </InfoCard>
      <InfoCard title="Health insurance" note={section.insuranceNote}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
          {coverage ? <StatTile item={coverage} className="shrink-0 px-4 py-4 xl:w-[220px]" /> : null}
          <div className="min-w-0 flex-1">
            <FieldGrid
              items={asArray(section.insurance)}
              columns="xl:grid-cols-3"
            />
          </div>
        </div>
      </InfoCard>
    </div>
  );
}

// Label / figure / caption tile - used for leave balance and insurance cover.
function StatTile({ item, className = "" }) {
  return (
    <div
      className={cx(
        "flex flex-col justify-center gap-1 rounded-[6px] px-3 py-3",
        item.strong ? "bg-[rgba(15,135,249,0.08)]" : "bg-[#fbfcff]",
        className
      )}
    >
      <span className={cx(TEXT.label, "text-[#aaaaaa]")}>{item.label}</span>
      <span className={cx(TEXT.metric, "font-bold", item.strong ? "text-[#162653]" : "text-[#333333]")}>
        {item.value}
      </span>
      {item.caption ? <span className={cx(TEXT.micro, "text-[#434343]")}>{item.caption}</span> : null}
    </div>
  );
}

function StatTiles({ items }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <StatTile key={`${item.label}-${index}`} item={item} />
      ))}
    </div>
  );
}

function DocumentRow({ doc, data }) {
  return (
    <li className="flex items-center gap-3 border-t border-[#e7e7e7] px-3 py-2.5 transition hover:bg-[#fbfcff] sm:px-4">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#fbfcff] text-[#0b7cff]">
        <FileText aria-hidden className="h-4 w-4" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cx(TEXT.body, "font-medium text-[#202020]")}>{doc.name}</div>
        <div className={cx(TEXT.micro, "mt-0.5 text-[#aaaaaa]")}>
          {[doc.issued, doc.format, doc.size].filter(Boolean).join(" · ")}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Download ${doc.name}`}
        title={`Download ${doc.name}`}
        onClick={() => downloadDocumentPdf(doc, data)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#aaaaaa] transition hover:bg-[#f3f4f6] hover:text-[#333333]"
      >
        <Download aria-hidden className="h-3.5 w-3.5" strokeWidth={1.7} />
      </button>
    </li>
  );
}

function DocumentsTab({ data }) {
  const section = data.documents;
  const items = asArray(section.items);

  return (
    <section className="overflow-clip rounded-[6px] bg-white shadow-[0_1px_6px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-4">
        <h2 className={cx(TEXT.heading, "font-bold text-[#162653]")}>Documents</h2>
        <p className={cx(TEXT.label, "text-[#aaaaaa] sm:text-right")}>{section.note}</p>
      </div>
      <ul>
        {items.map((doc, index) => (
          <DocumentRow key={`${doc.name}-${index}`} doc={doc} data={data} />
        ))}
      </ul>
    </section>
  );
}

function SummaryCards({ items }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <section
          key={`${item.label}-${index}`}
          className="rounded-[6px] bg-white p-3 shadow-[0_1px_6px_rgba(15,23,42,0.04)]"
        >
          <div className={cx(TEXT.label, "text-[#aaaaaa]")}>{item.label}</div>
          <div className={cx(TEXT.metric, "mt-1 font-bold", item.strong ? "text-[#162653]" : "text-[#333333]")}>
            {item.value}
          </div>
          <div className={cx(TEXT.micro, "mt-1.5 text-[#aaaaaa]")}>{item.caption}</div>
        </section>
      ))}
    </div>
  );
}

function SalarySlips({ data }) {
  const payslips = data.payslips;
  const slips = asArray(payslips.slips);

  return (
    <section className="overflow-clip rounded-[6px] bg-white shadow-[0_1px_6px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={cx(TEXT.heading, "font-bold text-[#162653]")}>Salary slips</h2>
        <div className="flex flex-wrap items-center gap-2">
          {asArray(payslips.fiscalYears)[0] ? (
            <button
              type="button"
              className={cx(
                TEXT.label,
                "inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#d9d9d9] bg-white px-2 text-[#333333]"
              )}
            >
              {asArray(payslips.fiscalYears)[0]}
              <ChevronDown aria-hidden className="h-3 w-3" strokeWidth={1.7} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => downloadPayslipRegisterPdf(data)}
            className={cx(
              TEXT.label,
              "inline-flex h-7 items-center gap-1 rounded-[4px] px-1.5 text-[#0077ff] transition hover:bg-[#f2f7ff]"
            )}
          >
            <Download aria-hidden className="h-3 w-3" strokeWidth={1.7} />
            Export all
          </button>
        </div>
      </div>
      {/* Horizontal scroll is deliberate here - the table has a min width. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead className={cx(TEXT.label, "border-y border-[#d7d7d7] bg-[#fbfcff] text-[#111111]")}>
            <tr>
              {["Month", "Period", "Gross", "Deductions", "Net pay", "Status", ""].map((heading) => (
                <th key={heading} className="px-3 py-2 font-bold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cx(TEXT.body, "text-[#333333]")}>
            {slips.map((slip, index) => (
              <tr key={slip.month} className={cx("border-b border-[#d7d7d7]", index === 0 && "bg-[#eef4ff]")}>
                <td className={cx("whitespace-nowrap px-3 py-2.5 font-medium", index === 0 && "text-[#0077ff]")}>
                  {slip.month}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{slip.period}</td>
                <td className="px-3 py-2.5 font-medium">{slip.gross}</td>
                <td className="px-3 py-2.5">{slip.deductions}</td>
                <td className="px-3 py-2.5 font-bold">{slip.netPay}</td>
                <td className="px-3 py-2.5">
                  <span className={cx(TEXT.micro, "rounded-full bg-[#dff8e4] px-2 py-0.5 text-[#00951b]")}>
                    {slip.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[#aaaaaa]">
                  <button
                    type="button"
                    aria-label={`Download ${slip.month} payslip`}
                    title={`Download ${slip.month} payslip`}
                    onClick={() => downloadPayslipPdf(slipFromRow(payslips, slip), data)}
                    className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded text-[#aaaaaa] transition hover:bg-[#f3f4f6] hover:text-[#333333]"
                  >
                    <Download aria-hidden className="h-2.5 w-2.5" strokeWidth={1.7} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className={cx(
          TEXT.micro,
          "flex flex-col gap-1 px-3 py-2.5 text-[#aaaaaa] sm:flex-row sm:items-center sm:justify-between"
        )}
      >
        <span>{slips.length} slips - FY 2026-27 and prior</span>
        <span>Payslips are issued on the last working day of each month</span>
      </div>
    </section>
  );
}

function AmountRows({ rows }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className={cx(TEXT.body, "flex items-start justify-between gap-3 text-[#333333]")}>
          <span>{row.label}</span>
          <span className="shrink-0 font-medium">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function PayslipPreview({ data, helpDeskLink }) {
  const selected = data.payslips.selectedSlip;
  if (!selected) return null;

  return (
    <aside className="rounded-[6px] bg-white p-3 shadow-[0_1px_6px_rgba(15,23,42,0.04)] xl:sticky xl:top-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cx(TEXT.heading, "font-bold text-[#162653]")}>{selected.title}</h2>
          <p className={cx(TEXT.micro, "mt-0.5 break-all text-[#aaaaaa]")}>{selected.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => downloadPayslipPdf(selected, data)}
          className={cx(
            TEXT.label,
            "inline-flex h-7 shrink-0 items-center justify-center rounded-[4px] border border-[#d9d9d9] px-2 text-[#333333] transition hover:bg-[#f8fafc] active:translate-y-px"
          )}
        >
          Download PDF
        </button>
      </div>
      <div className="mt-3 rounded-[4px] bg-[#fbfcff] p-3">
        <div className={cx(TEXT.micro, "flex justify-between gap-3 text-[#aaaaaa]")}>
          <span>Net pay credited</span>
          <span className="text-right text-[#333333]">{selected.creditText}</span>
        </div>
        <div className={cx(TEXT.title, "mt-1 font-bold text-[#162653]")}>{selected.netPay}</div>
      </div>
      <div className="mt-3">
        <h3 className={cx(TEXT.label, "mb-2 font-bold text-[#111111]")}>Earnings</h3>
        <AmountRows rows={asArray(selected.earnings)} />
        <div
          className={cx(
            TEXT.body,
            "mt-2.5 flex items-center justify-between border-t border-[#d7d7d7] pt-2 font-bold text-[#111111]"
          )}
        >
          <span>Gross pay</span>
          <span>{selected.grossPay}</span>
        </div>
      </div>
      <div className="mt-3">
        <h3 className={cx(TEXT.label, "mb-2 font-bold text-[#111111]")}>Deductions</h3>
        <AmountRows
          rows={asArray(selected.deductions)}
        />
        <div
          className={cx(
            TEXT.body,
            "mt-2.5 flex items-center justify-between border-t border-[#d7d7d7] pt-2 font-bold text-[#111111]"
          )}
        >
          <span>Total deductions</span>
          <span>{selected.totalDeductions}</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-[#d7d7d7] pt-3">
        {asArray(selected.meta).map((item) => (
          <div key={item.label} className={cx(TEXT.micro, "flex items-start justify-between gap-3")}>
            <span className="text-[#aaaaaa]">{item.label}</span>
            <span className="text-right text-[#333333]">{item.value}</span>
          </div>
        ))}
      </div>
      {helpDeskLink ? (
        <a
          href={helpDeskLink}
          target="_blank"
          rel="noreferrer"
          className={cx(TEXT.label, "mt-3 block text-left text-[#0077ff] hover:underline")}
        >
          Raise a payroll query for this month
        </a>
      ) : (
        <span className={cx(TEXT.label, "mt-3 block text-left text-[#aaaaaa]")}>
          Raise a payroll query for this month
        </span>
      )}
    </aside>
  );
}

function PayslipsTab({ data, helpDeskLink }) {
  const payslips = data.payslips;
  return (
    <div className="space-y-2.5">
      <SummaryCards items={asArray(payslips.summary)} />
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SalarySlips data={data} />
        <PayslipPreview data={data} helpDeskLink={helpDeskLink} />
      </div>
    </div>
  );
}

/* ================================ mobile ================================= *
 * A distinct layout below `sm`, not a squeezed version of the desktop one:
 * one profile card, a Profile/Payslips toggle, and collapsible sections
 * instead of a tab strip. Reads the same `data` the desktop view does.
 * ========================================================================= */

function MobileFieldRow({ item }) {
  const [revealed, setRevealed] = useState(false);
  const shown = item.reveal && !revealed ? item.maskedValue ?? maskValue(item.value) : item.value;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f0f0f0] px-4 py-2.5 last:border-b-0">
      <span className={cx(TEXT.label, "shrink-0 pt-0.5 text-[#aaaaaa]")}>{item.label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span
          className={cx(
            TEXT.value,
            "min-w-0 break-words text-right text-[#202020]",
            item.mono && "font-mono tracking-[0.04em]"
          )}
        >
          {shown}
        </span>
        {item.copy ? <CopyButton value={item.value} label={item.label} /> : null}
        {item.reveal ? (
          <RevealButton label={item.label} revealed={revealed} onToggle={() => setRevealed((v) => !v)} />
        ) : null}
      </div>
    </div>
  );
}

function MobileFieldRows({ items }) {
  if (!items.length) return null;
  return <div>{items.map((item, index) => <MobileFieldRow key={`${item.label}-${index}`} item={item} />)}</div>;
}

function MobileAccordionSection({ icon: Icon, title, subtitle, open, onToggle, children }) {
  return (
    <section className="overflow-clip rounded-[10px] bg-white shadow-[0_1px_6px_rgba(15,23,42,0.05)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#eef4ff] text-[#0b7cff]">
          <Icon aria-hidden className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx(TEXT.body, "block truncate font-bold text-[#111111]")}>{title}</span>
          {subtitle ? (
            <span className={cx(TEXT.label, "mt-0.5 block truncate text-[#aaaaaa]")}>{subtitle}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cx("h-4 w-4 shrink-0 text-[#aaaaaa] transition-transform", open && "rotate-180")}
          strokeWidth={1.7}
        />
      </button>
      {open ? <div className="border-t border-[#f0f0f0]">{children}</div> : null}
    </section>
  );
}

function MobileStat({ label, value }) {
  return (
    <div className="min-w-0 flex-1">
      <div className={cx(TEXT.micro, "truncate text-[#aaaaaa]")}>{label}</div>
      <div className={cx(TEXT.body, "mt-0.5 truncate font-bold text-[#162653]")}>{value || "—"}</div>
    </div>
  );
}

function MobileProfileCard({ data, picture }) {
  const employee = data.employee;
  const latestSlip = data.payslips.selectedSlip;
  const leaveTotal = asArray(data.leaveBalance.items).find((item) => item.strong) || asArray(data.leaveBalance.items)[0];
  const headquarters = String(employee.headquarters || "").replace(/^HQ[-\s]*/i, "");

  return (
    <section className="rounded-[10px] bg-white p-4 shadow-[0_1px_6px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar
            initials={initialsOf(employee)}
            pictureUrl={picture.pictureUrl}
            canEdit={picture.canEdit}
            saving={picture.saving}
            onPick={picture.pick}
            className="h-11 w-11"
            initialsClassName="text-[16px]"
            badgeClassName="bottom-[-2px] right-[-2px] h-4 w-4"
            iconClassName="h-2 w-2"
          />
          <div className="min-w-0">
            <div className={cx(TEXT.body, "truncate font-bold text-[#162653]")}>{employee.name}</div>
            {employee.designation ? (
              <div className={cx(TEXT.label, "truncate text-[#3b3b3b]")}>{employee.designation}</div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => downloadProfilePdf(data)}
          className={cx(TEXT.label, "shrink-0 rounded-[4px] bg-[#1d73f8] px-2.5 py-1.5 font-bold text-white")}
        >
          Export
        </button>
      </div>

      {employee.employeeCode || employee.status ? (
        <div className={cx(TEXT.micro, "mt-2.5 flex flex-wrap items-center gap-2")}>
          {employee.employeeCode ? (
            <span className="rounded border border-[#d8d8d8] px-1.5 py-0.5 font-mono tracking-[0.1em] text-[#111111]">
              {employee.employeeCode}
            </span>
          ) : null}
          {employee.status ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8eb] px-2 py-0.5 font-medium text-[#008a16]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#12c244]" />
              {employee.status}
            </span>
          ) : null}
        </div>
      ) : null}

      <PictureStatus picture={picture} className="mt-2" />

      {latestSlip || leaveTotal || headquarters ? (
        <div className="mt-3 flex items-stretch gap-3 border-t border-[#f0f0f0] pt-3">
          {latestSlip ? <MobileStat label={`Net pay · ${latestSlip.title || latestSlip.month || ""}`} value={latestSlip.netPay} /> : null}
          {latestSlip && (leaveTotal || headquarters) ? <div className="w-px shrink-0 bg-[#f0f0f0]" /> : null}
          {leaveTotal ? <MobileStat label="Leave balance" value={leaveTotal.value} /> : null}
          {leaveTotal && headquarters ? <div className="w-px shrink-0 bg-[#f0f0f0]" /> : null}
          {headquarters ? <MobileStat label="HQ" value={headquarters} /> : null}
        </div>
      ) : null}
    </section>
  );
}

const MOBILE_VIEWS = [
  { id: "profile", label: "Profile" },
  { id: "payslips", label: "Payslips" },
];

function MobileSegmentedTabs({ active, onChange }) {
  return (
    <div className="flex gap-1 rounded-[10px] bg-[#e7e8ed] p-1">
      {MOBILE_VIEWS.map((view) => {
        const isActive = view.id === active;
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => onChange(view.id)}
            className={cx(
              TEXT.body,
              "flex-1 rounded-[8px] py-1.5 text-center font-bold transition",
              isActive ? "bg-white text-[#111111] shadow-sm" : "text-[#666666]"
            )}
          >
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

function shortDocSummary(items) {
  return items
    .slice(0, 3)
    .map((doc) => String(doc.name || "").split(/[\s-]/)[0])
    .filter(Boolean)
    .join(", ");
}

function MobileAccordionList({ data }) {
  const [openId, setOpenId] = useState("personal");
  const toggle = (id) => setOpenId((current) => (current === id ? null : id));

  const personalItems = [...asArray(data.personalInfo.overview), ...asArray(data.personalInfo.contact)];
  const roleItems = asArray(data.roleDetails.reporting);
  const accountItems = [...asArray(data.accountDetails.salary), ...asArray(data.accountDetails.statutory)];
  const coverage = data.accountDetails.insuranceCoverage;
  const insuranceItems = [
    coverage ? { label: coverage.label, value: [coverage.value, coverage.caption].filter(Boolean).join(" · ") } : null,
    ...asArray(data.accountDetails.insurance),
  ].filter(Boolean);
  const documentItems = asArray(data.documents.items);

  const sections = [
    { id: "personal", icon: User, title: "Personal info", subtitle: "Contact, address, emergency", items: personalItems },
    { id: "role", icon: Building2, title: "Role details", subtitle: "Reporting, role profile, approvals", items: roleItems },
    { id: "account", icon: Landmark, title: "Account details", subtitle: "Bank and statutory", items: accountItems },
    {
      id: "insurance",
      icon: ShieldPlus,
      title: "Health insurance",
      subtitle: coverage ? `Coverage ${coverage.value}` : "Policy details",
      items: insuranceItems,
    },
    {
      id: "documents",
      icon: FileText,
      title: "Documents",
      subtitle: documentItems.length ? shortDocSummary(documentItems) : "Issued by HR",
      items: null,
      documents: documentItems,
    },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {sections.map((section) => (
        <MobileAccordionSection
          key={section.id}
          icon={section.icon}
          title={section.title}
          subtitle={section.subtitle}
          open={openId === section.id}
          onToggle={() => toggle(section.id)}
        >
          {section.documents ? (
            <ul>
              {section.documents.map((doc, index) => (
                <DocumentRow key={`${doc.name}-${index}`} doc={doc} data={data} />
              ))}
            </ul>
          ) : (
            <MobileFieldRows items={section.items} />
          )}
        </MobileAccordionSection>
      ))}
    </div>
  );
}

function MobilePayslipCard({ data, helpDeskLink }) {
  const selected = data.payslips.selectedSlip;
  if (!selected) return null;

  return (
    <section className="rounded-[10px] bg-white p-4 shadow-[0_1px_6px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className={cx(TEXT.body, "font-bold text-[#111111]")}>{selected.title || selected.month}</div>
        <span className={cx(TEXT.micro, "rounded-full bg-[#dff8e4] px-2 py-0.5 font-medium text-[#00951b]")}>
          Credited
        </span>
      </div>
      <div className={cx(TEXT.title, "mt-2 font-bold text-[#162653]")}>{selected.netPay}</div>
      <div className={cx(TEXT.micro, "mt-0.5 text-[#aaaaaa]")}>net pay</div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-[8px] bg-[#f5f6f8] p-2.5">
          <div className={cx(TEXT.micro, "text-[#aaaaaa]")}>Gross</div>
          <div className={cx(TEXT.body, "mt-0.5 font-bold text-[#111111]")}>{selected.grossPay}</div>
        </div>
        <div className="rounded-[8px] bg-[#f5f6f8] p-2.5">
          <div className={cx(TEXT.micro, "text-[#aaaaaa]")}>Deductions</div>
          <div className={cx(TEXT.body, "mt-0.5 font-bold text-[#111111]")}>{selected.totalDeductions}</div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => downloadPayslipPdf(selected, data)}
          className={cx(TEXT.body, "flex-1 rounded-[8px] bg-[#1d73f8] py-2 text-center font-bold text-white")}
        >
          Download PDF
        </button>
        {helpDeskLink ? (
          <a
            href={helpDeskLink}
            target="_blank"
            rel="noreferrer"
            className={cx(TEXT.body, "flex-1 rounded-[8px] border border-[#d9d9d9] py-2 text-center font-bold text-[#333333]")}
          >
            Raise query
          </a>
        ) : (
          <span
            className={cx(TEXT.body, "flex-1 rounded-[8px] border border-[#e5e5e5] py-2 text-center font-bold text-[#bbbbbb]")}
          >
            Raise query
          </span>
        )}
      </div>
    </section>
  );
}

function MobileEarlierMonths({ data }) {
  const payslips = data.payslips;
  const slips = asArray(payslips.slips);
  if (!slips.length) return null;

  return (
    <section className="overflow-clip rounded-[10px] bg-white shadow-[0_1px_6px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className={cx(TEXT.body, "font-bold text-[#162653]")}>Earlier months</h2>
        <button
          type="button"
          onClick={() => downloadPayslipRegisterPdf(data)}
          className={cx(TEXT.label, "inline-flex items-center gap-1 font-bold text-[#0077ff]")}
        >
          <Download aria-hidden className="h-3 w-3" strokeWidth={1.7} />
          Export all
        </button>
      </div>
      <ul>
        {slips.map((slip, index) => (
          <li
            key={slip.month}
            className={cx(
              "flex items-center gap-3 border-t border-[#f0f0f0] px-4 py-2.5",
              index === 0 && "bg-[#f7fbff]"
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#eef4ff] text-[#0b7cff]">
              <FileText aria-hidden className="h-4 w-4" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className={cx(TEXT.body, "font-bold text-[#111111]")}>{slip.month}</div>
              <div className={cx(TEXT.micro, "mt-0.5 truncate text-[#aaaaaa]")}>{slip.period}</div>
            </div>
            <div className={cx(TEXT.body, "shrink-0 font-bold text-[#111111]")}>{slip.netPay}</div>
            <button
              type="button"
              aria-label={`Download ${slip.month} payslip`}
              title={`Download ${slip.month} payslip`}
              onClick={() => downloadPayslipPdf(slipFromRow(payslips, slip), data)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[#aaaaaa] transition hover:bg-[#f3f4f6] hover:text-[#333333]"
            >
              <Download aria-hidden className="h-3.5 w-3.5" strokeWidth={1.7} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MobileProfileExperience({ data, helpDeskLink, picture }) {
  const [view, setView] = useState("profile");

  return (
    <div className="flex w-full flex-col gap-3">
      <MobileProfileCard data={data} picture={picture} />
      <MobileSegmentedTabs active={view} onChange={setView} />
      {view === "profile" ? <MobileAccordionList data={data} /> : null}
      {view === "payslips" ? (
        <div className="flex flex-col gap-2.5">
          <MobilePayslipCard data={data} helpDeskLink={helpDeskLink} />
          <MobileEarlierMonths data={data} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Everything rendered here comes from the four props. This only fills in keys
 * the caller left out so the render is safe while a query is still loading -
 * it holds no values of its own and reads no file. A `null` from GraphQL counts
 * as "not set", so `overview: null` stays an empty array instead of crashing.
 */
function fromProps({ profile, leaveBalance, payslips, documents }) {
  // Plasmic can hand these over as a real object (a dynamic value bound to a
  // GraphQL query) or as pasted JSON text, depending on which control was used.
  // Accept both so neither route silently renders nothing.
  const asObject = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  const set = (object) =>
    Object.fromEntries(
      Object.entries(asObject(object) || {}).filter(([, value]) => value !== undefined && value !== null)
    );

  const p = set(profile);
  const personalInfo = set(p.personalInfo);
  const roleDetails = set(p.roleDetails);
  const accountDetails = set(p.accountDetails);

  return {
    syncText: "",
    ...p,
    company: set(p.company),
    employee: set(p.employee),
    personalInfo: { overviewNote: "", overview: [], contactNote: "", contact: [], ...personalInfo },
    roleDetails: { reportingNote: "", reporting: [], ...roleDetails },
    accountDetails: {
      salaryNote: "",
      salary: [],
      statutoryNote: "",
      statutory: [],
      insuranceNote: "",
      insuranceCoverage: null,
      insurance: [],
      ...accountDetails,
    },
    leaveBalance: { note: "", items: [], ...set(leaveBalance) },
    payslips: { summary: [], fiscalYears: [], slips: [], selectedSlip: null, ...set(payslips) },
    documents: { note: "", items: [], ...set(documents) },
  };
}

export default function MyProfileExperience({
  profile,
  leaveBalance,
  payslips,
  documents,
  helpDeskLink,
  erpBaseUrl = "",
  erpEndpointKey = "",
  onPictureChange,
  defaultTab = "personal",
  className = "",
}) {
  const data = useMemo(
    () => fromProps({ profile, leaveBalance, payslips, documents }),
    [profile, leaveBalance, payslips, documents]
  );

  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.id === defaultTab) ? defaultTab : "personal"
  );

  // The picture is the one thing on this screen that writes back to the ERP, so
  // its state sits here: both layouts are mounted at once and share it.
  const picture = useProfilePicture({
    imageUrl: data.employee.imageUrl,
    baseUrl: erpBaseUrl,
    user: erpUserOf(data.employee, data.personalInfo.contact),
    employee: data.employee.id || data.employee.employeeCode,
    endpointKey: erpEndpointKey,
    onChange: onPictureChange,
  });

  // The outer breadcrumb/notification/settings header duplicated chrome the
  // host page already provides, so both viewports render straight into their
  // own layout with no page-level header or footer of their own.
  return (
    <div className={cx("flex w-full flex-col font-sans text-[#333333]", className)}>
      {/* One surface, one level of padding. The grey gutter and rounded inner
          shell this used to sit in read as a frame around the page, so the
          cards now sit straight on the background. */}
      <main className="hidden w-full flex-col gap-3 bg-[#f2f2f2] px-3 py-4 sm:flex sm:px-4 lg:px-6">
        <HeaderCard data={data} helpDeskLink={helpDeskLink} picture={picture} />
        <Tabs activeTab={activeTab} onChange={setActiveTab} syncText={data.syncText} />
        {activeTab === "personal" ? <PersonalTab data={data} /> : null}
        {activeTab === "role" ? <RoleTab data={data} /> : null}
        {activeTab === "account" ? <AccountTab data={data} /> : null}
        {activeTab === "documents" ? <DocumentsTab data={data} /> : null}
        {activeTab === "payslips" ? <PayslipsTab data={data} helpDeskLink={helpDeskLink} /> : null}
      </main>

      <main className="flex w-full flex-col gap-3 bg-[#f5f6f8] p-3 sm:hidden">
        <MobileProfileExperience data={data} helpDeskLink={helpDeskLink} picture={picture} />
      </main>

      <ProfilePictureEditor
        image={picture.image}
        saving={picture.saving}
        error={picture.error}
        onCancel={picture.cancel}
        onSave={picture.save}
      />
    </div>
  );
}
