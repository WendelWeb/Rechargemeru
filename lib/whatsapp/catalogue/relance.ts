import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Relances pour les commandes créées mais pas encore payées. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'payment_reminder',
    category: 'relance',
    label: 'Rappel de paiement',
    hint: 'La commande attend toujours son paiement.',
    color: 'primary',
    recommendedFor: ['pending_payment'],
    // Not for an expired order: this text says the order is still waiting.
    availableFor: ['pending_payment'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} attend encore son paiement de {montant_htg} par {methode}. Dès que le paiement arrive, j'envoie {montant_usd} sur votre compte Meru.\n\nPour payer ou suivre la commande : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} la toujou ap tann peman {montant_htg} ak {methode}. Kou peman an rive, m ap voye {montant_usd} sou kont Meru ou.\n\nPou w peye oswa swiv kòmand lan : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien. 😊\n\nVotre commande {reference} n'attend plus que votre paiement de {montant_htg} par {methode}. Dès que c'est fait, je m'occupe de mettre {montant_usd} sur votre compte Meru.\n\nSi quelque chose vous bloque, écrivez-moi, je suis là pour vous. Pour payer, c'est ici : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}. M espere w byen. 😊\n\nKòmand ou {reference} la jis ap tann ou peye {montant_htg} ak {methode}. Kou sa fèt, m ap mete {montant_usd} sou kont Meru ou.\n\nSi gen yon bagay ki bloke w, ekri m, m la pou ou. Men lyen pou w peye a : {lien_suivi}`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} ! 👋\n\nPetite nouvelle de vos {montant_usd} : ils ont fait leurs valises et tournent en rond devant votre compte Meru 🧳. Il ne leur manque que le paiement de {montant_htg} par {methode} pour la commande {reference}. Dès qu'il arrive, je leur ouvre la porte !\n\nPour payer, c'est par ici 😄 : {lien_suivi}`,
        ht: `Sak pase {prenom}, se {moi} ! 👋\n\n{montant_usd} ou yo gen tan fè valiz yo, y ap vire won devan pòt kont Meru ou 🧳. Yo jis bezwen peman {montant_htg} ak {methode} pou kòmand {reference} la. Kou peman an rive, m ap louvri pòt la ba yo !\n\nMen lyen pou w peye a 😄 : {lien_suivi}`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} attend son paiement de {montant_htg} par {methode} pour {montant_usd} sur Meru. Pour payer : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} la ap tann peman {montant_htg} ak {methode} pou {montant_usd} sou Meru. Pou w peye : {lien_suivi}`,
      },
    },
  },
  {
    id: 'expiring_soon',
    category: 'relance',
    label: 'Le lien de paiement expire bientôt',
    hint: 'Prévenir que le délai de paiement touche à sa fin.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPetit rappel : le paiement de votre commande {reference} ({montant_htg} par {methode}) reste possible jusqu'au {echeance}. Passé ce délai, la commande expirera simplement, sans rien vous coûter.\n\nPour payer : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nTi rapèl : ou ka peye kòmand ou {reference} la ({montant_htg} ak {methode}) jiska {echeance}. Apre lè sa a, kòmand lan ap jis ekspire poukont li, san sa pa koute w anyen.\n\nPou w peye : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je voulais vous prévenir gentiment, sans aucune pression. 😊\n\nVotre commande {reference} ({montant_htg} par {methode}) peut encore être payée jusqu'au {echeance}. Passé ce délai, elle expirera simplement, sans rien vous coûter.\n\nSi vous avez la moindre question, je suis là pour vous. Pour payer, c'est ici : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}. M jis vle fè w yon ti rapèl, pa gen presyon non. 😊\n\nOu ka toujou peye kòmand ou {reference} la ({montant_htg} ak {methode}) jiska {echeance}. Apre lè sa a, l ap jis ekspire poukont li, san sa pa koute w anyen.\n\nSi w gen nenpòt kesyon, m la pou ou. Men lyen pou w peye a : {lien_suivi}`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi}, en direct de la cuisine ! 🍛\n\nVotre commande {reference} est comme un bon plat de riz collé : elle vous attend encore bien chaude, mais pas éternellement 😄. Vous pouvez la payer ({montant_htg} par {methode}) jusqu'au {echeance}. Passé ce délai, elle expirera simplement, sans rien vous coûter.\n\nAucune pression, je passais juste vous faire signe. Pour payer, c'est ici : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}, m sot nan kizin nan ! 🍛\n\nKòmand ou {reference} la tankou yon bon plat diri kole : l ap tann ou tou cho, men se pa pou tout tan 😄. Ou ka peye l ({montant_htg} ak {methode}) jiska {echeance}. Apre sa, l ap jis ekspire poukont li, san sa pa koute w anyen.\n\nPa gen presyon non, m jis pase di w bonjou. Men lyen pou w peye a : {lien_suivi}`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} ({montant_htg} par {methode}) peut être payée jusqu'au {echeance}. Pour payer : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nOu ka peye kòmand ou {reference} la ({montant_htg} ak {methode}) jiska {echeance}. Pou w peye : {lien_suivi}`,
      },
    },
  },
  {
    id: 'last_call',
    category: 'relance',
    label: 'Dernier rappel',
    hint: 'Un dernier mot avant que la commande expire, sans insister.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nUn dernier mot au sujet de votre commande {reference} : elle reste payable jusqu'au {echeance}. Passé ce délai, elle expirera d'elle-même, et si vous changez d'avis plus tard, il vous suffira de faire une nouvelle commande.\n\nSi quelque chose vous a bloqué, dites-le-moi, je vous aide volontiers. Pour payer : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nYon dènye ti mo sou kòmand ou {reference} la : ou ka toujou peye l jiska {echeance}. Apre lè sa a, l ap ekspire poukont li, epi si w chanje lide pita, ou ka jis fè yon lòt kòmand.\n\nSi gen yon bagay ki te bloke w, di m, m ap kontan ede w. Pou w peye : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je ne veux surtout pas vous déranger, juste vous laisser un dernier petit mot.\n\nVotre commande {reference} peut encore être payée jusqu'au {echeance}. Si ce n'est pas le bon moment, aucun souci : vous pourrez refaire une commande quand vous voudrez.\n\nEt si quelque chose vous a compliqué la tâche, écrivez-moi, je vous aide avec plaisir. 🤝 Le lien pour payer : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}. M pa vle deranje w ditou, m jis vle di w yon dènye ti mo.\n\nOu gen jiska {echeance} pou peye kòmand ou {reference} la. Si se pa bon moman an, pa gen pwoblèm : ou ka fè yon lòt kòmand nenpòt lè w vle.\n\nEpi si w te jwenn yon difikilte, ekri m, m ap kontan ede w. 🤝 Men lyen pou w peye a : {lien_suivi}`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi}, pour un tout dernier petit rappel ! 👋\n\nPromis, je ne vais pas me transformer en réveil-matin 😄. Votre commande {reference} peut encore être payée jusqu'au {echeance}. Après, elle ira se coucher pour de bon, mais pas de souci : vous pourrez toujours en faire une nouvelle.\n\nSi quelque chose coince, écrivez-moi, je suis là 🤝. Pour payer, c'est ici : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi} ! 👋\n\nDènye ti rapèl, m pwomèt : m pa pral tounen revèy ou 😄. Ou gen jiska {echeance} pou peye kòmand ou {reference} la. Apre sa, l ap al dòmi pou tout bon, men pa gen pwoblèm : ou ka toujou fè yon lòt kòmand.\n\nSi gen yon bagay ki bloke w, ekri m, m la 🤝. Men lyen pou w peye a : {lien_suivi}`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} reste payable jusqu'au {echeance}, ensuite vous pourrez simplement en refaire une. Je peux vous aider si besoin. Pour payer : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nOu ka peye kòmand ou {reference} la jiska {echeance}, apre sa ou ka jis fè yon lòt kòmand. Si w bezwen èd, m la. Pou w peye : {lien_suivi}`,
      },
    },
  },
  {
    id: 'no_pressure',
    category: 'relance',
    label: 'Sans pression, quand vous voulez',
    hint: 'Montrer qu’on reste disponible, sans relancer lourdement.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe reviens vers vous au sujet de votre commande {reference}, sans vouloir vous presser. Prenez le temps qu'il vous faut : quand vous le souhaiterez, répondez simplement à ce message et nous nous en occuperons ensemble.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nM ap ekri w pou kòmand ou {reference} la, men m pa vle prese w. Pran tout tan ou bezwen : lè w pare, jis reponn mesaj sa a epi n ap regle sa ansanm.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Juste un petit mot amical en passant. 😊\n\nRien ne presse pour votre recharge (commande {reference}) : prenez le temps qu'il vous faut.\n\nQuand ce sera le bon moment pour vous, écrivez-moi simplement ici, même pour une petite question. Je suis là pour vous.`,
        ht: `Alo {prenom}, se {moi}. M jis pase voye yon ti bonjou ba ou. 😊\n\nPa gen anyen ki prese pou rechaj ou a (kòmand {reference}) : pran tout tan ou bezwen.\n\nLè w pare, ekri m la a, menm si se yon ti kesyon sèlman. M la pou ou.`,
      },
      fun: {
        fr: `Coucou {prenom}, ici {moi} ! 👋\n\nAucune pression pour votre recharge (commande {reference}) : je ne vais pas vous courir après en criant comme un marchand de fresco 😄. Prenez tout votre temps.\n\nQuand vous voudrez, répondez-moi simplement ici et on s'en occupe ensemble. 🤝`,
        ht: `Sak pase {prenom}, se {moi} ! 👋\n\nPa gen presyon pou rechaj ou a (kòmand {reference}) : m p ap kouri dèyè w ap rele tankou machann fresko 😄. Pran tout tan w.\n\nLè w pare, jis reponn mwen la a epi n ap regle sa ansanm. 🤝`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nAucune urgence pour votre commande {reference} : quand vous serez disponible, répondez simplement à ce message.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPa gen anyen ki prese pou kòmand ou {reference} la : lè w pare, jis reponn mesaj sa a.`,
      },
    },
  },
  {
    id: 'follow_up_later',
    category: 'relance',
    label: 'Relance quelques heures plus tard',
    hint: 'La commande a expiré : proposer de la refaire en une minute.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['expired', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVous aviez commencé une recharge de {montant_usd} sur votre compte Meru, mais la commande {reference} n'est plus active. Si vous le souhaitez, il suffit d'une minute pour la refaire : {lien_accueil}\n\nJe reste à votre disposition si vous avez une question.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nOu te kòmanse yon rechaj {montant_usd} sou kont Meru ou, men kòmand {reference} la pa aktif ankò. Si w vle, li pran yon minit sèlman pou w refè l : {lien_accueil}\n\nSi w gen nenpòt kesyon, m la.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je repensais à votre recharge de {montant_usd} pour votre compte Meru, alors je vous écris. 😊\n\nElle n'a pas pu aller au bout (commande {reference}), mais ce n'est pas grave du tout. La refaire ne prend qu'une minute : {lien_accueil}\n\nEt si quelque chose vous a gêné la première fois, dites-le-moi, je vous accompagne volontiers.`,
        ht: `Alo {prenom}, se {moi}. M t ap panse ak rechaj {montant_usd} ou te kòmanse pou kont Meru ou a, se sa k fè m ekri w. 😊\n\nLi pa t rive fin fèt (kòmand {reference}), men pa gen pwoblèm ditou. Li pran yon minit sèlman pou w refè l : {lien_accueil}\n\nEpi si gen yon bagay ki te bloke w premye fwa a, di m, m ap kontan ede w.`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi}, avec des nouvelles de la station ! 🚌\n\nVotre recharge de {montant_usd} pour votre compte Meru a raté son tap-tap : la commande {reference} n'est plus active. Pas de panique, il en repasse un tout de suite, et la refaire ne prend qu'une minute 😄 : {lien_accueil}\n\nSi quelque chose a coincé, écrivez-moi, je vous donne un coup de main. 🤝`,
        ht: `Alo {prenom}, se {moi}, m sot nan estasyon taptap la ! 🚌\n\nRechaj {montant_usd} ou te kòmanse pou kont Meru ou a rate taptap la : kòmand {reference} la pa valab ankò. Pa enkyete w, gen yon lòt k ap pase touswit, epi li pran yon minit sèlman pou w refè l 😄 : {lien_accueil}\n\nSi gen yon bagay ki te bloke w, ekri m, m ap ba w yon kout men. 🤝`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre recharge de {montant_usd} n'a pas abouti. Vous pouvez la refaire en une minute : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nRechaj {montant_usd} ou a pa t fin fèt. Ou ka refè l nan yon minit : {lien_accueil}`,
      },
    },
  },
];
