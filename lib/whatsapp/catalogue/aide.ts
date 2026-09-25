import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Aide pour un client bloqué au moment de payer sa commande. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'payment_help',
    category: 'aide',
    label: 'Proposer de l’aide pour payer',
    hint: 'Le client semble bloqué au moment de payer.',
    color: 'neutral',
    recommendedFor: ['pending_payment'],
    availableFor: ['pending_payment', 'expired', 'failed', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJ'ai vu que votre commande {reference} n'est pas encore payée. Est-ce que vous rencontrez un souci avec {methode} ?\n\nDites-moi ce qui se passe et je vous guide étape par étape.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen wè kòmand ou {reference} poko peye. Èske w gen yon pwoblèm ak {methode} ?\n\nDi m sa k ap pase, m ap gide w etap pa etap.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien 😊\n\nJe vois que votre commande {reference} n'est pas encore payée. Est-ce que le paiement avec {methode} vous pose un souci ? Pas d'inquiétude, on va regarder ça ensemble.\n\nÉcrivez-moi ce qui bloque, même en quelques mots : je suis là pour vous aider.`,
        ht: `Alo {prenom}, se {moi}. M espere w ap byen 😊\n\nMwen wè kòmand ou {reference} poko peye. Èske peman an ak {methode} ap ba w tèt chaje ? Pa enkyete w, n ap gade sa ansanm.\n\nEkri m sa k bloke a, menm si se de twa mo : m la pou m ede w.`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nVotre commande {reference} n'est pas encore payée, et vos dollars font les cent pas en attendant ! 😄 Est-ce que {methode} vous joue des tours ?\n\nCode qui n'arrive pas, application qui boude, réseau qui joue à cache-cache : dites-moi ce qui coince et je vous guide, pa gen pwoblèm 🙌`,
        ht: `Sak pase {prenom}, se {moi} 👋\n\nKòmand ou {reference} poko peye, e dola yo ap mache monte desann, y ap tann ou ! 😄 Èske {methode} ap fè w pase traka ?\n\nKòd ki pa rive, aplikasyon k ap fè tèt di, rezo a k ap jwe lago kache : di m sa k bloke a epi m ap gide w, pa gen pwoblèm 🙌`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} n'est pas encore payée. Un souci avec {methode} ? Dites-moi, je vous guide.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} poko peye. Ou gen pwoblèm ak {methode} ? Di m, m ap ede w.`,
      },
    },
  },
  {
    id: 'how_to_pay_moncash',
    category: 'aide',
    label: 'Expliquer comment payer avec MonCash',
    hint: 'Les étapes du paiement MonCash, pas à pas.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment'],
    methods: ['moncash'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVoici comment payer votre commande {reference} avec MonCash :\n1. Vérifiez d'abord que votre solde MonCash couvre le total de {montant_htg}.\n2. Ouvrez ce lien et appuyez sur le bouton pour payer : {lien_suivi} (si le bouton n'apparaît pas, écrivez-moi)\n3. Sur la page MonCash, entrez votre numéro MonCash et confirmez le paiement avec votre code PIN ou le code reçu par SMS, selon votre téléphone.\n4. Une fois le paiement fait, vous revenez automatiquement sur la page de votre commande.\n\nSi une étape vous bloque, écrivez-moi et je vous aide.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMen kijan pou w peye kòmand ou {reference} ak MonCash :\n1. Tcheke dabò si w gen ase kòb sou MonCash ou pou peye {montant_htg}.\n2. Louvri lyen sa a epi peze bouton pou peye a : {lien_suivi} (si w pa wè bouton an, ekri m)\n3. Sou paj MonCash la, mete nimewo MonCash ou epi konfime peman an ak kòd PIN ou oswa kòd ou resevwa pa SMS la, sa depann de telefòn nan.\n4. Lè w fin peye, w ap retounen otomatikman sou paj kòmand ou a.\n\nSi w bloke nan yon etap, ekri m, m ap ede w.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je vous accompagne pas à pas pour le paiement 😊\n\nAvec MonCash, votre commande {reference} se paie en quatre petites étapes :\n1. Vérifiez d'abord que votre solde MonCash couvre bien {montant_htg}.\n2. Ouvrez ce lien et appuyez sur le bouton pour payer : {lien_suivi} (si le bouton n'apparaît pas, écrivez-moi)\n3. Sur la page MonCash, entrez votre numéro MonCash, puis confirmez avec votre code PIN ou le code reçu par SMS, selon votre téléphone.\n4. Une fois le paiement fait, vous revenez automatiquement sur la page de votre commande.\n\nSi quelque chose ne marche pas, je suis là : envoyez-moi un message ou une capture d'écran et on regarde ensemble.`,
        ht: `Alo {prenom}, se {moi}. M ap akonpaye w etap pa etap pou peman an 😊\n\nOu ka peye kòmand ou {reference} a ak MonCash an kat ti etap :\n1. Tcheke dabò si w gen ase kòb sou MonCash ou pou {montant_htg}.\n2. Louvri lyen sa a epi peze bouton pou peye a : {lien_suivi} (si w pa wè bouton an, ekri m)\n3. Sou paj MonCash la, mete nimewo MonCash ou, epi konfime ak kòd PIN ou oswa kòd ki vin pa SMS la, sa depann de telefòn ou.\n4. Lè w fin peye, w ap retounen otomatikman sou paj kòmand ou a.\n\nSi yon bagay pa mache, m la : voye yon mesaj oswa yon foto ekran ban mwen epi n ap gade sa ansanm.`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nPetit mode d'emploi MonCash pour votre commande {reference}. Promis, c'est plus facile que de trouver un tap-tap vide à 7 h du matin ! 😄\n1️⃣ Vérifiez d'abord que votre solde MonCash couvre bien {montant_htg}.\n2️⃣ Ouvrez ce lien et appuyez sur le bouton pour payer : {lien_suivi} (si le bouton n'apparaît pas, écrivez-moi)\n3️⃣ Sur la page MonCash, entrez votre numéro MonCash et confirmez avec votre code PIN ou le code reçu par SMS (ça dépend du téléphone).\n4️⃣ Paiement fait ? Vous revenez automatiquement sur la page de votre commande. Et là, c'est à moi de jouer ! 💪\n\nSi une étape vous résiste, écrivez-moi, on la fait ensemble !`,
        ht: `Sak pase {prenom}, se {moi} 👋\n\nMen ti gid MonCash la pou kòmand ou {reference}. M pwomèt ou li pi fasil pase jwenn yon tap-tap vid a 7è dimaten ! 😄\n1️⃣ Tcheke dabò si w gen ase kòb sou MonCash ou pou {montant_htg}.\n2️⃣ Louvri lyen sa a epi peze bouton pou peye a : {lien_suivi} (si w pa wè bouton an, ekri m)\n3️⃣ Sou paj MonCash la, mete nimewo MonCash ou epi konfime ak kòd PIN ou oswa kòd ki vin pa SMS la (sa depann de telefòn nan).\n4️⃣ Ou fin peye ? W ap retounen otomatikman sou paj kòmand ou a. Epi la, se tou pa m pou m jwe ! 💪\n\nSi yon etap ap fè tèt di, ekri m, n ap fè l ansanm !`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour payer votre commande {reference} avec MonCash : ouvrez {lien_suivi} et appuyez sur le bouton pour payer, puis entrez votre numéro MonCash et confirmez avec votre code. Votre solde doit couvrir {montant_htg}. Pas de bouton ? Écrivez-moi.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou w peye kòmand ou {reference} ak MonCash : louvri {lien_suivi} epi peze bouton pou peye a, apre sa mete nimewo MonCash ou epi konfime ak kòd ou. Fòk ou gen omwen {montant_htg} sou MonCash ou. Ou pa wè bouton an ? Ekri m.`,
      },
    },
  },
  {
    id: 'how_to_pay_natcash',
    category: 'aide',
    label: 'Expliquer comment payer avec NatCash',
    hint: 'Les étapes du paiement NatCash, pas à pas.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment'],
    methods: ['natcash'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVoici comment payer votre commande {reference} avec NatCash :\n1. Vérifiez d'abord que votre solde NatCash couvre le total de {montant_htg}.\n2. Ouvrez ce lien et appuyez sur le bouton pour payer : {lien_suivi} (si le bouton n'apparaît pas, écrivez-moi)\n3. Sur la page NatCash, entrez votre numéro NatCash et confirmez le paiement avec votre code PIN ou le code reçu par SMS, selon votre téléphone.\n4. Une fois le paiement fait, vous revenez automatiquement sur la page de votre commande.\n\nSi une étape vous bloque, écrivez-moi et je vous aide.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMen kijan pou w peye kòmand ou {reference} ak NatCash :\n1. Tcheke dabò si w gen ase kòb sou NatCash ou pou peye {montant_htg}.\n2. Louvri lyen sa a epi peze bouton pou peye a : {lien_suivi} (si w pa wè bouton an, ekri m)\n3. Sou paj NatCash la, mete nimewo NatCash ou epi konfime peman an ak kòd PIN ou oswa kòd ou resevwa pa SMS la, sa depann de telefòn nan.\n4. Lè w fin peye, w ap retounen otomatikman sou paj kòmand ou a.\n\nSi w bloke nan yon etap, ekri m, m ap ede w.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je vous accompagne pas à pas pour le paiement 😊\n\nAvec NatCash, votre commande {reference} se paie en quatre petites étapes :\n1. Vérifiez d'abord que votre solde NatCash couvre bien {montant_htg}.\n2. Ouvrez ce lien et appuyez sur le bouton pour payer : {lien_suivi} (si le bouton n'apparaît pas, écrivez-moi)\n3. Sur la page NatCash, entrez votre numéro NatCash, puis confirmez avec votre code PIN ou le code reçu par SMS, selon votre téléphone.\n4. Une fois le paiement fait, vous revenez automatiquement sur la page de votre commande.\n\nSi quelque chose ne marche pas, je suis là : envoyez-moi un message ou une capture d'écran et on regarde ensemble.`,
        ht: `Alo {prenom}, se {moi}. M ap akonpaye w etap pa etap pou peman an 😊\n\nOu ka peye kòmand ou {reference} a ak NatCash an kat ti etap :\n1. Tcheke dabò si w gen ase kòb sou NatCash ou pou {montant_htg}.\n2. Louvri lyen sa a epi peze bouton pou peye a : {lien_suivi} (si w pa wè bouton an, ekri m)\n3. Sou paj NatCash la, mete nimewo NatCash ou, epi konfime ak kòd PIN ou oswa kòd ki vin pa SMS la, sa depann de telefòn ou.\n4. Lè w fin peye, w ap retounen otomatikman sou paj kòmand ou a.\n\nSi yon bagay pa mache, m la : voye yon mesaj oswa yon foto ekran ban mwen epi n ap gade sa ansanm.`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nPetit mode d'emploi NatCash pour votre commande {reference}. Promis, ça va plus vite que la file d'attente à la banque un vendredi après-midi ! 😄\n1️⃣ Vérifiez d'abord que votre solde NatCash couvre bien {montant_htg}.\n2️⃣ Ouvrez ce lien et appuyez sur le bouton pour payer : {lien_suivi} (si le bouton n'apparaît pas, écrivez-moi)\n3️⃣ Sur la page NatCash, entrez votre numéro NatCash et confirmez avec votre code PIN ou le code reçu par SMS (ça dépend du téléphone).\n4️⃣ Paiement fait ? Vous revenez automatiquement sur la page de votre commande. Et là, c'est à moi de jouer ! 💪\n\nSi une étape vous résiste, écrivez-moi, on la fait ensemble !`,
        ht: `Sak pase {prenom}, se {moi} 👋\n\nMen ti gid NatCash la pou kòmand ou {reference}. M pwomèt ou li pi vit pase liy labank yon vandredi apremidi ! 😄\n1️⃣ Tcheke dabò si w gen ase kòb sou NatCash ou pou {montant_htg}.\n2️⃣ Louvri lyen sa a epi peze bouton pou peye a : {lien_suivi} (si w pa wè bouton an, ekri m)\n3️⃣ Sou paj NatCash la, mete nimewo NatCash ou epi konfime ak kòd PIN ou oswa kòd ki vin pa SMS la (sa depann de telefòn nan).\n4️⃣ Ou fin peye ? W ap retounen otomatikman sou paj kòmand ou a. Epi la, se tou pa m pou m jwe ! 💪\n\nSi yon etap ap fè tèt di, ekri m, n ap fè l ansanm !`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour payer votre commande {reference} avec NatCash : ouvrez {lien_suivi} et appuyez sur le bouton pour payer, puis entrez votre numéro NatCash et confirmez avec votre code. Votre solde doit couvrir {montant_htg}. Pas de bouton ? Écrivez-moi.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou w peye kòmand ou {reference} ak NatCash : louvri {lien_suivi} epi peze bouton pou peye a, apre sa mete nimewo NatCash ou epi konfime ak kòd ou. Fòk ou gen omwen {montant_htg} sou NatCash ou. Ou pa wè bouton an ? Ekri m.`,
      },
    },
  },
  {
    id: 'balance_low',
    category: 'aide',
    label: 'Solde insuffisant',
    hint: 'Le portefeuille n’a pas assez pour payer le total.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'failed'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour votre commande {reference}, si votre solde {methode} ne suffit pas pour le total de {montant_htg}, vous avez deux possibilités :\n1. Rechargez votre portefeuille {methode}, chez un agent ou par un transfert, puis payez. Si le lien de paiement n'est plus valable, refaites simplement la commande sur {lien_accueil}\n2. Faites une commande plus petite, à partir de {montant_min}, sur {lien_accueil}\n\nDites-moi ce qui vous convient le mieux, je reste disponible.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou kòmand ou {reference} a, si kòb ki sou {methode} ou a pa ase pou peye {montant_htg}, ou gen de chwa :\n1. Mete kòb sou {methode} ou, kay yon ajan oswa pa transfè, epi peye. Si lyen peman an pa bon ankò, tou senpleman refè kòmand lan sou {lien_accueil}\n2. Fè yon kòmand ki pi piti, apati {montant_min}, sou {lien_accueil}\n\nDi m sa ki pi bon pou ou, m la si w bezwen m.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je vous écris pour vous donner un coup de main 😊\n\nPour votre commande {reference}, si votre solde {methode} ne suffit pas encore pour les {montant_htg}, il y a deux solutions simples. Vous pouvez recharger votre portefeuille {methode} chez un agent ou par un transfert, puis payer. Si le lien de paiement n'est plus valable, refaites simplement la commande sur {lien_accueil}\n\nVous pouvez aussi, si vous préférez, faire une commande plus petite, dès {montant_min}, ici : {lien_accueil}\n\nDites-moi ce qui vous arrange, je suis là pour vous 🤝`,
        ht: `Alo {prenom}, se {moi}. M ap ekri w pou m ba w yon ti kout men 😊\n\nPou kòmand ou {reference} a, si kòb ki sou {methode} ou a poko ase pou {montant_htg}, gen de solisyon senp. Ou ka mete kòb sou {methode} ou kay yon ajan oswa pa transfè, epi peye. Si lyen peman an pa bon ankò, tou senpleman refè kòmand lan sou {lien_accueil}\n\nOswa, si w pito, fè yon kòmand ki pi piti, apati {montant_min}, la a : {lien_accueil}\n\nDi m sa k pi bon pou ou, m la pou ou 🤝`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 😊\n\nSi votre {methode} n'a pas encore tout à fait les {montant_htg} de la commande {reference}, pa gen pwoblèm : il y a deux routes, et je vous sers de GPS 🧭\n1️⃣ Rechargez votre {methode} chez un agent ou par un transfert, puis payez. Si le lien de paiement n'est plus valable, refaites simplement la commande sur {lien_accueil}\n2️⃣ Ou faites une commande plus petite, dès {montant_min} : {lien_accueil}\n\nAlors, on prend quelle route ? 🙌`,
        ht: `Alo {prenom}, se {moi} 😊\n\nSi {methode} ou a poko gen tout {montant_htg} pou kòmand {reference} a, pa gen pwoblèm : gen de wout, epi m ap sèvi w GPS 🧭\n1️⃣ Mete kòb sou {methode} ou kay yon ajan oswa pa transfè, epi peye. Si lyen peman an pa bon ankò, tou senpleman refè kòmand lan sou {lien_accueil}\n2️⃣ Oswa fè yon kòmand ki pi piti, apati {montant_min} : {lien_accueil}\n\nAlò, ki wout n ap pran ? 🙌`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour votre commande {reference}, si votre solde {methode} ne couvre pas {montant_htg}, rechargez-le chez un agent ou par un transfert, puis payez (ou refaites la commande si le lien a expiré). Vous pouvez aussi commander un montant plus petit, dès {montant_min} : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou kòmand {reference} a, si kòb ki sou {methode} ou a pa ase pou {montant_htg}, mete kòb sou li kay yon ajan oswa pa transfè, epi peye (oswa refè kòmand lan si lyen an ekspire). Ou ka fè yon kòmand ki pi piti tou, apati {montant_min} : {lien_accueil}`,
      },
    },
  },
  {
    id: 'network_issue',
    category: 'aide',
    label: 'Connexion coupée pendant le paiement',
    hint: 'Le réseau ou l’application a coupé en plein paiement.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'failed'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nSi la connexion a coupé pendant le paiement de votre commande {reference}, vérifiez d'abord si vous avez reçu un SMS de confirmation {methode}.\n\nSi oui, envoyez-moi une capture de ce message et je vérifie de mon côté. Sinon, normalement rien n'a été prélevé, et vous pouvez réessayer depuis la page de votre commande : {lien_suivi}\nSi la page ne vous propose plus de payer, refaites simplement une commande sur {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSi koneksyon an te koupe pandan w t ap peye kòmand ou {reference}, gade dabò si w te resevwa yon SMS konfimasyon {methode}.\n\nSi w resevwa l, voye yon foto mesaj la ban mwen, m ap verifye sa. Si w pa resevwa anyen, nòmalman pa gen kòb ki soti sou kont ou, epi ou ka eseye ankò sou paj kòmand ou a : {lien_suivi}\nSi paj la pa kite w peye ankò, tou senpleman fè yon nouvo kòmand sou {lien_accueil}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Une connexion qui coupe en plein paiement, ce n'est jamais agréable 🙏\n\nNe vous inquiétez pas, on va vérifier ça ensemble pour votre commande {reference}. Regardez d'abord si vous avez reçu un SMS de confirmation {methode}.\n\nSi oui, envoyez-moi une capture du message et je m'en occupe. Sinon, normalement rien n'a été prélevé, et vous pouvez reprendre tranquillement depuis la page de votre commande : {lien_suivi}\nSi la page ne vous propose plus de payer, refaites simplement une commande sur {lien_accueil}`,
        ht: `Alo {prenom}, se {moi}. M dezole si koneksyon an lage w an plen peman 🙏\n\nPa enkyete w, n ap verifye sa ansanm pou kòmand {reference} a. Gade dabò si w te resevwa yon SMS konfimasyon {methode}.\n\nSi w resevwa l, voye yon foto mesaj la ban mwen, m ap okipe sa. Si w pa resevwa anyen, nòmalman pa gen kòb ki soti sou kont ou, epi ou ka rekòmanse san estrès sou paj kòmand ou a : {lien_suivi}\nSi paj la pa kite w peye ankò, tou senpleman fè yon nouvo kòmand sou {lien_accueil}`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nSi la connexion a coupé pendant le paiement de votre commande {reference}, première chose : regardez si vous avez reçu un SMS de confirmation {methode}.\n\nSi oui, envoyez-moi une capture du message et je vérifie tout de suite. Sinon, normalement rien n'a été prélevé, et vous pouvez reprendre depuis la page de votre commande : {lien_suivi}\nSi la page ne vous propose plus de payer, refaites simplement une commande sur {lien_accueil}\n\nEn espérant que le réseau a fini sa petite sieste 😄`,
        ht: `Alo {prenom}, se {moi} 👋\n\nSi koneksyon an te koupe pandan w t ap peye kòmand {reference} a, premye bagay : gade si w te resevwa yon SMS konfimasyon {methode}.\n\nSi w resevwa l, voye yon foto mesaj la ban mwen, m ap verifye l touswit. Si w pa resevwa anyen, nòmalman pa gen kòb ki soti sou kont ou, epi ou ka rekòmanse sou paj kòmand ou a : {lien_suivi}\nSi paj la pa kite w peye ankò, tou senpleman fè yon nouvo kòmand sou {lien_accueil}\n\nAnnou espere rezo a fin fè ti kabicha li 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nSi le paiement de votre commande {reference} a été interrompu et que vous avez reçu un SMS {methode}, envoyez-m'en une capture. Sinon, rien n'a normalement été prélevé : reprenez sur {lien_suivi} ou, si la page ne propose plus de payer, refaites une commande sur {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSi peman kòmand {reference} a te koupe epi w te resevwa yon SMS {methode}, voye yon foto l ban mwen. Si w pa t resevwa anyen, nòmalman pa gen kòb ki soti : rekòmanse sou {lien_suivi} oswa, si paj la pa kite w peye ankò, fè yon nouvo kòmand sou {lien_accueil}`,
      },
    },
  },
  {
    id: 'find_meru_id',
    category: 'aide',
    label: 'Aider à trouver son identifiant Meru',
    hint: 'Le client ne sait pas quel email ou nom d’utilisateur donner.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled', 'paid', 'needs_review'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour que vos dollars arrivent sur le bon compte, j'ai besoin de votre identifiant Meru, c'est-à-dire l'email ou le nom d'utilisateur de votre compte. Vous le trouverez dans l'application Meru, dans votre profil ou dans les paramètres.\n\nSur la commande {reference}, j'ai noté ce compte :\n{compte_meru}\n\nPouvez-vous me confirmer qu'il est exact, ou m'envoyer le bon identifiant ?`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou dola yo ka tonbe sou bon kont lan, mwen bezwen idantifyan Meru ou, sa vle di imèl oswa non itilizatè (username) kont ou. Ou ka jwenn li nan aplikasyon Meru a, nan pwofil ou oswa nan paramèt yo.\n\nSou kòmand {reference} a, mwen gen kont sa a :\n{compte_meru}\n\nÈske w ka di m si se li menm, oswa voye bon idantifyan an ban mwen ?`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Merci de votre confiance 😊\n\nPetite vérification : je veux m'assurer que vos dollars arrivent sur le bon compte Meru. Votre identifiant, c'est l'email ou le nom d'utilisateur de votre compte. Vous le trouvez dans l'application Meru, dans votre profil ou dans les paramètres.\n\nSur la commande {reference}, j'ai noté « {compte_meru} ». Est-ce bien le bon ? Sinon, envoyez-moi le bon identifiant et je m'en occupe 🙏`,
        ht: `Alo {prenom}, se {moi}. Mèsi dèske w fè nou konfyans 😊\n\nYon ti verifikasyon : mwen vle asire m dola yo ap tonbe sou bon kont Meru a. Idantifyan w lan, se imèl oswa non itilizatè (username) kont ou. Ou ka jwenn li nan aplikasyon Meru a, nan pwofil ou oswa nan paramèt yo.\n\nSou kòmand {reference} a, mwen gen « {compte_meru} ». Èske se li menm ? Si se pa li, voye bon an ban mwen, m ap okipe l 🙏`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nPetite vérification de votre compte Meru : sur la commande {reference}, j'ai noté « {compte_meru} ». C'est bien le vôtre ?\n\nSi ce n'est pas le bon, envoyez-moi votre identifiant Meru, c'est-à-dire l'email ou le nom d'utilisateur de votre compte (dans l'application Meru, dans votre profil ou dans les paramètres). Le but : que vos dollars atterrissent pile au bon endroit 🛬`,
        ht: `Alo {prenom}, se {moi} 👋\n\nYon ti verifikasyon sou kont Meru ou : sou kòmand {reference} a, mwen gen « {compte_meru} ». Se kont ou sa ?\n\nSi se pa li, voye idantifyan Meru ou ban mwen, sa vle di imèl oswa non itilizatè (username) kont ou (w ap jwenn li nan aplikasyon Meru a, nan pwofil ou oswa nan paramèt yo). Lide a, se pou dola ou yo ateri kote pou yo ateri a 🛬`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nSur la commande {reference}, j'ai le compte Meru « {compte_meru} ». Est-ce le bon ? Sinon, envoyez-moi le bon email ou nom d'utilisateur (visible dans votre profil Meru).`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSou kòmand {reference} a, mwen gen kont Meru « {compte_meru} ». Èske se li ? Si se pa li, voye bon imèl oswa non itilizatè a ban mwen (w ap jwenn li nan pwofil ou sou Meru).`,
      },
    },
  },
  {
    id: 'wallet_limit_split',
    category: 'aide',
    label: 'Montant trop élevé pour un seul paiement',
    hint: 'Le total dépasse ce qu’un paiement MonCash ou NatCash accepte.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'failed', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nAu sujet de votre commande {reference} : un seul paiement {methode} ne peut pas dépasser {plafond}. Pour recharger un montant plus élevé, vous pouvez faire deux commandes ou plus, chacune sous ce plafond, sur {lien_accueil}\n\nJe reste disponible si vous avez besoin d'aide.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKonsènan kòmand ou {reference} a : yon sèl peman {methode} pa ka depase {plafond}. Si w vle rechaje plis pase sa, ou ka fè de kòmand oswa plis, chak youn anba limit sa a, sou {lien_accueil}\n\nM la si w bezwen èd.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Merci beaucoup pour votre commande {reference} 😊\n\nPetite précision : un seul paiement {methode} ne peut pas dépasser {plafond}. Si vous souhaitez recharger davantage, pas de souci : faites simplement deux commandes ou plus, chacune sous {plafond}, ici : {lien_accueil}\n\nJe vous accompagne volontiers 🤝`,
        ht: `Alo {prenom}, se {moi}. Mèsi anpil pou kòmand ou {reference} a 😊\n\nYon ti presizyon : yon sèl peman {methode} pa ka depase {plafond}. Si w vle rechaje plis pase sa, pa gen pwoblèm : tou senpleman fè de kòmand oswa plis, chak youn anba {plafond}, la a : {lien_accueil}\n\nM la pou m ede w ak plezi 🤝`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nPetite info pour votre commande {reference} : un seul paiement {methode} ne peut pas dépasser {plafond}. Au-delà, {methode} n'arrive pas à tout porter d'un seul coup ! 😄\n\nL'astuce si vous voulez recharger plus : faites deux commandes ou plus, chacune sous {plafond}, sur {lien_accueil}\n\nMieux vaut deux petits trajets qu'un gros camion trop chargé 🚚`,
        ht: `Sak pase {prenom}, se {moi} 👋\n\nTi enfòmasyon pou kòmand ou {reference} a : yon sèl peman {methode} pa ka depase {plafond}. Pi wo pase sa, {methode} pa ka pote tout yon sèl kou ! 😄\n\nMen ti teknik la si w vle rechaje plis : fè de kòmand oswa plis, chak youn anba {plafond}, sou {lien_accueil}\n\nPito de ti vwayaj pase yon sèl kamyon ki twò chaje 🚚`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour votre commande {reference} : un seul paiement {methode} ne peut pas dépasser {plafond}. Pour recharger plus, faites deux commandes ou plus sur {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou kòmand ou {reference} a : yon sèl peman {methode} pa ka depase {plafond}. Pou rechaje plis, fè de kòmand oswa plis sou {lien_accueil}`,
      },
    },
  },
  {
    id: 'switch_method',
    category: 'aide',
    label: 'Essayer l’autre portefeuille',
    hint: 'Le paiement ne passe pas : proposer MonCash à la place de NatCash, ou l’inverse.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'failed'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nSi le paiement avec {methode} ne passe pas aujourd'hui pour votre commande {reference}, il y a une autre solution : nous acceptons MonCash et NatCash. Si vous avez aussi l'autre portefeuille, refaites la commande et choisissez-le au moment de payer : {lien_accueil}\n\nJe reste disponible si vous avez besoin d'aide.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSi peman an ak {methode} pa pase jodi a pou kòmand ou {reference} a, gen yon lòt solisyon : nou pran MonCash ak NatCash. Si w genyen lòt la tou, refè kòmand lan epi chwazi l lè w ap peye : {lien_accueil}\n\nM la si w bezwen èd.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je sais que c'est agaçant quand un paiement ne passe pas 🙏\n\nPour votre commande {reference}, si {methode} bloque aujourd'hui, il y a une autre solution : nous acceptons MonCash et NatCash. Si vous avez aussi l'autre portefeuille, refaites simplement la commande et choisissez-le au moment de payer : {lien_accueil}\n\nEt si vous préférez que je vous guide, écrivez-moi, je suis là 😊`,
        ht: `Alo {prenom}, se {moi}. M konnen sa fatigan lè yon peman pa vle pase 🙏\n\nPou kòmand ou {reference} a, si {methode} bloke jodi a, gen yon lòt solisyon : nou pran MonCash ak NatCash. Si w genyen lòt la tou, tou senpleman refè kòmand lan epi chwazi l lè w ap peye : {lien_accueil}\n\nSi w pito m gide w, ekri m, m la 😊`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} 👋\n\nPour votre commande {reference}, on dirait que {methode} n'est pas dans son assiette aujourd'hui ! 😅 Pas grave : nous acceptons MonCash et NatCash. Si vous avez aussi l'autre, refaites votre commande et choisissez-le au moment de payer.\n\nC'est par ici : {lien_accueil}\n\nEt si les deux font des caprices, écrivez-moi, on regarde ça ensemble 😄`,
        ht: `Sak pase {prenom}, se {moi} 👋\n\nPou kòmand ou {reference} a, gen lè {methode} pa sou moun li jodi a ! 😅 Pa gen pwoblèm : nou pran MonCash ak NatCash. Si w genyen lòt la tou, refè kòmand lan epi chwazi l lè w ap peye.\n\nMen lyen an : {lien_accueil}\n\nE si tou de ap fè kapris, ekri m, n ap gade sa ansanm 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nSi {methode} ne passe pas aujourd'hui pour votre commande {reference}, refaites la commande et payez avec l'autre portefeuille, si vous l'avez (nous acceptons MonCash et NatCash) : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSi {methode} pa pase jodi a pou kòmand ou {reference} a, refè kòmand lan epi peye ak lòt la, si w genyen l (nou pran MonCash ak NatCash) : {lien_accueil}`,
      },
    },
  },
];
