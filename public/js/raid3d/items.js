// What every piece of gear looks like in 3D, keyed by the OSRS item id the game shows as its icon.
// The id is what a player sees in the equipment grid, so the model follows the icon: a "rune cape"
// whose icon is the infernal cape is drawn as the infernal cape.
//
// Plain data, no three.js, so a check script can confirm every id the game can roll has an entry.
//
// Shapes per slot (the builder in character.js knows each one):
//   weapon  k: dagger sword longsword scimitar mace warhammer maul greataxe axe halberd scythe spear
//              flail hammer whip rapier fang godsword claws macuahuitl bludgeon saeldor voidwaker
//              shortbow longbow crossbow ballista blowpipe atlatl
//              staff battlestaff wand trident sotd nightmare sang shadow iban slayerstaff
//   head    k: med full great hat hood coif mask bandana cap brim sallet
//           plus horns crest plume fins spikes visor eyes
//   body    k: plate robe vest hide leather tunic crystal
//   legs    k: pants skirt tassets chaps
//   boots   k: boot tall shoe
//   gloves  k: glove vamb gauntlet bracelet
//   cape    k: plain fire infernal spotted max god ava quiver mythical legends
//   neck    k: amulet symbol bone fang
//   ring, ammo (k: arrow bolt dart), shield k: kite sq defender dfs ward book tome spirit buckler odium antler hopper hide

export const METAL = {
  bronze: '#b8733a', iron: '#9a9a9e', steel: '#c9ccd4', black: '#3a3a3e', mithril: '#5a78b8',
  adamant: '#3d8a50', rune: '#3a96c8', dragon: '#c23a2a', barrows: '#6a6a70', raid: '#d9b54a',
};

const WOOD = '#6b4228';
const GOLD = '#e8c45a';
const CATALOG = {};

function def(ids, spec) {
  (Array.isArray(ids) ? ids : [ids]).forEach((id) => { CATALOG[id] = spec; });
}

// Plain metal families, bronze through dragon, in tier order.
const TIERS = ['bronze', 'iron', 'steel', 'black', 'mithril', 'adamant', 'rune', 'dragon'];
function family(ids, make) {
  ids.forEach((id, i) => { if (id) def(id, make(METAL[TIERS[i]], TIERS[i])); });
}

// ---- Weapons ----
family([1205, 1203, 1207, 1217, 1209, 1211, 1213, 1215], (m) => ({ k: 'dagger', m }));
family([1277, 1279, 1281, 1283, 1285, 1287, 1289, 21009], (m) => ({ k: 'sword', m }));
family([1291, 1293, 1295, 1297, 1299, 1301, 1303, 1305], (m) => ({ k: 'longsword', m }));
family([1321, 1323, 1325, 1327, 1329, 1331, 1333, 4587], (m) => ({ k: 'scimitar', m }));
family([1422, 1420, 1424, 1426, 1428, 1430, 1432, 1434], (m) => ({ k: 'mace', m }));
def(13265, { k: 'dagger', m: '#3d3a4a', g: '#8a5ad0' });
def(22324, { k: 'rapier', m: '#b8bcc8', h: '#7a1e2a' });
def(4718, { k: 'greataxe', m: '#4a4a4a', h: '#3a2a1c' });
def(26219, { k: 'fang', m: '#e8dcb8', h: '#6b4a2a' });
def(28338, { k: 'axe', m: '#2a1e22', h: '#5a1a22', g: '#c8203a' });
def(4151, { k: 'whip', m: '#3a3a4a', h: '#5a2a2a' });
def(24417, { k: 'mace', m: '#d9d2c0', h: '#7a5a1a', g: GOLD, heavy: true });
def(13652, { k: 'claws', m: '#c23a2a' });
def(13576, { k: 'warhammer', m: '#c23a2a', h: WOOD });
def(4726, { k: 'spear', m: '#6a6a70', h: '#3a5a3a' });
def(4747, { k: 'hammer', m: '#6a6a70', h: '#3a2a1c' });
def(4755, { k: 'flail', m: '#6a6a70', h: '#3a2a1c' });
def(28997, { k: 'macuahuitl', m: '#2a2a2e', h: '#7a4a2a', g: '#c8203a' });
def(11802, { k: 'godsword', m: '#c9ccd4', h: '#d9b54a', g: '#d9b54a' });
def(11804, { k: 'godsword', m: '#c9ccd4', h: '#6a5a3a', g: '#8a7a4a' });
def(11806, { k: 'godsword', m: '#c9ccd4', h: '#e8e8f0', g: '#3a57b5' });
def(11808, { k: 'godsword', m: '#c9ccd4', h: '#9a2424', g: '#d04532' });
def(13263, { k: 'bludgeon', m: '#3a3a4a', h: '#5a2a2a', g: '#8a5ad0' });
def(23995, { k: 'saeldor', m: '#9ee8f0', h: '#d9b54a', g: '#5ec8d4' });
def(21003, { k: 'maul', m: '#7a7a6a', h: '#4a3a2a' });
def(27690, { k: 'voidwaker', m: '#3a2a4a', h: '#d9b54a', g: '#a060ff' });
def(29796, { k: 'halberd', m: '#2a2a2e', h: '#4a2a4a', g: '#9a40c0' });
def(22325, { k: 'scythe', m: '#c8203a', h: '#3a2a2a', g: '#ff4060' });

