// node build.js  ->  dist/FabSteelViewer.html  (single offline file; no dependencies)
const fs = require('fs'), path = require('path');
const d = p => fs.readFileSync(path.join(__dirname, 'src', p), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
let html = d('index.template.html');
const parts = { '/*CSS*/': d('style.css'), '/*CORE*/': safe(d('core.js')), '/*PDFSCAN*/': safe(d('pdfscan.js')), '/*R3D*/': safe(d('render3d.js')), '/*APP*/': safe(d('app.js')), '/*LOGO*/': d('logo.b64').trim(), '/*HOME*/': d('home.b64').trim(), '/*LOGOBIG*/': d('logobig.b64').trim(), '/*BANNER*/': d('banner.b64').trim() };
for (const k of Object.keys(parts)) html = html.split(k).join(parts[k]);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', 'FabSteelViewer.html');
fs.writeFileSync(out, html);
console.log('built', out, (html.length / 1024).toFixed(1) + ' KB');
