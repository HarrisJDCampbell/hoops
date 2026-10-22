import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTimeline, longestStreak, parseJersey, parsePace, render } from '../src/render.mjs';
import { makeCalendar } from './fixtures/make-fixture.mjs';

const calendar = makeCalendar();
const activeDays = calendar.weeks.flatMap((w) => w.contributionDays).filter((d) => d.contributionCount > 0);


test('longest streak crosses week boundaries', () => {
  const weeks = [
    {
      contributionDays: [
        { contributionCount: 1 },
        { contributionCount: 2 },
      ],
    },
    {
      contributionDays: [
        { contributionCount: 1 },
        { contributionCount: 0 },
      ],
    },
  ];

  assert.equal(longestStreak(weeks), 3);
});

test('longest streak resets when a day has no contributions', () => {
  const weeks = [
    {
      contributionDays: [
        { contributionCount: 1 },
        { contributionCount: 1 },
        { contributionCount: 0 },
        { contributionCount: 1 },
      ],
    },
  ];

  assert.equal(longestStreak(weeks), 2);
});

test('longest streak is zero when there are no contributions', () => {
  const weeks = [
    {
      contributionDays: [
        { contributionCount: 0 },
        { contributionCount: 0 },
      ],
    },
    {
      contributionDays: [
        { contributionCount: 0 },
      ],
    },
  ];

  assert.equal(longestStreak(weeks), 0);
});
test('renders the best contribution streak on the scoreboard', () => {
  const weeks = [
    {
      contributionDays: [
        { date: '2026-01-01', weekday: 4, contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
        { date: '2026-01-02', weekday: 5, contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
        { date: '2026-01-03', weekday: 6, contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' },
        { date: '2026-01-04', weekday: 0, contributionCount: 0, contributionLevel: 'NONE' },
      ],
    },
  ];

  const svg = render({ weeks, totalContributions: 3 });

  assert.match(svg, /BEST STREAK 3/);
  assert.match(svg, />PTS<\/text>/);
});
test('one shot for every day with contributions, in calendar order', () => {
  const tl = buildTimeline(calendar.weeks);
  assert.equal(tl.shots.length, activeDays.length);
  assert.deepEqual(tl.shots.map((s) => s.day.date), activeDays.map((d) => d.date));
});

test('the final score is the total contribution count', () => {
  const tl = buildTimeline(calendar.weeks);
  assert.equal(tl.finalScore, calendar.totalContributions);
  assert.equal(tl.scores.at(-1)[1], calendar.totalContributions);
});

test('events happen in order and inside the loop', () => {
  const tl = buildTimeline(calendar.weeks);
  let prev = 0;
  for (const s of tl.shots) {
    assert.ok(s.grab >= prev, 'each shot starts after the previous one');
    assert.ok(s.grab < s.caught && s.caught < s.release && s.release < s.swish);
    prev = s.grab;
  }
  assert.ok(tl.dunk.at < tl.end && tl.end < tl.T);
  for (let i = 1; i < tl.player.length; i++) assert.ok(tl.player[i][0] >= tl.player[i - 1][0], 'player keyframes are in time order');
});

test('pace stretches the game', () => {
  const slow = buildTimeline(calendar.weeks, { pace: 2 }).T;
  const normal = buildTimeline(calendar.weeks, { pace: 1 }).T;
  assert.ok(slow > normal * 1.7, `pace 2 should take about twice as long (${slow} vs ${normal})`);
});

test('every keyframe percentage is between 0 and 100 and never goes backwards', () => {
  const svg = render(calendar);
  // stride and bounce are short loops of their own, not on the game clock.
  const rules = svg.match(/@keyframes [\w-]+\{.*?\}\}/g).filter((r) => !/^@keyframes (stride|bounce)\{/.test(r));
  assert.ok(rules.length > activeDays.length * 3);
  for (const rule of rules) {
    const pcts = [...rule.matchAll(/([\d.]+)%\{/g)].map((m) => Number(m[1]));
    assert.equal(pcts[0], 0, rule.slice(0, 40));
    assert.equal(pcts.at(-1), 100, rule.slice(0, 40));
    for (let i = 1; i < pcts.length; i++) assert.ok(pcts[i] >= pcts[i - 1], rule.slice(0, 40));
  }
});

test('renders clean SVG in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const svg = render(calendar, { theme, user: 'octocat' });
    assert.match(svg, /^<svg [^>]+>/);
    assert.ok(svg.endsWith('</svg>'));
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
    assert.match(svg, /octocat's contributions/);
  }
});

test('reduced motion freezes the animation instead of playing it', () => {
  assert.match(render(calendar), /@media \(prefers-reduced-motion:reduce\)\{\*\{animation-play-state:paused!important/);
});

test('an empty year still renders a dunk', () => {
  const quiet = makeCalendar({ activity: 0 });
  const tl = buildTimeline(quiet.weeks);
  assert.equal(tl.shots.length, 0);
  assert.equal(tl.finalScore, 0);
  assert.doesNotMatch(render(quiet), /NaN|undefined/);
});

test('jersey presets and custom colours', () => {
  assert.deepEqual(parseJersey('blue-gold'), ['#1d428a', '#ffc72c']);
  assert.deepEqual(parseJersey(' #ABC , #123456 '), ['#abc', '#123456']);
  assert.throws(() => parseJersey('lakers'), /jersey must be/);
  assert.throws(() => parseJersey('#fff,red'), /jersey must be/);
  const svg = render(calendar, { jersey: '#111111,#eeeeee' });
  assert.match(svg, /fill="#111111"/);
  assert.match(svg, /fill="#eeeeee"/);
});

test('inputs that end up in the SVG are validated or escaped', () => {
  assert.throws(() => render(calendar, { skin: '"/><script>' }), /skin must be/);
  assert.throws(() => parsePace('fast'), /pace must be/);
  assert.throws(() => parsePace(10), /pace must be/);
  const svg = render(calendar, { user: '<b>&"x' });
  assert.match(svg, /&lt;b&gt;&amp;&quot;x/);
  assert.doesNotMatch(svg, /<b>/);
});
