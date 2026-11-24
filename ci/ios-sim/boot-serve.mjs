// Mise à jour du site pendant que l'onglet dort (test « demarrage ») : node boot-serve.mjs <dossier> <port> <max-age> <évincé>
// Avant /__deploy : version A, la page réclame son code d'entrée sous d'autres noms (comme un build
// précédent). Après : version B ; les fichiers propres à A répondent 503, comme sur GitHub Pages.
// Cache-Control: max-age et ETag comme Pages (600 s). évincé=1 : le code d'entrée de A n'est pas gardé
// dans le cache du navigateur (comme un cache purgé par iOS).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [dir, port, maxAge = '600', evict = '0'] = process.argv.slice(2);
const root = path.resolve(dir);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = html.match(/assets\/(index-[\w-]+\.js)/)[1];
const css = html.match(/assets\/(index-[\w-]+\.css)/)[1];
const OLD = { 'index-AAAAAAAA.js': js, 'index-BBBBBBBB.css': css };
const htmlA = html.replace(`assets/${js}`, 'assets/index-AAAAAAAA.js').replace(`assets/${css}`, 'assets/index-BBBBBBBB.css');
let deployed = false;
const t0 = Date.now();
const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s [${deployed ? 'B' : 'A'}] ${s}`);

http
  .createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const inm = req.headers['if-none-match'] || '';
    const cond = inm ? ` (si différent de ${inm})` : '';
    if (p === '/__deploy') {
      deployed = true;
      log('=== site mis à jour : version B ===');
      res.writeHead(200);
      return res.end('ok');
    }
    if (p === '/' || p === '/index.html') {
      const etag = deployed ? '"page-B"' : '"page-A"';
      const head = { ETag: etag, 'Cache-Control': `max-age=${maxAge}` };
      if (inm === etag) {
        log(`${req.url} 304${cond}`);
        res.writeHead(304, head);
        return res.end();
      }
      log(`${req.url} 200 page ${deployed ? 'B' : 'A'}${cond}`);
      res.writeHead(200, { ...head, 'Content-Type': types['.html'] });
      return res.end(deployed ? html : htmlA);
    }
    const name = path.basename(p);
    let file = path.join(root, p);
    let cache = `max-age=${maxAge}`;
    if (OLD[name]) {
      if (deployed) {
        log(`${req.url} 503 (fichier de la version A, supprimé)${cond}`);
        res.writeHead(503);
        return res.end();
      }
      file = path.join(root, 'assets', OLD[name]);
      if (evict === '1') cache = 'no-store';
    }
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      log(`${req.url} 404`);
      res.writeHead(404);
      return res.end();
    }
    const st = fs.statSync(file);
    const etag = `"${name}-${st.size}"`;
    if (inm === etag) {
      log(`${req.url} 304`);
      res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
      return res.end();
    }
    log(`${req.url} 200${cond}`);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', ETag: etag, 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
  })
  .listen(Number(port), () => console.log(`version A sur ${port} · max-age ${maxAge} · code d'entrée évincé du cache : ${evict === '1' ? 'oui' : 'non'}`));
