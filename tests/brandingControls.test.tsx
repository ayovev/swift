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

describe("Colours in the logo", () => {
  it("offers the colours a new logo is made of, and applies one only when it is picked", async () => {
    localStorage.setItem("swift.audience", "coach");
    renderSheet();
    const region = await screen.findByRole("region", { name: "Branding" });
    const input = region.querySelector<HTMLInputElement>('input[type="file"]')!;
    normalise.mockResolvedValueOnce({ dataUrl: PNG, tone: { luminance: 0.5, transparent: false }, palette: ["#dc2626", "#2563eb"] });
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    });
    await waitFor(() => expect(getBrand().palette).toEqual(["#dc2626", "#2563eb"]));
    // Offered, not applied: the colour and the accent are untouched.
    expect(getBrand().color).toBeUndefined();
    expect(document.documentElement.getAttribute("data-accent")).toBe("blue");

    const group = within(region).getByRole("group", { name: "Colours in your logo" });
    const [first, second] = within(group).getAllByRole("button");
    expect(first).toHaveTextContent("#dc2626");
    expect(first).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(second!);
    expect(getBrand().color).toBe("#2563eb");
    expect(document.documentElement.getAttribute("data-accent")).toBe("brand");
    expect(within(group).getByRole("button", { name: "#2563eb" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "#dc2626" })).toHaveAttribute("aria-pressed", "false");
    // The pick is reported as a bare save, never the colour.
    expect(JSON.stringify(captured.calls)).not.toMatch(/2563eb|dc2626/i);
  });

  it("does not overwrite a colour the coach already chose when a new logo arrives", async () => {
    localStorage.setItem("swift.audience", "coach");
    updateBrand({ logo: PNG, color: "#16a34a", palette: [] });
    renderSheet();
    const region = await screen.findByRole("region", { name: "Branding" });
    normalise.mockResolvedValueOnce({ dataUrl: PNG, tone: { luminance: 0.5, transparent: false }, palette: ["#dc2626"] });
    await act(async () => {
      fireEvent.change(region.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });
    });
    await waitFor(() => expect(getBrand().palette).toEqual(["#dc2626"]));
    expect(getBrand().color).toBe("#16a34a");
  });

  it("says so when the logo has no colour, and shows nothing for a brand saved before suggestions existed", async () => {
    localStorage.setItem("swift.audience", "coach");
    updateBrand({ logo: PNG, palette: [] });
    renderSheet();
    const region = await screen.findByRole("region", { name: "Branding" });
    expect(region).toHaveTextContent("This logo has no distinct colour to suggest.");
    expect(within(region).queryByRole("group", { name: "Colours in your logo" })).toBeNull();
    act(() => updateBrand({ palette: undefined }));
    await waitFor(() => expect(region).not.toHaveTextContent("no distinct colour"));
  });

  it("takes the suggestions away with the logo", async () => {
    localStorage.setItem("swift.audience", "coach");
    updateBrand({ logo: PNG, palette: ["#dc2626"] });
    renderSheet();
    const region = await screen.findByRole("region", { name: "Branding" });
    fireEvent.click(within(region).getByRole("button", { name: "Remove logo" }));
    expect(getBrand().palette).toBeUndefined();
    expect(within(region).queryByRole("group", { name: "Colours in your logo" })).toBeNull();
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
