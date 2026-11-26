/* PdfScan — tiny offline PDF text extractor (no libraries). Used to read the assembly mark out of a drawing PDF.
   Supports Flate streams, object streams, ToUnicode CMaps (Identity-H fonts), TJ/Tj text operators.
   Not supported: scanned images, outlined (curve) text, encrypted files -> caller falls back to the file name. */
(function () {
  'use strict';
  const lat = u8 => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return s; };
  const bytesOf = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };

  async function inflate(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no-inflate');
    // browsers are strict about junk after the zlib stream (EOL before "endstream"): retry with trimmed tails
    for (const trim of [0, 1, 2]) {
      const part = trim ? u8.subarray(0, Math.max(0, u8.length - trim)) : u8;
      try {
        const ds = new DecompressionStream('deflate');
        const w = ds.writable.getWriter(); w.write(part).catch(() => { }); w.close().catch(() => { });
        const out = new Uint8Array(await new Response(ds.readable).arrayBuffer());
        if (out.length) return out;
      } catch (e) { /* retry */ }
    }
    return new Uint8Array(0);
  }

  function a85(u8) {
    let s = lat(u8).replace(/\s+/g, ''); const st = s.indexOf('<~'); if (st >= 0) s = s.slice(st + 2); const en = s.indexOf('~>'); if (en >= 0) s = s.slice(0, en);
    const out = []; let g = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i]; if (c === 'z' && !g.length) { out.push(0, 0, 0, 0); continue; }
      g.push(s.charCodeAt(i) - 33);
      if (g.length === 5) { let v = 0; for (const d of g) v = v * 85 + d; out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); g = []; }
    }
    if (g.length > 1) { const n = g.length; while (g.length < 5) g.push(84); let v = 0; for (const d of g) v = v * 85 + d; const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; for (let i = 0; i < n - 1; i++) out.push(b[i]); }
    return Uint8Array.from(out);
  }
  function ahex(u8) { const h = lat(u8).replace(/[^0-9A-Fa-f]/g, ''); const o = []; for (let i = 0; i < h.length; i += 2) o.push(parseInt(h.substr(i, 2).padEnd(2, '0'), 16)); return Uint8Array.from(o); }
  async function decodeStream(dict, data) {
    const fm = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict); if (!fm) return data;
    const names = fm[1].match(/\/\w+/g) || [];
    for (const nm of names) {
      if (nm === '/ASCII85Decode' || nm === '/A85') data = a85(data);
      else if (nm === '/ASCIIHexDecode' || nm === '/AHx') data = ahex(data);
      else if (nm === '/FlateDecode' || nm === '/Fl') data = await inflate(data);
      else return new Uint8Array(0);
    }
    return data;
  }

  /* balanced << >> block that follows key (e.g. '/Font') in dict text, or null */
  function dictAfter(txt, key) {
    const i = txt.indexOf(key); if (i < 0) return null;
    let j = i + key.length; while (/\s/.test(txt[j])) j++;
    if (txt.substr(j, 2) !== '<<') return null;
    let depth = 0, k = j;
    for (; k < txt.length - 1; k++) {
      if (txt[k] === '<' && txt[k + 1] === '<') { depth++; k++; }
      else if (txt[k] === '>' && txt[k + 1] === '>') { depth--; k++; if (!depth) { k++; break; } }
    }
    return txt.slice(j, k);
  }
  const refAfter = (txt, key) => { const m = new RegExp(key + '\\s+(\\d+)\\s+\\d+\\s+R').exec(txt); return m ? +m[1] : null; };

  function parseCMap(s) {
    const map = new Map(); let bytes = 1;
    const hexU = h => { let o = ''; for (let i = 0; i + 3 < h.length + 1; i += 4) { const c = parseInt(h.substr(i, 4), 16); if (!isNaN(c)) o += String.fromCharCode(c); } return o; };
    let m; const cs = /begincodespacerange\s*([\s\S]*?)endcodespacerange/g;
    while ((m = cs.exec(s))) { const h = /<([0-9A-Fa-f]+)>/.exec(m[1]); if (h) bytes = Math.max(bytes, h[1].length / 2); }
    const bc = /beginbfchar\s*([\s\S]*?)endbfchar/g;
    while ((m = bc.exec(s))) {
      const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; let p;
      while ((p = re.exec(m[1]))) { map.set(parseInt(p[1], 16), hexU(p[2])); bytes = Math.max(bytes, p[1].length / 2); }
    }
    const br = /beginbfrange\s*([\s\S]*?)endbfrange/g;
    while ((m = br.exec(s))) {
      const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g; let p;
      while ((p = re.exec(m[1]))) {
        const lo = parseInt(p[1], 16), hi = Math.min(parseInt(p[2], 16), lo + 65535); bytes = Math.max(bytes, p[1].length / 2);
        if (p[4] !== undefined) { const base = hexU(p[4]); const bc0 = base.length ? base.charCodeAt(base.length - 1) : 0; for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(bc0 + c - lo)); }
        else { const arr = (p[5].match(/<([0-9A-Fa-f]+)>/g) || []).map(x => hexU(x.slice(1, -1))); for (let c = lo; c <= hi && c - lo < arr.length; c++) map.set(c, arr[c - lo]); }
      }
    }
    return { map, bytes };
  }

  function unescStr(s) {
    return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c) => {
      if (c === 'n') return '\n'; if (c === 'r') return '\r'; if (c === 't') return '\t'; if (c === 'b') return '\b'; if (c === 'f') return '\f';
      if (c === '(' || c === ')' || c === '\\') return c; if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8) & 255); return '';
    });
  }
  function decode(raw, font) {
    if (font && font.cm && font.cm.map.size) {
      const n = font.cm.bytes || 1; let o = '';
      for (let i = 0; i + n <= raw.length; i += n) {
        let c = 0; for (let k = 0; k < n; k++) c = c * 256 + (raw.charCodeAt(i + k) & 255);
        const u = font.cm.map.get(c); o += u !== undefined ? u : (n === 1 ? raw[i] : '');
      }
      return o;
    }
    return raw;
  }

  /* content stream -> text, using fonts: name -> {cm} */
  function contentText(cs, fonts) {
    let out = '', font = null, i = 0; const n = cs.length;
    const stack = [];
    const emit = t => { out += t; };
    while (i < n) {
      const ch = cs[i];
      if (ch === '(') {
        let depth = 1, j = i + 1, buf = '';
        while (j < n && depth) { const c = cs[j]; if (c === '\\') { buf += c + (cs[j + 1] || ''); j += 2; continue; } if (c === '(') depth++; else if (c === ')') { depth--; if (!depth) break; } buf += c; j++; }
        stack.push({ s: unescStr(buf) }); i = j + 1;
      } else if (ch === '<' && cs[i + 1] !== '<') {
        const j = cs.indexOf('>', i); const h = cs.slice(i + 1, j).replace(/\s+/g, ''); let b = '';
        for (let k = 0; k < h.length; k += 2) b += String.fromCharCode(parseInt(h.substr(k, 2).padEnd(2, '0'), 16));
        stack.push({ s: b }); i = j + 1;
      } else if (ch === '[') { stack.push({ arr: true }); i++; }
      else if (ch === ']') {
        const items = []; while (stack.length && !stack[stack.length - 1].arr) items.unshift(stack.pop()); stack.pop();
        stack.push({ items }); i++;
      } else if (ch === '/') {
        const m = /^\/([^\s\/\[\]()<>]*)/.exec(cs.substr(i, 100)); stack.push({ name: m[1] }); i += m[0].length;
      } else if (/[\d.+\-]/.test(ch)) {
        const m = /^[+\-]?(?:\d+\.?\d*|\.\d+)/.exec(cs.substr(i, 40));
        if (m) { stack.push({ num: parseFloat(m[0]) }); i += m[0].length; } else i++;
      } else if (/[A-Za-z'"*]/.test(ch)) {
        const m = /^[A-Za-z'"*]+/.exec(cs.substr(i, 12)); const op = m[0]; i += op.length;
        if (op === 'Tf') { const nm = stack.find(x => x.name !== undefined); font = nm ? fonts[nm.name] || null : null; }
        else if (op === 'Tj' || op === "'" || op === '"') { const s = stack.filter(x => x.s !== undefined).pop(); if (op !== 'Tj') emit(' '); if (s) emit(decode(s.s, font)); }
        else if (op === 'TJ') {
          const a = stack.filter(x => x.items).pop();
          if (a) for (const it of a.items) { if (it.s !== undefined) emit(decode(it.s, font)); else if (it.num !== undefined && it.num < -250) emit(' '); }
        } else if (op === 'Td' || op === 'TD' || op === 'T*' || op === 'Tm' || op === 'ET' || op === 'BT') emit(' ');
        stack.length = 0;
      } else i++;
    }
    return out;
  }

  /* main */
  async function extractText(buf) {
    const u8 = new Uint8Array(buf), src = lat(u8);
    if (!/^%PDF-/.test(src.slice(0, 8))) throw new Error('not-pdf');
    if (/\/Encrypt\b/.test(src.slice(Math.max(0, src.length - 4000)))) throw new Error('encrypted');
    const objs = new Map(); // num -> {dict, stream(Uint8Array|null)}
    const re = /(\d+)\s+(\d+)\s+obj\b/g; let m; const heads = [];
    while ((m = re.exec(src))) heads.push({ num: +m[1], at: m.index + m[0].length });
    for (let k = 0; k < heads.length; k++) {
      const end = src.indexOf('endobj', heads[k].at); const body = src.slice(heads[k].at, end < 0 ? undefined : end);
      const si = body.indexOf('stream');
      if (si >= 0 && /^[\s\S]*>>\s*$/.test(body.slice(0, si))) {
        let st = si + 6; if (body[st] === '\r') st++; if (body[st] === '\n') st++;
        let en = body.lastIndexOf('endstream'); if (en < 0) en = body.length;
        const ln = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(body.slice(0, si));
        let data = bytesOf(ln && st + +ln[1] <= en ? body.slice(st, st + +ln[1]) : body.slice(st, en).replace(/\r?\n$/, ''));
        objs.set(heads[k].num, { dict: body.slice(0, si), data });
      } else objs.set(heads[k].num, { dict: body, data: null });
    }
    // decode streams
    for (const o of objs.values()) {
      if (!o.data) continue;
      if (/\/Image\b/.test(o.dict)) { o.text = ''; continue; }
      try { o.text = lat(await decodeStream(o.dict, o.data)); } catch (e) { if (String(e.message) === 'no-inflate') throw e; o.text = ''; }
    }
    // object streams -> unpack
    for (const [num, o] of Array.from(objs)) {
      if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.text) continue;
      const first = +(/\/First\s+(\d+)/.exec(o.dict) || [0, 0])[1], cnt = +(/\/N\s+(\d+)/.exec(o.dict) || [0, 0])[1];
      const nums = o.text.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < cnt; k++) {
        const on = nums[k * 2], off = nums[k * 2 + 1], nx = k + 1 < cnt ? nums[k * 2 + 3] : o.text.length - first;
        if (!objs.has(on)) objs.set(on, { dict: o.text.slice(first + off, first + nx), data: null });
      }
    }
    const cmapOf = new Map();
    const fontOf = num => {
      if (cmapOf.has(num)) return cmapOf.get(num);
      const o = objs.get(num); let f = { cm: null };
      if (o) { const tu = refAfter(o.dict, '/ToUnicode'); const t = tu != null ? objs.get(tu) : null; if (t && t.text) f.cm = parseCMap(t.text); }
      cmapOf.set(num, f); return f;
    };
    const resolveDict = (o, key) => {                       // inline dict or reference
      const inl = dictAfter(o.dict, key); if (inl) return inl;
      const r = refAfter(o.dict, key); return r != null && objs.get(r) ? objs.get(r).dict : null;
    };
    const fontsOfPage = o => {
      let cur = o, depth = 0;
      while (cur && depth++ < 8) {
        const res = resolveDict(cur, '/Resources');
        if (res) {
          let fd = dictAfter(res, '/Font'); if (!fd) { const r = refAfter(res, '/Font'); fd = r != null && objs.get(r) ? objs.get(r).dict : null; }
          const fonts = {};
          if (fd) { const rr = /\/([^\s\/\[\]()<>]+)\s+(\d+)\s+\d+\s+R/g; let q; while ((q = rr.exec(fd))) fonts[q[1]] = fontOf(+q[2]); }
          return fonts;
        }
        const par = refAfter(cur.dict, '/Parent'); cur = par != null ? objs.get(par) : null;
      }
      return {};
    };
    let text = ''; const used = new Set();
    for (const [num, o] of objs) {
      if (!/\/Type\s*\/Page\b(?!s)/.test(o.dict) || o.data) continue;
      const fonts = fontsOfPage(o);
      let cref = []; const ca = /\/Contents\s*\[([^\]]*)\]/.exec(o.dict);
      if (ca) { const rr = /(\d+)\s+\d+\s+R/g; let q; while ((q = rr.exec(ca[1]))) cref.push(+q[1]); }
      else { const r = refAfter(o.dict, '/Contents'); if (r != null) cref.push(r); }
      for (const r of cref) { const c = objs.get(r); if (c && c.text) { used.add(r); text += '\n' + contentText(c.text, fonts); } }
    }
    if (!used.size) { // unusual structure: decode every non-font stream with a merged font table
      const fonts = {}; let idx = 0;
      for (const [n2, o] of objs) if (/\/Type\s*\/Font\b/.test(o.dict)) { fonts['F' + (idx++)] = fontOf(n2); }
      for (const [n2, o] of objs) if (o.text && /\bBT\b/.test(o.text) && /\bET\b/.test(o.text)) text += '\n' + contentText(o.text, fonts);
    }
    return text;
  }

  window.PdfScan = { extractText };
})();
