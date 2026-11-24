/** Commit et date du build (vite.config.ts). */
declare const __APP_VERSION__: string;

interface Window {
  /** Démarrage surveillé par index.html : t0 = ouverture de la page, ok = code de l'appli arrivé. */
  teatimeBoot?: { t0: number; ok: boolean };
}
