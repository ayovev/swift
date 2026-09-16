import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AXIS_PROPS, NUM_AXIS_WIDTH, formatMonth, monthTickInterval } from "./chartUtils";
import type { MonthlyCount } from "@/types/dashboard";

const CONFIG = { count: { label: "Workouts", color: "var(--primary)" } } as const;

/** Workout frequency over time (FR-4.1). */
export function ConsistencyChart({ monthly }: { monthly: MonthlyCount[] }) {
  const data = monthly.map((m) => ({ ...m, label: formatMonth(m.month) }));

  return (
    <ChartContainer
      config={CONFIG}
      className="h-[260px] w-full min-w-0"
      role="img"
      aria-label={`Bar chart of workouts logged per month across ${monthly.length} months`}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" interval={monthTickInterval(data.length)} {...AXIS_PROPS} />
        <YAxis allowDecimals={false} width={NUM_AXIS_WIDTH} {...AXIS_PROPS} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
        <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
