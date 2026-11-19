/* ------------------------------------------------------------------
 * Téléchargement des modèles : relance après une coupure réseau et
 * messages d'erreur compréhensibles. Utilisé aussi dans les workers.
 * ------------------------------------------------------------------ */

/**
 * Coupure pendant un téléchargement : « Load failed » (Safari et tous les navigateurs iOS),
 * « Failed to fetch » (Chrome), « NetworkError » (Firefox).
 */
export function isNetworkError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /load failed|failed to fetch|networkerror|network error|network connection was lost|err_network|err_connection/i.test(msg);
}

/**
 * Relance une opération après une coupure réseau. Les fichiers déjà téléchargés sont en cache
 * (Transformers.js) : seul le fichier interrompu est repris.
 */
export async function retryOnNetworkError<T>(fn: () => Promise<T>, delays: number[] = [2000, 6000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= delays.length || !isNetworkError(err)) throw err;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}

/** Traduit les erreurs techniques de chargement en message utile à l'apprenant. */
export function friendlyLoadError(raw: unknown): string {
  const msg = String((raw as Error)?.message ?? raw ?? '');
  if (isNetworkError(msg))
    return 'téléchargement interrompu (connexion instable, écran verrouillé ou appli mise en arrière-plan). Touchez « Réessayer » en gardant l’écran allumé';
  if (/out of memory|allocation failed|array buffer allocation|memory access out of bounds|rangeerror/i.test(msg))
    return 'mémoire insuffisante sur cet appareil. Fermez d’autres onglets puis touchez « Réessayer »';
  if (/quota/i.test(msg)) return 'espace de stockage insuffisant pour garder le modèle sur cet appareil';
  return msg || 'erreur inconnue';
}
