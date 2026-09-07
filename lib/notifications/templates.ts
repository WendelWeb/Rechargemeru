/**
 * Notification templates — pure builders (no env, no fetch, no database).
 *
 * Each builder returns a `Message`: an email subject, a plain text (also the
 * WhatsApp body), a branded HTML email, and the ordered WhatsApp template
 * `params`. Customer texts are exactly reproducible from their params so the
 * Meta template bodies documented in `docs/whatsapp-templates.md` can use
 * `{{1}}…{{n}}` in the same order:
 *
 *   created      [name, reference, usd, htg, method, url]
 *   paid         [name, htg, method, usd, sla, url]
 *   fulfilled    [name, usd, meruAccount, meruRef, business, url]
 *   failed       [name, reference, reason, support, url]
 *   expired      [name, reference, url]
 *   needs_review [name, reference, url]
 *   refunded     [name, htg, wallet, reference]
 *   reminder_24h [name, reference, url]
 *
 * Admin params are the values of the admin text in order of appearance.
 * Sandbox orders get the TEST prefix on the subject, the text and the first
 * param — the only lever that reaches a rendered Meta template.
 */
import type { Locale, NotificationTemplate, OrderRow } from '@/lib/orders/types';
import { formatDateTime, formatHtg, formatUsdShort } from '@/lib/format';
import { formatPhone, isHaitian } from '@/lib/phone';

export type Message = { subject: string; text: string; html: string; params: string[] };

export const TEST_PREFIX = '[TEST — aucun argent réel, ne rien envoyer] ';
export const TEST_PREFIX_HT = '[TÈS — pa gen lajan reyèl] ';

/** The order fields the builders read — any `OrderRow` satisfies it. */
export type TemplateOrder = Pick<
  OrderRow,
  | 'id'
  | 'reference'
  | 'status'
  | 'method'
  | 'mode'
  | 'locale'
  | 'providerRef'
  | 'providerTransactionId'
  | 'payerWallet'
  | 'usdCents'
  | 'totalHtg'
  | 'paidHtg'
  | 'fulfilledUsdCents'
  | 'refundHtg'
  | 'refundWallet'
  | 'customerName'
  | 'customerPhone'
  | 'meruAccountType'
  | 'meruAccount'
  | 'meruReference'
  | 'failureReason'
  | 'expiresAt'
>;

export type AdminMessageContext = { siteUrl: string; businessName: string };

export type CustomerMessageContext = {
  siteUrl: string;
  businessName: string;
  supportWhatsapp: string | null;
  slaFr: string;
  slaHt: string;
  supportHours: string;
};

type Cta = { label: string; url: string };

type Draft = { subject: string; heading: string; text: string; params: string[]; cta: Cta | null };

const DASH = '—';

const METHOD_LABELS: Record<string, string> = { moncash: 'MonCash', natcash: 'NatCash' };

const MERU_TYPE_LABELS: Record<Locale, Record<string, string>> = {
  fr: { email: 'email', username: "nom d'utilisateur" },
  ht: { email: 'imel', username: 'non itilizatè' },
};

function orderLocale(order: TemplateOrder): Locale {
  return order.locale === 'ht' ? 'ht' : 'fr';
}

function isSandbox(order: TemplateOrder): boolean {
  return order.mode === 'sandbox';
}

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

function meruTypeLabel(type: string, locale: Locale): string {
  return MERU_TYPE_LABELS[locale][type] ?? type;
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  const first = trimmed.split(/\s+/)[0] ?? '';
  return first || trimmed || DASH;
}

