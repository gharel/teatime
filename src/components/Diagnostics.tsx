/* ------------------------------------------------------------------
 * Panneau « Diagnostic audio » : état en direct, incidents, options de
 * dépannage (iPhone) et journal, avec un bouton pour tout copier.
 * ------------------------------------------------------------------ */
import { useEffect, useRef, useState } from 'react';
import { diagnosticSections, diagnosticText, recentCrash, type Tone } from '../lib/diagnostics';
import { DEBUG_FLAGS, debugFlags, isIOS, setDebugFlag } from '../lib/device';
import { clearJournal, journal, journalEntries, journalTime, onJournal } from '../lib/journal';
import { traceTime } from '../lib/recover';
import { say, tts } from '../lib/tts';
import Icon from './Icon';

/**
 * Copie synchrone, pendant le toucher : seule méthode fiable sur iOS (Safari, et surtout les
 * navigateurs WKWebView comme Brave, où l'API Clipboard échoue ou ne répond jamais).
 */
function copyNow(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  // 16 px : pas de zoom automatique d'iOS ; hors de l'écran mais sélectionnable.
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;width:10px;height:10px;font-size:16px;opacity:0;';
  ta.contentEditable = 'true';
  ta.readOnly = false;
  document.body.appendChild(ta);
  let ok = false;
  try {
    const range = document.createRange();
    range.selectNodeContents(ta);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
    sel?.removeAllRanges();
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** API Clipboard, abandonnée si elle ne répond pas (WKWebView). */
function copyAsync(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return Promise.resolve(false);
  return Promise.race([
    navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((r) => window.setTimeout(() => r(false), 1500)),
  ]);
}

/** Boutons « Copier le diagnostic » et « Partager », avec le texte à sélectionner en dernier recours. */
export function CopyDiagnosticsButton({ className = 'btn primary sm' }: { className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [text, setText] = useState('');
  const [selHint, setSelHint] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state !== 'copied') return;
    const id = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(id);
  }, [state]);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <>
      <button
        className={className}
        onClick={() => {
          const t = diagnosticText();
          setText(t);
          if (copyNow(t)) {
            setState('copied');
            journal('diagnostic copié');
            return;
          }
          void copyAsync(t).then((ok) => {
            setState(ok ? 'copied' : 'manual');
            journal(ok ? 'diagnostic copié (API)' : 'copie du diagnostic refusée : texte affiché');
          });
        }}
      >
        <Icon name={state === 'copied' ? 'check' : 'copy'} size={16} /> {state === 'copied' ? 'Copié !' : 'Copier le diagnostic'}
      </button>
      {canShare && (
        <button
          className="btn sm"
          onClick={() => {
            void navigator.share({ title: 'Diagnostic Tea Time English', text: diagnosticText() }).catch(() => undefined);
          }}
        >
          <Icon name="share" size={16} /> Partager
        </button>
      )}
      {state === 'manual' && (
        <div className="diag-manual">
          <span className="tiny muted">Copie automatique refusée par le navigateur : sélectionnez le texte puis copiez-le.</span>
          <div className="diag-actions">
            <button
              className="btn primary sm"
              onClick={() => {
                const el = ta.current;
                if (!el) return;
                // Texte visible, sélectionné pendant le toucher : la copie y a le plus de chances de passer.
                el.focus({ preventScroll: true });
                el.setSelectionRange(0, el.value.length);
                el.select();
                let ok = false;
                try {
                  ok = document.execCommand('copy');
                } catch {
                  ok = false;
                }
                journal(ok ? 'diagnostic copié (texte sélectionné)' : 'diagnostic sélectionné, copie à faire à la main');
                setSelHint(ok ? 'Copié !' : 'Tout est sélectionné : touchez le texte puis « Copier » dans la bulle.');
              }}
            >
              <Icon name="copy" size={16} /> Tout sélectionner
            </button>
          </div>
          {selHint && <span className="small">{selHint}</span>}
          <textarea ref={ta} className="input diag-text" readOnly value={text} rows={10} />
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
