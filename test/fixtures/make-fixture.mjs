// Writes calendar.json: a year of made-up contributions with the same shape
// the GitHub API returns. Seeded, so the output is identical on every run.
//
//   node test/fixtures/make-fixture.mjs

import { writeFileSync } from 'node:fs';

export function makeCalendar({ seed = 7, weeks = 53, start = '2025-10-19', activity = 0.45 } = {}) {
  let s = seed >>> 0;
  const rand = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const day0 = new Date(`${start}T00:00:00Z`);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(day0.getTime() + i * 86400000);
    const busy = rand() < activity;
    days.push({ date: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), contributionCount: busy ? 1 + Math.floor(rand() ** 2 * 30) : 0 });
  }

  // Levels by quartile of the non-zero days, like GitHub does.
  const sorted = days.map((d) => d.contributionCount).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const level = (n) => (n === 0 ? 'NONE' : n <= q1 ? 'FIRST_QUARTILE' : n <= q2 ? 'SECOND_QUARTILE' : n <= q3 ? 'THIRD_QUARTILE' : 'FOURTH_QUARTILE');

  const out = [];
  for (let w = 0; w < weeks; w++) {
    out.push({ contributionDays: days.slice(w * 7, w * 7 + 7).map((d) => ({ ...d, contributionLevel: level(d.contributionCount) })) });
  }
  return { totalContributions: days.reduce((a, d) => a + d.contributionCount, 0), weeks: out };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('./calendar.json', import.meta.url), `${JSON.stringify(makeCalendar(), null, 1)}\n`);
  console.log('wrote test/fixtures/calendar.json');
}
