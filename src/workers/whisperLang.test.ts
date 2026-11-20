import { describe, expect, it } from 'vitest';
import { FR_MARGIN, languagePicker } from './whisperLang';

/** Extrait du generation_config.json de onnx-community/whisper-base. */
const CONFIG = {
  is_multilingual: true,
  decoder_start_token_id: 50258,
  lang_to_id: { '<|en|>': 50259, '<|fr|>': 50265 },
  task_to_id: { transcribe: 50359, translate: 50358 },
  no_timestamps_token_id: 50363,
  begin_suppress_tokens: [220, 50257],
};
const VOCAB = 50400;

/** Joue le filtre comme la boucle de génération : renvoie le jeton choisi (argmax) à chaque pas. */
function decode(gap: number) {
  const p = languagePicker(CONFIG)!;
  const ids: bigint[] = p.prefix.map(BigInt);
  const chosen: number[] = [];
  for (let step = 0; step < 4; step++) {
    const d = new Float32Array(VOCAB);
    if (step === 0) {
      d[50259] = 1; // <|en|>
      d[50265] = 1 + gap; // <|fr|>
    }
    d[50257] = 5; // fin de texte, très probable au 1er mot
    d[1000] = 2; // un mot
    p.process([ids], [{ data: d }]);
    const best = d.indexOf(Math.max(...d));
    chosen.push(best);
    ids.push(BigInt(best));
  }
  return { chosen, detected: p.detected };
}

describe('Whisper : anglais ou français', () => {
  it('français nettement plus probable : transcrit en français, sans traduire ni horodater', () => {
    const r = decode(FR_MARGIN + 1);
    expect(r.detected).toBe('fr');
    expect(r.chosen).toEqual([50265, 50359, 50363, 1000]);
  });

  it('doute (accent) : reste en anglais', () => {
    const r = decode(FR_MARGIN - 0.5);
    expect(r.detected).toBe('en');
    expect(r.chosen[0]).toBe(50259);
  });

  it('modèle anglais seulement (.en) : rien à faire', () => {
    expect(languagePicker({ is_multilingual: false })).toBeNull();
    expect(languagePicker(undefined)).toBeNull();
  });
});
