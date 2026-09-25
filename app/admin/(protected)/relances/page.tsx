import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck, Clock3 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MethodBadge } from '@/components/ui/MethodBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { QuickWhatsApp } from '@/components/admin/QuickWhatsApp';
import { WhatsAppMenu } from '@/components/admin/WhatsAppMenu';
import {
  FOLLOW_UP_DAYS,
  inView,
  listFollowUps,
  parseFollowUpDays,
  parseFollowUpView,
  type FollowUp,
  type FollowUpDays,
  type FollowUpView,
} from '@/lib/admin/followups';
import { orderMomentFr } from '@/lib/admin/order-status';
import { timeAgoFr } from '@/lib/admin/time';
import { formatDateTime, formatHtg, formatUsd } from '@/lib/format';
import { statusLabelFr } from '@/lib/orders/transitions';
import { getSettings } from '@/lib/settings/store';
import { manualMessageLabel } from '@/lib/whatsapp/catalogue';
import { whatsappKits } from '@/lib/whatsapp/context';
import { renderKitMessage, whatsappHref, type WhatsAppKit } from '@/lib/whatsapp/render';
import { getWhatsAppStyle } from '@/lib/whatsapp/style-store';
import type { WhatsAppStyle } from '@/lib/whatsapp/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Relances' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The message the operator sends most: « qu'est-ce qui s'est passé ? ». */
const MAIN_MESSAGE = 'ask_why';

const VIEWS: { value: FollowUpView; label: string }[] = [
  { value: 'todo', label: 'À relancer' },
  { value: 'done', label: 'Déjà relancées' },
  { value: 'all', label: 'Toutes' },
];

function hrefFor(view: FollowUpView, days: FollowUpDays): string {
  const params = new URLSearchParams();
  if (view !== 'todo') params.set('vue', view);
  if (days !== 30) params.set('jours', String(days));
  const query = params.toString();
  return query ? `/admin/relances?${query}` : '/admin/relances';
}

