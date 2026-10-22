// Turns a GitHub contribution calendar into an animated basketball court.
//
// A player does a slow shootaround under the contribution grid: for every day
// with contributions he walks to that week, reaches up, and the day's square
// floats down into his hands and becomes the ball. He dribbles it, steps in,
// shoots, and it goes in for that day's contribution count. When the year is
// done he jogs to the hoop and dunks, and the court resets.
//
// Everything runs on one clock. buildTimeline() lays the game out as timed
// events; render() compiles those events into one @keyframes rule per element,
// so every part of the scene stays in sync by construction.

// ---------- options ----------

export const JERSEYS = {
  'blue-gold': ['#1d428a', '#ffc72c'],
  'purple-gold': ['#552583', '#fdb927'],
  'green-white': ['#007a33', '#ffffff'],
  'red-white': ['#ce1141', '#ffffff'],
  'orange-navy': ['#f58426', '#0c2340'],
  'black-teal': ['#1d1160', '#00788c'],
  'slate-lime': ['#334155', '#a3e635'],
  'burgundy-sand': ['#6b1f3a', '#f2c078'],
  'teal-coral': ['#115e59', '#ff9a8b'],
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Accepts a preset name or "primary,trim" as two hex colours.
export function parseJersey(value = 'blue-gold') {
  const v = String(value).trim().toLowerCase();
  if (JERSEYS[v]) return JERSEYS[v];
  const parts = v.split(',').map((p) => p.trim());
  if (parts.length === 2 && parts.every((p) => HEX.test(p))) return parts;
  throw new Error(`jersey must be one of ${Object.keys(JERSEYS).join(', ')}, or two hex colours like "#1d428a,#ffc72c" (got "${value}")`);
}

export function parseColor(value, name) {
  const v = String(value).trim();
  if (!HEX.test(v)) throw new Error(`${name} must be a hex colour like #c68b59 (got "${value}")`);
  return v;
}

export function parsePace(value = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.25 || n > 4) throw new Error(`pace must be a number from 0.25 to 4 (got "${value}")`);
  return n;
}

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// ---------- layout ----------

const W = 900, H = 218;
const CELL = 11, STEP = 13, GX = 16, GY = 30; // contribution grid
const FY = 200;                                // floor line
const RIM = { x1: 832, x2: 860, y: 128 };      // rim, in front of the backboard
const RIM_CX = (RIM.x1 + RIM.x2) / 2;
const BALL_R = 4;
const SCALE = 1.35;                            // sprite is drawn in pixel units, then scaled
const HAND_Y = 36 * SCALE;                     // ball height above the feet when shooting

const colX = (i) => GX + i * STEP + CELL / 2;
const cellY = (weekday) => GY + weekday * STEP;

export const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const THEMES = {
  light: {
    cells: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    floor: '#d0d7de', text: '#57606a', strong: '#24292f', accent: '#b7791f',
    board: '#ffffff', boardLine: '#8c959f', rim: '#cf222e', net: '#8c959f', pole: '#6e7781',
  },
  dark: {
    cells: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    floor: '#30363d', text: '#7d8590', strong: '#e6edf3', accent: '#ffc72c',
    board: '#0d1117', boardLine: '#8b949e', rim: '#f85149', net: '#8b949e', pole: '#6e7681',
  },
};
const HAIR = '#2b1d14', SHOES = '#f0f6fc', SEAM = '#7c3a10';

// ---------- timeline ----------

const EPS = 0.01;  // gap used to make a value change look instant
const FADE = 0.8;  // reset fade at the end of the loop
const HOLD = 3;    // pause after the dunk

// Seconds for each beat of a shot at pace 1. Pace multiplies all of them.
const BEATS = {
  walk: 0.3,     // per column of walking
  grab: 0.55,    // bubble floating down into his hands
  dribble: 1.1,  // dribbling before the shot
  rise: 0.18,    // gather to release
  land: 0.35,    // gather to landing
  watch: 0.7,    // watching the ball before going for the next bubble
};
const STEP_IN = 10; // pixels he steps toward the hoop while dribbling

