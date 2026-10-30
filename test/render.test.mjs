import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTimeline, longestStreak, parseHairStyle, parseJersey, parseOrder, parsePace, render } from '../src/render.mjs';
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

test('order: newest-first walks from the most recent day back', () => {
  const tl = buildTimeline(calendar.weeks, { order: 'newest-first' });
  assert.equal(tl.shots.length, activeDays.length);
  assert.deepEqual(tl.shots.map((s) => s.day.date), [...activeDays].reverse().map((d) => d.date));
  assert.equal(tl.finalScore, calendar.totalContributions);
  assert.equal(tl.player[0][1], 806, 'player starts beside the hoop on the right');

  for (const theme of ['light', 'dark']) {
    const svg = render(calendar, { theme, order: 'newest-first' });
    assert.match(svg, /^<svg [^>]+>/);
    assert.ok(svg.endsWith('</svg>'));
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  }
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

test('light-theme contribution labels use the darkened gold accent', () => {
  const svg = render(calendar, { theme: 'light' });
  assert.match(svg, /fill="#8c5f00">\+\d+<\/text>/);
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
  assert.deepEqual(parseJersey('slate-lime'), ['#334155', '#a3e635']);
  assert.deepEqual(parseJersey('burgundy-sand'), ['#6b1f3a', '#f2c078']);
  assert.deepEqual(parseJersey('teal-coral'), ['#115e59', '#ff9a8b']);
  assert.deepEqual(parseJersey('magenta-cyan'), ['#e60067', '#00f5d4']);
  assert.deepEqual(parseJersey('teal-orange'), ['#009688', '#ff6d00']);
  assert.deepEqual(parseJersey('purple-mint'), ['#5a189a', '#06d6a0']);
  assert.deepEqual(parseJersey('green-gold'), ['#006233', '#ffc72c']);
  assert.deepEqual(parseJersey('wine-sky'), ['#7b113a', '#38bdf8']);
  assert.deepEqual(parseJersey('cobalt-orange'), ['#0052cc', '#ff5400']);
  assert.deepEqual(parseJersey(' #ABC , #123456 '), ['#abc', '#123456']);
  assert.throws(() => parseJersey('lakers'), /jersey must be/);
  assert.throws(() => parseJersey('#fff,red'), /jersey must be/);
  const svg = render(calendar, { jersey: '#111111,#eeeeee' });
  assert.match(svg, /fill="#111111"/);
  assert.match(svg, /fill="#eeeeee"/);
});

test('new jersey preset trims render in dark mode', () => {
  for (const [preset, trim] of [
    ['slate-lime', '#a3e635'],
    ['burgundy-sand', '#f2c078'],
    ['teal-coral', '#ff9a8b'],
  ]) {
    assert.match(render(calendar, { theme: 'dark', jersey: preset }), new RegExp(`fill="${trim}"`));
  }
});

test('inputs that end up in the SVG are validated or escaped', () => {
  assert.throws(() => render(calendar, { skin: '"/><script>' }), /skin must be/);
  assert.throws(() => render(calendar, { hair: 'not-a-color' }), /hair must be/);
  assert.throws(() => render(calendar, { hairStyle: 'invalid-style' }), /hair-style must be/);
  assert.throws(() => parsePace('fast'), /pace must be/);
  assert.throws(() => parsePace(10), /pace must be/);
  assert.throws(() => parseOrder('invalid-order'), /order must be/);
  assert.equal(parseOrder(' newest-first '), 'newest-first');
  assert.equal(parseOrder(), 'oldest-first');
  const svg = render(calendar, { user: '<b>&"x' });
  assert.match(svg, /&lt;b&gt;&amp;&quot;x/);
  assert.doesNotMatch(svg, /<b>/);
});

test('hair colour and hairstyle options', () => {
  assert.equal(parseHairStyle(), 'short');
  assert.equal(parseHairStyle('long'), 'long');
  assert.equal(parseHairStyle(' Headband '), 'headband');
  assert.throws(() => parseHairStyle('afro'), /hair-style must be/);

  // default hair colour and style
  const def = render(calendar);
  assert.match(def, /fill="#2b1d14"/);

  // custom hair colour
  const customHair = render(calendar, { hair: '#e6be8a' });
  assert.match(customHair, /fill="#e6be8a"/);
  // eye at (1, -24) stays dark (#2b1d14) even with blonde hair
  assert.match(customHair, /<rect x="1" y="-24" width="1" height="1" fill="#2b1d14"\/>/);

  // long hair style renders the plume and flow down the back
  const longHair = render(calendar, { hairStyle: 'long', hair: '#123456' });
  assert.match(longHair, /<rect x="-5" y="-25" width="2" height="4" fill="#123456"\/>/);

  // headband style renders the headband band in trim colour
  const headband = render(calendar, { hairStyle: 'headband', jersey: 'purple-gold' });
  assert.match(headband, /<rect x="-3" y="-25" width="6" height="1" fill="#fdb927"\/>/);
  // the band sits above the eye, so the eye is still drawn
  assert.match(headband, /<rect x="1" y="-24" width="1" height="1" fill="#2b1d14"\/>/);
});

test('custom footer text is escaped, defaults are preserved, and none hides it', () => {
  const defaultFooter = `${calendar.totalContributions.toLocaleString('en-US')} contributions in the last year · one shot for every day with contributions · ${activeDays.length} for ${activeDays.length}`;
  assert.ok(render(calendar).includes(`>${defaultFooter}</text>`));

  const custom = render(calendar, { footer: '<script>' });
  assert.ok(custom.includes('&lt;script&gt;'));
  assert.ok(!custom.includes('<script>'));
  assert.ok(!render(calendar, { footer: 'none' }).includes('contributions in the last year'));

  const long = render(calendar, { footer: 'x'.repeat(200) });
  const fontSize = Number(long.match(/<text x="16" y="215" font-size="([^"]+)"/)?.[1]);
  assert.ok(fontSize > 0 && fontSize < 10);
});
