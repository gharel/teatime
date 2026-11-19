/* ------------------------------------------------------------------
 * Détecteur de fautes typiques des francophones (règles, instantané,
 * hors-ligne). Utilisé seul en mode scripté et comme « indice » envoyé
 * au LLM pour fiabiliser ses corrections.
 * ------------------------------------------------------------------ */

export interface Issue {
  rule: string;
  original: string;
  suggestion: string;
  explanation: string; // français
}

export interface CheckResult {
  corrected: string;
  issues: Issue[];
}

interface Rule {
  id: string;
  re: RegExp;
  fix: (m: RegExpExecArray) => string;
  explain: string | ((m: RegExpExecArray) => string);
}

const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a few|several|many)';
const DUR = '(seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?)';
const DAYS = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const MONTHS = '(january|february|march|april|may|june|july|august|september|october|november|december)';
const UNCOUNT = '(information|advice|news|furniture|luggage|baggage|equipment|homework|research|feedback|knowledge|evidence|software|bread|traffic|accommodation)';

/** Garde la casse de la première lettre du texte remplacé. */
function keepCase(orig: string, rep: string): string {
  if (orig && orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase()) {
    return rep.charAt(0).toUpperCase() + rep.slice(1);
  }
  return rep;
}

const THIRD_VERBS =
  'like|want|need|work|live|love|play|eat|drink|speak|come|make|take|know|think|say|go|do|have|get|watch|read|write|study|teach|travel|cook|help|enjoy|prefer|hate|start|finish|use|look|feel|seem|try|buy|pay|leave|run|sleep|wake|walk|drive|listen|understand|remember|forget|believe|hope|wish|earn|spend|stay|visit|call|ask|wear|smoke';

