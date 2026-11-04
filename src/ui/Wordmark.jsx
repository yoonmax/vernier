/**
 * The logo: the name above a real vernier reading. The lower scale's marks are 9/10 as far
 * apart as the upper's, so exactly one pair lines up. That pair is marked in red.
 */
export function Wordmark({ size = 'small' }) {
  const large = size === 'large';
  const unit = large ? 10 : 6;
  const count = 21;
  const alignAt = 7;
  const width = unit * (count - 1) + 2;
  const height = large ? 22 : 14;
  const middle = height / 2;

  const upper = Array.from({ length: count }, (_, i) => {
    const x = i * unit + 0.5;
    const tall = i % 5 === 0;
    return <line key={`u${i}`} x1={x} x2={x} y1={middle - 1 - (tall ? middle - 1 : (middle - 1) * 0.55)} y2={middle - 1} />;
  });

  const lower = Array.from({ length: 11 }, (_, i) => {
    const x = alignAt * unit + (i - 4) * unit * 0.9 + 0.5;
    const aligned = i === 4;
    return (
      <line
        key={`l${i}`}
        x1={x}
        x2={x}
        y1={middle + 1}
        y2={height}
        stroke={aligned ? 'var(--index)' : undefined}
        strokeWidth={aligned ? 1.6 : undefined}
      />
    );
  });

  return (
    <div className="inline-block">
      <div className={`type-display ${large ? 'text-5xl lg:text-6xl' : 'text-xl'}`}>Vernier</div>
      <svg
        className={large ? 'mt-3' : 'mt-1.5'}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        stroke="var(--ink)"
        strokeWidth="1"
      >
        {upper}
        {lower}
      </svg>
    </div>
  );
}
