/* Prépositions de temps et de lieu (in / on / at) : une phrase à trou, une seule réponse
 * possible en anglais britannique comme américain, et la règle en français. */

export type Preposition = 'in' | 'on' | 'at';

export const PREPOSITIONS: Preposition[] = ['in', 'on', 'at'];

export interface PrepositionItem {
  /** Phrase avec « ___ » à la place de la préposition. */
  text: string;
  answer: Preposition;
  tip: string;
  kind: 'temps' | 'lieu' | 'expression';
}

const t = (text: string, answer: Preposition, tip: string): PrepositionItem => ({ text, answer, tip, kind: 'temps' });
const l = (text: string, answer: Preposition, tip: string): PrepositionItem => ({ text, answer, tip, kind: 'lieu' });
const x = (text: string, answer: Preposition, tip: string): PrepositionItem => ({ text, answer, tip, kind: 'expression' });

export const PREPOSITION_ITEMS: PrepositionItem[] = [
  // Temps
  t("The meeting starts ___ 9 o'clock.", 'at', 'Heure précise : **at** 9 o’clock.'),
  t('The train leaves ___ 6:45.', 'at', 'Heure précise : **at** 6:45.'),
  t('I was born ___ 1995.', 'in', 'Année : **in** 1995.'),
  t('We have English ___ Monday.', 'on', 'Jour de la semaine : **on** Monday.'),
  t('My birthday is ___ July.', 'in', 'Mois : **in** July.'),
  t('Her birthday is ___ 14 March.', 'on', 'Date : **on** 14 March.'),
  t('I often read ___ night.', 'at', '**At night**, mais *in the morning / afternoon / evening*.'),
  t('I go jogging ___ the morning.', 'in', 'Moment de la journée : **in the morning**, in the afternoon, in the evening.'),
  t('Let’s meet ___ lunchtime.', 'at', 'Moment précis : **at lunchtime**, at noon, at midnight.'),
  t('The shops are always busy ___ Christmas.', 'at', 'La période des fêtes : **at Christmas**, at Easter.'),
  t('We opened our presents ___ Christmas Day.', 'on', 'Un jour précis : **on Christmas Day**.'),
  t('It’s very hot here ___ summer.', 'in', 'Saison : **in summer**.'),
  t('He called me ___ Friday evening.', 'on', 'Jour + moment de la journée : **on Friday evening**.'),
  t('Computers changed a lot ___ the 1990s.', 'in', 'Décennie, siècle : **in the 1990s**, in the 19th century.'),
  t('I’ll be back ___ ten minutes.', 'in', '« Dans dix minutes » : **in ten minutes**.'),
  t('I’m very busy ___ the moment.', 'at', 'Expression figée : **at the moment** (en ce moment).'),
  t('We always have a party ___ New Year’s Eve.', 'on', 'Un jour précis : **on New Year’s Eve**.'),
  t('We both answered ___ the same time.', 'at', '**At the same time** : en même temps.'),
  t('The castle was built ___ the 12th century.', 'in', 'Siècle : **in the 12th century**.'),
  t('The shop closes ___ midnight.', 'at', 'Moment précis : **at midnight**.'),
  t('Our holiday starts ___ 2 August.', 'on', 'Date : **on 2 August**.'),
  t('The leaves fall ___ autumn.', 'in', 'Saison : **in autumn**.'),
  t('I’ll call you ___ Tuesday afternoon.', 'on', 'Jour + moment : **on Tuesday afternoon**.'),

  // Lieu
  l('She lives ___ Paris.', 'in', 'Ville, pays : **in** Paris, in France.'),
  l('I’ll wait for you ___ the bus stop.', 'at', 'Point de rendez-vous précis : **at the bus stop**.'),
  l('The keys are ___ the table.', 'on', 'Posé sur une surface : **on the table**.'),
  l('There’s some milk ___ the fridge.', 'in', 'À l’intérieur de quelque chose : **in the fridge**.'),
  l('My flat is ___ the third floor.', 'on', 'Étage : **on the third floor**.'),
  l('He’s ___ work right now.', 'at', 'Lieu d’activité : **at work**, at school, at university.'),
  l('We sat ___ the car for hours.', 'in', 'Voiture, taxi (on ne s’y tient pas debout) : **in the car**.'),
  l('I read the news ___ the bus.', 'on', 'Transport où l’on peut marcher : **on the bus**, on the train, on the plane.'),
  l('There’s a nice picture ___ the wall.', 'on', 'Accroché au mur : **on the wall**.'),
  l('My parents are ___ home tonight.', 'at', '**At home**, sans « the ».'),
  l('She’s waiting for us ___ the airport.', 'at', 'Lieu vu comme un point de passage : **at the airport**, at the station.'),
  l('Look at that bird ___ the sky!', 'in', '**In the sky**.'),
  l('I saw the match ___ TV.', 'on', 'Médias : **on TV**, on the radio.'),
  l('I found this recipe ___ the internet.', 'on', '**On the internet**, on a website.'),
  l('He’s still ___ bed.', 'in', '**In bed** : au lit (sans « the »).'),
  l('Write your name ___ the top of the page.', 'at', 'Haut ou bas d’une page : **at the top**, at the bottom.'),
  l('There’s a mistake ___ page 12.', 'on', 'Page : **on page 12**.'),
  l('We arrived ___ London late at night.', 'in', 'Arriver dans une ville ou un pays : **arrive in** London.'),
  l('We arrived ___ the hotel very late.', 'at', 'Arriver à un lieu précis : **arrive at** the hotel.'),
  l('Turn left ___ the traffic lights.', 'at', 'Point précis sur un trajet : **at the traffic lights**.'),
  l('The cat is sleeping ___ the sofa.', 'on', 'Sur le canapé : **on the sofa** (mais *in an armchair*).'),
  l('There are lots of fish ___ the sea.', 'in', '**In the sea**, in the river.'),
  l('Put your phone ___ your pocket.', 'in', 'À l’intérieur : **in your pocket**.'),
  l('The bank is ___ the left.', 'on', 'Côté : **on the left**, on the right.'),
  l('My office is ___ the city centre.', 'in', 'Quartier, zone : **in the city centre**.'),
  l('They’re ___ a meeting.', 'in', '**In a meeting** : en réunion.'),
  l('He lives ___ a small island.', 'on', 'Île : **on an island**.'),

  // Expressions
  x('I’m good ___ maths.', 'at', '**Good at** something : doué en.'),
  x('She’s interested ___ art.', 'in', '**Interested in** something.'),
  x('It depends ___ the weather.', 'on', '**Depend on** (jamais « of »).'),
  x('The train is never ___ time.', 'on', '**On time** : à l’heure, ponctuel.'),
  x('She’s ___ holiday in Spain.', 'on', '**On holiday** : en vacances.'),
  x('Can I pay ___ cash?', 'in', '**In cash**, mais *by card*.'),
  x('Please write it ___ English.', 'in', 'Langue : **in English**.'),
  x('We go to school ___ foot.', 'on', '**On foot** : à pied (mais *by car*, *by bus*).'),
  x('I’m not very good ___ cooking.', 'at', '**Good / bad at** + verbe en -ing.'),
  x('He’s ___ love with her.', 'in', '**In love with** someone.'),
  x('The house is ___ fire!', 'on', '**On fire** : en feu.'),
  x('I did it ___ purpose.', 'on', '**On purpose** : exprès.'),
  x('Your order is ___ the way.', 'on', '**On the way** : en route.'),
  x('I’m ___ a hurry.', 'in', '**In a hurry** : pressé.'),
  x('She smiled ___ me.', 'at', 'Regarder, sourire à quelqu’un : **smile at**, look at.'),
];

/** Phrase complétée avec la préposition. */
export const fillGap = (item: PrepositionItem, word: string = item.answer): string => item.text.replace('___', word);
