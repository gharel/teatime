# Tea Time English : benchmark et analyse pédagogique

*Document de cadrage : ce qui se fait de mieux en applications et en méthodes papier, ce que dit la recherche, et comment ces constats justifient la conception de l'application.*

Dernière mise à jour : novembre 2026. Les descriptions de produits évoluent vite ; elles sont données à titre indicatif et doivent être revérifiées avant toute décision structurante. Aucun tarif n'est mentionné volontairement.

---

## 1. Résumé

- **Aucun produit n'est complet.** Les applications grand public excellent sur la régularité (Duolingo), l'explication en langue maternelle (Babbel) ou la mémorisation (Anki, Memrise), mais produisent peu de parole réelle. Les tuteurs humains offrent l'interaction mais restent chers en temps et en organisation. Les méthodes papier apportent de la structure et de la grammaire claire, mais pas d'oral ni de feedback.
- **La parole produite est le maillon faible** du marché. L'émergence des tuteurs conversationnels IA (Speak, Praktika, appel vidéo de Duolingo Max) répond à ce manque ; c'est le pari central de Tea Time English avec la prof vocale Emma.
- **La recherche soutient quatre leviers** : input compréhensible, production orale, feedback correctif (les reformulations et les incitations à se corriger sont bien documentées) et pratique espacée avec rappel actif. Tea Time English les combine.
- **Les francophones ont des difficultés prévisibles** (present perfect, « depuis », h aspiré, /θ/, accent tonique, faux amis, `I have 25 years`). Une pédagogie contrastive, qui les nomme explicitement (« piège francophone »), est plus efficace qu'un contenu générique.
- **L'UX doit réduire l'anxiété et préserver l'autonomie** : erreurs sans punition, objectifs choisis, feedback actionnable, accessibilité (WCAG 2.2 AA) et absence de dark patterns. D'où le refus des vies/cœurs et des classements factices.
- **Le test de positionnement est une estimation**, pas une certification : 20 questions adaptatives donnent un point de départ raisonnable, sans évaluer l'oral ni l'écrit productif.
- **Une architecture locale et gratuite** (IA dans le navigateur, aucun compte) répond à des contraintes de coût et de vie privée, au prix de limites assumées : qualité variable des petits modèles, premier téléchargement lourd, reconnaissance vocale imparfaite.

---

## 2. Applications de référence

### 2.1 Duolingo

| | |
|---|---|
| **Points forts** | Gamification très aboutie : séries de jours (streaks), ligues, XP, objectifs quotidiens. Micro-leçons de quelques minutes, répétition espacée intégrée, onboarding très rapide. Excellente rétention par l'habitude. Propose désormais un appel vidéo avec un personnage IA (Lily) pour les abonnés Max, avec un mode « push-to-talk » et une transcription après l'appel. |
| **Limites** | Production orale libre limitée dans le parcours standard ; exercices souvent de traduction de phrases isolées, parfois décontextualisées ; sentiment de progression qui peut dépasser la compétence réelle. Le système de vies a été remplacé par un système d'« énergie » consommée à chaque exercice, ce qui a suscité de vives critiques d'utilisateurs, perçues comme une logique de monétisation plus que de pédagogie. |
| **Ce que nous retenons** | Le principe de la série, l'objectif quotidien, les micro-sessions, la progression visible. Nous rejetons ce qui pénalise l'apprenant : pas de vies, pas d'énergie, pas de ligues contre des adversaires fictifs. Nous ajoutons un « joker » de série pour pardonner un jour manqué. |

### 2.2 Babbel

| | |
|---|---|
| **Points forts** | Leçons construites autour de dialogues réalistes ; explications grammaticales dans la langue de l'apprenant ; reconnaissance vocale pour l'oral ; contenus conçus par des didacticiens ; révision intégrée. |
| **Limites** | Parcours assez guidé, peu d'interaction libre ; reconnaissance vocale limitée à la répétition de phrases ; moins ludique. |
| **Ce que nous retenons** | Explications en français avec contrastes explicites, dialogues et contextes réalistes plutôt que phrases isolées, répétition orale avec reconnaissance vocale. |

### 2.3 Busuu