// Bows. The plain metal shortbow families are the real wooden shortbows.
def(841, { k: 'shortbow', m: '#8a6a3a' });
def(843, { k: 'shortbow', m: '#a07a44' });
def(849, { k: 'shortbow', m: '#b89a5a' });
def(853, { k: 'shortbow', m: '#8a5a2a' });
def(857, { k: 'shortbow', m: '#6a3a1a' });
def(861, { k: 'shortbow', m: '#3a6a5a' });
def(12788, { k: 'shortbow', m: '#3a6a5a', g: '#9ad0ff' });
def(11235, { k: 'longbow', m: '#2a2430', g: '#8a5ad0' });
def(859, { k: 'longbow', m: '#3a6a5a' });
def(22550, { k: 'longbow', m: '#5a3a2a', g: '#d04532' });
def(20997, { k: 'longbow', m: '#5a4a3a', g: '#b0ffb0', twisted: true });
def(25865, { k: 'longbow', m: '#9ee8f0', g: '#5ec8d4', crystal: true });
def(4734, { k: 'crossbow', m: '#5a4a3a', h: '#4a4a4a' });
def(8880, { k: 'crossbow', m: '#8a8a6a', h: '#6a5a3a' });
def(9185, { k: 'crossbow', m: '#3a96c8', h: WOOD });
def(11785, { k: 'crossbow', m: '#e8e0c0', h: '#d9b54a' });
def(21902, { k: 'crossbow', m: '#c23a2a', h: WOOD });
def(21012, { k: 'crossbow', m: '#3a5a3a', h: '#c23a2a' });
def(26374, { k: 'crossbow', m: '#3a2a3a', h: '#c8203a', g: '#ff4060' });
def(19478, { k: 'ballista', m: '#7a6a4a', h: WOOD });
def(19481, { k: 'ballista', m: '#4a4a4a', h: '#3a2a1c' });
def(12926, { k: 'blowpipe', m: '#3a8a3a', h: '#2a4a2a' });
def(29000, { k: 'atlatl', m: '#3a2a4a', h: '#d9b54a', g: '#e8a040' });

// Staves: the orb colour is the element.
def(1379, { k: 'staff', m: WOOD, o: '#c8b48a' });
def(1381, { k: 'staff', m: WOOD, o: '#f0f0ff' });
def(1383, { k: 'staff', m: WOOD, o: '#3a8aff' });
def(1385, { k: 'staff', m: WOOD, o: '#7a5a2a' });
def(1387, { k: 'staff', m: WOOD, o: '#ff5a1a' });
def(1389, { k: 'staff', m: '#3a5ab8', o: '#9ad0ff' });
def(1391, { k: 'battlestaff', m: '#4a3a2a', o: '#c8c8c8' });
def(1397, { k: 'battlestaff', m: '#4a3a2a', o: '#f0f0ff' });
def(1395, { k: 'battlestaff', m: '#4a3a2a', o: '#3a8aff' });
def(1399, { k: 'battlestaff', m: '#4a3a2a', o: '#7a5a2a' });
def(1393, { k: 'battlestaff', m: '#4a3a2a', o: '#ff5a1a' });
def(6562, { k: 'battlestaff', m: '#4a3a2a', o: '#5a7a3a' });
def(3053, { k: 'battlestaff', m: '#4a3a2a', o: '#ff8a1a' });
def(1405, { k: 'battlestaff', m: '#5a5a6a', o: '#ff5a1a', mystic: true });
def(4675, { k: 'staff', m: '#3a2a4a', o: '#c060ff', head: 'ancient' });
def(4170, { k: 'slayerstaff', m: '#5a5a5a', o: '#6aff6a' });
def(6914, { k: 'wand', m: '#3a2a6a', o: '#c8a0ff' });
def(21006, { k: 'wand', m: '#3a6a8a', o: '#7ae0ff', kodai: true });
def(4710, { k: 'staff', m: '#3a3a3a', o: '#5a5a5a', head: 'ahrim' });
def(22323, { k: 'sang', m: '#3a1a1a', o: '#ff2a3a' });
def(1409, { k: 'iban', m: '#2a2a2a', o: '#9a3aff' });
def(11791, { k: 'sotd', m: '#3a3a4a', o: '#8a5ad0' });
def(12904, { k: 'sotd', m: '#3a5a3a', o: '#5aff5a' });
def(28988, { k: 'spear', m: '#5a8ad0', h: '#d9b54a', g: '#9ad0ff', magic: true });
def(11905, { k: 'trident', m: '#3a8a9a', o: '#5aefff' });
def(24422, { k: 'nightmare', m: '#5a4a6a', o: '#9a8ab8' });
def(24423, { k: 'nightmare', m: '#5a4a6a', o: '#5aa0ff' });
def(24425, { k: 'nightmare', m: '#5a4a6a', o: '#c060ff' });
def(24424, { k: 'nightmare', m: '#5a4a6a', o: '#ff6a3a' });
def(27275, { k: 'shadow', m: '#d9b54a', o: '#7a3aff' });

