import { describe, expect, it } from 'vitest';
import { entryScript } from './update';

describe('entryScript', () => {
  it('trouve le code d’entrée de la page construite', () => {
    const html = `<script>var x = /\\/assets\\/index-[^/]*\\.(js|css)$/;</script>
    <script src="./coi-serviceworker.js"></script>
    <script type="module" crossorigin src="./assets/index-DZqXr6CH.js"></script>
    <link rel="modulepreload" crossorigin href="./assets/jsx-runtime-gzR6375A.js">
    <link rel="stylesheet" crossorigin href="./assets/index-Cjm0stsH.css">`;
    expect(entryScript(html)).toBe('index-DZqXr6CH.js');
  });

  it('accepte un tiret dans l’empreinte', () => {
    expect(entryScript('<script type="module" src="./assets/index-a-B_9.js"></script>')).toBe('index-a-B_9.js');
  });

  it('rien en développement ni sur une page inattendue', () => {
    expect(entryScript('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
    expect(entryScript('<html><body>Erreur 503</body></html>')).toBeNull();
  });
});
