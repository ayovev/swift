const STEPS = [
  {
    title: "Upload your export",
    body: "In SugarWOD, open your training log and choose Export Workouts. You get a CSV. That's the whole setup.",
  },
  {
    title: "We read it, right here",
    body: "Your file is parsed in this browser tab. Every workout gets sorted by what it actually asked of you. Nothing is sent anywhere.",
  },
  {
    title: "See your story",
    body: "Consistency, lifts, benchmarks, PRs, and where your training has quietly drifted over the years.",
  },
] as const;

/** The three-step explainer. */
export function HowItWorks() {
  return (
    <ol className="grid gap-6 sm:grid-cols-3">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-2">
          <span
            className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