// ---- Heads ----
family([1139, 1137, 1141, 1151, 1143, 1145, 1147, 1149], (c, t) => ({ k: 'med', c, crest: t === 'dragon' }));
family([1155, 1153, 1157, 1165, 1159, 1161, 1163, 11335], (c, t) => ({ k: 'full', c, crest: t === 'rune' || t === 'dragon', spikes: t === 'dragon' }));
def(4716, { k: 'full', c: '#4a4a4a', visor: 'cross' });
def(26382, { k: 'full', c: '#4a4a5a', c2: '#c8203a', horns: '#3a3a3a', crest: true });
def(4745, { k: 'full', c: '#5a5a5a', visor: 'grill', horns: '#5a5a5a' });
def(22326, { k: 'full', c: '#e8e0c8', c2: GOLD, visor: 'gold' });
def(30073, { k: 'coif', c: '#1f8a78', c2: '#4ec4ae' });
def(23971, { k: 'med', c: '#9ee8f0', c2: '#f4ffff', crest: true, glow: '#5ec8d4' });
def(1167, { k: 'coif', c: '#8a5a32' });
def(6326, { k: 'bandana', c: '#7a8a4a' });
def(10382, { k: 'coif', c: '#3d7a3a', c2: '#e8e0c0' });
def(10390, { k: 'coif', c: '#3a57b5', c2: '#f0e8c8' });
def(10374, { k: 'coif', c: '#9a2424', c2: '#e8d090' });
def(13385, { k: 'hood', c: '#6d8f4a', c2: '#d4e8a4' });
def(4089, { k: 'hat', c: '#2c4f86', c2: '#8eb4e8', short: true });
def(4099, { k: 'hat', c: '#4a2a6a', c2: '#c9a0e8', short: true });
def(4109, { k: 'hat', c: '#d8d4c8', c2: '#ffffff', short: true });
def(6918, { k: 'hat', c: '#d7c48a', c2: '#3a57b5', short: true });
def(25413, { k: 'hood', c: '#6a1c28', c2: '#3a1018', spikes: true });
def(7396, { k: 'hat', c: '#34489a', c2: GOLD });
def(12453, { k: 'hat', c: '#26262e', c2: GOLD });
def(579, { k: 'hat', c: '#3a4e9a', c2: '#7a92e0' });
def(3385, { k: 'hood', c: '#6e5a3a', c2: '#a08a5a' });
def(7400, { k: 'hat', c: '#2a3a6a', c2: GOLD });
def(20595, { k: 'hood', c: '#3a3a3e', c2: '#d9b54a' });
def(24288, { k: 'hood', c: '#3a2a4a', c2: '#c8203a' });
def(1169, { k: 'coif', c: '#6e4a2e' });
def(4551, { k: 'med', c: '#8a8a7a', spikes: true });
def(8921, { k: 'mask', c: '#2a2a2a', c2: '#9a3030' });
def(11864, { k: 'full', c: '#3a4038', visor: 'slayer', eyes: '#d5dcc8' });
def(5574, { k: 'sallet', c: '#e4e0d4', c2: '#e0b84a' });
def(9672, { k: 'sallet', c: '#f7f4ea', c2: '#e0b84a', crest: true });
def(3751, { k: 'med', c: '#9aa0a8', horns: '#e7e2d6' });
def(3753, { k: 'med', c: '#8a8175', crest: true, plume: '#c8a050' });
def(2581, { k: 'cap', c: '#3d7a3a', plume: '#c8203a' });
def(3749, { k: 'med', c: '#3f6b34', fins: '#6ea05a' });
def(10550, { k: 'brim', c: '#3a5a2a', plume: '#e8e0d0' });
def(3755, { k: 'med', c: '#3a3a68', fins: '#7a7ab8', glow: '#9fd4ff' });
def(11665, { k: 'med', c: '#d5d5d8', c2: '#8a8a90', visor: 'void' });
def(11664, { k: 'med', c: '#d5d5d8', c2: '#3d8f45', visor: 'void' });
def(11663, { k: 'med', c: '#d5d5d8', c2: '#3a57b5', visor: 'void' });
def(10589, { k: 'full', c: '#7a7a72', visor: 'slit', blocky: true });
def(10828, { k: 'med', c: '#8a8175', horns: '#efe6d4', cheeks: true });
def(21298, { k: 'full', c: '#2a2a2e', visor: 'slit', eyes: '#ff5a1a' });
def(24271, { k: 'full', c: '#8a8175', horns: '#efe6d4', visor: 'grill' });
def(12931, { k: 'full', c: '#3a7a4a', c2: '#a0d060', visor: 'snake', eyes: '#ffe040' });
def(11826, { k: 'mask', c: '#e8e0c0', c2: GOLD, full: true, crest: true });
def(24419, { k: 'great', c: '#c8c8d0', c2: '#5a3a8a' });
def(21018, { k: 'hood', c: '#6a3aa0', c2: '#c89ae8', spikes: true });
def(4724, { k: 'full', c: '#5a6a5a', visor: 'slit', crest: true });
def(4753, { k: 'hood', c: '#5a5a5a', c2: '#3a3a3a', helm: true });
def(4708, { k: 'hood', c: '#3a3a3a', c2: '#1a1a1a', shadow: true });
def(4732, { k: 'coif', c: '#5a4a3a', c2: '#3a3a3a', mask: true });
def(29028, { k: 'full', c: '#8a2a2a', c2: '#3a1a1a', horns: '#d9d0c0', visor: 'slit' });
def(29019, { k: 'hood', c: '#3a5a9a', c2: '#d9d0c0', mask: true });
def(29010, { k: 'full', c: '#d9b54a', c2: '#3a2a4a', visor: 'slit', crest: true });
def(26241, { k: 'mask', c: '#3a3a4a', c2: '#9a40c0', full: true, eyes: '#c060ff' });
def(27235, { k: 'mask', c: '#c8a070', c2: '#8a5a2a', full: true, eyes: '#e8d090' });
def(10350, { k: 'full', c: '#e8e6dc', c2: GOLD, crest: true, visor: 'cross' });
def(10334, { k: 'coif', c: '#3e7a4a', c2: GOLD });
def(10342, { k: 'hat', c: '#2e4a9a', c2: GOLD });