// Longer shots hang in the air longer.
const flightTime = (dist, pace) => (1.0 + Math.min(1, dist / 800) * 0.7) * Math.min(pace, 1.5);

export function buildTimeline(weeks, { pace = 1 } = {}) {
  const b = Object.fromEntries(Object.entries(BEATS).map(([k, v]) => [k, v * pace]));
  const player = [];   // [t, x, y]
  const walking = [];  // [start, end] windows where he is moving along the floor
  const armsUp = [];   // [start, end] windows with his arms raised
  const holding = [];  // { from, to, level } windows where he is dribbling a bubble
  const shots = [];    // { grab, caught, release, flight, swish, x, y, grabX, day, count }
  const scores = [];   // [t, cumulative score]

  let t = 0.6;
  let x = colX(0) - 28;
  player.push([0, x, 0], [t, x, 0]);
  let score = 0;

  const walkTo = (nx) => {
    if (nx === x) return;
    const start = t;
    t += (Math.abs(nx - x) / STEP) * b.walk;
    walking.push([start, t]);
    x = nx;
    player.push([t, x, 0]);
  };

  weeks.forEach((week, i) => {
    for (const day of week.contributionDays) {
      if (!(day.contributionCount > 0)) continue;
      walkTo(colX(i));
      const grab = t, caught = t + b.grab;
      armsUp.push([grab, caught]);
      t = caught;
      player.push([t, x, 0]);

      const stepStart = t + b.dribble * 0.68;
      t += b.dribble;
      walking.push([stepStart, t]);
      player.push([stepStart, x, 0], [t, x + STEP_IN, 0]);
      x += STEP_IN;
      holding.push({ from: caught, to: t, level: LEVELS[day.contributionLevel] || 1 });

      const release = t + b.rise, land = t + b.land;
      player.push([release, x, -8], [land, x, 0]);
      armsUp.push([t, land]);
      const flight = flightTime(RIM_CX - x, pace);
      const swish = release + flight;
      shots.push({ grab, caught, release, flight, swish, x, y: FY - 8 - HAND_Y, grabX: colX(i), day, count: day.contributionCount });
      scores.push([swish, (score += day.contributionCount)]);
      t = land + b.watch;
      player.push([t, x, 0]);
    }
  });

  // Jog to the hoop and dunk. It's for show: the score is already final.
  const runUp = 806;
  t = Math.max(t, (shots.at(-1)?.swish ?? t) - 0.4);
  player.push([t, x, 0]);
  const jogStart = t;
  walkTo(runUp);
  const takeoff = t + 0.1;
  holding.push({ from: jogStart, to: takeoff, level: 4 });
  const peak = takeoff + 0.35;
  const hangEnd = peak + 0.25;
  const landed = hangEnd + 0.3;
  const dunkX = RIM_CX - 8;
  const peakY = RIM.y - (FY - HAND_Y) - 4; // hands just above the rim
  player.push([takeoff, runUp, 0], [peak, dunkX, peakY], [hangEnd, dunkX, peakY + 6], [landed, dunkX - 6, 0]);
  armsUp.push([takeoff, landed]);

  const end = landed + HOLD;
  const T = end + FADE;
  return { T, end, rise: b.rise, player, walking, armsUp, holding, shots, dunk: { takeoff, at: peak }, scores, finalScore: score };
}

// ---------- keyframes ----------

function keyframes(name, frames, T) {
  const sorted = [...frames].sort((a, b) => a[0] - b[0]);
  if (sorted[0][0] > 0) sorted.unshift([0, sorted[0][1]]);
  if (sorted.at(-1)[0] < T) sorted.push([T, sorted.at(-1)[1]]);
  const body = sorted
    .map(([t, css]) => `${Math.min(100, Math.max(0, (t / T) * 100)).toFixed(3)}%{${css}}`)
    .join('');
  return `@keyframes ${name}{${body}}`;
}

