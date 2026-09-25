import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Les messages d'après la recharge : dollars envoyés, suivi du client, remboursement, et le message libre. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'fulfilled',
    category: 'fin',
    label: 'Dollars envoyés',
    hint: 'L’envoi Meru est fait.',
    color: 'primary',
    recommendedFor: ['fulfilled'],
    availableFor: ['fulfilled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nC'est fait : {montant_usd} ont été envoyés sur votre compte Meru {compte_meru}[[, référence Meru {ref_meru}]]. Vous pouvez vérifier votre solde dans l'application Meru.\n\nMerci de votre confiance pour la commande {reference}.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nLi fèt : {montant_usd} voye sou kont Meru ou {compte_meru}[[, referans Meru {ref_meru}]]. Ou mèt tcheke balans ou nan aplikasyon Meru a.\n\nMèsi paske w fè nou konfyans pou kòmand {reference} la.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}, avec une bonne nouvelle pour vous !\n\nVos {montant_usd} ont bien été envoyés sur votre compte Meru {compte_meru}[[, référence Meru {ref_meru}]]. Vous pouvez ouvrir l'application Meru pour voir votre solde.\n\nMerci beaucoup pour votre confiance (commande {reference}). 🙏 Si quelque chose ne va pas, répondez-moi simplement ici et on regarde ça ensemble.`,
        ht: `Alo {prenom}, se {moi}, m gen yon bon nouvèl pou ou !\n\nNou voye {montant_usd} ou yo sou kont Meru ou {compte_meru}[[, referans Meru {ref_meru}]]. Ou mèt louvri aplikasyon Meru a pou w wè balans ou.\n\nMèsi anpil paske w fè nou konfyans (kòmand {reference}). 🙏 Si gen nenpòt bagay ki pa mache, reponn mwen la a, n ap gade sa ansanm.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 🎉\n\nMission accomplie : vos {montant_usd} ont atterri sur votre compte Meru {compte_meru}[[, référence Meru {ref_meru}]]. Ils ont fait bon voyage et vous attendent déjà ! 💵\n\nOuvrez l'application Meru pour leur souhaiter la bienvenue. Merci de votre confiance, commande {reference} bouclée ! 😄`,
        ht: `Sak pase {prenom}, se {moi} ! 🎉\n\nMisyon akonpli : {montant_usd} ou yo ateri sou kont Meru ou {compte_meru}[[, referans Meru {ref_meru}]]. Yo fè bon vwayaj, y ap tann ou deja ! 💵\n\nLouvri aplikasyon Meru a pou w di yo byenveni. Mèsi paske w fè nou konfyans, kòmand {reference} boukle ! 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVos {montant_usd} sont envoyés sur votre compte Meru {compte_meru}[[, référence Meru {ref_meru}]]. Commande {reference} terminée, merci !`,
        ht: `Bonjou {prenom}, se {moi}.\n\n{montant_usd} ou yo voye sou kont Meru ou {compte_meru}[[, referans Meru {ref_meru}]]. Kòmand {reference} fini, mèsi !`,
      },
    },
  },
  {
    id: 'ask_confirmation',
    category: 'fin',
    label: 'Demander confirmation de réception',
    hint: 'S’assurer que les dollars sont bien arrivés.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['fulfilled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nEst-ce que vous voyez bien les {montant_usd} sur votre compte Meru {compte_meru} ? Répondez-moi pour confirmer, et si quelque chose ne va pas, je m'en occupe.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nÈske w wè {montant_usd} yo sou kont Meru ou {compte_meru} ? Reponn mwen pou konfime, epi si gen yon bagay ki pa bon, m ap regle l.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je viens prendre de vos nouvelles !\n\nJe voulais m'assurer que vos {montant_usd} sont bien arrivés sur votre compte Meru {compte_meru}. Pouvez-vous me dire si vous les voyez dans l'application ? 😊\n\nEt si quelque chose ne va pas, dites-le-moi sans hésiter, je m'en occupe.`,
        ht: `Alo {prenom}, se {moi}. M vin pran nouvèl ou !\n\nMwen vle asire m {montant_usd} ou yo byen rive sou kont Meru ou {compte_meru}. Èske w ka di m si w wè yo nan aplikasyon an ? 😊\n\nSi gen yon bagay ki pa mache, pa jennen di m sa, m ap regle l.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 👋\n\nPetite question de contrôle qualité : vos {montant_usd} sont-ils bien installés sur votre compte Meru {compte_meru} ? Ils devraient déjà avoir posé leurs valises ! 🧳\n\nUn petit « oui » me suffit. Et si quelque chose cloche, dites-le-moi, je m'en occupe tout de suite. 😄`,
        ht: `Sak pase {prenom}, se {moi} ! 👋\n\nTi kesyon rapid : èske {montant_usd} ou yo byen chita sou kont Meru ou {compte_meru} ? Yo ta dwe gentan depoze valiz yo ! 🧳\n\nYon ti « wi » ase pou mwen. Epi si gen yon bagay ki pa bon, di m, m ap regle l touswit. 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVoyez-vous bien les {montant_usd} sur votre compte Meru {compte_meru} ? Un simple « oui » suffit, merci.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nÈske w wè {montant_usd} yo sou kont Meru ou {compte_meru} ? Yon « wi » ase, mèsi.`,
      },
    },
  },
  {
    id: 'thanks_feedback',
    category: 'fin',
    label: 'Remercier et demander un avis',
    hint: 'Une note de 1 à 5, en un seul message.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['fulfilled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci de nous avoir fait confiance pour votre commande {reference}. Pourriez-vous noter le service de 1 à 5 ? Répondez simplement par un chiffre, 5 étant la meilleure note.\n\nSi quelque chose peut être fait mieux, n'hésitez pas à me l'écrire : votre avis nous aide à progresser.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMèsi paske w te fè nou konfyans pou kòmand ou {reference}. Pou ede nou fè pi byen, èske w ka bay sèvis la yon nòt ? Jis reponn ak yon chif, soti nan 1 rive nan 5 (5 se pi bon nòt la).\n\nSi gen yon bagay nou ta ka amelyore, ou ka ekri m sa tou.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que tout va bien de votre côté !\n\nMerci du fond du cœur pour votre commande {reference}. 🙏 Votre avis compte beaucoup pour moi : quelle note donneriez-vous au service, de 1 à 5 (5, c'est la meilleure) ? Répondez simplement avec le chiffre.\n\nEt s'il y a une chose que je pourrais faire mieux, n'hésitez pas à me le dire, ça m'aide vraiment.`,
        ht: `Alo {prenom}, se {moi}. M espere tout bagay ap mache byen bò kote w !\n\nMèsi anpil anpil pou kòmand ou {reference}. 🙏 Sa w panse enpòtan pou mwen : ant 1 ak 5, ki nòt ou ta bay sèvis la (5 se pi bon nòt la) ? Jis reponn ak chif la.\n\nEpi si gen yon bagay m ta ka fè pi byen, pa jennen di m, sa ede m vre.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 😄\n\nMerci pour la commande {reference} ! Petit sondage express : notez-nous de 1 à 5, en répondant juste avec le chiffre.\n1️⃣ On a encore du travail\n5️⃣ On mérite une médaille 🏅\n\nEt si vous avez une idée pour nous améliorer, je suis tout ouïe !`,
        ht: `Sak pase {prenom}, se {moi} ! 😄\n\nMèsi paske w te rechaje avè nou pou kòmand {reference} la. Ti sondaj rapid : ban nou yon nòt ant 1 ak 5, jis reponn ak chif la.\n1️⃣ Nou gen travay pou n fè ankò\n5️⃣ Nou merite yon meday 🏅\n\nEpi si w gen yon ide pou n fè pi byen, zòrèy mwen byen louvri !`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci pour votre commande {reference} ! Notez le service de 1 à 5 (5 = la meilleure note) en répondant avec le chiffre, et dites-moi une chose à améliorer si vous le souhaitez.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMèsi pou kòmand ou {reference} ! Reponn ak yon chif ant 1 ak 5 pou w ban nou yon nòt (5 se pi bon nòt la), epi di m yon bagay pou n amelyore si w vle.`,
      },
    },
  },
  {
    id: 'referral',
    category: 'fin',
    label: 'Proposer d’en parler autour de soi',
    hint: 'Inviter un client content à recommander le service.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['fulfilled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJ'espère que votre commande {reference} vous a donné satisfaction. Si c'est le cas, vous pouvez partager ce lien avec vos proches qui utilisent Meru : {lien_accueil}\n\nC'est la meilleure façon de nous aider à grandir. Merci pour votre soutien.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nM espere w te kontan ak kòmand ou {reference}. Si se sa, ou ka pataje lyen sa a ak fanmi w ak zanmi w ki itilize Meru : {lien_accueil}\n\nSe konsa w ka ede nou grandi. Mèsi pou sipò w.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien !\n\nÇa m'a fait plaisir de m'occuper de votre commande {reference}. 😊 Si le service vous a plu, n'hésitez pas à en parler à votre famille et à vos amis qui ont un compte Meru. Voici le lien à leur envoyer : {lien_accueil}\n\nLe bouche-à-oreille, c'est ce qui nous fait grandir. Merci de tout cœur !`,
        ht: `Alo {prenom}, se {moi}. M espere w byen !\n\nSa te fè m plezi pou m okipe kòmand ou {reference}. 😊 Si sèvis la te plè w, pa jennen fè fanmi w ak zanmi w ki gen kont Meru konnen nou. Men lyen pou w voye ba yo : {lien_accueil}\n\nLè moun pale de nou, se sa ki fè nou grandi. Mèsi anpil !`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 😄\n\nSi votre commande {reference} vous a donné le sourire, j'ai un petit service à vous demander : en parler à la famille et aux amis qui utilisent Meru. 📲 Nous n'avons pas de panneau géant sur la route de l'aéroport : notre meilleure publicité, c'est vous !\n\nLe lien à leur transmettre : {lien_accueil}\n\nMille mercis pour le coup de main ! 🤝`,
        ht: `Sak pase {prenom}, se {moi} ! 😄\n\nSi kòmand ou {reference} te fè w souri, m gen yon ti sèvis pou m mande w : pale de nou ak fanmi w ak zanmi w ki itilize Meru. 📲 Nou pa gen gwo pankat sou wout ayewopò a : pi bon piblisite nou, se ou menm !\n\nMen lyen pou w voye ba yo : {lien_accueil}\n\nMèsi anpil pou kout men an ! 🤝`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci pour votre commande {reference} ! Si le service vous a plu, vous pouvez partager ce lien avec vos proches qui utilisent Meru : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMèsi pou kòmand ou {reference} ! Si sèvis la te plè w, ou mèt pataje lyen sa a ak fanmi w ak zanmi w ki itilize Meru : {lien_accueil}`,
      },
    },
  },
  {
    id: 'reorder_nudge',
    category: 'fin',
    label: 'Proposer une nouvelle recharge',
    hint: 'Rappeler au client qu’il peut recharger à nouveau quand il veut.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['fulfilled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci d'avoir fait appel à nous pour votre commande {reference}. Chaque fois que vous aurez besoin de dollars sur votre compte Meru, vous pourrez recharger ici : {lien_accueil}\n\nPasser commande ne prend qu'une minute.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMèsi paske w te chwazi nou pou kòmand ou {reference}. Chak fwa w bezwen dola sou kont Meru ou, ou ka rechaje sou lyen sa a : {lien_accueil}\n\nSa pran yon minit sèlman pou w pase yon kòmand.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}, juste un petit mot en passant. 😊\n\nJ'espère que tout s'est bien passé pour votre commande {reference}. Le jour où il vous faudra à nouveau des dollars sur votre compte Meru, pensez à moi ! Il suffit de passer par ici : {lien_accueil}\n\nÇa prend une petite minute, et je m'occupe du reste. À bientôt !`,
        ht: `Alo {prenom}, se {moi}, m jis vle voye yon ti mo pou ou. 😊\n\nM espere kòmand ou {reference} te pase byen. Jou w bezwen dola sou kont Meru ou ankò, pa bliye m ! Se jis pou w pase la a : {lien_accueil}\n\nSa pran yon ti minit, epi m ap okipe rès la. A byento !`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 👋\n\nPetite confidence : depuis votre commande {reference}, les dollars disent que vous leur manquez déjà ! 😄 Le jour où vous voudrez les retrouver sur votre compte Meru, c'est par ici : {lien_accueil}\n\nUne minute pour commander, et on s'occupe du reste. Zéro pression : on sera là quand vous voudrez ! 💵`,
        ht: `Sak pase {prenom}, se {moi} ! 👋\n\nTi sekrè : depi kòmand {reference} la, dola yo gentan sonje w ! 😄 Jou w vle wè yo sou kont Meru ou ankò, se la a pou w pase : {lien_accueil}\n\nYon minit pou w kòmande, epi n ap okipe rès la. Pa gen presyon, n ap la nenpòt lè w vle ! 💵`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci pour votre commande {reference}. Pour recharger votre compte Meru à nouveau, c'est une minute, quand vous voulez : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMèsi pou kòmand {reference} la. Pou w rechaje kont Meru ou ankò, sa pran yon minit, nenpòt lè : {lien_accueil}`,
      },
    },
  },
  {
    id: 'refund_done',
    category: 'fin',
    label: 'Remboursement effectué',
    hint: 'L’argent est reparti vers le portefeuille du client.',
    color: 'primary',
    recommendedFor: ['refunded'],
    availableFor: ['refunded'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nLe remboursement de {montant_recu} pour la commande {reference} est parti sur votre compte {methode}. Il peut mettre quelques minutes à apparaître. Merci de votre patience.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nNou voye ranbousman {montant_recu} pou kòmand {reference} la sou kont {methode} ou. Li ka pran kèk minit pou l parèt. Mèsi pou pasyans ou.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe vous confirme que le remboursement de {montant_recu} pour votre commande {reference} est parti sur votre compte {methode}. Il peut mettre quelques minutes à apparaître.\n\nMerci beaucoup pour votre patience et votre compréhension. 🙏 Si vous ne voyez rien arriver d'ici là, écrivez-moi et je vérifie avec vous.`,
        ht: `Alo {prenom}, se {moi}.\n\nM vin konfime w ranbousman an fèt : nou voye {montant_recu} pou kòmand ou {reference} sou kont {methode} ou. Li ka pran kèk minit pou l parèt.\n\nMèsi anpil pou pasyans ou ak konpreyansyon w. 🙏 Si w pa wè anyen apre sa, ekri m, m ap verifye avè w.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} !\n\nC'est réglé : le remboursement de {montant_recu} pour votre commande {reference} est parti sur votre compte {methode}. Il peut mettre quelques minutes à apparaître.\n\nMerci pour votre patience. Et le jour où vous voudrez retenter l'aventure, la porte reste grande ouverte ! 😊`,
        ht: `Alo {prenom}, se {moi} !\n\nSa regle : nou voye ranbousman {montant_recu} pou kòmand {reference} la sou kont {methode} ou. Li ka pran kèk minit pou l parèt.\n\nMèsi pou pasyans ou. Jou w vle eseye ankò, pòt la toujou louvri pou ou ! 😊`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nRemboursement de {montant_recu} envoyé sur votre compte {methode} (commande {reference}). Il peut mettre quelques minutes à apparaître.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nNou voye ranbousman {montant_recu} ou a sou kont {methode} ou (kòmand {reference}). Li ka pran kèk minit pou l parèt.`,
      },
    },
  },
  {
    id: 'free_text',
    category: 'libre',
    label: 'Message libre',
    hint: 'Ouvre WhatsApp avec seulement la référence, à vous d’écrire.',
    color: 'neutral',
    recommendedFor: [],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}, au sujet de votre commande {reference}.`,
        ht: `Bonjou {prenom}, se {moi}, konsènan kòmand ou {reference}.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi} : je vous écris au sujet de votre commande {reference}. 😊`,
        ht: `Alo {prenom}, se {moi}, m ap ekri w konsènan kòmand ou {reference}. 😊`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi}, je passe vous faire un petit coucou au sujet de votre commande {reference} ! 👋`,
        ht: `Alo {prenom}, se {moi}, m pase di w yon ti bonjou konsènan kòmand ou {reference} ! 👋`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}, pour votre commande {reference}.`,
        ht: `Bonjou {prenom}, se {moi}, pou kòmand ou {reference}.`,
      },
    },
  },
];
