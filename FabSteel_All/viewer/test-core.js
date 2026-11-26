const FS = require('./src/core.js');
const assert = require('assert');
(async () => {
  const raw = FS.demo();
  const M = FS.load(raw);
  console.log('parts', M.parts.length, 'bolts', M.bolts.length, 'autoLevels', M.autoLevels);
  // 1 locate
  const f = FS.findParts(M, 'c101'); assert(f.length >= 1 && f[0].m === 'C101'); 
  console.log('C101', f[0].gTxt, f[0].lv0t, f[0].lv1t, f[0].k);
  assert.strictEqual(f[0].g0, 'A-1');
  // 2 tree
  const t = FS.partTree(M, f[0]);
  console.log('tree bolts', t.bolts.map(b => b.label + ' x' + b.n), 'connected', t.connected.map(c => c.part.m + ':' + c.via.map(v => v.label + v.n).join('/')).join(', '));
  assert(t.connected.length > 0);
  // 3 grid
  const g1 = FS.gridReport(M, 'A'); console.log('grid A', g1.rows.length, g1.totals);
  const g2 = FS.gridReport(M, 'A-1'); console.log('grid A-1', g2.rows.map(r => r.part.m + '(' + r.role + ')').join(' '));
  const g3 = FS.gridReport(M, '2'); console.log('grid 2', g3.rows.length);
  assert(g1.ok && g2.ok && g3.ok);
  // 4 level
  M.grid.z.forEach((z, i) => { const r = FS.levelReport(M, i); console.log('level', z.n, r.rows.length); });
  // 5 bolts
  console.log(FS.boltTypes(M).map(t => t.label + ' groups=' + t.groups + ' bolts=' + t.bolts + ' parts=' + t.parts.size).join(' | '));
  const q = FS.matchBoltTypes(M, 'M20x70'); assert.strictEqual(q.length, 1);
  const br = FS.boltReport(M, '20x70'); console.log('bolt rep rows', br.rows.length, br.title);
  assert.strictEqual(FS.matchBoltTypes(M, '۱۶').length, 1);
  // compact + gzip + reload
  const c = FS.compact(M); const gz = await FS.jsonToGzip(c);
  console.log('json', JSON.stringify(raw).length, 'compact', JSON.stringify(c).length, 'gz', gz.bytes.length);
  const back = await FS.bytesToJson(gz.bytes); const M2 = FS.load(back);
  assert.strictEqual(M2.parts.length, M.parts.length); assert.strictEqual(M2.bolts.length, M.bolts.length);
  // auto levels
  const raw2 = FS.demo(); raw2.grid.z = []; const M3 = FS.load(raw2); console.log('auto levels', M3.grid.z.map(z => z.n).join(' '));
  // corners for brace (inclined)
  const br0 = M.parts.find(p => p.k === 'brace'); const cs = FS.corners(br0); assert.strictEqual(cs.length, 8); console.log('brace corner0', cs[0].map(Math.round));
  require('fs').writeFileSync('../docs/sample.fabsteel', Buffer.from(gz.bytes));
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
