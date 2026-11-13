/** Real OSRS item ids for spoop gear. Sprites come from the public Weird Gloop sprite sheet. */

const OSRS_IDS = {
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

function osrsIdFor(item) {
  if (!item) return null;
  if (item.osrsId) return item.osrsId;
  const row = OSRS_IDS[item.baseId];
  if (!row) return null;
  return row[item.tier] || null;
}

module.exports = { OSRS_IDS, osrsIdFor };
