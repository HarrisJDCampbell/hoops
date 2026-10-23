#!/usr/bin/env node
// Local CLI: renders the light and dark SVGs without GitHub Actions.
//
//   GITHUB_TOKEN=... npx hoops --user octocat [--out dist] [--jersey blue-gold]
//                    [--skin '#c68b59'] [--pace 1] [--order oldest-first] [--footer 'text|none'] [--fixture calendar.json]
//   node bin/hoops.mjs --fixture calendar.json --export mp4 --out dist/hoops.mp4 [--fps 10] [--width 900]

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
  const options = { user, jersey: args.jersey, skin: args.skin, pace: args.pace, order: args.order, footer: args.footer };
  for (const k of Object.keys(options)) if (options[k] === undefined) delete options[k];

  if (args.debug !== undefined) {
    // --debug N prints when shot N happens, for freezing frames while tweaking.
    const tl = buildTimeline(calendar.weeks, { pace: Number(options.pace ?? 1), order: options.order });
    const s = tl.shots[Number(args.debug)];
    console.error(JSON.stringify({ loop: +tl.T.toFixed(2), shots: tl.shots.length, ...(s && { grab: s.grab, release: s.release, swish: s.swish, day: s.day.date }) }));
  }

  if (Object.hasOwn(args, 'export')) {
    const { exportAnimation } = await import('../src/export.mjs');
    let progress = '';
    const result = await exportAnimation(
      calendar,
      options,
      { format: args.export, output: args.out ?? `dist/hoops.${String(args.export ?? '').toLowerCase()}`, fps: args.fps, width: args.width, theme: args.theme },
      (pass, done, total) => {
        progress = `\rhoops: ${pass} ${done}/${total} frames`;
        if (done === total || done === 1 || done % Math.max(1, Math.floor(total / 10)) === 0) process.stderr.write(progress);
      },
    );
    process.stderr.write('\n');
    console.log(`wrote ${result.output} (${result.width}×${result.height}, ${result.fps} fps, ${result.duration.toFixed(2)} seconds)`);
  } else {
    const out = args.out ?? 'dist';
    mkdirSync(out, { recursive: true });
    for (const theme of ['light', 'dark']) {
      const file = join(out, theme === 'light' ? 'hoops.svg' : 'hoops-dark.svg');
      writeFileSync(file, render(calendar, { ...options, theme }));
      console.log(`wrote ${file}`);
    }
  }
} catch (err) {
  console.error(`hoops: ${err.message}`);
  process.exit(1);
}
