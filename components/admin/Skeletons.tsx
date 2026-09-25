/**
 * The shapes of the admin pages while their data is on its way. Next shows
 * them the instant a link is followed (`loading.tsx`), so a tap answers at
 * once even though every page reads the database first; the real page then
 * takes their place with the same outline, and nothing jumps.
 */

function Line({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

function Rows({ count }: { count: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-paper shadow-card">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
          <div className="flex-1 space-y-2">
            <Line className="h-4 w-32" />
            <Line className="h-3 w-48" />
          </div>
          <Line className="hidden h-4 w-20 md:block" />
          <Line className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="space-y-8" role="status" aria-label={label}>
      <div className="space-y-2">
        <Line className="h-9 w-56" />
        <Line className="h-4 w-72" />
      </div>
      <Line className="h-32 w-full rounded-[1.75rem]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Line className="h-64 rounded-card" />
        <Line className="h-64 rounded-card" />
      </div>
      <Rows count={5} />
    </div>
  );
}

export function ListSkeleton({ label = 'Chargement des commandes…' }: { label?: string }) {
  return (
    <div className="space-y-5" role="status" aria-label={label}>
      <div className="space-y-2">
        <Line className="h-9 w-48" />
        <Line className="h-4 w-64" />
      </div>
      <Line className="h-12 w-full rounded-2xl" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Line key={index} className="h-10 w-24 rounded-full" />
        ))}
      </div>
      <Rows count={8} />
    </div>
  );
}

export function OrderSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement de la commande…">
      <div className="space-y-3">
        <Line className="h-5 w-28" />
        <Line className="h-9 w-64" />
        <Line className="h-4 w-80" />
      </div>
      <Line className="h-44 w-full rounded-[1.75rem]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <Line className="order-2 h-96 rounded-card lg:order-1" />
        <div className="order-1 space-y-6 lg:order-2">
          <Line className="h-72 rounded-card" />
          <Line className="h-56 rounded-card" />
        </div>
      </div>
    </div>
  );
}