| | |
|---|---|
| **Points forts** | Alignement sur le CECRL (niveaux A1 à C1), parcours par niveau, corrections par des locuteurs natifs de la communauté (relation et feedback humain), tests de niveau. |
| **Limites** | La qualité et la rapidité des corrections communautaires dépendent de la communauté ; l'écrit corrigé est plus fréquent que l'oral conversationnel. |
| **Ce que nous retenons** | Structurer le parcours par niveaux CECRL avec des objectifs « Je peux… » ; donner un sentiment de relation. Faute de communauté dans notre architecture locale, la relation passe par un personnage (Emma). |

### 2.4 Memrise

| | |
|---|---|
| **Points forts** | Vidéos de locuteurs natifs dans des situations réelles, ce qui expose à la variété des accents et du débit ; répétition espacée du vocabulaire ; mnémotechniques. |
| **Limites** | Centré sur le vocabulaire et les phrases utiles, peu de grammaire explicite ; peu de production libre. |
| **Ce que nous retenons** | L'exposition à des voix variées (audio systématique), la répétition espacée du vocabulaire. |

### 2.5 Anki

| | |
|---|---|
| **Points forts** | Outil de référence de la répétition espacée : très flexible, paquets partagés, planification fondée sur la difficulté de chaque carte. Très efficace pour la rétention à long terme du vocabulaire. |
| **Limites** | Aucune pédagogie intégrée : l'utilisateur doit créer ou choisir ses cartes ; austère ; exige de la discipline ; cartes décontextualisées si mal conçues. |
| **Ce que nous retenons** | Le principe d'espacement. Nous retenons le système de Leitner (boîtes), plus simple à comprendre et à expliquer qu'un algorithme complexe, appliqué aux mots **et aux erreurs** de l'apprenant. |

### 2.6 ELSA Speak

| | |
|---|---|
| **Points forts** | Retour phonétique détaillé par son, pensé pour des apprenants non natifs ; identifie les sons problématiques de chaque utilisateur. |
| **Limites** | Se concentre sur la prononciation, pas sur la communication ; l'évaluation automatique reste approximative, surtout selon l'accent et le micro. |
| **Ce que nous retenons** | Travailler les paires minimales et les sons difficiles pour les francophones (Défi prononciation). Nous présentons le résultat comme un indicateur et non comme un jugement. |

### 2.7 Speak, Praktika, Duolingo Max (appel vidéo) : tuteurs IA conversationnels

| | |
|---|---|
| **Points forts** | Pratique orale à la demande, sans jugement, à toute heure ; personnage ou avatar qui crée une présence ; adaptation au niveau ; correction et reformulation. Réduit le coût émotionnel de parler. |
| **Limites** | Les modèles peuvent se tromper ou valider des fautes ; la conversation peut rester superficielle ; dépendance aux serveurs, donc coût et confidentialité ; reconnaissance vocale imparfaite avec accent. |
| **Ce que nous retenons** | Une conversation 100 % vocale avec un personnage incarné, des thèmes concrets, la transcription et la relecture. Notre variante est exécutée localement et gratuite, avec des limites assumées (section 9). |

### 2.8 Tuteurs humains : Cambly, italki, Preply

| | |
|---|---|
| **Points forts** | Interaction authentique, adaptation fine, feedback personnalisé, motivation sociale. |
| **Limites** | Qualité variable selon le tuteur, rendez-vous à planifier, coût, certaines séances dérivent en conversation sans objectif pédagogique. |
| **Ce que nous retenons** | Ce qui distingue un bon tuteur est mesurable : il pose des **questions ouvertes**, il laisse l'apprenant parler la majorité du temps (le temps de parole de l'apprenant est un indicateur clé), il **reformule** la phrase fautive sans interrompre (recast) et ne corrige qu'une ou deux erreurs importantes à la fois. Emma est conçue selon ces principes : questions, reformulation, correction brève. |

### 2.9 Mondly et Rosetta Stone : immersion

| | |
|---|---|
| **Points forts** | Immersion complète dans la langue cible, association image/mot, très accessible aux débutants ; Mondly propose des conversations avec chatbot et de la réalité augmentée. |
| **Limites** | Sans explication en langue maternelle, la grammaire est devinée, ce qui est lent pour des adultes et peut conduire à des erreurs fossilisées ; l'immersion pure est peu efficiente pour des apprenants francophones motivés. |
| **Ce que nous retenons** | Exposition massive à l'anglais audio et écrit, mais avec explication en français quand elle fait gagner du temps. |

