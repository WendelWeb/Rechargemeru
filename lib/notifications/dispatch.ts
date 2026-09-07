/**
 * lib/notifications/dispatch.ts — one order event in, every configured
 * message out, each one at most once.
 *
 * Who gets what comes from the settings matrix (`notifyAdminEvents`,
 * `notifyCustomerEvents`); what they get comes from lib/notifications/templates
 * (which already prefixes sandbox orders with « [TEST — …] »). The database
 * is the deduplication: each attempt is first inserted as a `pending` row
 * under the partial unique index on (order, template, audience, channel,
 * recipient) with `onConflictDoNothing`, so a duplicate callback can never
 * produce a second « PAYÉE » alert — not even across two serverless
 * instances. `failed` and `skipped` rows do not hold the key, so the next
 * call tries those again; an explicit resend carries `resendOf` and bypasses
 * the index on purpose.
 *
 * NEVER THROWS. Dependencies are injectable so the whole flow is unit-tested
 * with in-memory fakes.
 */
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/env';
import { and, desc, eq } from 'drizzle-orm';
import { sendEmail, type SendEmailInput, type SendEmailResult } from '@/lib/notifications/email';
import { buildAdminMessage, buildCustomerMessage, type Message } from '@/lib/notifications/templates';
import { sendWhatsApp, type WhatsAppMessage, type WhatsAppSendResult } from '@/lib/notifications/whatsapp';
import { appendEvent, type OrderEventInput } from '@/lib/orders/events';
import type {
  Locale,
  NewNotification,
  NotificationAudience,
  NotificationChannel,
  NotificationRow,
  NotificationTemplate,
  OrderRow,
} from '@/lib/orders/types';
import { getSettings } from '@/lib/settings/store';
import type { Settings } from '@/lib/settings/types';
import { siteUrl } from '@/lib/site-url';

export type NotifyOptions = {
  /** Send even when an identical message already went out; the new rows point at the previous one. */
  force?: boolean;
  /** The row being resent, when the caller knows it; otherwise the latest row of the same key is used. */
  resendOf?: string | null;
};

export type NotifyResult = { attempted: number; sent: number; skipped: number; failed: number };

/** The deduplication key of the partial unique index. */
export type NotificationKey = {
  orderId: string;
  template: NotificationTemplate;
  audience: NotificationAudience;
  channel: NotificationChannel;
  recipient: string;
};

export type NotifyDeps = {
  settings: () => Promise<Settings>;
  siteUrl: () => string;
  /** Inserts one `pending` row; `null` when the unique key refused it. */
  insertNotification: (row: NewNotification) => Promise<NotificationRow | null>;
  updateNotification: (id: string, patch: Partial<NewNotification>) => Promise<void>;
  /** The most recent row of a key, whatever its status, for `resendOf`. */
  latestNotification: (key: NotificationKey) => Promise<NotificationRow | null>;
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>;
  sendWhatsApp: (msg: WhatsAppMessage) => Promise<WhatsAppSendResult>;
  appendEvent: (ev: OrderEventInput) => Promise<unknown>;
};

type Recipient = { audience: NotificationAudience; channel: 'email' | 'whatsapp'; recipient: string; locale: Locale };

type Skip = { channel: NotificationChannel; audience: NotificationAudience; recipient: string; reason: string };

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

export function defaultNotifyDeps(): NotifyDeps {
  return {
    settings: getSettings,
    siteUrl,
    insertNotification: async (row) => {
      const [inserted] = await db.insert(schema.notifications).values(row).onConflictDoNothing().returning();
      return inserted ?? null;
    },
    updateNotification: async (id, patch) => {
      await db.update(schema.notifications).set(patch).where(eq(schema.notifications.id, id));
    },
    latestNotification: async (key) => {
      const [row] = await db
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.orderId, key.orderId),
            eq(schema.notifications.template, key.template),
            eq(schema.notifications.audience, key.audience),
            eq(schema.notifications.channel, key.channel),
            eq(schema.notifications.recipient, key.recipient),
          ),
        )
        .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
        .limit(1);
      return row ?? null;
    },
    sendEmail,
    sendWhatsApp,
    appendEvent,
  };
}

/** The recipients the matrix designates for this order and template, admin first. */
function recipientsFor(order: OrderRow, template: NotificationTemplate, settings: Settings): Recipient[] {
  const out: Recipient[] = [];
  if (settings.notifyAdminEvents.includes(template)) {
    for (const email of settings.adminEmails) out.push({ audience: 'admin', channel: 'email', recipient: email, locale: 'fr' });
    for (const phone of settings.adminWhatsappNumbers) {
      out.push({ audience: 'admin', channel: 'whatsapp', recipient: phone, locale: 'fr' });
    }
  }
  if (settings.notifyCustomerEvents.includes(template)) {
    out.push({ audience: 'customer', channel: 'whatsapp', recipient: order.customerPhone, locale: order.locale });
    const email = order.customerEmail?.trim().toLowerCase();
    if (email) out.push({ audience: 'customer', channel: 'email', recipient: email, locale: order.locale });
  }
  return out;
}

/**
 * Sends every message the matrix designates for `template`, deduplicated by
 * the database, and records the outcome on the timeline. Never throws.
 */
