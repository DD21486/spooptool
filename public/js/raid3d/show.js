// Live show clocks for the nightly tournament, the free-for-all, and a PK or duel.
// The waits match lib/spoop/engine.js so a viewer who joins late is on the same moment.

const PACE = 0.55;
const TOURNEY = {
  titleIn: 550, titleHold: 5000, titleOut: 700, entrance: 2000, bye: 900, hold: 15000,
  versus: 2900, intro: 2000, call: 720, win: 1800, advance: 2000,
  bestFlash: 1400, score: 3000, bracketHold: 3000, between: 4000, crown: 20000, ko: 3500,
};
const FIELD = { open: 6000, results: 14000 };
const DUEL = { versus: 2900, intro: 2000, slack: 1500 };

export function playbackMs(duration, speed) {
  const span = Number(duration);
  if (!(span > 0) || !(speed > 0)) return 0;
  return Math.round((span / (speed * PACE)) * 1000);
}

function blank(kind, title) {
  return { segs: [], total: 0, startAt: 0, raid: null, nodes: new Map(), map: { nodes: [], layers: 0, route: [], choices: [], byId: new Map() }, kind, title, clock: 0, playing: true, room: null, seg: null, view: {} };
}

function finish(show, last, showMs) {
  const tail = show.segs.filter((seg) => seg.kind === 'crown' || seg.kind === 'results').pop();
  const end = show.segs.reduce((sum, seg) => Math.max(sum, seg.end), 0);
  show.total = tail ? tail.start : end;
  const reveal = new Date(last.revealAt || 0).getTime();
  const span = Number(showMs) || Number(last.showMs) || end;
  show.startAt = Number.isFinite(reveal) && reveal > 0 ? reveal - span : Date.parse(last.at) || Date.now();
  return show;
}

export function planTournament(last) {
  const tourney = last.tournament || {};
  const cast = new Map((tourney.cast || []).map((row) => [row.id, row]));
  const show = blank('tournament', 'Tournament');
  let at = 0;
  let n = 0;
  const push = (kind, ms, extra) => {
    n += 1;
    show.segs.push(Object.assign({ kind, start: at, end: at + ms, key: kind + n }, extra));
    at += ms;
  };
  push('title', TOURNEY.titleIn + TOURNEY.titleHold + TOURNEY.titleOut);
  push('entrance', Math.max(1, (tourney.cast || []).length) * TOURNEY.entrance, { cast: tourney.cast || [], tourney });
  if ((tourney.byes || []).length) push('bye', TOURNEY.bye, { byes: tourney.byes, cast, tourney });
  push('bracket', TOURNEY.hold, { tourney, played: 0 });
  const matches = tourney.matches || [];
  matches.forEach((match, index) => {
    const games = match.games && match.games.length ? match.games : [{ bout: match.bout, winnerId: match.winnerId }];
    push('versus', TOURNEY.versus, { match, cast });
    if (match.bestOf) push('best', TOURNEY.bestFlash);
    games.forEach((game, gameIndex) => {
      if (gameIndex) push('score', TOURNEY.score, { match, cast, games: games.slice(0, gameIndex) });
      const bout = game.bout || match.bout;
      push('intro', TOURNEY.intro * 2 + TOURNEY.call, { match, cast, bout, gameIndex, games: games.length });
      push('fight', playbackMs(bout && bout.duration, 3) + TOURNEY.ko, { match, cast, bout, speed: 3, gameIndex, games: games.length });
    });
    push('win', TOURNEY.win, { match, cast });
    push('advance', TOURNEY.advance, { match, cast, tourney, matchIndex: index });
    if (index === matches.length - 1) {
      push('bracket', TOURNEY.bracketHold, { tourney, played: matches.length });
      push('crown', TOURNEY.crown, { tourney, cast, results: last.results || [], pot: last.pot });
    } else {
      // The winner has flown up. Leave the bracket up before the next duel.
      push('bracket', TOURNEY.between, { tourney, played: index + 1 });
    }
  });
  if (!matches.length) {
    push('bracket', TOURNEY.bracketHold, { tourney, played: 0 });
    push('crown', TOURNEY.crown, { tourney, cast, results: last.results || [], pot: last.pot });
  }
  return finish(show, last);
}

export function planField(last) {
  const bout = last.bout;
  const show = blank('spoopfight', 'Spoopfight');
  let at = 0;
  const push = (kind, ms, extra) => {
    show.segs.push(Object.assign({ kind, start: at, end: at + ms, key: kind }, extra));
    at += ms;
  };
  push('field', FIELD.open, { bout, formation: last.formation, results: last.results || [] });
  push('fight', playbackMs(bout && bout.duration, 1.5), { bout, speed: 1.5 });
  push('results', FIELD.results, { results: last.results || [], winner: last.winner, pot: last.pot, formation: last.formation });
  return finish(show, last, FIELD.open + playbackMs(bout && bout.duration, 1.5) + FIELD.results);
}

export function planPk(last) {
  const bout = last.bout;
  const staked = !!last.staked;
  const speed = staked ? 3 : 2;
  const show = blank(staked ? 'duel' : 'pk', staked ? 'Duel' : 'PK');
  let at = 0;
  const push = (kind, ms, extra) => {
    show.segs.push(Object.assign({ kind, start: at, end: at + ms, key: kind + at }, extra));
    at += ms;
  };
  if (staked) {
    push('versus', DUEL.versus, { a: last.aName, b: last.bName, stake: last.stake, pot: last.pot });
    push('intro', DUEL.intro, { bout, a: last.aName, b: last.bName });
  }
  push('fight', playbackMs(bout && bout.duration, speed), { bout, speed });
  push('results', staked ? DUEL.slack : 12000, { winner: last.winner, loser: last.loser, pot: last.pot, stake: last.stake, staked });
  const span = staked
    ? DUEL.versus + DUEL.intro + playbackMs(bout && bout.duration, speed) + DUEL.slack
    : playbackMs(bout && bout.duration, speed);
  return finish(show, last, span);
}

export function fieldShowMs(duration) {
  return FIELD.open + playbackMs(duration, 1.5) + FIELD.results;
}