/** The one line that says where this follow-up stands. */
function StateLine({ item, now }: { item: FollowUp; now: Date }) {
  if (item.state === 'paid_later' && item.paidLaterAt) {
    return (
      <p className="flex items-start gap-2 text-sm text-mint-deep">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        A payé une autre commande {timeAgoFr(item.paidLaterAt, now)} : rien à relancer.
      </p>
    );
  }
  if (item.lastContact) {
    const label = manualMessageLabel(item.lastContact.label) ?? item.lastContact.label;
    return (
      <p className="flex items-start gap-2 text-sm text-ink-soft">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-mint" aria-hidden="true" />
        <span>
          Relancée {timeAgoFr(item.lastContact.at, now)} avec « {label} »
          {item.lastContact.count > 1 ? ` · ${item.lastContact.count} messages en tout` : ''}.
        </span>
      </p>
    );
  }
  if (item.state === 'too_fresh') {
    return (
      <p className="flex items-start gap-2 text-sm text-ink-soft">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        Créée {timeAgoFr(item.order.createdAt, now)} : le client est peut-être en train de payer.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm font-medium text-ink">
      <span className="mt-1.5 size-2 shrink-0 animate-beat rounded-full bg-sun-deep" aria-hidden="true" />
      Pas encore relancée.
    </p>
  );
}

function FollowUpCard({
  item,
  kit,
  style,
  now,
}: {
  item: FollowUp;
  kit: WhatsAppKit | undefined;
  style: WhatsAppStyle;
  now: Date;
}) {
  const { order } = item;
  const body = kit ? renderKitMessage(kit, MAIN_MESSAGE, style) : null;
  const href = body ? whatsappHref(order.customerPhone, body) : null;
  const quiet = item.state === 'paid_later';

  return (
    <li
      className={cn(
        'rounded-card border bg-paper p-4 shadow-card transition-[border-color,box-shadow] duration-200 sm:p-5',
        item.state === 'todo' ? 'border-line hover:border-line-strong/70' : 'border-line',
        quiet && 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/commandes/${order.id}`}
              className="rounded font-display text-[15px] font-semibold tracking-wide tnum text-ink underline decoration-transparent underline-offset-4 transition-colors hover:decoration-ink"
            >
              {order.reference}
            </Link>
            <StatusPill status={order.status} label={statusLabelFr(order.status)} size="sm" />
          </p>
          <p className="mt-1.5 text-[15px] leading-snug font-semibold text-ink">
            {order.customerName}
            <span className="ml-2 text-xs font-medium text-ink-muted">
              {order.locale === 'ht' ? 'écrit en kreyòl' : 'écrit en français'}
            </span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft tnum">
            <span className="font-medium text-ink">{formatUsd(order.usdCents, 'fr')}</span>
            <span aria-hidden="true">·</span>
            <span>{formatHtg(order.totalHtg)}</span>
            <span aria-hidden="true">·</span>
            <MethodBadge method={order.method} size="sm" />
          </p>
        </div>
        <p className="text-xs text-ink-muted" title={formatDateTime(order.createdAt)}>
          {orderMomentFr(order, now)}
        </p>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <StateLine item={item} now={now} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {href ? (
          <QuickWhatsApp
            orderId={order.id}
            href={href}
            journalLabel={`${MAIN_MESSAGE}@${style.defaultTone}`}
            label={item.lastContact ? 'Redemander ce qui s’est passé' : 'Demander ce qui s’est passé'}
            className="flex-1 sm:flex-none"
          />
        ) : null}
        {kit ? <WhatsAppMenu kit={kit} style={style} variant="compact" /> : null}
        <Link
          href={`/admin/commandes/${order.id}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-line-strong/70 px-3.5 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Voir la commande
        </Link>
      </div>
    </li>
  );
}

/**
 * « Relances » — every order created and never paid, and the message the
 * operator sends most to each of them: « qu'est-ce qui s'est passé ? »,
 * whose answers (the price, the payment, no time, a doubt) say what to fix.
 *
 * The default view is the work left: orders nobody has written about yet,
 * whose customer has not paid another order since, and which are not so
 * fresh that the customer may still be paying.
 */
export default async function AdminFollowUpsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = parseFollowUpView(sp.vue);
  const days = parseFollowUpDays(sp.jours);
  const now = new Date();

  const [{ items, dbReady }, settings, style] = await Promise.all([
    listFollowUps(days, now),
    getSettings(),
    getWhatsAppStyle(),
  ]);

  const shown = items.filter((item) => inView(item.state, view));
  const kits = whatsappKits(
    shown.map((item) => item.order),
    settings,
  );
  const counts: Record<FollowUpView, number> = {
    todo: items.filter((item) => inView(item.state, 'todo')).length,
    done: items.filter((item) => inView(item.state, 'done')).length,
    all: items.length,
  };

  const empty: Record<FollowUpView, string> = {
    todo: 'Personne à relancer : chaque commande non payée de la période a reçu un message, ou son client a payé depuis.',
    done: 'Aucune relance envoyée sur la période.',
    all: 'Aucune commande non payée sur la période.',
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Relances</h1>
        <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-soft">
          Les commandes créées mais jamais payées. « Demander ce qui s’est passé » ouvre WhatsApp avec le message
          déjà écrit, dans votre ton et la langue du client ; l’icône propose tous les autres messages.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vue" className="inline-flex rounded-xl border border-line bg-paper p-1 shadow-card">
          {VIEWS.map(({ value, label }) => {
            const active = value === view;
            return (
              <Link
                key={value}
                href={hrefFor(value, days)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-200',
                  active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-mist hover:text-ink',
                )}
              >
                {label}
                <span className={cn('text-xs tnum', active ? 'text-paper/70' : 'text-ink-muted')}>{counts[value]}</span>
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Période" className="flex items-center gap-1.5 text-sm">
          {FOLLOW_UP_DAYS.map((value) => (
            <Link
              key={value}
              href={hrefFor(view, value)}
              aria-current={value === days ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-full border px-3 font-medium transition-colors',
                value === days ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink-soft hover:border-ink',
              )}
            >
              {value} jours
            </Link>
          ))}
        </nav>
      </div>

      {dbReady ? null : (
        <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-8 text-center text-[15px] text-ink-soft">
          Les commandes ne peuvent pas être lues pour le moment.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong bg-paper/70 px-5 py-10 text-center text-[15px] text-ink-soft">
          {empty[view]}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((item) => (
            <FollowUpCard key={item.order.id} item={item} kit={kits[item.order.id]} style={style} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}
