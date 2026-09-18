import { SegmentedControl } from "./SegmentedControl";
import { GRANULARITY_OPTIONS, type Granularity } from "@/lib/analytics/granularity";
import { capture } from "@/lib/posthog";

interface GranularityPickerProps {
  value: Granularity;
  onChange: (granularity: Granularity) => void;
}

/**
 * How finely the trend charts bucket time. A segmented control rather than
 * DateRangePicker's popover — there's no custom sub-case here that needs a
 * panel of its own.
 */
export function GranularityPicker({ value, onChange }: GranularityPickerProps) {
  const select = (id: Granularity) => {
    if (id === value) return;
    onChange(id);
    capture({ name: "granularity_changed", props: { granularity: id } });
  };

  return (
    <SegmentedControl
      value={value}
      onChange={select}
      options={GRANULARITY_OPTIONS}
      ariaLabel="Chart granularity"
    />
  );
}
