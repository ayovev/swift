import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Landing } from "@/components/landing/Landing";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { readAudience } from "@/lib/audience";

function renderLanding(over: { loading?: boolean; error?: string | null } = {}) {
  return render(
    <ThemeProvider>
      <Landing
        loading={over.loading ?? false}
        reveal={null}
        error={over.error ?? null}
        onFile={vi.fn()}
        onSample={vi.fn()}
        onDismissError={vi.fn()}
        onSyncedWorkoutData={vi.fn()}
        onSyncedBodyCompData={vi.fn()}
        onSyncedTags={vi.fn()}
      />
    </ThemeProvider>
  );
}

describe("Landing splash", () => {
  beforeEach(() => localStorage.removeItem("swift.audience"));

  it("shows both sides on a first visit", () => {
    renderLanding();
    expect(screen.getByRole("button", { name: /continue as an athlete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue as a coach/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload your sugarwod csv export/i })).toBeNull();
  });

  it("remembers an athlete choice and shows the upload page", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /continue as an athlete/i }));
    expect(readAudience()).toBe("athlete");
    expect(screen.getByRole("button", { name: /upload your sugarwod csv export/i })).toBeInTheDocument();
    expect(screen.getByText(/upload your sugarwod export/i)).toBeInTheDocument();
  });

  it("uses coach copy after choosing coach, and can switch back", () => {
    renderLanding();
    fireEvent.click(screen.getByRole("button", { name: /continue as a coach/i }));
    expect(readAudience()).toBe("coach");
    expect(screen.getByText(/an athlete sends you/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I'm an athlete" }));
    expect(readAudience()).toBe("athlete");
    expect(screen.queryByText(/an athlete sends you/i)).toBeNull();
  });

  it("skips the splash once a choice is stored", () => {
    localStorage.setItem("swift.audience", "coach");
    renderLanding();
    expect(screen.queryByRole("button", { name: /continue as a coach/i })).toBeNull();
  });

  it("keeps the page it is on while an upload is loading or has failed", () => {
    const { unmount } = renderLanding({ loading: true });
    expect(screen.queryByRole("button", { name: /continue as/i })).toBeNull();
    unmount();
    renderLanding({ error: "bad file" });
    expect(screen.getByText("bad file")).toBeInTheDocument();
  });
});

describe("Landing splash takeover", () => {
  beforeEach(() => localStorage.removeItem("swift.audience"));

  it("lets the chosen side fill the screen before applying the choice, and ignores a second click", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    try {
      renderLanding();
      fireEvent.click(screen.getByRole("button", { name: /continue as a coach/i }));
      fireEvent.click(screen.getByRole("button", { name: /continue as an athlete/i }));
      expect(readAudience()).toBeNull();
      act(() => void vi.advanceTimersByTime(500));
      expect(readAudience()).toBe("coach");
      expect(screen.getByRole("button", { name: /upload your sugarwod csv export/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
