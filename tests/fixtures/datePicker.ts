import { fireEvent, screen, within } from "@testing-library/react";
import dayjs from "dayjs";
import { formatDate } from "@/components/dashboard/charts/chartUtils";

/** The popover calendar's own heading ("February 2026"); there is one open at a time. */
function shownMonth(dialog: HTMLElement) {
  const caption = dialog.querySelector("[aria-live]")?.textContent ?? "";
  return dayjs(caption, "MMMM YYYY");
}

/** Opens a `DatePickerField` by its label, steps to the month and clicks the day. Navigation is by the calendar's own month buttons. */
export function pickDate(label: string, iso: string) {
  fireEvent.click(screen.getByLabelText(label));
  const dialog = screen.getByRole("dialog");
  const target = dayjs(iso);
  for (let i = 0; i < 240; i++) {
    const diff = target.startOf("month").diff(shownMonth(dialog), "month");
    if (diff === 0) break;
    fireEvent.click(within(dialog).getByRole("button", { name: diff < 0 ? /previous month/i : /next month/i }));
  }
  fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(`${target.format("MMMM")} ${target.date()}(?:st|nd|rd|th), ${target.year()}`) }));
}

/** What a `DatePickerField` shows for an ISO value (it is a button, not an input, so no `toHaveValue`). */
export const shown = (iso: string) => formatDate(iso);
