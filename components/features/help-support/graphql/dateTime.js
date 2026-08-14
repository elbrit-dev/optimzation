const INDIA_TIME_ZONE = "Asia/Kolkata";

function normalizeFraction(value) {
  return value.replace(/\.(\d{3})\d+/, ".$1");
}

function hasTimeZone(value) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function parseERPDateTime(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00+05:30`);
  }

  const normalized = normalizeFraction(input.replace(" ", "T"));
  const withZone = hasTimeZone(normalized) ? normalized : `${normalized}+05:30`;
  const date = new Date(withZone);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatIndiaDateTime(value, { dateOnly = false } = {}) {
  const date = parseERPDateTime(value);
  if (!date) return value || "";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(dateOnly
      ? {}
      : {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
    }),
  }).format(date);
}

export function formatERPDuration(value) {
  const input = String(value || "").trim();
  if (!input) return "";

  const parts = input.split(":");
  if (parts.length < 2 || parts.length > 3) return input;

  const [hoursValue, minutesValue, secondsValue = "0"] = parts;
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  const seconds = Math.floor(Number(secondsValue));

  if (![hours, minutes, seconds].every(Number.isFinite)) return input;

  const segments = [];
  if (hours) segments.push(`${hours}h`);
  if (minutes) segments.push(`${minutes}m`);
  if (seconds || !segments.length) segments.push(`${seconds}s`);

  return segments.join(" ");
}
