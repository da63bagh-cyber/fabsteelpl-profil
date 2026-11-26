/* FabSteel core — pure data layer (no DOM). Shared by Windows/Electron and Android WebView. */
(function (root) {
  'use strict';
  const FS = {};

  /* ---------- helpers ---------- */
  const PERSIAN = '۰۱۲۳۴۵۶۷۸۹', ARABIC = '٠١٢٣٤٥٦٧٨٩';
  FS.normDigits = s => String(s == null ? '' : s).replace(/[۰-۹]/g, c => PERSIAN.indexOf(c)).replace(/[٠-٩]/g, c => ARABIC.indexOf(c));
  const norm = s => FS.normDigits(s).toLowerCase().replace(/\s+/g, '');
  FS.fmtLevel = mm => (mm < 0 ? '-' : '+') + Math.abs(mm / 1000).toFixed(3);
  FS.natCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  const KIND_ORDER = { col: 0, beam: 1, brace: 2, plate: 3 };
  FS.KIND_FA = { col: 'ستون', beam: 'تیر', brace: 'بادبند', plate: 'ورق/سایر' };

  function nearestIdx(arr, v) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i].v - v); if (d < bd) { bd = d; bi = i; } }
    return { i: bi, d: bd };
  }

  function kindOf(p) {
    if (p.ln) {
      const dx = p.ln[3] - p.ln[0], dy = p.ln[4] - p.ln[1], dz = p.ln[5] - p.ln[2];
      const L = Math.hypot(dx, dy, dz) || 1, vz = Math.abs(dz) / L;
      if (vz > 0.85) return 'col';
      if (vz < 0.2) return 'beam';
      return 'brace';
    }
    return 'plate';
  }

  function autoLevels(parts) {
    const vals = [];
    for (const p of parts) {
      if (p.k === 'beam') vals.push(p.bb[5]);
      else if (p.k === 'col') { vals.push(p.bb[2]); vals.push(p.bb[5]); }
    }
    vals.sort((a, b) => a - b);
    const clusters = [];
    for (const v of vals) {
      const c = clusters[clusters.length - 1];
      if (c && v - c[c.length - 1] <= 150) c.push(v); else clusters.push([v]);
    }
    let lv = clusters.filter(c => c.length >= 2).map(c => Math.round(c.reduce((s, x) => s + x, 0) / c.length / 10) * 10);
    if (!lv.length && vals.length) lv = [Math.round(vals[0]), Math.round(vals[vals.length - 1])];
    lv = Array.from(new Set(lv)).sort((a, b) => a - b);
    return lv.map(v => ({ n: FS.fmtLevel(v), v }));
  }

  /* ---------- load ---------- */
  FS.load = function (raw) {
    if (!raw || !Array.isArray(raw.parts)) throw new Error('فایل معتبر .fabsteel نیست.');
    const M = { raw: null, prj: raw.prj || {}, parts: [], bolts: [], grid: { x: [], y: [], z: [] }, autoLevels: false };
    const G = raw.grid || {};
    const mapG = a => (a || []).map(g => ({ n: String(g.n), v: +g.v })).sort((a, b) => a.v - b.v);
    M.grid.x = mapG(G.x); M.grid.y = mapG(G.y); M.grid.z = mapG(G.z);

    M.partById = new Map();
    for (const r of raw.parts) {
      if (!r || !r.bb || r.bb.length < 6) continue;
      const p = {
        id: r.id, m: String(r.m != null && r.m !== '' ? r.m : r.id), a: r.a != null ? String(r.a) : '',
        mp: r.mp ? 1 : 0, n: r.n || '', p: r.p || '', mt: r.mt || '', w: +r.w || 0, l: +r.l || 0, c: r.c || '',
        ob: r.ob && r.ob.length === 15 ? r.ob.map(Number) : null,
        bb: r.bb.map(Number), ln: r.ln && r.ln.length >= 6 ? r.ln.map(Number) : null,
        sec: r.sec && r.sec.length >= 2 && r.sec[0] > 0 && r.sec[1] > 0 ? [+r.sec[0], +r.sec[1]] : null
      };
      p.k = kindOf(p);
      p.cx = (p.bb[0] + p.bb[3]) / 2; p.cy = (p.bb[1] + p.bb[4]) / 2; p.cz = (p.bb[2] + p.bb[5]) / 2;
      if (p.ln) { p.p0 = [p.ln[0], p.ln[1], p.ln[2]]; p.p1 = [p.ln[3], p.ln[4], p.ln[5]]; if (!p.l) p.l = Math.hypot(p.ln[3] - p.ln[0], p.ln[4] - p.ln[1], p.ln[5] - p.ln[2]); }
      else { p.p0 = [p.cx, p.cy, p.cz]; p.p1 = p.p0; }
      p.z0 = p.bb[2]; p.z1 = p.bb[5];
      M.parts.push(p); M.partById.set(p.id, p);
    }
    if (!M.parts.length) throw new Error('فایل هیچ قطعه‌ای ندارد.');

    if (!M.grid.z.length) { M.grid.z = autoLevels(M.parts); M.autoLevels = true; }

    // bounds
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of M.parts) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p.bb[i]); b[i + 3] = Math.max(b[i + 3], p.bb[i + 3]); }
    M.bounds = b;

    // grid/level labels per part
    const gl = (x, y) => {
      const a = nearestIdx(M.grid.x, x), c = nearestIdx(M.grid.y, y);
      const xn = a.i >= 0 ? M.grid.x[a.i].n : '؟', yn = c.i >= 0 ? M.grid.y[c.i].n : '؟';
      const off = (a.i >= 0 && a.d > 1000) || (c.i >= 0 && c.d > 1000);
      return (off ? '~' : '') + xn + '-' + yn;
    };
    for (const p of M.parts) {
      p.g0 = gl(p.p0[0], p.p0[1]); p.g1 = gl(p.p1[0], p.p1[1]);
      p.gTxt = p.g0 === p.g1 ? p.g0 : p.g0 + ' ⇄ ' + p.g1;
      const l0 = nearestIdx(M.grid.z, p.z0), l1 = nearestIdx(M.grid.z, p.z1);
      p.lv0 = l0.i; p.lv1 = l1.i;
      p.lv0t = l0.i >= 0 ? M.grid.z[l0.i].n : '-'; p.lv1t = l1.i >= 0 ? M.grid.z[l1.i].n : '-';
    }

    // bolts
    M.partBolts = new Map(); M.conn = new Map();
    for (const r of (raw.bolts || [])) {
      const ps = (r.ps || []).filter(id => M.partById.has(id));
      if (!ps.length) continue;
      const bl = {
        id: r.id, d: +r.d || 0, l: +r.l || 0, s: r.s || '', std: r.std || '', n: +r.n || 1,
        nu: r.nu != null ? +r.nu : 1, wa: r.wa != null ? +r.wa : 2, ps, at: r.at && r.at.length >= 3 ? r.at.map(Number) : null
      };
      bl.key = bl.d + 'x' + bl.l;
      bl.label = 'M' + bl.d + (bl.l ? '×' + bl.l : '');
      M.bolts.push(bl);
      for (const id of ps) { if (!M.partBolts.has(id)) M.partBolts.set(id, []); M.partBolts.get(id).push(bl); }
      for (const a of ps) for (const c of ps) {
        if (a === c) continue;
        if (!M.conn.has(a)) M.conn.set(a, new Map());
        const m = M.conn.get(a); if (!m.has(c)) m.set(c, new Map());
        const mm = m.get(c); mm.set(bl.label, (mm.get(bl.label) || 0) + bl.n);
      }
    }
    // assemblies
    M.asm = new Map();
    for (const p of M.parts) { if (!p.a) continue; if (!M.asm.has(p.a)) M.asm.set(p.a, []); M.asm.get(p.a).push(p); }
    M.hasAsm = M.asm.size > 0;
    return M;
  };

  /* ---------- geometry (corners of the part box) ---------- */
  FS.corners = function (p) {
    if (p._c) return p._c;
    const bb = p.bb; let c = null;
    if (p.ob) { // oriented box exported by Tekla (exact for inclined parts)
      const o = p.ob, A = [o[3], o[4], o[5]], B = [o[6], o[7], o[8]];
      const C = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
      c = [];
      for (let i = 0; i < 8; i++) {
        const x = (i & 1) ? o[12] : o[9], y = (i & 2) ? o[13] : o[10], z = (i & 4) ? o[14] : o[11];
        c.push([o[0] + A[0] * x + B[0] * y + C[0] * z, o[1] + A[1] * x + B[1] * y + C[1] * z, o[2] + A[2] * x + B[2] * y + C[2] * z]);
      }
    }
    if (!c && p.ln && p.sec) {
      let dx = p.ln[3] - p.ln[0], dy = p.ln[4] - p.ln[1], dz = p.ln[5] - p.ln[2];
      const L = Math.hypot(dx, dy, dz);
      if (L > 1) {
        dx /= L; dy /= L; dz /= L;
        const aligned = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > 0.99939;
        if (!aligned) {
          let ux = 0, uy = 0, uz = 1;
          if (Math.abs(dz) > 0.95) { ux = 1; uz = 0; }
          let sx = dy * uz - dz * uy, sy = dz * ux - dx * uz, sz = dx * uy - dy * ux;
          const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
          const hx = sy * dz - sz * dy, hy = sz * dx - sx * dz, hz = sx * dy - sy * dx;
          const mx = (p.ln[0] + p.ln[3]) / 2, my = (p.ln[1] + p.ln[4]) / 2, mz = (p.ln[2] + p.ln[5]) / 2;
          const a = L / 2, w = p.sec[0] / 2, h = p.sec[1] / 2;
          c = [];
          for (let i = 0; i < 8; i++) {
            const s0 = (i & 1) ? 1 : -1, s1 = (i & 2) ? 1 : -1, s2 = (i & 4) ? 1 : -1;
            c.push([mx + dx * a * s0 + sx * w * s1 + hx * h * s2, my + dy * a * s0 + sy * w * s1 + hy * h * s2, mz + dz * a * s0 + sz * w * s1 + hz * h * s2]);
          }
        }
      }
    }
    if (!c) {
      c = [];
      for (let i = 0; i < 8; i++) c.push([(i & 1) ? bb[3] : bb[0], (i & 2) ? bb[4] : bb[1], (i & 4) ? bb[5] : bb[2]]);
    }
    p._c = c; return c;
  };


  /* installers only work with assemblies: collapse part rows into one row per assembly */
  FS.groupAsm = function (M, rows) {
    if (!M.hasAsm) return rows;
    const g = new Map();
    for (const r of rows) {
      if (!r.part.a || !M.asm.has(r.part.a)) continue;
      const key = r.part.a;
      if (!g.has(key)) g.set(key, { key, first: r, groups: 0, bolts: 0, main: null });
      const o = g.get(key); o.groups += r.groups || 0; o.bolts += r.bolts || 0;
      if (r.part.mp) o.main = r;
    }
    const out = [];
    for (const o of g.values()) {
      const src = o.main || o.first, A = o.key[0] === '#' ? null : FS.asmInfo(M, o.key);
      if (!A) { out.push(Object.assign({}, src, { groups: o.groups || src.groups, bolts: o.bolts || src.bolts })); continue; }
      const part = Object.assign({}, A.main, { m: A.mark, w: A.weight, gTxt: A.gTxt, lv0t: A.lv0t, lv1t: A.lv1t, ids: Array.from(A.ids), isAsm: true, count: A.count });
      const row = Object.assign({}, src, { part });
      if (src.groups !== undefined) { row.groups = o.groups; row.bolts = o.bolts; }
      out.push(row);
    }
    out.sort((x, y) => KIND_ORDER[x.part.k] - KIND_ORDER[y.part.k] || FS.natCmp(x.part.m, y.part.m));
    return out;
  };

  /* ---------- search: part ---------- */
  FS.findParts = function (M, q, limit) {
    limit = limit || 80;
    const s = norm(q); if (!s) return [];
    const out = [];
    for (const p of M.parts) {
      const m = norm(p.m);
      let sc = 0;
      if (m === s) sc = 100; else if (m.startsWith(s)) sc = 80; else if (m.includes(s)) sc = 60;
      else if (norm(p.a) === s) sc = 50;
      else if (norm(p.n).includes(s) || norm(p.p).includes(s)) sc = 20;
      else if (String(p.id) === s) sc = 90;
      if (sc) out.push({ p, sc });
    }
    out.sort((a, b) => b.sc - a.sc || FS.natCmp(a.p.m, b.p.m));
    return out.slice(0, limit).map(o => o.p);
  };


  /* ---------- assemblies ---------- */
  FS.asmInfo = function (M, mark) {
    const ps = M.asm.get(mark); if (!ps || !ps.length) return null;
    if (ps._i) return ps._i;
    const main = ps.find(p => p.mp) || ps.slice().sort((a, b) => b.w - a.w)[0];
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of ps) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p.bb[i]); bb[i + 3] = Math.max(bb[i + 3], p.bb[i + 3]); }
    const grids = Array.from(new Set(ps.map(p => p.gTxt))).sort(FS.natCmp);
    const lv = ps.map(p => p.lv0).filter(i => i >= 0), lh = ps.map(p => p.lv1).filter(i => i >= 0);
    const i0 = lv.length ? Math.min.apply(null, lv) : -1, i1 = lh.length ? Math.max.apply(null, lh) : -1;
    const sorted = ps.slice().sort((a, b) => (b === main) - (a === main) || FS.natCmp(a.m, b.m));
    const info = {
      mark, parts: sorted, main, count: ps.length, weight: ps.reduce((s, p) => s + p.w, 0), bb,
      cx: (bb[0] + bb[3]) / 2, cy: (bb[1] + bb[4]) / 2, cz: (bb[2] + bb[5]) / 2,
      grids, gTxt: grids.slice(0, 6).join(' ، ') + (grids.length > 6 ? ' …' : ''),
      lv0t: i0 >= 0 ? M.grid.z[i0].n : '-', lv1t: i1 >= 0 ? M.grid.z[i1].n : '-', ids: new Set(ps.map(p => p.id))
    };
    ps._i = info; return info;
  };
  FS.findAsms = function (M, q, limit) {
    const s = norm(q); if (!s) return [];
    const out = [];
    for (const [k, ps] of M.asm) {
      const m = norm(k); let sc = 0;
      if (m === s) sc = 100; else if (m.startsWith(s)) sc = 80; else if (m.includes(s)) sc = 60;
      if (sc) out.push({ k, sc, n: ps.length });
    }
    out.sort((a, b) => b.sc - a.sc || FS.natCmp(a.k, b.k));
    return out.slice(0, limit || 40).map(o => o.k);
  };
  FS.asmTree = function (M, mark) {
    const A = FS.asmInfo(M, mark); if (!A) return null;
    const bolts = new Map(), conn = new Map();
    for (const p of A.parts) {
      for (const b of (M.partBolts.get(p.id) || [])) {
        const k = b.label + '|' + b.s;
        if (!bolts.has(k)) bolts.set(k, { label: b.label, s: b.s, std: b.std, groups: new Set(), n: 0, nuts: 0, washers: 0 });
        const o = bolts.get(k);
        if (!o.groups.has(b.id)) { o.groups.add(b.id); o.n += b.n; o.nuts += b.n * b.nu; o.washers += b.n * b.wa; }
      }
      const cm = M.conn.get(p.id); if (!cm) continue;
      for (const [id, vm] of cm) {
        if (A.ids.has(id)) continue;
        const q = M.partById.get(id); if (!q || !q.a) continue;
        const key = q.a;
        if (!conn.has(key)) conn.set(key, { key, asm: q.a || '', parts: new Map(), via: new Map() });
        const c = conn.get(key); c.parts.set(q.id, q);
        for (const [label, n] of vm) c.via.set(label, (c.via.get(label) || 0) + n);
      }
    }
    const connected = Array.from(conn.values()).map(c => ({
      key: c.key, asm: c.asm, parts: Array.from(c.parts.values()).sort((a, b) => FS.natCmp(a.m, b.m)),
      via: Array.from(c.via.entries()).map(([label, n]) => ({ label, n }))
    })).sort((a, b) => FS.natCmp(a.key, b.key));
    const bl = Array.from(bolts.values()).map(o => ({ label: o.label, s: o.s, std: o.std, groups: o.groups.size, n: o.n, nuts: o.nuts, washers: o.washers })).sort((a, b) => FS.natCmp(a.label, b.label));
    return { asm: A, bolts: bl, connected, boltTotal: bl.reduce((s, x) => s + x.n, 0) };
  };


  /* find model assembly codes inside drawing text (PDF) and/or its file name; best candidate first.
     Codes may contain "/" (e.g. 4C1/1). "MATERIAL LIST FOR ASSEMBLY MK'D X" and "X No:1" mark the sheet's own assembly. */
  FS.findCodesInText = function (M, text, fname) {
    const keys = new Map(); for (const k of M.asm.keys()) keys.set(FS.normDigits(k).toLowerCase().replace(/\s+/g, ''), k);
    const toks = s => FS.normDigits(s).toLowerCase().split(/[^a-z0-9؀-ۿ\-_\/]+/).map(x => x.replace(/^[-_\/]+|[-_\/]+$/g, '')).filter(Boolean);
    const found = new Map();
    const add = (tok, o) => {
      const k = keys.get(tok); if (!k) return;
      const f = found.get(k) || { code: k, n: 0, fn: false, boost: 0, order: o.order }; f.n++; if (o.fn) f.fn = true; f.boost += o.boost || 0; found.set(k, f);
    };
    const stem = fname || '';
    toks(stem).forEach((t, i) => add(t, { fn: true, order: -100 + i })); add(FS.normDigits(stem).toLowerCase().replace(/\s+/g, ''), { fn: true, order: -100 });
    const tx = FS.normDigits(text || '').toLowerCase();
    toks(tx).forEach((t, i) => add(t, { order: i }));
    let m;
    const pats = [[/mk'?\s*d\.?\s+([^\s,;]+)/g, 50], [/assembly\s*(?:no\.?|mark|pos\.?)?\s*[:=]?\s+([^\s,;]+)/g, 8], [/([^\s,;]+)\s+no\s*:\s*\d+/g, 20]];
    for (const [re, w] of pats) while ((m = re.exec(tx))) { const t = m[1].replace(/^[-_\/:]+|[-_\/:.]+$/g, ''); const f = found.get(keys.get(t)); if (f) f.boost += w; }
    let list = Array.from(found.values());
    const nonNum = list.filter(o => !/^\d+$/.test(o.code) || o.fn);
    if (nonNum.length) list = nonNum;
    list.sort((x, y) => (y.fn - x.fn) || (y.boost - x.boost) || (x.order - y.order) || (y.n - x.n) || FS.natCmp(x.code, y.code));
    return list;
  };

  /* ---------- tree report for one part ---------- */
  FS.partTree = function (M, p) {
    const bolts = new Map();
    for (const b of (M.partBolts.get(p.id) || [])) {
      const k = b.label + '|' + b.s;
      if (!bolts.has(k)) bolts.set(k, { label: b.label, s: b.s, std: b.std, groups: 0, n: 0, nuts: 0, washers: 0 });
      const o = bolts.get(k); o.groups++; o.n += b.n; o.nuts += b.n * b.nu; o.washers += b.n * b.wa;
    }
    const connected = [];
    const cm = M.conn.get(p.id);
    if (cm) for (const [id, vm] of cm) {
      const q = M.partById.get(id); if (!q) continue;
      connected.push({ part: q, via: Array.from(vm.entries()).map(([label, n]) => ({ label, n })) });
    }
    connected.sort((a, b) => FS.natCmp(a.part.m, b.part.m));
    const sameAsm = p.a && M.asm.get(p.a) ? M.asm.get(p.a).filter(q => q.id !== p.id).sort((a, b) => FS.natCmp(a.m, b.m)) : [];
    return {
      part: p, bolts: Array.from(bolts.values()).sort((a, b) => FS.natCmp(a.label, b.label)),
      connected, sameAsm,
      boltTotal: Array.from(bolts.values()).reduce((s, x) => s + x.n, 0)
    };
  };

  /* ---------- grid search ---------- */
  FS.parseGridKey = function (M, q) {
    const toks = FS.normDigits(q).replace(/[،,;/\\\-–—_+×x*]/gi, ' ').trim().split(/\s+/).filter(Boolean);
    const lines = []; const used = {};
    for (const t of toks.slice(0, 2)) {
      const tl = t.toLowerCase();
      const fx = M.grid.x.find(g => g.n.toLowerCase() === tl), fy = M.grid.y.find(g => g.n.toLowerCase() === tl);
      let L = null;
      if (fx && fy) L = !used.x ? { axis: 'x', g: fx } : { axis: 'y', g: fy };
      else if (fx) L = { axis: 'x', g: fx }; else if (fy) L = { axis: 'y', g: fy };
      if (L && !used[L.axis]) { used[L.axis] = true; lines.push({ axis: L.axis, n: L.g.n, v: L.g.v }); }
    }
    return lines.length ? lines : null;
  };

  FS.gridReport = function (M, q, tol) {
    tol = tol || 300;
    const lines = FS.parseGridKey(M, q);
    if (!lines) return { ok: false, rows: [], lines: [] };
    const idx = l => (l.axis === 'x' ? 0 : 1);
    const near = (pt, l) => Math.abs(pt[idx(l)] - l.v) <= tol;
    let rows = [];
    for (const p of M.parts) {
      const a = lines.every(l => near(p.p0, l)), b = lines.every(l => near(p.p1, l));
      if (!a && !b) continue;
      rows.push({ part: p, role: lines.length === 2 ? 'روی تقاطع' : (a && b ? 'روی گرید' : 'انتهای قطعه') });
    }
    rows = FS.groupAsm(M, rows);
    const title = lines.map(l => l.n).join(' - ');
    return { ok: true, title, lines, rows, totals: totalsOf(rows.map(r => r.part)) };
  };

  /* ---------- level search ---------- */
  FS.levelReport = function (M, idx, tol) {
    tol = tol || 150;
    const L = M.grid.z[idx]; if (!L) return { ok: false, rows: [] };
    // a level = one floor: only HORIZONTAL members count (main/secondary beams, horizontal braces/angles).
    // Columns, inclined braces and loose plates play no role in a level.
    let rows = [];
    for (const p of M.parts) {
      if (p.k !== 'beam') continue;
      if (M.hasAsm && !(p.a && M.asm.has(p.a) && (FS.asmInfo(M, p.a).main === p))) continue; // one row per assembly (its main member)
      const up = Math.abs(p.z1 - L.v) <= tol, dn = Math.abs(p.z0 - L.v) <= tol || p.lv1 === idx && !up;
      if (!up && !dn && p.lv1 !== idx) continue;
      rows.push({ part: p, role: up ? 'روی تراز (بالای تیر)' : (Math.abs(p.z0 - L.v) <= tol ? 'زیر تیر' : 'نزدیک‌ترین تراز') });
    }
    rows = FS.groupAsm(M, rows);
    return { ok: true, title: L.n, level: L, rows, totals: totalsOf(rows.map(r => r.part)) };
  };


  function totalsOf(parts) {
    return { count: parts.length, weight: parts.reduce((s, p) => s + p.w, 0), length: parts.reduce((s, p) => s + p.l, 0) };
  }
  FS.totalsOf = totalsOf;

  /* ---------- bolt search ---------- */
  FS.boltTypes = function (M) {
    const map = new Map();
    for (const b of M.bolts) {
      if (!map.has(b.key)) map.set(b.key, { key: b.key, d: b.d, l: b.l, label: b.label, grades: new Set(), groups: 0, bolts: 0, nuts: 0, washers: 0, parts: new Set() });
      const t = map.get(b.key); if (b.s) t.grades.add(b.s);
      t.groups++; t.bolts += b.n; t.nuts += b.n * b.nu; t.washers += b.n * b.wa; b.ps.forEach(id => t.parts.add(id));
    }
    return Array.from(map.values()).sort((a, b) => a.d - b.d || a.l - b.l);
  };

  FS.matchBoltTypes = function (M, q) {
    const types = FS.boltTypes(M);
    const nums = (FS.normDigits(q).match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nums.length) return types;
    if (nums.length === 1) return types.filter(t => t.d === nums[0] || t.l === nums[0]);
    return types.filter(t => t.d === nums[0] && t.l === nums[1]);
  };

  FS.boltReport = function (M, key) {
    const types = FS.boltTypes(M); const t = types.find(x => x.key === key);
    if (!t) return { ok: false, rows: [] };
    const per = new Map(); const markers = [];
    for (const b of M.bolts) {
      if (b.key !== key) continue;
      if (b.at) markers.push([b.at[0], b.at[1], b.at[2], +b.d || 20]);
      for (const id of b.ps) {
        if (!per.has(id)) per.set(id, { part: M.partById.get(id), groups: 0, bolts: 0 });
        const o = per.get(id); o.groups++; o.bolts += b.n;
      }
    }
    const rows = FS.groupAsm(M, Array.from(per.values()).sort((a, b) => KIND_ORDER[a.part.k] - KIND_ORDER[b.part.k] || FS.natCmp(a.part.m, b.part.m)));
    return { ok: true, type: t, title: t.label + (t.grades.size ? ' (' + Array.from(t.grades).join('، ') + ')' : ''), rows, markers };
  };

  /* ---------- compact export (small file for mobile) ---------- */
  FS.compact = function (M) {
    const r = v => Math.round(v);
    const parts = M.parts.map(p => {
      const o = { id: p.id, m: p.m, n: p.n, p: p.p, mt: p.mt, w: Math.round(p.w * 10) / 10, l: r(p.l), bb: p.bb.map(r) };
      if (p.a && p.a !== p.m) o.a = p.a;
      if (p.c) o.c = p.c;
      if (p.ln) o.ln = p.ln.map(r);
      if (p.sec) o.sec = p.sec.map(r);
      if (p.ob) o.ob = p.ob.map((v, i) => Math.round(v * (i >= 3 && i <= 8 ? 10000 : 1)) / (i >= 3 && i <= 8 ? 10000 : 1));
      return o;
    });
    const bolts = M.bolts.map(b => { const o = { id: b.id, d: b.d, l: b.l, n: b.n, ps: b.ps }; if (b.s) o.s = b.s; if (b.std) o.std = b.std; if (b.nu !== 1) o.nu = b.nu; if (b.wa !== 2) o.wa = b.wa; if (b.at) o.at = b.at.map(r); return o; });
    const g = a => a.map(x => ({ n: x.n, v: r(x.v) }));
    return { fmt: 'fabsteel', ver: 1, prj: M.prj, grid: { x: g(M.grid.x), y: g(M.grid.y), z: M.autoLevels ? [] : g(M.grid.z) }, parts, bolts };
  };

  /* ---------- demo model (so the viewer can be tested without Tekla) ---------- */
  FS.demo = function () {
    const X = [0, 6000, 12000], Y = [0, 5000, 10000], Z = [0, 4000, 8000];
    const gx = ['A', 'B', 'C'], gy = ['1', '2', '3'];
    const parts = [], bolts = []; let id = 1000, bid = 5000, nc = 100, nb = 200, nbr = 300, npl = 400, nbp = 500;
    const col = (x, y, z0, z1) => { const m = 'C' + (++nc); parts.push({ id: ++id, m, a: m, n: 'COLUMN', p: 'HEA300', mt: 'S235JR', w: +(88.3 * (z1 - z0) / 1000).toFixed(1), l: z1 - z0, c: '1', bb: [x - 145, y - 150, z0, x + 145, y + 150, z1], ln: [x, y, z0, x, y, z1], sec: [300, 290] }); return id; };
    const beam = (x0, y0, x1, y1, z, h, w, pr, kg) => { const m = 'B' + (++nb); const L = Math.hypot(x1 - x0, y1 - y0); parts.push({ id: ++id, m, a: m, n: 'BEAM', p: pr, mt: 'S235JR', w: +(kg * L / 1000).toFixed(1), l: Math.round(L), c: '2', bb: [Math.min(x0, x1) - (y0 === y1 ? 0 : w / 2), Math.min(y0, y1) - (x0 === x1 ? 0 : w / 2), z - h, Math.max(x0, x1) + (y0 === y1 ? 0 : w / 2), Math.max(y0, y1) + (x0 === x1 ? 0 : w / 2), z], ln: [x0, y0, z - h / 2, x1, y1, z - h / 2], sec: [w, h] }); return id; };
    const plate = (cx, cy, cz, sx, sy, sz, name, mark) => { const m = mark + (++npl); parts.push({ id: ++id, m, a: m, n: name, p: 'PL' + Math.min(sx, sy, sz), mt: 'S235JR', w: +(sx * sy * sz * 7.85e-6).toFixed(1), l: Math.max(sx, sy, sz), c: '10', bb: [cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2] }); return id; };
    const colIds = {};
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 2; k++) colIds[i + '_' + j + '_' + k] = col(X[i], Y[j], Z[k] + (k === 0 ? 25 : 0), Z[k + 1]);
      const bp = plate(X[i], Y[j], 12, 400, 400, 25, 'BASEPLATE', 'BP');
      bolts.push({ id: ++bid, d: 24, l: 90, s: '8.8', std: 'DIN 7990', n: 4, nu: 1, wa: 2, ps: [bp, colIds[i + '_' + j + '_0']], at: [X[i], Y[j], 25] });
    }
    for (let k = 1; k <= 2; k++) {
      const z = Z[k];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
        const b = beam(X[i] + 145, Y[j], X[i + 1] - 145, Y[j], z, 360, 170, 'IPE360', 57.1);
        for (const [ci, ex] of [[i, X[i] + 145], [i + 1, X[i + 1] - 145]]) {
          const ep = plate(ex + (ci === i ? 8 : -8), Y[j], z - 180, 16, 170, 340, 'ENDPLATE', 'PL');
          bolts.push({ id: ++bid, d: 20, l: 70, s: '8.8', std: 'DIN 6914', n: 8, nu: 1, wa: 2, ps: [b, ep, colIds[ci + '_' + j + '_' + (k - 1)]], at: [ex, Y[j], z - 180] });
        }
      }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const b = beam(X[i], Y[j] + 150, X[i], Y[j + 1] - 150, z - 30, 300, 150, 'IPE300', 42.2);
        for (const [cj, ey] of [[j, Y[j] + 150], [j + 1, Y[j + 1] - 150]]) {
          const cl = plate(X[i], ey + (cj === j ? 8 : -8), z - 180, 150, 16, 240, 'CLEAT', 'PL');
          bolts.push({ id: ++bid, d: 16, l: 50, s: '8.8', std: 'DIN 933', n: 4, nu: 1, wa: 2, ps: [b, cl, colIds[i + '_' + cj + '_' + (k - 1)]], at: [X[i], ey, z - 180] });
        }
      }
    }
    for (let k = 0; k < 2; k++) for (const [ia, ib] of [[0, 1], [1, 2]]) {
      const m = 'BR' + (++nbr); const x0 = X[ia] + 150, x1 = X[ib] - 150, z0 = Z[k] + 300, z1 = Z[k + 1] - 400;
      parts.push({ id: ++id, m, a: m, n: 'BRACE', p: 'L100*10', mt: 'S235JR', w: +(15.1 * Math.hypot(x1 - x0, z1 - z0) / 1000).toFixed(1), l: Math.round(Math.hypot(x1 - x0, z1 - z0)), c: '3', bb: [Math.min(x0, x1), -50, Math.min(z0, z1), Math.max(x0, x1), 50, Math.max(z0, z1)], ln: [x0, 0, z0, x1, 0, z1], sec: [100, 100] });
      bolts.push({ id: ++bid, d: 16, l: 50, s: '8.8', std: 'DIN 933', n: 6, nu: 1, wa: 2, ps: [id, colIds[ia + '_0_' + k]], at: [x0, 0, z0] });
    }
    return {
      fmt: 'fabsteel', ver: 1,
      prj: { name: 'نمونه آزمایشی (Demo)', no: 'DEMO-01', by: 'FabSteel', date: new Date().toISOString().slice(0, 10), tekla: '2024', unit: 'mm' },
      grid: { x: X.map((v, i) => ({ n: gx[i], v })), y: Y.map((v, i) => ({ n: gy[i], v })), z: Z.map(v => ({ n: FS.fmtLevel(v), v })) },
      parts, bolts
    };
  };

  /* ---------- file decoding ---------- */
  FS.bytesToJson = async function (buf) {
    const u = new Uint8Array(buf);
    let text;
    if (u.length > 2 && u[0] === 0x1f && u[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('مرورگر/وب‌ویو از فشرده‌سازی gzip پشتیبانی نمی‌کند.');
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([u]).stream().pipeThrough(ds);
      text = await new Response(stream).text();
    } else text = new TextDecoder('utf-8').decode(u);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
  };
  FS.jsonToGzip = async function (obj) {
    const txt = JSON.stringify(obj);
    const data = new TextEncoder().encode(txt);
    if (typeof CompressionStream === 'undefined') return { bytes: data, gz: false };
    const cs = new CompressionStream('gzip');
    const stream = new Blob([data]).stream().pipeThrough(cs);
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), gz: true, raw: data.length };
  };

  root.FSCore = FS;
  if (typeof module !== 'undefined' && module.exports) module.exports = FS;
})(typeof window !== 'undefined' ? window : globalThis);
