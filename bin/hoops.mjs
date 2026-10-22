#!/usr/bin/env node
// Local CLI: renders the light and dark SVGs without GitHub Actions.
//
//   GITHUB_TOKEN=... npx hoops --user octocat [--out dist] [--jersey blue-gold]
//                    [--skin '#c68b59'] [--hair '#2b1d14'] [--hair-style short]
//                    [--pace 1] [--fixture calendar.json]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchCalendar } from '../src/github.mjs';
import { buildTimeline, render } from '../src/render.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}

try {
  const user = args.user ?? process.env.HOOPS_USER;
  const calendar = args.fixture
    ? JSON.parse(readFileSync(args.fixture, 'utf8'))
    : await fetchCalendar(user, process.env.GITHUB_TOKEN);
  const options = {
    user,
    jersey: args.jersey,
    skin: args.skin,
    hair: args.hair,
    'hair-style': args['hair-style'] ?? args.hairStyle,
    pace: args.pace,
  };
  for (const k of Object.keys(options)) if (options[k] === undefined) delete options[k];

  if (args.debug !== undefined) {
    // --debug N prints when shot N happens, for freezing frames while tweaking.
    const tl = buildTimeline(calendar.weeks, { pace: Number(options.pace ?? 1) });
    const s = tl.shots[Number(args.debug)];
    console.error(JSON.stringify({ loop: +tl.T.toFixed(2), shots: tl.shots.length, ...(s && { grab: s.grab, release: s.release, swish: s.swish, day: s.day.date }) }));
  }

  const out = args.out ?? 'dist';
  mkdirSync(out, { recursive: true });
  for (const theme of ['light', 'dark']) {
    const file = join(out, theme === 'light' ? 'hoops.svg' : 'hoops-dark.svg');
    writeFileSync(file, render(calendar, { ...options, theme }));
    console.log(`wrote ${file}`);
  }
} catch (err) {
  console.error(`hoops: ${err.message}`);
  process.exit(1);
}
