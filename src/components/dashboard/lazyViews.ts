import { lazyComponent } from "@/components/ui/lazyComponent";

/**
 * The dashboard's views, fetched on demand (`lazyComponent`), except Overview, which is the page everyone lands on and
 * stays in the main chunk. Splitting them keeps the first load to what Overview needs; it is not a way to make a
 * view slower to open, which is what `preloadViews()` is for.
 *
 * A view that is already fetched renders at once, as a static import would
 * (see lazyComponent.tsx for why plain `React.lazy` does not), so after the page has settled `preloadViews()` fetches the rest, in the
 * background and idle time, never ahead of anything on screen. A name is added here once, and Dashboard.tsx renders it
 * inside a `<Suspense>`. tests/lazySplit.test.ts fails if one of these is imported statically again.
 */
const workouts = lazyComponent(() => import("./WorkoutsTab").then((m) => ({ default: m.WorkoutsTab })));
const liftHistory = lazyComponent(() => import("./LiftHistoryTab").then((m) => ({ default: m.LiftHistoryTab })));
const domain = lazyComponent(() => import("./DomainTab").then((m) => ({ default: m.DomainTab })));
const modality = lazyComponent(() => import("./ModalityTab").then((m) => ({ default: m.ModalityTab })));
const movements = lazyComponent(() => import("./MovementsTab").then((m) => ({ default: m.MovementsTab })));
const bodyComp = lazyComponent(() => import("./BodyCompTab").then((m) => ({ default: m.BodyCompTab })));
const progress = lazyComponent(() => import("./LiftsTab").then((m) => ({ default: m.LiftsTab })));
const timeline = lazyComponent(() => import("./TimelineTab").then((m) => ({ default: m.TimelineTab })));

export const WorkoutsTab = workouts.Component;
export const LiftHistoryTab = liftHistory.Component;
export const DomainTab = domain.Component;
export const ModalityTab = modality.Component;
export const MovementsTab = movements.Component;
export const BodyCompTab = bodyComp.Component;
export const LiftsTab = progress.Component;
export const TimelineTab = timeline.Component;

const ALL = [workouts, liftHistory, domain, modality, movements, bodyComp, progress, timeline];

let preloading = false;

/**
 * Fetch every view's chunk, once, when the browser is idle. Failures are ignored on purpose: a view that did not
 * preload is simply fetched when it is opened, and a failure there reaches the app's error boundary like any other.
 */
export function preloadViews(): void {
  if (preloading) return;
  preloading = true;
  const run = () => {
    for (const view of ALL) view.preload();
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 500);
}
