import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import './styles.css';
import App from './App';
import { autoReload } from './lib/recover';

// Module d'une page introuvable : l'appli a été mise à jour pendant que cette page était ouverte (ou en
// cache). Un rechargement récupère la nouvelle version.
window.addEventListener('vite:preloadError', (e) => {
  if (autoReload('module introuvable (mise à jour de l’appli)')) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(<App />);
