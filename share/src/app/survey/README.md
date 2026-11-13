# Surveys

The rep side of the ERP's Survey system in the Elbrit app — one circle per
survey on the home strip, right after the entry tiles; a circle opens that
survey (its doctors / distributors), and a row opens its form.
Survey Center (admin) stays on the ERP.

**In this app:** `SurveyHome` ("Surveys") is registered in
`share/src/plasmic-init.js`. Put it on a Plasmic page and bind `gqlToken` (the
signed-in person's own ERP token) and `gqlEnvironment` (the `/tokens` row
name — `UAT` for erp-uat; the default `ERP` is production). Leave `tiles`
empty: it loads the usual Ring Nav tiles from ERP itself and adds the survey
circles after the entry tiles. A circle opens its survey in place — or,
with `openInPlace` off, goes to `<hrefBase>/<campaign>` like any tile.

That page holds **Survey Page** (`SurveyPage`): bind `campaign` to the page
URL parameter (`/survey/[campaign]` → `$ctx.params.campaign`), `gqlToken`,
`gqlEnvironment` (a `/tokens` row name exactly — no fallback) and `onBack`
(navigate home). One survey, no strip; a row opens its form.

Copied from Elbrit-Play (`src/app/survey`), where the dev harness
(`/dev/harness/survey`) and SURVEYS_CONTEXT.md live.

## Layout

```
api.js              THE ONE DOOR: createSurveyApi({ source: 'mock' | 'erp' })
data/
  shape.js          question types, validation, payload, per-campaign grouping
  tiles.js          surveyTiles(list, today): a circle per survey, ordered — what elbrit_ring_nav.py should send later
  mockApi.js        survey_my_list / my_subjects / start_subject / upload_file / submit_response, in memory
  mockData.js       5 surveys, 3 roles, 10 distributors, 6 doctors
components/
  SurveyHome        root: home strip + page; a circle opens its survey, Back returns home; drafts, guard
  SurveyPage        one survey on its own page (/survey/<campaign>): survey → form, Back → onBack
  parts             PageHeader, drafts on the device, the "Discard changes?" sheet — shared by both
  SurveyScreen      one survey: header, tags, progress, rows, Add (Self-tag)
  AddSubjectsSheet  search + multi-select of the rep's doctors / distributors
  SubjectForm       "S2 › D1": questions, Save for later (on device), Submit, success
  QuestionCard      all 10 question types, file upload with progress
  SubjectCard       one row — StockistCard's layout
```

Reused from Secondary: Ring Nav, `PinnedBar`, `useUnsavedGuard`, the Add
sheet's pattern, StockistCard's layout, the design system throughout.

## Going live

1. Wire the `erp` source in `api.js` — the calls and the auth rules
   (per-user token, CSRF with cookies, CORS) are in its header and §5.
2. `elbrit_ring_nav.py`: send one tile per survey sent to the caller
   (id `survey-<campaign>`, href `/survey/<campaign>`), by the rules and in
   the order of `data/tiles.js` (badge = left, caption = due / Today / Late /
   Missed, ring = sent vs left; due today and overdue first, done and missed
   last), placed right after the entry tiles.
3. A `/survey/[campaign]` page of its own (today a circle opens the survey
   in place, on the page SurveyHome sits on).
