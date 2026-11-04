import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';

/** Tracks the vertical centre of the item the index mark should point at. */
export function useVernierIndex(container) {
  const [position, setPosition] = useState(null);

  const moveTo = useCallback(
    (element) => {
      if (!container.current || !element) return;
      const outer = container.current.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      setPosition(inner.top - outer.top + inner.height / 2);
    },
    [container],
  );

  useLayoutEffect(() => {
    const first = container.current?.querySelector('button');
    if (first) moveTo(first);
  }, [container, moveTo]);

  return { position, moveTo };
}

/**
 * The menu's signature: a fixed scale with a sliding scale beside it. Moving between items
 * slides the red index along the main scale, and the sliding scale travels a little further
 * than the index, so the marks visibly pass one another as they would on an instrument.
 */
export function VernierIndex({ position }) {
  const index = useRef(null);
  const slide = useRef(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    if (position === null) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = placed.current && !reduced ? 0.55 : 0;
    gsap.to(index.current, { y: position, duration, ease: 'expo.out', overwrite: true });
    gsap.to(slide.current, { y: position - 45, duration, ease: 'expo.out', overwrite: true });
    placed.current = true;
  }, [position]);

  return (
    <div className="absolute inset-y-0 left-0 w-6" aria-hidden="true">
      <div className="scale-main-y absolute inset-y-0 left-0" />
      <div ref={slide} className="scale-slide-y absolute left-3.5 top-0 h-[91px]" />
      <div ref={index} className="absolute left-0 top-0 h-0.5 w-6 -translate-y-px bg-index" />
    </div>
  );
}
