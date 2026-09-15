/**
 * lib/admin/whatsapp-messages.ts — ce que l'opérateur peut écrire, et quand.
 *
 * Les messages automatiques partent par email ; WhatsApp, lui, est manuel :
 * un lien `wa.me` prérempli que l'opérateur ouvre depuis son propre téléphone.
 * Ce choix n'est pas un pis-aller. Le message part de son vrai numéro, que le
 * client peut rappeler, et il ne demande ni compte d'entreprise, ni document,
 * ni approbation de Meta.
 *
 * Ce fichier est le catalogue. Il est PUR — pas de base, pas de réseau — pour
 * que le texte exact qu'un client va lire soit vérifiable par un test plutôt
 * que découvert en production.
 *
 * TROIS RÈGLES DE RÉDACTION, tenues par les tests en bas de `messages.test` :
 *
 *   1. LA LANGUE EST CELLE DU CLIENT. Chaque message existe en français et en
 *      kreyòl, et c'est `order.locale` qui tranche — jamais la langue de
 *      l'administration.
 *   2. AUCUN MESSAGE NE PROMET CE QUI N'EST PAS VRAI. Un message qui AFFIRME
 *      un fait — les dollars sont partis, le remboursement est fait — n'est
 *      proposé que dans l'état où ce fait est vrai (`availableFor`). Un
 *      message qui DEMANDE quelque chose peut être plus large.
 *   3. UNE COMMANDE DE TEST NE REÇOIT RIEN. En mode bac à sable, aucun
 *      message n'est proposé : écrire à quelqu'un au sujet d'argent fictif est
 *      la meilleure façon de perdre sa confiance.
 *
 * Les messages « conseillés » sont ceux qui correspondent à l'état de la
 * commande ; les autres restent accessibles, parce que la vraie vie déborde
 * toujours de la machine à états.
 */
import { formatDateTime, formatHtg, formatUsd } from '@/lib/format';
import type { GatewayMode, Locale, OrderRow, OrderStatus } from '@/lib/orders/types';

/** Les intentions possibles. L'identifiant sert aussi de clé au journal. */
export const WHATSAPP_MESSAGE_IDS = [
  'payment_reminder',
  'payment_help',
  'payment_proof',
  'expired_restart',
  'payment_received',
  'confirm_meru_account',
  'delay_apology',
  'review_proof',
  'amount_mismatch',
  'fulfilled',
  'ask_confirmation',
  'refund_announced',
  'refund_done',
  'failed_explained',
  'free_text',
] as const;

export type WhatsAppMessageId = (typeof WHATSAPP_MESSAGE_IDS)[number];

export type WhatsAppMessage = {
  id: WhatsAppMessageId;
  /** Ce que l'opérateur lit dans le menu, en français. */
  label: string;
  /** Une ligne disant à quoi ça sert, pour choisir sans se tromper. */
  hint: string;
  /** Le texte exact envoyé au client, dans SA langue. */
  body: string;
  /** Vrai quand ce message correspond à l'état actuel de la commande. */
  recommended: boolean;
  /** Teinte du bouton : l'action évidente du moment est mise en avant. */
  tone: 'primary' | 'neutral' | 'caution';
};

export type WhatsAppMessageContext = {
  businessName: string;
  /** Racine publique, pour les liens de suivi. Sans barre oblique finale. */
  siteUrl: string;
};

type Draft = {
  id: WhatsAppMessageId;
  label: string;
  hint: string;
  tone: WhatsAppMessage['tone'];
  /** États pour lesquels ce message est le bon réflexe. */
  recommendedFor: readonly OrderStatus[];
  /** États où il reste proposé, plus bas dans le menu. Vide = partout. */
  availableFor?: readonly OrderStatus[];
  fr: (v: Vars) => string;
  ht: (v: Vars) => string;
};

type Vars = {
  prenom: string;
  nomComplet: string;
  reference: string;
  usd: string;
  htgDu: string;
  htgRecu: string;
  methode: string;
  meru: string;
  meruRef: string;
  suivi: string;
  business: string;
  expire: string;
  transaction: string;
};

/** « Jean Baptiste » → « Jean ». Un prénom seul sonne juste, pas familier. */
function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? '';
  return first || full.trim();
}

const METHOD_LABEL: Record<OrderRow['method'], string> = {
  moncash: 'MonCash',
  natcash: 'NatCash',
};

