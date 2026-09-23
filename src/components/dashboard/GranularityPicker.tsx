import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { GRANULARITY_OPTIONS, MAX_DAILY_SPAN_DAYS, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";

interface GranularityPickerProps {
  value: Granularity;
  onChange: (granularity: Granularity) => void;
  /** True once the selected range (or the full log, at "all time") outgrows daily's legibility. */
  dailyDisabled: boolean;
}

const DAILY_DISABLED_REASON = `Not available for a range over ${Math.round(MAX_DAILY_SPAN_DAYS / 365)} year — pick a narrower range to use it.`;

/**
 * How finely the trend charts bucket time. A segmented control rather than
 * DateRangePicker's popover — there's no custom sub-case here that needs a
 * panel of its own.
 */
export function GranularityPicker({ value, onChange, dailyDisabled }: GranularityPickerProps) {
  const select = (id: Granularity) => {
    if (id === value) return;
    onChange(id);
    capture({ name: "granularity_changed", props: { granularity: id } });
  };

  const options: readonly SegmentedControlOption<Granularity>[] = GRANULARITY_OPTIONS.map((o) =>
    o.id === "daily" && dailyDisabled
      ? { ...o, disabled: true, title: DAILY_DISABLED_REASON }
      : o
  );

  return (
    <SegmentedControl value={value} onChange={select} options={options} ariaLabel="Chart granularity" />
  );
}