### 2.10 BBC Learning English et British Council LearnEnglish

| | |
|---|---|
| **Points forts** | Contenus gratuits de grande qualité : vidéos, podcasts, explications grammaticales, exercices, niveaux CECRL indiqués ; audio authentique. |
| **Limites** | Pas de parcours individualisé ni de suivi de la mémorisation ; peu d'interactivité ; pas de production orale évaluée. |
| **Ce que nous retenons** | La référence de qualité éditoriale et la gratuité ; l'étiquetage CECRL. Ces ressources restent d'excellents compléments que nous recommandons. |

### 2.11 Pimsleur

| | |
|---|---|
| **Points forts** | Méthode audio : l'apprenant parle dès la première minute, rappel à intervalles graduels, leçons de 30 minutes à faire en marchant ou en conduisant. |
| **Limites** | Peu de lecture ou d'écriture ; vocabulaire et situations limités ; format linéaire peu flexible. |
| **Ce que nous retenons** | Le rappel actif à intervalles croissants et la production orale immédiate. |

### 2.12 Synthèse comparative

| Axe | Duolingo | Babbel | Busuu | Memrise | Anki | ELSA | IA conv. | Tuteur humain |
|---|---|---|---|---|---|---|---|---|
| Habitude / motivation | +++ | ++ | ++ | ++ | + | + | ++ | ++ |
| Explication en français | + | +++ | ++ | + | n/a | + | + | ++ |
| Mémorisation espacée | ++ | ++ | ++ | +++ | +++ | + | + | + |
| Production orale libre | + | + | + | + | 0 | + | +++ | +++ |
| Feedback de prononciation | + | + | + | + | 0 | +++ | ++ | ++ |
| Alignement CECRL | ++ | ++ | +++ | + | 0 | + | + | variable |

*Évaluation qualitative et subjective de l'équipe, pas une mesure.*

---

## 3. Méthodes papier de référence

| Méthode | Principe | Points forts | Limites | Ce que nous retenons |
|---|---|---|---|---|
| **Assimil « L'anglais »** | Assimilation passive (écouter, lire la traduction en regard) puis phase active (retraduire) ; dialogues quotidiens ; une leçon par jour. | Régularité douce, dialogues vivants, traduction française de soutien, faible charge. | Grammaire diffuse, peu d'exercices de production réelle, accent dépendant de l'audio. | Alternance compréhension puis production ; séances courtes quotidiennes ; dialogues du quotidien. |
| **English File (Oxford), Headway** | Approche communicative : tâches, révision cyclique, compétences intégrées, niveaux CECRL. | Recyclage systématique du vocabulaire et de la grammaire ; activités de parole ; progression calibrée. | Conçus pour la classe, avec professeur et partenaires ; peu adaptés à l'autodidacte seul. | Le recyclage (révisions, unités qui réutilisent les acquis) et les objectifs communicatifs. |
| **Murphy, *English Grammar in Use* (Cambridge)** | Une page d'explication, une page d'exercices. | Clarté, concision, exercices ciblés, autocorrection ; très utilisé par les francophones. | Peu de communication ; explications en anglais pour la version standard (existe en version avec français). | Format « un point de grammaire = une explication brève + pratique immédiate ». |
| ***English Vocabulary in Use*** | Vocabulaire par thèmes, page double. | Thématique, contexte, collocations. | Statique, sans révision intégrée. | Vocabulaire par thèmes et en contexte, avec révision espacée en plus. |
| **Méthode Michel Thomas** | Audio : construire des phrases progressivement, sans mémorisation forcée ni notes. | Réduit le stress, rend la structure visible, ambiance bienveillante. | Peu de vocabulaire, peu de lecture et d'écriture, peu de pratique autonome. | Construire des phrases par étapes ; pas de pression de mémorisation ; ton rassurant. |
| **Harrap's, Bescherelle (grammaire contrastive)** | Explique l'anglais en le comparant au français. | Anticipe les interférences L1-L2 ; référence rapide. | Ouvrage de référence, non d'entraînement. | Nos « pièges francophones » en sont l'héritier direct. |
| **Préparations Cambridge (KET/A2 Key à CPE/C2 Proficiency)** | Épreuves calibrées au CECRL, par compétence. | Tâches authentiques, barèmes clairs, calibrage fiable. | Orientées examen ; format répétitif. | Variété de tâches, calibrage par niveau, descripteurs. |

