# ☕ Tea Time English

Webapp d'apprentissage de l'anglais **pour francophones**, 100 % gratuite et locale :

- **Test de niveau adaptatif** en 20 questions (A1 → C2) avec barre de progression ;
- **Parcours de 24 unités** (4 par niveau CECRL), 285 exercices, révisions espacées ;
- **Zone de jeu gamifiée** : XP, série de jours avec jokers, quêtes, badges, 9 mini-jeux ;
- **Emma, prof d'anglais vocale** : avatar 2D illustré avec synchronisation labiale. Elle pose des questions par thème (voyages, travail, vie perso…) et corrige vos fautes à l'oral.

Aucun compte, aucun serveur, aucun service payant : l'IA (dialogue, voix, reconnaissance vocale) tourne **dans le navigateur**.

> Le benchmark des applications et des méthodes papier, la recherche en acquisition des langues et les choix de conception sont détaillés dans [docs/ANALYSE.md](docs/ANALYSE.md). Ce document est aussi consultable dans l'app (menu « Méthode »).

## Démarrer

Prérequis : Node.js ≥ 20.

```bash
npm install
```

```bash
npm run dev
```

Ouvrez ensuite http://localhost:5173. Navigateur recommandé : **Chrome ou Edge récent**, qui offre WebGPU et la reconnaissance vocale.

Les autres commandes :

```bash
npm test
```

```bash
npm run build
```

```bash
npm run preview
```

`npm test` lance 119 tests unitaires : correcteur, test adaptatif, contenus, synchronisation labiale, compréhension des réponses par Emma, ré-échantillonnage audio et transcriptions. `npm run build` produit le build de production dans `dist/`, et `npm run preview` le sert localement.

## Tester sur un téléphone (HTTPS, sans alerte)

Le micro, WebGPU et l'IA locale n'acceptent qu'une page sécurisée (HTTPS). Cette commande sert l'appli en HTTPS sur le Wi-Fi, avec un certificat signé par une autorité de certification (AC) locale :

```bash
npm run dev:mobile
```

1. Téléphone sur le même Wi-Fi que le PC : ouvrez **une seule fois** l'adresse `http://<ip-du-pc>:5444` affichée dans le terminal, puis installez le certificat. La page explique la marche à suivre sur Android et sur iPhone.
2. Ouvrez ensuite `https://<ip-du-pc>:5443` : il n'y a plus d'alerte de sécurité. « Ajouter à l'écran d'accueil » permet de lancer l'appli comme une application.

L'AC est créée une seule fois dans `.cert/`, dossier exclu de Git. Elle est **limitée** aux adresses privées (10.x, 172.16-31.x, 192.168.x, 127.x) et aux noms `localhost` / `.local` : elle ne peut pas servir à usurper un vrai site. Gardez tout de même `.cert/ca.key` privé.

Le certificat du serveur est régénéré à chaque lancement pour l'adresse IP actuelle du PC. Ce mode utilise les ports 5443 et 5444 : il peut tourner en même temps que `npm run dev`. Au premier lancement, Windows peut demander d'autoriser Node.js sur le réseau privé.

## Technologies (gratuites, choisies pour la performance)

