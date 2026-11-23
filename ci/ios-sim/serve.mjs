// Serveur statique minimal pour le build (node serve.mjs <dossier> <port>), sans en-têtes COOP/COEP,
// comme GitHub Pages vu depuis iOS. Les .mjs partent en text/javascript (glue d'onnxruntime).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [dir, port] = process.argv.slice(2);
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
  '.png': 'image/png',
  '.onnx': 'application/octet-stream',
};
http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      console.log('404', req.url);
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(Number(port), () => console.log(`serving ${root} on ${port}`));