// ---- Bodies ----
family([1117, 1115, 1119, 1125, 1121, 1123, 1127], (c) => ({ k: 'plate', c }));
def(21892, { k: 'plate', c: '#c23a2a', c2: '#5a5a5a', pads: true });
def(4720, { k: 'plate', c: '#4a4a4a', c2: '#3a2a1c', pads: true });
def(26384, { k: 'plate', c: '#4a4a5a', c2: '#c8203a', pads: true, spikes: true });
def(1135, { k: 'hide', c: '#2f9a3a' });
def(2499, { k: 'hide', c: '#2d6fce' });
def(2503, { k: 'hide', c: '#3c4148' });
def(12596, { k: 'tunic', c: '#2f6a32', c2: '#5a3a1a' });
def(30076, { k: 'hide', c: '#1f8a78', c2: '#4ec4ae' });
def(23975, { k: 'crystal', c: '#9ee8f0', c2: '#f4ffff' });
def(1129, { k: 'leather', c: '#8a5a32' });
def(1131, { k: 'leather', c: '#6e4428', c2: '#4a2a18' });
def(1133, { k: 'leather', c: '#7a6248', studs: '#c8c8c8' });
def(10954, { k: 'leather', c: '#5a6e3a', c2: '#3a4a22' });
def(6322, { k: 'leather', c: '#7a8a4a', c2: '#4e5a2e' });
def(10378, { k: 'hide', c: '#3d7a3a', c2: '#e8e0c0' });
def(10386, { k: 'hide', c: '#3a57b5', c2: '#f0e8c8' });
def(10370, { k: 'hide', c: '#9a2424', c2: '#e8d090' });
def(577, { k: 'robe', c: '#3a4e9a' });
def(10460, { k: 'robe', c: '#9a2424', c2: GOLD });
def(10458, { k: 'robe', c: '#e8e8f0', c2: '#3a57b5' });
def(10462, { k: 'robe', c: '#3d7a3a', c2: '#e8e0c0' });
def(13387, { k: 'robe', c: '#6d8f4a', c2: '#d4e8a4' });
def(4091, { k: 'robe', c: '#2c4f86', c2: '#8eb4e8' });
def(4101, { k: 'robe', c: '#4a2a6a', c2: '#c9a0e8' });
def(6916, { k: 'robe', c: '#d7c48a', c2: '#3a57b5' });
def(25404, { k: 'robe', c: '#6a1c28', c2: '#3a1018', bark: true });
def(581, { k: 'robe', c: '#2e2e36' });
def(7392, { k: 'robe', c: '#34489a', c2: GOLD });
def(12449, { k: 'robe', c: '#26262e', c2: GOLD });
def(3387, { k: 'robe', c: '#6e5a3a', c2: '#a08a5a', bark: true });
def(7399, { k: 'robe', c: '#2a3a6a', c2: GOLD });
def(4111, { k: 'robe', c: '#d8d4c8', c2: '#8a8678' });
def(20517, { k: 'robe', c: '#3a3a3e', c2: '#d9b54a' });
def(24291, { k: 'robe', c: '#3a2a4a', c2: '#c8203a' });
def(8839, { k: 'tunic', c: '#d9d3c7', c2: '#8a8a90', c3: '#d9b54a' });
def(9674, { k: 'plate', c: '#f2efe6', c2: '#e0b84a', cross: '#3a57b5' });
def(10551, { k: 'vest', c: '#8d3030', c2: '#c4a46a' });
def(21301, { k: 'plate', c: '#2a2a2e', c2: '#ff5a1a', pads: true });
def(4728, { k: 'plate', c: '#5a6a5a', c2: '#3a4a3a' });
def(4749, { k: 'plate', c: '#5a5a5a', c2: '#3a3a3a', pads: true });
def(4757, { k: 'plate', c: '#6a6a6a', c2: '#3a3a3a', cross: '#2a2a2a' });
def(4712, { k: 'robe', c: '#3a3a3a', c2: '#1a1a1a' });
def(4736, { k: 'leather', c: '#5a4a3a', c2: '#3a3a3a' });
def(29022, { k: 'plate', c: '#8a2a2a', c2: '#d9d0c0', pads: true });
def(29013, { k: 'plate', c: '#3a5a9a', c2: '#d9d0c0' });
def(29004, { k: 'plate', c: '#d9b54a', c2: '#3a2a4a' });
def(11832, { k: 'plate', c: '#6a5a3a', c2: '#8a7a4a', pads: true, belt: '#4a3a2a' });
def(11828, { k: 'plate', c: '#e8e0c0', c2: GOLD, pads: true });
def(21021, { k: 'robe', c: '#3a2a6a', c2: '#c89ae8' });
def(22327, { k: 'plate', c: '#e8e0c8', c2: GOLD, pads: true });
def(26243, { k: 'robe', c: '#3a3a4a', c2: '#9a40c0' });
def(27238, { k: 'hide', c: '#c8a070', c2: '#8a5a2a' });
def(24420, { k: 'plate', c: '#c8c8d0', c2: '#5a3a8a', cross: '#5a3a8a' });
def(10348, { k: 'plate', c: '#e8e6dc', c2: GOLD, pads: true });
def(10330, { k: 'hide', c: '#3e7a4a', c2: GOLD });
def(10338, { k: 'robe', c: '#2e4a9a', c2: GOLD });

