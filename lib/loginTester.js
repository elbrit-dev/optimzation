/**
 * Server-only: does a login work? (26 Nov 2026, the survey's Login question)
 *
 * Signs in to a website the way a browser does, then signs out and forgets the session:
 *   1. opens the URL (following redirects, keeping its cookies);
 *   2. finds the login form (the form with a password box; a username-first page is followed one step);
 *   3. fills the username and password, keeps the form's hidden fields (security tokens), presses its button;
 *   4. looks at where it lands: no password box any more and no "invalid / wrong password" → signed in.
 * Only public addresses (never this server, the office network or a cloud metadata address). Nothing is stored:
 * not the password, not the session. -> { result: "verified" | "not_verified", code, message, landed }
 *   code: ok | wrong | otp | captcha | no_form | two_step | unreachable | blocked | site_error | error
 */
import dns from "node:dns/promises";
import net from "node:net";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_BYTES = 2 * 1024 * 1024;
const STEP_MS = 15000;
const MAX_HOPS = 8;

class Stop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function checkUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Stop("unreachable", "That isn’t a valid website address.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Stop("unreachable", "Only http / https websites can be tested.");
  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Stop("unreachable", "The website’s address could not be found — check the URL.");
  }
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Stop("blocked", "That isn’t a public website address.");
  return url;
}

const decode = (s) =>
  String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&times;/g, "")
    .replace(/&amp;/g, "&");

/* a tag's attributes: <input type="text" name='u' value=x disabled> -> { type, name, value, disabled } */
function attrs(tag) {
  const o = {};
  const body = tag.replace(/^<\s*[\w-]+/, "").replace(/\/?>$/, "");
  body.replace(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, (m, k, a, b, c) => {
    o[k.toLowerCase()] = decode(a ?? b ?? c ?? "");
    return m;
  });
  return o;
}

const text = (html) =>
  decode(String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
const hasPassword = (html) => /<input\b[^>]*type\s*=\s*["']?password/i.test(html || "");

/* a small cookie jar: name -> value (per site, as one session) */
function jar() {
  const c = new Map();
  return {
    take(res) {
      const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      for (const line of list) {
        const [pair] = line.split(";");
        const i = pair.indexOf("=");
        if (i > 0) c.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
    header: () => [...c.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    size: () => c.size,
  };
}

async function readBody(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return "";
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
    parts.push(value);
  }
  return Buffer.concat(parts.map((p) => Buffer.from(p))).toString("utf8");
}

/* one request, following redirects by hand (each hop checked, cookies kept) */
async function go(cookies, url, { method = "GET", body, headers = {}, referer } = {}) {
  let cur = url;
  let m = method;
  let b = body;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await checkUrl(cur.href);
    let res;
    try {
      res = await fetch(cur, {
        method: m,
        body: m === "GET" ? undefined : b,
        redirect: "manual",
        signal: AbortSignal.timeout(STEP_MS),
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9",
          ...(cookies.size() ? { Cookie: cookies.header() } : {}),
          ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
          ...headers,
        },
      });
    } catch (e) {
      throw new Stop("unreachable", /timeout|abort/i.test(String(e?.name || e?.message)) ? "The website took too long to answer." : "The website could not be opened.");
    }
    cookies.take(res);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, cur);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && m !== "GET")) {
        m = "GET";
        b = undefined;
      }
      referer = cur.href;
      cur = next;
      continue;
    }
    return { url: cur, status: res.status, html: await readBody(res), type: res.headers.get("content-type") || "" };
  }
  throw new Stop("site_error", "The website kept redirecting.");
}

/* the login form: the form holding a password box (else a username-only form, for two-step sign-ins) */
function findForm(html, wantPassword = true) {
  const forms = [...String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => ({ tag: attrs(`<form ${m[1]}>`), inner: m[2] }));
  const withPw = forms.find((f) => hasPassword(f.inner));
  if (withPw) return withPw;
  if (wantPassword && hasPassword(html)) return { tag: {}, inner: html }; // a password box outside any <form>
  if (!wantPassword) return forms.find((f) => /<input\b[^>]*(type\s*=\s*["']?(text|email|tel)|name\s*=\s*["']?[^"'>]*(user|email|login|mobile|phone))/i.test(f.inner)) || null;
  return null;
}