| Besoin | Techno | Pourquoi |
|---|---|---|
| Interface | **React 19 + TypeScript + Vite 8** | Build très rapide. Pages chargées à la demande et moteurs IA dans des chunks séparés, donc un premier écran léger (≈ 90 ko gzip). |
| Dialogue / correction | **WebLLM** (MLC) dans un Web Worker, WebGPU | LLM open source exécuté sur le GPU de l'utilisateur. Par défaut Llama 3.2 3B ; au choix Qwen 2.5 1.5B, Llama 3.2 1B, Phi 3.5, Llama 3.1 8B. Le modèle est mis en cache après le 1er téléchargement. |
| Alternatives IA | **Ollama** (local) · **IA intégrée de Chrome** (Gemini Nano) · **mode scripté** | Ollama pour des modèles plus gros. Le mode scripté fonctionne partout sans IA : questions prédéfinies et correcteur par règles. |
| Voix d'Emma | **Kokoro-82M** (`kokoro-js`, Apache 2.0) ou **Piper** (VITS, MIT, voix LJSpeech du domaine public) dans un Web Worker | Voix neuronale jouée par Web Audio, phrase par phrase. Kokoro, très naturelle, sur **GPU (WebGPU, ≈ 320 Mo)** choisi automatiquement quand il est disponible, sinon processeur (WASM 8 threads, ≈ 90 Mo) avec un tampon adaptatif anti-saccades. Sur un appareil trop lent pour elle (téléphone, iPhone sans multi-thread), **Piper** (≈ 64 Mo, ≈ 10× plus rapide) prend le relais. Repli sur la synthèse du système, en dernier recours sur iPhone : elle y est muette en mode silencieux. |
| Reconnaissance vocale | **Web Speech API** ou **Whisper** (Transformers.js) | Micro **ouvert en permanence** dans la conversation, avec transcription en direct. Web Speech est rapide ; s'il est injoignable (erreur réseau, navigateur intégré, Brave), l'app bascule seule sur Whisper, 100 % local. L'audio est ré-échantillonné à 16 kHz avec un filtre anti-repliement et le silence de fin est retiré avant transcription ; les résultats cumulatifs de Chrome Android sont dédoublonnés. |
| Compréhension des réponses | **multi-qa-MiniLM-L6** (Transformers.js, ≈ 23 Mo, WASM) + règles | Emma vérifie que la réponse se rapporte à sa question (similarité question → réponse). Hors sujet : elle dit ce qu'elle a entendu et repose la question, ou suit l'apprenant s'il parle d'un autre thème puis revient au plan. Elle répond aux questions qu'on lui pose, repère le français, « je ne sais pas », les demandes de répétition, reprend un détail de la réponse et corrige le temps du verbe (« Where did you go? » → *I went*). Sert aussi d'indice au LLM. |
| Analyse de prononciation | **wav2vec2-lv-60-espeak** (Transformers.js, ≈ 320 Mo, WASM ; désactivée par défaut sur téléphone) + **eSpeak-NG** (`phonemizer`) | Le modèle transcrit les **phonèmes réellement prononcés**, sans modèle de langue (il ne « corrige » pas). La comparaison avec la prononciation attendue repère les erreurs typiques : TH, H muet, R de gorge, voyelles nasales ou françaises, /ɪ/–/iː/, /æ/, diphtongues… Les mots concernés sont soulignés, avec un conseil en français, et un bilan correctif est proposé en fin de conversation. |
| Lip-sync | Moteur maison | Phonèmes IPA (fournis par Kokoro) → 14 visèmes, synchronisés avec l'horloge audio et modulés par l'enveloppe audio réelle. Co-articulation entre visèmes. Pour les voix système : graphèmes → visèmes, recalés à chaque mot. |
| Avatar | SVG animé en `requestAnimationFrame` | Aucun re-render React par frame. Clignements, regard, sourcils, expressions, mouvements de tête ; respecte `prefers-reduced-motion`. |
| Stockage | `localStorage` + Cache Storage | Progression, révisions et réglages stockés localement, avec export/import JSON. |

### Performance

