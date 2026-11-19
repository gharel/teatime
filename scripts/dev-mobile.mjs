/* ------------------------------------------------------------------
 * Serveur de développement en HTTPS sur le réseau local, pour tester
 * l'appli sur un téléphone avec micro, WebGPU et IA locale (contexte sécurisé).
 *
 * Pour éviter l'avertissement « certificat non fiable » :
 *  - une autorité de certification (AC) locale est créée une seule fois
 *    dans .cert/ ; elle est LIMITÉE (name constraints) aux adresses privées
 *    et aux noms localhost / .local : même divulguée, elle ne pourrait pas
 *    servir à usurper un vrai site ;
 *  - le certificat du serveur est régénéré à chaque lancement pour les
 *    adresses IP actuelles du PC ;
 *  - une petite page HTTP (port 5444) permet d'installer l'AC sur le
 *    téléphone, une seule fois. Ensuite : https://<ip-du-pc>:5443 sans alerte.
 * ------------------------------------------------------------------ */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.cert');
// ports distincts de `npm run dev` (5173) pour pouvoir lancer les deux en même temps
const HTTPS_PORT = Number(process.env.MOBILE_PORT || 5443);
const CA_PORT = Number(process.env.MOBILE_CA_PORT || 5444);
const { pki, asn1, md } = forge;

fs.mkdirSync(dir, { recursive: true });
const file = (n) => path.join(dir, n);

function asciiHost() {
  return os.hostname().normalize('NFKD').replace(/[^A-Za-z0-9-]/g, '').toLowerCase() || 'pc';
}

function serial() {
  return '01' + forge.util.bytesToHex(forge.random.getBytesSync(15));
}

/* ---------- AC locale (créée une fois) ---------- */
function nameConstraints() {
  const ctx = (tag, constructed, value) => asn1.create(asn1.Class.CONTEXT_SPECIFIC, tag, constructed, value);
  const seq = (items) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, items);
  const ip = (a, m) => seq([ctx(7, false, String.fromCharCode(...a, ...m))]);
  const dns = (n) => seq([ctx(2, false, n)]);
  const permitted = ctx(0, true, [
    ip([10, 0, 0, 0], [255, 0, 0, 0]),
    ip([172, 16, 0, 0], [255, 240, 0, 0]),
    ip([192, 168, 0, 0], [255, 255, 0, 0]),
    ip([127, 0, 0, 0], [255, 0, 0, 0]),
    ip([169, 254, 0, 0], [255, 255, 0, 0]),
    dns('localhost'),
    dns('local'),
  ]);
  return { id: '2.5.29.30', critical: true, value: seq([permitted]) };
}

function loadOrCreateCA() {
  if (fs.existsSync(file('ca.key')) && fs.existsSync(file('ca.crt'))) {
    return { key: pki.privateKeyFromPem(fs.readFileSync(file('ca.key'), 'utf8')), cert: pki.certificateFromPem(fs.readFileSync(file('ca.crt'), 'utf8')) };
  }
  console.log('Création de l’autorité de certification locale (une seule fois)…');
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000);
  // noms en ASCII encodés en UTF8String : un caractère accentué en PrintableString rend le
  // certificat invalide pour Chrome (ERR_SSL_SERVER_CERT_BAD_FORMAT)
  const utf8 = asn1.Type.UTF8;
  const name = [
    { name: 'commonName', value: `Tea Time English - AC locale (${asciiHost()})`, valueTagClass: utf8 },
    { name: 'organizationName', value: 'Tea Time English (dev local)', valueTagClass: utf8 },
  ];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
    nameConstraints(),
  ]);
  cert.sign(keys.privateKey, md.sha256.create());
  fs.writeFileSync(file('ca.key'), pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
  fs.writeFileSync(file('ca.crt'), pki.certificateToPem(cert));
  return { key: keys.privateKey, cert };
}

/* ---------- certificat du serveur (adresses actuelles) ---------- */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(a.address)) out.push(a.address);
    }
  }
  return [...new Set(out)];
}

