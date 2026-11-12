/* SurveyHome's Plasmic registration — its props, as Studio shows them.
   Imported by src/plasmic-init.js, and read by the dev harness. */

export const surveyHomeMeta = {
  name: 'SurveyHome',
  displayName: 'Surveys',
  section: 'ElbritCoreLib',
  importPath: './src/app/survey/components/SurveyHome',
  importName: 'SurveyHome',
  description:
    "The rep side of the ERP's Survey system: one circle per survey on the home strip (only for people sent that survey), right after the entry tiles; a circle opens that survey — its doctors or distributors (Self-tag: add the ones you met) — and each one's form: every question type, file uploads, drafts on the device, Submit.",
  props: {
    gqlToken: {
      type: 'string',
      helpText: "REQUIRED. The signed-in person's own ERP token ('key:secret'). Surveys are always read and sent as them — never a shared key (SURVEYS_CONTEXT.md §5).",
    },
    gqlEnvironment: { type: 'string', defaultValue: 'ERP', helpText: 'The /tokens registry row NAME the ERP host is resolved from. Never a credential.' },
    refreshEvery: { type: 'number', defaultValue: 300000, helpText: 'How often (ms) the surveys are asked again. Also on return to the app.' },
    tiles: {
      type: 'object',
      helpText: "The app's other Ring Nav tiles; the survey circles go right after the entry tiles. Leave empty: the usual ERP tiles are loaded as the signed-in person, exactly as Ring Nav loads them.",
    },
    today: { type: 'string', helpText: 'YYYY-MM-DD to preview another day. Empty: the ERP’s today.' },
    hrefBase: { type: 'string', defaultValue: '/survey', helpText: 'A survey circle links to <hrefBase>/<campaign>.' },
    bottomGap: {
      type: 'string',
      helpText: "Space under the form's pinned Save draft / Submit bar. Any CSS length; e.g. calc(4rem + 12px) to clear the app's bottom navigation.",
    },
    className: { type: 'string' },
  },
};
