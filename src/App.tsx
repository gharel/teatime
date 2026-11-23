import { lazy, Suspense, useEffect, useRef, type ComponentType } from 'react';
import { useRoute, ToastZone, Confetti, navigate, notify, resolvedTheme, ThemeToggle } from './components/ui';
import { onSttNotice } from './lib/stt';
import { dueCards, useAppState, getState } from './lib/store';
import { onTtsNotice, tts } from './lib/tts';
import { autoReload } from './lib/recover';
import Home from './pages/Home';
import Icon, { type IconName } from './components/Icon';

/** Page chargée à la demande ; module introuvable (appli mise à jour entre-temps) : rechargement. */
function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err) => {
      autoReload('page introuvable (mise à jour de l’appli)');
      throw err;
    }),
  );
}

const Placement = page(() => import('./pages/Placement'));
const Path = page(() => import('./pages/Path'));
const Lesson = page(() => import('./pages/Lesson'));
const Review = page(() => import('./pages/Review'));
const Arcade = page(() => import('./pages/Arcade'));
const Tutor = page(() => import('./pages/Tutor'));
const Settings = page(() => import('./pages/Settings'));
const Method = page(() => import('./pages/Method'));

const TITLES: Record<string, string> = {
  '': 'Accueil',
  test: 'Test de niveau',
  parcours: 'Parcours',
  lecon: 'Leçon',
  revisions: 'Révisions',
  jeux: 'Zone de jeu',
  emma: 'Parler avec Emma',
  reglages: 'Réglages',
  methode: 'Méthode',
};

const NAV: { path: string; icon: IconName; label: string }[] = [
  { path: '/', icon: 'home', label: 'Accueil' },
  { path: '/parcours', icon: 'path', label: 'Parcours' },
  { path: '/emma', icon: 'chat', label: 'Emma' },
  { path: '/jeux', icon: 'games', label: 'Jeux' },
  { path: '/revisions', icon: 'review', label: 'Révisions' },
];

function Page({ route }: { route: string }) {
  const [, seg, arg] = route.split('/');
  switch (seg) {
    case '':
      return <Home />;
    case 'test':
      return <Placement />;
    case 'parcours':
      return <Path />;
    case 'lecon':
      return <Lesson key={arg} unitId={arg ?? ''} />;
    case 'revisions':
      return <Review />;
    case 'jeux':
      return <Arcade key={arg ?? 'hub'} game={arg} />;
    case 'emma':
      return <Tutor />;
    case 'reglages':
      return <Settings />;
    case 'methode':
      return <Method />;
    default:
      return <Home />;
  }
}

export default function App() {
  const route = useRoute();
  const theme = useAppState((s) => s.settings.theme);
  const due = useAppState((s) => dueCards(s).length);
  const immersive = route.startsWith('/lecon/') || route === '/test';

  // Thème : attribut sur <html> + couleur de la barre du navigateur mobile, en suivant le système en mode auto.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (theme === 'auto') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      document.getElementById('meta-theme')?.setAttribute('content', resolvedTheme(theme) === 'dark' ? '#11161a' : '#FFF9F2');
      // Mode sombre forcé (Brave, Chrome Android) : on déclare nos thèmes pour qu'il n'inverse rien.
      document
        .getElementById('meta-color-scheme')
        ?.setAttribute('content', theme === 'light' ? 'only light' : theme === 'dark' ? 'dark' : 'light dark');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Titre de l'onglet + focus sur le contenu à chaque changement de page (lecteurs d'écran).
  const firstRender = useRef(true);
  useEffect(() => {
    const seg = route.split('/')[1] ?? '';
    document.title = `${TITLES[seg] ?? 'Tea Time English'} · Tea Time English`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [route]);

  // Bascule automatique de reconnaissance vocale (ex. service en ligne injoignable) : on prévient l'apprenant.
  useEffect(() => {
    const un = onSttNotice((msg) => notify('mic', msg, 6000));
    // Lecteur de la voix bloqué (iPhone) : un toucher le rétablit.
    const unTts = onTtsNotice((msg) => notify('speaker', msg, 8000));
    return () => {
      un();
      unTts();
    };
  }, []);

  useEffect(() => {
    // Voix neuronale déjà téléchargée ? On la recharge depuis le cache en arrière-plan,
    // pour que leçons, dictées et jeux profitent aussi de la voix naturelle.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 4000 }) : w.setTimeout(cb, 1500));
    idle(() => {
      if (getState().settings.ttsEngine === 'system' || tts.neural.status !== 'idle') return;
      void tts.neuralCached().then((cached) => cached && tts.loadNeural());
    });
  }, []);

  const isActive = (p: string) => (p === '/' ? route === '/' : route.startsWith(p));
  const link = (n: { path: string; icon: IconName; label: string }) => (
    <a
      key={n.path}
      href={`#${n.path}`}
      className="nav-link"
      aria-current={isActive(n.path) ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(n.path);
      }}
    >
      <span className="ico" aria-hidden>
        <Icon name={n.icon} size={22} strokeWidth={isActive(n.path) ? 2.4 : 1.9} />
      </span>
      {n.label}
      {n.path === '/revisions' && due > 0 && <span className="nav-badge">{due > 99 ? '99+' : due}</span>}
    </a>
  );

  return (
    <div className={`app${immersive ? ' immersive' : ''}`}>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <nav className="sidebar" aria-label="Navigation principale">
        <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          <img src="./favicon.svg" alt="" />
          <span className="brand-name">Tea Time English</span>
        </a>
        {NAV.map(link)}
        {link({ path: '/test', icon: 'test', label: 'Test de niveau' })}
        {link({ path: '/methode', icon: 'method', label: 'Méthode' })}
        {link({ path: '/reglages', icon: 'settings', label: 'Réglages' })}
        <div className="sidebar-foot">
          <ThemeToggle withLabel />
          <br />
          100 % gratuit · IA locale
          <br />
          Vos données restent sur cet appareil.
        </div>
      </nav>
      <main id="main" className="main" tabIndex={-1}>
        {!immersive && (
          <header className="mobile-header mobile-only">
            <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
              <img src="./favicon.svg" alt="" />
              <span className="brand-name">Tea Time</span>
            </a>
            <div className="row" style={{ gap: 6 }}>
              <ThemeToggle />
              <a className="btn ghost sm icon-sm" href="#/methode" onClick={(e) => { e.preventDefault(); navigate('/methode'); }} aria-label="Méthode" title="Méthode"><Icon name="method" size={18} /></a>
              <a className="btn ghost sm icon-sm" href="#/reglages" onClick={(e) => { e.preventDefault(); navigate('/reglages'); }} aria-label="Réglages" title="Réglages"><Icon name="settings" size={18} /></a>
            </div>
          </header>
        )}
        <Suspense
          fallback={
            <div className="page-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden /> Chargement…
            </div>
          }
        >
          <Page route={route} />
        </Suspense>
      </main>
      <nav className="bottom-nav" aria-label="Navigation principale">
        {NAV.map(link)}
      </nav>
      <ToastZone />
      <Confetti />
    </div>
  );
}
