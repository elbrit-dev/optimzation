import React, { useCallback, useMemo, useState } from "react";

/**
 * DoctorCard — ONE doctor row card for the doctor page list view.
 *
 * Deliberately a single card, not a list: place it and repeat it in Plasmic
 * Studio over the doctor rows, binding each instance its own row (currentItem).
 * Renders the initials avatar, the doctor name, a coloured speciality chip, the
 * doctor code with a copy button, the HQ territory with a pin, and the
 * department chips (Elbrit Kanchipuram / Vasco Coimbatore …) across the card's
 * full width — as many per row as fit, the rest wrapping onto the next line.
 *
 * The whole card is clickable — onDoctorClick fires with the full row, so Studio
 * can open a detail sheet, navigate, or start a visit. The copy button is
 * independently clickable and never counts as a card click.
 *
 * DATA (`data` prop) — ONE doctor row. Tolerant of shape: the row itself, a
 * GraphQL edge ({ node }), or a single-row array/connection.
 *
 * Fields (ERP Lead, all overridable):
 *   name            -> lead_name                              "Dr Shanmugam"
 *   code            -> name                                   "DR-36661"
 *   speciality      -> custom_specialty__name                 "NEURO"
 *   hq              -> territory { name }                     "HQ-Trichy"
 *   city            -> city                                   "Trichy"
 *   division chips  -> custom_role_profile[].department__name  "Elbrit Trichy - ELPL"
 * EVERY field is optional. Each one falls back through the usual aliases
 * (custom_speciality, territory__name, city, department, role_profile_list …) so
 * both the nested (`territory { name }`) and flattened (`territory__name`)
 * GraphQL shapes work with no extra config, and anything null is left out of the
 * card rather than rendering an empty line.
 */

/** Unwrap edge/connection/array wrappers down to the ONE row inside. */
function normalizeRow(data) {
  if (data == null) return null;
  if (Array.isArray(data)) return normalizeRow(data[0]);
  if (typeof data !== "object") return null;
  if (data.node && typeof data.node === "object") return normalizeRow(data.node);
  if (Array.isArray(data.edges)) return normalizeRow(data.edges[0]);
  if (Array.isArray(data.nodes)) return normalizeRow(data.nodes[0]);
  return data;
}

/**
 * Read a field whether the row is flattened ("territory__name") or nested
 * ({ territory: { name } }), tolerating a scalar Link value at the parent.
 */
function readField(row, key) {
  if (!row || !key) return undefined;
  if (row[key] != null) return row[key];
  const parts = String(key).includes("__") ? String(key).split("__") : String(key).split(".");
  let cursor = row;
  for (const part of parts) {
    if (cursor == null) return undefined;
    if (typeof cursor !== "object") return cursor;
    cursor = cursor[part];
  }
  return cursor;
}

/** First non-empty value among the configured field and its known aliases. */
function pick(row, field, aliases) {
  const keys = [field, ...(aliases ?? [])].filter(Boolean);
  for (const key of keys) {
    const value = readField(row, key);
    if (value == null) continue;
    // A Link field can arrive as the linked document ({ name, territory_name })
    // instead of a scalar — take its label rather than stringifying the object.
    const text =
      typeof value === "object"
        ? (value.name ?? value.territory_name ?? value.label ?? value.value ?? "")
        : value;
    const trimmed = String(text).trim();
    if (trimmed) return trimmed;
  }
  return "";
}

const SALUTATIONS = new Set(["dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss", "prof", "prof."]);

/** "Dr Meenakshi R" -> "MR", "Dr Shanmugam" -> "S" (the salutation never counts). */
function initialsOf(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !SALUTATIONS.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** "Elbrit Trichy - ELPL" -> "Elbrit Trichy" (drop the trailing company abbr). */
function stripCompanySuffix(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+-\s+[A-Za-z]{2,8}$/, "")
    .trim();
}

/**
 * The division / team chips. Accepts the ERP child table
 * (custom_role_profile[{ department__name, role_profile_list__name, hq__name }]),
 * a plain array of strings, or a comma-separated string. Rows whose label is
 * null are dropped, so a doctor with an empty child table shows no chip strip.
 */
function readTags(row, tagsField, tagLabelField) {
  const raw = readField(row, tagsField);
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [raw];
  const seen = new Set();
  const out = [];
  list.forEach((entry) => {
    if (entry == null) return;
    const text =
      typeof entry === "object"
        ? pick(entry, tagLabelField, [
            "department__name",
            "department",
            "role_profile_list__name",
            "role_profile_list",
            "label",
            "name",
          ])
        : String(entry);
    const label = stripCompanySuffix(text);
    if (!label || seen.has(label)) return;
    seen.add(label);
    out.push(label);
  });
  return out;
}

/**
 * Chip / avatar tones. Full literal class strings (Tailwind has to see them) —
 * picked deterministically off the text so the same speciality always keeps the
 * same colour across cards, pages and re-renders.
 */
const TONES = [
  { chip: "bg-violet-50 text-violet-700", avatar: "bg-violet-100 text-violet-700" },
  { chip: "bg-emerald-50 text-emerald-700", avatar: "bg-emerald-100 text-emerald-700" },
  { chip: "bg-sky-50 text-sky-700", avatar: "bg-sky-100 text-sky-700" },
  { chip: "bg-amber-50 text-amber-700", avatar: "bg-amber-100 text-amber-700" },
  { chip: "bg-rose-50 text-rose-700", avatar: "bg-rose-100 text-rose-700" },
  { chip: "bg-teal-50 text-teal-700", avatar: "bg-teal-100 text-teal-700" },
  { chip: "bg-indigo-50 text-indigo-700", avatar: "bg-indigo-100 text-indigo-700" },
];

