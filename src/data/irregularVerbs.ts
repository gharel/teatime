/* Verbes irréguliers anglais : base, prétérit, participe passé (variantes séparées par « | »). */

export interface IrregularVerb {
  base: string;
  past: string;
  participle: string;
  fr: string;
  /** A : indispensables (A1-A2) ; B : à partir de B1. */
  band: 'A' | 'B';
}

const v = (base: string, past: string, participle: string, fr: string, band: 'A' | 'B' = 'A'): IrregularVerb => ({
  base,
  past,
  participle,
  fr,
  band,
});

export const IRREGULAR_VERBS: IrregularVerb[] = [
  v('be', 'was|were', 'been', 'être'),
  v('have', 'had', 'had', 'avoir'),
  v('do', 'did', 'done', 'faire'),
  v('go', 'went', 'gone', 'aller'),
  v('get', 'got', 'got|gotten', 'obtenir, devenir'),
  v('make', 'made', 'made', 'fabriquer, faire'),
  v('say', 'said', 'said', 'dire'),
  v('see', 'saw', 'seen', 'voir'),
  v('come', 'came', 'come', 'venir'),
  v('take', 'took', 'taken', 'prendre'),
  v('know', 'knew', 'known', 'savoir, connaître'),
  v('think', 'thought', 'thought', 'penser'),
  v('give', 'gave', 'given', 'donner'),
  v('find', 'found', 'found', 'trouver'),
  v('tell', 'told', 'told', 'raconter, dire à'),
  v('become', 'became', 'become', 'devenir'),
  v('leave', 'left', 'left', 'partir, quitter'),
  v('feel', 'felt', 'felt', 'ressentir'),
  v('bring', 'brought', 'brought', 'apporter'),
  v('begin', 'began', 'begun', 'commencer'),
  v('keep', 'kept', 'kept', 'garder'),
  v('hold', 'held', 'held', 'tenir'),
  v('write', 'wrote', 'written', 'écrire'),
  v('stand', 'stood', 'stood', 'être debout'),
  v('hear', 'heard', 'heard', 'entendre'),
  v('let', 'let', 'let', 'laisser'),
  v('meet', 'met', 'met', 'rencontrer'),
  v('run', 'ran', 'run', 'courir'),
  v('pay', 'paid', 'paid', 'payer'),
  v('sit', 'sat', 'sat', 'être assis'),
  v('speak', 'spoke', 'spoken', 'parler'),
  v('read', 'read', 'read', 'lire'),
  v('grow', 'grew', 'grown', 'grandir, cultiver'),
  v('lose', 'lost', 'lost', 'perdre'),
  v('fall', 'fell', 'fallen', 'tomber'),
  v('send', 'sent', 'sent', 'envoyer'),
  v('build', 'built', 'built', 'construire'),
  v('understand', 'understood', 'understood', 'comprendre'),
  v('eat', 'ate', 'eaten', 'manger'),
  v('drink', 'drank', 'drunk', 'boire'),
  v('buy', 'bought', 'bought', 'acheter'),
  v('sleep', 'slept', 'slept', 'dormir'),
  v('drive', 'drove', 'driven', 'conduire'),
  v('swim', 'swam', 'swum', 'nager'),
  v('sing', 'sang', 'sung', 'chanter'),
  v('forget', 'forgot', 'forgotten', 'oublier'),
  v('put', 'put', 'put', 'mettre, poser'),
  v('cut', 'cut', 'cut', 'couper'),
  v('wear', 'wore', 'worn', 'porter (un vêtement)'),
  v('teach', 'taught', 'taught', 'enseigner'),
  v('catch', 'caught', 'caught', 'attraper'),
  v('fly', 'flew', 'flown', 'voler (en avion)'),
  v('break', 'broke', 'broken', 'casser'),
  v('choose', 'chose', 'chosen', 'choisir'),
  v('win', 'won', 'won', 'gagner'),
  v('sell', 'sold', 'sold', 'vendre'),
  v('spend', 'spent', 'spent', 'dépenser, passer (du temps)'),
  v('learn', 'learned|learnt', 'learned|learnt', 'apprendre'),
  v('draw', 'drew', 'drawn', 'dessiner', 'B'),
  v('throw', 'threw', 'thrown', 'lancer', 'B'),
  v('hide', 'hid', 'hidden', 'cacher', 'B'),
  v('ride', 'rode', 'ridden', 'aller à vélo, à cheval', 'B'),
  v('shake', 'shook', 'shaken', 'secouer', 'B'),
  v('steal', 'stole', 'stolen', 'voler (dérober)', 'B'),
  v('forgive', 'forgave', 'forgiven', 'pardonner', 'B'),
  v('freeze', 'froze', 'frozen', 'geler', 'B'),
  v('bite', 'bit', 'bitten', 'mordre', 'B'),
  v('lend', 'lent', 'lent', 'prêter', 'B'),
  v('lead', 'led', 'led', 'mener', 'B'),
  v('feed', 'fed', 'fed', 'nourrir', 'B'),
  v('fight', 'fought', 'fought', 'se battre', 'B'),
  v('seek', 'sought', 'sought', 'chercher', 'B'),
  v('bend', 'bent', 'bent', 'plier', 'B'),
  v('shoot', 'shot', 'shot', 'tirer', 'B'),
  v('hang', 'hung', 'hung', 'accrocher', 'B'),
  v('dig', 'dug', 'dug', 'creuser', 'B'),
  v('lay', 'laid', 'laid', 'poser (à plat)', 'B'),
  v('lie', 'lay', 'lain', 'être allongé', 'B'),
  v('rise', 'rose', 'risen', 'se lever, monter', 'B'),
  v('bear', 'bore', 'borne', 'supporter', 'B'),
  v('swear', 'swore', 'sworn', 'jurer', 'B'),
  v('tear', 'tore', 'torn', 'déchirer', 'B'),
  v('sink', 'sank', 'sunk', 'couler', 'B'),
  v('spread', 'spread', 'spread', 'étaler, répandre', 'B'),
  v('shut', 'shut', 'shut', 'fermer', 'B'),
  v('burn', 'burned|burnt', 'burned|burnt', 'brûler', 'B'),
  v('dream', 'dreamed|dreamt', 'dreamed|dreamt', 'rêver', 'B'),
  v('mean', 'meant', 'meant', 'signifier', 'B'),
  v('deal', 'dealt', 'dealt', 'traiter, gérer', 'B'),
  v('wake', 'woke', 'woken', 'se réveiller', 'B'),
  v('bet', 'bet', 'bet', 'parier', 'B'),
  v('forbid', 'forbade', 'forbidden', 'interdire', 'B'),
  v('strike', 'struck', 'struck', 'frapper', 'B'),
  v('overcome', 'overcame', 'overcome', 'surmonter', 'B'),
  v('withdraw', 'withdrew', 'withdrawn', 'retirer', 'B'),
];

/** Formes acceptées (« learned|learnt »). On accepte aussi « was/were » pour be. */
export function formMatches(input: string, forms: string): boolean {
  const ok = forms.split('|');
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => ok.includes(t));
}
