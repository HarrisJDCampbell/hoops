import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { planExport } from '../src/export.mjs';

test('plans one complete loop with an integer frame rate and even aspect-ratio dimensions', () => {
  const plan = planExport({ format: 'mp4', output: 'clip.mp4', fps: 10, width: 640, duration: 12.21 });
  assert.equal(plan.format, 'mp4');
  assert.equal(plan.fps, 10);
  assert.equal(plan.frames, 123);
  assert.equal(plan.duration, 12.3);
  assert.equal(plan.width, 640);
  assert.equal(plan.height, 156);
});

test('keeps long timelines complete instead of truncating the frame plan', () => {
  const plan = planExport({ format: 'gif', output: 'full-loop.gif', fps: 10, duration: 1689.7846153846215 });
  assert.equal(plan.frames, 16898);
  assert.equal(plan.duration, 1689.8);
});

test('rejects unsupported formats, mismatched extensions, and invalid frame rates or dimensions', () => {
  const valid = { format: 'gif', output: 'clip.gif', duration: 1 };
  assert.throws(() => planExport({ ...valid, format: 'webm' }), /format must be gif or mp4/);
  assert.throws(() => planExport({ ...valid, output: 'clip.mp4' }), /must end in \.gif/);
  for (const fps of [0, 31, 1.5, 'fast']) assert.throws(() => planExport({ ...valid, fps }), /fps must be a whole number/);
  for (const width of [318, 1802, 899]) assert.throws(() => planExport({ ...valid, width }), /width/);
  assert.throws(() => planExport({ ...valid, duration: Infinity }), /positive finite number/);
});

test('reports a missing FFmpeg binary before writing an output file', () => {
  const result = spawnSync(process.execPath, [
    'bin/hoops.mjs', '--fixture', 'test/fixtures/calendar.json', '--export', 'mp4', '--out', '/private/tmp/hoops-missing-ffmpeg.mp4',
  ], { encoding: 'utf8', env: { ...process.env, FFMPEG_PATH: '/private/tmp/no-such-ffmpeg' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs FFmpeg on PATH/);
});
