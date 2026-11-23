/* Petits composants et utilitaires d'interface partagés. */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Level } from '../types';
import { getState, updateSettings, useAppState, type Badge } from '../lib/store';
import { tts } from '../lib/tts';
import { captureActive, debugFlag, isIOS } from '../lib/device';
import { journal } from '../lib/journal';
import Icon, { badgeIcon, type IconName } from './Icon';
import type { LucideIcon } from 'lucide-react';

/* ------------------------------ Routage ------------------------------ */

function currentHash() {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    currentHash,
  );
}

export function navigate(path: string) {
  if (currentHash() === path) return;
  window.location.hash = path;
  window.scrollTo({ top: 0 });
}

/* ------------------------------ Toasts ------------------------------ */

interface Toast {
  id: number;
  icon: IconName | LucideIcon;
  text: ReactNode;
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastId = 1;

export function notify(icon: IconName | LucideIcon, text: ReactNode, ms = 3200) {
  const t = { id: toastId++, icon, text };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, ms);
}

export function notifyBadges(badges: Badge[]) {
  for (const b of badges) {
    notify(badgeIcon(b.id), <span>Badge débloqué : {b.title} !</span>, 4200);
    sfx('win');
  }
}

export function ToastZone() {
  const list = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
  );
  return (
    <div className="toast-zone" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          <span className="ico" aria-hidden>
            {typeof t.icon === 'string' ? <Icon name={t.icon} size={22} /> : <t.icon size={22} />}
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Confettis ------------------------------ */

let confettiListener: ((n: number) => void) | null = null;
export function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  confettiListener?.(Date.now());
}

export function Confetti() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    confettiListener = setKey;
    return () => {
      confettiListener = null;
    };
  }, []);
  const [pieces, setPieces] = useState<{ left: number; delay: number; dur: number; color: string; rot: number }[]>([]);
  useEffect(() => {
    if (!key) return;
    const colors = ['#0E7C74', '#36C2B4', '#F5B83D', '#3C6FD6'];
    setPieces(
      Array.from({ length: 36 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.6 + Math.random() * 1.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 360,
      })),
    );
    const t = window.setTimeout(() => setPieces([]), 3400);
    return () => window.clearTimeout(t);
  }, [key]);
  if (!pieces.length) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------ Thème ------------------------------ */

const THEME_LABEL = { auto: 'Automatique', light: 'Clair', dark: 'Sombre' } as const;
const THEME_ICON = { auto: 'auto', light: 'sun', dark: 'moon' } as const;

/** Thème effectivement affiché (« auto » suit le système). */
export function resolvedTheme(theme: 'auto' | 'light' | 'dark'): 'light' | 'dark' {
  if (theme !== 'auto') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Bascule auto → clair → sombre, avec une courte transition de couleurs. */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const theme = useAppState((s) => s.settings.theme);
  const next = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  return (
    <button
      className={`btn ghost sm theme-toggle${withLabel ? ' with-label' : ''}`}
      onClick={() => {
        const root = document.documentElement;
        root.classList.add('theme-anim');
        window.setTimeout(() => root.classList.remove('theme-anim'), 400);
        updateSettings({ theme: next });
      }}
      aria-label={`Thème : ${THEME_LABEL[theme]}. Passer au thème ${THEME_LABEL[next].toLowerCase()}`}
      title={`Thème : ${THEME_LABEL[theme]} (cliquer pour ${THEME_LABEL[next].toLowerCase()})`}
    >
      <Icon name={THEME_ICON[theme]} size={18} />
      {withLabel && <span>Thème : {THEME_LABEL[theme]}</span>}
    </button>
  );
}

/* ------------------------------ Sons (WebAudio, sans fichiers) ------------------------------ */

