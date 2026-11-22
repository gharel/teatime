/* ------------------------------------------------------------------
 * Panneau « Diagnostic audio » : état en direct, incidents, options de
 * dépannage (iPhone) et journal, avec un bouton pour tout copier.
 * ------------------------------------------------------------------ */
import { useEffect, useState } from 'react';
import { diagnosticSections, diagnosticText, recentCrash, type Tone } from '../lib/diagnostics';
import { DEBUG_FLAGS, debugFlags, isIOS, setDebugFlag } from '../lib/device';
import { clearJournal, journalEntries, journalTime, onJournal } from '../lib/journal';
import { traceTime } from '../lib/recover';
import { say, tts } from '../lib/tts';
import Icon from './Icon';

/** Copie dans le presse-papiers ; repli execCommand (anciens WebKit). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* repli ci-dessous */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Bouton « Copier le diagnostic » (avec texte à sélectionner à la main si la copie est refusée). */
export function CopyDiagnosticsButton({ className = 'btn primary sm' }: { className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [text, setText] = useState('');
  useEffect(() => {
    if (state !== 'copied') return;
    const id = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(id);
  }, [state]);
  return (
    <>
      <button
        className={className}
        onClick={() => {
          const t = diagnosticText();
          setText(t);
          void copyText(t).then((ok) => setState(ok ? 'copied' : 'manual'));
        }}
      >
        <Icon name={state === 'copied' ? 'check' : 'copy'} size={16} /> {state === 'copied' ? 'Copié !' : 'Copier le diagnostic'}
      </button>
      {state === 'manual' && (
        <div className="diag-manual">
          <span className="tiny muted">Copie automatique refusée : sélectionnez tout le texte ci-dessous puis copiez-le.</span>
          <textarea className="input diag-text" readOnly value={text} rows={8} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </>
  );
}

function Dot({ tone }: { tone?: Tone }) {
  return <span className={`status-dot ${tone === 'ok' ? 'ready' : tone === 'warn' ? 'loading' : tone === 'bad' ? 'error' : 'idle'}`} aria-hidden />;
}

export function DiagnosticsPanel() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    const un = onJournal(() => tick((n) => n + 1));
    return () => {
      window.clearInterval(id);
      un();
    };
  }, []);
  const crash = recentCrash();
  const flags = debugFlags();
  const entries = journalEntries();

  return (
    <div className="diag">
      <div className={`diag-banner ${crash ? 'bad' : 'ok'}`}>
        <Icon name={crash ? 'warn' : 'ok'} size={18} />
        <span>
          {crash ? (
            <>
              La page a planté à <strong>{traceTime(crash)}</strong>, pendant « {crash.label} ». Copiez le diagnostic et envoyez-le : le
              journal montre ce qui se passait juste avant.
            </>
          ) : (
            'Aucun plantage récent.'
          )}
        </span>
      </div>

      <div className="diag-actions">
        <CopyDiagnosticsButton />
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

      {diagnosticSections().map((s) => (
        <section key={s.title} className="diag-section">
          <h4>{s.title}</h4>
          <dl className="diag-rows">
            {s.rows.map((r) => (
              <div key={r.label} className="diag-row">
                <dt>
                  <Dot tone={r.tone} /> {r.label}
                </dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {(isIOS() || DEBUG_FLAGS.some((f) => flags[f.id])) && (
        <section className="diag-section">
          <h4>Dépannage iPhone</h4>
          <p className="tiny muted" style={{ margin: '0 0 6px' }}>
            Pour isoler ce qui fait planter ou taire l’audio. Activez une option, relancez une conversation, puis copiez le diagnostic.
          </p>
          {DEBUG_FLAGS.map((f) => (
            <label key={f.id} className="switch">
              <span>
                <strong className="small">{f.label}</strong>
                <span className="tiny muted" style={{ display: 'block' }}>
                  {f.hint}
                </span>
              </span>
              <input
                type="checkbox"
                checked={!!flags[f.id]}
                onChange={(e) => {
                  setDebugFlag(f.id, e.target.checked);
                  tick((n) => n + 1);
                }}
              />
            </label>
          ))}
        </section>
      )}

      <section className="diag-section">
        <div className="diag-journal-head">
          <h4>Journal ({entries.length})</h4>
          <button className="btn ghost sm" onClick={() => clearJournal()}>
            <Icon name="trash" size={14} /> Effacer
          </button>
        </div>
        <ol className="diag-journal">
          {entries
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={`${e.t}-${i}`} className={e.e.startsWith('⚠') ? 'bad' : e.e.startsWith('—') ? 'sep' : undefined}>
                <time>{journalTime(e.t)}</time> {e.e}
              </li>
            ))}
        </ol>
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          Le plus récent en haut. Gardé d’une ouverture de page à l’autre, même après un plantage.
        </p>
      </section>
    </div>
  );
}
