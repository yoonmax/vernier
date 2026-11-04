import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { binTimeline } from '../stats/metrics.js';

/**
 * Hits over a session. One series, so one neutral colour and no legend; the title says what
 * it is. Every bar shows its exact value on hover. Sessions too long for one bar per second
 * show the average across equal spans, so an endless run still fits.
 */
export function SessionTimeline({ timeline, title }) {
  const root = useRef(null);
  const [active, setActive] = useState(null);
  const { span, bars } = binTimeline(timeline);
  const peak = Math.max(1, ...bars);
  const seconds = timeline.length;
  const formatValue = (value) => (span === 1 ? String(value) : value.toFixed(1));
  const describe = (index) => {
    if (span === 1) return `Second ${index + 1}: ${bars[index]} hits`;
    return `${index * span}–${Math.min(seconds, (index + 1) * span)} s: ${formatValue(bars[index])} hits per second`;
  };

  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const bars = root.current?.querySelectorAll('[data-bar]');
    if (!bars?.length) return undefined;
    const tween = gsap.from(bars, {
      scaleY: 0,
      transformOrigin: 'bottom',
      duration: 0.6,
      stagger: { amount: 0.5 },
      ease: 'expo.out',
    });
    return () => tween.revert();
  }, []);

  if (seconds === 0) return null;
  const shown = active ?? null;

  return (
    <figure className="m-0" ref={root}>
      <figcaption className="flex items-baseline justify-between text-sm text-ink-soft">
        <span>{title}</span>
        <span className="type-readout text-ink" aria-live="polite">
          {shown === null ? `Peak ${formatValue(peak)} per second` : describe(shown)}
        </span>
      </figcaption>
      <div
        className="mt-3 flex h-20 items-end gap-[2px] border-b border-rule"
        role="img"
        aria-label={`${title}. ${seconds} seconds, peaking at ${formatValue(peak)} hits per second.`}
        onMouseLeave={() => setActive(null)}
      >
        {bars.map((count, index) => (
          <div
            key={index}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            onMouseEnter={() => setActive(index)}
          >
            <div
              data-bar
              className="w-full max-w-[12px] rounded-t-[3px]"
              style={{
                height: count > 0 ? `${Math.max(4, (count / peak) * 100)}%` : 0,
                background: 'var(--bar)',
                opacity: active === null || active === index ? 1 : 0.35,
              }}
            />
          </div>
        ))}
      </div>
      <div className="type-readout mt-1 flex justify-between text-[13px] text-ink-soft">
        <span>0 s</span>
        <span>{seconds} s</span>
      </div>
    </figure>
  );
}

/**
 * Accuracy across recent sessions, oldest on the left. A crosshair on hover reads out the
 * exact session. The table beneath it on the statistics screen holds the same data as text.
 */
export function AccuracyTrend({ sessions }) {
  const [active, setActive] = useState(null);
  const svg = useRef(null);
  const width = 640;
  const height = 120;
  const pad = { top: 8, bottom: 8 };

  if (sessions.length < 2) return null;

  const x = (index) => (index / (sessions.length - 1)) * width;
  const y = (value) => pad.top + (1 - value) * (height - pad.top - pad.bottom);
  const path = sessions.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(s.accuracy).toFixed(1)}`).join('');
  const focus = active === null ? sessions[sessions.length - 1] : sessions[active];
  const focusIndex = active === null ? sessions.length - 1 : active;

  const handleMove = (event) => {
    const box = svg.current.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setActive(Math.round(fraction * (sessions.length - 1)));
  };

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between text-sm text-ink-soft">
        <span>Accuracy, last {sessions.length} sessions</span>
        <span className="type-readout text-ink">
          {focus.modeName}: {(focus.accuracy * 100).toFixed(1)}%
        </span>
      </figcaption>
      <svg
        ref={svg}
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 block h-28 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label="Accuracy across recent sessions. The same values are listed in the table below."
        onMouseMove={handleMove}
        onMouseLeave={() => setActive(null)}
      >
        {[0, 0.5, 1].map((value) => (
          <line key={value} x1="0" x2={width} y1={y(value)} y2={y(value)} stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={0} y2={height} stroke="var(--ink-faint)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        <path d={path} fill="none" stroke="var(--bar)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle
          cx={x(focusIndex)}
          cy={y(focus.accuracy)}
          r="4"
          fill="var(--bar)"
          stroke="var(--paper)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="type-readout mt-1 flex justify-between text-[13px] text-ink-soft">
        <span>Older</span>
        <span>Latest</span>
      </div>
    </figure>
  );
}
