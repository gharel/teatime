import { useEffect, useRef, useState } from 'react';
import { exportData, importData, resetAll, updateSettings, useAppState, setName, type Settings as S } from '../lib/store';
import { say, tts } from '../lib/tts';
import { listen, webSpeechSupported } from '../lib/stt';
import { WEBLLM_MODELS, llm } from '../lib/llm';
import { navigate, notify, useService } from '../components/ui';
import { EnginePanel } from './Tutor';
import Icon, { ICONS, IconBadge } from '../components/Icon';
import { isIOS } from '../lib/device';
import { PIPER_VOICE } from '../lib/piper';

const KOKORO_VOICES: { id: string; label: string }[] = [
  { id: 'af_heart', label: 'Heart — américaine, chaleureuse (recommandée)' },
  { id: 'af_bella', label: 'Bella — américaine, expressive' },
  { id: 'af_nicole', label: 'Nicole — américaine, douce' },
  { id: 'bf_emma', label: 'Emma — britannique' },
  { id: 'bf_isabella', label: 'Isabella — britannique' },
  { id: 'am_michael', label: 'Michael — américain' },
  { id: 'bm_george', label: 'George — britannique' },
];

export default function Settings() {
  const s = useAppState((st) => st.settings);
  const name = useAppState((st) => st.profile.name);
  const voices = useService(tts, () => tts.voices());
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<S>) => updateSettings(p);
  const [micTest, setMicTest] = useState<string>('');
  const testMic = async () => {
    setMicTest('Dites une phrase en anglais…');
    try {
      const t = await listen({
        silenceMs: 1300,
        noSpeechMs: 7000,
        onInterim: (x) => x && setMicTest(`« ${x} »`),
        onProcessing: () => setMicTest('Transcription…'),
      }).result;
      setMicTest(t ? `Entendu : « ${t} »` : 'Rien entendu. Vérifiez le micro et l’autorisation du navigateur.');
    } catch (err) {
      setMicTest(`Erreur : ${(err as Error).message}`);
    }
  };

  return (
    <div className="narrow">
      <div className="page-head">
        <h1 className="title-icon">
          <IconBadge icon={ICONS.settings} tone="neutral" />
          Réglages
        </h1>
        <p>Tout est gratuit et fonctionne dans votre navigateur. Aucun compte, aucune donnée envoyée à nos serveurs (il n'y en a pas).</p>
      </div>

      <div className="card">
        <h3 className="label-icon">
          <Icon name="profile" /> Profil
        </h3>
        <label className="field">
          Prénom
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field mt">
          Thème
          <select className="input" value={s.theme} onChange={(e) => set({ theme: e.target.value as S['theme'] })}>
            <option value="auto">Automatique (système)</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
        <label className="switch">
          <span>Effets sonores</span>
          <input type="checkbox" checked={s.sfx} onChange={(e) => set({ sfx: e.target.checked })} />
        </label>
      </div>

      <h2 className="section-title">
        <Icon name="voice" /> Voix d'Emma (synthèse vocale)
      </h2>
      <div className="card stack">
        <label className="field">
          Moteur
          <select
            className="input"
            value={s.ttsEngine}
            onChange={(e) => {
              const engine = e.target.value as S['ttsEngine'];
              const before = s.ttsEngine;
              set({ ttsEngine: engine });
              // Kokoro <-> Piper : le worker de voix doit charger l'autre modèle.
              if (engine !== 'system' && before !== 'system' && tts.neural.status !== 'idle') tts.reloadNeural();
            }}
          >
            <option value="kokoro">Voix neuronale automatique — Kokoro (très naturelle) ou Piper si l'appareil est lent</option>
            <option value="piper">Voix neuronale légère Piper — rapide même sur téléphone (≈ {PIPER_VOICE.mb} Mo)</option>
            <option value="system">Voix du système — instantanée, qualité variable{isIOS() ? ' (muette en mode silencieux)' : ''}</option>
          </select>
          {isIOS() && s.ttsEngine === 'system' && (
            <span className="hint" style={{ color: 'var(--danger)' }}>
              Sur iPhone et iPad, la voix du système est coupée quand le bouton latéral est en mode silencieux, et peut se
              taire pendant que le micro est ouvert. Les voix neuronales passent par le lecteur audio : elles restent audibles.
            </span>
          )}
        </label>
        {s.ttsEngine === 'piper' ? (
          <p className="small muted" style={{ margin: 0 }}>
            Voix : {PIPER_VOICE.label} · modèle Piper « {PIPER_VOICE.id} », calculé sur votre appareil.
          </p>
        ) : s.ttsEngine === 'kokoro' ? (
          <>
            <label className="field">
              Voix neuronale
              <select className="input" value={s.kokoroVoice} onChange={(e) => set({ kokoroVoice: e.target.value })}>
                {KOKORO_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Accélération
              <select className="input" value={s.kokoroDevice} onChange={(e) => set({ kokoroDevice: e.target.value as S['kokoroDevice'] })}>
                <option value="auto">Automatique — carte graphique si disponible (recommandé)</option>
                <option value="webgpu">Carte graphique (WebGPU, ≈ 320 Mo) — voix fluide, 3 à 5× plus rapide</option>
                <option value="wasm">Processeur (WASM, ≈ 90 Mo) — compatible partout, plus lent</option>
              </select>
              <span className="hint">Le changement s'applique au prochain rechargement de la page.</span>
            </label>
          </>
        ) : (
          <label className="field">
            Voix du système
            <select className="input" value={s.systemVoice} onChange={(e) => set({ systemVoice: e.target.value })}>
              <option value="">Automatique (meilleure voix anglaise détectée)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Vitesse de parole : {Math.round(s.speechRate * 100)} %
          <input type="range" min={0.7} max={1.2} step={0.05} value={s.speechRate} onChange={(e) => set({ speechRate: Number(e.target.value) })} />
        </label>
        <div>
          <button
            className="btn sm"
            onClick={() => {
              tts.unlockAudio();
              void say("Hello! I'm Emma, your English teacher. Shall we practise together?");
            }}
          >
            <Icon name="speaker" size={16} /> Tester la voix
          </button>
        </div>
        <AudioDiagnostics />
      </div>

      <h2 className="section-title">
        <Icon name="mic" /> Reconnaissance vocale
      </h2>
      <div className="card stack">
        <label className="field">
          Moteur
          <select className="input" value={s.sttEngine} onChange={(e) => set({ sttEngine: e.target.value as S['sttEngine'] })}>
            <option value="webspeech" disabled={!webSpeechSupported()}>
              Navigateur (Web Speech API) — rapide, bascule seule sur Whisper si indisponible{webSpeechSupported() ? '' : ' — non disponible ici'}
            </option>
            <option value="whisper">Whisper local (Transformers.js) — 100 % privé, ≈ 80 Mo (CPU) à 200 Mo (GPU)</option>
          </select>
          <span className="hint">
            Dans Chrome, la reconnaissance du navigateur est gratuite mais l'audio est traité par un service en ligne de Google ; elle
            n'écoute que l'anglais. Whisper fonctionne entièrement sur votre appareil et reconnaît aussi le français : Emma vous aide
            alors à le dire en anglais.
          </span>
        </label>
        {s.sttEngine === 'whisper' && (
          <label className="field">
            Modèle Whisper
            <select className="input" value={s.whisperModel} onChange={(e) => set({ whisperModel: e.target.value })}>
              <option value="onnx-community/whisper-tiny">Tiny (≈ 40–100 Mo) — le plus rapide</option>
              <option value="onnx-community/whisper-base">Base (≈ 80–200 Mo) — recommandé</option>
              <option value="onnx-community/whisper-small">Small (≈ 250–600 Mo) — le plus précis</option>
            </select>
          </label>
        )}
        <label className="field">
          Accent de référence
          <select className="input" value={s.sttLang} onChange={(e) => set({ sttLang: e.target.value as S['sttLang'] })}>
            <option value="en-US">Anglais américain</option>
            <option value="en-GB">Anglais britannique</option>
          </select>
        </label>
        <label className="field">
          Temps de réflexion avant qu'Emma réponde : {(s.silenceMs / 1000).toFixed(1)} s
          <input type="range" min={1200} max={5000} step={100} value={s.silenceMs} onChange={(e) => set({ silenceMs: Number(e.target.value) })} />
          <span className="hint">Augmentez-le si Emma vous coupe la parole quand vous cherchez vos mots.</span>
        </label>
        <div className="row">
          <button className="btn sm" onClick={() => void testMic()}>
            <Icon name="mic" size={16} /> Tester le micro
          </button>
          <span className="small" aria-live="polite">
            {micTest}
          </span>
        </div>
      </div>

      <h2 className="section-title">
        <Icon name="ai" /> Intelligence artificielle
      </h2>
      <div className="card stack">
        <EnginePanel compact />
        {s.llmProvider === 'webllm' && (
          <label className="field">
            Modèle WebLLM
            <select
              className="input"
              value={s.webllmModel}
              onChange={(e) => {
                set({ webllmModel: e.target.value });
                if (llm.status.status === 'ready') void llm.load();
              }}
            >
              {WEBLLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.size} — {m.note}
                </option>
              ))}
            </select>
          </label>
        )}
        {s.llmProvider === 'ollama' && (
          <>
            <label className="field">
              Adresse d'Ollama
              <input className="input" value={s.ollamaUrl} onChange={(e) => set({ ollamaUrl: e.target.value })} />
            </label>
            <label className="field">
              Modèle
              <input className="input" value={s.ollamaModel} onChange={(e) => set({ ollamaModel: e.target.value })} />
              <span className="hint">
                Ex. llama3.2:3b, qwen2.5:7b, gemma3:4b, mistral. Lancez Ollama avec la variable OLLAMA_ORIGINS=* pour autoriser l'application.
              </span>
            </label>
          </>
        )}
      </div>

      <h2 className="section-title">
        <Icon name="data" /> Mes données
      </h2>
      <div className="card">
        <p className="small muted">Votre progression est enregistrée uniquement dans ce navigateur. Exportez-la pour la sauvegarder ou la transférer.</p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([exportData()], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `tea-time-english-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            <Icon name="download" size={16} /> Exporter
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Importer
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importData(await f.text());
                notify('ok', 'Progression importée');
              } catch (err) {
                notify('warn', `Import impossible : ${(err as Error).message}`);
              }
            }}
          />
          <button
            className="btn danger"
            onClick={() => {
              if (window.confirm('Effacer toute votre progression ? Cette action est irréversible.')) {
                resetAll();
                navigate('/');
              }
            }}
          >
            <Icon name="trash" size={16} /> Tout effacer
          </button>
        </div>
      </div>
    </div>
  );
}

/** État audio en direct : à capturer et envoyer si Emma reste muette. */
function AudioDiagnostics() {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [open]);
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="small">Diagnostic audio (si Emma reste muette)</summary>
      {open && (
        <div className="tiny" style={{ marginTop: 6 }}>
          {tts.diagnostics().map((d) => (
            <div key={d.label}>
              <strong>{d.label} :</strong> {d.value}
            </div>
          ))}
          <div style={{ marginTop: 6 }}>
            <strong>Derniers événements :</strong>
            {tts.log.length ? (
              <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                {tts.log.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            ) : (
              <span> aucun pour l’instant (touchez « Tester la voix »)</span>
            )}
          </div>
        </div>
      )}
    </details>
  );
}
