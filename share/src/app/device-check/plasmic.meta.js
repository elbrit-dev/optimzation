/* The Plasmic registration of DeviceCheck — imported by src/plasmic-init.js. */

export const deviceCheckMeta = {
  name: 'DeviceCheck',
  displayName: 'Device Check',
  section: 'ElbritCoreLib',
  importPath: './src/app/device-check/components/DeviceCheck',
  importName: 'DeviceCheck',
  description:
    'A checklist that confirms the browser can run Elbrit One: not in "Desktop site", location not blocked (not asked yet is fine), cookies / localStorage / sessionStorage / IndexedDB allowed, enough free storage. The first failing item opens with fix-it steps for the phone and browser in use; it re-checks on its own when the person returns from settings. When everything passes it shows Continue (or continues by itself with autoContinue).',
  props: {
    continueLabel: { type: 'string', defaultValue: 'Continue' },
    continueUrl: {
      type: 'string',
      helpText: 'Where Continue goes (e.g. /login). Leave empty and use onPass to handle it in Studio.',
    },
    autoContinue: {
      type: 'boolean',
      defaultValue: false,
      helpText: 'Continue on its own as soon as every check passes, without a tap.',
    },
    onPass: {
      type: 'eventHandler',
      argTypes: [{ name: 'results', type: 'object' }],
      helpText: 'Fires when Continue is tapped (or automatically with autoContinue), with every check result.',
    },
    onResult: {
      type: 'eventHandler',
      argTypes: [{ name: 'summary', type: 'object' }],
      helpText: 'Fires after every round of checks with { ok, results, platform }.',
    },
    className: { type: 'string' },
  },
};