/* the form's fields as a browser would send them; which box is the username / password */
function fill(form, login, password) {
  const fields = [];
  const inputs = [...form.inner.matchAll(/<input\b[^>]*>/gi)].map((m) => attrs(m[0]));
  let pwSeen = false;
  let userIdx = -1;
  let submit = null;
  const textual = (t) => ["", "text", "email", "tel", "number", "search"].includes(t);
  inputs.forEach((a) => {
    const type = (a.type || "text").toLowerCase();
    if (!a.name || "disabled" in a) {
      if (type === "password") pwSeen = true;
      return;
    }
    if (type === "submit" || type === "image") {
      if (!submit) submit = a;
      return;
    }
    if (["button", "reset", "file"].includes(type)) return;
    if ((type === "checkbox" || type === "radio") && !("checked" in a)) return;
    if (type === "password") {
      if (!pwSeen) fields.push([a.name, password]);
      pwSeen = true;
      return;
    }
    fields.push([a.name, a.value ?? ""]);
    if (textual(type) && !pwSeen) {
      const named = /user|email|login|mobile|phone|id\b|name|code|account/i.test(`${a.name} ${a.id || ""} ${a.placeholder || ""}`);
      if (userIdx < 0 || named) userIdx = fields.length - 1;
    }
  });
  for (const m of form.inner.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const a = attrs(`<select ${m[1]}>`);
    if (!a.name) continue;
    const opts = [...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((o) => ({ a: attrs(`<option ${o[1]}>`), t: text(o[2]) }));
    const pick = opts.find((o) => "selected" in o.a) || opts[0];
    if (pick) fields.push([a.name, pick.a.value ?? pick.t]);
  }
  for (const m of form.inner.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const a = attrs(`<textarea ${m[1]}>`);
    if (a.name) fields.push([a.name, decode(m[2])]);
  }
  for (const m of form.inner.matchAll(/<button\b([^>]*)>/gi)) {
    const a = attrs(`<button ${m[1]}>`);
    if (!submit && (!a.type || a.type.toLowerCase() === "submit")) submit = a;
  }
  if (submit?.name) fields.push([submit.name, submit.value ?? ""]);
  if (userIdx >= 0) fields[userIdx][1] = login;
  return { fields, hasUser: userIdx >= 0, hasPassword: pwSeen };
}

async function submit(cookies, page, form, fields) {
  const action = new URL(form.tag.action ? decode(form.tag.action) : page.url.href, page.url);
  const method = String(form.tag.method || "POST").toUpperCase() === "GET" ? "GET" : "POST";
  if (method === "GET") {
    const u = new URL(action);
    for (const [k, v] of fields) u.searchParams.append(k, v);
    return go(cookies, u, { referer: page.url.href });
  }
  const multipart = /multipart/i.test(form.tag.enctype || "");
  let body;
  const headers = {};
  if (multipart) {
    body = new FormData();
    for (const [k, v] of fields) body.append(k, v);
  } else {
    body = new URLSearchParams(fields).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  return go(cookies, action, { method: "POST", body, headers, referer: page.url.href });
}

const ERR = /(invalid|incorrect|wrong|not match|doesn'?t match|do not match|failed|unsuccessful|not valid|try again|locked|blocked|expired|not registered|does not exist|not found|unauthori[sz]ed|access denied|bad credentials)/i;
const OTP = /\b(otp|one[- ]time password|verification code|enter the code|2fa|two[- ]factor|authenticator)\b/i;
const CAPTCHA = /g-recaptcha|recaptcha\/api|h-captcha|hcaptcha|cf-turnstile|name\s*=\s*["']?[^"'>]*captcha/i;

/* the sentence holding the website's error, e.g. "Your password is invalid!" */
function snippet(t, re) {
  const parts = String(t).split(/(?<=[.!?])\s+|\s{2,}|\s[|•×]\s/);
  const hit = parts.find((x) => re.test(x));
  return hit ? hit.trim().slice(0, 140) : "";
}

export async function testLogin({ url, login, password }) {
  const cookies = jar();
  try {
    const start = await checkUrl(String(url || "").trim());
    let page = await go(cookies, start);
    if (page.status >= 500) throw new Stop("site_error", `The website answered with an error (HTTP ${page.status}).`);
    if (page.status === 403 || page.status === 429) throw new Stop("blocked", "The website refused an automatic test.");
    let form = findForm(page.html);
    // a username-first sign-in: send the username, then look for the password box
    if (!form) {
      const first = findForm(page.html, false);
      if (first) {
        const f1 = fill(first, login, password);
        if (f1.hasUser) {
          page = await submit(cookies, page, first, f1.fields);
          form = findForm(page.html);
          if (!form) {
            if (OTP.test(text(page.html))) throw new Stop("otp", "The website asked for an OTP / verification code.");
            throw new Stop("two_step", "The website signs in over more than one step that couldn’t be followed automatically.");
          }
        }
      }
    }
    if (!form) {
      throw new Stop("no_form", /<script/i.test(page.html) ? "No login form was found — the website’s login runs as an app (JavaScript), so it can’t be tested automatically." : "No login form was found at this address — use the login page’s URL.");
    }
    if (CAPTCHA.test(form.inner) || CAPTCHA.test(page.html)) {
      // still try: some sites only show a captcha after failed attempts
    }
    const f = fill(form, login, password);
    if (!f.hasPassword) throw new Stop("no_form", "The login form has no password box.");
    const after = await submit(cookies, page, form, f.fields);
    const t = text(after.html);
    if (after.status >= 500) throw new Stop("site_error", `The website answered with an error after signing in (HTTP ${after.status}).`);
    if (OTP.test(t) && /<input/i.test(after.html) && !/log ?out|sign ?out/i.test(t)) throw new Stop("otp", "Signed in, but the website now asks for an OTP / verification code.");
    if (hasPassword(after.html) || after.status === 401 || after.status === 403) {
      if (CAPTCHA.test(after.html) || CAPTCHA.test(form.inner)) throw new Stop("captcha", "The website has a captcha (“I’m not a robot”), so it can’t be tested automatically.");
      const why = snippet(t, ERR);
      throw new Stop("wrong", why ? `Not signed in — the website says: “${why}”` : "Still on the login page — the username or password may be wrong, or the website signs in through an app (JavaScript) that can’t be tested automatically.");
    }
    const short = t.length < 4000;
    if (short && ERR.test(t) && !/log ?out|sign ?out/i.test(t)) throw new Stop("wrong", `The website says: “${snippet(t, ERR)}”`);
    // signed in: sign out if the page offers it, then forget the session
    const out = /href\s*=\s*["']([^"']*(?:log-?out|sign-?out|logoff)[^"']*)["']/i.exec(after.html);
    if (out) await go(cookies, new URL(decode(out[1]), after.url)).catch(() => {});
    return { result: "verified", code: "ok", message: `Signed in successfully (${after.url.host}).`, landed: after.url.host + after.url.pathname };
  } catch (e) {
    if (e instanceof Stop) return { result: "not_verified", code: e.code, message: e.message };
    return { result: "not_verified", code: "error", message: "The test could not be completed." };
  }
}