function displayPhone(value: string): string {
  return isHaitian(value) || /^\+1\d{10}$/.test(value) ? formatPhone(value) : value;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function adminUrl(ctx: AdminMessageContext, order: TemplateOrder): string {
  return `${trimSlash(ctx.siteUrl)}/admin/commandes/${order.id}`;
}

function customerUrl(ctx: CustomerMessageContext, order: TemplateOrder, locale: Locale): string {
  return `${trimSlash(ctx.siteUrl)}/${locale}/commande/${order.reference}`;
}

function reasonText(order: TemplateOrder, fallback: string): string {
  const raw = (order.failureReason ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}

/** Meta refuses newlines, tabs and long runs of spaces inside template parameters. */
function cleanParam(value: string): string {
  const cleaned = value
    .replace(/[\t\n\r\v\f]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return cleaned || DASH;
}

function adminDraft(order: TemplateOrder, template: NotificationTemplate, ctx: AdminMessageContext): Draft {
  const ref = order.reference;
  const usd = formatUsdShort(order.usdCents, 'fr');
  const htg = formatHtg(order.totalHtg);
  const method = methodLabel(order.method);
  const url = adminUrl(ctx, order);
  const name = order.customerName.trim() || DASH;
  const phone = displayPhone(order.customerPhone);
  const meru = order.meruAccount;
  const meruType = meruTypeLabel(order.meruAccountType, 'fr');
  const paidHtg = typeof order.paidHtg === 'number' ? formatHtg(order.paidHtg) : 'montant non communiqué';
  const tx = order.providerTransactionId ?? DASH;
  const payer = order.payerWallet ? displayPhone(order.payerWallet) : DASH;
  const expires = formatDateTime(order.expiresAt);
  const cta: Cta = { label: 'Ouvrir la fiche', url };

  switch (template) {
    case 'paid':
      return {
        subject: `Payée ${ref} — envoyer ${usd} sur Meru`,
        heading: 'Paiement reçu — à recharger',
        text: `💰 PAYÉE ${ref} — envoyer ${usd} sur Meru. Reçu ${paidHtg} (attendu ${htg}) par ${method}, tx ${tx}, payeur ${payer}. Compte Meru : ${meruType} ${meru} — ${name}, tél. ${phone}. Ouvrir : ${url}`,
        params: [ref, usd, paidHtg, htg, method, tx, payer, meruType, meru, name, phone, url],
        cta,
      };
    case 'needs_review': {
      const reason = reasonText(order, 'montant ou délai à vérifier');
      return {
        subject: `À vérifier ${ref} — ${reason}`,
        heading: 'Paiement à vérifier',
        text: `🔍 À VÉRIFIER ${ref} — ${reason}. ${usd} (${htg}) par ${method}, reçu ${paidHtg}, tx ${tx}, payeur ${payer}. Compte Meru : ${meruType} ${meru} — ${name}, tél. ${phone}. Ouvrir : ${url}`,
        params: [ref, reason, usd, htg, method, paidHtg, tx, payer, meruType, meru, name, phone, url],
        cta,
      };
    }
    case 'failed': {
      const reason = reasonText(order, 'raison non précisée');
      const creationError = !order.providerRef;
      const head = creationError ? `⚠️ Création impossible ${ref} : ${reason}` : `⚠️ Échouée ${ref} : ${reason}`;
      return {
        subject: creationError ? `Création impossible ${ref}` : `Échouée ${ref}`,
        heading: creationError ? 'Création impossible' : 'Commande échouée',
        text: `${head}. ${usd} (${htg}) par ${method} — ${name}, tél. ${phone}. Ouvrir : ${url}`,
        params: [ref, reason, usd, htg, method, name, phone, url],
        cta,
      };
    }
    case 'reminder_24h':
      return {
        subject: `Toujours à recharger : ${ref} (${usd})`,
        heading: 'Toujours à recharger',
        text: `⏰ Toujours à recharger : ${ref} (${usd}) payée il y a 24 h. ${url}`,
        params: [ref, usd, url],
        cta,
      };
    case 'created':
      return {
        subject: `Nouvelle commande ${ref} — ${usd}`,
        heading: 'Nouvelle commande',
        text: `🆕 Nouvelle commande ${ref} — ${usd} (${htg}) par ${method}, expire le ${expires}. Compte Meru : ${meruType} ${meru} — ${name}, tél. ${phone}. Ouvrir : ${url}`,
        params: [ref, usd, htg, method, expires, meruType, meru, name, phone, url],
        cta,
      };
    case 'fulfilled': {
      const usdSent = formatUsdShort(order.fulfilledUsdCents ?? order.usdCents, 'fr');
      const meruRef = order.meruReference ?? 'sans référence Meru';
      return {
        subject: `Rechargée ${ref} — ${usdSent}`,
        heading: 'Commande rechargée',
        text: `✅ Rechargée ${ref} — ${usdSent} envoyés sur ${meru} (${meruRef}) pour ${name}. Ouvrir : ${url}`,
        params: [ref, usdSent, meru, meruRef, name, url],
        cta,
      };
    }
    case 'expired':
      return {
        subject: `Expirée ${ref}`,
        heading: 'Commande expirée',
        text: `⌛ Expirée ${ref} — ${usd} (${htg}) par ${method}, jamais payée (échéance ${expires}). ${name}, tél. ${phone}. Ouvrir : ${url}`,
        params: [ref, usd, htg, method, expires, name, phone, url],
        cta,
      };
    case 'refunded': {
      const refund = typeof order.refundHtg === 'number' ? formatHtg(order.refundHtg) : 'montant non précisé';
      const wallet = order.refundWallet ? displayPhone(order.refundWallet) : DASH;
      return {
        subject: `Remboursée ${ref} — ${refund}`,
        heading: 'Commande remboursée',
        text: `↩️ Remboursée ${ref} — ${refund} sur ${wallet} pour ${name}. Ouvrir : ${url}`,
        params: [ref, refund, wallet, name, url],
        cta,
      };
    }
  }
}

function customerDraft(order: TemplateOrder, template: NotificationTemplate, ctx: CustomerMessageContext, locale: Locale): Draft {
  const ht = locale === 'ht';
  const ref = order.reference;
  const name = firstName(order.customerName);
  const usd = formatUsdShort(order.usdCents, locale);
  const htg = formatHtg(order.totalHtg);
  const method = methodLabel(order.method);
  const url = customerUrl(ctx, order, locale);
  const business = ctx.businessName.trim() || 'Recharge Meru';
  const support = ctx.supportWhatsapp ? displayPhone(ctx.supportWhatsapp) : business;
  const sla = ht ? ctx.slaHt : ctx.slaFr;
  const cta: Cta = { label: ht ? 'Swiv kòmand mwen' : 'Suivre ma commande', url };

  switch (template) {
    case 'created':
      return {
        subject: ht ? `Kòmand ${ref} kreye — ${usd}` : `Commande ${ref} créée — ${usd}`,
        heading: ht ? 'Kòmand kreye' : 'Commande créée',
        text: ht
          ? `Bonjou ${name}, kòmand ou ${ref} kreye : ${usd} sou kont Meru ou pou ${htg} pa ${method}. Fini peman an, epi swiv kòmand ou isit la : ${url}`
          : `Bonjour ${name}, votre commande ${ref} est créée : ${usd} sur votre compte Meru pour ${htg} par ${method}. Terminez le paiement, puis suivez votre commande ici : ${url}`,
        params: [name, ref, usd, htg, method, url],
        cta,
      };
    case 'paid':
      return {
        subject: ht ? `Peman resevwa — kòmand ${ref}` : `Paiement reçu — commande ${ref}`,
        heading: ht ? 'Peman resevwa' : 'Paiement reçu',
        text: ht
          ? `Bonjou ${name}, nou resevwa peman ${htg} ou pa ${method}. Mèsi ! Operatè a ap voye ${usd} sou kont Meru ou manyèlman, anjeneral nan ${sla}. Swiv kòmand ou : ${url}`
          : `Bonjour ${name}, nous avons reçu votre paiement de ${htg} par ${method}. Merci ! L'opérateur envoie vos ${usd} sur votre compte Meru manuellement, généralement sous ${sla}. Suivi : ${url}`,
        params: [name, htg, method, usd, sla, url],
        cta,
      };
    case 'fulfilled': {
      const usdSent = formatUsdShort(order.fulfilledUsdCents ?? order.usdCents, locale);
      const meru = order.meruAccount;
      const meruRef = order.meruReference ?? (ht ? 'pa disponib' : 'non communiquée');
      return {
        subject: ht ? `${usdSent} ou sou Meru — kòmand ${ref}` : `Vos ${usdSent} sont sur Meru — commande ${ref}`,
        heading: ht ? 'Dola yo voye' : 'Dollars envoyés',
        text: ht
          ? `Bonjou ${name}, ${usdSent} ou voye sou kont Meru ou ${meru} (referans Meru : ${meruRef}). Tcheke balans ou nan aplikasyon Meru a. Mèsi paske ou chwazi ${business}. Detay : ${url}`
          : `Bonjour ${name}, vos ${usdSent} ont été envoyés sur votre compte Meru ${meru} (référence Meru : ${meruRef}). Vérifiez votre solde dans l'application Meru. Merci d'avoir choisi ${business}. Détails : ${url}`,
        params: [name, usdSent, meru, meruRef, business, url],
        cta,
      };
    }
    case 'failed': {
      const reason = reasonText(order, ht ? 'peman an pa t abouti' : 'paiement non abouti');
      return {
        subject: ht ? `Kòmand ${ref} pa t abouti` : `Commande ${ref} non aboutie`,
        heading: ht ? 'Kòmand pa t abouti' : 'Commande non aboutie',
        text: ht
          ? `Bonjou ${name}, kòmand ${ref} pa t ka abouti : ${reason}. Si yo te retire lajan sou kont ou, ekri nou sou WhatsApp (${support}) : n ap regle sa vit. Detay : ${url}`
          : `Bonjour ${name}, la commande ${ref} n'a pas pu aboutir : ${reason}. Si un montant a été débité, écrivez-nous sur WhatsApp (${support}) : nous le réglons rapidement. Détails : ${url}`,
        params: [name, ref, reason, support, url],
        cta,
      };
    }
    case 'expired':
      return {
        subject: ht ? `Kòmand ${ref} ekspire` : `Commande ${ref} expirée`,
        heading: ht ? 'Kòmand ekspire' : 'Commande expirée',
        text: ht
          ? `Bonjou ${name}, kòmand ${ref} ekspire san peman : yo pa t retire anyen sou kont ou. Pou rekòmanse, louvri : ${url}`
          : `Bonjour ${name}, la commande ${ref} a expiré sans paiement : rien n'a été débité. Pour recommencer, ouvrez : ${url}`,
        params: [name, ref, url],
        cta: { label: ht ? 'Rekòmanse' : 'Recommencer', url },
      };
    case 'needs_review':
      return {
        subject: ht ? `Peman resevwa, verifikasyon ap fèt — ${ref}` : `Paiement reçu, vérification en cours — ${ref}`,
        heading: ht ? 'Verifikasyon ap fèt' : 'Vérification en cours',
        text: ht
          ? `Bonjou ${name}, nou byen resevwa yon peman pou kòmand ${ref}. N ap fè yon verifikasyon manyèl ; n ap kontakte w sou WhatsApp. Swiv : ${url}`
          : `Bonjour ${name}, nous avons bien reçu un paiement pour la commande ${ref}. Une vérification manuelle est en cours ; nous vous contactons sur WhatsApp. Suivi : ${url}`,
        params: [name, ref, url],
        cta,
      };
    case 'refunded': {
      const refund = formatHtg(order.refundHtg ?? order.paidHtg ?? order.totalHtg);
      const wallet = displayPhone(order.refundWallet ?? order.payerWallet ?? order.customerPhone);
      return {
        subject: ht ? `Ranbousman — kòmand ${ref}` : `Remboursement — commande ${ref}`,
        heading: ht ? 'Ranbousman fèt' : 'Remboursement effectué',
        text: ht
          ? `Bonjou ${name}. Nou ranbouse w ${refund} sou bous ${wallet} pou kòmand ${ref}.`
          : `Bonjour ${name}. Nous vous avons remboursé ${refund} sur le portefeuille ${wallet} pour la commande ${ref}.`,
        params: [name, refund, wallet, ref],
        cta: { label: ht ? 'Gade kòmand lan' : 'Voir la commande', url },
      };
    }
    case 'reminder_24h':
      return {
        subject: ht ? `Kòmand ${ref} toujou ap trete` : `Commande ${ref} toujours en cours`,
        heading: ht ? 'Toujou ap trete' : 'Toujours en cours',
        text: ht
          ? `Bonjou ${name}, kòmand ou ${ref} toujou ap trete. N ap avèti w kou dola yo voye. Swiv : ${url}`
          : `Bonjour ${name}, votre commande ${ref} est toujours en cours de traitement. Nous vous prévenons dès que vos dollars sont envoyés. Suivi : ${url}`,
        params: [name, ref, url],
        cta,
      };
  }
}

type FinalizeOptions = { locale: Locale; sandbox: boolean; businessName: string; footerLines: string[] };

function finalize(draft: Draft, opts: FinalizeOptions): Message {
  const prefix = opts.sandbox ? (opts.locale === 'ht' ? TEST_PREFIX_HT : TEST_PREFIX) : '';
  const params = draft.params.map(cleanParam);
  if (prefix && params.length > 0) params[0] = `${prefix}${params[0]}`;
  const html = emailShell({
    locale: opts.locale,
    businessName: opts.businessName,
    heading: draft.heading,
    bodyHtml: textToHtml(draft.text),
    cta: draft.cta,
    footerLines: opts.footerLines,
    sandbox: opts.sandbox,
  });
  return { subject: `${prefix}${draft.subject}`, text: `${prefix}${draft.text}`, html, params };
}

/** Admin messages are always in French and link to the admin order page. */
export function buildAdminMessage(order: TemplateOrder, template: NotificationTemplate, ctx: AdminMessageContext): Message {
  const businessName = ctx.businessName.trim() || 'Recharge Meru';
  return finalize(adminDraft(order, template, ctx), {
    locale: 'fr',
    sandbox: isSandbox(order),
    businessName,
    footerLines: [`Alerte automatique de ${businessName}. Comparez toujours le nom et l'identifiant Meru avant d'envoyer.`],
  });
}

/** Customer messages follow the order's locale and link to the public tracking page. */
export function buildCustomerMessage(
  order: TemplateOrder,
  template: NotificationTemplate,
  ctx: CustomerMessageContext,
): Message {
  const locale = orderLocale(order);
  const ht = locale === 'ht';
  const businessName = ctx.businessName.trim() || 'Recharge Meru';
  const support = ctx.supportWhatsapp ? displayPhone(ctx.supportWhatsapp) : null;
  const hours = ctx.supportHours.trim();
  const supportLine = ht
    ? support
      ? `Sipò WhatsApp : ${support}${hours ? ` (${hours})` : ''}`
      : hours
        ? `Orè : ${hours}`
        : ''
    : support
      ? `Support WhatsApp : ${support}${hours ? ` (${hours})` : ''}`
      : hours
        ? `Horaires : ${hours}`
        : '';
  const footerLines = [
    ht ? `${businessName} pa afilye ak Meru, Digicel oswa Natcom.` : `${businessName} n'est pas affilié à Meru, Digicel ni Natcom.`,
    ...(supportLine ? [supportLine] : []),
  ];
  return finalize(customerDraft(order, template, ctx, locale), { locale, sandbox: isSandbox(order), businessName, footerLines });
}

const COLORS = {
  ink: '#0E1B3D',
  paper: '#FFFFFF',
  mist: '#EEF2F8',
  sun: '#FFC531',
  coral: '#DC3D43',
  muted: '#5B6785',
  hairline: '#D9E0EC',
} as const;

const FONT_BODY = `Figtree,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_DISPLAY = `'Bricolage Grotesque','Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

const P_STYLE = `margin:0 0 14px;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${COLORS.ink};`;
const A_STYLE = `color:${COLORS.ink};text-decoration:underline;word-break:break-all;`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Turns already-escaped URLs into links, keeping trailing punctuation outside the anchor. */
function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (match) => {
    const trailing = /[.,;:!?)\]]+$/.exec(match)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `<a href="${url}" style="${A_STYLE}">${url}</a>${trailing}`;
  });
}

