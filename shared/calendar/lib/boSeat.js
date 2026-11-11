/* BACK-OFFICE SEATS ("BO-<dept>-<designation><n>", e.g. BO-IT-SFSM1, BO-MIS-CRMX3).
 *
 * Each back-office person holds a seat of their own, the way a sales person
 * does, instead of sharing one profile ("IT", "MIS", "HR Manager" ...). WHAT
 * the seat may do is not in its name: it is the seat's role template,
 * Role Profile.custom_role_template -- "IT", "MIS", "HR Manager" and so on,
 * the same shared profiles the seats replaced.
 *
 * So wherever the app reads authority off a seat NAME ("IT" sees everything,
 * a seat's prefix is its grade), a BO seat must be read as its template:
 * effectiveSeat("BO-IT-SFSM1") -> "IT". Any other seat is returned unchanged.
 * The ERP does the same in its server scripts and in erp-api.
 *
 * The templates come over REST: the GraphQL schema does not carry the field.
 * Asked as fields ["*"], never by name: an ERP without the field then simply
 * leaves it out (naming it would be an HTTP 417), and an ERP with no BO seats
 * answers an empty list -- so there nothing fails and everything behaves as
 * before. A token that may not read Role Profile leaves the map empty. A BO seat
 * whose template is unknown stays itself and ranks as no seat at all: the
 * least privileged reading, never the most. */

const BO_SEAT = /^BO-/i;

export const isBoSeat = (seat) => BO_SEAT.test(String(seat ?? "").trim());

const templates = new Map();   // "BO-IT-SFSM1" -> "IT"
const loads = new Map();       // origin|token -> promise

export function effectiveSeat(seat) {
  if (seat == null) return seat;
  const s = String(seat).trim();
  return (isBoSeat(s) && templates.get(s)) || s;
}

/* Fill the map once per ERP + token. Resolves (never rejects) when done.
   `url` is the GraphQL endpoint or the ERP origin; `token` "key:secret" with
   or without its "token " scheme. */
export function loadSeatTemplates({ url, token } = {}) {
  let origin;
  try {
    origin = new URL(String(url ?? "").trim()).origin;
  } catch {
    return Promise.resolve(templates);
  }
  const raw = String(token ?? "").trim();
  if (!raw) return Promise.resolve(templates);
  const auth = /^(token|bearer)\s/i.test(raw) ? raw : `token ${raw}`;
  const key = `${origin}|${auth}`;
  if (!loads.has(key)) {
    const params = new URLSearchParams({
      fields: JSON.stringify(["*"]),
      filters: JSON.stringify([["name", "like", "BO-%"]]),
      limit_page_length: "0",
    });
    const promise = fetch(`${origin}/api/resource/Role%20Profile?${params}`, {
      headers: { Accept: "application/json", Authorization: auth },
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => {
        for (const row of json?.data ?? []) {
          const seat = String(row?.name ?? "").trim();
          const template = String(row?.custom_role_template ?? "").trim();
          if (seat && template) templates.set(seat, template);
        }
        return templates;
      })
      .catch(() => {
        loads.delete(key); // a network blip may be retried; an HTTP answer is kept
        return templates;
      });
    loads.set(key, promise);
  }
  return loads.get(key);
}