// ---- Legs ----
family([1075, 1067, 1069, 1077, 1071, 1073, 1079], (c) => ({ k: 'pants', c }));
def(4087, { k: 'pants', c: '#c23a2a', c2: '#5a5a5a' });
def(4722, { k: 'pants', c: '#4a4a4a' });
def(26386, { k: 'pants', c: '#4a4a5a', c2: '#c8203a' });
def(1099, { k: 'chaps', c: '#2f9a3a' });
def(2493, { k: 'chaps', c: '#2d6fce' });
def(2497, { k: 'chaps', c: '#3c4148' });
def(23249, { k: 'pants', c: '#2f6a32' });
def(30079, { k: 'chaps', c: '#1f8a78', c2: '#4ec4ae' });
def(23979, { k: 'pants', c: '#9ee8f0', c2: '#f4ffff' });
def(1095, { k: 'chaps', c: '#8a5a32' });
def(1097, { k: 'chaps', c: '#7a6248', c2: '#c8c8c8' });
def(10956, { k: 'chaps', c: '#5a6e3a' });
def(6324, { k: 'chaps', c: '#7a8a4a' });
def(10380, { k: 'chaps', c: '#3d7a3a', c2: '#e8e0c0' });
def(10388, { k: 'chaps', c: '#3a57b5', c2: '#f0e8c8' });
def(10372, { k: 'chaps', c: '#9a2424', c2: '#e8d090' });
def(1011, { k: 'skirt', c: '#3a4e9a' });
def(10468, { k: 'skirt', c: '#9a2424', c2: GOLD });
def(10464, { k: 'skirt', c: '#e8e8f0', c2: '#3a57b5' });
def(10466, { k: 'skirt', c: '#3d7a3a', c2: '#e8e0c0' });
def(13389, { k: 'skirt', c: '#6d8f4a', c2: '#d4e8a4' });
def(4093, { k: 'skirt', c: '#2c4f86', c2: '#8eb4e8' });
def(4103, { k: 'skirt', c: '#4a2a6a', c2: '#c9a0e8' });
def(6924, { k: 'skirt', c: '#d7c48a', c2: '#3a57b5' });
def(25416, { k: 'skirt', c: '#6a1c28', c2: '#3a1018' });
def(1015, { k: 'skirt', c: '#2e2e36' });
def(7388, { k: 'skirt', c: '#34489a', c2: GOLD });
def(12445, { k: 'skirt', c: '#26262e', c2: GOLD });
def(3389, { k: 'skirt', c: '#6e5a3a', c2: '#a08a5a' });
def(7398, { k: 'skirt', c: '#2a3a6a', c2: GOLD });
def(4113, { k: 'skirt', c: '#d8d4c8', c2: '#8a8678' });
def(20520, { k: 'skirt', c: '#3a3a3e', c2: '#d9b54a' });
def(24294, { k: 'skirt', c: '#3a2a4a', c2: '#c8203a' });
def(8840, { k: 'skirt', c: '#d9d3c7', c2: '#8a8a90' });
def(9678, { k: 'tassets', c: '#f2efe6', c2: '#e0b84a' });
def(21304, { k: 'pants', c: '#2a2a2e', c2: '#ff5a1a' });
def(4730, { k: 'skirt', c: '#5a6a5a', c2: '#3a4a3a' });
def(4751, { k: 'pants', c: '#5a5a5a' });
def(4759, { k: 'skirt', c: '#6a6a6a', c2: '#3a3a3a' });
def(4714, { k: 'skirt', c: '#3a3a3a', c2: '#1a1a1a' });
def(4738, { k: 'skirt', c: '#5a4a3a', c2: '#3a3a3a' });
def(29025, { k: 'tassets', c: '#8a2a2a', c2: '#d9d0c0' });
def(29016, { k: 'tassets', c: '#3a5a9a', c2: '#d9d0c0' });
def(29007, { k: 'tassets', c: '#d9b54a', c2: '#3a2a4a' });
def(11834, { k: 'tassets', c: '#6a5a3a', c2: '#8a7a4a' });
def(11830, { k: 'skirt', c: '#e8e0c0', c2: GOLD });
def(21024, { k: 'skirt', c: '#3a2a6a', c2: '#c89ae8' });
def(22328, { k: 'tassets', c: '#e8e0c8', c2: GOLD });
def(26245, { k: 'skirt', c: '#3a3a4a', c2: '#9a40c0' });
def(27241, { k: 'chaps', c: '#c8a070', c2: '#8a5a2a' });
def(24421, { k: 'skirt', c: '#c8c8d0', c2: '#5a3a8a' });
def(10346, { k: 'pants', c: '#e8e6dc', c2: GOLD });
def(10332, { k: 'chaps', c: '#3e7a4a', c2: GOLD });
def(10340, { k: 'skirt', c: '#2e4a9a', c2: GOLD });