- `vite.config.ts` envoie les en-têtes `COOP: same-origin` et `COEP: credentialless`. La page est alors `crossOriginIsolated`, ce qui active le WASM multi-thread d'onnxruntime (Kokoro, Whisper) tout en autorisant le téléchargement des modèles depuis Hugging Face.
- Chaque moteur IA tourne dans un Web Worker : l'interface reste fluide pendant l'inférence. Sur iPhone / iPad, la voix, Whisper et la compréhension partagent un seul worker, donc un seul onnxruntime et un seul tas mémoire WASM (qui ne fait que grandir) : séparés, ils dépassaient la mémoire qu'iOS accorde à l'onglet, qui plantait et se rechargeait en pleine conversation (≈ 1,8 Go contre ≈ 1 Go mesurés).
- Rechargement automatique (une fois) si un module de page est introuvable après une mise à jour, ou si la voix échoue ou se bloque au chargement. Une page tuée en pleine conversation est détectée au lancement suivant (Réglages → « Diagnostic audio »).
- La réponse du LLM est **streamée** : chaque phrase terminée part aussitôt en synthèse vocale.
- Préchauffages : Kokoro et WebLLM font une inférence à vide au chargement, pour éviter la latence de compilation à la première réplique.
- iPhone / iPad : la voix passe par Web Audio avec la session audio « playback » (audible en mode silencieux), et le micro est réellement refermé pendant qu'Emma parle, puis rouvert : micro ouvert, iOS bascule en session d'appel (voix dans l'écouteur, très faible, voire coupée). Réglages → « Diagnostic audio » affiche l'état en direct si Emma reste muette.
- Téléphone : voix sur processeur (8 bits, ≈ 90 Mo) et Whisper sur processeur, analyse de prononciation désactivée par défaut. Chaque chargement de modèle est noté dans `localStorage` : si l'onglet a planté pendant un chargement (mémoire insuffisante), la page ne le relance pas en boucle au rechargement — repli sur le processeur, puis arrêt des chargements automatiques (bouton « Télécharger » pour réessayer).
- Thèmes : `color-scheme: only light` et `<meta name="darkreader-lock">` empêchent les modes sombres forcés (Brave, Chrome Android « assombrir les sites », Dark Reader) d'inverser le thème clair ; le thème sombre a sa propre palette.

Mesures en Chrome headless sur cette machine :

| Mesure | Résultat |
|---|---|
| Voix sur GPU | 1re phrase entendue 1,2 s après le clic, génération 3× plus rapide que la parole, aucun trou entre les phrases |
| Voix sur processeur | génération ≈ temps réel ; le tampon adaptatif supprime les trous (au prix d'une courte attente avant de parler) |
| Lip-sync | 80 formes de bouche distinctes en 12 s de parole |
| Llama 3.2 3B | ≈ 9 s par réplique complète (la voix démarre avant la fin) |
| Whisper base | transcription en ≈ 1 s |

## Déploiement statique

`npm run build` puis servez `dist/` sur n'importe quel hébergeur statique gratuit : Netlify, Cloudflare Pages, GitHub Pages…

**GitHub Pages (en place)** : le workflow `.github/workflows/deploy.yml` lance les tests, construit l'appli et la publie à chaque push sur `main`.

Pour le multi-thread WASM, l'hébergeur doit envoyer les en-têtes COOP/COEP. Le fichier `public/_headers` est pris en charge par Netlify et Cloudflare Pages. GitHub Pages ne les envoie pas : le service worker `public/coi-serviceworker.js` (MIT) les ajoute, au prix d'un rechargement automatique à la toute première visite. Il n'est pas installé sur iPhone / iPad : WebKit ne gère pas `credentialless`, il n'y apporterait que des rechargements. Sans ces en-têtes, l'app fonctionne quand même : la voix neuronale est simplement plus lente en mode CPU, et WebGPU n'est pas concerné.

## Utiliser Ollama (facultatif)

1. Installez [Ollama](https://ollama.com).
2. Téléchargez un modèle :

```bash
ollama pull llama3.2:3b
```

3. Autorisez l'origine de l'app, puis lancez le serveur. Sous PowerShell :

```powershell
$env:OLLAMA_ORIGINS="*"; ollama serve
```

4. Dans l'app : **Réglages → Intelligence artificielle → Ollama**.

## Ce qui est appliqué de la recherche et des meilleures pratiques

- **Pédagogie contrastive pour francophones** : chaque unité a un « piège francophone ». Le correcteur (≈ 60 règles testées) cible les fautes typiques : *I have 25 years*, *since 3 years*, *I am agree*, *depend of*, *explain me*, *informations*, *if I will*, *have went*, *go in Japan*… Les explications sont en français.
- **Feedback correctif** : Emma reformule à l'oral (recast) puis affiche la correction en diff (barré / ajouté) avec une explication. On peut redire la phrase corrigée au micro, ce qui travaille la prise en compte de la correction (*uptake*).
- **Récupération active et répétition espacée** : boîtes de Leitner (1, 3, 7, 16, 35 jours). Les mots de chaque leçon, les exercices ratés et les phrases corrigées par Emma y entrent automatiquement.
- **Maîtrise** : un exercice raté revient en fin de leçon. Les exercices voisins sont légèrement entrelacés (*interleaving*).
- **Test adaptatif** : modèle IRT 3PL avec mise à jour bayésienne de l'aptitude. La question suivante est choisie au niveau estimé, en alternant les compétences. Le bouton « Je ne sais pas » évite les réponses au hasard. Validé en simulation : le niveau d'un apprenant simulé est retrouvé à ±1 niveau dans plus de 85 % des cas.
- **UX** :
  - mobile-first, navigation par onglets, raccourcis clavier (1-4, Entrée) ;
  - feedback signalé par la couleur, une icône et un texte, annonces `aria-live` ;
  - thème clair/sombre, mouvements réduits respectés ;
  - « Je ne peux pas parler maintenant » ;
  - temps de réflexion réglable avant qu'Emma reprenne la parole, sous-titres activables, réécoute lente 🐢 ;
  - aucune vie ni pénalité, aucun faux classement.

## Structure

```
src/
  data/            contenus : test (72 q.), leçons A1→C2, thèmes du tuteur, faux amis, paires minimales
  lib/             store + gamification, test adaptatif, correcteur, texte, TTS, STT, LLM, lip-sync
  workers/         Kokoro / Piper (TTS), Whisper (STT), MiniLM, WebLLM (LLM) ; *.core.ts servis seuls ou dans models.worker.ts (iPhone)
  tutor/           avatar SVG + moteur pédagogique d'Emma
  components/      exercices, UI partagée
  pages/           accueil, test, parcours, leçon, révisions, jeux, Emma, réglages, méthode
  games/           9 mini-jeux
docs/ANALYSE.md    benchmark et justification pédagogique
```

## Confidentialité

- Toutes les données restent dans le navigateur.
- Seule exception : avec la reconnaissance vocale **du navigateur**, Chrome envoie l'audio au service de Google. Choisissez **Whisper local** dans les réglages pour un fonctionnement 100 % hors ligne, une fois les modèles en cache.

## Limites connues

- Les petits LLM locaux se trompent parfois. Les explications venant de l'IA sont marquées 🤖 ; celles des règles sont vérifiées.
- WebGPU est nécessaire pour WebLLM. Sinon, utilisez Ollama ou le mode scripté.
- Le test de niveau n'évalue ni l'expression orale ni l'écrit productif : c'est une estimation de départ.
