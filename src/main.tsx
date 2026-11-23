import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { capture, initAnalytics } from "./lib/posthog";
import "./index.css";

initAnalytics();
capture({ name: "app_opened" });

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

// Dev-only print prototype for Reports (docs/reports.md); `import.meta.env.DEV` is false in a build, so none of it ships.
const prototype = import.meta.env.DEV && location.search.includes("report-prototype");

const root = createRoot(container);
if (prototype) {
  void import("./devReportPrototype").then(({ DevReportPrototype }) =>
    root.render(
      <ThemeProvider>
        <DevReportPrototype />
      </ThemeProvider>
    )
  );
} else {
  root.render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
}
