(function () {
  const TIER_COLORS = {
    bronze: '#c47a3a',
    iron: '#b8b8b8',
    steel: '#d5d8e0',
    black: '#4a4a4a',
    mithril: '#6a8ec8',
    adamant: '#3d9a55',
    rune: '#3aa0d8',
    dragon: '#d04532',
    barrows: '#7a4ea8',
    raid: '#e6c15a',
  };

  const QUALITY_RANK = {
    crude: 0, worn: 1, standard: 2, fine: 3, sharpened: 4, tempered: 5, masterwork: 6,
  };

  function spoopKey(spoop) {
    return (spoop && (spoop.owner || spoop.name)) || '';
  }

  function findSpoop(spoops, name) {
    const wanted = String(name || '').toLowerCase();
    return (spoops || []).find((spoop) =>
      String(spoop.name || '').toLowerCase() === wanted ||
      String(spoop.owner || '').toLowerCase() === wanted
    );
  }

  function hashName(name) {
    let h = 2166136261;
    const str = String(name || '');
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function gold(n) {
    return Number(n || 0).toLocaleString() + ' gold';
  }

  function shiftColor(hex, amt) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const ch = (v) => Math.max(0, Math.min(255, v));
    const r = ch((n >> 16) + amt);
    const g = ch(((n >> 8) & 255) + amt);
    const b = ch((n & 255) + amt);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function drawSpoop(canvas, spoop, opts) {
    if (!canvas) return;
    const layer = (opts && opts.layer) || 'all';
    const pose = (opts && opts.pose) || 'idle';
    const ox = (opts && opts.ox) || 0;
    const oy = (opts && opts.oy) || 0;
    const W = (opts && opts.width) || 16;
    const H = (opts && opts.height) || 24;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(new Array(W).fill(null));
    const put = (x, y, color) => {
      const px = x + ox;
      const py = y + oy;
      if (px >= 0 && py >= 0 && px < W && py < H && color) grid[py][px] = color;
    };
    const fill = (x, y, w, h, color) => {
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, color);
      }
    };

    const hash = hashName(spoop && spoop.name);
    const blonde = (hash & 1) === 0;
    const beard = (hash & 4) !== 0;
    const hair = blonde ? '#e6c34a' : '#6b4228';
    const hairHi = blonde ? '#f8e7a4' : '#8d5a34';
    const hairLo = blonde ? '#b08a32' : '#3e2616';
    const skin = '#f2c8a4';
    const skinDk = '#e0b08c';
    const eye = '#2f8f45';
    const pupil = '#14321c';

    const eq = (spoop && spoop.equipped) || {};
    const body = eq.body;
    const bodyQ = body ? (QUALITY_RANK[body.quality] || 0) : -1;
    const tierHex = body ? (TIER_COLORS[body.tier] || '#a56b3c') : null;
    const cloth = tierHex ? shiftColor(tierHex, bodyQ < 2 ? -32 : bodyQ >= 3 ? 18 : 0) : '#c48a52';
    const clothDk = tierHex ? shiftColor(tierHex, -52) : '#7a4e2c';

    const helm = eq.head;
    const helmQ = helm ? (QUALITY_RANK[helm.quality] || 0) : -1;
    const top = helm ? shiftColor(TIER_COLORS[helm.tier] || hair, helmQ >= 3 ? 14 : 0) : hair;
    const topHi = helm ? shiftColor(TIER_COLORS[helm.tier] || hair, 48) : hairHi;
    const topLo = helm ? shiftColor(TIER_COLORS[helm.tier] || hair, -42) : hairLo;

    if (layer !== 'weapon') {
    const cape = eq.cape;
    const capeQ = cape ? (QUALITY_RANK[cape.quality] || 0) : -1;
    const capeCol = cape ? shiftColor(TIER_COLORS[cape.tier] || '#3d5a8a', -58) : null;
    const capeDk = capeCol ? shiftColor(capeCol, -22) : null;
    if (capeCol) {
      // Behind the body, and only down to the ankles. Boots stay on the ground.
      const bottom = capeQ >= 4 ? 18 : 17;
      for (let y = 10; y <= bottom; y++) {
        for (let x = 5; x <= 10; x++) {
          put(x, y, x === 7 || x === 8 ? capeDk : capeCol);
        }
      }
    }

    const helmKind = helm ? (helm.baseId || 'med-helm') : null;
    const paintFace = () => {
      fill(4, 5, 8, 4, skin);
      put(5, 6, eye);
      put(6, 6, pupil);
      put(9, 6, pupil);
      put(10, 6, eye);
      put(7, 7, skinDk);
      put(8, 7, skinDk);
      put(6, 8, skinDk);
      put(9, 8, skinDk);
    };
    const paintDome = (col, hi, lo) => {
      fill(4, 1, 8, 2, col);
      fill(3, 3, 10, 2, col);
      fill(5, 1, 3, 1, hi);
      put(3, 4, lo);
      put(12, 4, lo);
    };
    const metalTrim = () => {
      if (helmQ >= 4) fill(5, 2, 6, 1, topHi);
      if (helmQ >= 6) {
        put(7, 1, '#f0d878');
        put(8, 1, '#fff6c8');
      }
    };
    const paintVisor = (col, lo) => {
      fill(4, 1, 8, 2, col);
      fill(3, 3, 10, 6, col);
      fill(5, 1, 3, 1, shiftColor(col, 36));
      put(3, 4, lo);
      put(12, 4, lo);
      put(3, 8, lo);
      put(12, 8, lo);
      fill(5, 6, 2, 1, '#141414');
      fill(9, 6, 2, 1, '#141414');
      put(7, 6, lo);
      put(8, 6, lo);
      put(6, 8, '#141414');
      put(7, 8, lo);
      put(8, 8, lo);
      put(9, 8, '#141414');
    };

    if (!helm) {
      paintDome(top, topHi, topLo);
      paintFace();
      if (beard) fill(6, 8, 4, 1, hairLo);
    } else if (helmKind === 'full-helm') {
      paintVisor(top, topLo);
      metalTrim();
    } else if (helmKind === 'wizard-hat' || helmKind === 'ancestral-hat') {
      const hat = helmKind === 'ancestral-hat' ? '#6a3aa0' : '#3a4e9a';
      const hatHi = helmKind === 'ancestral-hat' ? '#c89ae8' : '#7a92e0';
      const hatLo = helmKind === 'ancestral-hat' ? '#3a1860' : '#243268';
      put(7, 0, hatHi);
      put(8, 0, hat);
      fill(6, 1, 4, 1, hat);
      fill(5, 2, 6, 1, hat);
      fill(3, 3, 10, 1, hatLo);
      fill(4, 4, 8, 1, hat);
      if (helmKind === 'ancestral-hat') {
        put(7, 3, hatHi);
        put(8, 3, '#f3e6ff');
      }
      paintFace();
    } else if (helmKind === 'coif') {
      paintFace();
      fill(4, 1, 8, 2, '#6e4a2e');
      fill(5, 1, 3, 1, '#8d6340');
      fill(3, 3, 1, 7, '#6e4a2e');
      fill(12, 3, 1, 7, '#6e4a2e');
      fill(4, 3, 8, 1, '#3e2918');
      put(4, 4, '#6e4a2e');
      put(11, 4, '#6e4a2e');
      put(4, 8, '#3e2918');
      put(11, 8, '#3e2918');
    } else if (helmKind === 'spiny-helm') {
      paintDome(top, topHi, topLo);
      put(6, 0, topLo);
      put(8, 0, topHi);
      put(10, 0, topLo);
      put(4, 2, topHi);
      put(12, 2, topHi);
      paintFace();
      fill(4, 5, 8, 1, topLo);
    } else if (helmKind === 'black-mask') {
      paintDome('#2a2a2a', '#4a4a4a', '#111111');
      paintFace();
      fill(4, 4, 8, 3, '#1a1a1a');
      put(5, 6, '#9a3030');
      put(6, 6, '#2a1010');
      put(9, 6, '#2a1010');
      put(10, 6, '#9a3030');
      put(7, 7, '#3a3a3a');
      put(8, 7, '#3a3a3a');
    } else if (helmKind === 'slayer-helm') {
      fill(5, 0, 6, 1, '#6a7268');
      paintVisor('#3a4038', '#232820');
      fill(5, 6, 2, 1, '#d5dcc8');
      fill(9, 6, 2, 1, '#d5dcc8');
      fill(6, 8, 4, 1, '#1e221c');
      put(6, 8, '#8a9480');
      put(9, 8, '#8a9480');
    } else if (helmKind === 'initiate-sallet' || helmKind === 'proselyte-sallet') {
      const white = helmKind === 'proselyte-sallet' ? '#f7f4ea' : '#e4e0d4';
      paintDome(white, '#ffffff', '#b7b29f');
      if (helmKind === 'proselyte-sallet') {
        put(7, 2, '#e0b84a');
        put(8, 2, '#e0b84a');
      }
      paintFace();
      fill(4, 5, 8, 1, '#e0b84a');
    } else if (helmKind === 'berserker-helm') {
      const metal = '#9aa0a8';
      const metalLo = '#5c636c';
      const horn = '#e7e2d6';
      paintDome(metal, '#d5d8dc', metalLo);
      put(4, 0, horn);
      put(4, 1, horn);
      put(11, 0, horn);
      put(11, 1, horn);
      paintFace();
      put(7, 5, metalLo);
      put(8, 5, metalLo);
      put(7, 6, metal);
    } else if (helmKind === 'warrior-helm' || helmKind === 'neitiznot-helm' || helmKind === 'faceguard') {
      const metal = '#8a8175';
      const metalHi = '#c2b8a4';
      const metalLo = '#5a5348';
      const horn = '#efe6d4';
      paintDome(metal, metalHi, metalLo);
      if (helmKind === 'warrior-helm') {
        put(7, 0, metalHi);
        put(8, 0, metal);
      } else {
        put(3, 0, horn);
        put(2, 1, horn);
        put(4, 1, metalLo);
        put(12, 0, horn);
        put(13, 1, horn);
        put(11, 1, metalLo);
      }
      if (helmKind === 'faceguard') {
        paintVisor(metal, metalLo);
        put(3, 0, horn);
        put(2, 1, horn);
        put(12, 0, horn);
        put(13, 1, horn);
      } else {
        paintFace();
        put(7, 5, metalLo);
        put(8, 5, metalLo);
        put(7, 6, metal);
        if (helmKind === 'neitiznot-helm') {
          fill(3, 6, 1, 3, metal);
          fill(12, 6, 1, 3, metal);
        }
      }
    } else if (helmKind === 'archer-helm') {
      paintDome('#3f6b34', '#6ea05a', '#243f1e');
      paintFace();
      fill(3, 4, 10, 1, '#243f1e');
      put(7, 2, '#6ea05a');
    } else if (helmKind === 'farseer-helm') {
      paintDome('#3a3a68', '#7a7ab8', '#222244');
      put(7, 2, '#9fd4ff');
      put(8, 2, '#e8f7ff');
      paintFace();
      fill(4, 5, 8, 1, '#222244');
    } else if (helmKind === 'void-melee' || helmKind === 'void-ranger' || helmKind === 'void-mage') {
      const stripe = helmKind === 'void-ranger' ? '#3d8f45' : helmKind === 'void-mage' ? '#3a57b5' : '#8a8a90';
      paintDome('#d5d5d8', '#ffffff', '#8e9096');
      fill(4, 2, 8, 1, stripe);
      fill(4, 5, 8, 4, '#9aa0a8');
      fill(5, 6, 2, 1, '#1a1a1a');
      fill(9, 6, 2, 1, '#1a1a1a');
      put(7, 8, '#6a6e74');
      put(8, 8, '#6a6e74');
    } else if (helmKind === 'granite-helm') {
      fill(3, 1, 10, 3, '#b0b0b0');
      fill(4, 1, 4, 1, '#e4e4e4');
      fill(3, 4, 10, 1, '#6e6e6e');
      paintFace();
      fill(3, 5, 2, 3, '#b0b0b0');
      fill(11, 5, 2, 3, '#b0b0b0');
      fill(5, 5, 6, 1, '#8a8a8a');
    } else if (helmKind === 'obsidian-helm') {
      paintVisor('#2a2428', '#4a4048');
      fill(5, 6, 2, 1, '#e23b2f');
      fill(9, 6, 2, 1, '#e23b2f');
    } else if (helmKind === 'serpentine-helm') {
      paintVisor('#2f8a45', '#1a4a28');
      put(2, 4, '#1a4a28');
      put(13, 4, '#1a4a28');
      put(5, 1, '#7ed48a');
      put(5, 6, '#e6d25a');
      put(10, 6, '#e6d25a');
      put(6, 8, '#f4f0e0');
      put(9, 8, '#f4f0e0');
    } else if (helmKind === 'armadyl-helm') {
      paintDome('#c8ccd4', '#ffffff', '#7a808a');
      put(1, 3, '#e2c15a');
      put(2, 2, '#e2c15a');
      put(2, 4, '#a89040');
      put(14, 3, '#e2c15a');
      put(13, 2, '#e2c15a');
      put(13, 4, '#a89040');
      put(7, 2, '#e2c15a');
      put(8, 2, '#fff1b0');
      paintFace();
      fill(4, 5, 8, 1, '#e2c15a');
    } else if (helmKind === 'inquisitor-helm') {
      paintVisor('#b7b1a4', '#6e685c');
      put(7, 0, '#d7b45a');
      put(8, 0, '#d7b45a');
      put(7, 5, '#d7b45a');
      put(8, 5, '#d7b45a');
      put(7, 8, '#d7b45a');
      put(8, 8, '#d7b45a');
    } else if (helmKind === 'justiciar-helm') {
      paintVisor('#f7f4ee', '#c8c2b4');
      fill(4, 0, 8, 1, '#e0b84a');
      fill(5, 6, 6, 1, '#1a1a1a');
      put(7, 6, '#e0b84a');
      put(8, 6, '#e0b84a');
      fill(6, 8, 4, 1, '#e0b84a');
    } else if (helmKind === 'torva-helm') {
      paintVisor('#2c2c2c', '#5a2020');
      put(5, 0, '#9a3030');
      put(10, 0, '#9a3030');
      put(4, 1, '#9a3030');
      put(11, 1, '#9a3030');
      fill(5, 6, 2, 1, '#c04545');
      fill(9, 6, 2, 1, '#c04545');
      put(6, 8, '#9a3030');
      put(9, 8, '#9a3030');
    } else {
      paintDome(top, topHi, topLo);
      metalTrim();
      paintFace();
      fill(4, 5, 8, 1, topLo);
    }

    fill(6, 9, 4, 1, skin);
    if (capeCol) {
      put(4, 9, capeDk);
      put(5, 9, capeDk);
      put(10, 9, capeDk);
      put(11, 9, capeDk);
    }
    const neck = eq.neck;
    if (neck) {
      const gem = shiftColor(TIER_COLORS[neck.tier] || '#f0d878', 24);
      put(7, 9, gem);
      put(8, 9, shiftColor(gem, 40));
    }

    fill(4, 10, 8, 5, cloth);
    fill(6, 11, 4, 3, clothDk);
    if (!tierHex) {
      put(7, 11, skin);
      put(8, 11, skin);
    }
    const gloves = eq.gloves;
    const gloveQ = gloves ? (QUALITY_RANK[gloves.quality] || 0) : -1;
    const hand = gloves
      ? shiftColor(TIER_COLORS[gloves.tier] || '#8d5a34', gloveQ >= 3 ? 18 : -6)
      : skin;
    const handDk = gloves ? shiftColor(hand, -30) : skinDk;
    if (pose === 'idle') fill(2, 11, 2, 4, hand);
    fill(12, 11, 2, 4, hand);
    if (pose === 'idle') put(2, 14, clothDk);
    put(13, 14, handDk);
    const ring = eq.ring;
    if (ring) put(13, 13, shiftColor(TIER_COLORS[ring.tier] || '#f0d878', 28));
    const ammo = eq.ammo;
    if (ammo) {
      const shaft = shiftColor(TIER_COLORS[ammo.tier] || '#cbb98a', -8);
      put(3, 10, '#efe4c8');
      put(3, 11, shaft);
      put(3, 12, shaft);
      put(4, 12, shiftColor(shaft, 24));
    }

    if (bodyQ >= 4 && tierHex) {
      fill(2, 10, 2, 2, cloth);
      fill(12, 10, 2, 2, cloth);
      put(2, 10, clothDk);
      put(13, 10, clothDk);
    }
    if (bodyQ >= 5 && tierHex) fill(4, 10, 8, 1, '#f0d878');
    if (bodyQ >= 6 && tierHex) {
      put(7, 12, '#f0d878');
      put(8, 12, '#fff6c8');
    }
    if (bodyQ === 0 && tierHex) put(5, 13, '#3a2a1c');

    if (pose === 'windup') {
      put(3, 11, hand);
      put(2, 10, hand);
      put(1, 9, hand);
      put(1, 8, hand);
      put(0, 8, hand);
      put(0, 9, handDk);
    } else if (pose === 'strike') {
      put(3, 12, hand);
      put(4, 11, hand);
      put(5, 10, hand);
      put(6, 9, hand);
      put(7, 8, hand);
      put(8, 8, handDk);
    } else if (pose === 'draw') {
      put(1, 12, hand);
      put(1, 11, hand);
      put(2, 12, hand);
      put(3, 9, hand);
      put(4, 8, hand);
      put(4, 9, handDk);
    } else if (pose === 'cast') {
      put(3, 11, hand);
      put(2, 10, hand);
      put(1, 9, hand);
      put(1, 8, hand);
      put(2, 8, hand);
      put(2, 9, handDk);
    }

    const legs = eq.legs;
    const legQ = legs ? (QUALITY_RANK[legs.quality] || 0) : -1;
    const legCol = legs ? shiftColor(TIER_COLORS[legs.tier] || '#5c3a28', legQ >= 3 ? 8 : -12) : '#5c3824';
    fill(5, 15, 2, 4, legCol);
    fill(9, 15, 2, 4, legCol);
    if (legQ >= 5) {
      put(5, 15, '#f0d878');
      put(9, 15, '#f0d878');
    }

    const boots = eq.boots;
    const bootQ = boots ? (QUALITY_RANK[boots.quality] || 0) : -1;
    const bootCol = boots ? shiftColor(TIER_COLORS[boots.tier] || '#3d2914', bootQ >= 3 ? 10 : -16) : '#3a2618';
    fill(4, 18, 3, 2, bootCol);
    fill(9, 18, 3, 2, bootCol);
    if (bootQ >= 6) {
      put(4, 18, '#f0d878');
      put(11, 18, '#f0d878');
    }

    const shield = eq.shield;
    if (shield) {
      const sq = QUALITY_RANK[shield.quality] || 0;
      const face = shiftColor(TIER_COLORS[shield.tier] || '#9aa3ad', sq >= 3 ? 14 : 0);
      const hi = shiftColor(face, 48);
      const mid = shiftColor(face, -18);
      const rim = '#2c241c';
      const boss = sq >= 6 ? '#fff6c8' : sq >= 3 ? '#f0d878' : hi;
      const kite = [
        ' ### ',
        '#####',
        '#+++#',
        '#+*+#',
        '#+++#',
        ' ### ',
        '  #  ',
      ];
      const x0 = 10;
      const y0 = 10;
      kite.forEach((row, yy) => {
        for (let xx = 0; xx < row.length; xx++) {
          const ch = row[xx];
          if (ch === ' ') continue;
          const color = ch === '#' ? rim : ch === '*' ? boss : (xx === 2 ? mid : face);
          put(x0 + xx, y0 + yy, color);
        }
      });
      put(x0 + 1, y0 + 2, hi);
      if (sq >= 5) {
        put(x0 + 2, y0 + 1, '#e6c15a');
        put(x0 + 2, y0 + 5, '#e6c15a');
      }
    }
    }

    const weapon = eq.weapon;
    if (weapon && layer !== 'body') {
      const style = weapon.style || 'melee';
      const kind = weapon.baseId || (style === 'ranged' ? 'shortbow' : style === 'magic' ? 'staff' : 'sword');
      const wq = QUALITY_RANK[weapon.quality] || 0;
      const metal = TIER_COLORS[weapon.tier] || '#c0c0c0';
      const wc = metal;
      const colors = {
        grip: '#5c3a22',
        haft: '#6b4228',
        guard: shiftColor(wc, 30),
        blade: wc,
        edge: shiftColor(wc, 42),
        tip: wq >= 5 ? '#fff6c8' : shiftColor(wc, 56),
        string: '#efe4c8',
        wood: '#6b3e1f',
      };
      // Limb and string colors sampled from the shortbow icons in the item grid.
      const BOW_COLORS = {
        bronze: { limb: '#74500d', hi: '#946818', string: '#c6b15a', grip: '#3e2a0c' },
        iron: { limb: '#8b7111', hi: '#b09020', string: '#d4c06a', grip: '#4a380c' },
        steel: { limb: '#80782e', hi: '#a09848', string: '#d2c878', grip: '#3e3a16' },
        black: { limb: '#8a756e', hi: '#b09890', string: '#c8b89a', grip: '#4a3c36' },
        mithril: { limb: '#8b7911', hi: '#c4a040', string: '#e0cc70', grip: '#4a3c0c' },
        adamant: { limb: '#18645c', hi: '#2a9084', string: '#9ed4c8', grip: '#0c3834' },
        rune: { limb: '#155c55', hi: '#979566', string: '#c8c4a0', grip: '#0c3430' },
        dragon: { limb: '#241e16', hi: '#4d5609', string: '#a6ba15', grip: '#151111' },
        barrows: { limb: '#343422', hi: '#6c6464', string: '#8a8478', grip: '#18180d' },
        raid: { limb: '#241e16', hi: '#4d5609', string: '#a6ba15', grip: '#151111' },
      };
      if (kind === 'shortbow') {
        const bowCol = BOW_COLORS[weapon.tier] || BOW_COLORS.bronze;
        colors.wood = bowCol.limb;
        colors.edge = bowCol.hi;
        colors.grip = bowCol.grip;
        colors.string = bowCol.string;
        colors.haft = '#c4a56a';
        colors.tip = '#f2ecd4';
        colors.blade = '#e8e0c0';
      }
      if (kind === 'staff') {
        colors.haft = shiftColor(metal, -24);
        colors.tip = '#fff6c8';
        colors.edge = '#d7c4ff';
      }
      // lx is across the blade, ly runs from the grip toward the tip.
      const stamp = (ox, oy, dx, dy, marks) => {
        const mag = Math.hypot(dx, dy) || 1;
        const ux = dx / mag;
        const uy = dy / mag;
        const px = -uy;
        const py = ux;
        marks.forEach((mark) => {
          put(
            Math.round(ox + mark.lx * px + mark.ly * ux),
            Math.round(oy + mark.lx * py + mark.ly * uy),
            colors[mark.part] || colors.blade
          );
        });
      };
      const straight = (len, guardW, ridge) => {
        const marks = [{ lx: 0, ly: 0, part: 'grip' }];
        for (let lx = -guardW; lx <= guardW; lx++) marks.push({ lx, ly: 1, part: 'guard' });
        for (let ly = 2; ly < len; ly++) {
          marks.push({ lx: 0, ly, part: 'blade' });
          if (ridge && ly > 2 && ly < len - 1) marks.push({ lx: 1, ly, part: 'edge' });
        }
        marks.push({ lx: 0, ly: len, part: 'tip' });
        return marks;
      };
      const curved = (len) => {
        const marks = [
          { lx: 0, ly: 0, part: 'grip' },
          { lx: -1, ly: 1, part: 'guard' },
          { lx: 0, ly: 1, part: 'guard' },
          { lx: 1, ly: 1, part: 'guard' },
        ];
        for (let ly = 2; ly <= len; ly++) {
          const t = (ly - 2) / Math.max(1, len - 2);
          const curve = t < 0.4 ? 0 : t < 0.72 ? -1 : -2;
          const tip = ly === len;
          marks.push({ lx: curve + 1, ly, part: tip ? 'edge' : 'blade' });
          marks.push({ lx: curve, ly, part: tip ? 'tip' : 'edge' });
        }
        return marks;
      };
      const mace = (len) => {
        const shaft = Math.max(3, len - 3);
        const marks = [];
        for (let ly = 0; ly <= shaft; ly++) marks.push({ lx: 0, ly, part: ly === 0 ? 'grip' : 'haft' });
        const head = shaft + 1;
        [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2]].forEach((pair) => {
          marks.push({ lx: pair[0], ly: head + pair[1], part: pair[1] === 2 ? 'tip' : 'blade' });
        });
        return marks;
      };
      const bow = (drawn) => {
        const marks = [];
        for (let ly = 1; ly <= 8; ly++) marks.push({ lx: 0, ly, part: 'wood' });
        marks.push({ lx: 1, ly: 2, part: 'edge' });
        marks.push({ lx: 1, ly: 7, part: 'edge' });
        marks.push({ lx: 0, ly: 4, part: 'grip' });
        marks.push({ lx: 0, ly: 5, part: 'grip' });
        const stringX = drawn ? 3 : 1;
        for (let ly = 3; ly <= 6; ly++) marks.push({ lx: stringX, ly, part: 'string' });
        if (drawn) {
          marks.push({ lx: 4, ly: 4, part: 'haft' });
          marks.push({ lx: 5, ly: 4, part: 'haft' });
          marks.push({ lx: 6, ly: 4, part: 'tip' });
          marks.push({ lx: 6, ly: 3, part: 'edge' });
        }
        return marks;
      };
      const staff = (len) => {
        const marks = straight(len, 0, false).map((mark) => (
          mark.part === 'guard' ? { lx: mark.lx, ly: mark.ly, part: 'haft' } : mark
        ));
        marks.push({ lx: -1, ly: len, part: 'tip' });
        marks.push({ lx: 1, ly: len, part: 'tip' });
        marks.push({ lx: -1, ly: len + 1, part: 'edge' });
        marks.push({ lx: 0, ly: len + 1, part: 'tip' });
        marks.push({ lx: 1, ly: len + 1, part: 'edge' });
        marks.push({ lx: 0, ly: len + 2, part: 'tip' });
        return marks;
      };
      let held;
      if (kind === 'dagger') held = { marks: straight(4 + Math.floor(wq / 2), 1, false) };
      else if (kind === 'longsword') held = { marks: straight(8 + wq, 2, true) };
      else if (kind === 'scimitar') held = { marks: curved(7 + wq) };
      else if (kind === 'mace') held = { marks: mace(6 + Math.floor(wq / 2)) };
      else if (kind === 'shortbow') held = { marks: bow(pose === 'draw'), ox: 0, oy: 17 };
      else if (kind === 'staff') held = { marks: staff(6 + wq) };
      else held = { marks: straight(6 + wq, 1, true) };
      let ox = 2;
      let oy = 14;
      let dx = 0;
      let dy = -1;
      if (kind === 'shortbow') {
        ox = 1;
        oy = 17;
      } else if (kind === 'scimitar' && pose !== 'windup' && pose !== 'strike') {
        ox = 3;
      } else if (kind === 'staff' && pose === 'cast') {
        ox = 2;
        oy = 13;
        dx = -0.45;
        dy = -1;
      } else if (pose === 'windup') {
        ox = 2;
        oy = 11;
        dx = -0.72;
        dy = -1;
      } else if (pose === 'strike') {
        ox = 6;
        oy = 12;
        dx = 1.05;
        dy = -0.78;
      }
      if (held.ox != null) ox = held.ox;
      if (held.oy != null) oy = held.oy;
      stamp(ox, oy, dx, dy, held.marks);
      if (kind === 'staff' && pose === 'cast') {
        const mag = Math.hypot(dx, dy) || 1;
        const tipLy = 8 + wq;
        put(Math.round(ox + tipLy * dx / mag) + 1, Math.round(oy + tipLy * dy / mag) - 1, '#ffffff');
      }
    }

    if (opts && opts.clear) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = '#c4a574';
      ctx.fillRect(0, 0, W, H);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!grid[y][x]) continue;
        ctx.fillStyle = grid[y][x];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.payload = data;
      throw err;
    }
    return data;
  }

  function itemLine(item) {
    if (!item) return '<span class="text-slate-600">Empty</span>';
    return '<span class="text-slate-100">' + escapeHtml(item.name) + '</span>';
  }

  let lastState = null;

  function mountDebug(state) {
    let panel = document.getElementById('spoop-debug');
    if (!state.debug) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'spoop-debug';
      panel.className = 'fixed bottom-4 right-4 z-40 w-72 rounded-lg border border-amber-700/60 bg-slate-900/95 shadow-xl p-3 text-xs';
      document.body.appendChild(panel);
    }
    const next = state.nextEvent ? state.nextEvent.label : 'No event';
    const happened = (state.happened || []).slice(-6);
    panel.innerHTML =
      '<div class="flex items-center justify-between gap-2 mb-2">' +
        '<span class="font-semibold text-amber-300">Debug clock</span>' +
        '<span class="text-slate-400">' + (state.useSim ? 'Simulated' : 'Real') + '</span>' +
      '</div>' +
      '<p class="text-slate-200 mb-2">' + escapeHtml(state.clockLabel) + '</p>' +
      '<p class="text-slate-500 mb-2">Next: ' + escapeHtml(next) + '</p>' +
      '<div class="flex flex-wrap gap-1 mb-2">' +
        '<button type="button" data-debug="next" class="px-2 py-1 rounded bg-amber-500 text-slate-900 font-semibold">Next event</button>' +
        '<button type="button" data-debug="day" class="px-2 py-1 rounded bg-slate-700 text-slate-100">+1 day</button>' +
        '<button type="button" data-debug="week" class="px-2 py-1 rounded bg-slate-700 text-slate-100">+7 days</button>' +
        '<button type="button" data-debug="month" class="px-2 py-1 rounded bg-slate-700 text-slate-100">+30 days</button>' +
      '</div>' +
      '<div class="flex flex-wrap gap-1">' +
        '<button type="button" data-debug="real" class="px-2 py-1 rounded bg-slate-800 text-slate-300">Use real clock</button>' +
        '<button type="button" data-debug="reset" class="px-2 py-1 rounded bg-slate-800 text-rose-300">Reset spoop</button>' +
      '</div>' +
      (happened.length
        ? '<ul class="mt-2 space-y-1 text-slate-400 max-h-28 overflow-auto">' + happened.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ul>'
        : '');
    panel.querySelectorAll('[data-debug]').forEach((btn) => {
      btn.addEventListener('click', () => onDebug(btn.getAttribute('data-debug')));
    });
  }

  async function onDebug(op) {
    try {
      let body;
      if (op === 'next') body = { action: 'debug', op: 'next' };
      else if (op === 'day') body = { action: 'debug', op: 'days', days: 1 };
      else if (op === 'week') body = { action: 'debug', op: 'days', days: 7 };
      else if (op === 'month') body = { action: 'debug', op: 'days', days: 30 };
      else if (op === 'real') body = { action: 'debug', op: 'real' };
      else if (op === 'reset') {
        if (!window.confirm('Reset SpoopSpooply back to a new spoop?')) return;
        body = { action: 'debug', op: 'reset' };
      }
      const data = await api('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      render(data);
    } catch (err) {
      window.alert(err.message);
    }
  }

  function wornIcons(spoop) {
    const slots = ['head', 'cape', 'neck', 'ammo', 'weapon', 'body', 'shield', 'legs', 'gloves', 'boots', 'ring'];
    return slots.map((slot) => {
      const item = spoop.equipped && spoop.equipped[slot];
      if (!item || !item.osrsId) return '';
      return '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" title="' + escapeHtml(item.name) + '">';
    }).join('');
  }

  // gielinor-map.png: tile (1120, 4096) is the top-left, 0.25 px per tile, 704×391.
  const GIELINOR = { x0: 1120, yTop: 4096, scale: 0.25, w: 704, h: 391 };

  function mapPercent(x, y) {
    const gx = Number(x);
    const gy = Number(y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return { left: 62, top: 56 };
    return {
      left: ((gx - GIELINOR.x0) * GIELINOR.scale) / GIELINOR.w * 100,
      top: ((GIELINOR.yTop - gy) * GIELINOR.scale) / GIELINOR.h * 100,
    };
  }

  function renderMap(spoops) {
    const groups = {};
    spoops.forEach((spoop) => {
      const id = (spoop.activity && spoop.activity.id) || '';
      if (!groups[id]) groups[id] = [];
      groups[id].push(spoop);
    });
    const pins = spoops.map((spoop) => {
      const act = spoop.activity || {};
      const pt = mapPercent(act.x, act.y);
      const mates = groups[act.id] || [spoop];
      const index = Math.max(0, mates.indexOf(spoop));
      let left = pt.left;
      let top = pt.top;
      if (mates.length > 1) {
        const angle = (index / mates.length) * Math.PI * 2 - Math.PI / 2;
        left += Math.cos(angle) * 2.4;
        top += Math.sin(angle) * 1.8;
      }
      left = Math.max(4, Math.min(96, left));
      top = Math.max(5, Math.min(94, top));
      const style = ['melee', 'ranged', 'magic', 'skilling', 'quest'].includes(act.style) ? act.style : 'melee';
      const low = top < 12 ? ' is-low' : '';
      return '<a class="spoop-pin' + low + '" data-spoop="' + escapeHtml(spoopKey(spoop)) + '" href="/spoop.html?name=' + encodeURIComponent(spoopKey(spoop)) + '" style="left:' + left.toFixed(2) + '%;top:' + top.toFixed(2) + '%">' +
        '<span class="spoop-pin-tip">' +
          '<span class="spoop-pin-name">' + escapeHtml(spoop.name) + '</span>' +
          '<span class="spoop-pin-act">' + escapeHtml(act.name || '') + '</span>' +
        '</span>' +
        '<span class="spoop-pin-orb spoop-pin-' + style + '"></span>' +
      '</a>';
    }).join('');
    return '<section class="gielinor-wrap">' +
      '<p class="gielinor-kicker">On Gielinor</p>' +
      '<div class="gielinor">' +
        '<div class="gielinor-stage">' +
          '<img class="gielinor-map" src="/assets/gielinor-map-2x.png" alt="Map of Gielinor" width="1408" height="782">' +
          '<div class="gielinor-tiles" aria-hidden="true"></div>' +
          pins +
        '</div>' +
        '<div class="gielinor-zoom" role="group" aria-label="Map zoom">' +
          '<button type="button" data-zoom="in" aria-label="Zoom in">+</button>' +
          '<button type="button" data-zoom="out" aria-label="Zoom out">−</button>' +
          '<button type="button" data-zoom="reset" aria-label="Reset map">↺</button>' +
        '</div>' +
      '</div>' +
      '<p class="gielinor-credit">Scroll or pinch to zoom. Drag to look around. Map tiles from the <a href="https://maps.runescape.wiki/osrs/" target="_blank" rel="noreferrer">Old School RuneScape Wiki</a>. Game map by Jagex.</p>' +
    '</section>';
  }

  function mountMapZoom(root) {
    const view = root.querySelector('.gielinor');
    const stage = root.querySelector('.gielinor-stage');
    if (!view || !stage) return;
    let scale = 1;
    let x = 0;
    let y = 0;
    let drag = null;
    const pointers = new Map();

    function clamp() {
      const vw = view.clientWidth;
      const vh = view.clientHeight;
      const sw = stage.offsetWidth * scale;
      const sh = stage.offsetHeight * scale;
      x = Math.min(0, Math.max(Math.min(0, vw - sw), x));
      y = Math.min(0, Math.max(Math.min(0, vh - sh), y));
    }

    const tiles = stage.querySelector('.gielinor-tiles');
    // Wiki surface tiles are 256px. A higher zoom covers fewer squares, so each one is sharper.
    // File index * span is the south-west corner.
    const TILE_LEVELS = [
      { z: 0, span: 256, until: 1.8 },
      { z: 1, span: 128, until: 3.4 },
      { z: 2, span: 64, until: 6.2 },
      { z: 3, span: 32, until: Infinity },
    ];
    const TILE_ROOT = 'https://maps.runescape.wiki/osrs/tiles/0_2019-10-31_1/';
    const worldW = GIELINOR.w / GIELINOR.scale;
    const worldH = GIELINOR.h / GIELINOR.scale;

    function tileLevel() {
      return TILE_LEVELS.find((level) => scale < level.until) || TILE_LEVELS[TILE_LEVELS.length - 1];
    }

    function revealTile(img, tile) {
      try {
        const ctx = tile.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, tile.width, tile.height);
        const image = ctx.getImageData(0, 0, tile.width, tile.height);
        const data = image.data;
        let visible = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 4 && data[i + 1] < 4 && data[i + 2] < 4) data[i + 3] = 0;
          else visible += 1;
        }
        if (visible < 32) return false;
        ctx.putImageData(image, 0, 0);
        return true;
      } catch (err) {
        return false;
      }
    }

    function syncTiles() {
      if (!tiles) return;
      const level = tileLevel();
      const stageW = stage.offsetWidth;
      const stageH = stage.offsetHeight;
      stage.classList.toggle('is-detail', !!(stageW && stageH));
      if (!stageW || !stageH) return;
      const viewW = view.clientWidth / scale;
      const viewH = view.clientHeight / scale;
      const left = -x / scale;
      const top = -y / scale;
      const gameX0 = GIELINOR.x0 + (left / stageW) * worldW;
      const gameX1 = GIELINOR.x0 + ((left + viewW) / stageW) * worldW;
      const gameY1 = GIELINOR.yTop - (top / stageH) * worldH;
      const gameY0 = GIELINOR.yTop - ((top + viewH) / stageH) * worldH;
      const tx0 = Math.floor(gameX0 / level.span) - 1;
      const tx1 = Math.floor(gameX1 / level.span) + 1;
      const ty0 = Math.floor(gameY0 / level.span) - 1;
      const ty1 = Math.floor(gameY1 / level.span) + 1;
      const want = new Set();
      for (let tx = tx0; tx <= tx1; tx += 1) {
        for (let ty = ty0; ty <= ty1; ty += 1) {
          if (tx < 0 || ty < 0) continue;
          want.add(level.z + '_' + tx + '_' + ty);
        }
      }
      tiles.querySelectorAll('.gielinor-tile').forEach((img) => {
        if (!want.has(img.dataset.tile)) img.remove();
      });
      want.forEach((key) => {
        if (tiles.querySelector('[data-tile="' + key + '"]')) return;
        const parts = key.split('_');
        const tx = Number(parts[1]);
        const ty = Number(parts[2]);
        const tile = document.createElement('canvas');
        tile.className = 'gielinor-tile';
        tile.dataset.tile = key;
        tile.width = 256;
        tile.height = 256;
        const leftPct = ((tx * level.span - GIELINOR.x0) / worldW) * 100;
        const topPct = ((GIELINOR.yTop - (ty + 1) * level.span) / worldH) * 100;
        tile.style.left = leftPct + '%';
        tile.style.top = topPct + '%';
        tile.style.width = 'calc(' + ((level.span / worldW) * 100) + '% + 1px)';
        tile.style.height = 'calc(' + ((level.span / worldH) * 100) + '% + 1px)';
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.addEventListener('load', () => {
          if (!tile.isConnected) return;
          if (revealTile(img, tile)) tile.classList.add('is-in');
          else tile.remove();
        });
        img.addEventListener('error', () => tile.remove());
        img.src = TILE_ROOT + level.z + '/0_' + tx + '_' + ty + '.png';
        tiles.appendChild(tile);
      });
    }

    function apply() {
      stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      // Dots shrink past the map scale so the tile stays visible. Labels shrink less so the names stay readable.
      // The last step to full zoom grows both a little, and only then.
      const full = Math.min(1, Math.max(0, (scale - 7) / (8 - 7)));
      const boost = 1 + 0.22 * full;
      stage.style.setProperty('--pin-scale', (boost / Math.pow(scale, 1.35)).toFixed(4));
      stage.style.setProperty('--label-scale', Math.pow(scale, 0.22).toFixed(4));
      syncTiles();
    }

    function reveal(pin) {
      if (!pin || scale <= 1.05) return;
      const viewRect = view.getBoundingClientRect();
      const pinRect = pin.getBoundingClientRect();
      const pad = 36;
      const outside = pinRect.left < viewRect.left + pad || pinRect.right > viewRect.right - pad ||
        pinRect.top < viewRect.top + pad || pinRect.bottom > viewRect.bottom - pad;
      if (!outside) return;
      x += (viewRect.left + viewRect.width / 2) - (pinRect.left + pinRect.width / 2);
      y += (viewRect.top + viewRect.height / 2) - (pinRect.top + pinRect.height / 2);
      clamp();
      apply();
    }

    function zoomAt(clientX, clientY, next) {
      const rect = view.getBoundingClientRect();
      const ox = clientX - rect.left;
      const oy = clientY - rect.top;
      const clamped = Math.min(8, Math.max(1, next));
      const k = clamped / scale;
      x = ox - (ox - x) * k;
      y = oy - (oy - y) * k;
      scale = clamped;
      if (scale === 1) {
        x = 0;
        y = 0;
      }
      clamp();
      apply();
    }

    view.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(ev.clientX, ev.clientY, scale * factor);
    }, { passive: false });

    view.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.gielinor-zoom')) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 1) {
        drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false, originX: x, originY: y };
        view.classList.add('is-drag');
      }
      view.setPointerCapture(ev.pointerId);
    });

    view.addEventListener('pointermove', (ev) => {
      const prev = pointers.get(ev.pointerId);
      if (!prev) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size >= 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (!view._pinchDist) view._pinchDist = dist;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        zoomAt(midX, midY, scale * (dist / view._pinchDist));
        view._pinchDist = dist;
        if (drag) drag.moved = true;
        return;
      }
      if (!drag || drag.id !== ev.pointerId || scale === 1) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 4 || Math.hypot(x - drag.originX, y - drag.originY) > 4) {
        drag.moved = true;
      }
      x += dx;
      y += dy;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      clamp();
      apply();
    });

    function endPointer(ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) view._pinchDist = 0;
      if (drag && drag.id === ev.pointerId) {
        view.classList.remove('is-drag');
        if (drag.moved) {
          const block = (clickEv) => {
            clickEv.preventDefault();
            clickEv.stopPropagation();
            view.removeEventListener('click', block, true);
          };
          view.addEventListener('click', block, true);
        }
        drag = null;
      }
    }
    view.addEventListener('pointerup', endPointer);
    view.addEventListener('pointercancel', endPointer);

    view.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.gielinor-zoom') || ev.target.closest('.spoop-pin')) return;
      zoomAt(ev.clientX, ev.clientY, scale < 4 ? scale * 2 : 1);
    });

    view.querySelectorAll('[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const rect = view.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const op = btn.getAttribute('data-zoom');
        if (op === 'in') zoomAt(cx, cy, scale * 1.4);
        else if (op === 'out') zoomAt(cx, cy, scale / 1.4);
        else zoomAt(cx, cy, 1);
      });
    });

    apply();
    const baseMap = stage.querySelector('.gielinor-map');
    if (baseMap && !baseMap.complete) baseMap.addEventListener('load', syncTiles);

    return { reveal };
  }

  function bindSpoopHover(root, map) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    root.querySelectorAll('.spoop-card, .spoop-pin, .spoop-feed-item').forEach((el) => {
      const key = el.getAttribute('data-spoop');
      if (!key) return;
      const mates = () => Array.from(root.querySelectorAll('[data-spoop]')).filter((other) => other.getAttribute('data-spoop') === key);
      el.addEventListener('pointerenter', () => {
        mates().forEach((other) => other.classList.add('is-hot'));
        if (map && !el.classList.contains('spoop-pin')) {
          const pin = mates().find((other) => other.classList.contains('spoop-pin'));
          if (pin) map.reveal(pin);
        }
      });
      el.addEventListener('pointerleave', () => {
        mates().forEach((other) => other.classList.remove('is-hot'));
      });
      el.addEventListener('focus', () => mates().forEach((other) => other.classList.add('is-hot')));
      el.addEventListener('blur', () => mates().forEach((other) => other.classList.remove('is-hot')));
    });
  }

  function nextActionPhrase(kind) {
    if (kind === 'arena') return 'Arena';
    if (kind === 'drop') return 'Activity and loot';
    return 'Next activity';
  }

  function formatRemain(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  }

  function nextActionHtml(spoop, state, detail) {
    const next = spoop && spoop.nextAction;
    if (!next || !next.at) return '';
    const cls = detail ? 'spoop-next mt-3 text-sm text-slate-300' : 'spoop-next';
    return '<p class="' + cls + '" data-next-at="' + escapeHtml(next.at) + '" data-next-kind="' + escapeHtml(next.kind || 'tick') + '" data-next-time="' + escapeHtml(next.time || '') + '" data-next-line="' + escapeHtml(next.line || '') + '"' +
      (detail ? ' data-next-detail="1"' : '') +
      (state && state.useSim ? ' data-sim="1" data-sim-clock="' + escapeHtml(state.clock || '') + '"' : '') +
      '></p>';
  }

  function nextActionText(el) {
    const line = el.getAttribute('data-next-line') || '';
    const what = line || nextActionPhrase(el.getAttribute('data-next-kind'));
    const time = el.getAttribute('data-next-time') || '';
    const at = Date.parse(el.getAttribute('data-next-at') || '');
    if (!line && time) {
      if (el.getAttribute('data-sim') === '1') return what + ' at ' + time + ' ET';
    }
    if (!Number.isFinite(at)) return what;
    if (el.getAttribute('data-sim') === '1') return what;
    const ms = at - Date.now();
    if (ms <= 0) return what;
    return what + ' · in ' + formatRemain(ms);
  }

  let nextTimer = null;
  let nextRefreshAt = 0;

  function paintNextActions() {
    let due = false;
    document.querySelectorAll('[data-next-at]').forEach((el) => {
      const at = Date.parse(el.getAttribute('data-next-at') || '');
      const time = el.getAttribute('data-next-time');
      el.textContent = nextActionText(el);
      if (time) el.title = time + ' ET';
      if (el.getAttribute('data-sim') !== '1' && Number.isFinite(at) && at <= Date.now()) due = true;
    });
    if (!due || document.querySelector('.roll-overlay') || Date.now() < nextRefreshAt) return;
    nextRefreshAt = Date.now() + 15000;
    boot();
  }

  function startNextTimers() {
    paintNextActions();
    if (nextTimer) return;
    nextTimer = window.setInterval(paintNextActions, 1000);
  }

  function feedLine(text) {
    const parts = String(text || '').split(' — ');
    const time = parts.length > 1 ? parts[0] : '';
    let body = parts.length > 1 ? parts.slice(1).join(' — ') : String(text || '');
    const xp = [];
    body = body.replace(/\+([\d,]+) ([A-Za-z]+) XP/g, (match, amount, skill) => {
      xp.push('+' + amount + ' ' + skill + ' XP');
      return ' ';
    });
    body = body.replace(/\s*[A-Z][A-Za-z']*(?: [A-Za-z']+)* is now level \d+\.?/g, ' ');
    body = body.replace(/\s*[+\-][\d,]+ gold\.?/g, ' ');
    body = body.replace(/\s*Staked [\d,]+ gold, took [\d,]+ from the pot\.?/gi, ' ');
    body = body.replace(/\s*Skilling paid [\d,]+ extra\.?/gi, ' ');
    body = body.replace(/(?:\s*\.){2,}/g, '.').replace(/\s{2,}/g, ' ').trim();
    body = body.replace(/^\.\s*/, '').replace(/\s+\./g, '.').replace(/\.\s*$/, '.');
    if (body && !/[.!?]$/.test(body)) body += '.';
    return { time, body, xp };
  }

  const FEED_SKILL_ICON = {
    attack: '/assets/Attack_icon.png',
    strength: '/assets/Strength_icon.png',
    defence: '/assets/Defence_icon.png',
    hitpoints: '/assets/Hitpoints_icon.png',
    ranged: '/assets/Ranged_icon.png',
    magic: '/assets/Magic_icon.png',
    prayer: '/assets/Prayer_icon.png',
    agility: '/assets/Agility_icon.png',
    construction: '/assets/Construction_icon.png',
    cooking: '/assets/Cooking_icon.png',
    crafting: '/assets/Crafting_icon.png',
    farming: '/assets/Farming_icon.png',
    firemaking: '/assets/Firemaking_icon.png',
    fishing: '/assets/Fishing_icon.png',
    fletching: '/assets/Fletching_icon.png',
    herblore: '/assets/Herblore_icon.png',
    hunter: '/assets/Hunter_icon.png',
    mining: '/assets/Mining_icon.png',
    runecraft: '/assets/Runecraft_icon.png',
    sailing: '/assets/Sailing_icon.png',
    slayer: '/assets/Slayer_icon.png',
    smithing: '/assets/Smithing_icon.png',
    thieving: '/assets/Thieving_icon.png',
    woodcutting: '/assets/Woodcutting_icon.png',
  };

  const FEED_MARK = {
    quest: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 3.5h9.2L19 7.2V20.5H6z"/><path fill="#1a1030" d="M15 3.8V8h4.1"/><path fill="none" stroke="#1a1030" stroke-width="1.2" d="M8.5 12h7M8.5 15h5"/></svg>',
    'quest-done': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 3.5h9.2L19 7.2V20.5H6z"/><path fill="#2a2208" d="M15 3.8V8h4.1"/><path fill="none" stroke="#2a2208" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M8.4 13.2l2.3 2.3 4.8-5"/></svg>',
    loot: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9h16v10.5H4z"/><path fill="currentColor" d="M3 7.2h18v2.4H3z"/><path fill="#102018" d="M11 9h2v10.5h-2z"/></svg>',
    pet: '<svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="2.1" fill="currentColor"/><circle cx="12" cy="6.2" r="2.1" fill="currentColor"/><circle cx="17" cy="8" r="2.1" fill="currentColor"/><ellipse cx="12" cy="15.2" rx="5.2" ry="4" fill="currentColor"/></svg>',
  };

  function feedKind(body, xp) {
    const text = body || '';
    if (/^found /i.test(text) || /rare drop/i.test(text)) return { kind: 'loot', label: 'Found gear' };
    if (/followed them home/i.test(text)) return { kind: 'pet', label: 'Pet' };
    if (/\bpk\b/i.test(text) || /^challenged /i.test(text)) return { kind: 'pk', label: 'PK' };
    if (/^spoopfight/i.test(text) || /^fought /i.test(text)) return { kind: 'arena', label: 'Arena' };
    if (/^died\b/i.test(text)) return { kind: 'death', label: 'Died' };
    if (/^killed /i.test(text)) return { kind: 'boss', label: 'Boss kill' };
    if (/^finished /i.test(text) || / and finished it/i.test(text)) return { kind: 'quest-done', label: 'Finished a quest' };
    if (/^started /i.test(text) || /^still on /i.test(text)) return { kind: 'quest', label: 'On a quest' };
    const skill = xp.length ? xp[0].replace(/^\+[\d,]+\s+/, '').replace(/ XP$/, '').toLowerCase() : '';
    if (/^(kept at|wandered off to) /i.test(text) || skill) return { kind: 'train', label: skill ? 'Training ' + skill : 'Training', skill: skill };
    return { kind: 'activity', label: 'Activity' };
  }

  function feedMark(kind) {
    const title = escapeHtml(kind.label);
    if (kind.kind === 'train') {
      const src = FEED_SKILL_ICON[kind.skill] || '/assets/Skills_icon.png';
      return '<img class="spoop-feed-icon" src="' + src + '" alt="" title="' + title + '">';
    }
    if (kind.kind === 'pk') return '<img class="spoop-feed-icon" src="/assets/Skull_(status)_icon.png" alt="" title="' + title + '">';
    if (kind.kind === 'death') return '<img class="spoop-feed-icon" src="/assets/Hitpoints_icon.png" alt="" title="' + title + '">';
    if (kind.kind === 'arena' || kind.kind === 'boss') return '<img class="spoop-feed-icon" src="/assets/Combat_icon.png" alt="" title="' + title + '">';
    if (kind.kind === 'activity') return '<img class="spoop-feed-icon" src="/assets/Skills_icon.png" alt="" title="' + title + '">';
    return '<span class="spoop-feed-mark is-' + kind.kind + '" title="' + title + '">' + (FEED_MARK[kind.kind] || '') + '</span>';
  }

  function renderFeed(spoops) {
    const rows = [];
    spoops.forEach((spoop) => {
      (spoop.log || []).forEach((row) => {
        const line = feedLine(row.text);
        if (!line.body && !line.xp.length) return;
        const kind = feedKind(line.body, line.xp);
        rows.push({
          at: Date.parse(row.at) || 0,
          time: line.time,
          body: line.body,
          xp: line.xp,
          name: spoop.name,
          key: spoopKey(spoop),
          kind: kind,
        });
      });
    });
    rows.sort((a, b) => b.at - a.at);
    const items = rows.slice(0, 80).map((row) => {
      const xp = row.xp.length ? '<p class="spoop-feed-xp">' + row.xp.map(escapeHtml).join(' · ') + '</p>' : '';
      const body = row.body ? '<p class="spoop-feed-do">' + escapeHtml(row.body) + '</p>' : '';
      const find = row.kind.kind === 'loot' ? ' is-find' : '';
      return '<li><a class="spoop-feed-item is-' + row.kind.kind + find + '" data-spoop="' + escapeHtml(row.key) + '" href="/spoop.html?name=' + encodeURIComponent(row.key) + '">' +
        feedMark(row.kind) +
        '<span class="spoop-feed-copy">' +
          '<span class="spoop-feed-who"><span>' + escapeHtml(row.name) + '</span><time>' + escapeHtml(row.time) + '</time></span>' +
          body + xp +
        '</span>' +
      '</a></li>';
    }).join('');
    return '<aside class="spoop-feed" aria-label="Activity">' +
      '<h2>Activity</h2>' +
      (items ? '<ol class="spoop-feed-list">' + items + '</ol>' : '<p class="spoop-log-empty">Nothing recorded yet.</p>') +
    '</aside>';
  }

  function renderList(state) {
    const root = document.getElementById('spoop-root');
    const spoops = state.spoops || [];
    const cards = spoops.map((spoop) => {
      const owner = spoop.owner && spoop.owner !== spoop.name
        ? '<p class="spoop-owner">' + escapeHtml(spoop.owner) + '</p>'
        : '';
      return (
        '<a href="/spoop.html?name=' + encodeURIComponent(spoopKey(spoop)) + '" class="spoop-card" data-spoop="' + escapeHtml(spoopKey(spoop)) + '">' +
          '<canvas class="spoop-sprite" width="16" height="24" data-spoop="' + escapeHtml(spoopKey(spoop)) + '"></canvas>' +
          '<h2>' + escapeHtml(spoop.name) + '</h2>' +
          owner +
          '<dl class="spoop-stats">' +
            '<div><dt>Combat</dt><dd>' + spoop.combat + '</dd></div>' +
            '<div><dt title="Average of the 11 worn slots. Empty counts as 0. A full set of crude bronze is 1.">Gear</dt><dd>' + (spoop.gearRating || 0) + '</dd></div>' +
            '<div><dt>Gold</dt><dd>' + Number(spoop.gold || 0).toLocaleString() + '</dd></div>' +
            '<div><dt>Arena</dt><dd>' + spoop.arenaWins + '–' + spoop.arenaLosses + '</dd></div>' +
          '</dl>' +
          '<p class="spoop-act">' + escapeHtml(spoop.activity.name) + '</p>' +
          (spoop.follower
            ? '<p class="spoop-next">Followed by ' + escapeHtml(spoop.follower.name) + '</p>'
            : '') +
          (spoop.gearGate && spoop.gearGate.idle
            ? '<p class="spoop-next">' + escapeHtml(spoop.gearGate.place) + ' · ' + spoop.gearGate.hoursLeft + 'h of ' + escapeHtml(spoop.gearGate.lootName) + ' drops</p>'
            : '') +
          nextActionHtml(spoop, state) +
        '</a>'
      );
    }).join('');
    const pk = state.pk;
    const pkBanner = pk
      ? '<a class="spoop-pk" href="/arena.html">PK · ' + escapeHtml(pk.a) + ' vs ' + escapeHtml(pk.b) + ' · ' + escapeHtml(pk.reason) + '</a>'
      : '';
    const board = cards ? '<div class="spoop-grid">' + cards + '</div>' : '<p class="spoop-log-empty">No spoops yet.</p>';
    root.innerHTML = '<div class="spoop-main">' + pkBanner + renderMap(spoops) + board + '</div>' + renderFeed(spoops);
    const map = mountMapZoom(root);
    bindSpoopHover(root, map);
    paint(state);
  }

  function questStatus(activity) {
    if (activity && activity.errand) return 'Errand';
    if (activity && activity.boss) return 'Boss';
    if (activity && activity.clue) {
      const left = activity.hoursLeft || 0;
      const total = activity.hours || 1;
      if (left > 0 && left === total - 1) return 'Started this hour.';
      if (left > 1) return 'Still on it. ' + left + ' hours left.';
      if (left === 1) return 'Still on it. One hour left.';
      if (total <= 1) return 'Started and finished this hour.';
      return 'Finished this hour.';
    }
    if (!activity || !activity.quest) {
      const skill = activity && activity.skill ? activity.skill : '';
      return activity && activity.idle ? 'Idle ground · training ' + skill : 'Training ' + skill;
    }
    const left = activity.hoursLeft || 0;
    const total = activity.hours || 1;
    if (left > 0 && left === total - 1) return 'Started this hour.';
    if (left > 1) return 'Still on it. ' + left + ' hours left.';
    if (left === 1) return 'Still on it. One hour left.';
    if (total <= 1) return 'Started and finished this hour.';
    return 'Finished this hour.';
  }

  function activityLog(spoop) {
    const rows = (spoop.log || []).slice(0, 20);
    const schedule = spoop.nextAction && spoop.nextAction.line
      ? '<li class="is-next"><time>Next</time><p>' + escapeHtml(spoop.nextAction.line) + '</p></li>'
      : '';
    if (!rows.length && !schedule) return '<p class="spoop-log-empty">Nothing recorded yet.</p>';
    return '<ol class="spoop-log-list">' + schedule + rows.map((row) => {
      const text = String(row.text || '');
      const parts = text.split(' — ');
      const time = parts.length > 1 ? parts[0] : '';
      const body = parts.length > 1 ? parts.slice(1).join(' — ') : text;
      return '<li><time>' + escapeHtml(time) + '</time><p>' + escapeHtml(body) + '</p></li>';
    }).join('') + '</ol>';
  }

  function bar(pct) {
    const w = Math.max(0, Math.min(100, Math.round((Number(pct) || 0) * 100)));
    return '<div class="spoop-bar flex-1"><span style="width:' + w + '%"></span></div>';
  }

  function itemIcon(item) {
    if (!item || !item.osrsId) return '';
    return '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" width="36" height="36" loading="lazy">';
  }

  const SKILL_ICON = {
    attack: '/assets/Attack_icon.png',
    strength: '/assets/Strength_icon.png',
    defence: '/assets/Defence_icon.png',
    hitpoints: '/assets/Hitpoints_icon.png',
    ranged: '/assets/Ranged_icon.png',
    magic: '/assets/Magic_icon.png',
    prayer: '/assets/Prayer_icon.png',
  };

  const SLOT_LABEL = {
    weapon: 'Weapon', shield: 'Shield', head: 'Head', body: 'Body', legs: 'Legs',
    boots: 'Boots', gloves: 'Hands', cape: 'Cape', neck: 'Neck', ring: 'Ring', ammo: 'Ammo',
  };

  const EQUIP_GRID = [
    [null, 'head', null],
    ['cape', 'neck', 'ammo'],
    ['weapon', 'body', 'shield'],
    [null, 'legs', null],
    ['gloves', 'boots', 'ring'],
  ];

  const QUALITY_COLOR = {
    crude: '#9d9d9d',
    worn: '#ffffff',
    standard: '#1eff00',
    fine: '#0070dd',
    sharpened: '#a335ee',
    tempered: '#ff8000',
    masterwork: '#e6cc80',
  };

  function bonusRows(stats, suffixFor) {
    const labels = { stab: 'Stab', slash: 'Slash', crush: 'Crush', magic: 'Magic', range: 'Range', melee: 'Melee str', ranged: 'Ranged str', prayer: 'Prayer' };
    return Object.keys(stats).map((key) => {
      const n = Number(stats[key]) || 0;
      if (!n) return '';
      const tone = n > 0 ? 'text-emerald-400' : 'text-rose-400';
      const suffix = suffixFor && suffixFor[key] ? suffixFor[key] : '';
      const label = key === 'magic' && suffix ? 'Magic dmg' : labels[key];
      return '<div class="flex justify-between gap-3"><span>' + label + '</span><span class="tabular-nums ' + tone + '">' + (n > 0 ? '+' : '') + n + suffix + '</span></div>';
    }).join('');
  }

  function itemTip(item, spoop) {
    const bonuses = item.bonuses || { attack: {}, defence: {}, other: {} };
    const attack = bonusRows(bonuses.attack || {});
    const defence = bonusRows(bonuses.defence || {});
    const other = bonusRows(bonuses.other || {}, { magic: '%' });
    const block = (title, rows) => rows
      ? '<p class="text-[10px] uppercase tracking-wide text-slate-500 mt-1.5">' + title + '</p>' + rows
      : '';
    const req = item.requirement;
    let reqHtml = '';
    if (req) {
      const skill = (spoop.skills || []).find((s) => s.id === req.skill);
      const met = skill && skill.level >= req.level;
      reqHtml = '<p class="mt-1.5 ' + (met ? 'text-slate-400' : 'text-rose-300') + '">Requires ' + req.level + ' ' + escapeHtml(req.skillName) + '</p>';
    }
    const rating = item.rating != null
      ? '<p class="text-[10px] uppercase tracking-wide text-slate-500">Rating ' + item.rating + '</p>'
      : '';
    const value = item.value != null
      ? '<p class="text-amber-200 tabular-nums">' + Number(item.value).toLocaleString() + ' gold</p>'
      : '';
    return '<div class="spoop-tip" role="tooltip">' +
      '<p class="text-xs" style="color:' + (QUALITY_COLOR[item.quality] || '#fde68a') + '">' + escapeHtml(item.name) + '</p>' +
      value +
      rating +
      reqHtml +
      block('Attack', attack) +
      block('Defence', defence) +
      block('Other', other) +
    '</div>';
  }

  function slotFrame(item, inner, spoop, sell) {
    const color = item && QUALITY_COLOR[item.quality];
    const style = color ? ' style="border-color:' + color + '"' : '';
    let tip = item ? itemTip(item, spoop) : '';
    if (sell && item) {
      tip = tip.replace(/<\/div>$/, '<p class="mt-1.5 text-slate-400">Click to sell</p></div>');
    }
    const rate = item && item.rating != null ? '<span class="spoop-rate">' + item.rating + '</span>' : '';
    const sellAttr = sell && item
      ? ' data-sell="' + item.id + '" data-name="' + escapeHtml(item.name) + '" data-value="' + Number(item.value || 0) + '" role="button" aria-label="Sell ' + escapeHtml(item.name) + ' for ' + Number(item.value || 0).toLocaleString() + ' gold"'
      : '';
    return '<div class="spoop-slot"' + sellAttr + style + ' tabindex="0">' + inner + rate + tip + '</div>';
  }

  function gearCell(slot, item, spoop) {
    if (!slot) return '<div></div>';
    const label = SLOT_LABEL[slot] || slot;
    const inner = item && item.osrsId
      ? itemIcon(item)
      : '<span class="text-[9px] uppercase tracking-wide text-slate-600 text-center leading-tight px-1">' + escapeHtml(label) + '</span>';
    return slotFrame(item, inner, spoop);
  }

  function bossGrid(spoop) {
    const bosses = spoop.bosses || [];
    if (!bosses.length) return '';
    const total = bosses.reduce((sum, boss) => sum + (Number(boss.kc) || 0), 0);
    const cells = bosses.map((boss) => {
      const kc = Number(boss.kc) || 0;
      const title = boss.name + ' — ' + kc.toLocaleString() + (kc === 1 ? ' kill' : ' kills');
      const count = kc ? '<span class="boss-kc-count">' + kc.toLocaleString() + '</span>' : '';
      return '<span class="boss-kc' + (kc ? '' : ' is-zero') + '" title="' + escapeHtml(title) + '">' +
        '<img src="' + escapeHtml(boss.icon) + '" alt="' + escapeHtml(boss.name) + '" width="40" height="40">' +
        count +
      '</span>';
    }).join('');
    return '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
      '<div class="flex items-baseline justify-between gap-3 mb-2">' +
        '<h3 class="text-sm text-slate-300">Bosses</h3>' +
        '<p class="text-xs text-slate-500 tabular-nums">' + total.toLocaleString() + ' kills</p>' +
      '</div>' +
      '<div class="boss-kc-grid">' + cells + '</div>' +
    '</section>';
  }

  function renderDetail(state) {
    const root = document.getElementById('spoop-root');
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name') || 'SpoopSpooply';
    const spoop = findSpoop(state.spoops, name);
    if (!spoop) {
      root.innerHTML = '<p class="text-slate-400">No spoop named ' + escapeHtml(name) + '.</p>';
      return;
    }
    const quests = spoop.quests || { points: 0, done: 0, total: 0 };
    const focus = (spoop.activity && spoop.activity.skills) || [spoop.activity.skill];
    const skills = spoop.skills.map((s) => {
      const training = focus.indexOf(s.id) >= 0;
      return '<div class="flex items-center gap-2 py-1' + (training ? ' text-amber-200' : '') + '">' +
        '<img src="' + SKILL_ICON[s.id] + '" alt="" width="16" height="16" class="shrink-0">' +
        '<span class="w-16 text-sm">' + escapeHtml(s.name) + '</span>' +
        '<span class="w-8 text-right text-slate-100 tabular-nums">' + s.level + '</span>' +
        bar(s.progress) +
      '</div>';
    }).join('');
    const statsHtml = renderCombatStats(spoop.combatStats);
    const gate = spoop.gearGate || { progress: 0, nextName: null, nextCombat: null };
    const gateLabel = gate.idle
      ? gate.place + ' · ' + gate.lootName + ' drops · ' + gate.hoursLeft + (gate.hoursLeft === 1 ? ' hour left' : ' hours left')
      : gate.nextName
        ? 'Next gear at ' + gate.nextCombat + ' (' + gate.nextName + ')'
        : 'Top gear tier';
    const goal = spoop.goldGoal || { progress: 0, name: 'Bronze crate', cost: 100 };
    const grid = EQUIP_GRID.map((row) => row.map((slot) => gearCell(slot, slot ? spoop.equipped[slot] : null, spoop)).join('')).join('');
    const bankSlots = state.bankSlots || 48;
    const bankCells = [];
    for (let i = 0; i < bankSlots; i++) {
      const item = spoop.bank[i];
      bankCells.push(item
        ? slotFrame(item, itemIcon(item), spoop, true)
        : '<div class="spoop-slot"></div>');
    }
    const bank = '<div class="flex flex-wrap gap-1">' + bankCells.join('') + '</div>';
    const log = activityLog(spoop);
    const fight = spoop.fights[0];
    const fightHtml = fight
      ? '<p class="text-sm ' + (fight.won ? 'text-emerald-300' : 'text-rose-300') + '">' + escapeHtml(fight.summary) + '</p>' +
        '<ol class="mt-2 text-xs text-slate-400 space-y-0.5">' + fight.lines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('') + '</ol>'
      : '<p class="text-slate-600 text-sm">No arena fight yet. Fights resolve at 9:00pm ET.</p>';
    const crates = (state.crates || []).map((crate) => {
      const afford = spoop.gold >= crate.cost;
      const tint = TIER_COLORS[crate.tier] || '#94a3b8';
      return '<button type="button" data-crate="' + escapeHtml(crate.id) + '" class="crate-btn text-left rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2' + (afford ? '' : ' opacity-45') + '" style="border-left:3px solid ' + tint + '">' +
        '<span class="block text-sm text-slate-100">' + escapeHtml(crate.name) + '</span>' +
        '<span class="block text-xs text-amber-200/90">' + priceLabel(crate.cost) + ' gold</span>' +
      '</button>';
    }).join('');

    root.innerHTML =
      '<a href="/spoops.html" class="text-xs text-sky-400 hover:text-sky-300">All spoops</a>' +
      '<div class="mt-3 flex flex-wrap items-end gap-4">' +
        '<canvas id="spoop-hero" class="spoop-sprite" width="16" height="24"></canvas>' +
        '<div>' +
          '<h1 class="text-2xl text-slate-100">' + escapeHtml(spoop.name) + '</h1>' +
          (spoop.owner && spoop.owner !== spoop.name ? '<p class="text-xs text-slate-500">' + escapeHtml(spoop.owner) + '</p>' : '') +
          '<p class="text-slate-400 text-sm">' + gold(spoop.gold) + ' · Arena ' + spoop.arenaWins + 'W ' + spoop.arenaLosses + 'L</p>' +
          (spoop.follower
            ? '<p class="text-sm text-amber-200 mt-1 flex items-center gap-2">' +
              (spoop.follower.osrsId
                ? '<img src="/api/spoops?icon=1&id=' + Number(spoop.follower.osrsId) + '" alt="" width="24" height="24">'
                : '') +
              '<span>Followed by ' + escapeHtml(spoop.follower.name) +
              (spoop.follower.owned > 1 ? ' · ' + spoop.follower.owned + ' pets' : '') + '</span></p>'
            : '') +
          (state.pk && (state.pk.a === spoop.name || state.pk.b === spoop.name)
            ? '<p class="text-sm mt-1"><a class="text-rose-300 hover:text-rose-200" href="/arena.html">PK vs ' + escapeHtml(state.pk.a === spoop.name ? state.pk.b : state.pk.a) + '</a></p>'
            : '') +
        '</div>' +
        '<section class="ml-auto max-w-md text-right">' +
          '<p class="text-xs uppercase tracking-wide text-slate-500">Right now</p>' +
          '<h2 class="text-xl text-amber-200 mt-1">' + escapeHtml(spoop.activity.name) + '</h2>' +
          '<p class="text-slate-300 mt-1">' + escapeHtml(spoop.activity.detail) + '</p>' +
          '<p class="text-xs text-slate-500 mt-2">' + escapeHtml(questStatus(spoop.activity)) + '</p>' +
          (spoop.activity.money ? '<p class="text-xs text-amber-200/80 mt-1">Slow training. The gold is the point.</p>' : '') +
          nextActionHtml(spoop, state, true) +
        '</section>' +
      '</div>' +
      '<div class="mt-6 grid gap-4 md:grid-cols-2">' +
        '<section class="rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
          '<div class="flex items-baseline justify-between gap-3 mb-2">' +
            '<h3 class="text-sm text-slate-300">Skills</h3>' +
            '<p class="text-sm text-slate-100 tabular-nums">Combat ' + spoop.combat + ' · Gear ' + (spoop.gearRating || 0) + ' · ' + quests.points + ' QP</p>' +
          '</div>' +
          '<div class="flex items-center gap-2 mb-3">' + bar(gate.progress) + '</div>' +
          '<p class="text-[11px] text-slate-500 mb-2">' + escapeHtml(gateLabel) + ' · ' + quests.done + '/' + quests.total + ' quests</p>' +
          skills +
          statsHtml +
        '</section>' +
        '<section class="rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
          '<div class="flex items-baseline justify-between gap-3 mb-3">' +
            '<h3 class="text-sm text-slate-300">Wearing</h3>' +
            '<p class="text-sm text-amber-200 tabular-nums" title="Average of the 11 worn slots. Empty counts as 0. A full set of crude bronze is 1. Each quality step adds 1, and each metal adds 10.">Gear ' + (spoop.gearRating || 0) + '</p>' +
          '</div>' +
          '<div class="spoop-grid">' + grid + '</div>' +
        '</section>' +
      '</div>' +
      bossGrid(spoop) +
      '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<h3 class="text-sm text-slate-300 mb-2">Crates</h3>' +
        '<div class="flex items-center gap-2 mb-1">' + bar(goal.progress) + '</div>' +
        '<p class="text-[11px] text-slate-500 mb-3">' + spoop.gold.toLocaleString() + ' gold · saving for ' + escapeHtml(goal.name) + ' (' + priceLabel(goal.cost) + ')</p>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">' + crates + '</div>' +
      '</section>' +
      '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<h3 class="text-sm text-slate-300 mb-2">Last arena</h3>' + fightHtml +
      '</section>' +
      '<section class="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<div class="flex items-baseline justify-between gap-3 mb-2">' +
          '<h3 class="text-sm text-slate-300">Bank</h3>' +
          '<p class="text-xs text-slate-500 tabular-nums">' + Math.min(spoop.bank.length, bankSlots) + '/' + bankSlots + ' · click an item to sell it</p>' +
        '</div>' +
        bank +
      '</section>' +
      '<section class="spoop-log mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">' +
        '<h3>Activity</h3>' +
        log +
      '</section>';

    drawSpoop(document.getElementById('spoop-hero'), spoop);
    root.querySelectorAll('[data-crate]').forEach((btn) => {
      const crateId = btn.getAttribute('data-crate');
      btn.addEventListener('click', () => buyCrate(spoopKey(spoop), crateId, spoop.gold));
      btn.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        const crate = (state.crates || []).find((row) => row.id === crateId);
        if (crate) openCrateMenu(ev, crate);
      });
    });
    root.querySelectorAll('[data-sell]').forEach((slot) => {
      const sell = () => sellBankPiece(
        spoopKey(spoop),
        slot.getAttribute('data-sell'),
        slot.getAttribute('data-name'),
        slot.getAttribute('data-value')
      );
      slot.addEventListener('click', sell);
      slot.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        sell();
      });
    });
  }

  let selling = false;

  function askConfirm(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'roll-overlay';
      const yes = opts.yes
        ? '<button type="button" data-yes class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm font-medium text-slate-950">' + escapeHtml(opts.yes) + '</button>'
        : '';
      overlay.innerHTML =
        '<div class="roll-modal sell-ask" role="dialog" aria-modal="true" aria-labelledby="ask-title">' +
          '<h2 id="ask-title" class="text-lg text-slate-100">' + escapeHtml(opts.title) + '</h2>' +
          '<p class="mt-2 text-sm text-slate-300">' + opts.detail + '</p>' +
          '<div class="mt-4 flex justify-end gap-2">' +
            '<button type="button" data-cancel class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm">' + (opts.yes ? 'Cancel' : 'Close') + '</button>' +
            yes +
          '</div>' +
        '</div>';
      let done = false;
      const finish = (accepted) => {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(!!accepted);
      };
      const onKey = (ev) => {
        if (ev.key === 'Escape') finish(false);
        if (ev.key === 'Enter' && opts.yes) {
          ev.preventDefault();
          finish(true);
        }
      };
      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay || ev.target.closest('[data-cancel]')) finish(false);
        else if (opts.yes && ev.target.closest('[data-yes]')) finish(true);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      const focus = overlay.querySelector(opts.yes ? '[data-yes]' : '[data-cancel]');
      if (focus) focus.focus();
    });
  }

  function confirmSale(itemName, price) {
    const gold = Number(price || 0).toLocaleString();
    return askConfirm({
      title: 'Sell ' + itemName + '?',
      detail: 'This pays <span class="text-amber-200 tabular-nums">' + gold + ' gold</span>.',
      yes: 'Sell',
    });
  }

  let crateMenu = null;

  function closeCrateMenu() {
    if (!crateMenu) return;
    crateMenu.remove();
    crateMenu = null;
    document.removeEventListener('mousedown', onCrateMenuAway, true);
    document.removeEventListener('keydown', onCrateMenuKey);
  }

  function onCrateMenuAway(ev) {
    if (crateMenu && crateMenu.contains(ev.target)) return;
    closeCrateMenu();
  }

  function onCrateMenuKey(ev) {
    if (ev.key === 'Escape') closeCrateMenu();
  }

  function openCrateMenu(ev, crate) {
    closeCrateMenu();
    const menu = document.createElement('div');
    menu.className = 'spoop-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<button type="button" role="menuitem" data-view>View contents</button>';
    menu.style.left = ev.clientX + 'px';
    menu.style.top = ev.clientY + 'px';
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) menu.style.left = Math.max(8, window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight - 8) menu.style.top = Math.max(8, window.innerHeight - rect.height - 8) + 'px';
    menu.querySelector('[data-view]').addEventListener('click', () => {
      closeCrateMenu();
      showCrateLoot(crate);
    });
    crateMenu = menu;
    document.addEventListener('mousedown', onCrateMenuAway, true);
    document.addEventListener('keydown', onCrateMenuKey);
    menu.querySelector('[data-view]').focus();
  }

  function showCrateLoot(crate) {
    const loot = crate.loot || { groups: [], quality: '' };
    const groups = (loot.groups || []).map((group) => {
      const cards = (group.items || []).map((item) => {
        const icon = item.osrsId
          ? '<img src="/api/spoops?icon=1&id=' + Number(item.osrsId) + '" alt="" width="32" height="32">'
          : '';
        const rare = item.rare ? '<span class="rare">Rare</span>' : '';
        return '<div class="loot-card">' + icon + '<span>' + escapeHtml(item.name) + '</span>' + rare + '</div>';
      }).join('');
      return '<h3 class="text-sm text-slate-300 mt-4 mb-2">' + escapeHtml(group.label) + '</h3><div class="loot-grid">' + cards + '</div>';
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'roll-overlay';
    overlay.innerHTML =
      '<div class="roll-modal loot-sheet" role="dialog" aria-modal="true" aria-labelledby="loot-title">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div>' +
            '<h2 id="loot-title" class="text-lg text-slate-100">' + escapeHtml(crate.name) + '</h2>' +
            '<p class="mt-1 text-xs text-slate-400">' + escapeHtml(loot.quality || 'One piece from this list.') + '</p>' +
          '</div>' +
          '<button type="button" data-cancel class="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200" aria-label="Close">✕</button>' +
        '</div>' +
        (groups || '<p class="mt-3 text-sm text-slate-400">Contents are unavailable.</p>') +
      '</div>';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') finish();
    };
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay || ev.target.closest('[data-cancel]')) finish();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    const close = overlay.querySelector('[data-cancel]');
    if (close) close.focus();
  }

  async function sellBankPiece(name, itemId, itemName, price) {
    if (selling || itemId == null) return;
    const yes = await confirmSale(itemName, price);
    if (!yes) return;
    selling = true;
    try {
      const data = await api('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sell', name, item: itemId }),
      });
      render(data);
    } catch (err) {
      window.alert(err.message);
    } finally {
      selling = false;
    }
  }

  function statIcon(kind) {
    if (kind === 'magic' || kind === 'range' || kind === 'strength' || kind === 'prayer') {
      const src = {
        magic: SKILL_ICON.magic,
        range: SKILL_ICON.ranged,
        strength: SKILL_ICON.strength,
        prayer: SKILL_ICON.prayer,
      }[kind];
      return '<img src="' + src + '" alt="" width="14" height="14" class="shrink-0">';
    }
    const paths = {
      stab: '<path d="M7 1.5v8M7 9.5l-2 3M7 9.5l2 3" />',
      slash: '<path d="M3 11.5L11 2.5M9.2 2.2l2.2.4-.4 2.2" />',
      crush: '<path d="M7 6.5v6M4.2 4.2a3.2 3.2 0 1 1 5.6 0" />',
    };
    return '<svg viewBox="0 0 14 14" width="14" height="14" class="shrink-0 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' + paths[kind] + '</svg>';
  }

  function statLine(kind, label, value, suffix) {
    const n = Number(value) || 0;
    const tone = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-amber-200/70';
    const shown = (n > 0 ? '+' : '') + n + (suffix || '');
    return '<div class="flex items-center gap-1.5 py-0.5">' +
      statIcon(kind) +
      '<span class="flex-1 text-xs text-slate-300">' + label + '</span>' +
      '<span class="text-xs tabular-nums ' + tone + '">' + shown + '</span>' +
    '</div>';
  }

  function renderCombatStats(stats) {
    const sheet = stats || {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { melee: 0, ranged: 0, magic: 0, prayer: 0 },
    };
    const attack = sheet.attack;
    const defence = sheet.defence;
    const other = sheet.other;
    const column = (title, values) =>
      '<div>' +
        '<p class="text-[11px] uppercase tracking-wide text-slate-500 mb-1">' + title + '</p>' +
        statLine('stab', 'Stab', values.stab) +
        statLine('slash', 'Slash', values.slash) +
        statLine('crush', 'Crush', values.crush) +
        statLine('magic', 'Magic', values.magic) +
        statLine('range', 'Range', values.range) +
      '</div>';
    return '<div class="mt-4 pt-3 border-t border-slate-700/80">' +
      '<h3 class="text-sm text-slate-300 mb-2">Stats</h3>' +
      '<div class="grid grid-cols-2 gap-x-4">' +
        column('Attack bonus', attack) +
        column('Defence bonus', defence) +
      '</div>' +
      '<p class="text-[11px] uppercase tracking-wide text-slate-500 mt-3 mb-1">Other bonuses</p>' +
      '<div class="grid grid-cols-2 gap-x-4">' +
        '<div>' +
          statLine('strength', 'Melee strength', other.melee) +
          statLine('range', 'Ranged strength', other.ranged) +
        '</div>' +
        '<div>' +
          statLine('magic', 'Magic damage', other.magic, '%') +
          statLine('prayer', 'Prayer', other.prayer) +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function priceLabel(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) {
      const m = v / 1000000;
      return (m >= 10 || m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1)) + 'm';
    }
    if (v >= 10000) return Math.round(v / 1000) + 'k';
    return v.toLocaleString();
  }

  function playRoll(roll) {
    return new Promise((resolve) => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const overlay = document.createElement('div');
      overlay.className = 'roll-overlay';
      const cards = (roll.reel || []).map((item, i) => {
        const icon = item && item.osrsId
          ? '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" width="36" height="36">'
          : '';
        return '<div class="roll-card" data-i="' + i + '">' + icon + '<span>' + escapeHtml(item ? item.name : '') + '</span></div>';
      }).join('');
      overlay.innerHTML =
        '<div class="roll-modal" role="dialog" aria-modal="true" aria-label="' + escapeHtml(roll.crateName) + '">' +
          '<p class="text-xs uppercase tracking-wide text-amber-200/80">' + escapeHtml(roll.crateName) + '</p>' +
          '<h2 class="text-lg text-slate-100 mb-3">Opening</h2>' +
          '<div class="roll-window"><div class="roll-marker"></div><div class="roll-strip">' + cards + '</div></div>' +
          '<p class="roll-result hidden"></p>' +
          '<button type="button" class="roll-take hidden mt-3 px-3 py-1.5 rounded bg-amber-400 text-slate-900 font-semibold">Take it</button>' +
        '</div>';
      document.body.appendChild(overlay);
      const strip = overlay.querySelector('.roll-strip');
      const result = overlay.querySelector('.roll-result');
      const take = overlay.querySelector('.roll-take');
      const win = overlay.querySelector('.roll-card[data-i="' + roll.winIndex + '"]');
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (win) win.classList.add('is-win');
        result.textContent = roll.detail || (roll.winner && roll.winner.name) || 'Got an item';
        result.classList.remove('hidden');
        take.classList.remove('hidden');
      };
      take.addEventListener('click', () => {
        overlay.remove();
        resolve();
      });
      const view = overlay.querySelector('.roll-window');
      const viewW = view.clientWidth || 480;
      const cardW = (win && win.offsetWidth ? win.offsetWidth : 104) + 8;
      const jitter = reduce ? 0 : (Math.random() * 28 - 14);
      const maxShift = Math.max(0, strip.scrollWidth - viewW);
      const rawTarget = (win ? win.offsetLeft : roll.winIndex * cardW) - viewW / 2 + (win ? win.offsetWidth : 104) / 2 + jitter;
      const target = Math.max(0, Math.min(maxShift, rawTarget));
      const travel = Math.min(maxShift, target + cardW * 11);
      if (reduce) {
        strip.style.transform = 'translateX(' + (-target) + 'px)';
        finish();
        return;
      }
      strip.style.transform = 'translateX(' + (-travel) + 'px)';
      void strip.offsetWidth;
      requestAnimationFrame(() => {
        strip.style.transition = 'transform 5.1s cubic-bezier(0.05, 0.65, 0.05, 1)';
        strip.style.transform = 'translateX(' + (-target) + 'px)';
      });
      strip.addEventListener('transitionend', (ev) => {
        if (ev.target === strip && ev.propertyName === 'transform') finish();
      });
      window.setTimeout(finish, 5600);
    });
  }

  let buyingCrate = false;
  let askingCrate = false;

  async function buyCrate(name, crateId, purse) {
    const crate = (lastState && lastState.crates || []).find((c) => c.id === crateId);
    if (!crate || askingCrate || buyingCrate) return;
    const afford = purse >= crate.cost;
    const cost = Number(crate.cost || 0).toLocaleString();
    askingCrate = true;
    let yes = false;
    try {
      yes = await askConfirm({
        title: 'Open ' + crate.name + '?',
        detail: afford
          ? 'This spends <span class="text-amber-200 tabular-nums">' + cost + ' gold</span>.'
          : 'This costs <span class="text-amber-200 tabular-nums">' + cost + ' gold</span>. You have ' + Number(purse || 0).toLocaleString() + '.',
        yes: afford ? 'Open' : null,
      });
    } finally {
      askingCrate = false;
    }
    if (!yes || !afford) return;
    buyingCrate = true;
    try {
      const data = await api('/api/spoops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'spend', name, crate: crateId }),
      });
      if (data.roll) await playRoll(data.roll);
      const fresh = await api('/api/spoops');
      render(fresh);
    } catch (err) {
      window.alert(err.message);
    } finally {
      buyingCrate = false;
    }
  }

  function paint(state) {
    document.querySelectorAll('canvas.spoop-sprite').forEach((canvas) => {
      const name = canvas.getAttribute('data-spoop');
      const spoop = name ? findSpoop(state.spoops, name) : (state.spoops || [])[0];
      if (spoop) drawSpoop(canvas, spoop);
    });
  }

  function render(state) {
    lastState = state;
    const page = document.body.getAttribute('data-page');
    if (page === 'detail') renderDetail(state);
    else renderList(state);
    mountDebug(state);
    const clock = document.getElementById('spoop-clock');
    if (clock) {
      clock.textContent = (state.useSim ? 'Simulated · ' : '') + state.clockLabel;
    }
    startNextTimers();
  }

  let bootSeq = 0;

  async function boot() {
    const root = document.getElementById('spoop-root');
    if (!root) return;
    const seq = ++bootSeq;
    const keep = lastState && root.querySelector('.gielinor, h1');
    if (!keep) root.innerHTML = '<p class="text-slate-500">Loading spoop…</p>';
    try {
      const data = await api('/api/spoops');
      if (seq !== bootSeq) return;
      render(data);
    } catch (err) {
      if (seq !== bootSeq || err.name === 'AbortError') return;
      const offline = /failed to fetch|networkerror|load failed|can't connect|cannot connect/i.test(err.message || '');
      root.innerHTML = '<p class="text-rose-300">Could not load spoops. ' + escapeHtml(offline ? 'Can’t connect. The page will try again.' : err.message) + '</p>' +
        '<button type="button" id="spoop-retry" class="mt-3 px-3 py-1 rounded bg-slate-700 text-slate-100 text-sm">Try again</button>';
      const retry = document.getElementById('spoop-retry');
      if (retry) retry.addEventListener('click', () => boot());
      if (offline && seq === 1) window.setTimeout(() => { if (seq === bootSeq) boot(); }, 1200);
    }
  }

  window.SpoopArt = { drawSpoop };

  window.addEventListener('pagehide', () => {
    bootSeq += 1;
    if (nextTimer) {
      window.clearInterval(nextTimer);
      nextTimer = null;
    }
  });
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) boot();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