---

## 4. Ce que dit la recherche en acquisition des langues

Les points ci-dessous sont présentés avec prudence : ils guident la conception sans prétendre la prouver.

**Input compréhensible (Krashen).** L'hypothèse selon laquelle on acquiert en comprenant un message légèrement au-dessus de son niveau (« i+1 ») a été très influente. Elle est considérée comme nécessaire mais insuffisante : les apprenants exposés à beaucoup d'input mais qui ne parlent pas gardent des lacunes de précision et d'aisance. D'où l'équilibre input/output dans l'app.

**Hypothèse de l'output (Swain).** Produire la langue oblige à passer d'un traitement sémantique à un traitement syntaxique, à repérer ses lacunes (« noticing ») et à tester des hypothèses. Parler ou écrire n'est donc pas seulement le résultat de l'apprentissage, mais l'un de ses moteurs.

**Hypothèse de l'interaction (Long).** La négociation du sens (demandes de clarification, reformulations) rend l'input plus compréhensible et attire l'attention sur la forme. Un tuteur, humain ou IA, qui questionne et reformule exploite ce mécanisme.

**Feedback correctif.** Lyster et Ranta (1997) ont décrit les types de feedback en classe (reformulation ou *recast*, correction explicite, demande de clarification, incitation ou *prompt*, etc.). Les méta-analyses suivantes, dont celle de Li (2010), concluent à un effet global positif du feedback correctif, qui se maintient dans le temps. Lyster et Saito (2010) trouvent en classe un avantage des incitations (*prompts*, qui poussent l'apprenant à s'autocorriger) sur les reformulations, surtout quand le test demande une production libre. Conclusion pour la conception : la reformulation reste naturelle et peu intrusive à l'oral, mais elle est plus efficace **accompagnée** d'une explication brève et, quand c'est possible, d'une invitation à répéter ou à réessayer. C'est le choix d'Emma (recast + explication courte en français).

**Répétition espacée et pratique de rappel (effet de test).** Réviser à des intervalles croissants et se tester activement donne une meilleure rétention à long terme que relire ou réviser en bloc. C'est le fondement des révisions Leitner de l'app, appliquées aux mots et aux erreurs.

**Entrelacement et difficultés désirables (Bjork).** Mélanger les types d'exercices ou de notions, et rendre la tâche un peu difficile (sans la rendre impossible), ralentit l'apprentissage apparent mais améliore la rétention et le transfert. Nos unités mélangent QCM, textes à trous, remise en ordre, dictée et oral.

**Enseignement par les tâches (TBLT).** Apprendre en accomplissant une tâche réaliste (commander un repas, passer un entretien) plutôt qu'en étudiant des formes isolées. Les thèmes de conversation d'Emma et les objectifs « Je peux… » s'en inspirent.

**CECRL et descripteurs « can-do ».** Le Cadre européen commun de référence définit six niveaux (A1 à C2) par des descripteurs de ce que l'apprenant peut faire. Ils donnent un langage commun et motivant et permettent des objectifs concrets. Les niveaux sont des approximations : deux tests différents peuvent donner des résultats différents.

**Motivation et théorie de l'autodétermination (Deci et Ryan).** La motivation durable repose sur trois besoins : **autonomie** (choisir son objectif, son rythme), **compétence** (sentir qu'on progresse), **appartenance** (relation). Cela justifie l'objectif quotidien choisi, la progression visible, l'absence de contrôle punitif, et un personnage récurrent.

**Anxiété de parler en langue étrangère (Horwitz, Horwitz et Cope, 1986).** L'anxiété langagière, particulièrement à l'oral, peut freiner la participation et l'apprentissage. Parler à une IA ou à un avatar peut diminuer la peur du jugement et faciliter les premiers essais, même si cela ne remplace pas l'interaction humaine. Cet effet est plausible et fréquemment avancé, mais il reste moins solidement établi que les points précédents.

---

## 5. Difficultés spécifiques des francophones

### 5.1 Prononciation

