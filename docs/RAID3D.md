# 3D raid and spoop portraits

`/raid3d.html` plays a raid fight in 3D. The server runs the fight exactly as it does for
`/raid.html` (`action: 'raid-test'` on `/api/spoops`) and sends the same timeline: tracks, hits,
deaths, hazards, phases, rubble. The 3D page only draws it, so every frame is a function of fight
time. Pause, scrub and orbit to look at any moment.

`/spoop.html` uses the same character model for the hero portrait (`portrait.js`), turning slowly,
rebuilding with a sparkle when the spoop's gear changes. The 2D sprite stays as the fallback.

## Files (`public/js/raid3d/`)

| File | What it does |
| --- | --- |
| `main.js` | Loads a fight, plays the timeline, overlay (tags, hitsplats, raid frames, damage meter, log, boss bar), dodge retiming |
| `character.js` | OSRS-style spoop model: skeleton, gear builders per slot, attack poses, limp death and flying gear |
| `items.js` | The 3D look of every equippable item, keyed by OSRS item id (the icon the game shows) |
| `boss.js` | Bosses and minions as camera-facing sprite cards; size and mouth position per boss; form swaps |
| `fx.js` | Ground warnings, breath spray, lobs, shots, falling rocks, rubble, waves, smoke, projectiles |
| `world.js` | Scenes per boss (`BOSS_SCENE`): floor, terrain shape, props, light, fog, liquids, particles |
| `camera.js` | Cinematic shot planner and free orbit camera |
| `portrait.js` | 3D hero on the spoop page |

## Working on it locally (no database)

```
node scripts/raid3d-dev.js          # http://localhost:4791/raid3d.html
```

Serves `public/` and answers `/api/spoops` with the real fight engine on a made-up roster wearing
assorted named gear. Item icons 404 locally; everything else works.

In the browser console, `raid3d` exposes the scene: `raid3d.seek(12)`, `raid3d.pause()`,
`raid3d.look(x, y, z, tx, ty, tz)`, `raid3d.bout`, `raid3d.actors`, `raid3d.director`.

## Checks

```
node scripts/check-raid3d-items.mjs  # every item id the game can roll has a 3D look
```

Run it after adding gear to `lib/spoop/data.js` or `lib/spoop/item-ids.js`.

## Adding a boss

1. Size and mouth: `BOSS` in `boss.js`.
2. Scene: an entry in `THEMES` and `BOSS_SCENE` in `world.js`.
3. Its attacks: new tones in `TONES` (`fx.js`); new shot or breath attacks in `SHOTS` / `BREATH`.
4. The option in `raid3d.html` and its usual tier in `HOME_TIER` (`main.js`).