function issueServerCert(ca, ips) {
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 397 * 24 * 3600 * 1000);
  const host = asciiHost();
  cert.setSubject([{ name: 'commonName', value: ips[0] ?? 'localhost', valueTagClass: asn1.Type.UTF8 }]);
  cert.setIssuer(ca.cert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: ca.cert.generateSubjectKeyIdentifier().getBytes() },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: `${host}.local` },
        { type: 7, ip: '127.0.0.1' },
        ...ips.map((ip) => ({ type: 7, ip })),
      ],
    },
  ]);
  cert.sign(ca.key, md.sha256.create());
  return { key: pki.privateKeyToPem(keys.privateKey), cert: pki.certificateToPem(cert) };
}

const ca = loadOrCreateCA();
const ips = lanAddresses();
if (!ips.length) console.warn('⚠ Aucune adresse de réseau local trouvée : le PC est-il connecté au Wi-Fi ?');
const server = issueServerCert(ca, ips);
fs.writeFileSync(file('server.key'), server.key, { mode: 0o600 });
fs.writeFileSync(file('server.crt'), server.cert);

/* ---------- page d'installation de l'AC (HTTP, port 5444) ---------- */
const caPem = fs.readFileSync(file('ca.crt'));
const caDer = Buffer.from(asn1.toDer(pki.certificateToAsn1(ca.cert)).getBytes(), 'binary');
const appUrls = ips.map((ip) => `https://${ip}:${HTTPS_PORT}/`);
const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tea Time English – installer le certificat</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1f2a37;background:#fff9f2}
a.btn{display:inline-block;background:#0e7c74;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700;margin:6px 0}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.6em}li{margin:6px 0}code{background:#f1e8de;padding:1px 5px;border-radius:5px}</style></head><body>
<h1>Tea Time English sur ce téléphone</h1>
<p>À faire <strong>une seule fois</strong> : installer le certificat de développement de ce PC. Il ne fonctionne que pour les adresses du réseau local (il ne peut pas servir pour d'autres sites).</p>
<p><a class="btn" href="/tea-time-ca.crt">Télécharger le certificat</a></p>
<h2>Android</h2><ol>
<li>Télécharge le certificat (bouton ci-dessus).</li>
<li>Paramètres → Sécurité (ou « Sécurité et confidentialité ») → Plus de paramètres → Chiffrement et identifiants → Installer un certificat → <strong>Certificat CA</strong>.</li>
<li>Choisis le fichier <code>tea-time-ca.crt</code> et confirme.</li></ol>
<h2>iPhone / iPad</h2><ol>
<li>Ouvre cette page dans <strong>Safari</strong> et télécharge le certificat, puis « Autoriser ».</li>
<li>Réglages → « Profil téléchargé » → Installer.</li>
<li>Réglages → Général → Informations → Réglages des certificats → active <strong>Tea Time English - AC locale</strong>.</li></ol>
<h2>Ensuite</h2><p>Ouvre l'appli (sans alerte de sécurité) :</p>
<p>${appUrls.map((u) => `<a class="btn" href="${u}">${u}</a>`).join('<br>') || '—'}</p>
<p>Astuce : une fois l'appli ouverte, « Ajouter à l'écran d'accueil » pour la lancer comme une appli.</p>
</body></html>`;
http
  .createServer((req, res) => {
    if (req.url?.startsWith('/tea-time-ca.crt')) {
      res.writeHead(200, { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="tea-time-ca.crt"' });
      res.end(caDer);
    } else if (req.url?.startsWith('/tea-time-ca.pem')) {
      res.writeHead(200, { 'Content-Type': 'application/x-pem-file' });
      res.end(caPem);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
    }
  })
  .listen(CA_PORT, '0.0.0.0');

/* ---------- Vite en HTTPS sur le réseau local ---------- */
const vite = await createServer({
  root,
  server: { host: true, port: HTTPS_PORT, strictPort: true, https: { key: server.key, cert: server.cert } },
});
await vite.listen();
console.log('\n  Tea Time English – mode mobile (HTTPS)\n');
for (const ip of ips) {
  console.log(`  1. Sur le téléphone (même Wi-Fi), une seule fois : http://${ip}:${CA_PORT}  (installer le certificat)`);
  console.log(`  2. Puis l'appli :                                  https://${ip}:${HTTPS_PORT}\n`);
}
console.log(`  Sur ce PC : https://localhost:${HTTPS_PORT}  (Ctrl+C pour arrêter)\n`);
