import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INITIAL_ROWS, WorkoutList, type WorkoutListRow } from "@/components/dashboard/WorkoutList";

/**
 * The audit list under each domain, modality and Movements chart (WorkoutList.tsx): its first rows show without a click, and a row
 * opens, as on Workouts, to the workout's description with the matched text marked.
 */

const many: WorkoutListRow[] = Array.from({ length: 73 }, (_, i) => ({ date: `24-01-${String((i % 28) + 1).padStart(2, "0")}`, title: `WOD ${i}`, reason: "deadlift", highlight: ["deadlift"] }));
const body = () => screen.getAllByRole("row").slice(1).filter((r) => !r.querySelector("[data-description]"));

describe("the workout list", () => {
  it("shows its first rows without a click, then pages", () => {
    render(<WorkoutList rows={many} emptyMessage="none" />);
    expect(body()).toHaveLength(INITIAL_ROWS);
    expect(screen.getByText(`Showing ${INITIAL_ROWS} of 73`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(body()).toHaveLength(60);
    fireEvent.click(screen.getByRole("button", { name: "Show 13 more" }));
    expect(body()).toHaveLength(73);
    expect(screen.queryByRole("button", { name: /more$/ })).not.toBeInTheDocument();
  });

  it("opens a row to its description with the matched text marked, glued words included", () => {
    const rows = [{ date: "24-10-03", title: "DIANE", reason: "deadlift", highlight: ["deadlift"] }];
    render(<WorkoutList rows={rows} emptyMessage="none" describe={() => "21-15-9DeadliftsHandstand push-ups"} />);
    const open = screen.getByRole("button", { name: /DIANE/ });
    expect(open).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded", "true");
    const desc = document.querySelector("[data-description]") as HTMLElement;
    expect(desc.textContent).toBe("21-15-9DeadliftsHandstand push-ups");
    expect(within(desc).getByText("Deadlift").tagName).toBe("MARK");
  });

  it("doesn't open a row with no description", () => {
    render(<WorkoutList rows={[{ date: "24-10-03", title: "REST", reason: "run" }]} emptyMessage="none" describe={() => undefined} />);
    expect(screen.getByRole("button", { name: /REST/ })).toBeDisabled();
  });
});