| Difficulté | Explication | Réponse dans l'app |
|---|---|---|
| /θ/ et /ð/ (*think*, *this*) | Absents du français, remplacés souvent par /s/, /z/ ou /f/, /v/. | Paires minimales (*think/sink*), défi de prononciation. |
| Le /h/ expiré | Le français ne prononce pas le h (le « h aspiré » français est muet) ; *house* devient *ouse*. | Mots à h en dictée et en répétition. |
| /ɪ/ vs /iː/ (*ship/sheep*) | Le français n'oppose pas durée et tension. | Paires minimales. |
| Accent tonique | Le français accentue la dernière syllabe du groupe ; l'anglais place l'accent sur des syllabes variables du mot. | Mise en évidence de la syllabe accentuée dans le vocabulaire. |
| Schwa /ə/ | Voyelle réduite très fréquente en anglais, absente de cette forme en français. | Audio naturel, sous-titres. |
| Terminaisons *-ed* (/t/, /d/, /ɪd/) | Trois prononciations selon le son précédent. | Points de grammaire et exercices d'écoute. |
| Rythme | L'anglais est « stress-timed » (syllabes accentuées à intervalles à peu près réguliers), le français « syllable-timed ». | Exposition à un débit naturel, vitesse réglable. |

### 5.2 Grammaire

| Erreur typique | Exemple fautif | Correct | Cause |
|---|---|---|---|
| Present perfect vs passé composé | *I have seen him yesterday* | *I saw him yesterday* | Le passé composé couvre les deux emplois. |
| « Depuis » | *I live here since 2010* / *for two years* au présent | *I have lived here since 2010* | « Depuis » + présent en français ; for/since + present perfect. |
| -s de la 3e personne | *She work here* | *She works here* | Faible saillance de la marque. |
| Âge | *I have 25 years* | *I am 25 (years old)* | Calque d'« avoir ». |
| Ordre adjectif-nom | *a car red* | *a red car* | Adjectif souvent postposé en français. |
| Indénombrables | *an information*, *advices* | *some information*, *advice* | « Une information » est dénombrable en français. |
| Article de généralité | *The life is hard* | *Life is hard* | Article défini de généralité en français. |
| Prépositions | *depend of*, *married with*, *good in* | *depend on*, *married to*, *good at* | Calques. |
| Modaux + *to* | *I must to go* | *I must go* | Confusion avec l'infinitif français. |
| *If* + *will* | *If it will rain* | *If it rains* | En français aussi, « si » n'est pas suivi du futur, mais l'apprenant applique à tort la logique du futur de la principale. |
| Questions avec *do/does* | *You like tea?* / *Like you tea?* | *Do you like tea?* | Intonation montante ou inversion française. |

### 5.3 Lexique

- **Faux amis** : *actually* (en fait), *eventually* (finalement), *library* (bibliothèque), *sensible* (raisonnable), *to assist* (assister vs *to attend*), *a college*. Mini-jeu dédié.
- **Vocabulaire d'origine latine** : les francophones ont un avantage de reconnaissance (milliers de mots transparents) mais tendent à en abuser, produisant un registre trop formel (*to inquire* au lieu de *to ask*). Il faut travailler le registre et les équivalents d'origine germanique.
- **Verbes à particule (*phrasal verbs*)** : sens souvent non compositionnel (*give up*, *turn down*) ; à enseigner en contexte et par thèmes plutôt qu'en listes.

---

## 6. Bonnes pratiques UX pour une application d'apprentissage