let sfxCtx: AudioContext | null = null;
export function sfx(kind: 'ok' | 'ko' | 'win' | 'tick' | 'pop') {
  if (!getState().settings.sfx) return;
  // Retour haptique discret sur mobile
  try {
    if (kind === 'ok') navigator.vibrate?.(12);
    else if (kind === 'ko') navigator.vibrate?.([25, 40, 25]);
    else if (kind === 'win') navigator.vibrate?.([15, 30, 15, 30, 40]);
  } catch {
    /* non supporté */
  }
  try {
    // iPhone : les effets passent par le lecteur audio de la voix. Un 2e lecteur, créé à la première
    // réponse juste quand le micro se referme et que la session audio change, est un suspect du
    // plantage de l'onglet ; iOS limite de toute façon le nombre de lecteurs.
    const shared = isIOS() && !debugFlag('separateSfx');
    // iPhone, micro ouvert : le lecteur est en pause pendant l'écoute, et le micro entendrait l'effet.
    if (shared && captureActive()) {
      journal(`effet sonore « ${kind} » sauté (micro ouvert)`);
      return;
    }
    const ctx = shared ? tts.outputContext() : (sfxCtx ??= new AudioContext());
    if (!ctx) return;
    if (isIOS()) journal(`effet sonore « ${kind} » (${shared ? 'lecteur de la voix' : 'lecteur séparé'})`);
    const notes: Record<typeof kind, [number, number][]> = {
      ok: [[660, 0], [990, 0.08]],
      ko: [[220, 0], [180, 0.1]],
      win: [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.3]],
      tick: [[880, 0]],
      pop: [[740, 0]],
    };
    const type: OscillatorType = kind === 'ko' ? 'triangle' : 'sine';
    for (const [f, t] of notes[kind]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      const start = ctx.currentTime + t;
      const len = kind === 'tick' ? 0.05 : 0.16;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.connect(g).connect(ctx.destination);
      o.start(start);
      o.stop(start + len + 0.02);
    }
  } catch {
    /* audio indisponible */
  }
}

/* ------------------------------ Éléments visuels ------------------------------ */

/**
 * Rendu minimal des textes pédagogiques : **gras**, *italique*, et les marques
 * ❌/✗ (forme fautive) et ✅/✓ (forme correcte) affichées en icônes sobres.
 */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|❌|✗|✅|✓)/g).map((part, i) =>
        part === '❌' || part === '✗' ? (
          <Icon key={i} name="ko" size={16} className="rich-mark ko" label="incorrect" />
        ) : part === '✅' || part === '✓' ? (
          <Icon key={i} name="ok" size={16} className="rich-mark ok" label="correct" />
        ) : part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
          <em key={i}>{part.slice(1, -1)}</em>
        ) : (
          <span key={i}>{part.replace(/️/g, '')}</span>
        ),
      )}
    </>
  );
}

export function LevelBadge({ level, xl = false }: { level: Level; xl?: boolean }) {
  return (
    <span className={`level-badge${xl ? ' xl' : ''}`} data-lv={level} aria-label={`Niveau ${level}`}>
      {level}
    </span>
  );
}

export function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${n} étoile${n > 1 ? 's' : ''} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < n ? '' : 'off'}>
          <Icon name="star" size={16} style={{ fill: 'currentColor' }} />
        </span>
      ))}
    </span>
  );
}

export function ProgressBar({ value, label, gold = false, thin = false }: { value: number; label: string; gold?: boolean; thin?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={`progress${gold ? ' gold' : ''}${thin ? ' thin' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, children, label }: { value: number; children: ReactNode; label: string }) {
  return (
    <div className="ring" style={{ ['--p' as string]: Math.round(Math.min(1, value) * 100) }} role="img" aria-label={label}>
      <div>{children}</div>
    </div>
  );
}

/** S'abonne à un service (tts, llm, whisper) exposant subscribe() et un statut. */
export function useService<T>(svc: { subscribe(l: () => void): () => void }, read: () => T): T {
  const [v, setV] = useState(read);
  useEffect(() => {
    const un = svc.subscribe(() => setV(read()));
    setV(read());
    return () => {
      un();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc]);
  return v;
}

export function useKey(handler: (e: KeyboardEvent) => void, deps: unknown[]) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // le bouton gère son propre clic
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key !== 'Enter') return;
      }
      handler(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
