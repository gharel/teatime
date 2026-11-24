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
| Reconnaissance vocale | **Web Speech API** ou **Whisper** (Transformers.js) | Micro **ouvert en permanence** dans la conversation, avec transcription en direct. Web Speech est rapide ; s'il est injoignable (erreur réseau, navigateur intégré, Brave), l'app bascule seule sur Whisper, 100 % local. Sur iPhone / iPad, Whisper est le moteur par défaut (voir plus bas). L'audio est ré-échantillonné à 16 kHz avec un filtre anti-repliement et le silence de fin est retiré avant transcription ; les résultats cumulatifs de Chrome Android sont dédoublonnés. |
| Compréhension des réponses | **multi-qa-MiniLM-L6** (Transformers.js, ≈ 23 Mo, WASM) + règles | Emma vérifie que la réponse se rapporte à sa question (similarité question → réponse). Hors sujet : elle dit ce qu'elle a entendu et repose la question, ou suit l'apprenant s'il parle d'un autre thème puis revient au plan. Elle répond aux questions qu'on lui pose, repère le français, « je ne sais pas », les demandes de répétition, reprend un détail de la réponse et corrige le temps du verbe (« Where did you go? » → *I went*). Sert aussi d'indice au LLM. |
| Analyse de prononciation | **wav2vec2-lv-60-espeak** (Transformers.js, ≈ 320 Mo, WASM ; désactivée par défaut sur téléphone) + **eSpeak-NG** (`phonemizer`) | Le modèle transcrit les **phonèmes réellement prononcés**, sans modèle de langue (il ne « corrige » pas). La comparaison avec la prononciation attendue repère les erreurs typiques : TH, H muet, R de gorge, voyelles nasales ou françaises, /ɪ/–/iː/, /æ/, diphtongues… Les mots concernés sont soulignés, avec un conseil en français, et un bilan correctif est proposé en fin de conversation. |
| Lip-sync | Moteur maison | Phonèmes IPA (fournis par Kokoro) → 14 visèmes, synchronisés avec l'horloge audio et modulés par l'enveloppe audio réelle. Co-articulation entre visèmes. Pour les voix système : graphèmes → visèmes, recalés à chaque mot. |
| Avatar | SVG animé en `requestAnimationFrame` | Aucun re-render React par frame. Clignements, regard, sourcils, expressions, mouvements de tête ; respecte `prefers-reduced-motion`. |
| Stockage | `localStorage` + Cache Storage | Progression, révisions et réglages stockés localement, avec export/import JSON. Réglages → Mes données : effacement par rubrique (parcours, révisions, conversations avec Emma, jeux, points/série/badges, profil et niveau, réglages ; le reste est gardé, les badges qui reposaient sur des données effacées disparaissent) ou de tout. |

### Performance