function toneOf(text) {
  const s = String(text ?? "");
  if (!s) return TONES[0];
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) % 100000;
  return TONES[hash % TONES.length];
}

function CopyIcon({ done }) {
  return done ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function DoctorCard({
  data,
  nameField = "lead_name",
  codeField = "name",
  specialityField = "custom_specialty__name",
  hqField = "territory",
  cityField = "city",
  tagsField = "custom_role_profile",
  tagLabelField = "department__name",
  showAvatar = true,
  showCopyCode = true,
  showCategories = false,
  clickable = true,
  selected = false,
  onDoctorClick,
  onCopyCode,
  className,
}) {
  const [copied, setCopied] = useState(false);

  const doctor = useMemo(() => normalizeRow(data), [data]);

  const code = pick(doctor, codeField, ["name", "custom_doctor_code", "value", "code"]);
  // lead_name is the display name, but it can be null — fall back to the first
  // name, then to the code, so a row never renders as a nameless card.
  const name =
    pick(doctor, nameField, ["lead_name", "first_name", "doctor_name", "title", "label", "name"]) || code;
  const speciality = pick(doctor, specialityField, [
    "custom_specialty__name",
    "custom_speciality",
    "custom_specialty",
    "fsl_speciality__name",
    "speciality",
  ]);
  const hq = pick(doctor, hqField, ["territory", "territory__name", "custom_hq__name", "hq"]);
  // The city sits under the HQ. It's skipped when it repeats the HQ (an HQ named
  // after its city) or when the HQ line already fell back to it.
  const city = pick(doctor, cityField, ["city"]);
  const tags = useMemo(() => readTags(doctor, tagsField, tagLabelField), [doctor, tagsField, tagLabelField]);

  // C1 / C2 / C3 grading — off by default (it isn't part of the list design),
  // but the data is there for whoever wants it on.
  const categories = useMemo(() => {
    if (!showCategories) return [];
    return ["custom_category1__name", "custom_category2__name", "custom_category3__name"]
      .map((field, i) => {
        const value = pick(doctor, field);
        return value ? `C${i + 1} · ${value}` : null;
      })
      .filter(Boolean);
  }, [doctor, showCategories]);

  const tone = toneOf(speciality || name);

  const fire = useCallback(() => {
    if (!clickable || !onDoctorClick) return;
    onDoctorClick({ doctor, row: doctor, name, code, speciality, hq, city, tags });
  }, [clickable, onDoctorClick, doctor, name, code, speciality, hq, city, tags]);

  const copyCode = useCallback(
    async (e) => {
      // Copying the code must not count as opening the doctor.
      e.stopPropagation();
      if (!code) return;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          // Older in-app webviews: the deprecated path is the only one available.
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
        if (onCopyCode) onCopyCode({ code, doctor });
      } catch {
        // Clipboard blocked (no permission / insecure origin) — leave the card as is.
      }
    },
    [code, onCopyCode, doctor],
  );

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${name || "Doctor"}${code && code !== name ? ` (${code})` : ""}` : undefined}
      onClick={fire}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fire();
              }
            }
          : undefined
      }
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        selected ? "border-indigo-300 ring-1 ring-indigo-200" : "border-gray-100"
      } ${
        clickable
          ? "cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg active:translate-y-0 active:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
          : ""
      } ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        {showAvatar ? (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone.avatar}`}
          >
            {initialsOf(name)}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {/* LEFT — name, speciality, division chips */}
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold text-[#1e2a5a]">{name || "Unnamed doctor"}</h3>

              {speciality ? (
                <span
                  className={`mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone.chip}`}
                >
                  {speciality}
                </span>
              ) : null}

              {categories.length > 0 ? (
                <p className="mt-1.5 truncate text-[11px] text-gray-400">{categories.join("  |  ")}</p>
              ) : null}
            </div>

            {/* RIGHT — code (copyable) and HQ */}
            <div className="shrink-0 space-y-1.5 text-right">
              {code && code !== name ? (
                <div className="flex items-center justify-end gap-1.5 text-xs font-medium text-gray-500">
                  {showCopyCode ? (
                    <button
                      type="button"
                      onClick={copyCode}
                      title={copied ? "Copied" : "Copy code"}
                      aria-label={copied ? "Code copied" : `Copy code ${code}`}
                      className={`transition-colors ${
                        copied ? "text-emerald-600" : "text-gray-400 hover:text-indigo-600"
                      }`}
                    >
                      <CopyIcon done={copied} />
                    </button>
                  ) : null}
                  <span className="truncate">{code}</span>
                </div>
              ) : null}

              {hq || city ? (
                <div className="flex items-center justify-end gap-1 text-xs text-gray-400">
                  <PinIcon />
                  <span className="truncate">{hq || city}</span>
                </div>
              ) : null}

              {hq && city && city.toLowerCase() !== hq.toLowerCase() ? (
                <p className="truncate text-[11px] text-gray-400">{city}</p>
              ) : null}
            </div>
          </div>

          {/* DEPARTMENTS — full width under the header row (not boxed in by the
              code/HQ column), laid out in one horizontal row that fits as many
              chips as the width allows and wraps the rest onto the next line.
              Nothing is truncated or collapsed into a "+N". */}
          {tags.length > 0 ? (
            <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="whitespace-nowrap rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
