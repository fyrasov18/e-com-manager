// MetricCard
interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}

export default function MetricCard({ label, value, sub, danger }: MetricCardProps) {
  return (
    <div className="bg-secondary rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-medium">{value}</p>
      {sub && (
        <p className={`text-xs mt-1 ${danger ? "text-red-500" : "text-muted-foreground"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