- `vite.config.ts` envoie les en-têtes `COOP: same-origin` et `COEP: credentialless`. La page est alors `crossOriginIsolated`, ce qui active le WASM multi-thread d'onnxruntime (Kokoro, Whisper) tout en autorisant le téléchargement des modèles depuis Hugging Face.
- Chaque moteur IA tourne dans un Web Worker : l'interface reste fluide pendant l'inférence. Sur iPhone / iPad, la voix Piper, la compréhension et Whisper partagent un seul worker et un seul onnxruntime, en build WASM simple (`onnxruntime-web/wasm`, sans JSEP ni asyncify : 11 Mo de WASM au lieu de 21,6), 1 thread, sans arène ni plan mémoire : un seul tas mémoire WASM (qui ne fait que grandir). iOS refusait d'allouer le tas d'un second runtime (« RangeError: Out of memory », compréhension indisponible) et des tas séparés dépassaient la mémoire qu'il accorde à l'onglet, qui plantait (≈ 1,8 Go contre ≈ 1 Go mesurés). Dans ce worker, l'import `onnxruntime-web` de Transformers.js est redirigé vers ce build (plugin de `vite.config.ts`). Ailleurs, Piper a son propre worker avec ce même build ; le fichier de son modèle est libéré dès la session créée. Un seul worker de voix sert toute la conversation (la page Emma le garde) ; sur iPhone, ailleurs, il s'arrête après 20 s sans usage pour rendre sa mémoire, et le suivant n'est créé qu'1,5 s après l'arrêt du précédent. La compréhension (MiniLM) ne se charge jamais pendant qu'Emma parle : sur iPhone elle se prépare sur la page Emma, avant « Commencer », et l'indexation des questions n'avance que quand Emma se tait. La voix et Whisper y passent avant l'indexation de fond des questions (compréhension), qui n'avance que quand ils sont au repos : sinon Emma mettait plusieurs secondes à répondre.
- Rechargement automatique (une fois) si un module de page est introuvable après une mise à jour, ou si la voix échoue ou se bloque au chargement. Une page tuée en pleine conversation est détectée au lancement suivant.
- Démarrage surveillé : un écran de démarrage (logo, sablier) s'affiche tant que l'appli n'a pas affiché sa première page. Après une mise à jour du site, le navigateur peut rouvrir une ancienne copie de la page (onglet restauré, cache) qui réclame des fichiers supprimés depuis : la page restait vide (noire en thème sombre) jusqu'à ce qu'on actualise. Elle se recharge maintenant d'elle-même (au plus une fois par minute), sinon l'écran propose « Recharger » ; rien d'affiché après 12 s : même bouton. Une erreur d'affichage montre un message et « Recharger » au lieu d'une page vide (la navigation reste utilisable). Ces incidents sont notés au journal au démarrage suivant, comme le type d'ouverture (actualisation, onglet restauré).
- Nouvelle version au démarrage : un onglet restauré (Brave au lancement sur iPhone) reprend la page en cache sans rien demander au site, même périmée (vérifié dans le simulateur iOS 27), et l'ancienne version tournait jusqu'à ce qu'on actualise. Au démarrage, la page du site est relue sans cache ; si elle charge un autre code, la page se recharge tant que l'apprenant n'a rien touché (au plus une fois toutes les 3 minutes, jamais pendant une conversation), sinon un message invite à actualiser. Noté au journal.
- Réglages → « Diagnostic audio » : état de la voix, du micro et des modèles, mémoire WASM réelle du moteur de voix (taille de chaque tas après chaque phrase, croissance pendant la phrase, pic), incidents, journal horodaté à la milliseconde gardé d'une ouverture à l'autre (même après un plantage), options de dépannage iPhone (micro, session audio, relance du lecteur, effets sonores) et bouton « Copier le diagnostic » (aussi proposé sur la page Emma après un plantage).
- La réponse du LLM est **streamée** : chaque phrase terminée part aussitôt en synthèse vocale.
- Préchauffages : Kokoro et WebLLM font une inférence à vide au chargement, pour éviter la latence de compilation à la première réplique.
- iPhone / iPad : l'écoute passe par **Whisper**, sur l'appareil, avec la capture du micro par la page. La reconnaissance du navigateur d'iOS n'entend que la première réponse : relancée moins de ~45 s après la fin de la précédente, elle démarre sans rien entendre, sans résultat, erreur ni fin (bug WebKit 321436, iOS 26 à 27.3, aussi sans aucun son joué entre les deux ; nouvel objet, `stop`/`abort`, `getUserMedia` ou iframe neuve n'y changent rien). Dans une conversation, la 2e réponse n'était donc jamais entendue. Les réglages passent sur Whisper à la mise à jour ; si l'on revient à la reconnaissance du navigateur, une écoute sans aucun mot en 12 s, relancée moins de 45 s après la précédente, bascule d'elle-même sur Whisper. Le lecteur audio de la capture (worklet) est gardé d'une écoute à l'autre, démarré pendant un toucher (« Commencer », bouton du micro) puis suspendu entre deux écoutes : WebKit ne laisse démarrer sans geste un lecteur que si la page capte déjà le micro à l'instant où il le demande, sinon sa reprise reste en attente pour toujours (micro allumé, aucun son). Un micro qui ne livre rien (aucun bloc en 6 s, que des zéros depuis l'ouverture, piste muette ou coupée par iOS) est rouvert une fois, puis signalé (« Touchez le micro pour réessayer »). Whisper se télécharge sur la page Emma, avant « Commencer » ; si son chargement échoue, Emma écoute avec la reconnaissance du navigateur. Deux plantages de suite pendant ce chargement (mémoire) : retour à la reconnaissance du navigateur.
- iPhone / iPad : la voix passe par Web Audio avec la session audio « playback » (audible en mode silencieux) tant que le micro n'a pas servi, puis « play-and-record » dès la première écoute, gardée ensuite (son sur le haut-parleur, audible en mode silencieux) : WebKit garde l'unité de capture du micro d'une écoute à l'autre, et repasser en « playback » entre deux écoutes rendait la suivante sourde sans aucune erreur (une écoute sans aucun mot en 20 s est notée au journal et relancée une fois). Le micro est réellement refermé pendant qu'Emma parle, puis rouvert : micro ouvert, iOS bascule en session d'appel (voix dans l'écouteur, très faible, voire coupée). Avec la reconnaissance du navigateur, la page n'ouvre pas de seconde capture du micro (lecteur audio + worklet) : elle redemandait l'autorisation et précédait les plantages de la page ; seul Whisper en a besoin. Le lecteur de la voix est mis en pause avant chaque écoute et repris quand Emma parle (lecteur actif pendant l'écoute puis relancé à chaud, iOS tuait la page au tour suivant d'Emma). Page masquée (autre appli, écran verrouillé), l'écoute est suspendue et reprend au retour : en arrière-plan, iOS coupe la capture et la reconnaissance rendait des bribes tardives auxquelles Emma répondait. Pendant qu'une phrase d'Emma est programmée, l'horloge du lecteur est surveillée : immobile 1,5 s alors qu'il est « running » (iPhone, juste après la fermeture du micro : phrases jamais jouées, conversation figée), il est relancé, puis, toujours figé, les phrases sont abandonnées (réponse affichée) et un lecteur neuf est créé dès que le micro se rouvre, sinon au prochain toucher ; une lecture jamais terminée rend de toute façon la main à l'écoute (15 s + 120 ms par caractère). Réglages → « Diagnostic audio » affiche l'état en direct si Emma reste muette ; « Copier le journal » (diagnostic, page Emma, conversation sur iPhone) copie les 200 derniers événements à tout moment.
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