// ---- Shields ----
family([1189, 1191, 1193, 1195, 1197, 1199, 1201], (c) => ({ k: 'kite', c }));
def(21895, { k: 'sq', c: '#c23a2a', c2: '#5a5a5a' });
def(11283, { k: 'dfs', c: '#5a5a5a', c2: '#c23a2a' });
def(11284, { k: 'dfs', c: '#5a5a5a', c2: '#c23a2a' });
def(22003, { k: 'ward', c: '#c23a2a', c2: '#3a3a3a' });
def(3844, { k: 'book', c: '#3d7a3a', c2: '#d4e8a4' });
def(3842, { k: 'book', c: '#8a2424', c2: '#e07070' });
def(12610, { k: 'book', c: '#f2f4f8', c2: '#3a4e9a' });
def(6889, { k: 'book', c: '#5a3a8a', c2: '#c9a0e8' });
def(20714, { k: 'tome', c: '#a8321e', c2: '#f0a050', g: '#ff6a1a' });
def(22275, { k: 'hide', c: '#2f9a3a' });
def(22278, { k: 'hide', c: '#2d6fce' });
def(31081, { k: 'antler', c: '#8a6840', c2: '#d8c8a0' });
def(12954, { k: 'defender', c: '#c23a2a' });
def(22322, { k: 'defender', c: '#8a1a2a', c2: '#d9b54a' });
def(11926, { k: 'odium', c: '#5a3a78', c2: '#9a6ac8' });
def(32879, { k: 'hopper', c: '#3a6a9a', c2: '#7ac0e0' });
def(12817, { k: 'spirit', c: '#e8e0c0', c2: '#5ac8ff', g: '#9ae8ff' });
def(12825, { k: 'spirit', c: '#e8e0c0', c2: '#c060ff', g: '#d8a0ff' });
def(21000, { k: 'buckler', c: '#5a4a3a', c2: '#b0ffb0' });