export async function notifyOrder(
  order: OrderRow,
  template: NotificationTemplate,
  opts: NotifyOptions = {},
  deps: NotifyDeps = defaultNotifyDeps(),
): Promise<NotifyResult> {
  const result: NotifyResult = { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  const force = opts.force === true;
  const skips: Skip[] = [];
  let inserted = 0;
  try {
    const settings = await deps.settings();
    const recipients = recipientsFor(order, template, settings);
    if (recipients.length === 0) return result;

    const origin = deps.siteUrl();
    const messages: Partial<Record<NotificationAudience, Message>> = {};
    const messageFor = (audience: NotificationAudience): Message => {
      const cached = messages[audience];
      if (cached) return cached;
      const built =
        audience === 'admin'
          ? buildAdminMessage(order, template, { siteUrl: origin, businessName: settings.businessName })
          : buildCustomerMessage(order, template, {
              siteUrl: origin,
              businessName: settings.businessName,
              supportWhatsapp: settings.supportWhatsapp,
              slaFr: settings.fulfilmentSlaFr,
              slaHt: settings.fulfilmentSlaHt,
              supportHours: settings.supportHours,
            });
      messages[audience] = built;
      return built;
    };

    for (const target of recipients) {
      result.attempted += 1;
      const key: NotificationKey = {
        orderId: order.id,
        template,
        audience: target.audience,
        channel: target.channel,
        recipient: target.recipient,
      };
      let resendOf: string | null = opts.resendOf ?? null;
      if (force && !resendOf) resendOf = (await deps.latestNotification(key))?.id ?? null;

      const row = await deps.insertNotification({
        orderId: order.id,
        channel: target.channel,
        audience: target.audience,
        recipient: target.recipient,
        template,
        locale: target.locale,
        status: 'pending',
        resendOf,
      });
      if (!row) {
        result.skipped += 1;
        skips.push({ ...key, reason: 'duplicate' });
        continue;
      }
      inserted += 1;

      const message = messageFor(target.audience);
      const outcome =
        target.channel === 'email'
          ? await deps.sendEmail({ to: target.recipient, subject: message.subject, html: message.html, text: message.text })
          : await deps.sendWhatsApp({
              to: target.recipient,
              template,
              locale: target.locale,
              params: message.params,
              text: message.text,
              audience: target.audience,
            });

      if (outcome.sent) {
        result.sent += 1;
        await deps.updateNotification(row.id, { status: 'sent', providerId: outcome.id ?? null, error: null });
        await deps.appendEvent({
          orderId: order.id,
          type: 'notification_sent',
          message: `Notification « ${template} » envoyée (${target.channel}, ${target.audience})`,
          data: { template, channel: target.channel, audience: target.audience, recipient: target.recipient, providerId: outcome.id ?? null, resendOf },
        });
      } else if (outcome.skipped) {
        const reason: string =
          'reason' in outcome && typeof outcome.reason === 'string' && outcome.reason.length > 0
            ? outcome.reason
            : 'not_configured';
        result.skipped += 1;
        await deps.updateNotification(row.id, { status: 'skipped', error: reason });
        skips.push({ ...key, reason });
      } else {
        const error = outcome.error ?? 'error';
        result.failed += 1;
        await deps.updateNotification(row.id, { status: 'failed', error });
        await deps.appendEvent({
          orderId: order.id,
          type: 'notification_failed',
          message: `Notification « ${template} » en échec (${target.channel}, ${target.audience}) : ${error}`,
          data: { template, channel: target.channel, audience: target.audience, recipient: target.recipient, error },
        });
      }
    }
  } catch (err) {
    console.error(`[notifications] notifyOrder ${template} for ${order.id} failed: ${errorText(err)}`);
  }

  // Duplicates are only worth a line when the whole call was a duplicate;
  // a channel that is not configured (or a sandbox that refuses customers)
  // is always worth one.
  const reportable = skips.filter((s) => s.reason !== 'duplicate' || (!force && inserted === 0));
  if (reportable.length > 0) {
    try {
      await deps.appendEvent({
        orderId: order.id,
        type: 'notification_skipped',
        message: `Notification « ${template} » non envoyée : ${Array.from(new Set(reportable.map((s) => s.reason))).join(', ')}`,
        data: { template, skipped: reportable },
      });
    } catch (err) {
      console.error(`[notifications] notification_skipped event failed for ${order.id}: ${errorText(err)}`);
    }
  }
  return result;
}

/**
 * Records that the operator sent a WhatsApp message by hand (the prefilled
 * `wa.me` button on the order page). One `sent` row on the `whatsapp_manual`
 * channel; a second click on the same template is deduplicated by the same
 * index and returns `null`. Never throws.
 */
export async function recordManualWhatsApp(
  orderId: string,
  recipient: string,
  template: NotificationTemplate,
  locale: Locale = 'fr',
): Promise<NotificationRow | null> {
  if (!dbConfigured()) return null;
  try {
    const [row] = await db
      .insert(schema.notifications)
      .values({ orderId, channel: 'whatsapp_manual', audience: 'customer', recipient, template, locale, status: 'sent' })
      .onConflictDoNothing()
      .returning();
    if (!row) return null;
    await appendEvent({
      orderId,
      type: 'notification_sent',
      actor: 'admin',
      message: `Message WhatsApp « ${template} » envoyé manuellement`,
      data: { template, channel: 'whatsapp_manual', audience: 'customer', recipient },
    });
    return row;
  } catch (err) {
    console.error(`[notifications] recordManualWhatsApp failed for ${orderId}: ${errorText(err)}`);
    return null;
  }
}
