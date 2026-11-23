/// <reference lib="webworker" />
/*
 * Outils communs aux services de modèles (voix, Whisper, compréhension).
 *
 * Chaque service parle à son « port » : le worker lui-même (worker dédié), ou un MessagePort
 * quand plusieurs services partagent un même worker (iPhone, voir src/lib/modelWorker.ts).
 */
export interface Port {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent) => unknown) | null;
  close?(): void;
}

let tail: Promise<unknown> = Promise.resolve();
/** Calculs urgents (voix, Whisper, réponse de l'apprenant) en file ou en cours. */
let urgent = 0;
let lastUrgent = -Infinity;

/**
 * Calculs des modèles un par un. Dans un worker partagé, la voix, Whisper et la compréhension
 * se partagent un seul thread : sans cette file, une mesure de vitesse ou une transcription
 * compterait le temps passé à attendre les autres. Dans un worker dédié, elle ne coûte rien.
 */
export function exclusive<T>(fn: () => Promise<T>, { background = false } = {}): Promise<T> {
  if (!background) urgent++;
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  if (background) return run;
  return run.finally(() => {
    urgent--;
    lastUrgent = performance.now();
  });
}

/**
 * Attend que rien d'urgent ne soit en file depuis `graceMs` (ou que `stop()` le demande), avant un
 * travail de fond (indexation). Dans un worker partagé (iPhone), la voix d'Emma ne fait ainsi plus
 * la queue derrière l'indexation des questions : sinon elle mettait plusieurs secondes à répondre.
 */
export async function whenIdle(graceMs = 1500, stop: () => boolean = () => false): Promise<void> {
  while (!stop() && (urgent > 0 || performance.now() - lastUrgent < graceMs)) {
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Comme `exclusive`, en renvoyant aussi la durée du calcul (sans l'attente). */
export function exclusiveTimed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  return exclusive(async () => {
    const t = performance.now();
    const value = await fn();
    return { value, ms: performance.now() - t };
  });
}
