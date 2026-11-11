import { lazy, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyView } from "@/components/ui/LazyView";
import { lazyComponent } from "@/components/ui/lazyComponent";

afterEach(() => vi.restoreAllMocks());

describe("LazyView", () => {
  it("shows one plain loading line while the chunk is on its way, then the view", async () => {
    let arrive!: (m: { default: () => React.ReactElement }) => void;
    const View = lazy(() => new Promise<{ default: () => React.ReactElement }>((r) => (arrive = r)));
    render(
      <LazyView label="Loading the view">
        <View />
      </LazyView>
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading the view");
    expect(status).toHaveAttribute("data-view-loading");
    // House voice: stated, not cheered.
    expect(status.textContent).not.toMatch(/[!]|\.\.\./);

    arrive({ default: () => <p>The view</p> });
    expect(await screen.findByText("The view")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("is quiet at first: the line fades in after a delay rather than flashing", () => {
    const View = lazy(() => new Promise<{ default: () => React.ReactElement }>(() => {}));
    render(
      <LazyView>
        <View />
      </LazyView>
    );
    // `.loading-note` (index.css) holds the line at opacity 0 for its first 300ms.
    expect(screen.getByText("Loading")).toHaveClass("loading-note");
  });

  it("reserves a view's height, so what sits below it does not jump", () => {
    const View = lazy(() => new Promise<{ default: () => React.ReactElement }>(() => {}));
    render(
      <LazyView>
        <View />
      </LazyView>
    );
    expect(screen.getByRole("status").className).toContain("min-h-[28rem]");
  });

  it("says plainly when a chunk cannot be fetched, instead of leaving a blank page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const View = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
    render(
      <LazyView>
        <View />
      </LazyView>
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This part of the page didn't load. Reload to try again.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(alert.textContent).not.toMatch(/[!]|oops|sorry/i);
  });
});

describe("lazyComponent", () => {
  it("renders at once once its chunk has arrived, with no fallback and no wait", async () => {
    const module = Promise.resolve({ default: () => <p>Loaded view</p> });
    const view = lazyComponent(() => module);
    view.preload();
    await module;
    await act(async () => {}); // let the preload's own .then record the component
    render(
      <LazyView>
        <view.Component />
      </LazyView>
    );
    // Synchronous: found by getBy, not findBy, and never behind a status line.
    expect(screen.getByText("Loaded view")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("suspends when the chunk has not arrived, and a mount that waited keeps its state afterwards", async () => {
    let arrive!: () => void;
    const Counter = () => {
      const [n, setN] = useState(0);
      return <button onClick={() => setN(n + 1)}>count {n}</button>;
    };
    const view = lazyComponent(() => new Promise<{ default: typeof Counter }>((r) => (arrive = () => r({ default: Counter }))));
    const { rerender } = render(
      <LazyView>
        <view.Component />
      </LazyView>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    arrive();
    const button = await screen.findByRole("button", { name: "count 0" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument();
    // The chunk is now loaded, and a re-render must not swap this mount for a fresh copy.
    rerender(
      <LazyView>
        <view.Component />
      </LazyView>
    );
    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument();
  });
});
