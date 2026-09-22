import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccentPicker } from "@/components/theme/AccentPicker";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

afterEach(() => {
  localStorage.removeItem("swift.theme");
});

describe("AccentPicker", () => {
  it("previews the current accent on the trigger, with the swatch row collapsed until opened", () => {
    render(
      <ThemeProvider>
        <AccentPicker />
      </ThemeProvider>
    );

    screen.getByRole("button", { name: /accent colour: blue/i });
    expect(screen.queryByRole("radiogroup", { name: /accent colour/i })).not.toBeInTheDocument();
  });

  it("opens a row of swatches, and picking one applies it and collapses the row again", () => {
    render(
      <ThemeProvider>
        <AccentPicker />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /accent colour: blue/i }));
    const teal = screen.getByRole("radio", { name: "Teal" });
    expect(teal).toBeInTheDocument();

    fireEvent.click(teal);

    screen.getByRole("button", { name: /accent colour: teal/i });
    expect(screen.queryByRole("radio", { name: "Teal" })).not.toBeInTheDocument();
  });
});
