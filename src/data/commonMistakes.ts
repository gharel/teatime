/* Fautes typiques des francophones : phrase fautive, phrase correcte, explication en français. */

export interface CommonMistake {
  wrong: string;
  right: string;
  tip: string;
}

const m = (wrong: string, right: string, tip: string): CommonMistake => ({ wrong, right, tip });

export const COMMON_MISTAKES: CommonMistake[] = [
  m('I have 25 years.', 'I am 25 years old.', "L'âge se dit avec **be** : I am 25."),
  m('I am agree with you.', 'I agree with you.', '**Agree** est un verbe : pas de « am ».'),
  m('It depends of the weather.', 'It depends on the weather.', 'On dit **depend on**.'),
  m('I live here since three years.', 'I have lived here for three years.', 'Durée qui continue : present perfect + **for**.'),
  m('The people is very nice.', 'The people are very nice.', '**People** est pluriel.'),
  m('I need some informations.', 'I need some information.', '**Information** est indénombrable : jamais de « s ».'),
  m('She have a dog.', 'She has a dog.', 'He / she / it : **has**.'),
  m("He don't like coffee.", "He doesn't like coffee.", 'He / she / it : **doesn’t**.'),
  m("I didn't went to school.", "I didn't go to school.", 'Après **didn’t**, le verbe reste à la base.'),
  m("It's more better.", "It's much better.", '**Better** est déjà un comparatif.'),
  m('I am boring in this meeting.', 'I am bored in this meeting.', '**Bored** = je m’ennuie ; **boring** = ennuyeux.'),
  m('Can you explain me the rule?', 'Can you explain the rule to me?', 'On dit **explain something to someone**.'),
  m('I make a photo.', 'I take a photo.', 'Une photo se « prend » : **take** a photo.'),
  m('We discussed about the project.', 'We discussed the project.', '**Discuss** se construit sans « about ».'),
  m('I have seen him yesterday.', 'I saw him yesterday.', 'Moment passé précis (yesterday) : **prétérit**.'),
  m('She is married with a doctor.', 'She is married to a doctor.', 'On dit **married to**.'),
  m('He is more tall than me.', 'He is taller than me.', 'Adjectif court : **-er** (taller).'),
  m('I look forward to see you.', 'I look forward to seeing you.', '**Look forward to** + verbe en -ing.'),
  m('There is many people.', 'There are many people.', 'Pluriel : **there are**.'),
  m('I go to work in bus.', 'I go to work by bus.', 'Moyen de transport : **by** bus, by train.'),
  m('I listen music every day.', 'I listen to music every day.', 'On dit **listen to**.'),
  m('He said me the truth.', 'He told me the truth.', '**Tell** someone ; **say** something.'),
  m('I want that you come.', 'I want you to come.', '**Want someone to do** something.'),
  m('I am in Paris since Monday.', 'I have been in Paris since Monday.', 'Depuis + point de départ : present perfect + **since**.'),
  m('I have a lot of works.', 'I have a lot of work.', '**Work** (le travail) est indénombrable.'),
  m('She gave me an advice.', 'She gave me some advice.', '**Advice** est indénombrable : some advice, a piece of advice.'),
  m('Do you know where is the station?', 'Do you know where the station is?', 'Question indirecte : pas d’inversion.'),
  m("I didn't knew that.", "I didn't know that.", 'Après **didn’t**, le verbe reste à la base.'),
  m('We was very tired.', 'We were very tired.', 'We / you / they : **were**.'),
  m('I will call you when I will arrive.', 'I will call you when I arrive.', 'Après **when**, présent pour parler du futur.'),
  m('I prefer tea than coffee.', 'I prefer tea to coffee.', 'On dit **prefer A to B**.'),
  m('My friend borrowed me his car.', 'My friend lent me his car.', '**Lend** = prêter ; **borrow** = emprunter.'),
  m("It's a good news!", "It's good news!", '**News** est indénombrable : pas de « a ».'),
  m('Everybody have a phone.', 'Everybody has a phone.', '**Everybody** se conjugue au singulier.'),
  m('How do you call this in English?', 'What do you call this in English?', 'On dit **What** do you call…?'),
  m('I assisted to the meeting.', 'I attended the meeting.', '**Attend** = assister à ; **assist** = aider.'),
  m('I am used to wake up early.', 'I am used to waking up early.', '**Be used to** + verbe en -ing.'),
  m('Since how long do you work here?', 'How long have you worked here?', 'Durée : **How long have you…?**'),
  m('He works here since 2015.', 'He has worked here since 2015.', 'Depuis 2015 et encore maintenant : **present perfect**.'),
  m('I am hungry, I want eat.', 'I am hungry, I want to eat.', '**Want to** + verbe.'),
];
