import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeControls } from "@/components/theme/ThemeControls";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

afterEach(() => {
  localStorage.removeItem("swift.theme");
});

function renderControls() {
  return render(
    <ThemeProvider>
      <ThemeControls />
    </ThemeProvider>
  );
}

describe("ThemeControls", () => {
  it("previews the current accent on the trigger, with the swatch row collapsed until opened", () => {
    renderControls();

    screen.getByRole("button", { name: /accent colour: blue/i });
    expect(screen.queryByRole("radiogroup", { name: /accent colour/i })).not.toBeInTheDocument();
    // The mode buttons live in the same container, no separate widget to open.
    screen.getByRole("radio", { name: "Light" });
  });

  it("opens a row of swatches, and picking one applies it and collapses the row again", () => {
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: /accent colour: blue/i }));
    const teal = screen.getByRole("radio", { name: "Teal" });
    expect(teal).toBeInTheDocument();

    fireEvent.click(teal);

    screen.getByRole("button", { name: /accent colour: teal/i });
    expect(screen.queryByRole("radio", { name: "Teal" })).not.toBeInTheDocument();
  });

  it("switches colour mode from the same pill", () => {
    renderControls();

    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(dark).toHaveAttribute("aria-checked", "false");

    fireEvent.click(dark);

    expect(dark).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
