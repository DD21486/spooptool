// The same win line the 2D arena shows beside a tournament countdown.
const ODDS_SCALE = 50;
const ODDS_CAP = 10000;
const TREND_KEY = 'spoop-odds-trend';
const TREND_MS = 60 * 60 * 1000;
const LINE_COLORS = ['#fde68a', '#4ade80', '#38bdf8', '#f472b6', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf', '#e879f9', '#93c5fd'];
const CHART = { w: 520, h: 176, l: 52, r: 10, t: 8, b: 22 };

function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function strength(row) {
  return Number(row.gear) + Math.max(0, Number(row.combat) - 1) * 1.5;
}

function american(p) {
  if (!(p > 0)) return '—';
  if (p >= 0.999) return '-100000';
  if (p >= 0.5) return '-' + Math.round((100 * p) / (1 - p));
  return '+' + Math.round((100 * (1 - p)) / p);
}

function americanNumber(p) {
  if (!(p > 0)) return 100000;
  if (p >= 0.999) return -100000;
  if (p >= 0.5) return -Math.round((100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function beat(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / ODDS_SCALE));
}

function series(p, bestOf) {
  if (bestOf !== 3) return p;
  return p * p * (3 - 2 * p);
}

function pow2(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function side(names) {
  let slots = names.map((name) => ({ name: name }));
  if (slots.length <= 1) return slots[0] || null;
  for (let guard = 0; slots.length > 1 && guard < 8; guard++) {
    const power = pow2(slots.length);
    const shrinking = slots.length === power;
    const pairMatches = shrinking ? slots.length / 2 : slots.length - power;
    const byeCount = shrinking ? 0 : power - pairMatches;
    const toCenter = pairMatches + byeCount === 1;
    const next = [];
    let cursor = 0;
    for (let i = 0; i < pairMatches; i++) {
      const match = { a: slots[cursor++], b: slots[cursor++], bestOf: 1 };
      if (toCenter) return match;
      next.push(match);
    }
    for (let i = 0; i < byeCount; i++) next.push(slots[cursor++]);
    slots = next;
  }
  return slots[0] || null;
}

function dist(node, score) {
  if (!node) return new Map();
  if (node.name) return new Map([[node.name, 1]]);
  const left = dist(node.a, score);
  const right = dist(node.b, score);
  const out = new Map();
  left.forEach((pa, a) => {
    right.forEach((pb, b) => {
      const win = series(beat(score.get(a) || 0, score.get(b) || 0), node.bestOf);
      out.set(a, (out.get(a) || 0) + pa * pb * win);
      out.set(b, (out.get(b) || 0) + pa * pb * (1 - win));
    });
  });
  return out;
}

export function priceNight(board) {
  const field = board.field || [];
  const score = new Map(field.map((row) => [row.name, strength(row)]));
  let probs;
  if (board.kind === 'ffa') {
    const weights = field.map((row) => Math.pow(10, strength(row) / ODDS_SCALE));
    const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
    probs = new Map(field.map((row, i) => [row.name, weights[i] / sum]));
  } else {
    const cast = Array.isArray(board.cast) && board.cast.length === field.length
      ? board.cast
      : field.map((row) => row.name);
    const mid = Math.ceil(cast.length / 2);
    probs = dist({ a: side(cast.slice(0, mid)), b: side(cast.slice(mid)), bestOf: 3 }, score);
  }
  return field.map((row) => ({
    name: row.name,
    gear: row.gear,
    hp: row.hp,
    atk: row.atk,
    str: row.str,
    def: row.def,
    rng: row.rng,
    mag: row.mag,
    pry: row.pry,
    p: probs.get(row.name) || 0,
  })).sort((a, b) => b.p - a.p || a.name.localeCompare(b.name));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '–';
}

function gear(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '–';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function readTrend(night) {
  const cutoff = Date.now() - TREND_MS;
  try {
    const saved = JSON.parse(localStorage.getItem(TREND_KEY) || 'null');
    if (!saved || saved.night !== night || !Array.isArray(saved.samples)) return [];
    return saved.samples.filter((row) => row && row.t >= cutoff && row.p);
  } catch (err) {
    return [];
  }
}

function noteTrend(night, rows) {
  const now = Date.now();
  const samples = readTrend(night);
  const last = samples[samples.length - 1];
  if (last && now - last.t < 20000) return samples;
  const probs = {};
  rows.forEach((row) => { probs[row.name] = Math.round(row.p * 10000) / 10000; });
  samples.push({ t: now, p: probs });
  const kept = samples.filter((row) => row.t >= now - TREND_MS).slice(-180);
  try { localStorage.setItem(TREND_KEY, JSON.stringify({ night, samples: kept })); } catch (err) { /* private mode */ }
  return kept;
}

function trendOf(name, samples, current) {
  if (!samples.length || !(current > 0)) return 'flat';
  const oldest = samples[0];
  if (!oldest || Date.now() - oldest.t < 5 * 60 * 1000) return 'flat';
  const then = oldest.p[name];
  if (!(then > 0)) return 'flat';
  const delta = current - then;
  if (Math.abs(delta) < 0.004) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function trendMark(kind) {
  if (kind === 'up') {
    return '<span class="trend trend-up" title="More likely over the last hour"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M1.5 11.5 6 7l3 2.5L14.5 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.5 3H14.5V8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg></span>';
  }
  if (kind === 'down') {
    return '<span class="trend trend-down" title="Less likely over the last hour"><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M1.5 4.5 6 9l3-2.5L14.5 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><path d="M9.5 13H14.5V8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg></span>';
  }
  return '<span class="trend trend-flat" title="Little change over the last hour">~</span>';
}

function etClock(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type) => {
    const part = parts.find((row) => row.type === type);
    return part ? part.value : '';
  };
  return { day: get('year') + '-' + get('month') + '-' + get('day'), hour: Number(get('hour')), minute: Number(get('minute')) };
}

function scoreFromAmerican(americanPrice) {
  const shown = Math.min(americanPrice, ODDS_CAP);
  if (shown >= 100) return Math.log(shown) / Math.LN10;
  return 2 - (100 - shown) / 500;
}

function hourWords(hour, minute) {
  const h = hour % 12 || 12;
  const suffix = hour >= 12 ? 'pm' : 'am';
  if (!minute) return h + suffix;
  return h + ':' + String(minute).padStart(2, '0') + suffix;
}

function chartBoard(row) {
  return {
    kind: row.kind,
    cast: row.cast,
    field: (row.field || []).map((spoop) => ({
      name: spoop.name, gear: spoop.gear, combat: spoop.combat,
      hp: 0, atk: 0, str: 0, def: 0, rng: 0, mag: 0, pry: 0,
    })),
  };
}

function daySeries(trail, night, priced) {
  const byName = new Map();
  function add(name, hour, minute, p) {
    if (!byName.has(name)) byName.set(name, []);
    const x = hour + minute / 60;
    const pts = byName.get(name);
    const prev = pts.find((pt) => Math.abs(pt.x - x) < 0.02);
    if (prev) {
      prev.p = p;
      prev.american = americanNumber(p);
      prev.minute = minute;
      return;
    }
    pts.push({ hour, minute, x, p, american: americanNumber(p) });
  }
  (trail || []).forEach((row) => {
    if (!row || !Array.isArray(row.field) || row.field.length < 2) return;
    priceNight(chartBoard(row)).forEach((spoop) => add(spoop.name, row.hour, 0, spoop.p));
  });
  const now = Date.now();
  const clock = etClock(now);
  const fight = night ? etClock(night) : null;
  if (fight && clock.day === fight.day && clock.hour >= 9 && clock.hour < 21) {
    priced.forEach((spoop) => add(spoop.name, clock.hour, clock.minute, spoop.p));
  }
  return Array.from(byName.keys()).sort((a, b) => a.localeCompare(b)).map((name, index) => ({
    name,
    color: LINE_COLORS[index % LINE_COLORS.length],
    pts: byName.get(name).sort((a, b) => a.x - b.x),
  }));
}

function chartScale(series) {
  const shown = [];
  let pinned = false;
  series.forEach((line) => {
    line.pts.forEach((pt) => {
      if (pt.american > ODDS_CAP) pinned = true;
      else shown.push(scoreFromAmerican(pt.american));
    });
  });
  let minS = shown.length ? Math.min.apply(null, shown) : scoreFromAmerican(200);
  let maxS = shown.length ? Math.max.apply(null, shown) : scoreFromAmerican(2000);
  if (maxS - minS < 0.18) {
    const mid = (minS + maxS) / 2;
    minS = mid - 0.12;
    maxS = mid + 0.12;
  }
  const pad = (maxS - minS) * 0.14;
  const gutter = pinned ? 16 : 0;
  return { minS: minS - pad, maxS: maxS + pad, pinned, plotBottom: CHART.h - CHART.b - gutter, gutterY: CHART.h - CHART.b - 6 };
}

function chartX(hour) {
  return CHART.l + ((hour - 9) / 12) * (CHART.w - CHART.l - CHART.r);
}

function chartY(price, scale) {
  if (price > ODDS_CAP) return scale.gutterY;
  const t = (scoreFromAmerican(price) - scale.minS) / (scale.maxS - scale.minS);
  return CHART.t + Math.max(0, Math.min(1, t)) * (scale.plotBottom - CHART.t);
}

function paintChart(chart, trail, night, priced) {
  const wrap = chart.parentElement;
  const series = daySeries(trail, night, priced);
  const clock = etClock(Date.now());
  const sig = clock.hour + ':' + clock.minute + '|' + series.map((line) => (
    line.name + ':' + line.pts.map((pt) => pt.x.toFixed(2) + '=' + pt.american).join(',')
  )).join(';');
  if (sig === chart.dataset.sig) return;
  chart.dataset.sig = sig;
  if (!series.length) {
    wrap.hidden = true;
    chart.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  const scale = chartScale(series);
  const ticks = [-500, -200, -110, 150, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000, 10000];
  const yTicks = [];
  ticks.forEach((price) => {
    if (price > ODDS_CAP) return;
    const y = chartY(price, scale);
    if (y < CHART.t + 2 || y > scale.plotBottom - 2) return;
    if (yTicks.some((tick) => Math.abs(tick.y - y) < 14)) return;
    yTicks.push({ y, label: price > 0 ? '+' + price : String(price) });
  });
  const xTicks = [9, 12, 15, 18, 21].map((hour) => ({
    x: chartX(hour),
    label: hourWords(hour, 0).replace('am', 'a').replace('pm', 'p'),
  }));
  const paths = series.map((line) => {
    const d = line.pts.map((pt, i) => (i ? 'L' : 'M') + chartX(pt.x).toFixed(1) + ' ' + chartY(pt.american, scale).toFixed(1)).join(' ');
    const dots = line.pts.map((pt) => '<circle cx="' + chartX(pt.x).toFixed(1) + '" cy="' + chartY(pt.american, scale).toFixed(1) + '" r="2.4" fill="' + line.color + '"/>').join('');
    return '<path d="' + d + '" fill="none" stroke="' + line.color + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' + dots;
  }).join('');
  const hoverCols = [];
  series.forEach((line) => {
    line.pts.forEach((pt) => {
      const key = pt.hour + ':' + pt.minute;
      let col = hoverCols.find((row) => row.key === key);
      if (!col) {
        col = { key, x: pt.x, label: hourWords(pt.hour, pt.minute), rows: [] };
        hoverCols.push(col);
      }
      col.rows.push({ name: line.name, color: line.color, price: american(pt.p), american: pt.american });
    });
  });
  hoverCols.sort((a, b) => a.x - b.x);
  const floor = scale.pinned
    ? '<line x1="' + CHART.l + '" y1="' + (scale.plotBottom + 1) + '" x2="' + (CHART.w - CHART.r) + '" y2="' + (scale.plotBottom + 1) + '" stroke="rgba(148,163,184,0.45)" stroke-dasharray="3 3"/>'
    : '';
  chart.innerHTML =
    '<svg viewBox="0 0 ' + CHART.w + ' ' + CHART.h + '" role="img" aria-label="Odds since 9am">' +
    yTicks.map((tick) => '<text x="' + (CHART.l - 6) + '" y="' + (tick.y + 3) + '" text-anchor="end" fill="#94a3b8" font-size="10">' + tick.label + '</text>').join('') +
    xTicks.map((tick) => '<text x="' + tick.x + '" y="' + (CHART.h - 6) + '" text-anchor="middle" fill="#94a3b8" font-size="10">' + tick.label + '</text>').join('') +
    floor + paths +
    '<rect class="odds-hover" x="' + CHART.l + '" y="' + CHART.t + '" width="' + (CHART.w - CHART.l - CHART.r) + '" height="' + (CHART.h - CHART.t - CHART.b) + '" fill="transparent"/></svg>' +
    '<div class="odds-tip" hidden></div>';
  const svg = chart.querySelector('svg');
  const tip = chart.querySelector('.odds-tip');
  const hover = chart.querySelector('.odds-hover');
  if (!svg || !tip || !hover || !hoverCols.length) return;
  hover.addEventListener('mousemove', (event) => {
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * CHART.w;
    let nearest = hoverCols[0];
    hoverCols.forEach((col) => {
      if (Math.abs(chartX(col.x) - px) < Math.abs(chartX(nearest.x) - px)) nearest = col;
    });
    nearest.rows.sort((a, b) => a.american - b.american);
    tip.innerHTML = '<strong>' + esc(nearest.label) + '</strong>' + nearest.rows.map((row) => (
      '<div class="tip-row"><span class="tip-name" style="color:' + row.color + '">' + esc(row.name) + '</span><span class="tip-price">' + row.price + '</span></div>'
    )).join('');
    tip.hidden = false;
    const pad = 8;
    const box = tip.getBoundingClientRect();
    let left = event.clientX + 14;
    let top = event.clientY - box.height - 12;
    if (left + box.width > window.innerWidth - pad) left = event.clientX - box.width - 14;
    if (top < pad) top = event.clientY + 16;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  });
  hover.addEventListener('mouseleave', () => { tip.hidden = true; });
}

export function paintOdds(root, board) {
  const list = root.querySelector('tbody');
  const chart = root.querySelector('.odds-chart');
  if (!board || board.kind !== 'tournament' || !Array.isArray(board.field) || board.field.length < 2) {
    root.hidden = true;
    if (list) list.innerHTML = '';
    if (chart) chart.dataset.sig = '';
    return;
  }
  const priced = priceNight(board);
  const night = board.night || '';
  const samples = noteTrend(night, priced);
  const html = priced.map((row) => (
    '<tr><td>' + esc(row.name) + '</td>' +
    '<td>' + gear(row.gear) + '</td><td>' + num(row.hp) + '</td><td>' + num(row.atk) + '</td>' +
    '<td>' + num(row.str) + '</td><td>' + num(row.def) + '</td><td>' + num(row.rng) + '</td>' +
    '<td>' + num(row.mag) + '</td><td>' + num(row.pry) + '</td>' +
    '<td class="odds-price">' + american(row.p) + '</td>' +
    '<td class="odds-trend">' + trendMark(trendOf(row.name, samples, row.p)) + '</td></tr>'
  )).join('');
  if (list && list.dataset.html !== html) {
    list.dataset.html = html;
    list.innerHTML = html;
  }
  if (chart) paintChart(chart, board.trail || [], Date.parse(night) || 0, priced);
  root.hidden = false;
}
