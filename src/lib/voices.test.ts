import { describe, expect, it } from 'vitest';
import { englishSystemVoices } from './tts';

/**
 * getVoices() tel que le remplace Brave sur iPhone (Shields, FarblingProtectionScript.js) : une voix
 * factice est copiée d'une voix tirée au hasard, sans vérifier qu'elle existe.
 */
function braveFarbled(voices: SpeechSynthesisVoice[], randomVoiceIndexScale: number) {
  let fakeVoice: SpeechSynthesisVoice | undefined;
  const makeFakeVoiceFromVoice = (voice: SpeechSynthesisVoice) =>
    Object.create(Object.getPrototypeOf(voice), { name: { value: 'Fake' }, lang: { value: voice.lang } }) as SpeechSynthesisVoice;
  return {
    getVoices() {
      const list = voices.slice();
      if (fakeVoice === undefined) {
        const originalVoice = list[Math.round(randomVoiceIndexScale * list.length)];
        fakeVoice = makeFakeVoiceFromVoice(originalVoice);
        if (fakeVoice !== undefined) list.push(fakeVoice);
      } else list.push(fakeVoice);
      return list;
    },
  };
}

const voice = (name: string, lang: string) => ({ name, lang, voiceURI: name, localService: true, default: false }) as SpeechSynthesisVoice;
const ios = [voice('Samantha', 'en-US'), voice('Thomas', 'fr-FR'), voice('Daniel', 'en-GB')];

describe('voix du système (Brave sur iPhone)', () => {
  it('le getVoices() de Brave plante quand les voix ne sont pas encore chargées', () => {
    expect(() => braveFarbled([], 0.4).getVoices()).toThrow(TypeError);
  });

  it('liste vide au lieu de planter : au lancement, puis tirage juste après la dernière voix', () => {
    expect(englishSystemVoices(braveFarbled([], 0.4))).toEqual([]);
    expect(englishSystemVoices(braveFarbled(ios, 0.95))).toEqual([]);
  });

  it('voix anglaises quand Brave ne plante pas (voix factice comprise)', () => {
    const names = englishSystemVoices(braveFarbled(ios, 0)).map((v) => v.name);
    expect(names).toEqual(['Samantha', 'Daniel', 'Fake']);
  });

  it('sans Brave', () => {
    expect(englishSystemVoices({ getVoices: () => ios }).map((v) => v.name)).toEqual(['Samantha', 'Daniel']);
  });
});
