import { notFound } from 'next/navigation';

/**
 * Any path under a valid locale that no page claims lands here and renders
 * the localised `not-found.tsx` (instead of the bare root 404).
 */
export default function CatchAllPage(): never {
  notFound();
}
