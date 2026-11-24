/* ------------------------------------------------------------------
 * Nouvelle version au démarrage.
 *
 * Un onglet restauré (Brave au lancement, sur iPhone) reprend la page en
 * cache sans rien demander au site, même périmée : après une mise à jour,
 * l'ancienne version tournait jusqu'à ce qu'on actualise. Au démarrage, la
 * page du site est relue sans cache ; si elle charge un autre code que
 * celle-ci, la page se recharge tant que l'apprenant n'a encore rien touché
 * (sinon : message, la nouvelle version s'appliquera à la prochaine ouverture).
 * ------------------------------------------------------------------ */
import { journal } from './journal';
import { autoReload } from './recover';

/** Nom du code d'entrée (« index-….js ») que charge une page HTML, ou null. */
export function entryScript(html: string): string | null {
  const m = /<script\b[^>]*\bsrc="[^"]*\/(index-[\w-]+\.js)"/.exec(html);
  return m ? m[1] : null;
}

/** Code d'entrée de cette page (null en développement : /src/main.tsx). */
function currentEntry(): string | null {
  const src = document.querySelector('script[type="module"][src*="index-"]')?.getAttribute('src') ?? '';
  return /(index-[\w-]+\.js)$/.exec(src)?.[1] ?? null;
}

/**
 * Compare la page en ligne à celle-ci (une fois, au démarrage). `notice` : message pour l'apprenant
 * quand la nouvelle version ne peut pas s'appliquer tout de suite.
 */
export function checkForUpdate(notice: (msg: string) => void): void {
  const mine = currentEntry();
  if (!mine || typeof fetch !== 'function') return;
  let touched = false;
  const mark = () => {
    touched = true;
  };
  window.addEventListener('pointerdown', mark, { once: true, capture: true });
  window.addEventListener('keydown', mark, { once: true, capture: true });
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 8000);
  fetch(new URL('./', window.location.href), { cache: 'no-store', signal: ctl.signal })
    .then((r) => (r.ok ? r.text() : null))
    .then((html) => {
      const online = html ? entryScript(html) : null;
      if (!online || online === mine) return;
      const what = `nouvelle version en ligne (${online}, cette page : ${mine})`;
      if (!touched && autoReload('nouvelle version en ligne')) {
        journal(`${what} → rechargement`);
        return;
      }
      journal(`${what} : à la prochaine ouverture`);
      notice('Nouvelle version de Tea Time : actualisez la page quand vous voulez pour en profiter.');
    })
    .catch(() => undefined)
    .finally(() => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', mark, { capture: true });
      window.removeEventListener('keydown', mark, { capture: true });
    });
}
