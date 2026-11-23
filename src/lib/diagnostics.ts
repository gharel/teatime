/* ------------------------------------------------------------------
 * Diagnostic audio : état de la voix, du micro, des modèles et des
 * incidents, plus le journal des derniers événements. Affiché dans les
 * réglages et copiable d'un geste pour être transmis tel quel.
 * ------------------------------------------------------------------ */
import { audioSessionType, captureActive, DEBUG_FLAGS, debugFlags, isIOS } from './device';
import { journalEntries, journalTime } from './journal';
import { sharedModelWorker } from './modelWorker';
import { lastAutoReload, lastCrash, traceTime, type Trace } from './recover';
import { pron } from './pron';
import { semantic } from './semantic';
import { getState } from './store';
import { resolveSttEngine, whisper } from './stt';
import { tts } from './tts';

export type Tone = 'ok' | 'warn' | 'bad';

export interface DiagRow {
  label: string;
  value: string;
  tone?: Tone;
}

export interface DiagSection {
  title: string;
  rows: DiagRow[];
}

const STATUS_FR: Record<string, string> = {
  idle: 'pas chargé',
  loading: 'chargement',
  ready: 'prêt',
  error: 'erreur',
  unsupported: 'indisponible ici',
};

/** « prêt · détail » */
export function statusText(st: { status: string; detail?: string }): string {
  return `${STATUS_FR[st.status] ?? st.status}${st.detail ? ` · ${st.detail}` : ''}`;
}

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** Plantage récent (moins de 24 h) : mis en avant. */
export function recentCrash(): Trace | null {
  const c = lastCrash();
  return c && Date.now() - c.t < 24 * 3600_000 ? c : null;
}

function browser(): string {
  const ua = navigator.userAgent;
  const m = ua.match(/(Brave|CriOS\/[\d.]+|FxiOS\/[\d.]+|EdgiOS\/[\d.]+|Edg\/\d+|Chrome\/\d+|Firefox\/\d+|Version\/[\d.]+( Mobile)?)/);
  const os = ua.match(/(iPhone OS|CPU OS|Android|Windows NT|Mac OS X) ?([\d_.]+)?/);
  return `${isIOS() ? 'iOS (WebKit)' : 'autre'} · ${os ? `${os[1]} ${(os[2] ?? '').replace(/_/g, '.')}`.trim() : '?'} · ${m?.[0] ?? '?'}`;
}

export function diagnosticSections(): DiagSection[] {
  const iso = typeof self !== 'undefined' && self.crossOriginIsolated;
  const session = audioSessionType();
  const stt = resolveSttEngine();
  const ws = whisper.status;
  const crash = lastCrash();
  const reload = lastAutoReload();
  const flags = debugFlags();
  const active = DEBUG_FLAGS.filter((f) => flags[f.id]);
  return [
    {
      title: 'Incidents',
      rows: [
        { label: 'Dernier plantage', value: crash ? `${traceTime(crash)} · pendant « ${crash.label} »` : 'aucun', tone: recentCrash() ? 'bad' : 'ok' },
        { label: 'Rechargement auto', value: reload ? `${traceTime(reload)} · ${reload.label}` : 'aucun' },
        { label: 'Options de dépannage', value: active.length ? active.map((f) => f.label).join(' ; ') : 'aucune' },
      ],
    },
    { title: 'Voix d’Emma', rows: tts.diagnostics() },
    {
      title: 'Micro et écoute',
      rows: [
        { label: 'Micro', value: captureActive() ? 'ouvert' : 'fermé' },
        { label: 'Session audio iOS', value: session ?? 'API absente' },
        {
          label: 'Reconnaissance',
          value:
            stt === 'whisper'
              ? `Whisper · ${statusText(ws)}${whisper.slow ? ' · lent (sans aperçu)' : ''}`
              : 'reconnaissance du navigateur',
          tone: stt === 'whisper' ? (ws.status === 'ready' ? 'ok' : ws.status === 'error' ? 'bad' : undefined) : undefined,
        },
        { label: 'Compréhension', value: statusText(semantic.status) },
        {
          label: 'Analyse de prononciation',
          value: getState().settings.pronAnalysis ? `activée · ${statusText(pron.status)}` : 'désactivée',
          tone: getState().settings.pronAnalysis && isIOS() ? 'warn' : undefined,
        },
      ],
    },
    {
      title: 'Appareil',
      rows: [
        { label: 'Version de l’appli', value: APP_VERSION },
        { label: 'Navigateur', value: browser() },
        { label: 'Calcul', value: `${iso ? 'isolé (multi-thread)' : 'non isolé (1 thread)'} · ${navigator.hardwareConcurrency || '?'} cœurs` },
        { label: 'Modèles', value: sharedModelWorker() ? 'un seul moteur partagé (économie de mémoire)' : 'un moteur par modèle' },
      ],
    },
  ];
}

/** Texte brut à coller tel quel (conversation, ticket…). */
export function diagnosticText(): string {
  const lines = [`Tea Time English · diagnostic audio`, `Version ${APP_VERSION} · copié le ${new Date().toLocaleString('fr-FR')}`, ''];
  for (const s of diagnosticSections()) {
    lines.push(`[${s.title}]`);
    for (const r of s.rows) lines.push(`${r.tone === 'bad' ? '✗ ' : r.tone === 'warn' ? '! ' : ''}${r.label} : ${r.value}`);
    lines.push('');
  }
  const j = journalEntries();
  lines.push(`[Journal : ${j.length} derniers événements, du plus ancien au plus récent]`);
  for (const e of j) lines.push(`${journalTime(e.t)} ${e.e}`);
  return lines.join('\n');
}
