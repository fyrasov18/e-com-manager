"use client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { day: "Lun", ventes: 1200 },
  { day: "Mar", ventes: 1900 },
  { day: "Mer", ventes: 1400 },
  { day: "Jeu", ventes: 2800 },
  { day: "Ven", ventes: 2100 },
  { day: "Sam", ventes: 3200 },
  { day: "Dim", ventes: 2600 },
];

export default function SalesChart() {
  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <h2 className="text-sm font-medium mb-4">Ventes — 7 derniers jours</h2>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barSize={24}>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(v: number) => [`${v} TND`, "Ventes"]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "0.5px solid var(--border)",
            }}
          />
          <Bar dataKey="ventes" fill="#D85A30" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