/** Plain text → escaped paragraphs (`\n\n`), line breaks (`\n`) and clickable links. */
export function textToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => `<p style="${P_STYLE}">${linkify(escapeHtml(paragraph)).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

type EmailShellInput = {
  locale: Locale;
  businessName: string;
  heading: string;
  bodyHtml: string;
  cta: Cta | null;
  footerLines: string[];
  sandbox: boolean;
};

function buttonHtml(cta: Cta): string {
  const url = escapeHtml(cta.url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;border-collapse:collapse;"><tr><td align="center" bgcolor="${COLORS.sun}" style="border-radius:10px;background-color:${COLORS.sun};"><a href="${url}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT_BODY};font-size:16px;font-weight:700;line-height:20px;color:${COLORS.ink};text-decoration:none;border-radius:10px;background-color:${COLORS.sun};">${escapeHtml(cta.label)}</a></td></tr></table>`;
}

function sandboxBannerHtml(locale: Locale): string {
  const label = locale === 'ht' ? 'TÈS — pa gen lajan reyèl, pa voye anyen' : 'TEST — aucun argent réel, ne rien envoyer';
  return `<tr><td style="padding:0 24px 12px;"><div style="padding:12px 16px;border-radius:10px;background-color:${COLORS.coral};font-family:${FONT_BODY};font-size:15px;font-weight:700;line-height:1.4;color:${COLORS.paper};">${label}</div></td></tr>`;
}

/** Table-based, inline-styled email shell in the Recharge Meru palette; no remote images. */
function emailShell(input: EmailShellInput): string {
  const footer = input.footerLines
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-family:${FONT_BODY};font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(line)}</p>`,
    )
    .join('');
  return `<!doctype html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.mist};">
<center style="width:100%;background-color:${COLORS.mist};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;">
<tr><td style="padding:28px 24px 16px;font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;line-height:1.2;color:${COLORS.ink};">${escapeHtml(input.businessName)}</td></tr>
${input.sandbox ? sandboxBannerHtml(input.locale) : ''}
<tr><td style="padding:0 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:${COLORS.paper};border:1px solid ${COLORS.hairline};border-radius:14px;">
<tr><td style="padding:28px 24px;">
<h1 style="margin:0 0 16px;font-family:${FONT_DISPLAY};font-size:24px;font-weight:700;line-height:1.25;color:${COLORS.ink};">${escapeHtml(input.heading)}</h1>
${input.bodyHtml}
${input.cta ? buttonHtml(input.cta) : ''}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 24px 36px;">${footer}</td></tr>
</table>
</center>
</body>
</html>`;
}
