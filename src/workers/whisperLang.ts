/* Choix de la langue (anglais / français) pour Whisper multilingue. */

/**
 * Anglais ou français ? Transformers.js ne détecte pas la langue : il impose l'anglais, et Whisper
 * *traduit* alors en anglais ce que l'apprenant dit en français (Emma croyait qu'il parlait anglais).
 * On fait comme Whisper d'origine : le 1er jeton généré est celui de la langue, limité ici à en/fr,
 * puis on impose « transcrire, sans horodatage ». Le français ne l'emporte que s'il est nettement plus
 * probable : un fort accent ne doit pas faire transcrire (traduire) de l'anglais en français.
 * Un seul passage de l'encodeur : la détection ne coûte rien de plus.
 */
// Écart de logits exigé (français ≥ 50 fois plus probable que l'anglais). Mesuré avec whisper-base :
// phrases françaises de 3 mots et plus entre 4,1 et 8,3 ; anglais à très fort accent français jusqu'à 3,9.
export const FR_MARGIN = 4;

type Logits = { data: Float32Array }[];

/**
 * Préfixe de décodage et filtre de logits à passer à la pipeline Whisper
 * (`decoder_input_ids`, `logits_processor`). Null pour un modèle anglais seulement (« .en »).
 */
export function languagePicker(g: Record<string, any> | undefined) {
  if (!g?.is_multilingual || !g.lang_to_id || !g.task_to_id) return null;
  const sot: number = g.decoder_start_token_id;
  const en: number = g.lang_to_id['<|en|>'];
  const fr: number = g.lang_to_id['<|fr|>'];
  const transcribe: number = g.task_to_id.transcribe;
  const noTs: number = g.no_timestamps_token_id;
  const begin: number[] = g.begin_suppress_tokens ?? [];
  if ([sot, en, fr, transcribe, noTs].some((x) => typeof x !== 'number')) return null;

  let detected: 'en' | 'fr' = 'en';
  let gap = 0;
  const force = (d: Float32Array, id: number) => {
    d.fill(-Infinity);
    d[id] = 0;
  };
  const process = (ids: bigint[][], logits: Logits) => {
    for (let b = 0; b < ids.length; b++) {
      const d = logits[b].data;
      const step = ids[b].length; // jetons déjà présents (le 1er est <|startoftranscript|>)
      if (step === 1) {
        gap = d[fr] - d[en];
        detected = gap > FR_MARGIN ? 'fr' : 'en';
        force(d, detected === 'fr' ? fr : en);
      } else if (step === 2) force(d, transcribe);
      else if (step === 3) force(d, noTs);
      else if (step === 4) for (const t of begin) d[t] = -Infinity; // ni fin ni espace avant le 1er mot
    }
    return logits;
  };
  return {
    prefix: [sot],
    process,
    get detected() {
      return detected;
    },
    /** Écart de logits français − anglais (diagnostic). */
    get gap() {
      return gap;
    },
  };
}
