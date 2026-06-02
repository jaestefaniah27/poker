const TurnPie = ({ fraction, danger }: { fraction: number; danger?: boolean }) => {
  const r = 10, cx = 12, cy = 12;
  const bright = danger ? '#ef4444' : '#22c55e';
  const dark = danger ? '#7f1d1d' : '#14532d';
  const f = Math.max(0, Math.min(0.9999, fraction));
  const rad = (d: number) => (d * Math.PI) / 180;
  const a0 = -90, a1 = -90 + 360 * f;
  const x1 = cx + r * Math.cos(rad(a0)), y1 = cy + r * Math.sin(rad(a0));
  const x2 = cx + r * Math.cos(rad(a1)), y2 = cy + r * Math.sin(rad(a1));
  const large = f > 0.5 ? 1 : 0;
  const sector = fraction <= 0 ? '' : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="drop-shadow-md">
      <circle cx={cx} cy={cy} r={r} fill={dark} />
      {sector && <path d={sector} fill={bright} />}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
    </svg>
  );
};

export default TurnPie;
