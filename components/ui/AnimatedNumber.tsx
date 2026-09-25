'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that travels to its new value instead of jumping there.
 *
 * Used for the one figure a customer watches while they choose: the gourde
 * total. Tapping « 50 » after « 20 » and seeing 3 360 roll up to 8 400 says
 * « this is the same total, recomputed » in a way a swap of digits does not.
 *
 * Every state update happens inside an animation frame, never in the body of
 * the effect, and a reader who asked for reduced motion gets the new value in
 * the very next frame, without the journey.
 */
export function useTweenedNumber(target: number, duration = 460): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const from = current.current;
    if (from === target) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / duration);
      // easeOutQuart: most of the distance at once, then a long settle.
      const eased = 1 - (1 - t) ** 4;
      const next = t >= 1 ? target : from + (target - from) * eased;
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export type AnimatedNumberProps = {
  value: number;
  /** Turns the in-flight value into text; receives fractions, so round inside. */
  format: (value: number) => string;
  className?: string;
  duration?: number;
};

/**
 * The tweened figure for sighted readers, and the final one — only the final
 * one — for assistive technology: a screen reader must not hear the thirty
 * intermediate totals of a single tap.
 */
export function AnimatedNumber({ value, format, className, duration }: AnimatedNumberProps) {
  const shown = useTweenedNumber(value, duration);
  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