const tr = (x, y) => `transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;

// Joins windows that touch or overlap, so back-to-back windows don't flicker.
function merge(list) {
  const out = [];
  for (const [a, b] of [...list].sort((p, q) => p[0] - q[0])) {
    const last = out.at(-1);
    if (last && a <= last[1] + 2 * EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

// Opacity that is `on` inside the windows and `off` outside, switching instantly.
function windows(list, T, on = 1, off = 0) {
  const frames = [[0, `opacity:${off}`]];
  for (const [a, b] of merge(list)) {
    frames.push([Math.max(0, a - EPS), `opacity:${off}`], [a, `opacity:${on}`]);
    frames.push([b, `opacity:${on}`], [Math.min(T, b + EPS), `opacity:${off}`]);
  }
  return frames;
}

function quadPoint(p0, c, p1, s) {
  const u = 1 - s;
  return [u * u * p0[0] + 2 * u * s * c[0] + s * s * p1[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p1[1]];
}

// A quadratic Bezier with its control point halfway across: x moves at a
// constant rate and y follows a parabola, which is what a real shot does.
// Sampled into straight segments because animating along a curved path
// directly is unreliable in Safari.
function arc(from, to, startT, duration, samples = 12) {
  const dist = Math.abs(to[0] - from[0]);
  const apex = Math.max(8, Math.min(from[1], to[1]) - (36 + dist * 0.12));
  const control = [(from[0] + to[0]) / 2, 2 * apex - (from[1] + to[1]) / 2];
  const frames = [];
  for (let k = 0; k <= samples; k++) {
    const s = k / samples;
    const [x, y] = quadPoint(from, control, to, s);
    frames.push([startT + s * duration, `${tr(x, y)};opacity:1`]);
  }
  return frames;
}

const shortDate = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

// ---------- render ----------

export function render(calendar, { theme = 'dark', jersey = 'blue-gold', skin = '#c68b59', pace = 1, user = '' } = {}) {
  const pal = THEMES[theme];
  if (!pal) throw new Error(`theme must be light or dark (got "${theme}")`);
  const [primary, trim] = parseJersey(jersey);
  const skinTone = parseColor(skin, 'skin');
  pace = parsePace(pace);

  const weeks = calendar.weeks;
  const tl = buildTimeline(weeks, { pace });
  const { T } = tl;
  const dur = `${T.toFixed(2)}s linear infinite`;
  const css = [];
  const els = [];
  const anim = (cls, frames, extra = '') => {
    css.push(keyframes(cls, frames, T));
    css.push(`.${cls}{animation:${cls} ${dur};${extra}}`);
  };

  // Grid: an empty layer underneath, and a filled square on top for each
  // active day. When he reaches up for it, the square floats down into his
  // hands and becomes the ball.
  const shotFor = new Map(tl.shots.map((s) => [s.day.date, s]));
  const empty = [];
  const filled = [];
  weeks.forEach((week, i) => {
    for (const day of week.contributionDays) {
      const cx = GX + i * STEP, cy = cellY(day.weekday);
      const rect = `x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2"`;
      empty.push(`<rect ${rect} fill="${pal.cells[0]}"/>`);
      const level = LEVELS[day.contributionLevel] ?? 0;
      const s = shotFor.get(day.date);
      if (level === 0 || !s) continue;
      const dx = s.grabX + SCALE - (cx + CELL / 2), dy = FY - HAND_Y - (cy + CELL / 2);
      const cls = `d${day.date.replaceAll('-', '')}`;
      anim(cls, [
        [s.grab - EPS, `${tr(0, 0)};opacity:1`],
        [s.caught, `${tr(dx, dy)};opacity:1`],
        [s.caught + EPS, `${tr(dx, dy)};opacity:0`],
        [tl.end, `${tr(0, 0)};opacity:0`],
        [T, `${tr(0, 0)};opacity:1`],
      ], 'animation-timing-function:ease-out');
      filled.push(`<rect class="${cls}" ${rect} fill="${pal.cells[level]}"/>`);
    }
  });
  els.push(`<g>${empty.join('')}</g>`, ...filled);

  // Court and hoop, with the net flicking on every make.
  els.push(`<line x1="0" y1="${FY + 0.5}" x2="${W}" y2="${FY + 0.5}" stroke="${pal.floor}" stroke-width="1"/>`);
  els.push(`<rect x="872" y="112" width="4" height="${FY - 112}" fill="${pal.pole}"/>`);
  els.push(`<rect x="864" y="114" width="8" height="3" fill="${pal.pole}"/>`);
  els.push(`<rect x="861.5" y="96.5" width="4" height="40" fill="${pal.board}" stroke="${pal.boardLine}"/>`);
  css.push(keyframes('net', [[0, 'transform:scaleY(1)'],
    ...tl.shots.flatMap(({ swish: a }) => [[a, 'transform:scaleY(1)'], [a + 0.08, 'transform:scaleY(1.35)'], [a + 0.25, 'transform:scaleY(1)']]),
    [tl.dunk.at + 0.05, 'transform:scaleY(1)'], [tl.dunk.at + 0.15, 'transform:scaleY(1.45)'], [tl.dunk.at + 0.4, 'transform:scaleY(1)'],
  ], T));
  css.push(`.net{animation:net ${dur};transform-box:fill-box;transform-origin:50% 0}`);
  const ny = RIM.y + 1, nb = RIM.y + 17;
  els.push(`<g class="net" stroke="${pal.net}" stroke-width="1" fill="none">` +
    `<path d="M${RIM.x1} ${ny} L${RIM.x1 + 6} ${nb} L${RIM.x2 - 6} ${nb} L${RIM.x2} ${ny}"/>` +
    `<path d="M${RIM.x1 + 7} ${ny} L${RIM.x1 + 9} ${nb} M${RIM.x2 - 7} ${ny} L${RIM.x2 - 9} ${nb}"/>` +
    `<path d="M${RIM.x1 + 3} ${ny + 8} L${RIM.x2 - 3} ${ny + 8}"/></g>`);

  // Shots: the ball is the day's bubble, in its own green. Every one arcs in,
  // drops through the net and rolls away, and the day's count pops up by the rim.
  const ballSvg = (cls, fill) => `<g class="${cls}"><circle r="${BALL_R}" fill="${fill}"/>` +
    `<path d="M-${BALL_R} 0H${BALL_R}M0 -${BALL_R}V${BALL_R}" stroke="${SEAM}" stroke-opacity="0.45" stroke-width="0.8"/></g>`;
  const floorY = FY - BALL_R;
  const hidden = (x, y) => `${tr(x, y)};opacity:0`;
  tl.shots.forEach((s, k) => {
    const from = [s.x + SCALE, s.y];
    const a = s.swish;
    anim(`s${k}`, [
      [0, hidden(...from)], [s.release - EPS, hidden(...from)],
      ...arc(from, [RIM_CX, RIM.y - 2], s.release, s.flight),
      [a + 0.15, `${tr(RIM_CX, RIM.y + 20)};opacity:1`],
      [a + 0.35, `${tr(RIM_CX, floorY)};opacity:1`],
      [a + 0.5, `${tr(RIM_CX - 6, floorY - 12)};opacity:1`],
      [a + 0.65, `${tr(RIM_CX - 12, floorY)};opacity:1`],
      [a + 0.85, `${tr(RIM_CX - 18, floorY)};opacity:0`],
    ]);
    els.push(ballSvg(`s${k}`, pal.cells[LEVELS[s.day.contributionLevel] || 1]));

    anim(`p${k}`, [
      [0, `${tr(0, 0)};opacity:0`], [a - EPS, `${tr(0, 0)};opacity:0`],
      [a, `${tr(0, 0)};opacity:1`], [a + 1.1, `${tr(0, -16)};opacity:0`],
    ]);
    els.push(`<text class="p${k}" x="${RIM_CX - 36}" y="${RIM.y - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="${pal.accent}">+${s.count}</text>`);
  });

  // Dunk ball: travels in the player's hands, then drops through the rim.
  const dunkHidden = hidden(RIM_CX, RIM.y - 8);
  anim('dunkball', [
    [0, dunkHidden], [tl.dunk.at - EPS, dunkHidden],
    [tl.dunk.at, `${tr(RIM_CX, RIM.y - 8)};opacity:1`],
    [tl.dunk.at + 0.2, `${tr(RIM_CX, RIM.y + 22)};opacity:1`],
    [tl.dunk.at + 0.4, `${tr(RIM_CX, floorY)};opacity:1`],
    [tl.dunk.at + 0.6, `${tr(RIM_CX + 4, floorY - 16)};opacity:1`],
    [tl.dunk.at + 0.8, `${tr(RIM_CX + 8, floorY)};opacity:1`],
    [tl.dunk.at + 0.92, `${tr(RIM_CX + 10, floorY - 6)};opacity:1`],
    [tl.dunk.at + 1.04, `${tr(RIM_CX + 12, floorY)};opacity:1`],
    [tl.end, `${tr(RIM_CX + 12, floorY)};opacity:1`],
    [tl.end + FADE * 0.5, `${tr(RIM_CX + 12, floorY)};opacity:0`],
  ]);
  els.push(ballSvg('dunkball', pal.cells[4]));

  // Drawn after the balls so they pass behind the front of the rim.
  els.push(`<line x1="${RIM.x1}" y1="${RIM.y}" x2="${RIM.x2 + 2}" y2="${RIM.y}" stroke="${pal.rim}" stroke-width="2.5" stroke-linecap="round"/>`);

  // Player: pixel sprite with its feet at (0, 0), facing the hoop. Jersey in
  // the primary colour with trim and a number in the trim colour.
  const r = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
  const legs = (lx, rx, rh) =>
    r(lx, -8, 2, 6, skinTone) + r(lx, -2, 2, 2, SHOES) +
    r(rx, -8, 2, rh, skinTone) + r(rx, -8 + rh, 2, 2, SHOES);
  // Legs stride only while he is moving; otherwise he stands.
  css.push('@keyframes stride{0%{opacity:1}50%{opacity:0}}');
  css.push('.legA{animation:stride .36s steps(1) infinite}.legB{animation:stride .36s steps(1) infinite;animation-delay:-.18s}');
  css.push('@keyframes bounce{0%{transform:translateY(-8px)}100%{transform:translateY(0)}}');
  css.push('.bounce{animation:bounce .24s ease-in infinite alternate}');
  anim('player', tl.player.map(([t, x, y]) => [t, tr(x, FY + y)]));
  anim('walk', windows(tl.walking, T, 1, 0));
  anim('stand', windows(tl.walking, T, 0, 1));
  anim('arms-up', windows(tl.armsUp, T, 1, 0));
  anim('arms-down', windows(tl.armsUp, T, 0, 1));
  anim('dribble', windows(tl.holding.map((h) => [h.from, h.to]), T, 1, 0));
  // The ball he's holding takes the colour of the bubble he grabbed.
  const fills = [[0, `fill:${pal.cells[1]}`]];
  for (const h of tl.holding) fills.push([h.from - EPS, fills.at(-1)[1]], [h.from, `fill:${pal.cells[h.level]}`]);
  css.push(keyframes('ballfill', fills, T));
  anim('fadeplayer', [[0, 'opacity:0'], [0.4, 'opacity:1'], [tl.end, 'opacity:1'], [tl.end + FADE * 0.5, 'opacity:0']]);
  els.push(`<g class="fadeplayer"><g class="player"><g transform="scale(${SCALE})">` +
    `<g class="stand">${legs(-3, 1, 6)}</g>` +
    `<g class="walk"><g class="legA">${legs(-3, 1, 6)}</g><g class="legB">${legs(-4, 2, 4)}</g></g>` +
    r(-4, -12, 8, 4, primary) + r(-4, -12, 8, 1, trim) + r(3, -11, 1, 3, trim) +
    r(-4, -20, 8, 8, primary) + r(-2, -20, 4, 1, trim) + r(-4, -20, 1, 8, trim) +
    r(3, -20, 1, 8, trim) + r(-1, -18, 2, 4, trim) +
    r(-3, -26, 6, 6, skinTone) + r(-3, -26, 6, 2, HAIR) + r(1, -24, 1, 1, HAIR) +
    `<g class="arms-down">${r(-6, -19, 2, 6, skinTone)}${r(4, -19, 2, 7, skinTone)}</g>` +
    `<g class="arms-up">${r(-3, -34, 2, 14, skinTone)}${r(1, -34, 2, 14, skinTone)}` +
    `<circle class="handball" cx="1" cy="-36" r="${BALL_R / SCALE}"/></g>` +
    `<g class="dribble"><g class="bounce"><circle class="held" cx="7" cy="-2.6" r="2.6"/></g></g>` +
    `</g></g></g>`);

  // The ball in his hands shows from the gather to the release; the shot ball takes over.
  css.push(keyframes('handball', windows([
    ...tl.shots.map((s) => [s.release - tl.rise, s.release]),
    [tl.dunk.takeoff, tl.dunk.at],
  ], T, 1, 0), T));
  css.push(`.handball{animation:handball ${dur},ballfill ${dur}}.held{animation:ballfill ${dur}}`);

  // Scoreboard: running total, plus the last bucket's date and count.
  const steps = [[0, 0], ...tl.scores];
  const resetAt = tl.end + FADE * 0.5;
  steps.forEach(([t0, value], k) => {
    const t1 = k + 1 < steps.length ? steps[k + 1][0] : resetAt;
    const shown = k === 0 ? [[0, t1 - EPS], [resetAt, T]] : [[t0, t1 - EPS]];
    anim(`score${k}`, windows(shown, T));
    els.push(`<text class="score${k}" x="${W - 12}" y="22" text-anchor="end" font-size="18" font-weight="700" fill="${pal.strong}">${value.toLocaleString('en-US')}</text>`);
  });
  els.push(`<text x="${W - 12}" y="35" text-anchor="end" font-size="9" letter-spacing="1" fill="${pal.text}">PTS</text>`);
  tl.shots.forEach((s, k) => {
    const next = tl.shots[k + 1]?.swish ?? resetAt;
    anim(`last${k}`, windows([[s.swish, next - EPS]], T));
    els.push(`<text class="last${k}" x="${W - 12}" y="50" text-anchor="end" font-size="10" fill="${pal.accent}">${shortDate(s.day.date)} · ${s.count}</text>`);
  });

  // Reduced motion: freeze one second in, once the player has faded in and
  // the grid is still full, instead of playing the whole game.
  css.push('@media (prefers-reduced-motion:reduce){*{animation-play-state:paused!important;animation-delay:-1s!important}}');

  const n = tl.shots.length;
  els.push(`<text x="${GX}" y="${H - 3}" font-size="10" fill="${pal.text}">${calendar.totalContributions.toLocaleString('en-US')} contributions in the last year · one shot for every day with contributions · ${n} for ${n}</text>`);

  const who = user ? `${escapeXml(user)}'s contributions` : 'Contributions';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">` +
    `<title>${who}, played as a basketball shootaround: one made shot for every day with contributions</title>` +
    `<style>${css.join('')}</style>${els.join('')}</svg>`;
}
