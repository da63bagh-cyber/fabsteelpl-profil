/* FabSteel Structural Installer — UI. Same code runs in browser, Electron (Windows) and Android WebView. */
(function () {
  'use strict';
  const FS = window.FSCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d });

  let M = null, V = null, fileName = '', fileSize = 0;
  let sec = 'locate', selId = null, selAsm = null;
  const S = { locate: { q: '' }, tree: { q: '' }, grid: { q: '', rep: null }, level: { q: '', idx: -1, rep: null }, bolt: { q: '', key: null, rep: null } };
  let set = { gridTol: 300, lvlTol: 150 };
  try { const x = JSON.parse(localStorage.getItem('fabsteel.set') || 'null'); if (x) set = Object.assign(set, x); } catch (e) { }

  const TITLES = { locate: 'موقعیت اسمبلی در سازه', tree: 'مشخصات اسمبلی (درختی)', grid: 'جستجوی گرید', level: 'جستجوی تراز', bolt: 'جستجوی پیچ و مهره' };
  const PLACEH = { locate: 'علامت اسمبلی، مثلاً B12', tree: 'علامت اسمبلی، مثلاً B12', grid: 'گرید: A یا 1 یا A-1', level: 'تراز: مثلاً +4.000 یا 4', bolt: 'پیچ: M20 یا 20x70' };

  /* ---------- toast ---------- */
  let tt = 0;
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block'; clearTimeout(tt); tt = setTimeout(() => t.style.display = 'none', err ? 6000 : 2600); }

  /* ---------- view ---------- */
  function CNT() { return M && M.hasAsm ? 'تعداد اسمبلی' : 'تعداد قطعه'; }
  function idsOf(rows) { const s = new Set(); for (const r of rows) { if (r.part.ids) r.part.ids.forEach(i => s.add(i)); else s.add(r.part.id); } return s; }
  function partOf(id) { return M && M.partById.get(id); }
  function applyView() {
    if (!V || !M) return;
    let hl = null, secSet = null, markers = [], lines = [];
    if (selAsm && (sec === 'locate' || sec === 'tree')) {
      const A = FS.asmInfo(M, selAsm); hl = A.ids;
      secSet = null; /* only the searched assembly is coloured; everything else stays glass */
    } else if (sec === 'tree' && selId != null && partOf(selId)) secSet = new Set(FS.partTree(M, partOf(selId)).connected.map(c => c.part.id));
    if (sec === 'grid' && S.grid.rep && S.grid.rep.ok) { hl = S.grid.vis || idsOf(S.grid.rep.rows); lines = S.grid.rep.lines.map(l => ({ axis: l.axis, v: l.v })); }
    if (sec === 'level' && S.level.rep && S.level.rep.ok) { hl = S.level.vis || idsOf(S.level.rep.rows); lines = [{ axis: 'z', v: S.level.rep.level.v }]; }
    if (sec === 'bolt' && S.bolt.rep && S.bolt.rep.ok) { hl = S.bolt.vis || idsOf(S.bolt.rep.rows); markers = S.bolt.rep.markers; if (!hl) hl = new Set(); }
    const Aa = selAsm && (sec === 'locate' || sec === 'tree' || true) ? FS.asmInfo(M, selAsm) : null;
    V.setState({ hlSoft: sec === 'bolt', hl, sel: selId, sec: secSet, markers, lines, label: Aa ? Aa.mark : null, labelPos: Aa ? [Aa.cx, Aa.cy, Aa.bb[5]] : null });
  }
  function selectAsm(k, zoom) {
    const A = FS.asmInfo(M, k); if (!A) return;
    selAsm = k; selId = A.main.id;
    if (zoom !== false) V.focusParts(A.parts);
    renderBody(); applyView();
  }
  function asmCard(A, actions) {
    const kv = [['پروفیل اصلی', A.main.p || '-'], ['وزن کل', num(A.weight, 1) + ' kg'], ['گرید', A.gTxt], ['تراز پایین', A.lv0t], ['تراز بالا', A.lv1t],
      ['مختصات مرکز (m)', [A.cx, A.cy, A.cz].map(v => (v / 1000).toFixed(3)).join(' , ')]];
    return `<div class="card"><h3><span>📦 <span class="mark">${esc(A.mark)}</span> <span class="tag">اسمبلی</span></span></h3>
      <div class="kv">${kv.map(x => `<span>${x[0]}</span><span>${esc(x[1])}</span>`).join('')}</div>
      ${actions ? `<div class="row-actions"><button class="btn" data-act="zoomAsm">🎯 زوم</button><button class="btn sec" data-act="treeAsm" data-k="${esc(A.mark)}">🌳 درختی</button><button class="btn pdf" data-act="pdf">PDF</button></div>` : ''}</div>`;
  }
  function asmTreeHtml(t, openAll, interactive) {
    const A = t.asm, o = openAll ? ' open' : '';
    const lk = q => interactive ? `<span class="lk" data-act="pickIn" data-id="${q.id}">${esc(q.m)}</span>` : `<b dir="ltr">${esc(q.m)}</b>`;
    const lkA = c => c.asm && interactive ? `<span class="lk" data-act="asm" data-k="${esc(c.asm)}">📦 ${esc(c.asm)}</span>` : `<b dir="ltr">${c.asm ? '📦 ' + esc(c.asm) : esc(c.parts[0].m)}</b>`;
    const boltLis = t.bolts.map(b => `<li><span class="tag">${esc(b.label)}${b.s ? ' · ' + esc(b.s) : ''}</span> — ${b.n} عدد پیچ، ${b.nuts} مهره، ${b.washers} واشر <span class="muted">(${b.groups} اتصال)</span></li>`).join('') || '<li class="muted">پیچی ثبت نشده</li>';
    const conLis = t.connected.map(c => `<details class="tr"${o}><summary>${lkA(c)} <span class="muted">${esc(c.parts[0] && FS.asmInfo(M, c.asm) ? FS.asmInfo(M, c.asm).main.p : '')}</span></summary><ul>
        <li>اتصال با: ${c.via.map(v => `<span class="tag">${esc(v.label)}</span> × ${v.n}`).join(' ، ')}</li></ul></details>`).join('') || '<div class="muted" style="padding:4px 8px">اسمبلی/قطعه‌ی پیچ‌شده‌ای نیست</div>';
    const partLis = A.parts.map(q => `<li>${lk(q)} <span class="muted">${esc(q.n)} · ${esc(q.p)} · ${num(q.w, 1)} kg${q === A.main ? ' · قطعه‌ی اصلی' : ''}</span></li>`).join('');
    return `<details class="tr root"${o} open><summary><span class="mark">📦 ${esc(A.mark)}</span> <span class="muted">${num(A.weight, 1)} kg · ${esc(A.main.p)}</span></summary>
      <details class="tr"${o} open><summary>تراز (Level)</summary><ul><li>سطح پایین: <b dir="ltr">${esc(A.lv0t)}</b></li><li>سطح بالا: <b dir="ltr">${esc(A.lv1t)}</b></li></ul></details>
      <details class="tr"${o} open><summary>گرید (Grid)</summary><ul><li>موقعیت: <b dir="ltr">${esc(A.gTxt)}</b></li></ul></details>
      <details class="tr"${o} open><summary>پیچ و مهره (${t.boltTotal} عدد)</summary><ul>${boltLis}</ul></details>
      <details class="tr"${o} open><summary>اسمبلی‌ها / قطعات متصل (${t.connected.length})</summary>${conLis}</details>
    </details>`;
  }
  function selectPart(id, zoom) {
    { const q0 = partOf(id); if (M.hasAsm && q0 && q0.a && M.asm.has(q0.a) && q0.a !== selAsm) return selectAsm(q0.a, zoom); }
    const pp = partOf(id); if (!(selAsm && pp && pp.a === selAsm)) selAsm = null;
    selId = id; const p = partOf(id);
    if (zoom !== false && p) V.focusParts([p]);
    renderBody(); applyView();
  }
  function clearSel() { selId = null; selAsm = null; renderBody(); applyView(); }

  /* ---------- html builders ---------- */
  function infoCard(p, actions) {
    const kv = [
      ['نام', p.n || '-'], ['پروفیل', p.p || '-'], ['متریال', p.mt || '-'], ['وزن', num(p.w, 1) + ' kg'], ['طول', num(p.l) + ' mm'],
      ['گرید', p.gTxt], ['تراز پایین', p.lv0t], ['تراز بالا', p.lv1t],
      ['مختصات مرکز (m)', [p.cx, p.cy, p.cz].map(v => (v / 1000).toFixed(3)).join(' , ')]
    ];
    return `<div class="card"><h3><span><span class="mark">${esc(p.m)}</span> <span class="tag">${esc(FS.KIND_FA[p.k])}</span></span></h3>
      <div class="kv">${kv.map(x => `<span>${x[0]}</span><span>${esc(x[1])}</span>`).join('')}</div>
      ${actions ? `<div class="row-actions"><button class="btn" data-act="zoom" data-id="${p.id}">🎯 زوم</button><button class="btn sec" data-act="totree" data-id="${p.id}">🌳 درختی</button>${p.a && M.asm.has(p.a) ? `<button class="btn sec" data-act="asm" data-k="${esc(p.a)}">📦 اسمبلی ${esc(p.a)}</button>` : ''}<button class="btn pdf" data-act="pdf">PDF</button></div>` : ''}</div>`;
  }
  const COLS = {
    idx: { h: '#', f: (r, i) => i + 1 },
    mark: { h: 'علامت', l: 1, ft: 'text', f: r => `<b>${esc(r.part.m)}</b>` },
    name: { h: 'نام', cls: 'hide-s', ft: 'sel', f: r => esc(r.part.n) },
    prof: { h: 'پروفیل', l: 1, ft: 'sel', f: r => esc(r.part.p) },
    len: { h: 'طول mm', l: 1, cls: 'hide-s', ft: 'num', f: r => num(r.part.l) },
    w: { h: 'وزن kg', l: 1, ft: 'num', f: r => num(r.part.w, 1) },
    grid: { h: 'گرید', l: 1, ft: 'text', f: r => esc(r.part.gTxt) },
    lvl: { h: 'تراز', l: 1, ft: 'text', f: r => esc(r.part.lv0t) + ' → ' + esc(r.part.lv1t) },
    role: { h: 'موقعیت', ft: 'sel', f: r => esc(r.role || '') },
    grp: { h: 'اتصال', l: 1, ft: 'num', f: r => r.groups },
    bn: { h: 'تعداد پیچ', l: 1, ft: 'num', f: r => r.bolts }
  };
  Object.keys(COLS).forEach(k => COLS[k].key = k);

  /* ----- report tables: frozen header + per-column filters ----- */
  const TBL = {};
  const plain = html => String(html).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  function table(rows, cols, withClick, key, id) {
    const T = key ? (TBL[key] = { rows, cols, texts: rows.map((r, i) => cols.map(c => plain(c.f(r, i)))), id }) : null;
    let head = `<tr>${cols.map(c => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr>`;
    if (T) head += `<tr class="fr">${cols.map((c, ci) => {
      if (!c.ft) return `<th class="${c.cls || ''}"></th>`;
      if (c.ft === 'sel') { const vals = Array.from(new Set(T.texts.map(t => t[ci]))).sort(FS.natCmp); return `<th class="${c.cls || ''}"><select class="fi" data-c="${ci}"><option value="">همه</option>${vals.map(v => `<option>${esc(v)}</option>`).join('')}</select></th>`; }
      return `<th class="${c.cls || ''}"><input class="fi" data-c="${ci}" placeholder="${c.ft === 'num' ? '>100' : 'فیلتر'}"></th>`;
    }).join('')}</tr>`;
    return `<table class="${T ? 'ftbl' : ''}"${T ? ` data-key="${key}"` : ''}><thead>${head}</thead><tbody>${rows.map((r, i) =>
      `<tr class="rw ${r.part.id === selId ? 'on' : ''}" data-i="${i}" ${withClick ? `data-act="pick" data-id="${r.part.id}"` : ''}>${cols.map(c => `<td class="${c.cls || ''} ${c.l ? 'l' : ''}">${c.f(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function fbar() { return '<div class="fcnt" id="fcnt"><span class="muted"></span><button class="btn sec" id="fclear" style="display:none;padding:4px 10px">✕ حذف فیلترها</button></div>'; }
  function matchCell(ft, text, v) {
    v = FS.normDigits(v).trim(); if (!v) return true;
    const tx = FS.normDigits(text);
    if (ft === 'sel') return tx === v;
    if (ft === 'num') {
      const n = parseFloat(tx.replace(/,/g, '')); if (isNaN(n)) return false; let m;
      if ((m = v.match(/^(>=|<=|>|<|=)\s*([\d.]+)$/))) { const x = +m[2]; return m[1] === '>' ? n > x : m[1] === '<' ? n < x : m[1] === '>=' ? n >= x : m[1] === '<=' ? n <= x : n === x; }
      if ((m = v.match(/^([\d.]+)\s*-\s*([\d.]+)$/))) return n >= +m[1] && n <= +m[2];
      const x = parseFloat(v); return !isNaN(x) && Math.abs(n - x) < 0.5;
    }
    return tx.toLowerCase().includes(v.toLowerCase());
  }
  function passIdx(key) {
    const T = TBL[key]; if (!T) return []; const f = S[key].flt || {};
    return T.rows.map((r, i) => i).filter(i => Object.keys(f).every(c => matchCell(T.cols[c].ft, T.texts[i][c], f[c])));
  }
  const filteredRows = key => (TBL[key] ? passIdx(key).map(i => TBL[key].rows[i]) : []);
  function filterDesc(key) { const T = TBL[key], f = (S[key] && S[key].flt) || {}; if (!T) return ''; return Object.keys(f).filter(c => f[c]).map(c => T.cols[c].h + ': ' + f[c]).join('  ·  '); }
  function applyFilter(key, t) {
    const T = TBL[key], st = S[key]; if (!T) return;
    const ok = new Set(passIdx(key)), active = !!filterDesc(key); let n = 0;
    $$('tbody tr', t).forEach(tr => { const i = +tr.dataset.i, show = ok.has(i); tr.style.display = show ? '' : 'none'; if (show) { n++; tr.cells[0].textContent = n; } });
    const rows = Array.from(ok).map(i => T.rows[i]);
    const cn = $('#fcnt span'); if (cn) cn.textContent = active ? `نمایش ${n} از ${T.rows.length} ردیف (فیلتر فعال)` : `${T.rows.length} ردیف`;
    const clr = $('#fclear'); if (clr) clr.style.display = active ? '' : 'none';
    if (key !== 'bolt') { const tt = FS.totalsOf(rows.map(r => r.part)), a = $('#sumC'), b = $('#sumW'); if (a) a.textContent = tt.count; if (b) b.textContent = num(tt.weight, 1) + ' kg'; }
    st.vis = active ? idsOf(rows) : null;
    applyView();
  }
  function fixSticky(t) {
    const mob = window.matchMedia('(max-width:980px)').matches, base = mob ? ($('#nav').offsetHeight || 0) : -(parseFloat(getComputedStyle($('#panelBody')).paddingTop) || 0);
    const r1 = t.tHead.rows[0], r2 = t.tHead.rows[1];
    Array.from(r1.cells).forEach(th => th.style.top = base + 'px');
    if (r2) { const h = r1.offsetHeight; Array.from(r2.cells).forEach(th => th.style.top = (base + h) + 'px'); }
  }
  function wireTable() {
    const t = $('#panelBody table.ftbl'); if (!t) return;
    const key = t.dataset.key, T = TBL[key], st = S[key];
    if (st.fltId !== T.id) { st.flt = {}; st.fltId = T.id; }
    $$('.fi', t).forEach(el => { const c = el.dataset.c; if (st.flt[c]) el.value = st.flt[c]; const h = () => { st.flt[c] = el.value; applyFilter(key, t); }; el.addEventListener('input', h); el.addEventListener('change', h); });
    const clr = $('#fclear'); if (clr) clr.addEventListener('click', () => { st.flt = {}; $$('.fi', t).forEach(el => el.value = ''); applyFilter(key, t); });
    fixSticky(t); applyFilter(key, t);
  }
  function sumBox(items) { return `<div class="sum">${items.map(x => `<div>${x[0]}: <b${x[2] ? ` id="${x[2]}"` : ''}>${x[1]}</b></div>`).join('')}</div>`; }
  function treeHtml(t, openAll, interactive) {
    const p = t.part, o = openAll ? ' open' : '';
    const lk = q => interactive ? `<span class="lk" data-act="pick" data-id="${q.id}">${esc(q.m)}</span>` : `<b dir="ltr">${esc(q.m)}</b>`;
    const boltLis = t.bolts.map(b => `<li><span class="tag">${esc(b.label)}${b.s ? ' · ' + esc(b.s) : ''}</span> — ${b.n} عدد پیچ، ${b.nuts} مهره، ${b.washers} واشر <span class="muted">(${b.groups} اتصال)</span></li>`).join('') || '<li class="muted">پیچی ثبت نشده</li>';
    const conLis = t.connected.map(c => `<details class="tr"${o}><summary>${lk(c.part)} <span class="muted">${esc(c.part.p)} · ${esc(FS.KIND_FA[c.part.k])}</span></summary><ul>
        <li>گرید: <span dir="ltr">${esc(c.part.gTxt)}</span> · تراز: <span dir="ltr">${esc(c.part.lv0t)} → ${esc(c.part.lv1t)}</span></li>
        <li>اتصال با: ${c.via.map(v => `<span class="tag">${esc(v.label)}</span> × ${v.n}`).join(' ، ')}</li></ul></details>`).join('') || '<div class="muted" style="padding:4px 8px">قطعه‌ی پیچ‌شده‌ای نیست</div>';
    const asmLis = t.sameAsm.map(q => `<li>${lk(q)} <span class="muted">${esc(q.n)} · ${esc(q.p)}</span></li>`).join('');
    return `<details class="tr root"${o} open><summary><span class="mark">${esc(p.m)}</span> <span class="muted">${esc(p.p)} · ${esc(p.mt)} · ${num(p.w, 1)} kg · ${num(p.l)} mm</span></summary>
      <details class="tr"${o} open><summary>تراز (Level)</summary><ul><li>سطح پایین: <b dir="ltr">${esc(p.lv0t)}</b></li><li>سطح بالا: <b dir="ltr">${esc(p.lv1t)}</b></li></ul></details>
      <details class="tr"${o} open><summary>گرید (Grid)</summary><ul><li>موقعیت: <b dir="ltr">${esc(p.gTxt)}</b></li></ul></details>
      <details class="tr"${o} open><summary>پیچ و مهره (${t.boltTotal} عدد)</summary><ul>${boltLis}</ul></details>
      <details class="tr"${o} open><summary>لوزپارت / قطعات متصل (${t.connected.length})</summary>${conLis}</details>
      ${t.sameAsm.length ? `<details class="tr"${o}><summary>قطعات هم‌مونتاژ (${t.sameAsm.length})</summary><ul>${asmLis}</ul></details>` : ''}
    </details>`;
  }

  /* ---------- panel ---------- */
  function renderHead() {
    const h = $('#panelHead');
    const showSearch = true;
    const drw = sec === 'locate' || sec === 'tree';
    h.innerHTML = `<h2>${TITLES[sec]}</h2>${drw ? '<button type="button" class="btn sec" id="btnDrw" style="width:100%;margin-bottom:8px">📐 جستجو با نقشه اسمبلی (PDF)</button><input type="file" id="drwFile" accept=".pdf,application/pdf" hidden>' : ''}${showSearch ? `<form class="search" autocomplete="off"><input id="q" type="search" inputmode="text" placeholder="${PLACEH[sec]}" value="${esc(S[sec].q)}"><button class="btn" type="submit">جستجو</button></form>` : ''}`;
    if (drw) {
      $('#btnDrw', h).addEventListener('click', () => { const fi = $('#drwFile', h); fi.value = ''; fi.click(); });
      $('#drwFile', h).addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) searchDrawing(f); });
    }
    const q = $('#q', h), f = $('form', h);
    q.addEventListener('input', () => onQuery(q.value, false));
    f.addEventListener('submit', e => { e.preventDefault(); onQuery(q.value, true); q.blur(); });
  }
  /* read an assembly drawing (PDF): find assembly codes of the model inside it */
  async function searchDrawing(file) {
    if (!M) return toast('ابتدا فایل مدل را باز کنید.', true);
    if (!M.hasAsm) return toast('این مدل اسمبلی ندارد.', true);
    toast('در حال خواندن نقشه…');
    const stem = file.name.replace(/\.[^.]*$/, '');
    let text = '', note = '';
    try { text = await window.PdfScan.extractText(await file.arrayBuffer()); }
    catch (e) { note = e.message === 'encrypted' ? 'PDF قفل‌دار است' : e.message === 'not-pdf' ? 'فایل PDF نیست' : 'متن PDF قابل خواندن نیست'; }
    const list = FS.findCodesInText(M, text, stem);
    if (!list.length) return toast('کد اسمبلی‌ای از این نقشه پیدا نشد' + (note ? ' (' + note + ')' : '') + '. نام فایل را برابر کد اسمبلی بگذارید یا کد را تایپ کنید.', true);
    const codes = list.slice(0, 60).map(o => o.code);
    S[sec].q = codes[0]; S[sec].asms = codes; S[sec].matches = [];
    const qi = $('#q'); if (qi) qi.value = codes[0];
    selectAsm(codes[0], true);
    toast(codes.length > 1 ? `${codes.length} کد اسمبلی در نقشه پیدا شد؛ اولی نمایش داده شد.` : 'کد اسمبلی ' + codes[0] + ' پیدا شد.');
  }
  function onQuery(v, submit) {
    if (!M) return;
    S[sec].q = v;
    if (sec === 'locate' || sec === 'tree') {
      const m = [];
      const am = v.trim() ? FS.findAsms(M, v) : [];
      S[sec].matches = m; S[sec].asms = am;
      const nv = FS.normDigits(v).trim().toLowerCase();
      if (am.length && am[0].toLowerCase() === nv && (v.trim().length >= 2 || submit)) { selectAsm(am[0], true); return; }
      if (submit && am.length && !m.length) { selectAsm(am[0], true); return; }
      if (submit && m.length) { selectPart(m[0].id, true); return; }
      if (m.length === 1 && v.trim().length >= 2 && m[0].m.toLowerCase() === FS.normDigits(v).trim().toLowerCase()) { selectPart(m[0].id, true); return; }
    } else if (sec === 'grid') {
      S.grid.rep = v.trim() ? FS.gridReport(M, v, set.gridTol) : null; if (S.grid.rep && !S.grid.rep.ok) S.grid.rep.q = v;
    } else if (sec === 'level') {
      const idx = findLevel(v); S.level.idx = idx; S.level.rep = idx >= 0 ? FS.levelReport(M, idx, set.lvlTol) : null;
    } else if (sec === 'bolt') {
      const mt = FS.matchBoltTypes(M, v); S.bolt.matches = mt;
      if (v.trim() && mt.length === 1) { S.bolt.key = mt[0].key; S.bolt.rep = FS.boltReport(M, mt[0].key); }
      else if (submit && v.trim() && mt.length) { S.bolt.key = mt[0].key; S.bolt.rep = FS.boltReport(M, mt[0].key); }
      else if (!v.trim()) { S.bolt.key = null; S.bolt.rep = null; }
    }
    renderBody(); applyView();
  }
  function findLevel(v) {
    const t = FS.normDigits(v).trim(); if (!t) return -1;
    let i = M.grid.z.findIndex(z => z.n.toLowerCase() === t.toLowerCase()); if (i >= 0) return i;
    const n = parseFloat(t.replace(/[^\d.\-+]/g, '')); if (isNaN(n)) return -1;
    i = M.grid.z.findIndex(z => Math.abs(z.v / 1000 - n) < 0.0006); if (i >= 0) return i;
    return M.grid.z.findIndex(z => Math.abs(z.v - n) < 0.6);
  }
  function renderBody() {
    const b = $('#panelBody'); if (!M) { b.innerHTML = '<div class="none">ابتدا فایل مدل را باز کنید.</div>'; return; }
    let h = '';
    if (!M.hasAsm) { b.innerHTML = '<div class="none">⚠ این فایل اسمبلی ندارد. این برنامه فقط بر اساس کد اسمبلی کار می‌کند؛ در تکلا مطمئن شوید اسمبلی‌ها شماره‌گذاری شده‌اند (Numbering) و دوباره خروجی بگیرید.</div>'; return; }
    if (selAsm && sec !== 'locate' && sec !== 'tree') h += `<div id="pickBox">${asmCard(FS.asmInfo(M, selAsm), false)}<div class="row-actions"><button class="btn" data-act="zoomAsm">🎯 زوم</button><button class="btn sec" data-act="treeAsm" data-k="${esc(selAsm)}">🌳 درختی</button><button class="btn sec" data-act="clearSel">✕</button></div></div>`;
    else if (selId != null && partOf(selId) && sec !== 'locate' && sec !== 'tree') h += `<div id="pickBox">${infoCard(partOf(selId), false).replace('</div></div>', '</div><div class="row-actions"><button class="btn" data-act="zoom" data-id="' + selId + '">🎯 زوم</button><button class="btn sec" data-act="totree" data-id="' + selId + '">🌳 درختی</button><button class="btn sec" data-act="clearSel">✕</button></div></div>')}</div>`;
    h += PANELS[sec]();
    b.innerHTML = h;
    wireTable();
  }
  const PANELS = {
    locate() {
      const st = S.locate; let h = '';
      const p = selId != null ? partOf(selId) : null;
      const aChips = ms => (ms || []).map(k => `<span class="chip ${k === selAsm ? 'on' : ''}" data-act="asm" data-k="${esc(k)}">📦 ${esc(k)}</span>`).join('');
      if (st.q.trim() && st.asms && st.asms.length) h += `<div class="muted">اسمبلی‌ها (${st.asms.length}):</div><div class="chips">${aChips(st.asms)}</div>`;
      if (st.q.trim() && st.matches && !(selAsm && !st.matches.length)) {
        h += st.matches.length ? `<div class="muted">${st.matches.length} نتیجه — روی علامت بزنید:</div><div class="chips">${st.matches.map(m => `<span class="chip ${m.id === selId ? 'on' : ''}" data-act="pick" data-id="${m.id}">${esc(m.m)}</span>`).join('')}</div>` : (st.asms && st.asms.length ? '' : '<div class="none">اسمبلی‌ای با این علامت پیدا نشد.</div>');
      }
      if (selAsm) h += `<div class="row-actions" style="margin:6px 0"><button class="btn" data-act="zoomAsm">🎯 زوم</button><button class="btn pdf" data-act="pdf">PDF این صفحه</button>${'<button class="btn sec" data-act="share">📤 اشتراک</button>'}</div><div class="card">${asmTreeHtml(FS.asmTree(M, selAsm), true, true)}</div><div class="muted" style="font-size:12px">نارنجی = اسمبلی انتخابی · بقیه‌ی مدل شیشه‌ای</div>`;
      if (p && !selAsm) h += infoCard(p, true);
      if (!p && !st.q.trim()) h += `<div class="none">${M.hasAsm ? 'کد اسمبلی را بنویسید یا روی اسمبلی در مدل سه‌بعدی بزنید.' : 'علامت قطعه را بنویسید یا روی قطعه در مدل بزنید.'}<div class="chips" style="justify-content:center">${M.hasAsm ? Array.from(M.asm.keys()).sort(FS.natCmp).slice(0, 10).map(k => `<span class="chip" data-act="asm" data-k="${esc(k)}">📦 ${esc(k)}</span>`).join('') : M.parts.slice(0, 8).map(m => `<span class="chip" data-act="pick" data-id="${m.id}">${esc(m.m)}</span>`).join('')}</div></div>`;
      return h;
    },
    tree() {
      const st = S.tree; let h = '';
      if (st.q.trim() && st.asms && st.asms.length) h += `<div class="muted">اسمبلی‌ها:</div><div class="chips">${st.asms.map(k => `<span class="chip ${k === selAsm ? 'on' : ''}" data-act="asm" data-k="${esc(k)}">📦 ${esc(k)}</span>`).join('')}</div>`;
      if (selAsm) {
        const at = FS.asmTree(M, selAsm);
        return h + `<div class="row-actions" style="margin:6px 0"><button class="btn pdf" data-act="pdf">PDF این صفحه</button><button class="btn sec" data-act="share">📤 اشتراک</button><button class="btn sec" data-act="zoomAsm">🎯 زوم</button></div><div class="card">${asmTreeHtml(at, true, true)}</div><div class="muted" style="font-size:12px">نارنجی = اسمبلی انتخابی · بقیه‌ی مدل شیشه‌ای</div>`;
      }
      if (st.q.trim() && st.matches && st.matches.length > 1) h += `<div class="chips">${st.matches.map(m => `<span class="chip ${m.id === selId ? 'on' : ''}" data-act="pick" data-id="${m.id}">${esc(m.m)}</span>`).join('')}</div>`;
      else if (st.q.trim() && st.matches && !st.matches.length && !(st.asms && st.asms.length)) h += '<div class="none">قطعه‌ای پیدا نشد.</div>';
      const p = selId != null ? partOf(selId) : null;
      if (p) h += `<div class="row-actions" style="margin:6px 0"><button class="btn pdf" data-act="pdf">PDF این صفحه</button><button class="btn sec" data-act="zoom" data-id="${p.id}">🎯 زوم</button></div><div class="card">${treeHtml(FS.partTree(M, p), true, true)}</div><div class="muted" style="font-size:12px">نارنجی = قطعه‌ی انتخابی · آبی = قطعات متصل در مدل سه‌بعدی</div>`;
      else if (!st.q.trim()) h += '<div class="none">کد اسمبلی را جستجو کنید یا روی آن در مدل بزنید تا مشخصات درختی نمایش داده شود.</div>';
      return h;
    },
    grid() {
      const st = S.grid; let h = '';
      const chips = names => names.map(n => `<span class="chip ${st.rep && st.rep.ok && st.rep.title === n ? 'on' : ''}" data-act="gridSel" data-n="${esc(n)}">${esc(n)}</span>`).join('');
      const shown = st.rep && st.rep.ok;
      if (!shown) h += `<div class="muted">گریدهای مدل — یکی را انتخاب کنید یا بنویسید:</div><div class="muted">محورهای X:</div><div class="chips">${chips(M.grid.x.map(g => g.n))}</div><div class="muted">محورهای Y:</div><div class="chips">${chips(M.grid.y.map(g => g.n))}</div>`;
      if (!shown && !M.grid.x.length && !M.grid.y.length) h += '<div class="none">این فایل گرید ندارد؛ در تکلا گرید تعریف کنید.</div>';
      const r = st.rep;
      if (r && !r.ok) h += '<div class="none">گریدی با این نام پیدا نشد.</div>';
      if (r && r.ok) {
        h += `<div class="card"><h3>گرید ${esc(r.title)} <span class="row-actions" style="margin:0"><button class="btn sec" data-act="back">⟵ همه گریدها</button><button class="btn pdf" data-act="pdf">PDF</button><button class="btn sec" data-act="share">📤 اشتراک</button></span></h3>${sumBox([[CNT(), r.totals.count, 'sumC'], ['وزن کل', num(r.totals.weight, 1) + ' kg', 'sumW']])}${r.rows.length ? fbar() + table(r.rows, [COLS.idx, COLS.mark, COLS.prof, COLS.name, COLS.lvl, COLS.w, COLS.role], true, 'grid', 'grid:' + r.title) : '<div class="none">قطعه‌ای روی این گرید نیست.</div>'}</div>`;
      }
      return h;
    },
    level() {
      const st = S.level; const shown = st.rep && st.rep.ok; let h = shown ? '' : '<div class="muted">ترازهای مدل — یکی را انتخاب کنید:</div><div class="chips">' + M.grid.z.map((z, i) => `<span class="chip ${st.idx === i ? 'on' : ''}" data-act="lvlSel" data-i="${i}">${esc(z.n)}</span>`).join('') + '</div>';
      if (M.autoLevels && !shown) h += '<div class="muted" style="font-size:12px">⚠ تراز در فایل تعریف نشده؛ ترازها از روی ارتفاع تیرها/ستون‌ها حدس زده شد.</div>';
      const r = st.rep;
      if (st.q.trim() && !r) h += '<div class="none">ترازی با این مقدار پیدا نشد.</div>';
      if (r && r.ok) h += `<div class="card"><h3>تراز ${esc(r.title)} <span class="row-actions" style="margin:0"><button class="btn sec" data-act="back">⟵ همه ترازها</button><button class="btn pdf" data-act="pdf">PDF</button><button class="btn sec" data-act="share">📤 اشتراک</button></span></h3>${sumBox([[CNT(), r.totals.count, 'sumC'], ['وزن کل', num(r.totals.weight, 1) + ' kg', 'sumW']])}${r.rows.length ? fbar() + table(r.rows, [COLS.idx, COLS.mark, COLS.prof, COLS.name, COLS.grid, COLS.w, COLS.role], true, 'level', 'level:' + r.title) : '<div class="none">قطعه‌ای در این تراز نیست.</div>'}</div>`;
      return h;
    },
    bolt() {
      const st = S.bolt; const types = FS.boltTypes(M);
      const shown = st.rep && st.rep.ok;
      let h = shown ? '' : '<div class="muted">انواع پیچ موجود در مدل — یکی را انتخاب کنید:</div><div class="chips">' + types.map(t => `<span class="chip ${st.key === t.key ? 'on' : ''}" data-act="boltSel" data-k="${esc(t.key)}">${esc(t.label)} · ${t.bolts}</span>`).join('') + '</div>';
      if (!types.length && !shown) h += '<div class="none">پیچی در فایل ثبت نشده است.</div>';
      if (st.q.trim() && st.matches && !st.matches.length) h += '<div class="none">پیچی با این مشخصات پیدا نشد.</div>';
      else if (st.q.trim() && st.matches && st.matches.length > 1 && !st.rep) h += '<div class="muted">چند نوع مطابق است؛ یکی را انتخاب کنید.</div>';
      const r = st.rep;
      if (r && r.ok) {
        const t = r.type;
        h += `<div class="card"><h3>پیچ ${esc(r.title)} <span class="row-actions" style="margin:0"><button class="btn sec" data-act="back">⟵ همه پیچ‌ها</button><button class="btn pdf" data-act="pdf">PDF</button><button class="btn sec" data-act="share">📤 اشتراک</button></span></h3>${sumBox([['تعداد پیچ', num(t.bolts)], ['مهره', num(t.nuts)], ['واشر', num(t.washers)], ['اتصال', t.groups], ['اسمبلی', r.rows.length]])}${fbar()}${table(r.rows, [COLS.idx, COLS.mark, COLS.prof, COLS.name, COLS.grid, COLS.grp, COLS.bn], true, 'bolt', 'bolt:' + r.title)}</div><div class="muted" style="font-size:12px">نقاط زرد در مدل = محل گروه پیچ‌ها</div>`;
      }
      return h;
    }
  };

  /* ---------- actions ---------- */
  function setSection(s) {
    if (s !== 'locate' && s !== 'tree' && s !== sec) { selId = null; selAsm = null; }
    sec = s; $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.sec === s));
    renderHead(); renderBody(); applyView();
    if (V) { if (s === 'locate' || s === 'tree') { const A = selAsm && FS.asmInfo(M, selAsm); if (A) V.focusParts(A.parts); else { const p = partOf(selId); if (p) V.focusParts([p]); } } }
  }
  function onClick(e) {
    const t = e.target.closest('[data-act]'); if (!t || !M) return;
    const act = t.dataset.act, id = t.dataset.id != null ? (isNaN(+t.dataset.id) ? t.dataset.id : +t.dataset.id) : null;
    if (act === 'pick') selectPart(id, true);
    else if (act === 'pickIn') { selId = id; renderBody(); applyView(); const p = partOf(id); if (p) V.focusParts([p]); }
    else if (act === 'asm') { selectAsm(t.dataset.k, true); }
    else if (act === 'share') doShare();
    else if (act === 'back') {
      const s = S[sec]; s.q = ''; if (sec === 'grid') s.rep = null; if (sec === 'level') { s.rep = null; s.idx = -1; } if (sec === 'bolt') { s.rep = null; s.key = null; s.matches = null; }
      s.vis = null; const q = $('#q'); if (q) q.value = ''; renderBody(); applyView();
    }
    else if (act === 'zoomAsm') { const A = selAsm && FS.asmInfo(M, selAsm); if (A) V.focusParts(A.parts); }
    else if (act === 'treeAsm') { selAsm = t.dataset.k; setSection('tree'); }
    else if (act === 'zoom') { const p = partOf(id); if (p) V.focusParts([p]); }
    else if (act === 'totree') { selId = id; selAsm = null; setSection('tree'); }
    else if (act === 'clearSel') clearSel();
    else if (act === 'pdf') doPdf();
    else if (act === 'gridSel') { S.grid.q = t.dataset.n; const q = $('#q'); if (q) q.value = S.grid.q; onQuery(S.grid.q, true); }
    else if (act === 'lvlSel') { const i = +t.dataset.i; S.level.q = M.grid.z[i].n; const q = $('#q'); if (q) q.value = S.level.q; S.level.idx = i; S.level.rep = FS.levelReport(M, i, set.lvlTol); renderBody(); applyView(); V.preset('iso'); }
    else if (act === 'boltSel') { S.bolt.key = t.dataset.k; S.bolt.rep = FS.boltReport(M, S.bolt.key); const ty = S.bolt.rep.type; S.bolt.q = ty.label; const q = $('#q'); if (q) q.value = ty.label; renderBody(); applyView(); }
  }

  /* ---------- share (text report -> WhatsApp / Telegram / ...) ---------- */
  function plainText(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
  function reportText() {
    const pr = M.prj || {}; const head = 'FabSteel Structural Installer\nپروژه: ' + (pr.name || fileName || '-') + '\n';
    const tbl = (key, title, cols) => {
      const rows = filteredRows(key); const fd = filterDesc(key);
      return head + title + (fd ? '\nفیلتر: ' + fd : '') + '\nتعداد اسمبلی: ' + rows.length + '\n\n' + rows.map((r, i) => cols.map(c => plainText(c.f(r, i))).join(' | ')).join('\n');
    };
    if ((sec === 'locate' || sec === 'tree') && selAsm) {
      const t = FS.asmTree(M, selAsm), A = t.asm;
      return head + 'اسمبلی ' + A.mark + '\nوزن: ' + num(A.weight, 1) + ' kg\nگرید: ' + A.gTxt + '\nتراز: ' + A.lv0t + ' → ' + A.lv1t +
        '\nپیچ و مهره: ' + (t.bolts.map(b => b.label + (b.s ? ' ' + b.s : '') + ' × ' + b.n + ' (مهره ' + b.nuts + '، واشر ' + b.washers + ')').join('، ') || '-') +
        '\nاسمبلی‌های متصل: ' + (t.connected.map(c => c.asm).filter(Boolean).join('، ') || '-');
    }
    if (sec === 'grid' && S.grid.rep && S.grid.rep.ok) return tbl('grid', 'گرید ' + S.grid.rep.title, [COLS.mark, COLS.prof, COLS.lvl, COLS.w]);
    if (sec === 'level' && S.level.rep && S.level.rep.ok) return tbl('level', 'تراز ' + S.level.rep.title, [COLS.mark, COLS.prof, COLS.grid, COLS.w]);
    if (sec === 'bolt' && S.bolt.rep && S.bolt.rep.ok) return tbl('bolt', 'پیچ ' + S.bolt.rep.title, [COLS.mark, COLS.prof, COLS.grid, COLS.bn]);
    return '';
  }
  function doShare() {
    if (!M) return;
    const text = reportText(); if (!text) return toast('ابتدا جستجو کنید.', true);
    const title = 'FabSteel';
    if (window.FabNative && window.FabNative.shareText) { window.FabNative.shareText(title, text); return; }
    if (navigator.share) { navigator.share({ title, text }).catch(() => { }); return; }
    const done = () => toast('گزارش کپی شد؛ در پیام‌رسان Paste کنید.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast('کپی ممکن نشد', true)); else toast('اشتراک در این دستگاه ممکن نیست؛ از PDF استفاده کنید.', true);
  }

  /* ---------- PDF ---------- */
  function printHeader(title) {
    const pr = M.prj || {};
    return `<div class="ph"><div style="display:flex;align-items:center;gap:10px"><img src="${$('.logo').src}" style="height:46px;width:46px;border-radius:50%"><div><b>FabSteel Structural Installer</b><br><span class="prog" dir="ltr">programer eng davod bagheri</span><br><span>${esc(title)}</span></div></div><div style="text-align:left">پروژه: <b>${esc(pr.name || fileName || '-')}</b>${pr.no ? ' · ' + esc(pr.no) : ''}<br>تاریخ: <span dir="ltr">${new Date().toISOString().slice(0, 10)}</span></div></div>`;
  }
  function doPdf() {
    if (!M) return;
    let title, body = '', shot = () => `<img class="shot" src="${V.snapshot(1100, 600)}">`;
    if (selAsm && (sec === 'locate' || sec === 'tree')) {
      const A = FS.asmInfo(M, selAsm);
      if (sec === 'locate') { title = 'موقعیت اسمبلی ' + A.mark; body = shot() + asmCard(A, false); }
      else { title = 'مشخصات درختی اسمبلی ' + A.mark; body = `<h2>گزارش درختی اسمبلی ${esc(A.mark)}</h2>` + asmTreeHtml(FS.asmTree(M, selAsm), true, false) + shot(); }
    } else if (sec === 'locate') {
      const p = partOf(selId); if (!p) return toast('ابتدا یک قطعه را انتخاب کنید.', true);
      title = 'موقعیت قطعه ' + p.m; body = shot() + infoCard(p, false);
    } else if (sec === 'tree') {
      const p = partOf(selId); if (!p) return toast('ابتدا یک قطعه را انتخاب کنید.', true);
      title = 'مشخصات درختی قطعه ' + p.m; body = `<h2>گزارش درختی قطعه ${esc(p.m)}</h2>` + treeHtml(FS.partTree(M, p), true, false) + shot();
    } else if (sec === 'grid') {
      const r = S.grid.rep; if (!r || !r.ok) return toast('ابتدا یک گرید را جستجو کنید.', true);
      title = 'گزارش گرید ' + r.title;
      const rows = r.rows.length ? filteredRows('grid') : [], fd = filterDesc('grid'), tt = FS.totalsOf(rows.map(x => x.part));
      body = `<h2>گزارش تمام قطعات گرید ${esc(r.title)}</h2>${shot()}${fd ? `<div class="muted">فیلتر اعمال‌شده: ${esc(fd)}</div>` : ''}${sumBox([[CNT(), tt.count], ['وزن کل', num(tt.weight, 1) + ' kg']])}${table(rows, [COLS.idx, COLS.mark, COLS.name, COLS.prof, COLS.len, COLS.lvl, COLS.w, COLS.role], false)}`;
    } else if (sec === 'level') {
      const r = S.level.rep; if (!r || !r.ok) return toast('ابتدا یک تراز را انتخاب کنید.', true);
      title = 'گزارش تراز ' + r.title;
      const rows = r.rows.length ? filteredRows('level') : [], fd = filterDesc('level'), tt = FS.totalsOf(rows.map(x => x.part));
      body = `<h2>گزارش قطعات تراز ${esc(r.title)}</h2>${shot()}${fd ? `<div class="muted">فیلتر اعمال‌شده: ${esc(fd)}</div>` : ''}${sumBox([[CNT(), tt.count], ['وزن کل', num(tt.weight, 1) + ' kg']])}${table(rows, [COLS.idx, COLS.mark, COLS.name, COLS.prof, COLS.len, COLS.grid, COLS.w, COLS.role], false)}`;
    } else {
      const r = S.bolt.rep; if (!r || !r.ok) return toast('ابتدا نوع پیچ را انتخاب کنید.', true);
      const t = r.type; title = 'گزارش پیچ ' + t.label;
      const rows = r.rows.length ? filteredRows('bolt') : [], fd = filterDesc('bolt');
      body = `<h2>قطعات متصل با پیچ ${esc(r.title)}</h2>${shot()}${fd ? `<div class="muted">فیلتر اعمال‌شده: ${esc(fd)} — نمایش ${rows.length} از ${r.rows.length} قطعه</div>` : ''}${sumBox([['تعداد پیچ', num(t.bolts)], ['مهره', num(t.nuts)], ['واشر', num(t.washers)], ['اتصال', t.groups], ['اسمبلی', rows.length]])}${table(rows, [COLS.idx, COLS.mark, COLS.name, COLS.prof, COLS.grid, COLS.lvl, COLS.grp, COLS.bn], false)}`;
    }
    $('#printRoot').innerHTML = printHeader(title) + body + `<div class="foot"><span>FabSteel · instagram: fabsteel_9191</span><span>programer eng davod bagheri</span></div>`;
    const safe = ('FabSteel_' + title).replace(/[^\w؀-ۿ\-+.]+/g, '_');
    setTimeout(() => {
      if (window.FabNative && window.FabNative.printPdf) { window.FabNative.printPdf(safe); return; }
      const prev = document.title; document.title = safe; window.print(); setTimeout(() => document.title = prev, 1500);
    }, 80);
  }

  /* ---------- model loading ---------- */
  function setModel(m, name, size) {
    M = m; fileName = name || ''; fileSize = size || 0; selId = null; selAsm = null;
    S.locate = { q: '' }; S.tree = { q: '' }; S.grid = { q: '', rep: null }; S.level = { q: '', idx: -1, rep: null }; S.bolt = { q: '', key: null, rep: null };
    document.body.classList.add('has-model'); $('#btnExport').disabled = false;
    V.setModel(M); setSection(sec);
    const pr = M.prj || {};
    $('#statusBar').innerHTML = `<span>پروژه: <b>${esc(pr.name || fileName)}</b></span><span>قطعات: <b>${num(M.parts.length)}</b></span><span>گروه پیچ: <b>${num(M.bolts.length)}</b></span><span>گرید: <b>${M.grid.x.length}×${M.grid.y.length}</b></span><span>تراز: <b>${M.grid.z.length}</b></span>${fileSize ? `<span>حجم فایل: <b>${(fileSize / 1024).toFixed(1)} KB</b></span>` : ''}`;
    toast('مدل بارگذاری شد: ' + num(M.parts.length) + ' قطعه');
  }
  async function loadBuffer(buf, name) {
    try { const raw = await FS.bytesToJson(buf); setModel(FS.load(raw), name, buf.byteLength); }
    catch (e) { toast('خطا در خواندن فایل: ' + (e && e.message ? e.message : e), true); }
  }
  function b64ToBytes(b64) { const bin = atob(b64.replace(/\s+/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function bytesToB64(u) { let s = ''; const C = 0x8000; for (let i = 0; i < u.length; i += C) s += String.fromCharCode.apply(null, u.subarray(i, i + C)); return btoa(s); }
  window.FabLoadBase64 = (b64, name) => loadBuffer(b64ToBytes(b64).buffer, name || 'mobile.fabsteel');

  /* ---------- export ---------- */
  function download(bytes, name, mime) {
    const blob = new Blob([bytes], { type: mime }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function baseName() { return ((M.prj && M.prj.name) || fileName || 'project').replace(/\.[^.]+$/, '').replace(/[^\w؀-ۿ\-]+/g, '_'); }
  async function prepExport() {
    const gz = await FS.jsonToGzip(FS.compact(M));
    $('#exBinInfo').textContent = (gz.bytes.length / 1024).toFixed(1) + ' KB' + (gz.gz ? '' : ' (بدون فشرده‌سازی)');
    $('#exHtmlInfo').textContent = '≈ ' + ((gz.bytes.length * 1.34 + 95000) / 1024).toFixed(0) + ' KB';
    return gz;
  }
  async function exportBin() { const gz = await prepExport(); download(gz.bytes, baseName() + '.fabsteel', 'application/octet-stream'); toast('فایل موبایل ذخیره شد (' + (gz.bytes.length / 1024).toFixed(1) + ' KB)'); }
  async function exportHtml() {
    const gz = await prepExport(); const b64 = bytesToB64(gz.bytes);
    const clone = document.documentElement.cloneNode(true);
    $$('[data-dyn]', clone).forEach(n => n.innerHTML = '');
    const emb = $('#embeddedData', clone); emb.textContent = b64; emb.setAttribute('data-fmt', gz.gz ? 'gzip-b64' : 'json-b64');
    $$('.modal', clone).forEach(m => m.classList.remove('show'));
    clone.querySelector('body').className = ''; $('#btnExport', clone).setAttribute('disabled', '');
    const html = '<!doctype html>\n' + clone.outerHTML;
    download(new TextEncoder().encode(html), 'FabSteel_' + baseName() + '.html', 'text/html');
    toast('HTML تک‌فایل ذخیره شد (' + (html.length / 1024).toFixed(0) + ' KB)');
  }

  /* ---------- init ---------- */
  function init() {
    V = new window.Viewer3D($('#cv'), { onPick: id => { if (id != null) selectPart(id, false); } }); window.__V = V;
    $$('#nav button').forEach(b => b.addEventListener('click', () => setSection(b.dataset.sec)));
    $$('[data-view]').forEach(b => b.addEventListener('click', () => { if (!M) return; b.dataset.view === 'fit' ? V.fit(true) : V.preset(b.dataset.view); }));
    $('#btnClear').addEventListener('click', clearSel);
    $('#tgGrid').addEventListener('change', e => { V.showGrid = e.target.checked; V.requestRender(); });
    $('#tgLvl').addEventListener('change', e => { V.showLevels = e.target.checked; V.requestRender(); });
    $('#tgGhost').addEventListener('change', e => { V.ghost = e.target.checked; V.requestRender(); });
    $('#tgLbl').addEventListener('change', e => { V.showLabels = e.target.checked; V.requestRender(); });
    $('#panelBody').addEventListener('click', onClick);
    $('#btnOpen').addEventListener('click', () => $('#fileIn').click());
    $('#fileIn').addEventListener('change', async e => { const f = e.target.files[0]; if (f) await loadBuffer(await f.arrayBuffer(), f.name); e.target.value = ''; });
    $('#btnDemo').addEventListener('click', async () => { const raw = FS.demo(); const gz = await FS.jsonToGzip(raw); setModel(FS.load(raw), 'demo.fabsteel', gz.bytes.length); });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', async e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) await loadBuffer(await f.arrayBuffer(), f.name); });
    $('#btnExport').addEventListener('click', async () => { if (!M) return; $('#dlgExport').classList.add('show'); await prepExport(); });
    $('#exBin').addEventListener('click', exportBin); $('#exHtml').addEventListener('click', exportHtml);
    $('#btnSet').addEventListener('click', () => { $('#setGrid').value = set.gridTol; $('#setLvl').value = set.lvlTol; $('#dlgSet').classList.add('show'); });
    $('#setOk').addEventListener('click', () => {
      set.gridTol = Math.max(0, +$('#setGrid').value || 300); set.lvlTol = Math.max(0, +$('#setLvl').value || 150);
      try { localStorage.setItem('fabsteel.set', JSON.stringify(set)); } catch (e) { }
      $('#dlgSet').classList.remove('show');
      if (M) { if (S.grid.q) S.grid.rep = FS.gridReport(M, S.grid.q, set.gridTol); if (S.level.idx >= 0) S.level.rep = FS.levelReport(M, S.level.idx, set.lvlTol); renderBody(); applyView(); }
    });
    $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.remove('show')));
    $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); }));
    setSection('locate');
    const emb = $('#embeddedData');
    if (emb && emb.textContent.trim()) { try { loadBuffer(b64ToBytes(emb.textContent).buffer, 'embedded.fabsteel'); } catch (e) { toast('داده‌ی داخلی خوانده نشد', true); } }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.FabApp = { loadBuffer };
})();


/* ---------- splash (animated logo) + empty-state logo ---------- */
(function () {
  const sp = document.getElementById('splash'), img = document.getElementById('spImg'), el = document.getElementById('emptyLogo');
  if (el && img) el.src = img.src;
  if (!sp) return;
  let gone = false;
  const hide = () => { if (gone) return; gone = true; sp.classList.add('out'); setTimeout(() => sp.remove(), 700); };
  sp.addEventListener('click', hide);
  setTimeout(hide, 2600);
})();


/* ---------- mobile home screen (picture menu) ---------- */
(function () {
  const $ = s => document.querySelector(s), home = $('#home');
  if (!home) return;
  const mobile = () => window.matchMedia('(max-width:980px)').matches;
  const img = $('#homeImg'), bg = $('#homeBgImg'); if (bg && img) bg.src = img.src;
  const show = () => { home.hidden = false; document.body.classList.add('onhome'); };
  const hide = () => { home.hidden = true; document.body.classList.remove('onhome'); };
  window.FabBack = () => { if (!home.hidden || !mobile()) return false; show(); return true; };
  if (mobile()) show();
  home.querySelectorAll('.hp').forEach(b => b.addEventListener('click', () => {
    const nb = document.querySelector('#nav button[data-sec="' + b.dataset.go + '"]'); if (nb) nb.click(); hide();
    window.scrollTo(0, 0);
  }));
  $('#hOpen').addEventListener('click', () => $('#btnOpen').click());
  $('#hDemo').addEventListener('click', () => { $('#btnDemo').click(); });
  $('#btnHome').addEventListener('click', show);
  const sb = $('#statusBar'), st = $('#homeStat');
  const upd = () => { const f = sb.querySelector('span'); const n = sb.querySelectorAll('span')[1]; st.textContent = f && n ? f.textContent + ' · ' + n.textContent : ''; st.style.display = st.textContent ? '' : 'none'; };
  new MutationObserver(upd).observe(sb, { childList: true, subtree: true }); upd();
  window.addEventListener('resize', () => { if (!mobile()) hide(); });
})();
