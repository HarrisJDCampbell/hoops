// GitHub Action entry point. Reads inputs from the INPUT_* environment
// variables the runner sets, renders both themes and writes them to out_dir.

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchCalendar } from './github.mjs';
import { parseColor, parseHairStyle, parseJersey, parsePace, render } from './render.mjs';

const input = (name, fallback = '') => (process.env[`INPUT_${name.toUpperCase()}`] ?? '').trim() || fallback;

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

try {
  const user = input('github_user_name');
  const token = input('github_token');
  const outDir = input('out_dir', 'dist');
  const options = {
    user,
    jersey: input('jersey', 'blue-gold'),
    skin: input('skin', '#c68b59'),
    hair: input('hair', '#2b1d14'),
    hairStyle: input('hair_style', 'short'),
    pace: input('pace', '1'),
  };
  // Fail on a bad input before spending a network call.
  parseJersey(options.jersey);
  parseColor(options.skin, 'skin');
  parseColor(options.hair, 'hair');
  parseHairStyle(options.hairStyle);
  parsePace(options.pace);

  const calendar = await fetchCalendar(user, token);
  mkdirSync(outDir, { recursive: true });
  const light = join(outDir, 'hoops.svg');
  const dark = join(outDir, 'hoops-dark.svg');
  writeFileSync(light, render(calendar, { ...options, theme: 'light' }));
  writeFileSync(dark, render(calendar, { ...options, theme: 'dark' }));

  const days = calendar.weeks.flatMap((w) => w.contributionDays).filter((d) => d.contributionCount > 0).length;
  console.log(`hoops: ${user} went ${days} for ${days} (${calendar.totalContributions} contributions); wrote ${light} and ${dark}`);
  setOutput('light', light);
  setOutput('dark', dark);
} catch (err) {
  console.log(`::error title=hoops::${err.message}`);
  process.exit(1);
}