| Domaine | Bonne pratique | Mise en œuvre visée |
|---|---|---|
| Onboarding | Valeur immédiate, test de niveau court, pas de compte obligatoire. | Test adaptatif de 20 questions, sans inscription. |
| Durée | Micro-sessions de 5 à 10 minutes. | Unités découpées en exercices courts ; mini-jeux d'une ou deux minutes. |
| Progression | Visibilité claire du niveau, de l'unité, de l'objectif. | Barres de progression, niveaux A1 à C2, objectif « Je peux… ». |
| Feedback | Immédiat, actionnable, jamais fondé sur la couleur seule. | Icône, texte et explication en plus de la couleur. |
| Erreurs | Tolérantes, sans pénalité punitive. | Aucune vie ; les erreurs alimentent les révisions. |
| Séries | Avec grâce ou gel pour ne pas décourager. | Joker de série. |
| Objectifs | Choisis par l'utilisateur. | Objectif quotidien réglable. |
| Célébration | Sobre et proportionnée. | XP, badges, records personnels, sans manipulation. |
| Mobile | Mobile-first, grandes zones tactiles (WCAG 2.2 recommande au moins 24 par 24 px, 44 px est un repère courant). | Interface responsive, boutons larges. |
| Clavier | Raccourcis et navigation complète. | Raccourcis pour valider, rejouer l'audio. |
| Accessibilité | WCAG 2.2 niveau AA : contraste, focus visible, `aria-live` pour les retours, respect de `prefers-reduced-motion`. | Régions `aria-live`, animations réduites. |
| Vie privée | Données locales, minimisation. | Stockage local, pas de compte. |
| Performance | Chargement rapide, mode hors ligne. | Découpage du code, cache navigateur. |
| UX vocale | États du micro clairs, appui-pour-parler ou mains-libres, sous-titres, relecture, ralentissement. | Tous prévus dans l'interface d'Emma. |
| Éthique | Éviter les dark patterns : culpabilisation, urgence artificielle, notifications manipulatrices, classements fictifs. | Ni cœurs, ni faux adversaires, ni messages culpabilisants. |

Une règle de fond : la gamification doit servir l'apprentissage et non l'inverse. Les mécaniques extrinsèques (points, badges) sont utiles si elles soutiennent la compétence perçue et l'autonomie, et nuisibles si elles créent de l'anxiété ou une dépendance.

---

## 7. Test de positionnement CECRL

**Principes.** Un test adaptatif (CAT, *computerized adaptive testing*) choisit chaque question en fonction des réponses précédentes : une bonne réponse oriente vers une question plus difficile, une mauvaise vers une plus facile. Une version simple est la méthode en escalier (*staircase*), qui monte ou descend d'un cran. L'estimation converge vers le niveau où l'apprenant réussit environ la moitié du temps.

**Pourquoi 20 questions.** Compromis entre précision et abandon : en dessous d'une dizaine de questions l'estimation est trop instable, au-delà de 30 la fatigue et la lassitude augmentent. Vingt questions donnent une estimation raisonnable du niveau global, avec une marge d'erreur d'environ un niveau.

**Mélange des compétences.** Grammaire, vocabulaire, compréhension écrite et compréhension orale (par synthèse vocale) : on évite qu'une seule compétence ne biaise le résultat, et l'on peut afficher un détail par compétence.

