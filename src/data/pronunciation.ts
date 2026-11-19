import type { MinimalPair, Level } from '../types';

export const MINIMAL_PAIRS: MinimalPair[] = [
  // /ɪ/ vs /iː/
  { a: 'ship', b: 'sheep', focus: 'i court /ɪ/ vs i long /iː/ : relâchez la bouche pour « ship », étirez pour « sheep »' },
  { a: 'live', b: 'leave', focus: 'i court /ɪ/ vs i long /iː/ (et le « v » final bien voisé)' },
  { a: 'sit', b: 'seat', focus: 'i court /ɪ/ vs i long /iː/ : ne dites pas deux fois le même son' },
  { a: 'bit', b: 'beat', focus: 'i court /ɪ/ vs i long /iː/' },
  { a: 'fill', b: 'feel', focus: 'i court /ɪ/ vs i long /iː/ devant le « l »' },
  // /θ/ vs /s/
  { a: 'think', b: 'sink', focus: 'TH sourd /θ/ vs /s/ : placez la langue entre les dents' },
  { a: 'thick', b: 'sick', focus: 'TH sourd /θ/ vs /s/' },
  { a: 'three', b: 'free', focus: 'TH sourd /θ/ vs /f/ : la langue, pas les lèvres' },
  { a: 'mouth', b: 'mouse', focus: 'TH sourd final /θ/ vs /s/' },
  // /ð/ vs /z/ or /d/
  { a: 'then', b: 'den', focus: 'TH voisé /ð/ vs /d/ : la langue ne touche pas le palais' },
  { a: 'breathe', b: 'breeze', focus: 'TH voisé final /ð/ vs /z/' },
  { a: 'they', b: 'day', focus: 'TH voisé /ð/ vs /d/ en début de mot' },
  // h vs no h
  { a: 'hair', b: 'air', focus: 'le « h » aspiré existe en anglais, soufflez légèrement' },
  { a: 'heat', b: 'eat', focus: 'h aspiré vs voyelle seule : ne pas supprimer le « h »' },
  { a: 'hold', b: 'old', focus: 'h aspiré vs voyelle seule' },
  { a: 'hand', b: 'and', focus: 'h aspiré vs voyelle seule' },
  // /ʌ/ vs /æ/
  { a: 'cut', b: 'cat', focus: '/ʌ/ court et central vs /æ/ bouche bien ouverte' },
  { a: 'hut', b: 'hat', focus: '/ʌ/ vs /æ/ : ouvrez davantage pour /æ/' },
  { a: 'bun', b: 'ban', focus: '/ʌ/ vs /æ/' },
  // /ʊ/ vs /uː/
  { a: 'full', b: 'fool', focus: 'ou court /ʊ/ vs ou long /uː/' },
  { a: 'pull', b: 'pool', focus: 'ou court /ʊ/ vs ou long /uː/' },
  { a: 'foot', b: 'food', focus: 'ou court /ʊ/ vs ou long /uː/' },
  // /w/ vs /v/
  { a: 'west', b: 'vest', focus: '/w/ lèvres arrondies vs /v/ dents sur la lèvre' },
  { a: 'wine', b: 'vine', focus: '/w/ lèvres arrondies vs /v/ dents sur la lèvre' },
  { a: 'went', b: 'vent', focus: '/w/ vs /v/ : ne mordez pas la lèvre pour « went »' },
  // /ɜː/ and other vowels
  { a: 'bird', b: 'bed', focus: '/ɜːr/ voyelle centrale longue vs /e/ plus ouvert' },
  { a: 'work', b: 'walk', focus: '/ɜːr/ vs /ɔː/ : « work » ne se prononce pas « wok »' },
  { a: 'turn', b: 'torn', focus: '/ɜːr/ vs /ɔːr/ : lèvres non arrondies pour « turn »' },
  // final consonants and voicing
  { a: 'bag', b: 'back', focus: 'consonne finale voisée /g/ vs sourde /k/' },
  { a: 'bad', b: 'bat', focus: 'consonne finale voisée /d/ vs sourde /t/ : allongez la voyelle avant /d/' },
];

export const TONGUE_TWISTERS: { text: string; focus: string; level: Level }[] = [
  { text: 'Three free throws', focus: 'Le TH sourd /θ/ et le R anglais, sans le remplacer par un « s » ou un « f »', level: 'A2' },
  { text: 'She sells seashells by the seashore', focus: 'L’alternance entre /ʃ/ (« sh ») et /s/', level: 'B1' },
  { text: 'Harry’s hungry horse hurried home', focus: 'Le « h » aspiré au début de chaque mot', level: 'A2' },
  { text: 'Peter Piper picked a peck of pickled peppers', focus: 'Le /p/ aspiré et les voyelles courtes /ɪ/ et /e/', level: 'B1' },
  { text: 'How much wood would a woodchuck chuck if a woodchuck could chuck wood?', focus: 'Le /w/ arrondi, le /ʊ/ court de « wood » et le /ʌ/ de « chuck »', level: 'B2' },
  { text: 'Red lorry, yellow lorry', focus: 'Le R anglais et le L : ne pas rouler le « r »', level: 'B1' },
  { text: 'I think this is the thirteenth Thursday of the month', focus: 'Les deux TH, sourd /θ/ et voisé /ð/', level: 'B1' },
  { text: 'Betty bought a bit of better butter', focus: 'Le « t » frappé et la voyelle courte /ɪ/ dans « bit »', level: 'A2' },
  { text: 'Very well, we will visit the village in the west', focus: 'La différence entre /v/ et /w/', level: 'B1' },
  { text: 'Whether the weather is warm or whether the weather is cold, we will weather the weather whatever the weather', focus: 'Le TH voisé /ð/ et le /w/ dans « whether » et « weather »', level: 'C1' },
  { text: 'The sixth sick sheik’s sixth sheep is sick', focus: 'Les sons /s/, /ʃ/, /θ/ et les groupes de consonnes finaux', level: 'C1' },
  { text: 'A big black bug bit a big black bear', focus: 'Les occlusives /b/, /g/, /k/ et la voyelle courte /ɪ/ dans « bit »', level: 'A2' },
];
