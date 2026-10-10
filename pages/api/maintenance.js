/**
 * Is the app in maintenance right now?
 *
 * The switch is the "Maintenance Mode" GLOBAL CONTEXT in Plasmic Studio
 * (registered in plasmic-init.js). Studio compiles a global context's settings
 * into the project's generated code, so this reads them out of the PREVIEW
 * bundle — Studio's latest saved state. That is deliberate: it means flipping
 * the switch in Studio takes effect with NO publish, so turning maintenance on
 * never ships half-finished design work, and nobody waits out the 10-minute
 * page ISR window. Open apps pick it up within about a minute.
 *
 * Fails OPEN: Plasmic unreachable, context not registered yet, code shape
 * changed → not in maintenance. A broken switch must never be what locks
 * everyone out.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_PLASMIC_PROJECT_ID || 'b6mXu8rXhi8fdDd6jwb8oh';
const PROJECT_TOKEN =
  process.env.NEXT_PUBLIC_PLASMIC_PROJECT_TOKEN ||
  'hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA';

// "prod" tag = the live deployment; anything else is test (see plasmic-init.js).
const THIS_ENV = process.env.NEXT_PUBLIC_PLASMIC_TAG === 'prod' ? 'live' : 'test';

// The preview bundle is ~7 MB and takes several seconds to build, so it is read
// at most once a minute per server and never on a user's critical path.
const CACHE_MS = 60_000;
let cached = { at: 0, settings: null };
let inflight = null;

// A JS string literal as esbuild emits it — "..", '..' or `..` without ${}.
const STRING = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + '`(?:[^`\\\\$]|\\\\.|\\$(?!\\{))*`';

/**
 * Studio emits every value set on a global context as
 *   propName: o && "propName" in o ? o.propName : <value>
 * Props left unset are simply absent.
 */
export function readSetting(code, name) {
  const re = new RegExp(
    `"${name}"in (\\w+)\\?\\1\\.${name}:(!0|!1|true|false|void 0|${STRING})`
  );
  const m = code.match(re);
  if (!m) return undefined;
  const v = m[2];
  if (v === '!0' || v === 'true') return true;
  if (v === '!1' || v === 'false') return false;
  if (v === 'void 0') return undefined;
  // The regex admits only a bare string literal, so evaluating it is safe.
  return new Function(`return ${v}`)();
}

async function fetchSettings() {
  const url =
    'https://codegen.plasmic.app/api/v1/loader/code/preview?platform=nextjs' +
    `&projectId=${PROJECT_ID}&browserOnly=true&skipHead=true`;
  const res = await fetch(url, {
    headers: {
      'x-plasmic-api-project-tokens': `${PROJECT_ID}:${PROJECT_TOKEN}`,
      'x-plasmic-loader-version': '10',
    },
  });
  if (!res.ok) throw new Error(`Plasmic loader ${res.status}`);
  const bundle = await res.json();
  const project = bundle.projects.find((p) => p.id === PROJECT_ID);
  const modules = [...(bundle.modules.browser || []), ...(bundle.modules.server || [])];
  const code = modules.find((m) => m.fileName === project?.globalContextsProviderFileName)?.code || '';
  return {
    on: readSetting(code, 'maintenanceOn') === true,
    environment: readSetting(code, 'maintenanceEnvironment') || 'all',
    title: readSetting(code, 'maintenanceTitle') || '',
    message: readSetting(code, 'maintenanceMessage') || '',
    backBy: readSetting(code, 'maintenanceBackBy') || '',
    bypassKey: readSetting(code, 'maintenanceBypassKey') || '',
  };
}

async function getSettings() {
  if (cached.settings && Date.now() - cached.at < CACHE_MS) return cached.settings;
  inflight ||= fetchSettings()
    .then((settings) => {
      cached = { at: Date.now(), settings };
      return settings;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export default async function handler(req, res) {
  // Shared cache on top of the per-server one: thousands of polling clients
  // cost one origin hit per 30s per edge.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  let s;
  try {
    s = await getSettings();
  } catch (err) {
    console.error('maintenance check failed:', err);
    return res.status(200).json({ enabled: false, error: true });
  }

  const env = String(s.environment).trim().toLowerCase();
  if (!s.on || (env !== 'all' && env !== THIS_ENV)) return res.status(200).json({ enabled: false });

  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (s.bypassKey && key && key === s.bypassKey) {
    return res.status(200).json({ enabled: false, bypassed: true });
  }

  return res.status(200).json({
    enabled: true,
    title: s.title,
    message: s.message,
    backBy: s.backBy,
  });
}