**Choix du point de départ.** Commencer à B1 (milieu de l'échelle) minimise le nombre de pas nécessaires pour rejoindre n'importe quel niveau extrême.

**Limites à communiquer clairement.**
- L'expression orale et l'expression écrite ne sont pas évaluées.
- Le résultat est une **estimation** et non une certification ; une réponse au hasard, une erreur de clic ou un jour de fatigue peuvent la fausser.
- Le test à choix multiples favorise la reconnaissance plutôt que la production.
- L'apprenant peut toujours choisir un autre niveau de départ.

---

## 8. Choix de conception de Tea Time English

### 8.1 Description fonctionnelle

- **Test adaptatif de 20 questions** (grammaire, vocabulaire, compréhension écrite, compréhension orale via synthèse vocale), avec barre de progression ; départ au niveau B1, puis montée ou descente selon les réponses ; estimation finale de A1 à C2 avec descripteurs « Je peux… » et détail par compétence.
- **Parcours par niveau** : 4 unités par niveau (24 au total). Chaque unité comprend un objectif « Je peux… », un point de grammaire expliqué en français avec un « piège francophone », du vocabulaire avec audio et 10 à 12 exercices variés (QCM, texte à trous, remise en ordre, traduction, dictée/écoute, répétition orale avec reconnaissance vocale) avec feedback immédiat et explication.
- **Révisions espacées (Leitner)** des mots et des erreurs.
- **Zone de jeu gamifiée** : XP, niveaux de joueur, série de jours avec joker, objectif quotidien choisi, quêtes du jour, badges, records personnels, mini-jeux (Chrono-Vocab, Faux amis, Puzzle de phrases, Dictée éclair, Défi prononciation avec paires minimales). Pas de vies ni de cœurs punitifs, pas de classements contre de faux joueurs.
- **Prof vocale Emma** : avatar 2D illustré en SVG avec synchronisation labiale (visèmes calculés à partir des phonèmes et de l'enveloppe audio), clignements, expressions ; conversation 100 % vocale sur dix thèmes (voyages, travail, vie personnelle, restaurant, loisirs, santé, shopping, technologie, entretien d'embauche, culture et société) adaptée au niveau ; correction par reformulation (recast) et explication courte en français ; détecteur de fautes typiques des francophones par règles ; mode mains-libres (détection de fin de parole) ou appui-pour-parler ; sous-titres, relecture, vitesse réglable.
- **Pile technique gratuite et locale** : React, TypeScript et Vite (découpage du code) ; IA exécutée dans le navigateur via WebGPU/WASM dans des Web Workers : LLM via WebLLM (modèles ouverts de type Qwen ou Llama), synthèse vocale neuronale Kokoro-82M (kokoro-js, licence Apache 2.0) avec repli sur la synthèse du système, reconnaissance vocale via la Web Speech API (Chrome/Edge) ou Whisper local (Transformers.js) ; option Ollama en local ; mode « scripté » sans IA pour appareils modestes ; données stockées localement (localStorage / cache du navigateur), sans compte ni service payant.

### 8.2 Table de correspondance : constat vers fonctionnalité

| Constat (source dans ce document) | Fonctionnalité de Tea Time English |
|---|---|
| Le marché manque de production orale libre (2.1, 2.2, 2.4) | Conversation 100 % vocale avec Emma, répétition orale dans chaque unité |
| Les tuteurs IA et humains efficaces posent des questions et reformulent (2.7, 2.8, 4) | Emma pose des questions, reformule (recast) et ajoute une explication courte |
| Le feedback correctif est efficace, surtout s'il est explicite et bref (4) | Reformulation et explication en français, détection de fautes typiques par règles |
| Les francophones ont des erreurs prévisibles (5) | « Piège francophone » dans chaque unité, mini-jeu Faux amis, paires minimales |
| Grammaire contrastive claire (Murphy, Harrap's, Bescherelle) (3) | Point de grammaire expliqué en français, un point par unité, pratique immédiate |
| Répétition espacée et rappel actif (2.5, 2.4, 2.11, 4) | Révisions Leitner de mots et d'erreurs |
| Interleaving et difficultés désirables (4) | 10 à 12 exercices variés par unité, mini-jeux |
| CECRL et descripteurs « can-do » (2.3, 3, 4) | 6 niveaux, 4 unités par niveau, objectif « Je peux… », test A1-C2 |
| Autodétermination : autonomie, compétence, appartenance (4) | Objectif quotidien choisi, progression visible, personnage récurrent |
| Les vies et énergies punitives frustrent (2.1) ; dark patterns (6) | Pas de vies, pas de faux classements, joker de série |
| Anxiété de parler (4) | Interlocutrice IA sans jugement, relecture, vitesse réglable, sous-titres |
| Régularité et micro-sessions (2.1, 6) | Série de jours, quêtes du jour, sessions courtes, mini-jeux |
| Accessibilité et UX vocale (6) | `aria-live`, feedback non limité à la couleur, états du micro clairs, appui-pour-parler ou mains-libres |
| Vie privée, gratuité, hors ligne (6) | IA locale, stockage local, aucun compte, mode scripté |
| Un test de niveau court et honnête (7) | 20 questions adaptatives, affichage explicite qu'il s'agit d'une estimation |

---

## 9. Limites et pistes d'amélioration

**Limites actuelles.**

- **Qualité des petits modèles locaux.** Les LLM compacts exécutés dans le navigateur font des erreurs : corrections inexactes, explications grammaticales parfois fausses, dérive de la conversation. Les règles déterministes (détecteur de fautes francophones) et les unités rédigées à la main constituent un filet de sécurité, mais ne couvrent pas tout.
- **Confidentialité de la reconnaissance vocale.** La Web Speech API de Chrome est gratuite, mais par défaut elle envoie l'audio à un service distant pour transcription (la documentation MDN le précise). Whisper local via Transformers.js est l'alternative entièrement privée, au prix d'un téléchargement et d'une vitesse moindre. L'application doit informer clairement l'utilisateur et proposer le choix.
- **Premier chargement lourd.** Les modèles (LLM, synthèse vocale, Whisper) pèsent de plusieurs dizaines à plusieurs centaines de mégaoctets, voire davantage. Il faut un indicateur de progression, une mise en cache fiable et le mode scripté pour les appareils modestes ou les connexions lentes.
- **Compatibilité WebGPU.** Elle varie selon le navigateur et le matériel ; un repli WASM est plus lent.
- **Pas de tuteur humain.** L'interaction réelle, la spontanéité et le feedback d'un expert restent irremplaçables ; nous recommandons un complément humain pour progresser au-delà de B2.
- **Évaluation de la parole approximative.** La reconnaissance vocale transcrit mal certains accents ; une phrase correcte peut être rejetée. Le résultat de la prononciation doit être présenté comme indicatif et ne jamais pénaliser.
- **Test de positionnement** : sans oral ni écrit productif (section 7).
- **Données uniquement locales** : pas de synchronisation entre appareils ; vider les données du navigateur efface la progression. Une fonction d'export et d'import serait utile.

**Pistes d'amélioration.**

1. Export/import de la progression (fichier JSON) pour sauvegarde et changement d'appareil.
2. Évaluation de la qualité des corrections de LLM sur un jeu de phrases de francophones, avec garde-fous (ne corriger que si une règle ou un score de confiance le confirme).
3. Reconnaissance vocale sur appareil généralisée dès que les navigateurs la supportent de façon fiable.
4. Mesure locale (sans envoi) du temps de parole de l'apprenant dans les conversations, pour lui donner un retour sur son temps de parole.
5. Production écrite guidée avec correction, pour compléter le test et le parcours.
6. Tests d'utilisabilité avec de vrais apprenants francophones et audit d'accessibilité (lecteur d'écran, navigation clavier).
7. Contenus supplémentaires : niveaux C1-C2 plus riches, verbes à particule, registres formel et informel.

---

## 10. Sources

Les points sur les produits et les méthodes s'appuient sur la connaissance générale du secteur, complétée par les vérifications ci-dessous. Les produits évoluant rapidement, ces informations sont à revalider.

- [MDN : Using the Web Speech API](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) : reconnaissance vocale serveur par défaut, option sur appareil.
- [Duolingo : lancement de l'appel vidéo IA sur Android (communiqué)](https://investors.duolingo.com/news-releases/news-release-details/duolingo-launches-ai-powered-video-call-android) : appel vidéo avec Lily.
- [Duolingo : article de blog sur l'énergie](https://blog.duolingo.com/duolingo-energy/) : remplacement des vies par l'énergie.
- [Duolingo Max (blog Duolingo)](https://blog.duolingo.com/duolingo-max) : fonctionnalités IA.
- [Lyster et Saito (2010), Oral feedback in classroom SLA, Studies in Second Language Acquisition](https://www.cambridge.org/core/product/4999EE1C8379B2BF026B148EAF373CA1) : méta-analyse sur le feedback oral en classe.
- Li, S. (2010). The effectiveness of corrective feedback in SLA: A meta-analysis. *Language Learning*, 60(2), 309-365.
- Lyster, R. et Ranta, L. (1997). Corrective feedback and learner uptake. *Studies in Second Language Acquisition*, 19(1), 37-66.
- Horwitz, E. K., Horwitz, M. B. et Cope, J. (1986). Foreign language classroom anxiety. *The Modern Language Journal*, 70(2), 125-132.
- Swain, M. (1985). Communicative competence: some roles of comprehensible input and comprehensible output in its development.
- Krashen, S. (1982). *Principles and Practice in Second Language Acquisition*. Long, M. (1996). The role of the linguistic environment in SLA.
- Deci, E. L. et Ryan, R. M. (2000). The « what » and « why » of goal pursuits: human needs and the self-determination of behavior. *Psychological Inquiry*, 11(4).
- [Conseil de l'Europe : Cadre européen commun de référence pour les langues (CECRL)](https://www.coe.int/en/web/common-european-framework-reference-languages)
- [W3C : Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
- [WebLLM](https://github.com/mlc-ai/web-llm) ; [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) ; [Transformers.js](https://huggingface.co/docs/transformers.js) : documentation des briques techniques.
