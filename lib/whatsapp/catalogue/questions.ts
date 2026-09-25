import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Questions pour comprendre pourquoi une commande n'a pas été payée, et inviter le client à répondre. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'ask_why',
    category: 'questions',
    label: 'Demander ce qui a bloqué (mini-sondage)',
    hint: 'Une question simple à laquelle on répond par un chiffre.',
    color: 'primary',
    recommendedFor: ['expired', 'cancelled'],
    availableFor: ['pending_payment', 'expired', 'cancelled', 'failed'],
    warning: 'Si la commande a échoué, vérifiez d’abord qu’aucun montant n’a été prélevé : si c’est le cas, envoyez plutôt « Expliquer un échec ».',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJ'ai vu que votre commande {reference} n'a pas été finalisée. Puis-je vous demander ce qui a bloqué ? Répondez simplement par un chiffre :\n\n1. le prix\n2. le paiement était compliqué\n3. pas le temps, je le ferai plus tard\n4. un doute ou une question sur le service\n5. autre chose\n\nVotre réponse m'aidera à améliorer le service. Merci d'avance.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen wè kòmand ou a ({reference}) pa t boukle. Èske m ka mande w kisa k te bloke ? Reponn ak yon chif sèlman :\n\n1. pri a\n2. peman an te konplike\n3. m pa t gen tan, m ap fè l pita\n4. m gen yon dout oswa yon kesyon sou sèvis la\n5. yon lòt bagay\n\nRepons ou ap ede m amelyore sèvis la. Mèsi davans.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien. 😊\n\nJ'ai remarqué que votre commande {reference} n'est pas allée jusqu'au bout, et j'aimerais simplement comprendre ce qui s'est passé. Si vous avez un petit moment, répondez-moi juste avec le chiffre qui vous correspond :\n\n1. le prix\n2. le paiement était compliqué\n3. pas le temps, je le ferai plus tard\n4. un doute ou une question sur le service\n5. autre chose\n\nChaque réponse m'aide vraiment à améliorer le service. Et si vous avez besoin de moi, je suis là. 🙏`,
        ht: `Alo {prenom}, se {moi}. M espere w anfòm. 😊\n\nMwen wè kòmand ou a ({reference}) pa t fin fèt, epi m ta renmen konprann sa k te pase. Si w gen yon ti moman, jis voye m chif ki koresponn ak ka w la :\n\n1. pri a\n2. peman an te konplike\n3. m pa t gen tan, m ap fè l pita\n4. m gen yon dout oswa yon kesyon sou sèvis la\n5. yon lòt bagay\n\nChak repons ede m anpil pou m amelyore sèvis la. Epi si w bezwen m, m la pou ou. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 🕵️\n\nPetite enquête du jour, version très polie : votre commande {reference} s'est arrêtée en chemin, et j'aimerais comprendre ce qui a coincé. Pas besoin d'un long témoignage, un seul chiffre suffit :\n\n1️⃣ le prix\n2️⃣ le paiement était compliqué\n3️⃣ pas le temps, je le ferai plus tard\n4️⃣ un doute ou une question sur le service\n5️⃣ autre chose\n\nVotre réponse m'aide à améliorer le service. Un chiffre, et l'enquête est bouclée ! 😄`,
        ht: `Sak pase {prenom}, se {moi} ! 🕵️\n\nJodi a m ap fè yon ti ankèt, men yon ankèt byen janti : kòmand ou a ({reference}) kanpe nan mitan wout, epi m ta renmen konprann sa k te bloke l. Pa bezwen fè gwo diskou, yon sèl chif ase :\n\n1️⃣ pri a\n2️⃣ peman an te konplike\n3️⃣ m pa t gen tan, m ap fè l pita\n4️⃣ m gen yon dout oswa yon kesyon sou sèvis la\n5️⃣ yon lòt bagay\n\nRepons ou ap ede m amelyore sèvis la. Yon chif, epi ankèt la boukle ! 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nQu'est-ce qui a bloqué votre commande {reference} ? Répondez par un chiffre :\n\n1. le prix\n2. le paiement était compliqué\n3. pas le temps, je le ferai plus tard\n4. un doute ou une question sur le service\n5. autre chose\n\nVotre réponse m'aide à améliorer le service.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKisa k te bloke kòmand ou a ({reference}) ? Reponn ak yon chif :\n\n1. pri a\n2. peman an te konplike\n3. m pa t gen tan, m ap fè l pita\n4. m gen yon dout oswa yon kesyon sou sèvis la\n5. yon lòt bagay\n\nRepons ou ap ede m amelyore sèvis la.`,
      },
    },
  },
  {
    id: 'ask_still_interested',
    category: 'questions',
    label: 'Toujours intéressé ?',
    hint: 'Savoir si le client veut toujours sa recharge.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe me permets de vous écrire au sujet de votre commande {reference} : souhaitez-vous toujours recevoir {montant_usd} sur votre compte Meru ? Répondez simplement « oui » ou « non ». Si c'est oui, je vous accompagne pour la suite.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen ta renmen konnen yon bagay sou kòmand ou a ({reference}) : èske w toujou vle resevwa {montant_usd} sou kont Meru ou ? Reponn « wi » oswa « non » sèlman. Si se wi, m ap ede w boukle l.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. 😊\n\nJe pensais à votre commande {reference} et je voulais prendre de vos nouvelles. Avez-vous toujours envie de recevoir vos {montant_usd} sur votre compte Meru ? Si oui, je suis là pour vous accompagner jusqu'au bout, tranquillement. Et si vous avez changé d'avis, aucun souci : dites-le-moi simplement.`,
        ht: `Alo {prenom}, se {moi}. 😊\n\nM t ap panse ak kòmand ou a ({reference}), kidonk m vin pran nouvèl ou. Èske w toujou anvi resevwa {montant_usd} yo sou kont Meru ou ? Si se wi, m la pou m ede w jis nan bout, san tèt chaje. Epi si w chanje lide, pa gen pwoblèm, jis fè m konnen.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 👋\n\nLes {montant_usd} de votre commande {reference} me demandent de vos nouvelles : ils sont prêts à sauter sur votre compte Meru, mais ils sont trop polis pour s'inviter tout seuls. Alors, on y va toujours ?\n\nRépondez « oui » ou « non ». Si c'est oui, je vous accompagne pour la suite. Si c'est non, aucun souci : les dollars bouderont un peu, puis ils s'en remettront. 😅`,
        ht: `Alo {prenom}, se {moi} ! 👋\n\nMen {montant_usd} ou te kòmande yo (kòmand {reference}) k ap mande nouvèl ou : yo pare pou yo sote antre nan kont Meru ou, men yo twò byen elve pou yo antre lakay moun san yo pa envite yo. Alò, ou toujou vle yo ?\n\nReponn « wi » oswa « non ». Si se wi, m ap ede w fini kòmand lan. Si se non, pa gen pwoblèm : dola yo ap boude yon ti kras, apre sa y ap kontan ankò. 😅`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVoulez-vous toujours recevoir {montant_usd} sur votre compte Meru (commande {reference}) ? Répondez « oui » ou « non ».`,
        ht: `Bonjou {prenom}, se {moi}.\n\nÈske w toujou vle resevwa {montant_usd} sou kont Meru ou (kòmand {reference}) ? Reponn « wi » oswa « non ».`,
      },
    },
  },
  {
    id: 'ask_price',
    category: 'questions',
    label: 'Le prix a-t-il fait hésiter ?',
    hint: 'Expliquer ce que contient le total, sans promettre de rabais.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nLe prix de votre commande {reference} vous a-t-il fait hésiter ? Le total de {montant_htg} pour recevoir {montant_usd} comprend le taux de change et les frais du service. Tout est affiché avant de payer, sans frais cachés.\n\nSi vous avez une question sur ce total, je vous réponds volontiers.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nÈske se pri kòmand ou a ({reference}) ki te fè w ezite ? Total {montant_htg} la, pou w resevwa {montant_usd}, gen ladan l to chanj lan ak frè sèvis la. Tout bagay parèt anvan w peye, pa gen okenn frè kache.\n\nSi w gen yon kesyon sou total la, m ap reponn ou ak plezi.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. 😊\n\nJe me demandais si le prix de votre commande {reference} vous avait fait hésiter. Je tiens à tout vous expliquer simplement : le total de {montant_htg} pour {montant_usd} comprend le taux de change et nos frais, et tout est affiché avant de payer, sans surprise. Si quelque chose vous paraît flou, posez-moi toutes vos questions, je suis là pour ça.`,
        ht: `Alo {prenom}, se {moi}. 😊\n\nM t ap mande tèt mwen si se pri kòmand ou a ({reference}) ki te fè w ezite. Kite m esplike w sa byen senp : total {montant_htg} la pou {montant_usd} gen ladan l to chanj lan ak frè nou yo, epi tout bagay parèt anvan w peye, pa gen sipriz. Si gen yon bagay ki pa klè, poze m tout kesyon w genyen, m la pou sa.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 😄\n\nPetite question sur votre commande {reference} : est-ce le prix qui vous a fait hésiter ? Je joue cartes sur table : le total de {montant_htg} pour {montant_usd} comprend le taux de change et les frais. Tout est affiché avant de payer : pas de frais cachés qui sortent du chapeau à la dernière seconde. 🎩\n\nUne question sur ce total ? Envoyez-la-moi, j'adore expliquer mes calculs (ma calculatrice aussi). 🧮`,
        ht: `Alo {prenom}, se {moi} ! 😄\n\nTi kesyon sou kòmand ou a ({reference}) : èske se pri a ki te fè w ezite ? Ann pale kare : total {montant_htg} la pou {montant_usd} gen ladan l to chanj lan ak frè yo. Tout bagay parèt anvan w peye, pa gen frè kache k ap soti nan yon chapo majisyen nan dènye minit. 🎩\n\nOu gen yon kesyon sou total la ? Voye l ban m, m renmen esplike kalkil mwen (kalkilatris mwen renmen sa tou). 🧮`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nLe prix vous a fait hésiter ? Le total de {montant_htg} pour {montant_usd} (commande {reference}) comprend le taux de change et les frais, tous affichés avant de payer : posez-moi vos questions si besoin.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSe pri a ki te fè w ezite ? Total {montant_htg} la pou {montant_usd} (kòmand {reference}) gen ladan l to chanj lan ak frè yo, epi yo tout parèt anvan w peye : si w gen kesyon, poze m yo.`,
      },
    },
  },
  {
    id: 'ask_do_it_together',
    category: 'questions',
    label: 'Proposer de le faire ensemble',
    hint: 'Accompagner le client pas à pas, ici sur WhatsApp.',
    color: 'primary',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled', 'failed'],
    warning: 'Si la commande a échoué, vérifiez d’abord qu’aucun montant n’a été prélevé au client, pour ne pas le faire payer deux fois.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nSi vous le souhaitez, nous pouvons faire votre recharge (commande {reference}) ensemble, maintenant, ici sur WhatsApp. Je vous guide étape par étape jusqu'au paiement par {methode}. Répondez simplement « oui » et nous commençons tout de suite.\n\nPar sécurité, ne m'envoyez jamais votre code secret {methode} : je n'en ai pas besoin.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSi w vle, nou ka fè rechaj ou a (kòmand {reference}) ansanm, kounye a menm, isit la sou WhatsApp. M ap gide w etap pa etap jiskaske w peye ak {methode}. Jis reponn « wi » epi n ap kòmanse touswit.\n\nPou sekirite w, pa janm voye kòd sekrè {methode} ou ban mwen : m pa bezwen l.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien. 😊\n\nLes paiements en ligne ne sont pas toujours simples, même pour les habitués. Si vous voulez, on fait votre recharge (commande {reference}) ensemble, tout de suite, ici sur WhatsApp : je vous accompagne étape par étape, à votre rythme, jusqu'au paiement par {methode}. Dites-moi juste « on y va » et je suis avec vous. 🤝\n\nEt surtout, ne m'envoyez jamais votre code secret {methode} : je n'en ai pas besoin.`,
        ht: `Alo {prenom}, se {moi}. M espere w anfòm. 😊\n\nPeman sou entènèt pa toujou fasil, menm pou moun ki abitye. Si w vle, nou fè rechaj ou a (kòmand {reference}) ansanm, kounye a menm, isit la sou WhatsApp : m ap mache avè w etap pa etap, dousman, jiskaske w peye ak {methode}. Jis di m « ann ale » epi m la avè w. 🤝\n\nEpi sitou, pa janm voye kòd sekrè {methode} ou ban mwen : m pa bezwen l.`,
      },
      fun: {
        fr: `Bonjour {prenom}, c'est {moi} ! 🗺️\n\nEt si on faisait votre recharge ensemble, là, tout de suite, ici sur WhatsApp ? Pour la commande {reference}, je serai votre GPS jusqu'au paiement par {methode} : un GPS patient, qui ne s'énerve jamais si vous prenez votre temps. 😄 On avance étape par étape, à votre rythme.\n\nÉcrivez « c'est parti » et je vous envoie la première étape.\n\nImportant : ne m'envoyez jamais votre code secret {methode}, je n'en ai pas besoin. 🔒`,
        ht: `Sak pase {prenom}, se {moi} ! 🗺️\n\nSa w ta di si nou fè rechaj ou a ansanm, kounye a menm, isit la sou WhatsApp ? Pou kòmand {reference} a, m ap sèvi w kòm GPS jiskaske w peye ak {methode} : yon GPS ki pale kreyòl epi ki pa janm fache si w pran tan w. 😄 N ap avanse etap pa etap, dousman.\n\nEkri « m pare » epi m ap voye premye etap la ba ou.\n\nEnpòtan : pa janm voye kòd sekrè {methode} ou ban mwen, m pa bezwen l. 🔒`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVoulez-vous faire votre recharge (commande {reference}) avec moi, maintenant, étape par étape ici sur WhatsApp ? Répondez « oui » et je vous guide jusqu'au paiement par {methode}. Ne m'envoyez jamais votre code secret {methode} : je n'en ai pas besoin.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nOu vle nou fè rechaj ou a (kòmand {reference}) ansanm, kounye a, etap pa etap isit la sou WhatsApp ? Reponn « wi » epi m ap gide w jiskaske w peye ak {methode}. Pa janm voye kòd sekrè {methode} ou ban mwen : m pa bezwen l.`,
      },
    },
  },
  {
    id: 'ask_amount_change',
    category: 'questions',
    label: 'Changer le montant ?',
    hint: 'Proposer un montant plus petit ou plus grand.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} porte sur {montant_usd}. Si ce montant ne vous convient pas, vous pouvez faire une nouvelle commande avec un montant plus petit ou plus grand, à partir de {montant_min} : {lien_accueil}\n\nLe nouveau total s'affichera avant de payer, et vous n'aurez rien à payer pour l'ancienne commande. N'hésitez pas à me dire si vous avez besoin d'aide.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou a ({reference}) se pou {montant_usd}. Si montan sa a pa mache pou ou, ou ka fè yon nouvo kòmand ak yon montan pi piti oswa pi gwo, apati {montant_min} : {lien_accueil}\n\nNouvo total la ap parèt anvan w peye, epi ou pa bezwen peye ansyen kòmand lan. Si w bezwen èd, di m sa.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. 😊\n\nPeut-être qu'un autre montant que {montant_usd} vous arrangerait mieux pour votre recharge (commande {reference}) ? C'est tout à fait possible : vous pouvez refaire une commande, plus petite ou plus grande, à partir de {montant_min}, ici : {lien_accueil}\n\nLe nouveau total s'affiche avant de payer, et vous n'aurez rien à payer pour l'ancienne commande. Si vous voulez que je vous aide, je suis là, avec plaisir.`,
        ht: `Alo {prenom}, se {moi}. 😊\n\nPetèt ou ta pi alèz ak yon lòt montan pase {montant_usd} pou kòmand ou a ({reference}) ? Sa posib, wi : ou ka refè yon kòmand, pi piti oswa pi gwo, apati {montant_min}, sou lyen sa a : {lien_accueil}\n\nNouvo total la ap parèt anvan w peye, epi ou pa bezwen peye ansyen kòmand lan. Si w vle m ede w, m la ak plezi.`,
      },
      fun: {
        fr: `Bonjour {prenom}, c'est {moi} !\n\nIci, on travaille comme un bon tailleur : si le montant ne tombe pas pile à votre mesure, on reprend les mesures ! 🧵 Votre commande {reference} est de {montant_usd}. Pour un montant plus petit ou plus grand, à partir de {montant_min}, refaites simplement une commande ici : {lien_accueil}\n\nLe nouveau total s'affiche avant de payer, et vous n'avez rien à payer pour l'ancienne commande. Besoin d'un coup de main pour l'essayage ? Je suis là. 😄`,
        ht: `Sak pase {prenom}, se {moi} !\n\nIsit la, se tankou lakay yon bon tayè : si montan an pa fè w byen, nou repran mezi yo ! 🧵 Kòmand ou a ({reference}) se pou {montant_usd}. Si w vle yon montan pi piti oswa pi gwo, apati {montant_min}, jis refè yon kòmand sou lyen sa a : {lien_accueil}\n\nNouvo total la ap parèt anvan w peye, epi ou pa bezwen peye ansyen kòmand lan. Ou bezwen yon ti kout men pou eseyaj la ? M la. 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nUn autre montant que {montant_usd} (commande {reference}) vous conviendrait mieux ? Refaites une commande à partir de {montant_min}, sans rien payer pour l'ancienne : {lien_accueil}\n\nLe nouveau total s'affiche avant de payer.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nOu ta prefere yon lòt montan pase {montant_usd} (kòmand {reference}) ? Refè yon kòmand apati {montant_min}, ou pa bezwen peye ansyen an : {lien_accueil}\n\nNouvo total la ap parèt anvan w peye.`,
      },
    },
  },
  {
    id: 'ask_best_time',
    category: 'questions',
    label: 'Quand vous recontacter ?',
    hint: 'Demander le bon moment, sans insister.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe peux vous aider à faire votre recharge (commande {reference}) quand cela vous arrange. Quel jour et à quelle heure puis-je vous recontacter ? Nos horaires : {heures}. Répondez quand vous voulez, sans aucune obligation.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nM ka ede w fè rechaj ou a (kòmand {reference}) lè l bon pou ou. Ki jou ak ki lè m ka kontakte w ankò ? Nou disponib : {heures}. Reponn lè w gen tan, san okenn obligasyon.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. 😊\n\nOn n'a pas toujours le temps au bon moment, je le comprends très bien. Je peux vous aider à faire votre recharge (commande {reference}) quand ce sera plus pratique pour vous : dites-moi simplement le jour et l'heure qui vous arrangent.\n\nJe suis disponible pendant nos horaires ({heures}), répondez quand cela vous convient. 🙏`,
        ht: `Alo {prenom}, se {moi}. 😊\n\nNou pa toujou gen tan lè nou ta vle, m konprann sa byen. M ka ede w fè rechaj ou a (kòmand {reference}) lè l ap pi pratik pou ou : jis di m ki jou ak ki lè ki mache pou ou.\n\nM disponib pandan lè nou louvri ({heures}), reponn lè w vle. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 🎣\n\nChez nous, on a la patience d'un pêcheur au bord de la mer : quel moment vous arrangerait pour que je vous aide à faire votre recharge (commande {reference}) ? Donnez-moi le jour et l'heure, je le note tout de suite. 📅\n\nJe réponds pendant nos horaires ({heures}), la canne à pêche jamais très loin. 😄`,
        ht: `Alo {prenom}, se {moi} ! 🎣\n\nIsit la nou gen pasyans tankou yon pechè ki chita bò lanmè : ki lè ki ta mache pou ou pou m ede w fè rechaj ou a (kòmand {reference}) ? Di m ki jou ak ki lè, m ap note l touswit. 📅\n\nM ap reponn pandan lè nou louvri ({heures}), liy pèch la pa janm twò lwen. 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nQuel jour et à quelle heure puis-je vous aider à faire votre recharge (commande {reference}) ? Nos horaires : {heures}.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKi jou ak ki lè m ka ede w fè rechaj ou a (kòmand {reference}) ? Nou disponib : {heures}.`,
      },
    },
  },
];