// ---- Boots ----
family([4119, 4121, 4123, 4125, 4127, 4129, 4131], (c) => ({ k: 'boot', c }));
def(11840, { k: 'boot', c: '#c23a2a', c2: '#5a5a5a' });
def(13239, { k: 'tall', c: '#5a1a1a', c2: '#c8203a', g: '#ff4040' });
def(1061, { k: 'shoe', c: '#8a5a32' });
def(10958, { k: 'shoe', c: '#5a6e3a' });
def(6328, { k: 'shoe', c: '#7a8a4a' });
def(19927, { k: 'tall', c: '#3d7a3a', c2: '#e8e0c0' });
def(19933, { k: 'tall', c: '#3a57b5', c2: '#f0e8c8' });
def(19936, { k: 'tall', c: '#9a2424', c2: '#e8d090' });
def(25410, { k: 'shoe', c: '#6a1c28' });
def(2579, { k: 'shoe', c: '#3a4e9a' });
def(3393, { k: 'shoe', c: '#6e5a3a' });
def(4097, { k: 'shoe', c: '#2c4f86' });
def(4107, { k: 'shoe', c: '#4a2a6a' });
def(4117, { k: 'shoe', c: '#d8d4c8' });
def(6920, { k: 'shoe', c: '#d7c48a' });
def(13378, { k: 'boot', c: '#6e4030' });
def(2577, { k: 'tall', c: '#2f6a32', c2: '#5a3a1a' });
def(11836, { k: 'tall', c: '#6a5a3a', c2: '#8a7a4a' });
def(21733, { k: 'tall', c: '#5a5a5a', c2: '#d9b54a' });
def(13237, { k: 'tall', c: '#8a7a5a', c2: '#e8e0c0', wings: true });
def(13235, { k: 'tall', c: '#2a3a6a', c2: '#5aa0ff', g: '#7ab8ff' });
def(31088, { k: 'tall', c: '#5a1a2a', c2: '#d9b54a' });
def(22954, { k: 'shoe', c: '#e8e0c8', c2: '#d9b54a' });

// ---- Gloves ----
def(1059, { k: 'glove', c: '#8a5a32' });
def(1065, { k: 'vamb', c: '#2f9a3a' });
def(2487, { k: 'vamb', c: '#2d6fce' });
def(2489, { k: 'vamb', c: '#c23a2a' });
def(2491, { k: 'vamb', c: '#3c4148' });
def(7462, { k: 'glove', c: '#6a4a8a', c2: '#d9b54a' });
def(22981, { k: 'gauntlet', c: '#5a3a2a', c2: '#c8a070' });
def(30082, { k: 'vamb', c: '#1f8a78' });
def(1063, { k: 'vamb', c: '#8a5a32' });
def(6330, { k: 'vamb', c: '#7a8a4a' });
def(10376, { k: 'vamb', c: '#3d7a3a', c2: '#e8e0c0' });
def(10384, { k: 'vamb', c: '#3a57b5', c2: '#f0e8c8' });
def(10368, { k: 'vamb', c: '#9a2424', c2: '#e8d090' });
def(25407, { k: 'gauntlet', c: '#6a1c28' });
def(3391, { k: 'gauntlet', c: '#6e5a3a' });
def(4095, { k: 'glove', c: '#2c4f86' });
def(4105, { k: 'glove', c: '#4a2a6a' });
def(4115, { k: 'glove', c: '#d8d4c8' });
def(6922, { k: 'glove', c: '#d7c48a' });
def(19994, { k: 'glove', c: '#2f6a32' });
def(26235, { k: 'vamb', c: '#3a2a3a', c2: '#c8203a' });
def(19544, { k: 'bracelet', c: '#d9b54a', g: '#ff4060' });
def(10336, { k: 'vamb', c: '#3e7a4a', c2: GOLD });
def(31106, { k: 'gauntlet', c: '#3a2a4a', c2: '#c060ff' });