function thirdPerson(v: string): string {
  if (v === 'have') return 'has';
  if (v === 'do') return 'does';
  if (v === 'go') return 'goes';
  if (v === 'say') return 'says';
  if (/(s|sh|ch|x|z|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}

const RULES: Rule[] = [
  {
    id: 'age',
    re: /\b(I|you|we|they|he|she|my \w+|his \w+|her \w+) (have|has) (\d+|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?) years?(?: old)?\b(?!\s+(?:of|experience|left|in|at|ago|to|working|before|since|with))/gi,
    fix: (m) => {
      const subj = m[1];
      const be = /^i$/i.test(subj) ? 'am' : /^(you|we|they)$/i.test(subj) ? 'are' : 'is';
      return `${subj} ${be} ${m[3]} years old`;
    },
    explain: "L'âge se dit avec **be** : « I am 25 years old », pas « I have 25 years ».",
  },
  {
    id: 'be-feeling',
    re: /\b(I|you|we|they|he|she) (have|has) (hungry|thirsty|cold|hot|right|wrong|sleepy|afraid)\b/gi,
    fix: (m) => {
      const be = /^i$/i.test(m[1]) ? 'am' : /^(you|we|they)$/i.test(m[1]) ? 'are' : 'is';
      return `${m[1]} ${be} ${m[3]}`;
    },
    explain: "Avoir faim/soif/froid/chaud/raison/tort/peur se dit avec **be** : « I am hungry ».",
  },
  {
    id: 'since-duration',
    re: new RegExp(`\\bsince ${NUM} ${DUR}\\b`, 'gi'),
    fix: (m) => keepCase(m[0], `for ${m[1]} ${m[2]}`),
    explain: "« Depuis » + durée se traduit par **for** (for 3 years) ; **since** s'utilise avec un point de départ (since 2020).",
  },
  {
    id: 'during-duration',
    re: new RegExp(`\\bduring ${NUM} ${DUR}\\b`, 'gi'),
    fix: (m) => keepCase(m[0], `for ${m[1]} ${m[2]}`),
    explain: "Pour une durée chiffrée, on utilise **for** (for two weeks) ; **during** + nom d'événement (during the holidays).",
  },
  {
    id: 'since-long',
    re: /\bsince (a )?long time\b/gi,
    fix: (m) => keepCase(m[0], 'for a long time'),
    explain: "« Depuis longtemps » = **for a long time**.",
  },
  {
    id: 'agree',
    re: /\b(I|we|they|you|he|she)(?:'m|'re| am| are| is) (not )?agree\b/gi,
    fix: (m) => {
      const s = m[1];
      if (m[2]) {
        const neg = /^(he|she)$/i.test(s) ? "doesn't" : "don't";
        return `${s} ${neg} agree`;
      }
      return `${s} ${/^(he|she)$/i.test(s) ? 'agrees' : 'agree'}`;
    },
    explain: "**Agree** est un verbe : « I agree », pas « I am agree ».",
  },
  {
    id: 'depend-of',
    re: /\b(depends?|depended|depending) of\b/gi,
    fix: (m) => `${m[1]} on`,
    explain: "On dit **depend on** (et non « depend of »).",
  },
  {
    id: 'its-depend',
    re: /\bit('s| is) depends?\b/gi,
    fix: (m) => keepCase(m[0], 'it depends'),
    explain: "« Ça dépend » = **it depends** (pas de « is »).",
  },
  {
    id: 'explain-me',
    re: /\bexplain (me|us)\b/gi,
    fix: (m) => `explain to ${m[1]}`,
    explain: "**Explain** se construit avec **to** : « explain to me » (ou « explain it to me »).",
  },
  {
    id: 'say-me',
    re: /\bsay (me|us)\b/gi,
    fix: (m) => `tell ${m[1]}`,
    explain: "Avec une personne en complément, on utilise **tell** : « tell me », mais « say something ».",
  },
  {
    id: 'modal-to',
    re: /\b(can|must|should|could|would|might|will|may) to (\w+)/gi,
    fix: (m) => `${m[1]} ${m[2]}`,
    explain: "Après un modal (can, must, should, will…), le verbe s'emploie **sans to** : « I must go ».",
  },
  {
    id: 'third-person',
    re: new RegExp(
      `(?<!\\b(?:does|did|do|will|would|can|could|should|must|might|may|let|make|made|help|helped|to|that|why|when|where|what|how)\\s)\\b(he|she|it|my (?:mother|father|brother|sister|boss|friend|wife|husband|son|daughter|teacher|colleague)) (${THIRD_VERBS})\\b`,
      'gi',
    ),
    fix: (m) => `${m[1]} ${thirdPerson(m[2].toLowerCase())}`,
    explain: "Au présent simple, on ajoute **-s** à la 3e personne du singulier : « she works », « he has ».",
  },
  {
    id: 'he-dont',
    re: /\b(he|she|it) (don't|do not)\b/gi,
    fix: (m) => `${m[1]} ${m[2].includes("'") ? "doesn't" : 'does not'}`,
    explain: "À la 3e personne : **doesn't** (« she doesn't like »).",
  },
  {
    id: 'did-past',
    re: /\b(did|didn't|did not) (\w+ )?(went|saw|ate|took|made|came|bought|had|got|gave|wrote|spoke|left|told|found|thought|knew|met|paid|sent|felt|brought|began)\b/gi,
    fix: (m) => {
      const base: Record<string, string> = {
        went: 'go', saw: 'see', ate: 'eat', took: 'take', made: 'make', came: 'come', bought: 'buy', had: 'have',
        got: 'get', gave: 'give', wrote: 'write', spoke: 'speak', left: 'leave',
        told: 'tell', found: 'find', thought: 'think', knew: 'know', met: 'meet', paid: 'pay', sent: 'send',
        felt: 'feel', brought: 'bring', began: 'begin',
      };
      return `${m[1]} ${m[2] ?? ''}${base[m[3].toLowerCase()]}`;
    },
    explain: "Après **did / didn't**, le verbe reste à la base verbale : « Did you go? », « I didn't see ».",
  },
  {
    id: 'have-preterit',
    re: /\b(have|has|'ve|had|having)(n't| not)?((?: (?:never|ever|already|just|recently|often|always|also))?) (went|ate|saw|took|came|wrote|spoke|began|drank|gave|knew|ran|swam|did|forgot|broke|chose|drove|flew|fell|rode|sang|stole|threw|woke|wore)\b/gi,
    fix: (m) => {
      const pp: Record<string, string> = {
        went: 'gone', ate: 'eaten', saw: 'seen', took: 'taken', came: 'come', wrote: 'written', spoke: 'spoken', began: 'begun',
        drank: 'drunk', gave: 'given', knew: 'known', ran: 'run', swam: 'swum', did: 'done', forgot: 'forgotten', broke: 'broken',
        chose: 'chosen', drove: 'driven', flew: 'flown', fell: 'fallen', rode: 'ridden', sang: 'sung', stole: 'stolen', threw: 'thrown',
        woke: 'woken', wore: 'worn',
      };
      return `${m[1]}${m[2] ?? ''}${m[3] ?? ''} ${pp[m[4].toLowerCase()]}`;
    },
    explain: "Après **have / has**, on utilise le **participe passé** (gone, seen, eaten…), pas le prétérit (went, saw, ate…).",
  },
  {
    id: 'time-first-perfect',
    re: /^(yesterday|last (?:week|month|year|night|summer|weekend|time)|(?:\w+ ){1,2}(?:days?|weeks?|months?|years?) ago)\b([^.!?]*?\b)(I|you|we|they|he|she) (have|has|'ve|'s) (been|gone|seen|done|eaten|visited|bought|met|had|made|taken|worked|watched|played|seen)\b/gi,
    fix: (m) => {
      const past: Record<string, string> = {
        been: /^(you|we|they)$/i.test(m[3]) ? 'were' : 'was', gone: 'went', seen: 'saw', done: 'did', eaten: 'ate', visited: 'visited',
        bought: 'bought', met: 'met', had: 'had', made: 'made', taken: 'took', worked: 'worked', watched: 'watched', played: 'played',
      };
      return `${m[1]}${m[2]}${m[3]} ${past[m[5].toLowerCase()]}`;
    },
    explain:
      "Avec un moment passé précis (yesterday, last week, ago…), on utilise le **prétérit** et non le present perfect : « Yesterday I went… ».",
  },
  {
    id: 'yesterday-perfect',
    re: /\b(I|you|we|they|he|she) (have|has|'ve|'s) (been|gone|went|seen|done|eaten|visited|bought|met|had|made|taken|worked) ((?:[\w',]+ ){0,6}?(?:yesterday|last (?:week|month|year|night|summer|weekend)|ago|in (?:19|20)\d\d))\b/gi,
    fix: (m) => {
      const past: Record<string, string> = {
        been: /^to /i.test(m[4]) ? 'went' : /^(you|we|they)$/i.test(m[1]) ? 'were' : 'was', gone: 'went', went: 'went', seen: 'saw', done: 'did', eaten: 'ate',
        visited: 'visited', bought: 'bought', met: 'met', had: 'had', made: 'made', taken: 'took', worked: 'worked',
      };
      return `${m[1]} ${past[m[3].toLowerCase()]} ${m[4]}`;
    },
    explain:
      "Avec un moment passé précis (yesterday, last week, ago…), on utilise le **prétérit** et non le present perfect : « I went there yesterday ».",
  },
  {
    id: 'uncountable-plural',
    re: /\b(informations|advices|furnitures|luggages|baggages|equipments|homeworks|feedbacks|knowledges|evidences|softwares|accommodations)\b/gi,
    fix: (m) => m[1].slice(0, -1),
    explain: "Ce nom est **indénombrable** en anglais : pas de -s (information, advice, furniture…). « Des conseils » = some advice / pieces of advice.",
  },
  {
    id: 'uncountable-a',
    re: new RegExp(`\\b(an?) ${UNCOUNT}\\b`, 'gi'),
    fix: (m) => {
      const piece: Record<string, string> = { advice: 'a piece of advice', information: 'a piece of information', news: 'a piece of news', furniture: 'a piece of furniture', homework: 'some homework' };
      return piece[m[2].toLowerCase()] ?? `some ${m[2]}`;
    },
    explain: "Nom **indénombrable** : pas d'article « a ». On dit « some advice » ou « a piece of advice ».",
  },
  {
    id: 'people-is',
    re: /\b(people|police) (is|was|has)\b/gi,
    fix: (m) => `${m[1]} ${{ is: 'are', was: 'were', has: 'have' }[m[2].toLowerCase()]}`,
    explain: "**People** et **police** sont toujours au pluriel : « people are », « the police are ».",
  },
  {
    id: 'there-is-plural',
    re: /\bthere (is|was|'s) (two|three|four|five|six|seven|eight|nine|ten|many|several|lots of|a lot of|some) (\w+s)\b/gi,
    fix: (m) => (/^(news|series|means|species)$/i.test(m[3]) ? m[0] : `there ${m[1].toLowerCase() === 'was' ? 'were' : 'are'} ${m[2]} ${m[3]}`),
    explain: "Avec un nom pluriel : **there are** (présent) / **there were** (passé).",
  },
  {
    id: 'more-er',
    re: /\b(more|most) (better|worse|bigger|smaller|easier|harder|faster|cheaper|older|younger|taller|nicer|happier|best|worst|biggest|easiest)\b/gi,
    fix: (m) => m[2],
    explain: "Double comparatif : « better » contient déjà l'idée de « plus ». On dit **better**, pas « more better ».",
  },
  {
    id: 'more-short-adj',
    re: /\bmore (big|small|tall|short|cheap|fast|slow|old|young|easy|nice|long|high|low|hot|cold|happy|large|close|warm|strong|rich|busy|quick)\b(?=\s+than\b|\s*[.,!?]|\s*$)/gi,
    fix: (m) => {
      const a = m[1].toLowerCase();
      const irregular: Record<string, string> = { big: 'bigger', hot: 'hotter', nice: 'nicer', large: 'larger', close: 'closer', easy: 'easier', happy: 'happier', busy: 'busier' };
      return irregular[a] ?? `${a}er`;
    },
    explain: "Adjectif court (1 syllabe ou en -y) : comparatif en **-er** (bigger, cheaper, easier), pas « more big ».",
  },
  {
    id: 'if-will',
    re: /(?<=^|[.!?]\s+|,\s*|\band\s+)(if|when|as soon as) (I|you|we|they|he|she|it) will (\w+)/gi,
    fix: (m) => {
      const s = m[2];
      const v = m[3].toLowerCase();
      const verb = /^(he|she|it)$/i.test(s) ? (v === 'be' ? 'is' : thirdPerson(v)) : v === 'be' ? (/^i$/i.test(s) ? 'am' : 'are') : v;
      return `${m[1]} ${s} ${verb}`;
    },
    explain: "Après **if / when** à sens futur, on met le **présent** : « If I have time, I'll call you » (pas « if I will have »).",
  },
  {
    id: 'if-would',
    re: /\bif (I|he|she|it) would be\b/gi,
    fix: (m) => `if ${m[1]} were`,
    explain: "Hypothèse (2e conditionnel) : **if + prétérit**, et on préfère « were » : « If I were rich… ».",
  },
  {
    id: 'want-that',
    re: /\b(want|wants|would like|'d like) that (I|you|he|she|we|they|him|her|them|us|me) (\w+)/gi,
    fix: (m) => {
      const obj: Record<string, string> = { i: 'me', he: 'him', she: 'her', we: 'us', they: 'them' };
      const o = obj[m[2].toLowerCase()] ?? m[2];
      const v = m[3].toLowerCase();
      const base =
        /^(am|is|are)$/.test(v) ? 'be' : v === 'has' ? 'have' : v === 'does' ? 'do' : v === 'goes' ? 'go' : /(sh|ch|x|ss)es$/.test(v) ? v.slice(0, -2) : /[^s]s$/.test(v) && v.length > 3 ? v.slice(0, -1) : v;
      return `${m[1]} ${o} to ${base}`;
    },
    explain: "« Je veux que tu… » = **I want you to…** (pas de « that »).",
  },
  {
    id: 'make-photo',
    re: /\b(make|makes|made|making) (a|some|the) (photos?|pictures?|walk|break|shower)\b/gi,
    fix: (m) => {
      const take: Record<string, string> = { make: 'take', makes: 'takes', made: 'took', making: 'taking' };
      return `${take[m[1].toLowerCase()]} ${m[2]} ${m[3]}`;
    },
    explain: "On dit **take** a photo / a walk / a break / a shower.",
  },
  {
    id: 'make-sport',
    re: /\b(make|makes|made|making) (sport|sports|my homework|the shopping|shopping|the dishes|the cooking|exercise|the housework)\b/gi,
    fix: (m) => {
      const d: Record<string, string> = { make: 'do', makes: 'does', made: 'did', making: 'doing' };
      const obj = m[2].toLowerCase() === 'shopping' ? 'the shopping' : m[2];
      return `${d[m[1].toLowerCase()]} ${obj}`;
    },
    explain: "Pour les activités et tâches, on utilise **do** : do sport, do my homework, do the shopping, do the dishes.",
  },
  {
    id: 'a-travel',
    re: /\b(a|my|our) travel\b(?=\s+(?:to|in|was|is|with|last|this|abroad)\b|\s*[.,!?]|\s*$)/gi,
    fix: (m) => `${m[1]} trip`,
    explain: "**Travel** est surtout un verbe ou un nom indénombrable. « Un voyage » = **a trip** (ou a journey).",
  },
  {
    id: 'go-to-the',
    re: /\b(go|goes|went|going) to the (bed|work)\b/gi,
    fix: (m) => `${m[1]} to ${m[2]}`,
    explain: "Sans article dans ces expressions : **go to bed / go to work** (comme go to school).",
  },
  {
    id: 'go-in-country',
    re: /\b(go|goes|went|going|gone|travel|travels|travelled|traveled|travelling|traveling|fly|flew|flying|move|moved|moving|come|came) in ((?:the )?[A-Z][a-z]+)/g,
    fix: (m) => (/^(the )?(morning|afternoon|evening|summer|winter|spring|autumn|January|February|March|April|May|June|July|August|September|October|November|December)$/.test(m[2]) ? m[0] : `${m[1]} to ${m[2]}`),
    explain: "Avec un verbe de déplacement, la destination se construit avec **to** : « go to Japan », « travel to London ».",
  },
  {
    id: 'go-to-home',
    re: /\b(go|goes|went|going|come|came|get|got) to home\b/gi,
    fix: (m) => `${m[1]} home`,
    explain: "**Home** s'emploie sans « to » après un verbe de mouvement : « go home ».",
  },
  {
    id: 'listen-music',
    re: /\b(listen|listens|listened|listening) (music|the radio|podcasts?|him|her|me|you|them|us)\b/gi,
    fix: (m) => `${m[1]} to ${m[2]}`,
    explain: "**Listen** se construit avec **to** : « listen to music ».",
  },
  {
    id: 'wait-me',
    re: /\b(wait|waits|waited|waiting) (me|you|him|her|us|them|the bus|the train)\b/gi,
    fix: (m) => `${m[1]} for ${m[2]}`,
    explain: "« Attendre quelqu'un/quelque chose » = **wait for** : « wait for me ».",
  },
  {
    id: 'discuss-about',
    re: /\b(discuss|discussed|discussing) about\b/gi,
    fix: (m) => m[1],
    explain: "**Discuss** est transitif direct : « discuss the problem » (sans « about »).",
  },
  {
    id: 'enter-in',
    re: /\b(enter|entered|entering) (in|into) the\b/gi,
    fix: (m) => `${m[1]} the`,
    explain: "**Enter** est transitif direct : « enter the room ».",
  },
  {
    id: 'married-with',
    re: /\bmarried with\b/gi,
    fix: () => 'married to',
    explain: "« Marié avec » = **married to**.",
  },
  {
    id: 'good-in',
    re: /\b(good|bad|better|great) in (english|french|maths|math|sports?|cooking|music|languages|drawing|singing|dancing|swimming|writing|sales|business|science|history|chemistry|physics|computers)\b/gi,
    fix: (m) => `${m[1]} at ${m[2]}`,
    explain: "« Bon en » = **good at** : « good at maths », « good at cooking ».",
  },
  {
    id: 'interested-by',
    re: /\b(interested) (by|for)\b/gi,
    fix: (m) => `${m[1]} in`,
    explain: "« Intéressé par » = **interested in**.",
  },
  {
    id: 'interesting-in',
    re: /\b(I|we|they|you)('m| am|'re| are) (very |so |really )?interesting in\b/gi,
    fix: (m) => `${m[1]}${m[2]} ${m[3] ?? ''}interested in`,
    explain: "**Interested** = intéressé (ce qu'on ressent) ; **interesting** = intéressant (ce qui intéresse).",
  },
  {
    id: 'bored',
    re: /\b(I|we|they)('m| am|'re| are) (so |very |really )?(boring|exciting|tiring|interesting|confusing|annoying)\b(?! (?:to|for)\b)/gi,
    fix: (m) => `${m[1]}${m[2]} ${m[3] ?? ''}${m[4].replace(/ing$/, 'ed')}`,
    explain: "Pour un ressenti : **-ed** (I'm bored = je m'ennuie). **-ing** décrit la cause (I'm boring = je suis ennuyeux).",
  },
  {
    id: 'different-of',
    re: /\bdifferent of\b/gi,
    fix: () => 'different from',
    explain: "« Différent de » = **different from**.",
  },
  {
    id: 'responsible-of',
    re: /\bresponsible of\b/gi,
    fix: () => 'responsible for',
    explain: "« Responsable de » = **responsible for**.",
  },
  {
    id: 'arrive-to',
    re: /\b(arrive|arrived|arriving|arrives) to\b/gi,
    fix: (m) => `${m[1]} in`,
    explain: "**Arrive in** (ville, pays) ou **arrive at** (lieu précis) — jamais « arrive to ».",
  },
  {
    id: 'on-internet',
    re: /\b(in|on) internet\b|\bin the internet\b/gi,
    fix: () => 'on the internet',
    explain: "On dit **on the internet**.",
  },
  {
    id: 'by-foot',
    re: /\bby foot\b/gi,
    fix: () => 'on foot',
    explain: "« À pied » = **on foot**.",
  },
  {
    id: 'in-vacation',
    re: /\b(in|en) (vacation|holidays?)\b/gi,
    fix: (m) => `on ${m[2]}`,
    explain: "« En vacances » = **on holiday** (UK) / **on vacation** (US).",
  },
  {
    id: 'day-prep',
    re: new RegExp(`\\b(in|the) ${DAYS}\\b`, 'gi'),
    fix: (m) => `on ${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}`,
    explain: "Avec les jours de la semaine : **on Monday** (et majuscule).",
  },
  {
    id: 'month-prep',
    re: new RegExp(`\\b(on|at) ${MONTHS}\\b(?! \\d)`, 'gi'),
    fix: (m) => `in ${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}`,
    explain: "Avec les mois et les saisons : **in** (in June, in summer).",
  },
  {
    id: 'in-the-night',
    re: /\bin the night\b/gi,
    fix: () => 'at night',
    explain: "« La nuit » = **at night** (mais in the morning / in the afternoon / in the evening).",
  },
  {
    id: 'at-the-morning',
    re: /\b(at|on) the (morning|afternoon|evening)\b/gi,
    fix: (m) => `in the ${m[2]}`,
    explain: "**In the morning / afternoon / evening**, mais **at night**.",
  },
  {
    id: 'what-means',
    re: /\bwhat means ([\w' ]+?)\?/gi,
    fix: (m) => `What does ${m[1]} mean?`,
    explain: "Question avec auxiliaire : **What does … mean?**",
  },
  {
    id: 'how-is-called',
    re: /\bhow (is|are) (it|this|that|they|these|those) called\b/gi,
    fix: (m) => keepCase(m[0], `what ${m[1]} ${m[2]} called`),
    explain: "« Comment ça s'appelle ? » = **What is it called?**",
  },
  {
    id: 'propose-to',
    re: /\b(propose|proposed) (you|him|her|them|us) to\b/gi,
    fix: (m) => `${m[1] === 'proposed' ? 'suggested' : 'suggest'} that ${m[2] === 'him' ? 'he' : m[2] === 'her' ? 'she' : m[2] === 'them' ? 'they' : m[2] === 'us' ? 'we' : 'you'}`,
    explain: "« Je te propose de… » = **I suggest (that) you…** ou **Why don't you…?**",
  },
  {
    id: 'borrow-me',
    re: /\b(borrow) (me|us)\b/gi,
    fix: (m) => `lend ${m[2]}`,
    explain: "**Lend** = prêter (donner) ; **borrow** = emprunter (recevoir).",
  },
  {
    id: 'a-an',
    re: /\ba ((?!uni|use|usu|euro|one|once|u[rs]e)[aeiou]\w*)\b/gi,
    fix: (m) => keepCase(m[0], `an ${m[1]}`),
    explain: "Devant un **son voyelle**, on écrit **an** : an apple, an hour.",
  },
  {
    id: 'an-a',
    re: /\ban ((?!hour|honest|honou?r|heir|herb)[b-df-hj-np-tv-z]\w*)\b/gi,
    fix: (m) => keepCase(m[0], `a ${m[1]}`),
    explain: "Devant un **son consonne**, on écrit **a** : a car, a house, a university.",
  },
  {
    id: 'the-generic',
    re: /^(the) (life|nature|love|happiness|society|humanity|politics) (is|are|can|makes?|has)\b/gi,
    fix: (m) => keepCase(m[0], `${m[2]} ${m[3]}`),
    explain: "Pour une **généralité**, pas d'article en anglais : « Life is beautiful », « Money can't buy happiness ».",
  },
  {
    id: 'lowercase-i',
    re: /(^|[\s,])i(?=\s|'m|'ve|'ll|'d)/g,
    fix: (m) => `${m[1]}I`,
    explain: "Le pronom **I** prend toujours une majuscule.",
  },
];

export function checkText(text: string): CheckResult {
  let corrected = text;
  const issues: Issue[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const found: { start: number; end: number; rep: string; orig: string; expl: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(corrected))) {
      const rep = rule.fix(m);
      if (rep !== m[0]) {
        found.push({
          start: m.index,
          end: m.index + m[0].length,
          rep,
          orig: m[0],
          expl: typeof rule.explain === 'string' ? rule.explain : rule.explain(m),
        });
      }
      if (m[0].length === 0) rule.re.lastIndex++;
    }
    for (let i = found.length - 1; i >= 0; i--) {
      const f = found[i];
      corrected = corrected.slice(0, f.start) + f.rep + corrected.slice(f.end);
    }
    for (const f of found) {
      if (rule.id === 'lowercase-i' && issues.some((x) => x.rule === 'lowercase-i')) continue;
      issues.push({ rule: rule.id, original: f.orig.trim(), suggestion: f.rep.trim(), explanation: f.expl });
    }
  }
  return { corrected, issues };
}

/** Diff mot à mot pour afficher une correction (barré / ajouté). */
export function wordDiff(a: string, b: string): { text: string; type: 'same' | 'del' | 'add' }[] {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:"]/g, '');
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      dp[i][j] = norm(A[i]) === norm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { text: string; type: 'same' | 'del' | 'add' }[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (norm(A[i]) === norm(B[j])) {
      out.push({ text: B[j], type: 'same' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ text: A[i++], type: 'del' });
    else out.push({ text: B[j++], type: 'add' });
  }
  while (i < A.length) out.push({ text: A[i++], type: 'del' });
  while (j < B.length) out.push({ text: B[j++], type: 'add' });
  return out;
}
