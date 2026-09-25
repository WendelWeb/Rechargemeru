import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Messages pour rassurer un client qui hésite ou qui découvre le service. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'trust_explain',
    category: 'confiance',
    label: 'Expliquer qui nous sommes',
    hint: 'Pour un client qui hésite à envoyer son argent.',
    color: 'neutral',
    recommendedFor: [],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\n{entreprise} est un service tenu par une vraie personne, en Haïti. Avant tout envoi, je vérifie votre paiement directement auprès de {methode}, puis les dollars partent uniquement sur votre compte Meru {compte_meru}.\n\nVous pouvez suivre votre commande à tout moment ici : {lien_suivi}\n\nPour toute question, je vous réponds sur WhatsApp ({heures}).`,
        ht: `Bonjou {prenom}, se {moi}.\n\n{entreprise}, se yon vrè moun ann Ayiti k ap jere l. Anvan m voye anyen, m tcheke peman ou a dirèkteman sou {methode}, epi dola yo ale sèlman sou kont Meru ou {compte_meru}.\n\nOu ka swiv kòmand ou a nenpòt lè nan lyen sa a : {lien_suivi}\n\nSi w gen kesyon, m ap reponn ou sou WhatsApp ({heures}).`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien 😊\n\nC'est normal d'hésiter avant d'envoyer son argent, alors laissez-moi vous rassurer : derrière {entreprise}, il y a une vraie personne, en Haïti, qui s'occupe de chaque commande. Je vérifie votre paiement directement auprès de {methode} avant tout envoi, et vos dollars vont uniquement sur votre compte Meru {compte_meru}.\n\nVous pouvez suivre votre commande quand vous voulez : {lien_suivi}\n\nJe suis là pour vous sur WhatsApp ({heures}) : écrivez-moi en toute simplicité 🙏`,
        ht: `Alo {prenom}, se {moi}. M espere w anfòm 😊\n\nSe nòmal pou w ezite anvan w voye kòb ou, m konprann sa. Men sa pou w konnen : {entreprise}, se yon vrè moun ann Ayiti k ap okipe chak kòmand. M tcheke peman ou a dirèkteman sou {methode} anvan m voye anyen, epi dola w yo ale sèlman sou kont Meru ou {compte_meru}.\n\nOu ka swiv kòmand ou a lè w vle : {lien_suivi}\n\nM la pou ou sou WhatsApp ({heures}), pa jennen ekri m 🙏`,
      },
      fun: {
        fr: `Allô {prenom}, ici {moi} ! 👋\n\n{entreprise}, ce n'est pas un grand bureau quelque part à l'étranger : c'est une vraie personne, en Haïti, avec son téléphone et son café ☕. Je vérifie d'abord votre paiement directement auprès de {methode}, et tant que ce n'est pas confirmé, pas un dollar ne bouge. Ensuite, vos dollars filent tout droit sur votre compte Meru {compte_meru}, et nulle part ailleurs.\n\nVotre commande se suit à tout moment, même en pyjama : {lien_suivi}\n\nEt si vous m'écrivez ({heures}), c'est bien moi qui vous réponds 😄`,
        ht: `Sak pase {prenom}, se {moi} ! 👋\n\n{entreprise}, se pa yon gwo biwo yon kote lòt bò dlo : se yon moun an chè e an zo ann Ayiti, ak telefòn li nan men l ak ti kafe l ☕. Anvan tout bagay, m tcheke peman ou a dirèkteman sou {methode}, epi toutotan sa pa konfime, pa gen yon sèl dola ki bouje. Apre sa, dola w yo kouri tou dwat sou kont Meru ou {compte_meru}, yo pa pase okenn lòt kote.\n\nOu ka swiv kòmand ou a nenpòt lè, menm si w poko soti nan kabann : {lien_suivi}\n\nEpi si w ekri m ({heures}), se mwen menm k ap reponn ou 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nUne vraie personne, en Haïti, vérifie votre paiement {methode} avant d'envoyer les dollars sur votre compte Meru {compte_meru}.\n\nUne question ? Je réponds ici ({heures}). Suivi à tout moment : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nSe yon vrè moun ann Ayiti k ap tcheke peman {methode} ou a anvan dola yo ale sou kont Meru ou {compte_meru}.\n\nOu gen kesyon ? Ekri m isit la ({heures}). Swiv kòmand lan nenpòt lè : {lien_suivi}`,
      },
    },
  },
  {
    id: 'how_it_works',
    category: 'confiance',
    label: 'Expliquer comment ça marche',
    hint: 'Les trois étapes, en mots simples.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'cancelled', 'failed'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVoici comment fonctionne {entreprise}, en trois étapes :\n\n1. Vous choisissez le montant en dollars. Vous voyez le total en gourdes avant de payer.\n2. Vous payez avec MonCash ou NatCash.\n3. Vous recevez les dollars sur votre compte Meru, en général en {delai}.\n\nSi vous avez une question, je suis à votre disposition.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMen kijan {entreprise} mache, an twa etap :\n\n1. Ou chwazi konbyen dola ou vle. Ou wè total la an goud anvan w peye.\n2. Ou peye ak MonCash oswa NatCash.\n3. Ou resevwa dola yo sou kont Meru ou, anjeneral nan {delai}.\n\nSi w gen kesyon, m la pou m reponn ou.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que votre journée se passe bien 😊\n\nC'est plus simple qu'il n'y paraît, je vous explique :\n\n1. Vous choisissez combien de dollars vous voulez, et vous voyez le total en gourdes avant de payer.\n2. Vous payez avec MonCash ou NatCash.\n3. Les dollars arrivent sur votre compte Meru, en général en {delai}.\n\nSi quelque chose n'est pas clair, écrivez-moi : je suis là pour vous aider 🤝`,
        ht: `Alo {prenom}, se {moi}. M espere jounen an ap pase byen pou ou 😊\n\nLi pi senp pase sa w panse, m ap esplike w :\n\n1. Ou chwazi konbyen dola ou vle, epi ou wè total la an goud anvan w peye.\n2. Ou peye ak MonCash oswa NatCash.\n3. Dola yo rive sou kont Meru ou, anjeneral nan {delai}.\n\nSi gen yon bagay ki pa klè, ekri m non : m la pou m ede w 🤝`,
      },
      fun: {
        fr: `Bonjour bonjour {prenom}, ici {moi} !\n\nTrois petites étapes, c'est plus court qu'un morceau de kompa 🎶 :\n\n1️⃣ Vous choisissez combien de dollars vous voulez, et vous voyez le total en gourdes noir sur blanc avant de payer.\n2️⃣ Vous payez avec MonCash ou NatCash.\n3️⃣ Vos dollars sautent sur votre compte Meru, en général en {delai}. Ils sont toujours pressés d'arriver !\n\nUn pas vous échappe ? Écrivez-moi, je vous remets dans le rythme 😄`,
        ht: `Alo {prenom}, se {moi} !\n\nSe twa ti etap sèlman, pi kout pase yon mizik konpa 🎶 :\n\n1️⃣ Ou chwazi konbyen dola ou vle, epi total la an goud parèt klè anvan w peye.\n2️⃣ Ou peye ak MonCash oswa NatCash.\n3️⃣ Dola w yo sote sou kont Meru ou, anjeneral nan {delai}. Yo toujou prese rive !\n\nSi w pèdi yon pa, ekri m : m ap remete w nan ritm lan 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\n1. Vous choisissez le montant (vous voyez le total en gourdes avant de payer).\n2. Vous payez avec MonCash ou NatCash.\n3. Vous recevez les dollars sur Meru, en général en {delai}.`,
        ht: `Bonjou {prenom}, se {moi}.\n\n1. Ou chwazi konbyen dola ou vle (ou wè total la an goud anvan w peye).\n2. Ou peye ak MonCash oswa NatCash.\n3. Ou resevwa dola yo sou Meru, anjeneral nan {delai}.`,
      },
    },
  },
  {
    id: 'first_order_welcome',
    category: 'confiance',
    label: 'Souhaiter la bienvenue (première commande)',
    hint: 'Un mot d’accueil pour un nouveau client.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'paid', 'needs_review'],
    warning: 'Seulement pour la toute première commande de ce client.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nBienvenue parmi nous, et merci de nous faire confiance pour votre toute première commande, {reference}. Si vous avez la moindre question, je suis à votre disposition sur WhatsApp.\n\nVous pouvez suivre votre commande sur cette page : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nByenvini, epi mèsi paske w fè nou konfyans pou premye kòmand ou a, {reference}. Si w gen nenpòt kesyon, m la pou m reponn ou isit la sou WhatsApp.\n\nOu ka swiv kòmand ou a nan lyen sa a : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Bienvenue ! 😊\n\nMerci du fond du cœur de nous faire confiance pour votre première commande, {reference}. Vous pouvez la suivre à tout moment ici : {lien_suivi}\n\nSi une question vous vient, écrivez-moi simplement : je suis là pour vous accompagner 🤝`,
        ht: `Alo {prenom}, se {moi}. Byenvini ! 😊\n\nMèsi ak tout kè m paske w fè nou konfyans pou premye kòmand ou a, {reference}. Ou ka swiv li nenpòt lè nan lyen sa a : {lien_suivi}\n\nSi w gen nenpòt kesyon, ekri m isit la san jèn : m la pou ou 🤝`,
      },
      fun: {
        fr: `Bienvenue {prenom}, ici {moi} ! 🎉\n\nVotre toute première commande, {reference}, est bien enregistrée : merci de nous faire confiance ! Pour une première, on vous déroule le tapis rouge… virtuel, mais sincère 😄\n\nVous pouvez suivre tout ça ici : {lien_suivi}\n\nUne question, même toute petite ? Je suis là, écrivez-moi.`,
        ht: `Sak pase {prenom}, se {moi} ! Byenvini 🎉\n\nPremye kòmand ou a, {reference}, byen anrejistre : mèsi paske w fè nou konfyans ! Pou yon premye kòmand, nou woule tapi wouj la pou ou… se pa yon vrè tapi, men se ak tout kè nou 😄\n\nOu ka swiv tout bagay nan lyen sa a : {lien_suivi}\n\nOu gen yon kesyon, menm yon ti kesyon piti ? M la, ekri m.`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nBienvenue, et merci pour votre première commande, {reference}. Une question ? Répondez simplement à ce message.\n\nSuivi : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nByenvini, epi mèsi pou premye kòmand ou a, {reference}. Ou gen kesyon ? Ou mèt reponn mesaj sa a.\n\nSwiv kòmand lan : {lien_suivi}`,
      },
    },
  },
  {
    id: 'safety_tip',
    category: 'confiance',
    label: 'Conseil de sécurité (arnaques)',
    hint: 'Rappeler qu’on ne demande jamais de code secret.',
    color: 'caution',
    recommendedFor: [],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nUn rappel pour votre sécurité : nous ne vous demanderons *jamais* votre code secret (PIN) MonCash ou NatCash, votre mot de passe Meru, ni un code reçu par SMS. Si quelqu'un vous les demande, même en se présentant comme {entreprise}, c'est une arnaque : ne donnez rien et prévenez-moi.\n\nPour payer, utilisez uniquement la page officielle d'une commande sur notre site. Votre code PIN ou le code reçu par SMS, c'est vous qui le tapez, seulement sur l'écran MonCash ou NatCash qui s'ouvre quand vous appuyez sur le bouton de paiement, jamais dans un message ni pendant un appel.\n\nLa page de votre commande : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nYon ti rapèl pou sekirite w : nou p ap *janm* mande w kòd sekrè (PIN) MonCash oswa NatCash ou, modpas Meru ou, ni okenn kòd ou resevwa nan SMS. Si yon moun mande w sa, menm si l di l soti nan {entreprise}, se yon eskwokri : pa bay anyen, epi fè m konnen.\n\nPou w peye, sèvi sèlman ak paj ofisyèl yon kòmand sou sit nou an. Kòd PIN ou oswa kòd SMS la, se ou menm ki tape l, sèlman sou ekran MonCash oswa NatCash ki louvri lè w peze bouton peman an, pa janm nan yon mesaj ni pandan yon apèl.\n\nPaj kòmand ou a : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que tout va bien pour vous 😊\n\nJe tiens à ce que vous soyez en sécurité, alors un petit conseil : nous ne vous demanderons *jamais* votre code secret MonCash ou NatCash, votre mot de passe Meru, ni un code reçu par SMS. Si quelqu'un vous les demande, même en disant qu'il vient de {entreprise}, c'est une arnaque : ne donnez rien et écrivez-moi.\n\nPour payer, passez uniquement par la page officielle d'une commande sur notre site : votre code, c'est vous qui le tapez, sur l'écran MonCash ou NatCash qui s'ouvre quand vous appuyez sur le bouton de paiement, jamais dans un message ni pendant un appel. La page de votre commande : {lien_suivi}\n\nAu moindre doute, je suis là 🙏`,
        ht: `Alo {prenom}, se {moi}. M espere tout bagay ap mache byen pou ou 😊\n\nSekirite w enpòtan pou mwen, donk men yon ti konsèy : nou p ap *janm* mande w kòd sekrè MonCash oswa NatCash ou, modpas Meru ou, ni okenn kòd ou resevwa nan SMS. Si yon moun mande w sa, menm si l di l soti nan {entreprise}, se yon eskwokri : pa bay anyen, epi ekri m touswit.\n\nPou w peye, sèvi sèlman ak paj ofisyèl yon kòmand sou sit nou an : kòd ou a, se ou menm ki tape l, sou ekran MonCash oswa NatCash ki louvri lè w peze bouton peman an, pa janm nan yon mesaj ni pandan yon apèl. Paj kòmand ou a : {lien_suivi}\n\nSi w gen nenpòt dout, m la 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} 🔐\n\nPetit rappel sécurité, et là c'est sérieux : personne chez {entreprise} ne vous demandera *jamais* votre code secret MonCash ou NatCash, votre mot de passe Meru ou un code reçu par SMS. Quelqu'un vous les demande, même en utilisant notre nom ? C'est une arnaque : ne donnez rien et écrivez-moi.\n\nOn paie seulement depuis la page officielle d'une commande sur notre site, et votre code, vous le tapez vous-même sur l'écran MonCash ou NatCash qui s'ouvre avec le bouton de paiement. Pas dans un message, pas pendant un appel ! La page de votre commande : {lien_suivi}\n\nVotre PIN, c'est comme la recette du riz djon djon de la famille : ça reste à la maison 😉`,
        ht: `Alo {prenom}, se {moi} 🔐\n\nTi rapèl sekirite, e se pa jwe : pèsonn nan {entreprise} p ap *janm* mande w kòd sekrè MonCash oswa NatCash ou, modpas Meru ou, oswa yon kòd ou resevwa nan SMS. Yon moun mande w sa, menm si l sèvi ak non nou ? Se eskwokri : pa bay anyen, epi ekri m.\n\nPou peye, se sèlman nan paj ofisyèl yon kòmand sou sit nou an, epi kòd ou a, se ou menm ki tape l sou ekran MonCash oswa NatCash ki louvri lè w peze bouton peman an. Pa nan yon mesaj, pa pandan yon apèl ! Paj kòmand ou a : {lien_suivi}\n\nPIN ou se tankou resèt diri djondjon fanmi an : li rete lakay 😉`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nNous ne vous demanderons *jamais* votre code secret (PIN) MonCash ou NatCash, votre mot de passe Meru ni un code reçu par SMS : si quelqu'un le fait, c'est une arnaque. Un paiement se fait uniquement depuis la page officielle d'une commande, et c'est vous qui tapez votre code, sur l'écran MonCash ou NatCash ouvert par le bouton de paiement. Votre commande : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nNou p ap *janm* mande w kòd sekrè (PIN) MonCash oswa NatCash ou, modpas Meru ou, ni kòd ou resevwa nan SMS : si yon moun mande w sa, se yon eskwokri. Yon peman fèt sèlman nan paj ofisyèl yon kòmand, epi se ou menm ki tape kòd ou, sou ekran MonCash oswa NatCash ki louvri lè w peze bouton peman an. Kòmand ou a : {lien_suivi}`,
      },
    },
  },
];
