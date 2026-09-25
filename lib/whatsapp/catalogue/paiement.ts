import type { CatalogueEntry } from '@/lib/whatsapp/types';

/** Les messages une fois le paiement arrivé ou en vérification, avant que les dollars partent. */
export const ENTRIES: readonly CatalogueEntry[] = [
  {
    id: 'payment_received',
    category: 'paiement',
    label: 'Paiement reçu, envoi en cours',
    hint: 'Rassurer dès que l’argent est arrivé, avant d’envoyer les dollars.',
    color: 'primary',
    recommendedFor: ['paid'],
    availableFor: ['paid', 'needs_review'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJ'ai bien reçu votre paiement de {montant_recu} par {methode} pour la commande {reference}. J'envoie {montant_usd} sur votre compte Meru {compte_meru} et je vous écris dès que c'est parti.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen byen resevwa peman {montant_recu} ou fè ak {methode} pou kòmand {reference}. M ap voye {montant_usd} sou kont Meru ou {compte_meru}, epi m ap ekri w kou yo pati.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. J'espère que vous allez bien ! 😊\n\nBonne nouvelle : j'ai bien reçu votre paiement de {montant_recu} par {methode} pour la commande {reference}. Merci pour votre confiance !\n\nJe m'occupe maintenant d'envoyer vos {montant_usd} sur votre compte Meru {compte_meru}, et je vous préviens dès que c'est parti.`,
        ht: `Alo {prenom}, se {moi}. M espere w byen ! 😊\n\nBòn nouvèl : mwen byen resevwa peman {montant_recu} ou fè ak {methode} pou kòmand {reference}. Mèsi paske w fè nou konfyans !\n\nKounye a m pral voye {montant_usd} ou yo sou kont Meru ou {compte_meru}, epi m ap fè w konnen kou yo pati.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 🎉\n\nVotre paiement de {montant_recu} par {methode} est bien arrivé pour la commande {reference}. Vos {montant_usd} sont déjà en train de faire leurs valises, direction votre compte Meru {compte_meru}. ✈️\n\nJe vous écris dès qu'ils ont atterri. Merci pour votre confiance ! 😄`,
        ht: `Sak pase {prenom}, se {moi} ! 🎉\n\nPeman {montant_recu} ou fè ak {methode} pou kòmand {reference} byen rive. {montant_usd} ou yo gentan fè malèt yo, yo pare pou y al sou kont Meru ou {compte_meru}. ✈️\n\nM ap ekri w kou yo ateri. Mèsi paske w fè nou konfyans ! 😄`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPaiement de {montant_recu} bien reçu pour la commande {reference}. J'envoie {montant_usd} sur votre compte Meru {compte_meru} et je vous préviens dès que c'est fait.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen resevwa peman {montant_recu} ou a pou kòmand {reference}. M ap voye {montant_usd} sou kont Meru ou {compte_meru}, m ap di w kou sa fèt.`,
      },
    },
  },
  {
    id: 'confirm_meru_account',
    category: 'paiement',
    label: 'Faire confirmer le compte Meru',
    hint: 'À envoyer avant tout envoi : un virement Meru ne se rattrape pas.',
    color: 'caution',
    recommendedFor: ['paid', 'needs_review'],
    // « Avant d'envoyer vos dollars » : only while they have not left.
    availableFor: ['pending_payment', 'paid', 'needs_review'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nAvant d'envoyer vos {montant_usd}, je vous demande de confirmer ce compte Meru :\n\n{compte_meru}\n\nRépondez « oui » si c'est exact. Sinon, envoyez-moi la bonne adresse e-mail ou le bon nom d'utilisateur Meru. Un envoi vers un mauvais compte ne peut pas être annulé.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nAnvan m voye {montant_usd} ou yo, m ap mande w pou w konfime kont Meru sa a :\n\n{compte_meru}\n\nReponn « wi » si li kòrèk. Si se pa li, voye bon imèl oswa bon non itilizatè Meru a ban mwen. Si m voye sou yon kont ki pa bon, m p ap ka anile l.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Merci encore pour votre commande ! 😊\n\nJuste avant d'envoyer vos {montant_usd}, je voudrais vérifier avec vous le compte Meru que vous m'avez donné :\n\n{compte_meru}\n\nPouvez-vous me répondre « oui » si c'est bien le vôtre ? Sinon, envoyez-moi la bonne adresse e-mail ou le bon nom d'utilisateur. Un envoi Meru ne peut pas être annulé, alors mieux vaut s'en assurer ensemble. 🙏`,
        ht: `Alo {prenom}, se {moi}. Mèsi ankò pou kòmand ou a ! 😊\n\nAnvan m voye {montant_usd} ou yo, m ta renmen verifye avè w kont Meru ou te ban m nan :\n\n{compte_meru}\n\nÈske w ka reponn mwen « wi » si se kont pa w la vre ? Si se pa li, voye bon imèl oswa bon non itilizatè Meru a ban mwen. Lè m fin voye kòb sou Meru, m pa ka anile l, se pou sa m pito asire m avè w. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 👋\n\nAvant de faire partir vos {montant_usd}, j'ai besoin de votre feu vert ! 🚦 Pouvez-vous vérifier ce compte Meru ?\n\n{compte_meru}\n\nRépondez « oui » si c'est bien le vôtre. Sinon, envoyez-moi la bonne adresse e-mail ou le bon nom d'utilisateur. Un envoi Meru ne peut pas être annulé, alors on vérifie deux fois plutôt qu'une. 😉`,
        ht: `Alo {prenom}, se {moi} ! 👋\n\nAnvan {montant_usd} ou yo pran wout, m bezwen ou ban m go ! 🚦 Tanpri tcheke kont Meru sa a :\n\n{compte_meru}\n\nReponn « wi » si se kont pa w la. Si se pa li, voye bon imèl oswa bon non itilizatè Meru a ban mwen. Lè m fin voye kòb sou Meru, m pa ka anile l, kidonk nou tcheke de fwa. Prevwa pa kapon ! 😉`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci de confirmer votre compte Meru avant l'envoi de {montant_usd} :\n\n{compte_meru}\n\nRépondez « oui » si c'est exact, sinon envoyez-moi le bon compte. Un envoi Meru ne peut pas être annulé.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nTanpri konfime kont Meru ou anvan m voye {montant_usd} yo :\n\n{compte_meru}\n\nReponn « wi » si li kòrèk, sinon voye bon kont lan ban mwen. Yon transfè Meru pa ka anile.`,
      },
    },
  },
  {
    id: 'delay_apology',
    category: 'paiement',
    label: 'Prévenir d’un retard',
    hint: 'L’envoi prend plus de temps que prévu.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['paid', 'needs_review'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nVotre paiement de {montant_recu} pour la commande {reference} est bien reçu. L'envoi de vos {montant_usd} prend un peu plus de temps que d'habitude. Je ne vous oublie pas et je vous écris dès que c'est fait.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPeman {montant_recu} ou a pou kòmand {reference} byen rive. Sèlman, transfè {montant_usd} ou yo ap pran yon ti tan plis pase dabitid. M pa bliye w, m ap ekri w kou sa fèt.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Un petit mot pour vous rassurer.\n\nVotre paiement de {montant_recu} pour la commande {reference} est bien reçu. L'envoi de vos {montant_usd} prend simplement un peu plus de temps que d'habitude, et je m'en excuse.\n\nJe ne vous oublie pas : je m'en occupe et je vous écris dès que c'est fait. Merci pour votre patience. 🙏`,
        ht: `Alo {prenom}, se {moi}. Yon ti mo pou m rasire w.\n\nPeman {montant_recu} ou a pou kòmand {reference} byen rive. Se jis transfè {montant_usd} ou yo k ap pran yon ti tan plis pase dabitid, epi m mande w padon pou sa.\n\nM pa bliye w non, m sou sa, e m ap ekri w kou sa fèt. Mèsi pou pasyans ou. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi}, votre livreur de dollars ! 👋\n\nLa bonne nouvelle d'abord : votre paiement de {montant_recu} pour la commande {reference} est bien reçu. Petit bémol : l'envoi de vos {montant_usd} prend plus de temps que d'habitude. On dirait que vos dollars ont pris un tap-tap au lieu de l'avion. 🚌😅\n\nJe ne vous oublie pas et je vous écris dès que c'est fait. Merci pour votre patience ! 🙏`,
        ht: `Sak pase {prenom}, se {moi}, livrè dola w la ! 👋\n\nAnn kòmanse ak bòn nouvèl la : peman {montant_recu} ou a pou kòmand {reference} byen rive. Sèlman, {montant_usd} ou yo ap pran plis tan pase dabitid pou yo rive. Ou ta di yo pran yon taptap olye yo pran avyon. 🚌😅\n\nM pa bliye w non, m ap ekri w kou sa fèt. Mèsi pou pasyans ou ! 🙏`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPaiement de {montant_recu} bien reçu pour la commande {reference}. L'envoi de {montant_usd} prend un peu plus de temps que prévu, je vous écris dès que c'est fait.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPeman {montant_recu} ou a pou kòmand {reference} byen rive. Transfè {montant_usd} yo ap pran yon ti tan plis pase sa m te prevwa, m ap ekri w kou sa fèt.`,
      },
    },
  },
  {
    id: 'meru_blocked_retry',
    category: 'paiement',
    label: 'Envoi refusé par Meru, nouvelle tentative',
    hint: 'Meru bloque l’envoi — compte trop récent, plafond, vérification en cours.',
    color: 'caution',
    recommendedFor: [],
    availableFor: ['paid', 'needs_review'],
    warning: 'Le texte dit que le compte Meru vient d’être ouvert : ne l’envoyez que dans ce cas.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJ'ai bien reçu votre paiement de {montant_recu} et j'ai tenté l'envoi de {montant_usd} sur votre compte Meru {compte_meru}. Meru a refusé le transfert : votre compte vient d'être ouvert, et les comptes récents sont limités pendant les premières heures. Cela ne vient pas de vous, et votre argent est en sécurité chez moi.\n\nJe réessaie dans 24 heures et je vous écris dès que c'est passé. Si vous préférez être remboursé, dites-le-moi : je vous renvoie {montant_recu} sur votre {methode}.\n\nCommande {reference} · suivi : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen byen resevwa peman {montant_recu} ou a, epi m te eseye voye {montant_usd} sou kont Meru ou {compte_meru}. Meru refize transfè a : kont ou fèk louvri, epi kont ki fèk kreye yo gen yon limit pandan premye èdtan yo. Se pa fòt ou, epi kòb ou an sekirite avè m.\n\nM ap eseye ankò nan 24 èdtan epi m ap ekri w kou li pase. Si w pito m ranbouse w, di m sa : m ap voye {montant_recu} tounen sou {methode} ou a.\n\nKòmand {reference} · swivi : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je sais que vous attendez vos {montant_usd}, alors je préfère vous tenir au courant.\n\nVotre paiement de {montant_recu} est bien arrivé, mais Meru a refusé mon envoi vers {compte_meru} : votre compte vient d'être ouvert, et Meru limite les comptes récents pendant les premières heures. Vous n'y êtes pour rien, et votre argent est en sécurité avec moi. 🤝\n\nJe réessaie dans 24 heures et je vous écris dès que c'est passé. Si vous préférez être remboursé, dites-le-moi : je vous renvoie {montant_recu} sur votre {methode}.\n\nCommande {reference} · suivi : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}. M konnen w ap tann {montant_usd} ou yo, se pou sa m vle ba w nouvèl.\n\nPeman {montant_recu} ou a byen rive, men Meru bloke transfè m te fè sou {compte_meru} : kont ou fèk louvri, e Meru mete yon limit sou kont ki fèk kreye yo pandan premye èdtan yo. Se pa fòt ou ditou, epi kòb ou an sekirite avè m. 🤝\n\nM ap eseye ankò nan 24 èdtan, epi m ap ekri w kou li pase. Si w pito m ranbouse w, jis di m sa : m ap voye {montant_recu} tounen sou {methode} ou a.\n\nKòmand {reference} · swivi : {lien_suivi}`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 👋\n\nVotre paiement de {montant_recu} est bien reçu, et votre argent est en sécurité avec moi. Par contre, Meru a refusé l'envoi de vos {montant_usd} sur {compte_meru} : votre compte vient d'être ouvert, et les comptes tout neufs sont limités pendant les premières heures. Rien à voir avec vous !\n\nJe réessaie dans 24 heures, le temps que votre compte fasse ses premiers pas. 😊 Je vous écris dès que c'est passé. Vous préférez un remboursement ? Dites-le-moi et je vous renvoie {montant_recu} sur votre {methode}.\n\nCommande {reference} · suivi : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi} ! 👋\n\nPeman {montant_recu} ou a byen rive, e kòb ou an sekirite avè m. Sèlman, Meru refize transfè {montant_usd} yo sou {compte_meru} : kont ou fèk louvri, e kont tou nèf yo gen yon limit pandan premye èdtan yo. Se pa fòt ou ditou !\n\nM ap eseye ankò nan 24 èdtan, tan pou kont ou a fè premye pa l. 😊 M ap ekri w kou li pase. Ou pito m ranbouse w ? Di m sa, m ap voye {montant_recu} tounen sou {methode} ou a.\n\nKòmand {reference} · swivi : {lien_suivi}`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPaiement de {montant_recu} bien reçu, mais Meru a refusé l'envoi de {montant_usd} sur {compte_meru} : les comptes tout juste ouverts sont limités les premières heures. Votre argent est en sécurité : je réessaie dans 24 heures et je vous écris dès que c'est passé (ou je vous rembourse sur votre {methode} si vous préférez).\n\nCommande {reference} · suivi : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen resevwa peman {montant_recu} ou a, men Meru refize transfè {montant_usd} yo sou {compte_meru} : kont ki fèk louvri yo limite pandan premye èdtan yo. Kòb ou an sekirite : m ap eseye ankò nan 24 èdtan epi m ap ekri w kou li pase (oswa m ap ranbouse w sou {methode} ou a si w pito).\n\nKòmand {reference} · swivi : {lien_suivi}`,
      },
    },
  },
  {
    id: 'closed_hours',
    category: 'paiement',
    label: 'Hors des heures d’ouverture',
    hint: 'Commande arrivée la nuit : elle sera traitée demain entre 9 h et 21 h.',
    color: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'paid', 'needs_review'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nMerci pour votre commande {reference}. Nous sommes actuellement fermés : nos heures d'ouverture sont de 9 h à 21 h.\n\nVotre commande sera traitée dès demain à partir de 9 h, et je vous écris dès que vos {montant_usd} sont envoyés sur votre compte Meru. Si vous avez déjà payé, votre argent est en sécurité.\n\nSuivre la commande : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMèsi pou kòmand ou {reference}. Nou fèmen kounye a : nou louvri depi 9è dimaten rive 9è diswa.\n\nN ap okipe kòmand ou a demen depi 9è dimaten, epi m ap ekri w kou {montant_usd} ou yo pati sou kont Meru ou. Si w te deja peye, kòb ou an sekirite.\n\nSwiv kòmand lan : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Merci beaucoup pour votre commande {reference} ! 😊\n\nÀ cette heure-ci, c'est fermé : nous sommes ouverts de 9 h à 21 h. Votre commande est bien notée et je m'en occupe dès demain à partir de 9 h.\n\nJe vous écris dès que vos {montant_usd} sont envoyés sur votre compte Meru. Si vous avez déjà payé, votre argent est en sécurité : vous pouvez dormir tranquille. 🙏\n\nSuivre la commande : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}. Mèsi anpil pou kòmand ou {reference} ! 😊\n\nKounye a nou fèmen : nou louvri depi 9è dimaten rive 9è diswa. Kòmand ou a byen anrejistre, e m ap okipe l demen depi 9è dimaten.\n\nM ap ekri w kou {montant_usd} ou yo pati sou kont Meru ou. Si w te deja peye, kòb ou an sekirite : ou mèt dòmi trankil. 🙏\n\nSwiv kòmand lan : {lien_suivi}`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 🌙\n\nMerci pour votre commande {reference}. À cette heure-ci, la boutique a déjà fermé ses volets 😴 : nous sommes ouverts de 9 h à 21 h.\n\nDemain dès 9 h, café en main ☕, je m'occupe de votre commande et je vous écris dès que vos {montant_usd} sont envoyés sur votre compte Meru. Si vous avez déjà payé, votre argent est en sécurité.\n\nSuivre la commande : {lien_suivi}`,
        ht: `Sak pase {prenom}, se {moi} ! 🌙\n\nMèsi pou kòmand ou {reference}. A lè sa a, boutik la gentan fèmen pòt li 😴 : nou louvri depi 9è dimaten rive 9è diswa.\n\nDemen depi 9è dimaten, ak yon bon tas kafe nan men m ☕, m ap okipe kòmand ou a epi m ap ekri w kou {montant_usd} ou yo pati sou kont Meru ou. Si w te deja peye, kòb ou an sekirite.\n\nSwiv kòmand lan : {lien_suivi}`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nNous sommes fermés (ouverts de 9 h à 21 h) : votre commande {reference} sera traitée demain à partir de 9 h. Si vous avez déjà payé, votre argent est en sécurité.\n\nSuivi : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nNou fèmen kounye a (nou louvri depi 9è dimaten rive 9è diswa) : n ap okipe kòmand ou {reference} demen depi 9è dimaten. Si w te deja peye, kòb ou an sekirite.\n\nSwivi : {lien_suivi}`,
      },
    },
  },
  {
    id: 'delay_bonus',
    category: 'paiement',
    label: 'Excuses pour le retard, avec un bonus',
    hint: 'La recharge a pris du retard : s’excuser et annoncer le petit bonus ajouté.',
    color: 'primary',
    recommendedFor: [],
    availableFor: ['paid', 'needs_review', 'fulfilled'],
    warning: 'Annonce un bonus : ajoutez-le vraiment à l’envoi.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nToutes nos excuses pour le retard sur votre commande {reference}. Ce n'est pas le service que nous voulons vous offrir.\n\nPour nous faire pardonner, nous avons ajouté un petit bonus à votre recharge sur votre compte Meru {compte_meru}. Merci pour votre patience et votre confiance.\n\nSuivre la commande : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nNou mande w eskiz paske kòmand ou {reference} pran reta. Se pa konsa nou vle sèvi w.\n\nPou n repare sa, nou ajoute yon ti bonis nan rechaj ki ale sou kont Meru ou {compte_meru}. Mèsi pou pasyans ou ak konfyans ou.\n\nSwiv kòmand lan : {lien_suivi}`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je vous dois des excuses. 🙏\n\nVotre commande {reference} a pris du retard, et ce n'est pas le service que nous voulons vous offrir : vous méritez mieux.\n\nPour nous faire pardonner, nous avons ajouté un petit bonus à votre recharge sur votre compte Meru {compte_meru}. Merci du fond du cœur pour votre patience et votre confiance.\n\nSuivre la commande : {lien_suivi}`,
        ht: `Alo {prenom}, se {moi}. M mande w padon ak tout kè m. 🙏\n\nKòmand ou {reference} pran reta, e se pa konsa nou vle sèvi w : ou merite pi bon pase sa.\n\nPou n repare sa, nou ajoute yon ti bonis nan rechaj ki ale sou kont Meru ou {compte_meru}. Mèsi anpil anpil pou pasyans ou ak konfyans ou.\n\nSwiv kòmand lan : {lien_suivi}`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 🙈\n\nVotre commande {reference} a pris du retard : on a avancé moins vite qu'une voiture dans le blocus un vendredi soir. 😅 Toutes nos excuses, vous méritiez mieux que ça.\n\nPour nous faire pardonner, nous avons glissé un petit bonus dans votre recharge sur votre compte Meru {compte_meru}. 🎁 Merci pour votre patience et votre confiance !\n\nSuivre la commande : {lien_suivi}`,
        ht: `Sak pase {prenom}, se {moi} ! 🙈\n\nKòmand ou {reference} pran reta : nou mache pi dousman pase yon machin nan blokis vandredi swa. 😅 Nou mande w eskiz, se pa konsa nou vle sèvi w.\n\nPou n repare sa, nou glise yon ti bonis nan rechaj ki ale sou kont Meru ou {compte_meru}. 🎁 Mèsi pou pasyans ou ak konfyans ou !\n\nSwiv kòmand lan : {lien_suivi}`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nToutes nos excuses pour le retard sur votre commande {reference} : nous avons ajouté un petit bonus à votre recharge sur votre compte Meru {compte_meru}. Merci pour votre patience.\n\nSuivi : {lien_suivi}`,
        ht: `Bonjou {prenom}, se {moi}.\n\nNou mande w eskiz paske kòmand ou {reference} pran reta : nou ajoute yon ti bonis nan rechaj ki ale sou kont Meru ou {compte_meru}. Mèsi pou pasyans ou.\n\nSwivi : {lien_suivi}`,
      },
    },
  },
  {
    id: 'review_proof',
    category: 'paiement',
    label: 'Vérification en cours',
    hint: 'Le paiement demande un contrôle manuel.',
    color: 'caution',
    recommendedFor: ['needs_review'],
    availableFor: ['needs_review', 'paid'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe vérifie le paiement que vous avez fait par {methode} pour la commande {reference}. Ce n'est pas un refus : je veux simplement être certain avant d'envoyer vos {montant_usd}. Si vous avez le message de confirmation {methode}, envoyez-le-moi, cela ira plus vite.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nM ap verifye peman ou fè ak {methode} pou kòmand {reference}. Se pa yon refi : m jis vle asire m tout bagay anfòm anvan m voye {montant_usd} ou yo. Si w gen mesaj konfimasyon {methode} la, voye l ban mwen, sa ap fè bagay yo ale pi vit.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Merci pour votre commande ! 😊\n\nJe suis en train de vérifier le paiement {methode} de votre commande {reference}. Rassurez-vous, ce n'est pas un refus : je veux juste être certain de tout avant d'envoyer vos {montant_usd}.\n\nSi vous avez encore le message de confirmation {methode}, envoyez-le-moi ici, cela m'aidera à aller plus vite. Je vous tiens au courant !`,
        ht: `Alo {prenom}, se {moi}. Mèsi pou kòmand ou a ! 😊\n\nM ap verifye peman ou fè ak {methode} pou kòmand {reference}. Pa enkyete w, se pa yon refi : m jis vle asire m tout bagay anfòm anvan m voye {montant_usd} ou yo.\n\nSi w toujou gen mesaj konfimasyon {methode} la, voye l ban mwen la a, sa ap ede m ale pi vit. M ap fè w konnen kou m fini.`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 😊\n\nJ'ai sorti mes lunettes 🧐 pour un petit contrôle du paiement {methode} de votre commande {reference}. Ce n'est pas un refus, promis : je veux juste être certain avant d'envoyer vos {montant_usd}.\n\nVous avez le message de confirmation {methode} ? Envoyez-le-moi et ça ira plus vite. 🚀`,
        ht: `Sak pase {prenom}, se {moi} ! 😊\n\nM mete linèt mwen 🧐 pou m tcheke peman ou fè ak {methode} pou kòmand {reference}. Se pa yon refi, m pwomèt ou : m jis vle asire m tout bagay anfòm anvan m voye {montant_usd} ou yo.\n\nOu gen mesaj konfimasyon {methode} la toujou ? Voye l ban mwen, sa ap fè bagay yo ale pi vit. 🚀`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe vérifie votre paiement {methode} pour la commande {reference} avant d'envoyer {montant_usd} (ce n'est pas un refus). Envoyez-moi le message de confirmation {methode} si vous l'avez.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nM ap verifye peman {methode} ou a pou kòmand {reference} anvan m voye {montant_usd} yo (se pa yon refi). Voye mesaj konfimasyon {methode} la ban mwen si w genyen l.`,
      },
    },
  },
  {
    id: 'amount_mismatch',
    category: 'paiement',
    label: 'Montant reçu différent',
    hint: 'Le montant encaissé ne correspond pas au devis.',
    color: 'caution',
    recommendedFor: [],
    availableFor: ['needs_review', 'paid'],
    warning: 'À n’envoyer que si le client a payé MOINS que le total.',
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nPour la commande {reference}, j'ai reçu {montant_recu} alors que le total était de {montant_htg}. Dites-moi comment vous souhaitez procéder : compléter la différence, ou ajuster le montant en dollars envoyé sur votre compte Meru.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nPou kòmand {reference}, mwen resevwa {montant_recu} men total la se te {montant_htg}. Di m kijan ou vle nou fè : konplete diferans lan, oswa ajiste kantite dola m ap voye sou kont Meru ou a.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je vous écris au sujet de votre commande {reference}.\n\nJ'ai reçu {montant_recu}, alors que le total était de {montant_htg}. Pas de souci, on va trouver la solution ensemble. Qu'est-ce qui vous arrange le mieux ?\n\n1. Compléter la différence\n2. Ajuster le montant en dollars envoyé sur votre compte Meru\n\nRépondez simplement 1 ou 2. 🙏`,
        ht: `Alo {prenom}, se {moi}. M ap ekri w pou kòmand ou {reference}.\n\nMwen resevwa {montant_recu}, men total la se te {montant_htg}. Pa gen pwoblèm, n ap jwenn yon solisyon ansanm. Kisa ki pi bon pou ou ?\n\n1. Konplete diferans lan\n2. Ajiste kantite dola m ap voye sou kont Meru ou a\n\nJis reponn 1 oswa 2. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi} ! 👋\n\nPour la commande {reference}, j'ai reçu {montant_recu} alors que le total était de {montant_htg}. Ça arrive, on s'arrange facilement. Comment voulez-vous faire ?\n\n1️⃣ Compléter la différence\n2️⃣ Ajuster le montant en dollars envoyé sur votre compte Meru\n\nRépondez 1 ou 2 et je m'occupe du reste. 😊`,
        ht: `Alo {prenom}, se {moi} ! 👋\n\nPou kòmand {reference}, mwen resevwa {montant_recu} men total la se te {montant_htg}. Sa konn rive, n ap regle sa fasil. Kijan ou vle nou fè ?\n\n1️⃣ Konplete diferans lan\n2️⃣ Ajiste kantite dola m ap voye sou kont Meru ou a\n\nReponn 1 oswa 2, m ap okipe rès la. 😊`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nCommande {reference} : j'ai reçu {montant_recu}, mais le total était de {montant_htg}. Préférez-vous compléter la différence, ou que j'ajuste les dollars envoyés sur votre compte Meru ?`,
        ht: `Bonjou {prenom}, se {moi}.\n\nKòmand {reference} : mwen resevwa {montant_recu}, men total la se te {montant_htg}. Ou pito konplete diferans lan, oswa ou pito m ajiste kantite dola m ap voye sou kont Meru ou a ?`,
      },
    },
  },
  {
    id: 'refund_announced',
    category: 'paiement',
    label: 'Annoncer un remboursement',
    hint: 'L’envoi est impossible : prévenir avant de rembourser.',
    color: 'caution',
    recommendedFor: [],
    availableFor: ['needs_review', 'paid', 'failed'],
    text: {
      classique: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe ne peux pas envoyer les dollars de votre commande {reference}. Je vous rembourse donc {montant_recu} sur le numéro {methode} qui a payé. Vous recevrez une confirmation dès que c'est fait.\n\nToutes mes excuses pour ce désagrément.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen pa ka voye dola kòmand ou {reference} yo. Kidonk m ap ranbouse w {montant_recu} sou nimewo {methode} ki te peye a. W ap resevwa yon konfimasyon kou sa fèt.\n\nPadon pou deranjman an.`,
      },
      chaleureux: {
        fr: `Bonjour {prenom}, ici {moi}. Je tenais à vous prévenir moi-même.\n\nJe ne peux malheureusement pas envoyer les dollars de votre commande {reference}, et j'en suis vraiment désolé. Je vous rembourse {montant_recu} sur le numéro {methode} qui a payé.\n\nVous recevrez une confirmation dès que c'est fait. Si vous avez la moindre question, je suis là pour vous. 🙏`,
        ht: `Alo {prenom}, se {moi}. M te vle di w sa mwen menm.\n\nMalerezman, m pa ka voye dola kòmand ou {reference} yo, e m regrèt sa anpil. M ap ranbouse w {montant_recu} sou nimewo {methode} ki te peye a.\n\nW ap resevwa yon konfimasyon kou sa fèt. Si w gen nenpòt kesyon, m la pou ou. 🙏`,
      },
      fun: {
        fr: `Bonjour {prenom}, ici {moi}. 👋\n\nJe préfère vous le dire tout de suite : je ne peux pas envoyer les dollars de votre commande {reference}. Je vous rembourse {montant_recu} sur le numéro {methode} qui a payé, et vous recevrez une confirmation dès que c'est fait.\n\nToutes mes excuses pour ce contretemps. Si vous voulez réessayer un autre jour, je serai ravi de vous aider. 😊`,
        ht: `Alo {prenom}, se {moi}. 👋\n\nM pito di w sa touswit : m pa ka voye dola kòmand ou {reference} yo. M ap ranbouse w {montant_recu} sou nimewo {methode} ki te peye a, epi w ap resevwa yon konfimasyon kou sa fèt.\n\nPadon pou deranjman sa a. Si w vle eseye ankò yon lòt jou, m ap kontan ede w. 😊`,
      },
      direct: {
        fr: `Bonjour {prenom}, ici {moi}.\n\nJe ne peux pas envoyer les dollars de votre commande {reference} : je vous rembourse {montant_recu} sur le numéro {methode} qui a payé. Vous recevrez une confirmation dès que c'est fait.`,
        ht: `Bonjou {prenom}, se {moi}.\n\nMwen pa ka voye dola kòmand ou {reference} yo : m ap ranbouse w {montant_recu} sou nimewo {methode} ki te peye a. W ap resevwa yon konfimasyon kou sa fèt.`,
      },
    },
  },
];
