import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExportSource {
  id: string;
  label: string;
  steps: readonly string[];
}

/**
 * The SugarWOD steps up to the CSV, shared with the stale-log nudge ("How to
 * export"). The last step differs by where it is read, so each caller adds its own.
 */
export const SUGARWOD_EXPORT_STEPS: readonly string[] = [
  "Open SugarWOD and go to your training log.",
  "Choose Export Workouts.",
  "Pick a date range — your full history gives Swift the most to work with.",
];

const SOURCES: readonly ExportSource[] = [
  {
    id: "sugarwod",
    label: "SugarWOD",
    steps: [...SUGARWOD_EXPORT_STEPS, "SugarWOD gives you a CSV. That's the file to drop in above."],
  },
  {
    id: "inbody",
    label: "InBody",
    steps: [
      "Open the InBody app and go to your result history.",
      "Tap Export or Share on a scan, and choose CSV.",
      "Include as many past scans as you want tracked.",
      "That CSV goes on the Body Comp tab, once you're in the dashboard.",
    ],
  },
] as const;

/** A numbered list of export steps, in a bordered box. */
export function ExportStepList({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3 rounded-lg border border-border p-4">
      {steps.map((step, i) => (
        <li key={step} className="flex gap-3">
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold tabular"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** Collapsed by default — a step-by-step guide for athletes who don't have their export yet. */
export function ExportGuide() {
  return (
    <Collapsible className="mt-6">
      <CollapsibleTrigger asChild>
        <Button variant="link" size="sm" className="group h-auto p-0 text-xs">
          Don't have your export yet?
          <ChevronDown
            className="size-3 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Tabs defaultValue="sugarwod" className="mx-auto mt-5 max-w-md text-left">
          <TabsList className="mx-auto">
            {SOURCES.map((source) => (
              <TabsTrigger key={source.id} value={source.id}>
                {source.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SOURCES.map((source) => (
            <TabsContent key={source.id} value={source.id}>
              <ExportStepList steps={source.steps} />
            </TabsContent>
          ))}
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
