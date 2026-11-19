import type { TutorTopic, TopicQuestion } from '../types';

const q = (text: string, starters: string[], words: string[]): TopicQuestion => ({
  q: text,
  starters,
  words,
});

export const TOPICS: TutorTopic[] = [
  /* ------------------------------- TRAVEL ------------------------------- */
  {
    id: 'travel',
    title: 'Voyages',
    icon: '✈️',
    description: 'Parlez de vos vacances, de vos destinations préférées et des imprévus en voyage.',
    scenario:
      'Emma is chatting with the learner about trips, holidays and travel experiences. She may role-play a hotel receptionist, an airport check-in agent or a tourist information officer when it fits the conversation.',
    questions: {
      A: [
        q('Do you like travelling?', ['Yes, I love…', 'No, I don’t like…'], ['trip = voyage', 'holiday = vacances', 'to travel = voyager']),
        q('Where do you usually go on holiday?', ['I usually go to…', 'I often visit…'], ['seaside = bord de mer', 'mountains = montagne', 'countryside = campagne']),
        q('Do you prefer the sea or the mountains?', ['I prefer…', 'I like the… because it is…'], ['beach = plage', 'to swim = nager', 'to hike = faire de la randonnée']),
        q('Where did you go on your last holiday?', ['Last summer, I…', 'I went to…'], ['last year = l’année dernière', 'to visit = visiter', 'sightseeing = tourisme']),
        q('How did you travel there?', ['I went by…', 'We took the…'], ['plane = avion', 'train = train', 'car = voiture', 'bus = bus']),
        q('What did you eat on your trip?', ['I ate…', 'I tried…'], ['local food = cuisine locale', 'delicious = délicieux', 'to try = essayer']),
        q('Do you take many photos when you travel?', ['Yes, I take…', 'No, I don’t…'], ['photo = photo', 'souvenir = souvenir', 'to remember = se souvenir']),
        q('Where would you like to go next?', ['I would like to go to…', 'I want to visit…'], ['to dream of = rêver de', 'far away = loin', 'country = pays']),
      ],
      B: [
        q('What was the most memorable trip you have ever taken?', ['The most memorable trip was…', 'I will never forget…'], ['memorable = mémorable', 'experience = expérience', 'unforgettable = inoubliable']),
        q('Do you prefer organised tours or travelling independently? Why?', ['I prefer… because…', 'One advantage of… is that…'], ['guided tour = visite guidée', 'itinerary = itinéraire', 'to book = réserver', 'budget = budget']),
        q('What is the best way to get to know a new place?', ['In my opinion, the best way is to…', 'I think you should…'], ['to explore = explorer', 'locals = habitants', 'to get lost = se perdre']),
        q('Have you ever had a travel problem, such as a delayed flight or lost luggage?', ['Once, my flight was…', 'I had a problem when…'], ['delayed = retardé', 'luggage = bagages', 'to miss = rater', 'to complain = se plaindre']),
        q('What would you do if you lost your passport abroad?', ['I would probably…', 'First of all, I would…'], ['passport = passeport', 'embassy = ambassade', 'to report = signaler', 'to panic = paniquer']),
        q('How do you plan a trip? Do you like to organise everything in advance?', ['I usually start by…', 'I like to… before I go'], ['to plan = planifier', 'in advance = à l’avance', 'spontaneous = spontané', 'accommodation = hébergement']),
        q('What are the pros and cons of travelling abroad for work or study?', ['A big advantage is…', 'On the other hand…'], ['abroad = à l’étranger', 'drawback = inconvénient', 'to adapt = s’adapter', 'homesick = qui a le mal du pays']),
        q('If you could live in another country for a year, where would you go and why?', ['If I could, I would go to…', 'I would choose… because…'], ['culture = culture', 'language barrier = barrière de la langue', 'lifestyle = mode de vie']),
      ],
      C: [
        q('How has the rise of social media influenced the way people choose their destinations?', ['Social media has encouraged people to…', 'It seems to me that…'], ['influencer = influenceur', 'trend = tendance', 'to go viral = devenir viral', 'authenticity = authenticité']),
        q('To what extent has mass tourism changed the places you love?', ['To a large extent…', 'Overall, it has…'], ['mass tourism = tourisme de masse', 'overcrowded = surpeuplé', 'heritage = patrimoine', 'to erode = éroder']),
        q('Is travelling by plane for leisure still justifiable given the climate crisis?', ['It is hard to justify… because…', 'One could argue that…'], ['carbon footprint = empreinte carbone', 'to offset = compenser', 'sustainable = durable', 'justifiable = justifiable']),
        q('Some people say you cannot truly understand a culture as a tourist. Do you agree?', ['I would partly agree, since…', 'It depends on how…'], ['to immerse oneself = s’immerger', 'superficial = superficiel', 'cultural exchange = échange culturel', 'stereotype = stéréotype']),
        q('What responsibilities do travellers have towards the communities they visit?', ['Travellers ought to…', 'It is our duty to…'], ['to respect = respecter', 'local economy = économie locale', 'to exploit = exploiter', 'ethical = éthique']),
        q('Can travel truly broaden the mind, or is that a cliché?', ['There is some truth in…', 'It can, provided that…'], ['to broaden = élargir', 'cliché = cliché', 'open-minded = ouvert d’esprit', 'perspective = point de vue']),
        q('How do you think travel will evolve over the next few decades?', ['I suspect that…', 'It is likely that…'], ['virtual reality = réalité virtuelle', 'to restrict = restreindre', 'high-speed rail = train à grande vitesse', 'to evolve = évoluer']),
        q('Should governments limit the number of visitors to fragile or overcrowded sites?', ['I strongly believe that…', 'On balance, I think…'], ['quota = quota', 'fragile = fragile', 'to regulate = réglementer', 'to preserve = préserver']),
      ],
    },
  },

  /* -------------------------------- WORK -------------------------------- */
  {
    id: 'work',
    title: 'Monde professionnel',
    icon: '💼',
    description: 'Discutez de votre métier, de vos collègues et de la vie en entreprise.',
    scenario:
      'Emma is chatting with the learner about work, careers and the workplace. She may role-play a colleague, a manager or a client during a meeting or a phone call.',
    questions: {
      A: [
        q('What do you do for a living?', ['I am a…', 'I work as a…'], ['job = travail, métier', 'to work = travailler', 'student = étudiant']),
        q('Where do you work?', ['I work in…', 'I work for a company called…'], ['office = bureau', 'company = entreprise', 'city = ville']),
        q('What time do you start work?', ['I start at…', 'I usually begin at…'], ['to start = commencer', 'to finish = finir', 'early = tôt']),
        q('How do you get to work?', ['I go by…', 'I walk to…'], ['to commute = faire la navette', 'bus = bus', 'bike = vélo']),
        q('Do you like your job?', ['Yes, I like it because…', 'It is OK, but…'], ['boring = ennuyeux', 'interesting = intéressant', 'tired = fatigué']),
        q('Who do you work with?', ['I work with…', 'My colleagues are…'], ['colleague = collègue', 'boss = patron', 'team = équipe']),
        q('What do you usually do at lunchtime?', ['I usually eat…', 'At lunchtime, I…'], ['lunch break = pause déjeuner', 'sandwich = sandwich', 'canteen = cantine']),
        q('What was your first job?', ['My first job was…', 'I worked as a… when I was…'], ['first = premier', 'summer job = job d’été', 'to earn = gagner']),
      ],
      B: [
        q('What does a typical working day look like for you?', ['I usually start by…', 'In the afternoon, I…'], ['daily routine = routine quotidienne', 'meeting = réunion', 'deadline = échéance', 'workload = charge de travail']),
        q('What do you enjoy most and least about your job?', ['What I like most is…', 'What I find difficult is…'], ['rewarding = gratifiant', 'stressful = stressant', 'challenge = défi', 'repetitive = répétitif']),
        q('Do you prefer working alone or in a team? Why?', ['I prefer working… because…', 'Working in a team means…'], ['teamwork = travail d’équipe', 'to cooperate = coopérer', 'independent = autonome', 'to share = partager']),
        q('Have you ever had a disagreement with a colleague? How did you handle it?', ['Once, I disagreed with…', 'In the end, we…'], ['disagreement = désaccord', 'to compromise = faire un compromis', 'to apologise = s’excuser', 'misunderstanding = malentendu']),
        q('What do you think about working from home?', ['In my opinion, remote work is…', 'The main advantage is…'], ['remote work = télétravail', 'flexibility = flexibilité', 'isolated = isolé', 'distraction = distraction']),
        q('How do you manage stress at work?', ['To relax, I…', 'When I feel stressed, I…'], ['to cope with = faire face à', 'burnout = épuisement professionnel', 'to take a break = faire une pause', 'pressure = pression']),
        q('If you could change one thing about your workplace, what would it be?', ['If I could, I would…', 'I would change… because…'], ['management = direction', 'salary = salaire', 'working hours = horaires', 'to improve = améliorer']),
        q('Where do you see yourself in five years?', ['In five years, I hope to…', 'I would like to be…'], ['career = carrière', 'promotion = promotion', 'to progress = progresser', 'goal = objectif']),
      ],
      C: [
        q('Is job satisfaction more important than a high salary?', ['I would argue that…', 'Salary matters, but…'], ['fulfilment = épanouissement', 'income = revenu', 'trade-off = compromis', 'motivation = motivation']),
        q('How is artificial intelligence likely to reshape the job market?', ['It is likely to…', 'Some jobs will probably…'], ['automation = automatisation', 'to replace = remplacer', 'to upskill = se former', 'redundancy = licenciement']),
        q('To what extent should employers be responsible for their employees’ well-being?', ['Employers have a duty to…', 'To a certain extent…'], ['work-life balance = équilibre vie pro/perso', 'duty = devoir', 'well-being = bien-être', 'workplace culture = culture d’entreprise']),
        q('Do you think a four-day working week would be beneficial for society?', ['It could be beneficial because…', 'I am sceptical, since…'], ['productivity = productivité', 'to boost = stimuler', 'drawback = inconvénient', 'trial = essai']),
        q('What makes a good leader, in your experience?', ['A good leader should…', 'In my experience, the best leaders…'], ['to inspire = inspirer', 'empathy = empathie', 'to delegate = déléguer', 'accountable = responsable']),
        q('Is the traditional career path, staying in one company for years, becoming obsolete?', ['It does seem that…', 'That view may be exaggerated because…'], ['obsolete = obsolète', 'loyalty = fidélité', 'career change = reconversion', 'freelance = indépendant']),
        q('How can companies tackle inequality in the workplace more effectively?', ['One effective measure would be…', 'Companies should…'], ['pay gap = écart salarial', 'diversity = diversité', 'bias = préjugé', 'to tackle = s’attaquer à']),
        q('Has the culture of constant connectivity blurred the boundary between work and private life?', ['It has undoubtedly…', 'I would say the line is…'], ['to blur = brouiller', 'to switch off = se déconnecter', 'boundary = frontière', 'right to disconnect = droit à la déconnexion']),
      ],
    },
  },

  /* ------------------------------ PERSONAL ------------------------------ */
  {
    id: 'personal',
    title: 'Vie personnelle',
    icon: '🏡',
    description: 'Présentez-vous, parlez de votre famille, de vos amis et de votre quotidien.',
    scenario:
      'Emma is getting to know the learner in a warm, friendly conversation about family, friends, home and daily life. She shares small personal details of her own to keep the chat natural and never asks anything too intrusive.',
    questions: {
      A: [
        q('What is your name and where are you from?', ['My name is…', 'I am from…'], ['name = nom', 'from = originaire de', 'to live = habiter']),
        q('How old are you?', ['I am… years old.', 'I will be… next month.'], ['age = âge', 'birthday = anniversaire', 'young = jeune']),
        q('Do you have any brothers or sisters?', ['I have one…', 'I am an only child.'], ['brother = frère', 'sister = sœur', 'only child = enfant unique']),
        q('Tell me about your family.', ['There are… people in my family.', 'My mother is…'], ['parents = parents', 'grandparents = grands-parents', 'married = marié']),
        q('Where do you live? Is it a house or a flat?', ['I live in a…', 'My flat has…'], ['flat = appartement', 'house = maison', 'room = pièce']),
        q('Who is your best friend?', ['My best friend is…', 'We met at…'], ['friend = ami', 'to meet = rencontrer', 'funny = drôle', 'kind = gentil']),
        q('What do you usually do in the evening?', ['In the evening, I…', 'I often watch…'], ['to cook = cuisiner', 'to relax = se détendre', 'to go to bed = se coucher']),
        q('What did you do last weekend?', ['Last weekend, I…', 'On Saturday, I…'], ['weekend = week-end', 'to visit = rendre visite', 'to stay at home = rester à la maison']),
      ],
      B: [
        q('Can you describe your personality in a few words?', ['I would describe myself as…', 'People say that I am…'], ['shy = timide', 'outgoing = extraverti', 'patient = patient', 'stubborn = têtu']),
        q('What is your relationship like with your family?', ['I get on well with…', 'We see each other…'], ['to get on with = s’entendre avec', 'to argue = se disputer', 'close = proche', 'to support = soutenir']),
        q('What are the qualities you value most in a friend?', ['I think a good friend should be…', 'Above all, I value…'], ['honest = honnête', 'reliable = fiable', 'loyal = loyal', 'sense of humour = sens de l’humour']),
        q('Tell me about a memorable event in your life.', ['One of the best days of my life was…', 'I still remember when…'], ['wedding = mariage', 'to graduate = obtenir son diplôme', 'to celebrate = fêter', 'moment = moment']),
        q('How do you usually celebrate special occasions like birthdays?', ['We usually…', 'On my birthday, I like to…'], ['gift = cadeau', 'party = fête', 'to invite = inviter', 'tradition = tradition']),
        q('What would your perfect weekend look like?', ['My perfect weekend would be…', 'I would start by…'], ['to unwind = décompresser', 'to catch up with = rattraper', 'peaceful = paisible', 'to go out = sortir']),
        q('How has your life changed in the last five years?', ['Five years ago, I…', 'Since then, I have…'], ['to move house = déménager', 'to change = changer', 'to grow up = grandir', 'to improve = s’améliorer']),
        q('If you could give advice to your younger self, what would you say?', ['I would tell myself to…', 'Don’t worry about…'], ['advice = conseil', 'regret = regret', 'mistake = erreur', 'to trust = faire confiance']),
      ],
      C: [
        q('How much do you think our upbringing shapes the people we become?', ['I believe that upbringing…', 'It is a combination of…'], ['upbringing = éducation', 'nature versus nurture = l’inné et l’acquis', 'to shape = façonner', 'influence = influence']),
        q('What does happiness mean to you, and has that definition changed over time?', ['For me, happiness is…', 'I used to think that…'], ['fulfilment = épanouissement', 'contentment = contentement', 'to pursue = poursuivre', 'meaningful = qui a du sens']),
        q('Are modern friendships as deep as those of previous generations?', ['It could be argued that…', 'I am not convinced that…'], ['superficial = superficiel', 'bond = lien', 'to drift apart = s’éloigner', 'generation = génération']),
        q('How important is it to step out of your comfort zone?', ['Stepping out of your comfort zone can…', 'I would say it is essential to…'], ['comfort zone = zone de confort', 'to take risks = prendre des risques', 'resilience = résilience', 'to grow = évoluer']),
        q('Do you think it is possible to be truly independent in today’s society?', ['Complete independence seems…', 'We all depend on…'], ['independent = indépendant', 'interdependence = interdépendance', 'self-reliant = autonome', 'community = communauté']),
        q('What role does tradition play in your family, and should it be preserved?', ['In my family, tradition…', 'It is worth preserving because…'], ['custom = coutume', 'to hand down = transmettre', 'heritage = héritage', 'values = valeurs']),
        q('How do you deal with disagreements with people who are close to you?', ['I try to…', 'When tensions rise, I…'], ['to tolerate = tolérer', 'to confront = affronter', 'to reconcile = se réconcilier', 'grudge = rancune']),
        q('Looking back, which decision has had the greatest impact on your life?', ['Looking back, the decision to…', 'It completely changed…'], ['turning point = tournant', 'in hindsight = avec le recul', 'to weigh up = peser', 'consequence = conséquence']),
      ],
    },
  },

  /* ------------------------------- FOOD --------------------------------- */
  {
    id: 'food',
    title: 'Restaurant & cuisine',
    icon: '🍽️',
    description: 'Parlez de vos plats préférés, de cuisine et de sorties au restaurant.',
    scenario:
      'Emma is chatting with the learner about food, cooking and eating out. She may role-play a waiter or waitress taking an order, or a friend choosing a restaurant.',
    questions: {
      A: [
        q('What is your favourite food?', ['My favourite food is…', 'I love eating…'], ['favourite = préféré', 'pasta = pâtes', 'chicken = poulet', 'cheese = fromage']),
        q('What do you usually eat for breakfast?', ['For breakfast, I have…', 'I usually drink…'], ['breakfast = petit-déjeuner', 'bread = pain', 'coffee = café', 'egg = œuf']),
        q('Do you like cooking?', ['Yes, I like cooking…', 'No, I can’t cook very well.'], ['to cook = cuisiner', 'kitchen = cuisine', 'easy = facile', 'recipe = recette']),
        q('What food do you not like?', ['I don’t like…', 'I hate…'], ['vegetables = légumes', 'fish = poisson', 'spicy = épicé', 'sweet = sucré']),
        q('Do you often eat at a restaurant?', ['I eat at a restaurant…', 'We sometimes go to…'], ['often = souvent', 'once a week = une fois par semaine', 'menu = carte', 'waiter = serveur']),
        q('What did you eat yesterday evening?', ['Yesterday, I ate…', 'For dinner, I had…'], ['dinner = dîner', 'soup = soupe', 'salad = salade', 'rice = riz']),
        q('What do you like to drink?', ['I like drinking…', 'I always drink… with my meal.'], ['water = eau', 'juice = jus', 'tea = thé', 'wine = vin']),
        q('Can you tell me about a typical dish from your region?', ['A typical dish is…', 'It is made with…'], ['dish = plat', 'region = région', 'ingredient = ingrédient', 'delicious = délicieux']),
      ],
      B: [
        q('Can you describe your favourite restaurant and what makes it special?', ['It is a small… where…', 'What I love about it is…'], ['atmosphere = ambiance', 'cosy = chaleureux', 'service = service', 'reasonable = raisonnable (prix)']),
        q('How would you politely complain if your meal was cold?', ['Excuse me, I’m afraid that…', 'Could you please…?'], ['to complain = se plaindre', 'undercooked = pas assez cuit', 'to send back = renvoyer', 'refund = remboursement']),
        q('Do you prefer cooking at home or eating out? Why?', ['I prefer… because…', 'Eating out is…'], ['takeaway = plat à emporter', 'homemade = fait maison', 'cheaper = moins cher', 'to save time = gagner du temps']),
        q('What is the best meal you have ever had?', ['The best meal I have ever had was…', 'It was in…'], ['starter = entrée', 'main course = plat principal', 'dessert = dessert', 'unforgettable = inoubliable']),
        q('Have you ever tried food from a very different culture? What did you think?', ['I once tried…', 'At first, I found it…'], ['to taste = goûter', 'flavour = saveur', 'unusual = inhabituel', 'to get used to = s’habituer à']),
        q('How healthy is your diet, in your opinion?', ['I try to eat…', 'I should eat less…'], ['balanced diet = alimentation équilibrée', 'junk food = malbouffe', 'fresh = frais', 'to cut down on = réduire']),
        q('If you were hosting a dinner party, what would you cook?', ['I would prepare…', 'For dessert, I would make…'], ['to host = recevoir', 'guest = invité', 'to serve = servir', 'vegetarian = végétarien']),
        q('What are the eating habits in your country that might surprise a visitor?', ['Visitors might be surprised that…', 'In my country, people usually…'], ['custom = coutume', 'to tip = laisser un pourboire', 'meal time = heure du repas', 'table manners = manières de table']),
      ],
      C: [
        q('How has globalisation affected traditional cuisines?', ['Globalisation has led to…', 'On the one hand…, but on the other…'], ['fusion cuisine = cuisine fusion', 'authentic = authentique', 'to dilute = diluer', 'staple = aliment de base']),
        q('Is it ethical to eat meat in the modern world?', ['It is a complex issue because…', 'Personally, I believe that…'], ['animal welfare = bien-être animal', 'vegan = végétalien', 'livestock = bétail', 'moral = moral']),
        q('Should governments tax unhealthy food, such as sugary drinks?', ['I am in favour of… because…', 'Such a tax would…'], ['sugar tax = taxe sur le sucre', 'obesity = obésité', 'public health = santé publique', 'to discourage = décourager']),
        q('What is the significance of sharing a meal in your culture?', ['Sharing a meal is…', 'Mealtimes are an opportunity to…'], ['to gather = se réunir', 'hospitality = hospitalité', 'ritual = rituel', 'sense of belonging = sentiment d’appartenance']),
        q('Do you think food waste is more a matter of individual behaviour or of systemic failure?', ['Both individuals and… are responsible', 'I would put the blame on…'], ['food waste = gaspillage alimentaire', 'supermarket = supermarché', 'surplus = surplus', 'sell-by date = date limite']),
        q('How realistic is it to feed the growing world population sustainably?', ['It is challenging, but…', 'We will need to…'], ['sustainable = durable', 'to farm = cultiver', 'yield = rendement', 'lab-grown meat = viande de synthèse']),
        q('Has the rise of cooking shows and food blogs changed how we relate to food?', ['It seems that…', 'Such content has made people…'], ['trend = tendance', 'foodie = gourmet', 'to showcase = mettre en valeur', 'obsession = obsession']),
        q('To what extent is a country’s identity tied to its cuisine?', ['Cuisine is a key part of…', 'Food reflects a nation’s…'], ['identity = identité', 'to reflect = refléter', 'terroir = terroir', 'pride = fierté']),
      ],
    },
  },

  /* ------------------------------ HOBBIES ------------------------------- */
  {
    id: 'hobbies',
    title: 'Loisirs & passions',
    icon: '🎨',
    description: 'Partagez vos hobbies, vos sports et ce qui vous passionne.',
    scenario:
      'Emma is chatting with the learner about free time, hobbies, sports and passions. She shows genuine curiosity and may share her own hobbies to keep the conversation natural.',
    questions: {
      A: [
        q('What do you do in your free time?', ['In my free time, I…', 'I like…'], ['free time = temps libre', 'hobby = loisir', 'to enjoy = aimer bien']),
        q('Do you play any sports?', ['Yes, I play…', 'No, but I like watching…'], ['football = football', 'tennis = tennis', 'to run = courir', 'to swim = nager']),
        q('Do you like music? What kind?', ['I like… music.', 'My favourite singer is…'], ['song = chanson', 'to listen to = écouter', 'to sing = chanter', 'concert = concert']),
        q('Do you like reading books?', ['Yes, I read…', 'I don’t read much.'], ['book = livre', 'novel = roman', 'story = histoire', 'to borrow = emprunter']),
        q('What kind of films do you like?', ['I like… films.', 'My favourite film is…'], ['comedy = comédie', 'horror = film d’horreur', 'actor = acteur', 'to watch = regarder']),
        q('Do you like playing video games?', ['Yes, I play…', 'No, I prefer…'], ['game = jeu', 'to play = jouer', 'console = console', 'friends = amis']),
        q('What do you do on Sundays?', ['On Sundays, I…', 'I usually go…'], ['Sunday = dimanche', 'to walk = se promener', 'park = parc', 'to rest = se reposer']),
        q('Did you have a hobby when you were a child?', ['When I was a child, I…', 'I played…'], ['child = enfant', 'toy = jouet', 'to draw = dessiner', 'to ride a bike = faire du vélo']),
      ],
      B: [
        q('How did you get into your main hobby?', ['I got into it when…', 'It all started when…'], ['to take up = se mettre à', 'passion = passion', 'to be keen on = être passionné de', 'beginner = débutant']),
        q('What do you find most rewarding about it?', ['The best part is…', 'It makes me feel…'], ['rewarding = gratifiant', 'to relax = se détendre', 'to improve = progresser', 'sense of achievement = sentiment d’accomplissement']),
        q('Do you prefer team sports or individual activities?', ['I prefer… because…', 'In a team, you can…'], ['team spirit = esprit d’équipe', 'competitive = compétitif', 'to train = s’entraîner', 'on your own = tout seul']),
        q('Is there a skill you would love to learn? What is stopping you?', ['I would love to learn…', 'The problem is that I…'], ['skill = compétence', 'to master = maîtriser', 'lack of time = manque de temps', 'to give up = abandonner']),
        q('How much money do you spend on your hobbies?', ['I spend about… on…', 'It can be expensive because…'], ['equipment = équipement', 'subscription = abonnement', 'to afford = se permettre', 'worth it = qui en vaut la peine']),
        q('Have you ever done something adventurous or a bit crazy for fun?', ['Once, I tried…', 'I was scared at first, but…'], ['adventurous = aventureux', 'bungee jumping = saut à l’élastique', 'thrilling = palpitant', 'to dare = oser']),
        q('Do you think hobbies are important for mental health?', ['I think they are important because…', 'Having a hobby helps you…'], ['mental health = santé mentale', 'to escape = s’évader', 'stress relief = antistress', 'balance = équilibre']),
        q('If you had a whole free day with no obligations, what would you do?', ['If I had a free day, I would…', 'I would spend it…'], ['obligation = obligation', 'to indulge = se faire plaisir', 'to do nothing = ne rien faire', 'at my own pace = à mon rythme']),
      ],
      C: [
        q('Should hobbies be turned into careers, or is it better to keep them separate?', ['Turning a hobby into a job can…', 'I think it is wiser to…'], ['to monetise = monétiser', 'burnout = épuisement', 'passion project = projet passion', 'to pursue = poursuivre']),
        q('Why do you think so many people are drawn to extreme sports?', ['People may be attracted by…', 'It seems to satisfy a need for…'], ['adrenaline = adrénaline', 'risk = risque', 'to push one’s limits = repousser ses limites', 'thrill-seeker = amateur de sensations fortes']),
        q('Has technology made our leisure time richer or more passive?', ['It has made it…', 'Screens tend to…'], ['passive = passif', 'streaming = streaming', 'to binge-watch = regarder en rafale', 'engaging = captivant']),
        q('Is professional sport worth the amount of money and attention it receives?', ['It is debatable whether…', 'The sums involved seem…'], ['salary = salaire', 'sponsorship = sponsoring', 'role model = modèle', 'excessive = excessif']),
        q('What can art and creativity offer society beyond entertainment?', ['Art can play a role in…', 'Creativity helps us to…'], ['to provoke thought = faire réfléchir', 'expression = expression', 'funding = financement', 'cultural value = valeur culturelle']),
        q('Do competitive pressures spoil the pleasure of an activity?', ['Competition can indeed…', 'It depends on whether…'], ['to spoil = gâcher', 'pressure = pression', 'to thrive = s’épanouir', 'to compare oneself = se comparer']),
        q('How do you think the way people spend their leisure time reflects their society’s values?', ['Leisure habits often reveal…', 'In my country, people tend to…'], ['to reflect = refléter', 'consumerism = consumérisme', 'collective = collectif', 'values = valeurs']),
        q('Is it better to become highly skilled at one thing or to try many activities?', ['There is something to be said for…', 'Personally, I prefer…'], ['to specialise = se spécialiser', 'jack of all trades = touche-à-tout', 'depth = profondeur', 'well-rounded = complet']),
      ],
    },
  },

  /* ------------------------------- HEALTH ------------------------------- */
  {
    id: 'health',
    title: 'Santé & bien-être',
    icon: '🩺',
    description: 'Parlez de santé, de sport, de sommeil et de bien-être, ou jouez une consultation chez le médecin.',
    scenario:
      'Emma is chatting with the learner about health, fitness and well-being. She may role-play a doctor or a pharmacist during a consultation, but she never gives real medical advice.',
    questions: {
      A: [
        q('How are you today?', ['I am fine, thank you.', 'I feel a bit…'], ['tired = fatigué', 'happy = content', 'sick = malade']),
        q('Do you sleep well at night?', ['I sleep… hours.', 'I go to bed at…'], ['to sleep = dormir', 'bed = lit', 'night = nuit', 'early = tôt']),
        q('Do you do any exercise?', ['Yes, I…', 'No, I don’t do much sport.'], ['exercise = exercice', 'gym = salle de sport', 'to walk = marcher', 'to run = courir']),
        q('What do you eat to stay healthy?', ['I eat a lot of…', 'I try to eat…'], ['fruit = fruits', 'vegetables = légumes', 'healthy = sain', 'water = eau']),
        q('Do you drink enough water?', ['Yes, I drink…', 'No, I forget to drink water.'], ['glass = verre', 'bottle = bouteille', 'thirsty = qui a soif']),
        q('What do you do when you have a headache?', ['I take…', 'I lie down and…'], ['headache = mal de tête', 'medicine = médicament', 'to rest = se reposer']),
        q('When did you last go to the doctor?', ['I went to the doctor…', 'I had a… last year.'], ['doctor = médecin', 'appointment = rendez-vous', 'ill = malade', 'cold = rhume']),
        q('What do you do to relax?', ['To relax, I…', 'I like to listen to…'], ['to relax = se détendre', 'music = musique', 'bath = bain', 'walk = promenade']),
      ],
      B: [
        q('How would you describe your lifestyle: healthy, or could it be better?', ['I would say it is…', 'I could definitely improve…'], ['lifestyle = mode de vie', 'habit = habitude', 'to improve = améliorer', 'regularly = régulièrement']),
        q('What would you say to a doctor if you had a sore throat and a fever?', ['I have had… since…', 'I have a pain in…'], ['sore throat = mal de gorge', 'fever = fièvre', 'symptom = symptôme', 'prescription = ordonnance']),
        q('Have you ever had an injury or been in hospital?', ['I once broke my…', 'I had to stay in hospital for…'], ['to break = casser', 'injury = blessure', 'to recover = se rétablir', 'stitches = points de suture']),
        q('How do you try to reduce stress in your daily life?', ['I try to…', 'What helps me most is…'], ['stress = stress', 'meditation = méditation', 'to unwind = décompresser', 'to cope = gérer']),
        q('Do you think people sleep enough these days? Why or why not?', ['I don’t think people…', 'Many people stay up late because…'], ['sleep deprivation = manque de sommeil', 'screen time = temps d’écran', 'insomnia = insomnie', 'to be exhausted = être épuisé']),
        q('What are the pros and cons of going to the gym compared with exercising outdoors?', ['At the gym, you can…', 'Outdoors, it is…'], ['equipment = équipement', 'fresh air = air frais', 'membership = abonnement', 'motivation = motivation']),
        q('Would you ever try a very different diet, like going vegetarian? Why?', ['I might try… because…', 'I don’t think I could…'], ['diet = régime', 'to cut out = supprimer', 'vegetarian = végétarien', 'protein = protéine']),
        q('What advice would you give to a friend who always feels tired?', ['I would advise them to…', 'If I were you, I would…'], ['advice = conseil', 'to see a doctor = consulter un médecin', 'routine = routine', 'to cut down on = réduire']),
      ],
      C: [
        q('Should access to healthcare be entirely free, funded by the state?', ['I believe that healthcare should…', 'The main argument for… is…'], ['public healthcare = santé publique', 'taxpayer = contribuable', 'universal = universel', 'waiting list = liste d’attente']),
        q('How seriously do we take mental health compared with physical health?', ['Mental health is often…', 'There is still a stigma…'], ['stigma = stigmate', 'to seek help = chercher de l’aide', 'therapy = thérapie', 'awareness = sensibilisation']),
        q('Is the wellness industry genuinely helpful or mostly marketing?', ['Some products may be…, but many…', 'I tend to be sceptical about…'], ['wellness = bien-être', 'supplement = complément alimentaire', 'fad = mode passagère', 'evidence = preuve']),
        q('What are the ethical challenges of using technology and data in medicine?', ['A major concern is…', 'Patient privacy could be…'], ['privacy = vie privée', 'consent = consentement', 'diagnosis = diagnostic', 'breakthrough = avancée']),
        q('To what extent is staying healthy a personal responsibility rather than a social one?', ['Individuals can certainly…, yet…', 'Social factors such as… also matter'], ['preventive = préventif', 'inequality = inégalité', 'to take responsibility = assumer la responsabilité', 'access = accès']),
        q('Do you think ageing populations will put unsustainable pressure on health systems?', ['It is likely that…', 'Governments will have to…'], ['ageing population = vieillissement de la population', 'pension = retraite', 'to strain = mettre sous tension', 'life expectancy = espérance de vie']),
        q('How has the pandemic changed our attitude towards health and community?', ['The pandemic made many of us…', 'In the long run, it may…'], ['lockdown = confinement', 'vaccination = vaccination', 'solidarity = solidarité', 'lasting impact = impact durable']),
        q('Is the pursuit of perfect health and fitness becoming an obsession?', ['For some people, it has…', 'There is a fine line between…'], ['obsession = obsession', 'body image = image corporelle', 'to track = suivre', 'fine line = frontière ténue']),
      ],
    },
  },

  /* ------------------------------ SHOPPING ------------------------------ */
  {
    id: 'shopping',
    title: 'Shopping & argent',
    icon: '🛍️',
    description: 'Parlez de vos achats, de budget et jouez des scènes en magasin.',
    scenario:
      'Emma is chatting with the learner about shopping, spending and money. She may role-play a shop assistant helping a customer, or a customer service agent handling a return.',
    questions: {
      A: [
        q('Do you like shopping?', ['Yes, I love…', 'No, I don’t like…'], ['shop = magasin', 'to buy = acheter', 'to like = aimer']),
        q('Where do you usually buy your clothes?', ['I buy my clothes at…', 'I often go to…'], ['clothes = vêtements', 'shopping centre = centre commercial', 'online = en ligne']),
        q('What did you buy last week?', ['Last week, I bought…', 'I bought a…'], ['to buy = acheter', 'shoes = chaussures', 'present = cadeau']),
        q('Is it expensive to live in your city?', ['Yes, it is expensive.', 'No, it is quite cheap.'], ['expensive = cher', 'cheap = bon marché', 'price = prix', 'rent = loyer']),
        q('How much is a cup of coffee in your town?', ['A cup of coffee is…', 'It costs about…'], ['euro = euro', 'to cost = coûter', 'coffee = café']),
        q('Do you go to the supermarket every week?', ['Yes, I go every…', 'I usually go on…'], ['supermarket = supermarché', 'shopping list = liste de courses', 'basket = panier']),
        q('Do you pay with cash or by card?', ['I usually pay by…', 'I always use…'], ['cash = espèces', 'card = carte', 'to pay = payer']),
        q('What is your favourite shop?', ['My favourite shop is…', 'I like it because…'], ['favourite = préféré', 'big = grand', 'cheap = bon marché', 'nice = agréable']),
      ],
      B: [
        q('Do you prefer shopping online or in a real shop? Why?', ['I prefer… because…', 'One advantage of online shopping is…'], ['delivery = livraison', 'to try on = essayer', 'to compare prices = comparer les prix', 'convenient = pratique']),
        q('Have you ever bought something you later regretted?', ['Once, I bought…', 'I regretted it because…'], ['to regret = regretter', 'waste of money = gaspillage d’argent', 'impulse buy = achat impulsif', 'to return = rendre']),
        q('How would you ask a shop assistant for a different size or a refund?', ['Excuse me, do you have this in…?', 'I would like to return this…'], ['size = taille', 'receipt = ticket de caisse', 'refund = remboursement', 'exchange = échange']),
        q('Are you good at saving money, or do you spend it quickly?', ['I try to save…', 'I tend to spend…'], ['to save = économiser', 'to spend = dépenser', 'savings = économies', 'budget = budget']),
        q('What do you think about sales and special offers? Do they really save you money?', ['Sales can be…', 'I often end up buying…'], ['sale = soldes', 'bargain = bonne affaire', 'discount = réduction', 'to tempt = tenter']),
        q('If you suddenly won a large sum of money, what would you do with it?', ['If I won a lot of money, I would…', 'First, I would…'], ['to win = gagner', 'lottery = loterie', 'to invest = investir', 'to donate = faire un don']),
        q('How do you decide whether a product is worth its price?', ['I usually check…', 'For me, quality matters more than…'], ['quality = qualité', 'review = avis', 'durable = durable', 'value for money = rapport qualité-prix']),
        q('Do you think young people today are good at managing money?', ['I think many young people…', 'They are often under pressure to…'], ['debt = dette', 'loan = prêt', 'to manage = gérer', 'financial education = éducation financière']),
      ],
      C: [
        q('To what extent does advertising shape what we believe we need?', ['Advertising plays a major role in…', 'We are constantly encouraged to…'], ['advertising = publicité', 'to manipulate = manipuler', 'brand = marque', 'artificial need = besoin artificiel']),
        q('Is consumerism compatible with a sustainable future?', ['Consumerism seems at odds with…', 'We would need to rethink…'], ['consumerism = consumérisme', 'overconsumption = surconsommation', 'planned obsolescence = obsolescence programmée', 'to rethink = repenser']),
        q('Do you think fast fashion should be regulated more strictly?', ['Stricter rules would…', 'Consumers also have to…'], ['fast fashion = mode jetable', 'sweatshop = atelier de misère', 'to regulate = réglementer', 'textile waste = déchets textiles']),
        q('Is a cashless society desirable, or does it carry risks?', ['A cashless society would make…, but…', 'My main concern is…'], ['cashless = sans espèces', 'surveillance = surveillance', 'fraud = fraude', 'financial exclusion = exclusion financière']),
        q('Can money buy happiness, or is that an oversimplification?', ['Up to a certain point, money…', 'That saying overlooks…'], ['wealth = richesse', 'oversimplification = simplification excessive', 'security = sécurité', 'to overlook = négliger']),
        q('How should wealth be distributed more fairly in society?', ['One approach would be to…', 'Wealth inequality is…'], ['inequality = inégalité', 'taxation = imposition', 'redistribution = redistribution', 'minimum wage = salaire minimum']),
        q('What are the consequences of the growing power of big online retailers on local businesses?', ['Small shops are struggling to…', 'High streets may…'], ['high street = rue commerçante', 'to compete = rivaliser', 'monopoly = monopole', 'to close down = fermer']),
        q('Would you support a shift towards a sharing or second-hand economy?', ['I would welcome it because…', 'It could be difficult to…'], ['second-hand = d’occasion', 'to repair = réparer', 'circular economy = économie circulaire', 'to share = partager']),
      ],
    },
  },

  /* -------------------------------- TECH -------------------------------- */
  {
    id: 'tech',
    title: 'Technologie & réseaux',
    icon: '📱',
    description: 'Discutez de votre smartphone, des réseaux sociaux et de l’avenir du numérique.',
    scenario:
      'Emma is chatting with the learner about technology, devices, social media and the internet. She may role-play a tech support agent helping with a problem.',
    questions: {
      A: [
        q('Do you have a smartphone?', ['Yes, I have a…', 'My phone is…'], ['smartphone = smartphone', 'new = nouveau', 'old = vieux']),
        q('How often do you use your phone every day?', ['I use it…', 'I use my phone for…'], ['hour = heure', 'to call = appeler', 'message = message']),
        q('What apps do you use the most?', ['I use… every day.', 'My favourite app is…'], ['app = application', 'to download = télécharger', 'to play = jouer']),
        q('Do you use social media?', ['Yes, I use…', 'No, I don’t use…'], ['social media = réseaux sociaux', 'to post = publier', 'photo = photo', 'friend = ami']),
        q('Do you have a computer at home?', ['Yes, I have a…', 'I use it to…'], ['computer = ordinateur', 'laptop = ordinateur portable', 'screen = écran', 'keyboard = clavier']),
        q('How do you talk to your friends: by phone or by message?', ['I usually send messages.', 'I prefer to call because…'], ['text message = SMS', 'to call = appeler', 'video call = appel vidéo']),
        q('What is your favourite website?', ['My favourite website is…', 'I go there to…'], ['website = site web', 'to search = chercher', 'to watch videos = regarder des vidéos']),
        q('Did you use a computer when you were a child?', ['Yes, I played…', 'No, I didn’t have…'], ['child = enfant', 'game = jeu', 'to learn = apprendre']),
      ],
      B: [
        q('How has technology changed your daily life over the last ten years?', ['It has made my life…', 'Ten years ago, I used to…'], ['to change = changer', 'convenient = pratique', 'to depend on = dépendre de', 'gadget = gadget']),
        q('Do you think people spend too much time on their phones?', ['In my opinion, many people…', 'I sometimes catch myself…'], ['addicted = accro', 'notification = notification', 'screen time = temps d’écran', 'to scroll = faire défiler']),
        q('What are the benefits and dangers of social media for teenagers?', ['One benefit is that…', 'A real danger is…'], ['cyberbullying = cyberharcèlement', 'peer pressure = pression des pairs', 'to connect = se connecter', 'self-esteem = estime de soi']),
        q('Have you ever had a serious problem with your computer or phone?', ['Once, my… stopped working.', 'I lost all my…'], ['to crash = planter', 'to back up = sauvegarder', 'to fix = réparer', 'battery = batterie']),
        q('How careful are you about your privacy and passwords online?', ['I try to be careful by…', 'I admit that I…'], ['password = mot de passe', 'to hack = pirater', 'privacy = vie privée', 'security = sécurité']),
        q('Do you think robots and artificial intelligence will make our lives easier?', ['I think they will help us…', 'I am a bit worried that…'], ['artificial intelligence = intelligence artificielle', 'to automate = automatiser', 'to replace = remplacer', 'helpful = utile']),
        q('If you could invent a new app, what would it do?', ['If I could invent an app, it would…', 'It would help people to…'], ['to invent = inventer', 'to design = concevoir', 'user = utilisateur', 'feature = fonctionnalité']),
        q('Could you live without the internet for a week? What would you miss most?', ['I think I could, but…', 'I would miss… the most'], ['to miss = manquer', 'to disconnect = se déconnecter', 'digital detox = détox numérique', 'to cope = s’en sortir']),
      ],
      C: [
        q('To what extent should social media platforms be held responsible for the content users post?', ['Platforms bear some responsibility for…', 'It is difficult to draw the line between…'], ['moderation = modération', 'disinformation = désinformation', 'freedom of speech = liberté d’expression', 'accountable = responsable']),
        q('Is the digital divide a serious threat to equality?', ['The digital divide risks…', 'Those without access…'], ['digital divide = fracture numérique', 'access = accès', 'to exclude = exclure', 'digital literacy = culture numérique']),
        q('How worried should we be about the use of personal data by big tech companies?', ['We should be concerned about…', 'Our data is…'], ['data = données', 'surveillance = surveillance', 'targeted advertising = publicité ciblée', 'regulation = réglementation']),
        q('Can artificial intelligence ever be truly creative?', ['It depends on how we define…', 'AI can imitate, but…'], ['creativity = créativité', 'algorithm = algorithme', 'to imitate = imiter', 'originality = originalité']),
        q('Has technology made us more connected or more isolated?', ['Paradoxically, technology has…', 'We are connected, yet…'], ['isolated = isolé', 'superficial = superficiel', 'loneliness = solitude', 'paradox = paradoxe']),
        q('Should children’s access to screens and social media be limited by law?', ['There is a strong case for…', 'Parents should be the ones to…'], ['to restrict = restreindre', 'age limit = limite d’âge', 'development = développement', 'to enforce = faire appliquer']),
        q('What ethical dilemmas might emerge from advances such as genetic engineering or self-driving cars?', ['One dilemma would be…', 'Who should be held liable if…'], ['genetic engineering = génie génétique', 'self-driving = autonome', 'liability = responsabilité', 'moral dilemma = dilemme moral']),
        q('How might technology change the worlds of work and education over the next thirty years?', ['I imagine that…', 'It is quite possible that…'], ['to adapt = s’adapter', 'virtual classroom = classe virtuelle', 'obsolete = obsolète', 'lifelong learning = formation tout au long de la vie']),
      ],
    },
  },

  /* ------------------------------ INTERVIEW ----------------------------- */
  {
    id: 'interview',
    title: 'Entretien d’embauche',
    icon: '🤝',
    description: 'Entraînez-vous à un entretien d’embauche en anglais face à Emma, la recruteuse.',
    scenario:
      'Role-play: Emma is a friendly but professional recruiter interviewing the learner for a job. She stays in character, asks one question at a time, follows up on the learner’s answers and, when the interview ends, gives short encouraging feedback.',
    questions: {
      A: [
        q('Hello, nice to meet you. Can you tell me your name, please?', ['My name is…', 'Nice to meet you, I am…'], ['to meet = rencontrer', 'pleased = enchanté', 'name = nom']),
        q('Can you introduce yourself in a few words?', ['I am… years old.', 'I come from…'], ['to introduce = présenter', 'to live = habiter', 'to work = travailler']),
        q('What is your job now?', ['I work as a…', 'I am a student.'], ['job = emploi', 'student = étudiant', 'company = entreprise']),
        q('Why do you want this job?', ['I want this job because…', 'I like…'], ['to want = vouloir', 'interesting = intéressant', 'to learn = apprendre']),
        q('What languages do you speak?', ['I speak…', 'My English is…'], ['language = langue', 'fluent = courant', 'a little = un peu']),
        q('What are you good at?', ['I am good at…', 'I can…'], ['to be good at = être doué pour', 'computer = ordinateur', 'to help = aider']),
        q('Can you work in a team?', ['Yes, I like working with…', 'I am a team player.'], ['team = équipe', 'to help = aider', 'colleague = collègue']),
        q('When can you start?', ['I can start…', 'I am free from…'], ['to start = commencer', 'next month = le mois prochain', 'free = disponible']),
      ],
      B: [
        q('Thank you for coming. Could you start by telling me a bit about yourself and your background?', ['I graduated in…', 'I have been working in… for…'], ['background = parcours', 'to graduate = être diplômé', 'experience = expérience', 'degree = diplôme']),
        q('What attracted you to this position and to our company?', ['I was attracted by…', 'I have always admired…'], ['position = poste', 'to apply = postuler', 'to admire = admirer', 'opportunity = opportunité']),
        q('What would you say are your greatest strengths?', ['One of my main strengths is…', 'I am particularly good at…'], ['strength = point fort', 'organised = organisé', 'reliable = fiable', 'hard-working = travailleur']),
        q('And what about your weaknesses? Can you give me an example?', ['Sometimes I tend to…', 'I am working on…'], ['weakness = point faible', 'perfectionist = perfectionniste', 'to improve = s’améliorer', 'to overcome = surmonter']),
        q('Can you tell me about a time when you solved a difficult problem at work?', ['One time, I had to…', 'The situation was…'], ['to solve = résoudre', 'challenge = défi', 'solution = solution', 'result = résultat']),
        q('How do you handle pressure and tight deadlines?', ['I stay calm by…', 'When I have a deadline, I…'], ['deadline = échéance', 'to prioritise = prioriser', 'to stay calm = rester calme', 'to manage time = gérer son temps']),
        q('Where do you see yourself in five years?', ['In five years, I hope to…', 'I would like to…'], ['career = carrière', 'to develop = évoluer', 'responsibility = responsabilité', 'to grow = grandir']),
        q('Do you have any questions for us?', ['Yes, I would like to know…', 'Could you tell me more about…?'], ['team = équipe', 'training = formation', 'salary = salaire', 'next steps = prochaines étapes']),
      ],
      C: [
        q('Your CV is impressive. Could you walk me through your career and the key decisions that shaped it?', ['I began my career in…', 'A turning point was when…'], ['to walk through = présenter en détail', 'turning point = tournant', 'to shape = façonner', 'trajectory = trajectoire']),
        q('What would you say is your most significant professional achievement, and what did it teach you?', ['I am most proud of…', 'That experience taught me…'], ['achievement = réussite', 'to lead = diriger', 'outcome = résultat', 'lesson = leçon']),
        q('Tell me about a time you had to deal with a conflict within your team. What was your approach?', ['There was a tense situation when…', 'I approached it by…'], ['conflict = conflit', 'to mediate = jouer les médiateurs', 'to de-escalate = désamorcer', 'stakeholder = partie prenante']),
        q('How would you describe your leadership or management style?', ['I would say I am…', 'I believe in…'], ['to empower = responsabiliser', 'to delegate = déléguer', 'hands-on = impliqué', 'to motivate = motiver']),
        q('What is the biggest professional failure you have experienced, and how did you recover from it?', ['One setback I experienced was…', 'It made me realise that…'], ['setback = revers', 'to learn from = tirer des leçons de', 'accountability = responsabilité', 'to bounce back = rebondir']),
        q('How do you stay up to date with developments in your field?', ['I regularly…', 'To keep my skills current, I…'], ['to keep up with = se tenir au courant', 'training course = formation', 'trend = tendance', 'networking = réseautage']),
        q('What salary would you expect, and how would you justify it?', ['Based on my experience, I would expect…', 'I believe that my skills…'], ['to negotiate = négocier', 'package = package de rémunération', 'to justify = justifier', 'market rate = tarif du marché']),
        q('Why should we hire you rather than another equally qualified candidate?', ['What sets me apart is…', 'I would bring…'], ['to stand out = se démarquer', 'added value = valeur ajoutée', 'candidate = candidat', 'commitment = engagement']),
      ],
    },
  },

  /* ------------------------------ SOCIETY ------------------------------- */
  {
    id: 'society',
    title: 'Culture & société',
    icon: '🌍',
    description: 'Échangez sur l’environnement, l’actualité, le cinéma et les grands sujets de société.',
    scenario:
      'Emma is having a relaxed, thoughtful discussion with the learner about society, the environment, current events, cinema and culture. She asks for opinions politely, plays devil’s advocate when appropriate and respects all points of view.',
    questions: {
      A: [
        q('Do you watch the news?', ['Yes, I watch the news…', 'No, I don’t watch it.'], ['news = actualités', 'television = télévision', 'newspaper = journal']),
        q('What is your favourite film?', ['My favourite film is…', 'It is a… film.'], ['film = film', 'actor = acteur', 'story = histoire', 'funny = drôle']),
        q('Do you go to the cinema?', ['Yes, I go…', 'I prefer to watch films at home.'], ['cinema = cinéma', 'ticket = billet', 'popcorn = pop-corn']),
        q('Do you like animals?', ['Yes, I love…', 'I have a…'], ['animal = animal', 'dog = chien', 'cat = chat', 'pet = animal de compagnie']),
        q('Is your town clean?', ['Yes, it is clean.', 'No, there is a lot of…'], ['clean = propre', 'dirty = sale', 'street = rue', 'rubbish = déchets']),
        q('Do you recycle at home?', ['Yes, I recycle…', 'I put… in the bin.'], ['to recycle = recycler', 'plastic = plastique', 'glass = verre', 'paper = papier']),
        q('How is the weather in your country?', ['It is… in summer.', 'In winter, it is…'], ['weather = météo', 'hot = chaud', 'cold = froid', 'rain = pluie']),
        q('What is a famous place in your country?', ['A famous place is…', 'Many tourists visit…'], ['famous = célèbre', 'monument = monument', 'museum = musée', 'tourist = touriste']),
      ],
      B: [
        q('Do you follow the news regularly? Where do you get your information?', ['I usually read…', 'I get my news from…'], ['headline = gros titre', 'source = source', 'to follow = suivre', 'reliable = fiable']),
        q('What kind of films or series have you enjoyed recently, and why?', ['I recently watched…', 'What I liked about it was…'], ['plot = intrigue', 'character = personnage', 'series = série', 'to recommend = recommander']),
        q('What do you do in your daily life to protect the environment?', ['I try to…', 'I always…'], ['to save energy = économiser l’énergie', 'to reduce waste = réduire ses déchets', 'public transport = transports en commun', 'reusable = réutilisable']),
        q('What do you think are the biggest problems facing the world today?', ['I think the biggest problem is…', 'We should do more about…'], ['climate change = changement climatique', 'poverty = pauvreté', 'war = guerre', 'pollution = pollution']),
        q('Would you say that people in your country are generally open to foreigners?', ['I think people are…', 'In my experience…'], ['foreigner = étranger', 'welcoming = accueillant', 'prejudice = préjugé', 'to integrate = s’intégrer']),
        q('Is it important to vote? Why or why not?', ['I believe it is important to vote because…', 'Some people don’t vote because…'], ['to vote = voter', 'election = élection', 'politician = homme politique', 'democracy = démocratie']),
        q('What would you do if you were the mayor of your town for a day?', ['If I were the mayor, I would…', 'First, I would build…'], ['mayor = maire', 'to improve = améliorer', 'public services = services publics', 'park = parc']),
        q('Which book or film do you think everyone should see or read? Why?', ['I think everyone should…', 'It teaches you…'], ['message = message', 'moving = émouvant', 'thought-provoking = qui donne à réfléchir', 'masterpiece = chef-d’œuvre']),
      ],
      C: [
        q('How much trust do you place in the media, and how can we tell reliable sources from fake news?', ['I tend to trust…', 'It is vital to check…'], ['fake news = infox', 'bias = parti pris', 'fact-checking = vérification des faits', 'journalism = journalisme']),
        q('Is individual action enough to tackle climate change, or is systemic change needed?', ['Individual actions matter, but…', 'Only governments and industries can…'], ['carbon emissions = émissions de carbone', 'renewable energy = énergie renouvelable', 'systemic = systémique', 'to tackle = s’attaquer à']),
        q('To what extent can cinema and literature influence public opinion?', ['Films and books can shape…', 'History shows that…'], ['propaganda = propagande', 'to raise awareness = sensibiliser', 'public opinion = opinion publique', 'storytelling = narration']),
        q('Should freedom of speech have limits? If so, where should the line be drawn?', ['I believe that freedom of speech should…', 'The line should be drawn at…'], ['hate speech = discours de haine', 'censorship = censure', 'to offend = offenser', 'harm = préjudice']),
        q('What are the advantages and drawbacks of multicultural societies?', ['A multicultural society can…', 'Challenges may arise when…'], ['multicultural = multiculturel', 'integration = intégration', 'diversity = diversité', 'social cohesion = cohésion sociale']),
        q('Is democracy in good health today, or are we witnessing a decline in political engagement?', ['There are signs that…', 'Many citizens feel that…'], ['turnout = taux de participation', 'populism = populisme', 'disillusioned = désabusé', 'accountability = redevabilité']),
        q('How should a society balance economic growth with the protection of the environment?', ['A balance could be achieved by…', 'Growth should not come at the expense of…'], ['sustainable development = développement durable', 'degrowth = décroissance', 'at the expense of = aux dépens de', 'policy = politique']),
        q('What do you think will be the most significant social change of the next fifty years?', ['I suspect the biggest change will be…', 'It is hard to predict, but…'], ['to predict = prévoir', 'demographic = démographique', 'migration = migration', 'unprecedented = sans précédent']),
      ],
    },
  },
];
