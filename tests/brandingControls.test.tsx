import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSheet } from "@/components/dashboard/SettingsSheet";
import { BrandMark } from "@/components/BrandMark";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { clearBrand, getBrand, updateBrand } from "@/lib/brand/brandStore";
import { LogoError } from "@/lib/brand/image";

const captured = vi.hoisted(() => ({ calls: [] as unknown[] }));
const normalise = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog", async (orig) => ({
  ...(await orig<typeof import("@/lib/posthog")>()),
  capture: (event: unknown) => void captured.calls.push(event),
}));
vi.mock("@/lib/brand/image", async (orig) => ({
  ...(await orig<typeof import("@/lib/brand/image")>()),
  normaliseLogo: normalise,
}));

const PNG = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(() => {
  captured.calls = [];
  normalise.mockReset();
});
afterEach(() => {
  cleanup();
  clearBrand();
  localStorage.clear();
});

function renderSheet() {
  render(
    <ThemeProvider>
      <SettingsSheet
        source="upload"
        workoutRows={[]}
        onWorkoutFile={vi.fn()}
        bodyComp={{ status: "idle" }}
        onBodyCompFile={vi.fn()}
        timeline={[]}
        weighIns={[]}
        syncOutgoing={[]}
        onSyncedWorkoutData={vi.fn()}
        onSyncedBodyCompData={vi.fn()}
        onSyncedTimeline={vi.fn()}
        onSyncedWeighIns={vi.fn()}
        onReset={vi.fn()}
      />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
}

describe("Branding in Settings", () => {
  it("is shown to a coach and hidden from an athlete, who keeps nothing deleted", async () => {
    localStorage.setItem("swift.audience", "athlete");
    updateBrand({ name: "Iron Works" });
    renderSheet();
    await screen.findByRole("region", { name: "Role" });
    expect(screen.queryByRole("region", { name: "Branding" })).toBeNull();
    expect(getBrand().name).toBe("Iron Works");
  });

  it("saves the gym name on blur and reports only that something was saved", async () => {
    localStorage.setItem("swift.audience", "coach");
    renderSheet();
    const input = await screen.findByLabelText("Gym name");
    fireEvent.change(input, { target: { value: "Iron Works" } });
    fireEvent.blur(input);
    expect(getBrand().name).toBe("Iron Works");
    expect(captured.calls).toEqual([{ name: "interaction_used", props: { interaction: "brand_saved" } }]);
    expect(JSON.stringify(captured.calls)).not.toContain("Iron");
  });

  it("stores a normalised logo and shows a plain sentence for a file it refuses", async () => {
    localStorage.setItem("swift.audience", "coach");
    renderSheet();
    const region = await screen.findByRole("region", { name: "Branding" });
    const input = region.querySelector<HTMLInputElement>('input[type="file"]')!;

    normalise.mockRejectedValueOnce(new LogoError("not_an_image"));
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "logo.svg", { type: "image/svg+xml" })] } });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("That file isn't a PNG, JPEG or WebP image.");
    expect(getBrand().logo).toBeUndefined();

    normalise.mockResolvedValueOnce({ dataUrl: PNG, tone: { luminance: 0.5, transparent: false } });
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    });
    await waitFor(() => expect(getBrand().logo).toBe(PNG));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(JSON.stringify(captured.calls)).not.toContain("base64");
  });

  it("picking a colour switches the accent to it, and Remove branding clears everything after a confirmation", async () => {
    localStorage.setItem("swift.audience", "coach");
    updateBrand({ name: "Iron Works", logo: PNG });
    renderSheet();
    const color = await screen.findByLabelText("Brand colour");
    fireEvent.change(color, { target: { value: "#7c3aed" } });
    expect(getBrand().color).toBe("#7c3aed");
    expect(document.documentElement.getAttribute("data-accent")).toBe("brand");

    fireEvent.click(screen.getByRole("button", { name: "Remove branding" }));
    expect(getBrand().name).toBe("Iron Works");
    // The dialog's confirm button carries the same label as the trigger; it is the last one in the document.
    fireEvent.click((await screen.findAllByRole("button", { name: "Remove branding" })).at(-1)!);
    await waitFor(() => expect(getBrand()).toEqual({}));
    await waitFor(() => expect(document.documentElement.getAttribute("data-accent")).toBe("blue"));
    expect(captured.calls).toContainEqual({ name: "interaction_used", props: { interaction: "brand_removed" } });
    expect(JSON.stringify(captured.calls)).not.toMatch(/7c3aed|Iron/);
  });
});

describe("Branding buttons say what they act on", () => {
  it("gives the logo and colour buttons their own names, distinct from Remove branding", async () => {
    localStorage.setItem("swift.audience", "coach");
    updateBrand({ logo: PNG, color: "#7c3aed" });
    renderSheet();
    const region = await screen.findByRole("region", { name: "Branding" });
    for (const name of ["Remove logo", "Clear brand colour", "Replace logo", "Remove branding"]) {
      expect(within(region).getByRole("button", { name })).toBeInTheDocument();
    }
  });
});

describe("BrandMark", () => {
  it("renders nothing without a logo", () => {
    render(<ThemeProvider><BrandMark /></ThemeProvider>);
    expect(screen.queryByTestId("brand-mark")).toBeNull();
  });

  it("uses the gym name as the alt text, or a plain fallback", () => {
    updateBrand({ logo: PNG, name: "Iron Works" });
    const { rerender } = render(<ThemeProvider><BrandMark /></ThemeProvider>);
    expect(screen.getByRole("img", { name: "Iron Works" })).toHaveAttribute("src", PNG);
    act(() => updateBrand({ name: undefined }));
    rerender(<ThemeProvider><BrandMark /></ThemeProvider>);
    expect(screen.getByRole("img", { name: "Gym logo" })).toBeInTheDocument();
  });
});
