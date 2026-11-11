import { lazy, useState, type ComponentProps, type ComponentType } from "react";

/**
 * `React.lazy` with a way to have the code ready before it is rendered, and no cost once it is.
 *
 * Plain `React.lazy` always suspends the first time it renders, even when the chunk is already in the browser, because the
 * module arrives as a promise. React then commits the fallback and holds the real content back for about 300ms so the
 * fallback does not flicker. That would make every view slower to open than it was before the split, whether or not
 * its chunk had been fetched. So once a chunk has arrived (`preload()`, or an earlier render), a new mount uses the
 * component itself and renders synchronously, exactly as a static import would. Only a mount that really has to wait
 * suspends and shows the fallback.
 *
 * Which one a mount uses is decided once, when it mounts (`useState`), so a mount that suspended keeps its own state when
 * the chunk lands rather than being replaced by a fresh copy.
 */
// `any` is the constraint React itself uses for "some component": the props are recovered from C below, so callers stay fully typed.
export function lazyComponent<C extends ComponentType<any>>(loader: () => Promise<{ default: C }>) {
  let loaded: C | null = null;
  const load = () =>
    loader().then((m) => {
      loaded = m.default;
      return m;
    });
  const Lazy = lazy(load) as unknown as C;

  function Component(props: ComponentProps<C>) {
    const [Impl] = useState<C>(() => loaded ?? Lazy);
    return <Impl {...props} />;
  }

  return {
    Component,
    /** Fetch the chunk now. Safe to call repeatedly; a failure is left for the render that needs it to report. */
    preload: (): void => {
      void load().catch(() => {});
    },
    /**
     * Resolves once the chunk has arrived, or has failed to (it never rejects). For an action that mounts the component
     * itself, such as a button that opens a dialog: wait here, then mount, and the mount renders at once with no
     * Suspense hold-back at all. A failure falls through to the mount, whose boundary reports it.
     */
    whenLoaded: (): Promise<void> => load().then(
      () => {},
      () => {}
    ),
  };
}
