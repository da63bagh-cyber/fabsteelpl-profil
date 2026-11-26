/* FabSteel 3D — dependency-free software renderer on <canvas> (works offline in Electron / Android WebView). */
(function (root) {
  'use strict';
  const FS = root.FSCore;
  const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const LIGHT = norm3([0.45, -0.6, 0.85]);
  const FOV = 42 * Math.PI / 180; let NEAR = 50; const MIN_DIST = 6;

  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

  const THEMES = {
    dark: { bg0: '#0b1220', bg1: '#16233b', grid: 'rgba(125,190,255,.55)', gridTxt: '#0b1220', gridFill: '#7dbeff', lvl: 'rgba(255,200,90,.5)', lvlTxt: '#ffd27a', edge: 'rgba(8,14,26,.85)', dimEdge: 'rgba(235,245,255,.55)', text: '#cfe3ff' },
    print: { bg0: '#ffffff', bg1: '#ffffff', grid: 'rgba(30,90,170,.7)', gridTxt: '#ffffff', gridFill: '#1e5aaa', lvl: 'rgba(200,120,0,.6)', lvlTxt: '#a85d00', edge: 'rgba(20,30,50,.8)', dimEdge: 'rgba(120,130,150,.35)', text: '#111111' }
  };
  const KIND_COLOR = { col: [66, 118, 178], beam: [86, 150, 215], brace: [96, 175, 190], plate: [145, 150, 160] };

  class Viewer3D {
    constructor(canvas, hooks) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks || {};
      this.M = null; this.cam = { yaw: -0.9, pitch: 0.55, dist: 20000, target: [0, 0, 0] };
      this.hl = null; this.sel = null; this.sec = null; this.markers = []; this.hlLines = [];
      this.showGrid = true; this.showLevels = true; this.showLabels = true; this.ghost = true;
      this.faceCache = []; this._raf = 0; this._anim = null; this.dpr = 1; this.W = 0; this.H = 0;
      this._bind();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas);
      this.resize();
    }

    /* ---------- model ---------- */
    setModel(M) {
      this.M = M; this.hl = null; this.sel = null; this.sec = null; this.markers = []; this.hlLines = [];
      this.lite = M.parts.length > 4000;
      this.fit(false);
    }
    setState(s) {
      this.hlSoft = !!s.hlSoft; this.hl = s.hl || null; this.sel = s.sel == null ? null : s.sel; this.sec = s.sec || null;
      this.markers = s.markers || []; this.hlLines = s.lines || [];
      this.label = s.label || null; this.labelPos = s.labelPos || null;
      this.requestRender();
    }
    bounds() { return this.M ? this.M.bounds : [0, 0, 0, 1000, 1000, 1000]; }
    fit(animate) {
      const b = this.bounds();
      const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
      const r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 || 1000;
      this.goTo({ target: c, dist: r * 2.3 }, animate !== false);
    }
    preset(name) {
      const P = { iso: [-0.9, 0.55], top: [-Math.PI / 2 + 0.0001, 1.5], front: [-Math.PI / 2, 0.0], side: [0, 0.0] };
      const p = P[name]; if (!p) return;
      const b = this.bounds(), r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2 || 1000;
      this.goTo({ yaw: p[0], pitch: p[1], target: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], dist: r * 2.3 }, true);
    }
    focusParts(parts) {
      if (!parts || !parts.length) return;
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const p of parts) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p.bb[i]); b[i + 3] = Math.max(b[i + 3], p.bb[i + 3]); }
      const r = Math.max(Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2, 150);
      this.goTo({ target: [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], dist: r * (parts.length === 1 ? 4.2 : 2.6) }, true);
    }
    goTo(t, animate) {
      const from = { yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist, target: this.cam.target.slice() };
      const to = { yaw: t.yaw != null ? t.yaw : from.yaw, pitch: t.pitch != null ? t.pitch : from.pitch, dist: t.dist != null ? t.dist : from.dist, target: t.target || from.target };
      if (!animate) { Object.assign(this.cam, to, { target: to.target.slice() }); this.requestRender(); return; }
      const t0 = performance.now(), D = 420;
      if (this._anim) cancelAnimationFrame(this._anim);
      const step = now => {
        let k = Math.min(1, (now - t0) / D); k = k * k * (3 - 2 * k);
        this.cam.yaw = from.yaw + (to.yaw - from.yaw) * k; this.cam.pitch = from.pitch + (to.pitch - from.pitch) * k;
        this.cam.dist = from.dist * Math.pow(to.dist / from.dist, k);
        this.cam.target = from.target.map((v, i) => v + (to.target[i] - v) * k);
        this.render();
        this._anim = k < 1 ? requestAnimationFrame(step) : 0;
      };
      this._anim = requestAnimationFrame(step);
    }

    /* ---------- canvas ---------- */
    resize() {
      const p = this.cv.parentElement || this.cv;
      const w = Math.max(100, p.clientWidth), h = Math.max(100, p.clientHeight);
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.cv.width = Math.round(w * this.dpr); this.cv.height = Math.round(h * this.dpr);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.W = w; this.H = h; this.requestRender();
    }
    requestRender() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); }

    /* ---------- camera math ---------- */
    basis(cam) {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const dirFromTarget = [cp * Math.cos(cam.yaw), cp * Math.sin(cam.yaw), sp];
      const pos = [cam.target[0] + dirFromTarget[0] * cam.dist, cam.target[1] + dirFromTarget[1] * cam.dist, cam.target[2] + dirFromTarget[2] * cam.dist];
      const f = norm3([-dirFromTarget[0], -dirFromTarget[1], -dirFromTarget[2]]);
      let r = cross(f, [0, 0, 1]); if (Math.hypot(r[0], r[1], r[2]) < 1e-6) r = [1, 0, 0]; r = norm3(r);
      const u = cross(r, f);
      return { pos, f, r, u };
    }
    makeProj(w, h, cam) {
      NEAR = Math.max(1, Math.min(50, cam.dist * 0.01)); // allows very close zoom (bolts/nuts)
      const B = this.basis(cam), focal = h / (2 * Math.tan(FOV / 2)), cx = w / 2, cy = h / 2;
      const toView = p => { const v = sub(p, B.pos); return [dot(v, B.r), dot(v, B.u), dot(v, B.f)]; };
      const scr = v => [cx + v[0] / v[2] * focal, cy - v[1] / v[2] * focal];
      return { B, toView, scr, focal };
    }
    clipLine(a, b) { // view-space near-plane clip
      if (a[2] < NEAR && b[2] < NEAR) return null;
      if (a[2] < NEAR) { const t = (NEAR - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; }
      else if (b[2] < NEAR) { const t = (NEAR - b[2]) / (a[2] - b[2]); b = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t, NEAR]; }
      return [a, b];
    }

    /* ---------- render ---------- */
    render(ctxIn, w, h, opts) {
      const print = !!(opts && opts.print);
      const ctx = ctxIn || this.ctx; w = w || this.W; h = h || this.H;
      const T = print ? THEMES.print : THEMES.dark;
      const dpr = ctxIn ? 1 : this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.direction = 'ltr';
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, T.bg0); g.addColorStop(1, T.bg1);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (!this.M) return;
      const cam = (opts && opts.cam) || this.cam, P = this.makeProj(w, h, cam), M = this.M;
      const b = M.bounds, ext = Math.max(b[3] - b[0], b[4] - b[1]) * 0.08 + 800;
      const zBase = M.grid.z.length ? Math.min(M.grid.z[0].v, b[2]) : b[2];

      const line3 = (p, q, style, lw, dash) => {
        const c = this.clipLine(P.toView(p), P.toView(q)); if (!c) return;
        const s0 = P.scr(c[0]), s1 = P.scr(c[1]);
        ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
        ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); ctx.setLineDash([]);
      };
      const label3 = (p, txt, fill, tcol, rad) => {
        const v = P.toView(p); if (v[2] < NEAR) return; const s = P.scr(v);
        ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(s[0], s[1], rad, 0, 6.2832); ctx.fill();
        ctx.fillStyle = tcol; ctx.font = 'bold ' + Math.round(rad * 1.05) + 'px Segoe UI, Tahoma, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, s[0], s[1] + 1);
      };

      // levels (behind)
      if (this.showLevels && M.grid.z.length && M.grid.z.length <= 40) {
        for (const L of M.grid.z) {
          const a = [b[0] - ext, b[1] - ext, L.v], c = [b[3] + ext, b[1] - ext, L.v], d = [b[3] + ext, b[4] + ext, L.v], e = [b[0] - ext, b[4] + ext, L.v];
          const hi = this.hlLines.some(l => l.axis === 'z' && l.v === L.v);
          const col = hi ? '#ff8c00' : T.lvl, lw = hi ? 2.4 : 1;
          line3(a, c, col, lw, [8, 6]); line3(c, d, col, lw, [8, 6]); line3(d, e, col, lw, [8, 6]); line3(e, a, col, lw, [8, 6]);
          if (this.showLabels) {
            const v = P.toView(a); if (v[2] > NEAR) { const s = P.scr(v); ctx.fillStyle = hi ? '#ff8c00' : T.lvlTxt; ctx.font = 'bold 12px Segoe UI, Tahoma, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(L.n, s[0] - 6, s[1]); }
          }
        }
      }
      // grid lines (behind)
      if (this.showGrid) {
        const y0 = b[1] - ext, y1 = b[4] + ext, x0 = b[0] - ext, x1 = b[3] + ext;
        const rad = Math.max(9, Math.min(15, h / 38));
        for (const gx of M.grid.x) {
          const hi = this.hlLines.some(l => l.axis === 'x' && l.v === gx.v);
          line3([gx.v, y0, zBase], [gx.v, y1, zBase], hi ? '#ff8c00' : T.grid, hi ? 2.6 : 1, hi ? [] : [14, 5]);
          if (this.showLabels) { label3([gx.v, y0, zBase], gx.n, hi ? '#ff8c00' : T.gridFill, hi ? '#111' : T.gridTxt, rad); label3([gx.v, y1, zBase], gx.n, hi ? '#ff8c00' : T.gridFill, hi ? '#111' : T.gridTxt, rad); }
        }
        for (const gy of M.grid.y) {
          const hi = this.hlLines.some(l => l.axis === 'y' && l.v === gy.v);
          line3([x0, gy.v, zBase], [x1, gy.v, zBase], hi ? '#ff8c00' : T.grid, hi ? 2.6 : 1, hi ? [] : [14, 5]);
          if (this.showLabels) { label3([x0, gy.v, zBase], gy.n, hi ? '#ff8c00' : T.gridFill, hi ? '#111' : T.gridTxt, rad); label3([x1, gy.v, zBase], gy.n, hi ? '#ff8c00' : T.gridFill, hi ? '#111' : T.gridTxt, rad); }
        }
      }

      // parts -> faces
      const hl = this.hl, sel = this.sel, sec = this.sec, anySel = !!hl || sel != null;
      const faces = []; const wire = [];
      const camPos = P.B.pos;
      for (const p of M.parts) {
        const C = FS.corners(p);
        const V = new Array(8); let ok = true;
        for (let i = 0; i < 8; i++) { V[i] = P.toView(C[i]); if (V[i][2] < NEAR) ok = false; }
        const isSel = p.id === sel;
        const isSec = sec && sec.has(p.id);
        const isHl = hl && hl.has(p.id);
        const dim = anySel && !isSel && !isHl && !isSec;
        if (dim && !this.ghost) continue;
        if (!ok) { // near clip: draw edges only
          wire.push({ p, V, isSel, isSec, isHl, dim }); continue;
        }
        const S = V.map(v => P.scr(v));
        // cull entirely off-screen
        let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
        for (const s of S) { if (s[0] < minx) minx = s[0]; if (s[0] > maxx) maxx = s[0]; if (s[1] < miny) miny = s[1]; if (s[1] > maxy) maxy = s[1]; }
        if (maxx < 0 || minx > w || maxy < 0 || miny > h) continue;
        const ctr = [p.cx, p.cy, p.cz];
        for (let fi = 0; fi < 6; fi++) {
          const F = FACES[fi];
          const fc = [0, 0, 0]; for (const k of F) { fc[0] += C[k][0] / 4; fc[1] += C[k][1] / 4; fc[2] += C[k][2] / 4; }
          const nrm = sub(fc, ctr);
          if (dot(nrm, sub(camPos, fc)) <= 0) continue;
          const n = norm3(nrm);
          const depth = (V[F[0]][2] + V[F[1]][2] + V[F[2]][2] + V[F[3]][2]) / 4;
          faces.push({ F, S, n, depth, p, isSel, isSec, isHl, dim });
        }
      }
      faces.sort((a, b2) => b2.depth - a.depth);
      this.faceCache = [];
      const fillAll = !(this.lite && this._interacting);
      const glassPath = new Path2D();
      for (const f of faces) {
        const k = f.p.k; let col = KIND_COLOR[k] || KIND_COLOR.plate;
        let r = col[0], g2 = col[1], bl = col[2];
        if (f.isSel) { r = 255; g2 = 140; bl = 0; }
        else if (f.isSec) { r = 34; g2 = 211; bl = 238; }
        else if (f.isHl) { r = 255; g2 = 140; bl = 0; }
        else if (f.dim) { r = 150; g2 = 195; bl = 235; }
        const lam = 0.45 + 0.55 * Math.max(0, dot(f.n, LIGHT));
        const bigM = M.parts.length > 1500;
        const poly = f.F.map(i => f.S[i]);
        if (f.dim) { // glass: faint tint + white edges, edges batched into one stroke for speed
          if (fillAll && !bigM) { ctx.globalAlpha = print ? 0.1 : 0.07; ctx.fillStyle = 'rgb(170,210,245)'; ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
          for (let i = 0; i < 4; i++) { const a = poly[i], b2 = poly[(i + 1) & 3]; glassPath.moveTo(a[0], a[1]); glassPath.lineTo(b2[0], b2[1]); }
          continue;
        }
        const alpha = (f.isHl && this.hlSoft) ? 0.38 : 1;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath();
        if (fillAll) { ctx.fillStyle = 'rgb(' + Math.round(r * lam) + ',' + Math.round(g2 * lam) + ',' + Math.round(bl * lam) + ')'; ctx.fill(); }
        if (!(f.dim && bigM && !print)) { ctx.strokeStyle = f.dim ? T.dimEdge : (f.isSel ? '#fff3d6' : T.edge); ctx.lineWidth = f.isSel ? 1.6 : 0.8; ctx.stroke(); }
        if (!f.dim) this.faceCache.push({ poly, id: f.p.id });
      }
      ctx.globalAlpha = print ? 0.6 : (M.parts.length > 1500 ? 0.4 : 0.6); ctx.strokeStyle = T.dimEdge; ctx.lineWidth = 0.7; ctx.lineJoin = 'round'; ctx.stroke(glassPath);
      ctx.globalAlpha = 1;
      for (const wv of wire) {
        ctx.strokeStyle = wv.isSel ? '#ff8c00' : (wv.dim ? T.dimEdge : T.edge); ctx.lineWidth = wv.isSel ? 2 : 1; ctx.globalAlpha = wv.dim ? 0.3 : 1;
        for (const e of EDGES) { const c = this.clipLine(wv.V[e[0]], wv.V[e[1]]); if (!c) continue; const s0 = P.scr(c[0]), s1 = P.scr(c[1]); ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;

      // bolt markers: real-size hex head (true diameter), gold, with glow so they read inside the glass model
      for (const m of this.markers) {
        const v = P.toView(m); if (v[2] < NEAR) continue; const s = P.scr(v);
        const dd = (m[3] || 20), rr = Math.max(4.2, dd * 0.87 / v[2] * P.focal); // hex head circumradius ~0.87 d
        if (s[0] < -rr || s[0] > w + rr || s[1] < -rr || s[1] > h + rr) continue;
        ctx.save(); ctx.translate(s[0], s[1]);
        if (!print) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffb400'; ctx.beginPath(); ctx.arc(0, 0, rr * 1.9 + 2, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath();
        const gr = ctx.createLinearGradient(-rr, -rr, rr, rr); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(0.5, '#ffc61a'); gr.addColorStop(1, '#a86a00');
        ctx.fillStyle = gr; ctx.fill(); ctx.strokeStyle = '#4a2c00'; ctx.lineWidth = Math.max(1, rr * 0.08); ctx.stroke();
        if (rr > 8) { // washer ring + bolt end circle when close enough to see details
          ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, 0, 6.2832); ctx.strokeStyle = 'rgba(70,40,0,.75)'; ctx.lineWidth = Math.max(1, rr * 0.06); ctx.stroke();
          ctx.beginPath(); ctx.arc(0, 0, rr * 0.34, 0, 6.2832); ctx.fillStyle = 'rgba(60,35,0,.55)'; ctx.fill();
          ctx.beginPath(); ctx.arc(-rr * 0.25, -rr * 0.3, rr * 0.12, 0, 6.2832); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
        }
        ctx.restore();
      }
      // selected label
      if (sel != null && M.partById.has(sel)) {
        const p = M.partById.get(sel), v = P.toView(this.labelPos || [p.cx, p.cy, p.bb[5]]);
        if (v[2] > NEAR) {
          const s = P.scr(v); const txt = this.label || p.m; ctx.font = 'bold 14px Segoe UI, Tahoma, sans-serif'; const tw = ctx.measureText(txt).width + 18;
          ctx.fillStyle = '#ff8c00'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          const bx = s[0] - tw / 2, by = s[1] - 46; ctx.beginPath(); ctx.moveTo(s[0], s[1] - 4); ctx.lineTo(s[0], by + 24); ctx.stroke();
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw, 24, 6) : ctx.rect(bx, by, tw, 24); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, s[0], by + 12.5);
        }
      }
      // axis gizmo
      const gz = 34, ox = 46, oy = h - 46; const bs = P.B;
      const axes = [[1, 0, 0, '#ff5a5a', 'X'], [0, 1, 0, '#5adf6e', 'Y'], [0, 0, 1, '#5aa8ff', 'Z']];
      ctx.lineWidth = 2.2; ctx.font = 'bold 11px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const a of axes) {
        const vx = dot(a, bs.r), vy = dot(a, bs.u);
        ctx.strokeStyle = a[3]; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + vx * gz, oy - vy * gz); ctx.stroke();
        ctx.fillStyle = a[3]; ctx.fillText(a[4], ox + vx * (gz + 9), oy - vy * (gz + 9));
      }
    }

    /* ---------- picking + input ---------- */
    pick(x, y) {
      for (let i = this.faceCache.length - 1; i >= 0; i--) {
        const f = this.faceCache[i], p = f.poly; let inside = false;
        for (let a = 0, b = 3; a < 4; b = a++) {
          const xi = p[a][0], yi = p[a][1], xj = p[b][0], yj = p[b][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return f.id;
      }
      return null;
    }
    _bind() {
      const cv = this.cv, pts = new Map(); let moved = 0, t0 = 0, last = null, pinch = null;
      cv.style.touchAction = 'none';
      cv.addEventListener('contextmenu', e => e.preventDefault());
      cv.addEventListener('pointerdown', e => {
        cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
        if (pts.size === 1) { moved = 0; t0 = performance.now(); }
        last = null; pinch = null; this._interacting = true;
        if (this._anim) { cancelAnimationFrame(this._anim); this._anim = 0; }
      });
      cv.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (pts.size === 1) {
          if (p.b === 2 || p.shift || p.b === 1) this.pan(dx, dy); else { this.cam.yaw -= dx * 0.008; this.cam.pitch = Math.max(-1.55, Math.min(1.55, this.cam.pitch + dy * 0.008)); }
          this.requestRender();
        } else if (pts.size === 2) {
          const [a, b] = Array.from(pts.values()); const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          if (pinch) { this.zoomBy(pinch.d / d, mx, my); this.pan(mx - pinch.mx, my - pinch.my); this.requestRender(); }
          pinch = { d, mx, my };
        }
      });
      const up = e => {
        const had = pts.delete(e.pointerId); pinch = null;
        if (pts.size === 0) {
          this._interacting = false; this.requestRender();
          if (had && moved < 6 && performance.now() - t0 < 450 && e.type === 'pointerup') {
            const r = cv.getBoundingClientRect(); const id = this.pick(e.clientX - r.left, e.clientY - r.top);
            if (this.hooks.onPick) this.hooks.onPick(id);
          }
        }
      };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', e => { e.preventDefault(); const rc = cv.getBoundingClientRect(); this.zoomBy(Math.exp(e.deltaY * 0.0015), e.clientX - rc.left, e.clientY - rc.top); this.requestRender(); }, { passive: false });
      cv.addEventListener('dblclick', e => {
        const rc = cv.getBoundingClientRect(); const id = this.pick(e.clientX - rc.left, e.clientY - rc.top);
        const p = id != null && this.M ? this.M.partById.get(id) : null;
        if (p) { const r = Math.max(60, Math.hypot(p.bb[3] - p.bb[0], p.bb[4] - p.bb[1], p.bb[5] - p.bb[2]) / 2); this.goTo({ target: [p.cx, p.cy, (p.bb[2] + p.bb[5]) / 2], dist: r * 2.2 }, true); }
        else this.fit(true);
      });
    }
    /* zoom towards the pointer (mx,my in canvas px): factor<1 zooms in */
    zoomBy(f, mx, my) {
      const cam = this.cam, old = cam.dist; let nd = Math.max(MIN_DIST, Math.min(1e7, old * f)); const s = nd / old;
      if (mx != null && s !== 1) {
        const B = this.basis(cam), k = old * 2 * Math.tan(FOV / 2) / this.H;
        const ox = (mx - this.W / 2) * k, oy = -(my - this.H / 2) * k;
        for (let i = 0; i < 3; i++) cam.target[i] += (B.r[i] * ox + B.u[i] * oy) * (1 - s);
      }
      cam.dist = nd;
    }
    pan(dx, dy) {
      const B = this.basis(this.cam), k = this.cam.dist * 2 * Math.tan(FOV / 2) / this.H;
      for (let i = 0; i < 3; i++) this.cam.target[i] += (-B.r[i] * dx + B.u[i] * dy) * k;
    }
    snapshot(w, h, opts) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      const saved = this._interacting; this._interacting = false;
      this.render(x, w, h, Object.assign({ print: true }, opts || {}));
      this._interacting = saved;
      return c.toDataURL('image/png');
    }
  }
  root.Viewer3D = Viewer3D;
})(window);