function variables(order: OrderRow, ctx: WhatsAppMessageContext): Vars {
  return {
    prenom: firstName(order.customerName),
    nomComplet: order.customerName.trim(),
    reference: order.reference,
    usd: formatUsd(order.fulfilledUsdCents ?? order.usdCents, order.locale as Locale),
    htgDu: formatHtg(order.totalHtg),
    htgRecu: formatHtg(order.paidHtg ?? order.totalHtg),
    methode: METHOD_LABEL[order.method],
    meru: order.meruAccount,
    meruRef: order.meruReference ?? '',
    suivi: `${ctx.siteUrl}/${order.locale}/commande/${order.reference}`,
    business: ctx.businessName,
    expire: formatDateTime(order.expiresAt),
    transaction: order.providerTransactionId ?? '',
  };
}

/**
 * Le catalogue. L'ordre compte : à état égal, le premier est celui que
 * l'opérateur ouvre le plus souvent.
 */
const CATALOGUE: readonly Draft[] = [
  {
    id: 'payment_reminder',
    label: 'Rappel de paiement',
    hint: 'La commande attend toujours son paiement.',
    tone: 'primary',
    recommendedFor: ['pending_payment'],
    availableFor: ['pending_payment', 'expired'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Votre commande ${v.reference} attend encore son paiement de ${v.htgDu} par ${v.methode}. ` +
      `Dès que le paiement arrive, j'envoie ${v.usd} sur votre compte Meru.\n\n` +
      `Suivre la commande : ${v.suivi}`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Kòmand ou ${v.reference} ap tann peman ${v.htgDu} ak ${v.methode} toujou. ` +
      `Kou peman an rive, m ap voye ${v.usd} sou kont Meru ou.\n\n` +
      `Swiv kòmand lan : ${v.suivi}`,
  },
  {
    id: 'payment_help',
    label: 'Proposer de l’aide pour payer',
    hint: 'Le client semble bloqué au moment de payer.',
    tone: 'neutral',
    recommendedFor: [],
    availableFor: ['pending_payment', 'expired', 'failed', 'cancelled'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `J'ai vu que votre commande ${v.reference} n'est pas encore payée. ` +
      `Est-ce que vous rencontrez un souci avec ${v.methode} ? Dites-moi et je vous guide.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Mwen wè kòmand ou ${v.reference} poko peye. ` +
      `Èske w gen yon pwoblèm ak ${v.methode} ? Di m epi m ap ede w.`,
  },
  {
    id: 'payment_proof',
    label: 'Demander la preuve de paiement',
    hint: 'Vous soupçonnez un paiement que le système n’a pas vu.',
    tone: 'caution',
    recommendedFor: ['expired'],
    availableFor: ['pending_payment', 'expired', 'needs_review', 'failed'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Je ne vois pas encore le paiement de votre commande ${v.reference} (${v.htgDu} par ${v.methode}). ` +
      `Si vous avez bien payé, envoyez-moi une capture du message de confirmation ${v.methode}, ` +
      `avec le numéro de transaction. Je vérifie et je débloque tout de suite.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Mwen poko wè peman kòmand ou ${v.reference} (${v.htgDu} ak ${v.methode}). ` +
      `Si w te peye vre, voye yon foto mesaj konfimasyon ${v.methode} a ban mwen, ` +
      `ak nimewo tranzaksyon an. M ap verifye epi regle sa touswit.`,
  },
  {
    id: 'expired_restart',
    label: 'Commande expirée, recommencer',
    hint: 'Le délai est passé sans paiement : inviter à refaire une commande.',
    tone: 'primary',
    recommendedFor: ['expired', 'cancelled'],
    availableFor: ['expired', 'cancelled', 'failed'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Votre commande ${v.reference} a expiré sans paiement, elle n'est donc plus valable. ` +
      `Aucun montant ne vous a été prélevé. Vous pouvez en créer une nouvelle quand vous voulez : ` +
      `${v.suivi.replace(/\/commande\/.*$/, '')}\n\n` +
      `Le taux du jour peut avoir changé, le nouveau total s'affichera avant de payer.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Kòmand ou ${v.reference} ekspire san peman, li pa valab ankò. ` +
      `Nou pa retire okenn kòb sou ou. Ou ka fè yon lòt lè w vle : ` +
      `${v.suivi.replace(/\/commande\/.*$/, '')}\n\n` +
      `To jounen an ka chanje, nouvo total la ap parèt anvan w peye.`,
  },
  {
    id: 'payment_received',
    label: 'Paiement reçu, envoi en cours',
    hint: 'Rassurer dès que l’argent est arrivé, avant d’envoyer les dollars.',
    tone: 'primary',
    recommendedFor: ['paid'],
    availableFor: ['paid', 'needs_review'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `J'ai bien reçu votre paiement de ${v.htgRecu} par ${v.methode} pour la commande ${v.reference}. ` +
      `J'envoie ${v.usd} sur votre compte Meru ${v.meru} et je vous écris dès que c'est parti.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Mwen byen resevwa peman ${v.htgRecu} ou a ak ${v.methode} pou kòmand ${v.reference}. ` +
      `M ap voye ${v.usd} sou kont Meru ou ${v.meru} epi m ap ekri w kou li pati.`,
  },
  {
    id: 'confirm_meru_account',
    label: 'Faire confirmer le compte Meru',
    hint: 'À envoyer avant tout envoi : un virement Meru ne se rattrape pas.',
    tone: 'caution',
    recommendedFor: ['paid', 'needs_review'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Avant d'envoyer vos ${v.usd}, je vous demande de confirmer ce compte Meru :\n\n` +
      `${v.meru}\n\n` +
      `Répondez « oui » si c'est exact, ou envoyez-moi le bon identifiant. ` +
      `Un envoi vers un mauvais compte ne peut pas être annulé.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Anvan m voye ${v.usd} ou yo, m mande w konfime kont Meru sa a :\n\n` +
      `${v.meru}\n\n` +
      `Reponn « wi » si li kòrèk, oswa voye bon idantifyan an ban mwen. ` +
      `Yon voye sou yon move kont pa ka anile.`,
  },
  {
    id: 'delay_apology',
    label: 'Prévenir d’un retard',
    hint: 'L’envoi prend plus de temps que prévu.',
    tone: 'neutral',
    recommendedFor: [],
    availableFor: ['paid', 'needs_review'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Votre paiement de ${v.htgRecu} est bien reçu pour la commande ${v.reference}. ` +
      `L'envoi de ${v.usd} prend un peu plus de temps que d'habitude. ` +
      `Je ne vous oublie pas et je vous écris dès que c'est fait.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Peman ${v.htgRecu} ou a byen rive pou kòmand ${v.reference}. ` +
      `Voye ${v.usd} yo ap pran yon ti tan anplis pase abitid. ` +
      `M pa bliye w, m ap ekri w kou sa fèt.`,
  },
  {
    id: 'review_proof',
    label: 'Vérification en cours',
    hint: 'Le paiement demande un contrôle manuel.',
    tone: 'caution',
    recommendedFor: ['needs_review'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Je vérifie le paiement de votre commande ${v.reference} avec ${v.methode}. ` +
      `Ce n'est pas un refus : je veux être certain avant d'envoyer vos ${v.usd}. ` +
      `Si vous avez le message de confirmation ${v.methode}, envoyez-le moi, ça ira plus vite.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `M ap verifye peman kòmand ou ${v.reference} ak ${v.methode}. ` +
      `Se pa yon refi : m vle sèten anvan m voye ${v.usd} ou yo. ` +
      `Si w gen mesaj konfimasyon ${v.methode} a, voye l ban mwen, sa ap pi rapid.`,
  },
  {
    id: 'amount_mismatch',
    label: 'Montant reçu différent',
    hint: 'Le montant encaissé ne correspond pas au devis.',
    tone: 'caution',
    recommendedFor: [],
    availableFor: ['needs_review', 'paid'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Pour la commande ${v.reference}, j'ai reçu ${v.htgRecu} alors que le total était de ${v.htgDu}. ` +
      `Dites-moi comment vous voulez qu'on procède : compléter la différence, ` +
      `ou ajuster le montant en dollars envoyé sur Meru.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Pou kòmand ${v.reference}, mwen resevwa ${v.htgRecu} men total la se te ${v.htgDu}. ` +
      `Di m kijan ou vle nou fè : konplete diferans lan, ` +
      `oswa ajiste kantite dola m ap voye sou Meru a.`,
  },
  {
    id: 'fulfilled',
    label: 'Dollars envoyés',
    hint: 'L’envoi Meru est fait.',
    tone: 'primary',
    recommendedFor: ['fulfilled'],
    availableFor: ['fulfilled'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `C'est fait : ${v.usd} ont été envoyés sur votre compte Meru ${v.meru}` +
      `${v.meruRef ? ` (référence Meru ${v.meruRef})` : ''}. ` +
      `Vérifiez votre solde dans l'application Meru.\n\n` +
      `Merci de votre confiance. Commande ${v.reference}.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Li fèt : ${v.usd} voye sou kont Meru ou ${v.meru}` +
      `${v.meruRef ? ` (referans Meru ${v.meruRef})` : ''}. ` +
      `Tcheke balans ou nan aplikasyon Meru a.\n\n` +
      `Mèsi paske w fè nou konfyans. Kòmand ${v.reference}.`,
  },
  {
    id: 'ask_confirmation',
    label: 'Demander confirmation de réception',
    hint: 'S’assurer que les dollars sont bien arrivés.',
    tone: 'neutral',
    recommendedFor: [],
    availableFor: ['fulfilled'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Est-ce que vous voyez bien les ${v.usd} sur votre compte Meru ${v.meru} ? ` +
      `Répondez-moi pour confirmer, et si quelque chose cloche je m'en occupe.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Èske w wè ${v.usd} yo sou kont Meru ou ${v.meru} ? ` +
      `Reponn mwen pou konfime, epi si gen yon bagay ki pa bon m ap regle l.`,
  },
  {
    id: 'refund_announced',
    label: 'Annoncer un remboursement',
    hint: 'L’envoi est impossible : prévenir avant de rembourser.',
    tone: 'caution',
    recommendedFor: [],
    availableFor: ['needs_review', 'paid', 'failed'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Je ne peux pas envoyer les dollars de votre commande ${v.reference}. ` +
      `Je vous rembourse ${v.htgRecu} sur le numéro ${v.methode} qui a payé. ` +
      `Vous recevrez une confirmation dès que c'est fait. Désolé pour la gêne.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Mwen pa ka voye dola kòmand ou ${v.reference} yo. ` +
      `M ap remèt ou ${v.htgRecu} sou nimewo ${v.methode} ki te peye a. ` +
      `W ap resevwa yon konfimasyon kou sa fèt. Padon pou deranjman an.`,
  },
  {
    id: 'refund_done',
    label: 'Remboursement effectué',
    hint: 'L’argent est reparti vers le portefeuille du client.',
    tone: 'primary',
    recommendedFor: ['refunded'],
    availableFor: ['refunded'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Le remboursement de ${v.htgRecu} pour la commande ${v.reference} est parti sur votre ${v.methode}. ` +
      `Il peut mettre quelques minutes à apparaître. Merci de votre patience.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Ranbousman ${v.htgRecu} pou kòmand ${v.reference} pati sou ${v.methode} ou a. ` +
      `Li ka pran kèk minit pou parèt. Mèsi pou pasyans ou.`,
  },
  {
    id: 'failed_explained',
    label: 'Expliquer un échec',
    hint: 'La commande n’a pas abouti côté fournisseur.',
    tone: 'caution',
    recommendedFor: ['failed'],
    availableFor: ['failed', 'cancelled', 'expired'],
    fr: (v) =>
      `Bonjour ${v.prenom}, ici ${v.business}.\n\n` +
      `Votre commande ${v.reference} n'a pas abouti et aucun dollar n'a été envoyé. ` +
      `Si de l'argent a été prélevé sur votre ${v.methode}, écrivez-moi tout de suite ` +
      `avec le message de confirmation : je vérifie et je vous rembourse.`,
    ht: (v) =>
      `Bonjou ${v.prenom}, se ${v.business}.\n\n` +
      `Kòmand ou ${v.reference} pa t reyisi epi nou pa voye okenn dola. ` +
      `Si yo te retire kòb sou ${v.methode} ou a, ekri m touswit ` +
      `ak mesaj konfimasyon an : m ap verifye epi ranbouse w.`,
  },
  {
    id: 'free_text',
    label: 'Message libre',
    hint: 'Ouvre WhatsApp avec seulement la référence, à vous d’écrire.',
    tone: 'neutral',
    recommendedFor: [],
    fr: (v) => `Bonjour ${v.prenom}, ici ${v.business}, au sujet de votre commande ${v.reference}.\n\n`,
    ht: (v) => `Bonjou ${v.prenom}, se ${v.business}, konsènan kòmand ou ${v.reference}.\n\n`,
  },
];

/**
 * Les messages proposés pour une commande, les conseillés d'abord.
 *
 * Une commande en mode bac à sable n'en reçoit aucun : il n'y a pas de vrai
 * client au bout, et prévenir quelqu'un d'un argent fictif est pire que se
 * taire.
 */
export function buildWhatsAppMessages(order: OrderRow, ctx: WhatsAppMessageContext): WhatsAppMessage[] {
  if ((order.mode as GatewayMode) === 'sandbox') return [];

  const v = variables(order, ctx);
  const locale: Locale = order.locale === 'ht' ? 'ht' : 'fr';

  const usable = CATALOGUE.filter(
    (d) =>
      d.recommendedFor.includes(order.status) ||
      d.availableFor === undefined ||
      d.availableFor.includes(order.status),
  );

  return usable
    .map((d) => ({
      id: d.id,
      label: d.label,
      hint: d.hint,
      body: (locale === 'ht' ? d.ht : d.fr)(v),
      recommended: d.recommendedFor.includes(order.status),
      tone: d.tone,
    }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/** `https://wa.me/<chiffres>?text=…`, ou null si le numéro est inutilisable. */
export function whatsappHref(phoneE164: string, body: string): string | null {
  const digits = phoneE164.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(body)}` : null;
}
