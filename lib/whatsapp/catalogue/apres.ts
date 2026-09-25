import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Les messages d'après une commande expirée, annulée ou en échec : recommencer, vérifier un paiement, expliquer, donner envie de revenir. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'expired_restart',
    category: 'apres',
    label: 'Commande expirée, recommencer',
    hint: 'Le délai est passé sans paiement : inviter à refaire une commande.',
    color: 'primary',
    recommendedFor: ['expired', 'cancelled'],
    availableFor: ['expired', 'cancelled', 'failed'],
    warning: 'Dit que la commande a expiré et que rien n’a été prélevé : pour une annulation, préférez « Confirmer l’annulation » ; pour un échec, vérifiez d’abord qu’aucun paiement n’est arrivé.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} a expiré sans paiement, elle n'est donc plus valable. Aucun montant ne vous a été prélevé. Vous pouvez en créer une nouvelle quand vous voulez : {lien_accueil}\n\nLe taux du jour a pu changer : vous verrez le nouveau total avant de payer.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} ekspire san peman, li pa valab ankò. Nou pa retire okenn kòb sou ou. Ou ka fè yon lòt lè w vle : {lien_accueil}\n\nTo dola a ka gentan chanje, men nouvo total la ap parèt anvan w peye.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien. 😊\n\nVotre commande {reference} a expiré avant d'être payée, elle n'est donc plus valable. Rassurez-vous : rien ne vous a été prélevé.\n\nSi vous avez toujours besoin de vos {montant_usd}, vous pouvez refaire une commande quand vous voulez : {lien_accueil}\n\nLe taux du jour a pu changer, mais vous verrez le nouveau total avant de payer. Et si vous avez besoin d'aide, je suis là. 🤝`,
        ht: `Alo {prenom}, se {moi}. M espere w ap byen. 😊\n\nKòmand ou {reference} ekspire anvan w te peye l, kidonk li pa valab ankò. Pa enkyete w : nou pa retire okenn kòb sou ou.\n\nSi w toujou bezwen {montant_usd} ou yo, ou ka refè yon kòmand lè w vle : {lien_accueil}\n\nTo dola a ka gentan chanje, men w ap wè nouvo total la anvan w peye. Si w bezwen yon ti kout men, m la. 🤝`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} ! 👋\n\nCoup de sifflet final pour votre commande {reference} ⚽ : le délai est passé avant le paiement, elle a donc expiré et n'est plus valable. Rassurez-vous, rien ne vous a été prélevé.\n\nBonne nouvelle : on peut rejouer le match quand vous voulez ! Il suffit de refaire une commande : {lien_accueil}\n\nLe taux du jour a peut-être bougé, mais vous verrez le nouveau total avant de payer. Zéro surprise ! 😉`,
        ht: `Sak pase {prenom}, se {moi} ! 👋\n\nAbit la soufle fen match la pou kòmand ou {reference} la ⚽ : delè a pase anvan peman an rive, kidonk li ekspire, li pa valab ankò. Pa enkyete w, nou pa retire okenn kòb sou ou.\n\nBon nouvèl : nou ka rejwe match la lè w vle ! Ou jis bezwen fè yon nouvo kòmand : {lien_accueil}\n\nTo dola a ka gentan chanje, men w ap wè nouvo total la anvan w peye. Pa gen sipriz ! 😉`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} a expiré sans paiement, rien ne vous a été prélevé. Pour en refaire une, au taux du jour : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} ekspire san peman, nou pa retire okenn kòb sou ou. Pou w fè yon lòt ak to dola jodi a : {lien_accueil}`,
      },
    },
  },
  {
    id: 'payment_proof',
    category: 'apres',
    label: 'Demander la preuve de paiement',
    hint: 'Vous soupçonnez un paiement que le système n’a pas vu.',
    color: 'caution',
    recommendedFor: ['expired'],
    availableFor: ['pending_payment', 'expired', 'needs_review', 'failed'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe ne vois pas encore le paiement de votre commande {reference} ({montant_htg} par {methode}). Si vous avez bien payé, envoyez-moi une capture du message de confirmation {methode}, avec le numéro de transaction. Je vérifie et je débloque tout de suite.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen poko wè peman kòmand ou {reference} ({montant_htg} ak {methode}). Si w te deja peye, voye yon foto mesaj konfimasyon {methode} a ban mwen, ak nimewo tranzaksyon an. M ap verifye epi regle sa touswit.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je voudrais vérifier une chose avec vous. 😊\n\nJe ne retrouve pas encore le paiement de votre commande {reference} ({montant_htg} par {methode}). Si vous avez déjà payé, pas d'inquiétude : envoyez-moi simplement une capture du message de confirmation {methode}, avec le numéro de transaction.\n\nJe vérifie moi-même et je débloque tout de suite. Merci beaucoup pour votre aide. 🙏`,
        ht: `Alo {prenom}, se {moi}. M ta renmen verifye yon bagay avè w. 😊\n\nMwen poko jwenn peman kòmand ou {reference} ({montant_htg} ak {methode}). Si w te deja peye, pa enkyete w : jis voye yon foto mesaj konfimasyon {methode} a ban mwen, ak nimewo tranzaksyon an.\n\nM ap verifye sa mwen menm epi m ap regle l touswit. Mèsi anpil. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi}. 🙂\n\nLe paiement de votre commande {reference} ({montant_htg} par {methode}) ne s'est pas encore montré de mon côté. Si vous avez déjà payé, aidez-moi à le retrouver : envoyez-moi une capture du message de confirmation {methode}, avec le numéro de transaction.\n\nJe sors ma loupe 🔍 et je débloque votre commande dès que je retrouve le paiement.`,
        ht: `Alo {prenom}, se {moi}. 🙂\n\nPeman kòmand ou {reference} la ({montant_htg} ak {methode}) poko parèt bò kote m. Si w te deja peye, ede m jwenn li : voye yon foto mesaj konfimasyon {methode} a ban mwen, ak nimewo tranzaksyon an.\n\nM ap mete chapo detektif mwen touswit 🔍 epi m ap debloke kòmand ou a depi m jwenn peman an.`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe ne vois pas encore le paiement de la commande {reference} ({montant_htg}). Si vous avez payé, envoyez-moi la capture de confirmation {methode} avec le numéro de transaction : je vérifie et je débloque tout de suite.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen poko wè peman kòmand {reference} ({montant_htg}). Si w te peye, voye foto konfimasyon {methode} a ban mwen ak nimewo tranzaksyon an : m ap verifye epi regle sa touswit.`,
      },
    },
  },
  {
    id: 'failed_explained',
    category: 'apres',
    label: 'Expliquer un échec',
    hint: 'La commande n’a pas abouti côté fournisseur.',
    color: 'caution',
    recommendedFor: ['failed'],
    availableFor: ['failed', 'cancelled', 'expired'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} n'a pas abouti et aucun dollar n'a été envoyé. Si de l'argent a été prélevé sur votre {methode}, écrivez-moi tout de suite avec le message de confirmation : je vérifie et je vous rembourse.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} pa t reyisi epi nou pa voye okenn dola. Si yo te retire kòb sou {methode} ou a, voye mesaj konfimasyon an ban mwen touswit : m ap verifye epi ranbouse w.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je préfère vous prévenir moi-même.\n\nVotre commande {reference} n'a malheureusement pas abouti, et aucun dollar n'a été envoyé sur votre compte Meru. Si de l'argent a quand même été prélevé sur votre {methode}, écrivez-moi tout de suite avec le message de confirmation.\n\nJe vérifie aussitôt et je vous rembourse. Je suis là pour vous. 🙏`,
        ht: `Alo {prenom}, se {moi}. Mwen pito di w sa mwen menm.\n\nMalerezman, kòmand ou {reference} pa t reyisi, epi nou pa voye okenn dola sou kont Meru ou. Si yo te retire kòb sou {methode} ou a kanmenm, voye mesaj konfimasyon an ban mwen touswit.\n\nM ap verifye sa san pèdi tan epi m ap ranbouse w. M la pou ou. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi}. 🙏\n\nVotre commande {reference} n'a pas abouti, et aucun dollar n'est parti. Si de l'argent a quand même quitté votre {methode}, pas de panique : écrivez-moi vite avec le message de confirmation, je vérifie et je vous rembourse.\n\nLes machines ont leurs caprices, mais moi, je reste bien là pour vous ! 😊`,
        ht: `Alo {prenom}, se {moi}. 🙏\n\nKòmand ou {reference} pa t reyisi, epi okenn dola pa t pati. Si yo te retire kòb sou {methode} ou a kanmenm, pa panike : voye mesaj konfimasyon an ban mwen vit, m ap verifye epi m ap ranbouse w.\n\nMachin yo konn fè tèt di pafwa, men mwen menm, m toujou la pou ou ! 😊`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} n'a pas abouti, aucun dollar n'a été envoyé. Si votre {methode} a été débité, envoyez-moi le message de confirmation : je vérifie et je vous rembourse.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} pa t reyisi, nou pa voye okenn dola. Si yo te retire kòb sou {methode} ou a, voye mesaj konfimasyon an ban mwen : m ap verifye epi ranbouse w.`,
      },
    },
  },
  {
    id: 'cancelled_ack',
    category: 'apres',
    label: 'Confirmer l’annulation',
    hint: 'La commande est annulée : rien n’a été prélevé.',
    color: 'neutral',
    recommendedFor: ['cancelled'],
    availableFor: ['cancelled'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} est annulée, et aucun montant ne vous a été prélevé. Si vous souhaitez recharger votre compte Meru plus tard, vous pouvez créer une nouvelle commande à tout moment : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} anile, epi nou pa retire okenn kòb sou ou. Si w vle rechaje kont Meru ou pita, ou ka fè yon nouvo kòmand nenpòt ki lè : {lien_accueil}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que votre journée se passe bien. 😊\n\nJe vous confirme que votre commande {reference} est bien annulée, et que rien ne vous a été prélevé.\n\nQuand vous voudrez recharger votre compte Meru, il suffira de refaire une commande : {lien_accueil}\n\nEt si une question vous vient, écrivez-moi simplement ici.`,
        ht: `Alo {prenom}, se {moi}. M espere w ap pase yon bon jounen. 😊\n\nM ap fè w konnen kòmand ou {reference} anile, epi nou pa retire okenn kòb sou ou.\n\nNenpòt lè w vle rechaje kont Meru ou, ou jis bezwen fè yon nouvo kòmand : {lien_accueil}\n\nSi w gen yon kesyon, pa ezite ekri m.`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} ! 😊\n\nC'est fait : votre commande {reference} est bien annulée, et rien ne vous a été prélevé, pas même une gourde. 👌\n\nLe jour où l'envie de dollars vous reprendra, pas besoin de chercher loin, c'est ici que ça se passe : {lien_accueil} 😄`,
        ht: `Alo {prenom}, se {moi} ! 😊\n\nSa fèt : kòmand ou {reference} anile, epi nou pa retire okenn kòb sou ou, pa menm yon goud. 👌\n\nJou w anvi dola ankò, pa bezwen chache lwen, se isit la sa ap pase : {lien_accueil} 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} est annulée, rien n'a été prélevé. Nouvelle commande quand vous voulez : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} anile, nou pa retire okenn kòb sou ou. Ou ka fè yon lòt lè w vle : {lien_accueil}`,
      },
    },
  },
  {
    id: 'come_back_bonus',
    category: 'apres',
    label: 'Inviter à revenir, avec un petit bonus',
    hint: 'Donner envie de refaire la recharge.',
    color: 'primary',
    recommendedFor: [],
    availableFor: ['expired', 'cancelled', 'failed'],
    warning: 'Promet un petit bonus sur la prochaine recharge : envoyez-le seulement si vous le donnerez vraiment.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} n'a pas pu aller jusqu'au bout. Si vous souhaitez toujours recharger votre compte Meru, j'ajouterai avec plaisir un petit bonus à votre prochaine recharge.\n\nIl vous suffit de refaire une commande ici : {lien_accueil}\n\nUne fois la commande faite, répondez simplement à ce message pour que j'ajoute votre bonus.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} pa t ka boukle. Si w toujou vle rechaje kont Meru ou, m ap kontan ajoute yon ti bonis sou pwochen rechaj ou a.\n\nOu jis bezwen refè yon kòmand isit la : {lien_accueil}\n\nLè w fin fè l, jis reponn mesaj sa a pou m ka ajoute bonis ou.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'ai une petite attention pour vous. 😊\n\nJ'ai vu que votre commande {reference} n'a pas pu aller jusqu'au bout. Si vous avez toujours besoin de dollars sur votre compte Meru, refaites votre recharge et j'y ajouterai avec plaisir un petit bonus.\n\nVoici le lien pour commander : {lien_accueil}\n\nUne fois la commande faite, écrivez-moi ici pour que j'ajoute votre bonus. À très vite ! 🤝`,
        ht: `Alo {prenom}, se {moi}. M gen yon bon nouvèl pou ou. 😊\n\nMwen wè kòmand ou {reference} pa t ka boukle. Si w toujou bezwen dola sou kont Meru ou, m ta renmen fè yon ti jès pou ou : refè rechaj ou a epi m ap mete yon ti bonis sou li.\n\nMen lyen pou w kòmande a : {lien_accueil}\n\nLè w fin fè kòmand lan, voye yon ti mesaj ban mwen pou m ka mete bonis ou. A byento ! 🤝`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi}, avec une petite surprise ! 🎁\n\nVotre commande {reference} n'est pas allée jusqu'au bout ? Pas grave, je vous propose un marché : refaites votre recharge, et j'y ajoute un petit bonus ! 😄\n\nC'est par ici : {lien_accueil}\n\nUne fois la commande passée, faites-moi signe ici pour que votre bonus ne m'échappe pas. 😉`,
        ht: `Sak pase {prenom}, se {moi}, m pote yon ti sipriz pou ou ! 🎁\n\nKòmand ou {reference} pa t ka boukle ? Pa gen pwoblèm, m gen yon ti kontra pou ou : refè rechaj ou a, epi m ap mete yon ti bonis sou li ! 😄\n\nMen kote pou w kòmande : {lien_accueil}\n\nLè w fin fè kòmand lan, fè m yon ti siy pou m pa bliye bonis ou. 😉`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre commande {reference} n'a pas abouti. Si vous refaites votre recharge, j'y ajoute un petit bonus : {lien_accueil}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand ou {reference} pa t boukle. Si w refè rechaj ou a, m ap ajoute yon ti bonis : {lien_accueil}`,
      },
    },
  },
];
