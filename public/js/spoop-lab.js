(function () {
  const TIERS = [
    { id: 'bronze', name: 'bronze', power: 2, color: '#c47a3a' },
    { id: 'iron', name: 'iron', power: 3, color: '#b8b8b8' },
    { id: 'steel', name: 'steel', power: 4, color: '#d5d8e0' },
    { id: 'black', name: 'black', power: 5, color: '#4a4a4a' },
    { id: 'mithril', name: 'mithril', power: 6, color: '#6a8ec8' },
    { id: 'adamant', name: 'adamant', power: 8, color: '#3d9a55' },
    { id: 'rune', name: 'rune', power: 10, color: '#3aa0d8' },
    { id: 'dragon', name: 'dragon', power: 13, color: '#d04532' },
    { id: 'barrows', name: 'barrows', power: 16, color: '#7a4ea8' },
    { id: 'raid', name: 'raid', power: 20, color: '#e6c15a' },
  ];
  const QUALITIES = ['crude', 'worn', 'standard', 'fine', 'sharpened', 'tempered', 'masterwork'];
  const WEAPONS = [
    { id: 'dagger', name: 'dagger', style: 'melee' },
    { id: 'sword', name: 'sword', style: 'melee' },
    { id: 'longsword', name: 'longsword', style: 'melee' },
    { id: 'scimitar', name: 'scimitar', style: 'melee' },
    { id: 'mace', name: 'mace', style: 'melee' },
    { id: 'shortbow', name: 'shortbow', style: 'ranged' },
    { id: 'staff', name: 'staff', style: 'magic' },
  ];
  const ARMOR = [
    { id: 'med-helm', name: 'med helm', slot: 'head' },
    { id: 'full-helm', name: 'full helm', slot: 'head' },
    { id: 'platebody', name: 'platebody', slot: 'body' },
    { id: 'platelegs', name: 'platelegs', slot: 'legs' },
    { id: 'kiteshield', name: 'kiteshield', slot: 'shield' },
    { id: 'boots', name: 'boots', slot: 'boots' },
    { id: 'gloves', name: 'gloves', slot: 'gloves' },
    { id: 'cape', name: 'cape', slot: 'cape' },
    { id: 'amulet', name: 'amulet', slot: 'neck' },
    { id: 'ring', name: 'ring', slot: 'ring' },
    { id: 'ammo', name: 'ammo', slot: 'ammo' },
  ];
  const CUSTOM_HELMS = [
    { id: 'wizard-hat', name: 'wizard hat', tier: 'bronze', osrsId: 579 },
    { id: 'coif', name: 'coif', tier: 'iron', osrsId: 1169 },
    { id: 'spiny-helm', name: 'spiny helmet', tier: 'steel', osrsId: 4551 },
    { id: 'black-mask', name: 'black mask', tier: 'black', osrsId: 8921 },
    { id: 'slayer-helm', name: 'slayer helmet', tier: 'mithril', osrsId: 11864 },
    { id: 'initiate-sallet', name: 'initiate sallet', tier: 'mithril', osrsId: 5574 },
    { id: 'proselyte-sallet', name: 'proselyte sallet', tier: 'adamant', osrsId: 9672 },
    { id: 'berserker-helm', name: 'berserker helm', tier: 'rune', osrsId: 3751 },
    { id: 'warrior-helm', name: 'warrior helm', tier: 'rune', osrsId: 3753 },
    { id: 'archer-helm', name: 'archer helm', tier: 'rune', osrsId: 3749 },
    { id: 'farseer-helm', name: 'farseer helm', tier: 'rune', osrsId: 3755 },
    { id: 'void-melee', name: 'void melee helm', tier: 'rune', osrsId: 11665 },
    { id: 'void-ranger', name: 'void ranger helm', tier: 'rune', osrsId: 11664 },
    { id: 'void-mage', name: 'void mage helm', tier: 'rune', osrsId: 11663 },
    { id: 'granite-helm', name: 'granite helm', tier: 'dragon', osrsId: 10589 },
    { id: 'neitiznot-helm', name: 'helm of neitiznot', tier: 'dragon', osrsId: 10828 },
    { id: 'obsidian-helm', name: 'obsidian helmet', tier: 'dragon', osrsId: 21298 },
    { id: 'faceguard', name: 'neitiznot faceguard', tier: 'barrows', osrsId: 24271 },
    { id: 'serpentine-helm', name: 'serpentine helm', tier: 'barrows', osrsId: 12931 },
    { id: 'armadyl-helm', name: 'armadyl helmet', tier: 'barrows', osrsId: 11826 },
    { id: 'inquisitor-helm', name: "inquisitor's great helm", tier: 'barrows', osrsId: 24419 },
    { id: 'ancestral-hat', name: 'ancestral hat', tier: 'raid', osrsId: 21018 },
    { id: 'justiciar-helm', name: 'justiciar faceguard', tier: 'raid', osrsId: 22326 },
    { id: 'torva-helm', name: 'torva full helm', tier: 'raid', osrsId: 26382 },
  ];
  const OSRS = {
    dagger: { bronze: 1205, iron: 1203, steel: 1207, black: 1217, mithril: 1209, adamant: 1211, rune: 1213, dragon: 1215, barrows: 13265, raid: 22324 },
    sword: { bronze: 1277, iron: 1279, steel: 1281, black: 1283, mithril: 1285, adamant: 1287, rune: 1289, dragon: 21009, barrows: 4718, raid: 26219 },
    longsword: { bronze: 1291, iron: 1293, steel: 1295, black: 1297, mithril: 1299, adamant: 1301, rune: 1303, dragon: 1305, barrows: 4718, raid: 22325 },
    scimitar: { bronze: 1321, iron: 1323, steel: 1325, black: 1327, mithril: 1329, adamant: 1331, rune: 1333, dragon: 4587, barrows: 4151, raid: 26219 },
    mace: { bronze: 1422, iron: 1420, steel: 1424, black: 1426, mithril: 1428, adamant: 1430, rune: 1432, dragon: 1434, barrows: 4718, raid: 24417 },
    shortbow: { bronze: 841, iron: 843, steel: 849, black: 853, mithril: 857, adamant: 861, rune: 12788, dragon: 20997, barrows: 4734, raid: 20997 },
    staff: { bronze: 1381, iron: 1383, steel: 1385, black: 1387, mithril: 1405, adamant: 4675, rune: 6914, dragon: 21006, barrows: 4710, raid: 27275 },
    'med-helm': { bronze: 1139, iron: 1137, steel: 1141, black: 1151, mithril: 1143, adamant: 1145, rune: 1147, dragon: 1149, barrows: 4716, raid: 26382 },
    'full-helm': { bronze: 1155, iron: 1153, steel: 1157, black: 1165, mithril: 1159, adamant: 1161, rune: 1163, dragon: 11335, barrows: 4745, raid: 22326 },
    platebody: { bronze: 1117, iron: 1115, steel: 1119, black: 1125, mithril: 1121, adamant: 1123, rune: 1127, dragon: 21892, barrows: 4720, raid: 26384 },
    platelegs: { bronze: 1075, iron: 1067, steel: 1069, black: 1077, mithril: 1071, adamant: 1073, rune: 1079, dragon: 4087, barrows: 4722, raid: 26386 },
    kiteshield: { bronze: 1189, iron: 1191, steel: 1193, black: 1195, mithril: 1197, adamant: 1199, rune: 1201, dragon: 21895, barrows: 11283, raid: 22003 },
    boots: { bronze: 4119, iron: 4121, steel: 4123, black: 4125, mithril: 4127, adamant: 4129, rune: 4131, dragon: 11840, barrows: 13239, raid: 13239 },
    gloves: { bronze: 1059, iron: 1065, steel: 2487, black: 2489, mithril: 2491, adamant: 2491, rune: 7462, dragon: 7462, barrows: 7462, raid: 22981 },
    cape: { bronze: 1007, iron: 1019, steel: 1021, black: 1052, mithril: 6568, adamant: 6570, rune: 21295, dragon: 13280, barrows: 13124, raid: 21285 },
    amulet: { bronze: 1725, iron: 1727, steel: 1729, black: 1731, mithril: 1704, adamant: 6585, rune: 19553, dragon: 19547, barrows: 12002, raid: 24780 },
    ring: { bronze: 1635, iron: 1637, steel: 1639, black: 1641, mithril: 1643, adamant: 2572, rune: 6737, dragon: 6733, barrows: 22975, raid: 25975 },
    ammo: { bronze: 882, iron: 884, steel: 886, black: 888, mithril: 890, adamant: 892, rune: 11212, dragon: 21326, barrows: 4740, raid: 11230 },
  };
  const WEAPON_SHEET = {
    dagger: { stab: 4, slash: 2, crush: -4, magic: 1 },
    sword: { stab: 6, slash: 4, crush: -2 },
    scimitar: { stab: 2, slash: 7, crush: -2 },
    longsword: { stab: 6, slash: 8, crush: -2 },
    mace: { stab: -2, slash: -2, crush: 7 },
    shortbow: { range: 8 },
    staff: { stab: 2, slash: -1, crush: 6, magic: 10 },
  };
  const WEAPON_STRENGTH = { dagger: 3, sword: 5, scimitar: 6, longsword: 9, mace: 6, staff: 3 };
  const ARMOR_SHEET = {
    'med-helm': { def: { stab: 4, slash: 5, crush: 3, magic: -1, range: 4 }, atk: { magic: -2, range: -1 } },
    'full-helm': { def: { stab: 7, slash: 8, crush: 6, magic: -3, range: 6 }, atk: { stab: -1, slash: -1, crush: -1, magic: -5, range: -2 } },
    'wizard-hat': { def: { magic: 4 }, atk: { magic: 4 }, other: { magic: 1 } },
    coif: { def: { stab: 2, slash: 2, crush: 1, magic: 3, range: 4 }, atk: { range: 2 } },
    'spiny-helm': { def: { stab: 3, slash: 4, crush: 6, magic: -1, range: 3 } },
    'black-mask': { def: { stab: 3, slash: 4, crush: 2, magic: -1, range: 3 }, other: { melee: 1 } },
    'slayer-helm': { def: { stab: 4, slash: 5, crush: 3, magic: 1, range: 4 }, other: { melee: 1 } },
    'initiate-sallet': { def: { stab: 3, slash: 3, crush: 2, magic: 2, range: 2 }, other: { prayer: 1 } },
    'proselyte-sallet': { def: { stab: 4, slash: 4, crush: 3, magic: 3, range: 3 }, other: { prayer: 2 } },
    'berserker-helm': { def: { stab: 5, slash: 6, crush: 4, magic: -3, range: 5 }, atk: { magic: -4, range: -4 }, other: { melee: 1 } },
    'warrior-helm': { def: { stab: 5, slash: 6, crush: 5, magic: -2, range: 5 }, atk: { magic: -3, range: -3 }, other: { melee: 1 } },
    'archer-helm': { def: { stab: 4, slash: 4, crush: 3, magic: -1, range: 5 }, atk: { range: 3 } },
    'farseer-helm': { def: { magic: 5 }, atk: { magic: 4 } },
    'void-melee': { def: { stab: 3, slash: 3, crush: 3, magic: 2, range: 2 }, atk: { stab: 2, slash: 2, crush: 2 } },
    'void-ranger': { def: { stab: 3, slash: 3, crush: 3, magic: 2, range: 3 }, atk: { range: 3 } },
    'void-mage': { def: { stab: 2, slash: 2, crush: 2, magic: 3, range: 2 }, atk: { magic: 3 } },
    'granite-helm': { def: { stab: 4, slash: 5, crush: 8, magic: -4, range: 4 }, atk: { magic: -4, range: -3 }, other: { melee: 1 } },
    'neitiznot-helm': { def: { stab: 6, slash: 7, crush: 5, magic: 2, range: 6 }, other: { melee: 1, prayer: 1 } },
    'obsidian-helm': { def: { stab: 5, slash: 5, crush: 5, magic: -2, range: 3 }, atk: { magic: -4, range: -4 }, other: { melee: 1 } },
    faceguard: { def: { stab: 7, slash: 8, crush: 6, magic: 3, range: 7 }, other: { melee: 2, prayer: 1 } },
    'serpentine-helm': { def: { stab: 8, slash: 8, crush: 7, magic: 4, range: 6 } },
    'armadyl-helm': { def: { stab: 5, slash: 5, crush: 4, magic: 2, range: 7 }, atk: { range: 5 } },
    'inquisitor-helm': { def: { stab: 5, slash: 5, crush: 8, magic: 2, range: 4 }, atk: { crush: 2 }, other: { prayer: 1 } },
    'ancestral-hat': { def: { magic: 6 }, atk: { magic: 5 }, other: { magic: 1 } },
    'justiciar-helm': { def: { stab: 8, slash: 8, crush: 8, magic: 4, range: 7 }, other: { prayer: 2 } },
    'torva-helm': { def: { stab: 8, slash: 8, crush: 7, magic: 3, range: 7 }, other: { melee: 2 } },
    platebody: { def: { stab: 16, slash: 16, crush: 15, magic: -1, range: 16 }, atk: { magic: -6, range: -3 } },
    platelegs: { def: { stab: 10, slash: 9, crush: 8, magic: -1, range: 10 }, atk: { magic: -4, range: -2 } },
    kiteshield: { def: { stab: 9, slash: 10, crush: 8, magic: -1, range: 8 }, atk: { magic: -2, range: -1 } },
    boots: { def: { stab: 1, slash: 2, crush: 3 } },
    gloves: { def: { stab: 2, slash: 2, crush: 1, magic: 1, range: 2 } },
    cape: { def: { stab: 1, slash: 1, crush: 1, magic: 1, range: 1 } },
  };
  const TIER_LEVEL = { bronze: 1, iron: 1, steel: 5, black: 10, mithril: 20, adamant: 30, rune: 40, dragon: 60, barrows: 70, raid: 75 };
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
  const POSES = [
    ['idle', 'Idle'],
    ['windup', 'Windup'],
    ['strike', 'Strike'],
    ['draw', 'Draw'],
    ['cast', 'Cast'],
  ];
  const SKILL_ICON = {
    attack: '/assets/Attack_icon.png',
    strength: '/assets/Strength_icon.png',
    defence: '/assets/Defence_icon.png',
    hitpoints: '/assets/Hitpoints_icon.png',
    ranged: '/assets/Ranged_icon.png',
    magic: '/assets/Magic_icon.png',
    prayer: '/assets/Prayer_icon.png',
  };

  const catalog = [];
  WEAPONS.forEach((weapon) => {
    TIERS.forEach((tier) => {
      QUALITIES.forEach((quality) => {
        catalog.push(makeItem('weapon', weapon.id, weapon.name, weapon.style, tier.id, quality));
      });
    });
  });
  ARMOR.forEach((piece) => {
    TIERS.forEach((tier) => {
      QUALITIES.forEach((quality) => {
        catalog.push(makeItem(piece.slot, piece.id, piece.name, null, tier.id, quality));
      });
    });
  });
  CUSTOM_HELMS.forEach((piece) => {
    QUALITIES.forEach((quality) => {
      catalog.push(makeItem('head', piece.id, piece.name, null, piece.tier, quality, { plainName: true, osrsId: piece.osrsId }));
    });
  });
  const byKey = new Map(catalog.map((item) => [item.key, item]));

  const levels = { attack: 40, strength: 40, defence: 40, hitpoints: 40, ranged: 40, magic: 40, prayer: 40 };
  const worn = {
    weapon: byKey.get('weapon|sword|mithril|standard'),
    head: byKey.get('head|med-helm|mithril|standard'),
    body: byKey.get('body|platebody|mithril|standard'),
    legs: byKey.get('legs|platelegs|mithril|standard'),
    shield: byKey.get('shield|kiteshield|mithril|standard'),
  };
  let pose = 'idle';
  let dragging = null;
  let pointerDrag = null;
  let suppressClick = false;
  const filters = { slot: 'all', tier: 'all', quality: 'standard', text: '' };

  function makeItem(slot, baseId, baseName, style, tier, quality, extra) {
    extra = extra || {};
    return {
      key: slot + '|' + baseId + '|' + tier + '|' + quality,
      slot,
      baseId,
      baseName,
      style,
      tier,
      quality,
      plainName: !!extra.plainName,
      osrsId: extra.osrsId || (OSRS[baseId] && OSRS[baseId][tier]) || null,
    };
  }

  function tierById(id) {
    return TIERS.find((tier) => tier.id === id) || TIERS[0];
  }

  function qualitySteps(id) {
    const index = QUALITIES.indexOf(id);
    return (index < 0 ? 2 : index) - 2;
  }

  function influence(base, qualityId) {
    if (!base) return 0;
    const steps = qualitySteps(qualityId);
    const plain = Math.round(base);
    if (!steps) return plain;
    const percent = Math.round(base * steps * 0.02);
    return plain + Math.sign(base) * steps + percent;
  }

  function addSheet(into, bonus, piece) {
    if (!bonus || !piece) return;
    const scale = tierById(piece.tier).power / 2;
    Object.keys(bonus).forEach((key) => {
      into[key] += influence(bonus[key] * scale, piece.quality);
    });
  }

  function emptyBonuses() {
    return {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { melee: 0, ranged: 0, magic: 0, prayer: 0 },
    };
  }

  function bonusesForItem(item) {
    const bonuses = emptyBonuses();
    if (!item) return bonuses;
    const scale = tierById(item.tier).power / 2;
    if (item.slot === 'weapon') {
      addSheet(bonuses.attack, WEAPON_SHEET[item.baseId] || WEAPON_SHEET.sword, item);
      bonuses.other.melee += influence((WEAPON_STRENGTH[item.baseId] || 0) * scale, item.quality);
      if (item.baseId === 'staff') bonuses.other.magic += influence(Math.max(0, scale - 1), item.quality);
    } else if (item.slot === 'neck') {
      const acc = influence(2 * scale, item.quality);
      ['stab', 'slash', 'crush', 'magic', 'range'].forEach((key) => { bonuses.attack[key] += acc; });
      bonuses.other.melee += acc;
      bonuses.other.prayer += influence(1, item.quality);
    } else if (item.slot === 'ring') {
      bonuses.other.melee += influence(Math.max(1, scale), item.quality);
    } else if (item.slot === 'ammo') {
      bonuses.other.ranged += influence(7 * scale, item.quality);
    } else {
      const sheet = ARMOR_SHEET[item.baseId];
      if (sheet) {
        addSheet(bonuses.defence, sheet.def, item);
        addSheet(bonuses.attack, sheet.atk, item);
        addSheet(bonuses.other, sheet.other, item);
      }
    }
    return bonuses;
  }

  function equipmentStats() {
    const totals = emptyBonuses();
    Object.keys(worn).forEach((slot) => {
      const part = bonusesForItem(worn[slot]);
      ['attack', 'defence', 'other'].forEach((group) => {
        Object.keys(totals[group]).forEach((key) => {
          totals[group][key] += part[group][key];
        });
      });
    });
    return totals;
  }

  function gearRating(item) {
    if (!item) return 0;
    const ti = Math.max(0, TIERS.findIndex((tier) => tier.id === item.tier));
    const qi = QUALITIES.indexOf(item.quality);
    const helm = item.slot !== 'head' ? 0 : item.baseId === 'full-helm' ? 1 : item.plainName ? 2 : 0;
    return 1 + ti * 10 + (qi < 0 ? 2 : qi) + helm;
  }

  function averageGear() {
    const slots = ['weapon', 'shield', 'head', 'body', 'legs', 'boots', 'gloves', 'cape', 'neck', 'ring', 'ammo'];
    const sum = slots.reduce((total, slot) => total + gearRating(worn[slot]), 0);
    return Math.round((sum / slots.length) * 10) / 10;
  }

  function combatLevel() {
    const base = 0.25 * (levels.defence + levels.hitpoints + Math.floor(levels.prayer / 2));
    const melee = 0.325 * (levels.attack + levels.strength);
    const range = 0.325 * Math.floor(levels.ranged * 1.5);
    const mage = 0.325 * Math.floor(levels.magic * 1.5);
    return Math.floor(base + Math.max(melee, range, mage));
  }

  function itemName(item) {
    let quality = item.quality.charAt(0).toUpperCase() + item.quality.slice(1);
    if (item.quality === 'sharpened' && item.slot !== 'weapon') quality = 'Reinforced';
    if (item.plainName) return quality + ' ' + item.baseName;
    return quality + ' ' + item.tier + ' ' + item.baseName;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function iconHtml(item, size) {
    const px = size || 36;
    if (!item) return '';
    const color = tierById(item.tier).color;
    const letter = escapeHtml(item.baseName.charAt(0).toUpperCase());
    const img = item.osrsId
      ? '<img src="/api/spoops?icon=1&id=' + item.osrsId + '" alt="" width="' + px + '" height="' + px + '" loading="lazy" onerror="this.remove()">'
      : '';
    return '<span class="lab-swatch" style="background:' + color + ';width:' + px + 'px;height:' + px + 'px">' + letter + img + '</span>';
  }

  function spoopView() {
    return {
      name: document.getElementById('lab-name').value || 'Tester',
      equipped: worn,
    };
  }

  function paintSprite() {
    const canvas = document.getElementById('lab-spoop');
    if (window.SpoopArt) window.SpoopArt.drawSpoop(canvas, spoopView(), { pose: pose });
  }

  function statLine(label, value) {
    const n = Number(value) || 0;
    const tone = n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-slate-500';
    return '<div class="flex justify-between gap-3 text-xs py-0.5"><span class="text-slate-400">' + label +
      '</span><span class="tabular-nums ' + tone + '">' + (n > 0 ? '+' : '') + n + '</span></div>';
  }

  function paintStats() {
    const stats = equipmentStats();
    const skills = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'].map((id) => {
      const label = id === 'hitpoints' ? 'Hitpoints' : id.charAt(0).toUpperCase() + id.slice(1);
      return '<label class="lab-skill text-sm text-slate-300">' +
        '<img src="' + SKILL_ICON[id] + '" alt="">' +
        '<span>' + label + '</span>' +
        '<input class="lab-name" data-skill="' + id + '" type="number" min="1" max="99" value="' + levels[id] + '">' +
      '</label>';
    }).join('');
    const column = (title, rows) => '<div><p class="text-[10px] uppercase tracking-wide text-slate-500 mb-1">' + title + '</p>' + rows + '</div>';
    document.getElementById('lab-stats').innerHTML =
      '<div class="flex items-baseline justify-between gap-3 mb-3">' +
        '<h2 class="text-sm text-slate-300">Stats</h2>' +
        '<p class="text-sm text-amber-200 tabular-nums">Combat ' + combatLevel() + ' · Gear ' + averageGear() + '</p>' +
      '</div>' +
      '<div class="grid gap-4 sm:grid-cols-[auto_1fr]">' +
        '<div>' + skills + '</div>' +
        '<div class="grid grid-cols-3 gap-3">' +
          column('Attack', ['stab', 'slash', 'crush', 'magic', 'range'].map((key) => statLine(key, stats.attack[key])).join('')) +
          column('Defence', ['stab', 'slash', 'crush', 'magic', 'range'].map((key) => statLine(key, stats.defence[key])).join('')) +
          column('Other', [
            statLine('Melee str', stats.other.melee),
            statLine('Ranged str', stats.other.ranged),
            statLine('Magic', stats.other.magic),
            statLine('Prayer', stats.other.prayer),
          ].join('')) +
        '</div>' +
      '</div>';
    document.getElementById('lab-stats').querySelectorAll('[data-skill]').forEach((input) => {
      input.addEventListener('input', () => {
        const next = Math.max(1, Math.min(99, parseInt(input.value, 10) || 1));
        levels[input.getAttribute('data-skill')] = next;
        const line = document.querySelector('#lab-stats .text-amber-200');
        if (line) line.textContent = 'Combat ' + combatLevel() + ' · Gear ' + averageGear();
      });
      input.addEventListener('change', () => {
        const next = Math.max(1, Math.min(99, parseInt(input.value, 10) || 1));
        levels[input.getAttribute('data-skill')] = next;
        input.value = String(next);
      });
    });
  }

  function paintSlots() {
    const root = document.getElementById('lab-slots');
    root.innerHTML = EQUIP_GRID.map((row) => row.map((slot) => {
      if (!slot) return '<div></div>';
      const item = worn[slot];
      const inner = item
        ? iconHtml(item, 36)
        : '<span class="text-[9px] uppercase tracking-wide text-slate-600 text-center leading-tight px-1">' + SLOT_LABEL[slot] + '</span>';
      const label = item ? itemName(item) : SLOT_LABEL[slot];
      return '<div class="spoop-slot" role="button" aria-label="' + escapeHtml(label) + '" data-slot="' + slot + '" title="' + escapeHtml(label) + '">' + inner + '</div>';
    }).join('')).join('');
    root.querySelectorAll('[data-slot]').forEach((el) => {
      const slot = el.getAttribute('data-slot');
      el.addEventListener('dragover', (ev) => {
        if (!dragging || dragging.slot !== slot) return;
        ev.preventDefault();
        el.classList.add('is-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('is-over'));
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        el.classList.remove('is-over');
        if (!dragging || dragging.slot !== slot) return;
        worn[slot] = dragging;
        dragging = null;
        suppressClick = true;
        paint();
      });
      el.addEventListener('click', () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        if (!worn[slot]) return;
        worn[slot] = null;
        paint();
      });
    });
  }

  function visibleItems() {
    const text = filters.text.trim().toLowerCase();
    return catalog.filter((item) => {
      if (filters.slot !== 'all' && item.slot !== filters.slot) return false;
      if (filters.tier !== 'all' && item.tier !== filters.tier) return false;
      if (filters.quality !== 'all' && item.quality !== filters.quality) return false;
      if (text && itemName(item).toLowerCase().indexOf(text) < 0 && item.baseName.indexOf(text) < 0) return false;
      return true;
    });
  }

  function paintItems() {
    const showQuality = filters.quality === 'all';
    const root = document.getElementById('lab-items');
    const items = visibleItems();
    root.innerHTML = items.map((item) => {
      const label = (showQuality ? item.quality + ' ' : '') + (item.plainName ? '' : item.tier + ' ') + item.baseName;
      return '<div class="lab-item" role="button" aria-label="' + escapeHtml(itemName(item)) + '" draggable="true" data-key="' + item.key + '" title="' + escapeHtml(itemName(item)) + '">' +
        iconHtml(item, 40) +
        '<span>' + escapeHtml(label) + '</span>' +
      '</div>';
    }).join('') || '<p class="text-sm text-slate-500">No pieces match.</p>';
    root.querySelectorAll('[data-key]').forEach((el) => {
      const item = byKey.get(el.getAttribute('data-key'));
      el.addEventListener('dragstart', (ev) => {
        dragging = item;
        ev.dataTransfer.setData('text/plain', item.key);
        ev.dataTransfer.effectAllowed = 'copy';
      });
      el.addEventListener('dragend', () => { dragging = null; });
      el.addEventListener('pointerdown', (ev) => {
        pointerDrag = { item: item, x: ev.clientX, y: ev.clientY, moved: false };
      });
      el.addEventListener('click', () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        worn[item.slot] = item;
        paint();
      });
    });
  }

  function paint() {
    paintSprite();
    paintStats();
    paintSlots();
  }

  function watchPointer() {
    window.addEventListener('pointermove', (ev) => {
      if (!pointerDrag) return;
      if (Math.hypot(ev.clientX - pointerDrag.x, ev.clientY - pointerDrag.y) > 5) pointerDrag.moved = true;
    });
    window.addEventListener('pointerup', (ev) => {
      if (!pointerDrag) return;
      const info = pointerDrag;
      pointerDrag = null;
      if (!info.moved) return;
      suppressClick = true;
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const slotEl = hit && hit.closest('[data-slot]');
      if (!slotEl) return;
      const slot = slotEl.getAttribute('data-slot');
      if (info.item.slot !== slot) return;
      worn[slot] = info.item;
      paint();
    });
  }

  function buildChrome() {
    document.getElementById('lab-poses').innerHTML = POSES.map((pair) =>
      '<button type="button" data-pose="' + pair[0] + '">' + pair[1] + '</button>'
    ).join('');
    document.getElementById('lab-poses').addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-pose]');
      if (!btn) return;
      pose = btn.getAttribute('data-pose');
      paintSprite();
      markPose();
    });
    document.getElementById('lab-grid').addEventListener('change', (ev) => {
      document.getElementById('lab-stage').classList.toggle('show-grid', ev.target.checked);
    });
    document.getElementById('lab-name').addEventListener('input', paintSprite);
    document.getElementById('lab-clear').addEventListener('click', () => {
      Object.keys(worn).forEach((slot) => { worn[slot] = null; });
      paint();
    });
    const slotOptions = '<option value="all">All slots</option>' +
      Object.keys(SLOT_LABEL).map((slot) => '<option value="' + slot + '">' + SLOT_LABEL[slot] + '</option>').join('');
    const tierOptions = '<option value="all">All tiers</option>' +
      TIERS.map((tier) => '<option value="' + tier.id + '">' + tier.name + '</option>').join('');
    const qualityOptions = QUALITIES.map((quality) =>
      '<option value="' + quality + '"' + (quality === 'standard' ? ' selected' : '') + '>' + quality + '</option>'
    ).join('') + '<option value="all">All qualities</option>';
    document.getElementById('lab-filters').innerHTML =
      '<select id="lab-slot">' + slotOptions + '</select>' +
      '<select id="lab-tier">' + tierOptions + '</select>' +
      '<select id="lab-quality">' + qualityOptions + '</select>' +
      '<input id="lab-find" class="lab-name" placeholder="Find a piece" />';
    ['lab-slot', 'lab-tier', 'lab-quality'].forEach((id) => {
      document.getElementById(id).addEventListener('change', (ev) => {
        filters[id.replace('lab-', '')] = ev.target.value;
        paintItems();
      });
    });
    document.getElementById('lab-find').addEventListener('input', (ev) => {
      filters.text = ev.target.value;
      paintItems();
    });
    markPose();
  }

  function markPose() {
    document.querySelectorAll('[data-pose]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-pose') === pose);
    });
  }

  watchPointer();
  buildChrome();
  paint();
  paintItems();
})();
