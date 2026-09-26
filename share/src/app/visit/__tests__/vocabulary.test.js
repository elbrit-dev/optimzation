import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* THE WORDS ARE A CONTRACT, so they get a test.
 *
 * Every drift this catches was real: the same call pilled "Visited" on a card
 * header and "Geo verified" on the attendee row inside it; a legend reading
 * "Yet to visit" over rows badged "Pending"; "Geo-verified" in one card and
 * "Geo verified" in the next. None of it is visible to a unit test that
 * renders one component at a time, because each component was self-consistent.
 *
 * So this reads the SOURCE rather than the DOM. Comments are stripped first —
 * the banned words are perfectly fine in a note explaining why they are
 * banned, and this file itself is the proof.
 *
 * ADDING A BANNED WORD IS CHEAP. If you catch a second phrasing for something
 * this screen already has a word for, put it here rather than fixing the one
 * instance you found. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISIT = path.join(HERE, '..');

/* Strings only: comments carry the reasoning, and reasoning has to be able to
   name the thing it is arguing against. Block comments first, then line
   comments — and never a `//` that is part of a URL. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sources() {
  const out = [];
  for (const dir of ['components', 'data']) {
    for (const file of fs.readdirSync(path.join(VISIT, dir))) {
      if (!/\.jsx?$/.test(file)) continue;
      out.push([`${dir}/${file}`, code(fs.readFileSync(path.join(VISIT, dir, file), 'utf8'))]);
    }
  }
  return out;
}

/* [pattern, what to say instead]. The message is the point: a failure here
   should tell you the word, not send you to read this file. */
const BANNED = [
  [/Geo-verified/i, '"Geo" — one word, per VISIT_STATUS_LABEL'],
  [/Yet to visit/i, '"Pending" — one word for "planned and not yet done"'],
  [/\bVisited\b/, '"Geo verified" — a green pill means the same thing everywhere'],
  [/Visits happened/, '"Visits done"'],
  [/no completed visits/i, '"no visits done" — the verb is `done`'],
  [/Nobody in this scope/, '"No one in this scope."'],
  [/No plan today/, '"No plan" — the period is already in the subtitle'],
  [/'(My|Team) Report'/, 'sentence case: "My report" / "Team report"'],
  /* The screen sees the log, not the day: it cannot know who was working. */
  [/Not reporting/, '"Not reported"'],
  [/Who is working/, '"Who has reported"'],
  [/reps working/, '"reps reported"'],
  [/'On leave/, '"Absent" — see ATTENDANCE_LABEL'],
];

describe('the /visit lexicon', () => {
  it.each(BANNED)('does not say %s anywhere', (pattern, instead) => {
    const offenders = sources()
      .filter(([, source]) => pattern.test(source))
      .map(([name]) => name);

    expect(offenders, `${offenders.join(', ')} — say ${instead}`).toEqual([]);
  });

  it('keeps the three visit states to three words', async () => {
    /* If a fourth state ever appears, it needs a word here before it needs a
       colour — the tone map is what the legends, pills and bars all read. */
    const { VISIT_STATUS, VISIT_STATUS_LABEL, VISIT_STATUS_TONE } = await import('../data/shape');
    expect(VISIT_STATUS).toEqual(['verified', 'force', 'pending']);
    expect(Object.keys(VISIT_STATUS_LABEL)).toEqual(VISIT_STATUS);
    expect(Object.keys(VISIT_STATUS_TONE)).toEqual(VISIT_STATUS);
  });
});