// ---- Capes ----
def(1007, { k: 'plain', c: '#a02a2a' });
def(1019, { k: 'plain', c: '#2a2a2e' });
def(1021, { k: 'plain', c: '#2a4a9a' });
def(1052, { k: 'legends', c: '#e8e0d0', c2: '#3a8ad0' });
def(6568, { k: 'plain', c: '#2a2a2e', c2: '#ff6a1a' });
def(6570, { k: 'fire', c: '#e8641a', c2: '#ffd040' });
def(21295, { k: 'infernal', c: '#3a1a14', c2: '#ff6a1a' });
def(13280, { k: 'max', c: '#c8203a', c2: '#e8e0d0' });
def(13124, { k: 'plain', c: '#3a5a8a', c2: '#d9b54a' });
def(21285, { k: 'max', c: '#3a1a14', c2: '#ff6a1a', fire: true });
def(10498, { k: 'ava', c: '#6a8a48', c2: '#8a6a4a' });
def(10499, { k: 'ava', c: '#3d8a3a', c2: '#8a6a4a' });
def(22109, { k: 'ava', c: '#5a3a2a', c2: '#d9b54a', cape: '#5a3a2a' });
def(10069, { k: 'spotted', c: '#8a6a3a', c2: '#4a3a1a' });
def(2412, { k: 'god', c: '#3a57b5', c2: '#f0f0ff' });
def(21791, { k: 'god', c: '#3a57b5', c2: GOLD, glow: '#9ad0ff' });
def(22114, { k: 'mythical', c: '#3a3a3e', c2: '#8a9aa8' });
def(28947, { k: 'quiver', c: '#5a3a2a', c2: '#d9b54a' });
def(21776, { k: 'max', c: '#3a57b5', c2: GOLD, glow: '#9ad0ff' });

// ---- Necklaces ----
def(1725, { k: 'amulet', c: '#d9b54a', g: '#c23a2a' });
def(1727, { k: 'amulet', c: '#d9b54a', g: '#3a57b5' });
def(1729, { k: 'amulet', c: '#d9b54a', g: '#3d9a55' });
def(1731, { k: 'amulet', c: '#d9b54a', g: '#e8e8f0' });
def(1704, { k: 'amulet', c: '#d9b54a', g: '#d0d8e8' });
def(1712, { k: 'amulet', c: '#d9b54a', g: '#e8f0ff', glow: true });
def(6585, { k: 'amulet', c: '#d9b54a', g: '#c23a2a', big: true });
def(19553, { k: 'amulet', c: '#d9b54a', g: '#c8203a', big: true });
def(19547, { k: 'fang', c: '#d9b54a', g: '#3d8a3a' });
def(22249, { k: 'fang', c: '#f0d060', g: '#3d8a3a' });
def(12002, { k: 'amulet', c: '#3a3a3e', g: '#5aa0ff', big: true });
def(19720, { k: 'amulet', c: '#f0d060', g: '#5aa0ff', big: true });
def(24780, { k: 'amulet', c: '#d9b54a', g: '#ff2a3a', big: true, glow: true });
def(1724, { k: 'symbol', c: '#8a8a8a', g: '#5a1a1a' });
def(1478, { k: 'amulet', c: '#d9b54a', g: '#e8e8f0' });
def(34762, { k: 'amulet', c: '#d9b54a', g: '#7ae0ff' });
def(22111, { k: 'bone', c: '#e8e0c8', g: '#c23a2a' });
def(34401, { k: 'fang', c: '#e8e0c8', g: '#3a3a3a' });
def(33639, { k: 'amulet', c: '#5a1a2a', g: '#ff2a3a', big: true });
def(29801, { k: 'amulet', c: '#d9b54a', g: '#ff6a1a', big: true, glow: true });

// ---- Rings: a glint on the hand ----
def(1635, { g: '#d9b54a' });
def(1637, { g: '#3a57b5' });
def(1639, { g: '#3d9a55' });
def(1641, { g: '#c23a2a' });
def(1643, { g: '#e8e8f0' });
def(2572, { g: '#c8a0ff' });
def([6737, 6735, 6733, 6731, 11771], { g: '#5a5a5a' });
def(22975, { g: '#c23a2a' });
def([25975, 28316, 28307, 28313, 28310], { g: '#d9b54a', glow: true });
def(13202, { g: '#e8e0c8' });
def(12692, { g: '#5a1a1a' });

// ---- Ammo: what pokes out of the quiver ----
family([882, 884, 886, 888, 890, 892], (c) => ({ k: 'arrow', c }));
def(11212, { k: 'arrow', c: '#c23a2a' });
def(21326, { k: 'arrow', c: '#c8a0ff' });
def(4740, { k: 'bolt', c: '#6a6a70' });
def(11230, { k: 'dart', c: '#c23a2a' });
def(9243, { k: 'bolt', c: '#e8f0ff' });
def(21944, { k: 'bolt', c: '#ff2a3a' });
def(21946, { k: 'bolt', c: '#e8f0ff' });

export function itemSpec(osrsId) {
  return CATALOG[Number(osrsId)] || null;
}

export function catalogIds() {
  return Object.keys(CATALOG).map(Number);
}
