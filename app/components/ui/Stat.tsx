type StatProps = {
  value: string | number;
  label: string;
  className?: string;
};

/** Hero number + small muted label — for big standout stats. */
export default function Stat({ value, label, className = "" }: StatProps) {
  return (
    <div className={className}>
      <div className="text-3xl font-extrabold tracking-tight text-text">{value}</div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}
