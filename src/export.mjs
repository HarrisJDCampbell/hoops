// Optional local video export. The GitHub Action does not import this module.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { link, unlink } from 'node:fs/promises';
import { buildTimeline, parsePace, render } from './render.mjs';

const WIDTH = 900;
const HEIGHT = 218;

function integerOption(value, fallback, name, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max} (got "${value ?? fallback}")`);
  }
  return number;
}

export function planExport({ format, output, fps, width, duration } = {}) {
  const type = String(format ?? '').toLowerCase();
  if (!['gif', 'mp4'].includes(type)) throw new Error(`export format must be gif or mp4 (got "${format ?? ''}")`);
  if (typeof output !== 'string' || !output.trim()) throw new Error('an output file path is required');
  if (extname(output).toLowerCase() !== `.${type}`) throw new Error(`output path must end in .${type}`);

  const frameRate = integerOption(fps, 10, 'fps', 1, 30);
  const outputWidth = integerOption(width, WIDTH, 'width', 320, 1800);
  if (outputWidth % 2 !== 0) throw new Error('width must be an even number for MP4 compatibility');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('animation duration must be a positive finite number');

  const frames = Math.ceil(duration * frameRate);
  if (!Number.isSafeInteger(frames) || frames < 1) throw new Error('animation is too long to export safely');
  const outputHeight = Math.max(2, Math.round((outputWidth * HEIGHT / WIDTH) / 2) * 2);
  return {
    format: type,
    output: resolve(output),
    fps: frameRate,
    width: outputWidth,
    height: outputHeight,
    frames,
    duration: frames / frameRate,
  };
}

function checkFfmpeg(format) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const version = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8', timeout: 5000 });
  if (version.error?.code === 'ENOENT') {
    throw new Error('GIF/MP4 export needs FFmpeg on PATH; install FFmpeg and try again');
  }
  if (version.error || version.status !== 0) {
    throw new Error(`could not run FFmpeg: ${version.error?.message ?? version.stderr?.trim() ?? 'unknown error'}`);
  }

  const encoders = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 5000 });
  const required = format === 'gif' ? /\bgif\s+GIF/ : /\blibx264\s+H\.264/;
  if (encoders.error || encoders.status !== 0 || !required.test(encoders.stdout ?? '')) {
    const encoder = format === 'gif' ? 'GIF' : 'libx264 (H.264)';
    throw new Error(`FFmpeg must include the ${encoder} encoder to export ${format.toUpperCase()}`);
  }
  return ffmpeg;
}

async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('GIF/MP4 export needs optional Playwright; install it with `npm install --no-save --package-lock=false playwright`');
    }
    throw error;
  }
}

function startEncoder(ffmpeg, args) {
  const child = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const result = new Promise((resolveResult) => {
    child.once('error', (error) => resolveResult({ error }));
    child.once('close', (code, signal) => resolveResult({ code, signal }));
  });
  return { child, result, stderr: () => stderr };
}

function encoderError(outcome, stderr) {
  if (outcome.error?.code === 'ENOENT') return new Error('FFmpeg was not found; install FFmpeg and ensure `ffmpeg` is on PATH');
  const detail = stderr.trim();
  return new Error(`FFmpeg could not encode the export${detail ? `: ${detail}` : ''}`);
}

async function streamFrames(page, settings, ffmpeg, args, onProgress) {
  const encoder = startEncoder(ffmpeg, args);
  try {
    for (let frame = 0; frame < settings.frames; frame++) {
      await page.evaluate((time) => {
        for (const element of document.querySelectorAll('*')) {
          const style = getComputedStyle(element);
          const names = style.animationName.split(',').map((name) => name.trim());
          if (names.every((name) => name === 'none')) continue;

          if (!element.__hoopsExportDelays) {
            element.__hoopsExportDelays = style.animationDelay.split(',').map((delay) => {
              const value = Number.parseFloat(delay);
              return delay.trim().endsWith('ms') ? value / 1000 : value;
            });
          }
          const delays = names.map((_, index) => {
            const base = element.__hoopsExportDelays[index % element.__hoopsExportDelays.length];
            return `${base - time}s`;
          });
          element.style.setProperty('animation-delay', delays.join(', '), 'important');
          element.style.setProperty('animation-play-state', names.map(() => 'paused').join(', '), 'important');
        }
      }, frame / settings.fps);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const image = await page.screenshot({ type: 'png', omitBackground: settings.format === 'gif' });
      if (!encoder.child.stdin.write(image)) {
        const outcome = await Promise.race([
          once(encoder.child.stdin, 'drain').then(() => null),
          encoder.result,
        ]);
        if (outcome) throw encoderError(outcome, encoder.stderr());
      }
      onProgress?.(frame + 1, settings.frames);
    }
    encoder.child.stdin.end();
    const outcome = await encoder.result;
    if (outcome.error || outcome.code !== 0) throw encoderError(outcome, encoder.stderr());
  } catch (error) {
    encoder.child.stdin.destroy();
    if (encoder.child.exitCode === null && encoder.child.signalCode === null) encoder.child.kill();
    await encoder.result;
    throw error;
  }
}

export async function exportAnimation(calendar, options = {}, settings = {}, onProgress) {
  const pace = parsePace(options.pace ?? 1);
  const timeline = buildTimeline(calendar.weeks, { pace, order: options.order, maxSeconds: options.maxSeconds });
  const theme = settings.theme ?? 'dark';
  const plan = planExport({ ...settings, duration: timeline.T });
  if (existsSync(plan.output)) throw new Error(`output already exists: ${plan.output}`);

  const svg = render(calendar, { ...options, theme, pace });
  const ffmpeg = checkFfmpeg(plan.format);
  let chromium;
  try {
    chromium = await loadChromium();
  } catch (error) {
    throw error;
  }

  mkdirSync(dirname(plan.output), { recursive: true });
  const temporaryOutput = join(dirname(plan.output), `.${basename(plan.output)}.${process.pid}.tmp.${plan.format}`);
  if (existsSync(temporaryOutput)) throw new Error(`temporary output already exists: ${temporaryOutput}`);
  const temporaryDirectory = plan.format === 'gif' ? mkdtempSync(join(tmpdir(), 'hoops-export-')) : undefined;
  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--no-sandbox'] });
    } catch (error) {
      throw new Error(`could not start sandboxed Chromium; install it with npx playwright install chromium: ${error.message}`);
    }
    const background = theme === 'light' ? '#ffffff' : '#0d1117';
    const context = await browser.newContext({
      viewport: { width: plan.width, height: plan.height },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    await page.setContent(`<html><head><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${plan.format === 'gif' ? 'transparent' : background}}svg{display:block;width:100vw;height:100vh}</style></head><body>${svg}</body></html>`);

    const input = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(plan.fps), '-i', 'pipe:0'];
    const report = (pass) => (done, total) => {
      if (done === total || done === 1 || done % Math.max(1, Math.floor(total / 10)) === 0) {
        onProgress?.(pass, done, total);
      }
    };

    if (plan.format === 'gif') {
      const palette = join(temporaryDirectory, 'palette.png');
      await streamFrames(page, plan, ffmpeg, [...input, '-vf', 'palettegen=stats_mode=diff:reserve_transparent=1', '-frames:v', '1', palette], report('palette'));
      await streamFrames(page, plan, ffmpeg, [...input, '-i', palette, '-filter_complex', '[0:v][1:v]paletteuse=dither=bayer', '-loop', '0', '-n', temporaryOutput], report('encode'));
    } else {
      await streamFrames(page, plan, ffmpeg, [...input, '-frames:v', String(plan.frames), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-n', temporaryOutput], report('encode'));
    }
    await link(temporaryOutput, plan.output);
    await unlink(temporaryOutput);
    return plan;
  } catch (error) {
    await unlink(temporaryOutput).catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
