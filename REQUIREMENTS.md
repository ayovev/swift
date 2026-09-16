# Swift — Version 1 Requirements Document

*SugarWOD training-insights tool*

**Owner:** Alex
**Status:** Draft — v1 scope
**Last updated:** September 15, 2026

---

## 1. Overview

Swift is a web application that lets an athlete upload their personal SugarWOD training-history CSV export and receive an interactive dashboard of insights: training consistency over time, lift and benchmark progression, PR history, and a breakdown of training emphasis across the ten CrossFit general physical skills (GPP domains).

Swift began as a proof-of-concept built against the owner's own ~4-year, ~1,200-entry SugarWOD export, and is being productionized as a public tool any SugarWOD athlete can use by uploading their own export.

### 1.1 Goals

- Let any SugarWOD athlete self-serve insight into their own training history without any manual data entry.
- Present training data in a way that tells a personal progress story, not just raw stats.
- Ship a v1 that is simple to build, host, and maintain as a solo-maintained project.

### 1.2 Non-Goals (v1)

- No user accounts, login, or persistence of uploaded data across sessions.
- No direct SugarWOD API integration — v1 relies on the member-initiated CSV export/upload flow.
- No admin dashboard, multi-athlete comparison, or coach-facing views.
- No mobile app — responsive web only.

---

## 2. Migration Notes (PoC → Swift)

Swift is a rename and rebuild of an existing local proof-of-concept, not a greenfield project with no prior art. The PoC currently lives at `/Users/alexyovev/projects/stride` and is not under version control.

| Aspect | Instruction |
|---|---|
| Starting point | Start a fresh repository and git history for Swift. Do not attempt to preserve or import the PoC's git history (it has none). |
| PoC code (classification logic, components, etc.) | Treat the PoC as reference only — read it to understand the validated behavior, but rebuild the codebase fresh rather than refactoring the PoC in place. This applies to the GPP-domain classifier, the new M/W/G modality classifier work, and all UI components. |
| GPP-domain keyword lists / classification rules | The validated Python reference implementation and its keyword lists live in the PoC at `/Users/alexyovev/projects/stride`. Port the classification behavior faithfully — same keyword-to-domain mappings, same matching logic — rather than reinterpreting it. Section 4.2's requirements describe the required behavior; the PoC is the source of truth for the exact rules. |
| M/W/G modality classification rules | No validated reference exists yet for M/W/G proportional classification (section 4.3) — this is new for Swift. Design and implement it fresh, using the PoC's movement/keyword vocabulary as a starting point where relevant. |
| Sample/demo CSV | Reuse the PoC's existing sample/validation CSV as-is for Swift's bundled demo-data mode (section 4.7). Do not regenerate or synthesize a new one. |
| Renaming | Rename all references from Stride/SWIFT-as-PoC-name to Swift throughout: directory/repo name, package.json name field, page titles, and any in-code references to the old name. |

---

## 3. Background & Context

SugarWOD is a popular workout-logging platform used by many gyms. Athletes can export their own training history as a CSV. Swift was validated end-to-end against a real athlete export (~1,200 workouts, November 2022–September 2026) and an existing React/Recharts dashboard prototype and classification pipeline, which this document formalizes into v1 requirements.

Swift's visual identity is black-and-white at its base, in matching light and dark modes, with a single user-selectable primary color used to accent interactive elements throughout (see 4.8).

---

## 4. Functional Requirements

### 4.1 CSV Upload & Parsing

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | User can upload a SugarWOD training-history CSV export via file picker or drag-and-drop. | Must |
| FR-1.2 | System validates the uploaded file is a well-formed CSV matching the expected SugarWOD export schema before processing. | Must |
| FR-1.3 | System surfaces a clear, plain-language error if the file is invalid, empty, unparseable, or from an unsupported export format/version. | Must |
| FR-1.4 | All parsing and classification happens client-side in the browser; the raw CSV is never uploaded to a server. | Must |
| FR-1.5 | User sees a loading/progress state while the file is parsed and classified (large histories may take a moment). | Should |

v1 assumes a single, stable SugarWOD export schema. Swift is not required to detect or support multiple export versions at launch; if PostHog usage/error tracking (see 4.9) surfaces evidence of schema drift, versioned parsing becomes a v1.x consideration.

### 4.2 Workout Classification

Each workout is classified against the ten CrossFit general physical skills (Cardiovascular/Respiratory Endurance, Stamina, Strength, Flexibility, Power, Speed, Coordination, Agility, Balance, Accuracy) using keyword-based matching, ported from the validated Python reference implementation into TypeScript for client-side execution.

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | System classifies every parsed workout into one or more of the 10 GPP domains based on keyword matching against workout name/description. | Must |
| FR-2.2 | System retains, per workout, which specific keyword(s) triggered each domain match, for transparency/drill-down. | Must |
| FR-2.3 | System identifies named benchmark workouts (e.g. "Fran", "Murph") distinctly from general WODs for benchmark-history tracking. | Must |
| FR-2.4 | System detects PR (personal record) entries within the export for the PR timeline. | Must |
| FR-2.5 | Classification logic is ported from and behaviorally consistent with the validated Python reference (verified against the sample CSV). | Must |

### 4.3 Modality Classification (M/W/G)

In addition to the 10 GPP domains, each workout is also classified by proportion across CrossFit's three core modalities: Metabolic Conditioning / Cardio (M), Weightlifting & Powerlifting (W), and Gymnastics / Bodyweight (G). A single workout may combine more than one modality (e.g. a couplet of thrusters and pull-ups is part W, part G), so this is a proportional breakdown rather than a single label.

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | System classifies every parsed workout by its proportional composition across the three modalities: Metabolic Conditioning/Cardio (M), Weightlifting/Powerlifting (W), and Gymnastics/Bodyweight (G). | Must |
| FR-3.2 | For workouts combining multiple modalities, the system estimates the relative proportion of each (e.g. by movement composition) rather than forcing a single M/W/G label. | Must |
| FR-3.3 | System retains, per workout, which movement(s) or keyword(s) drove each modality's proportion, for transparency/drill-down. | Should |
| FR-3.4 | Modality classification logic is documented clearly enough to be ported/extended the same way the GPP domain classifier was. | Must |

### 4.4 Overview Dashboard Tab

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Training consistency chart: bar chart of workout frequency over time (e.g. by month). | Must |
| FR-4.2 | Lift progression: line charts tracking key lift/movement numbers over time where present in the data. | Must |
| FR-4.3 | Named benchmark history: cards showing each benchmark workout's results over time. | Must |
| FR-4.4 | PR timeline: chronological display of detected PRs. | Must |
| FR-4.5 | Domain-focus chart: normalized stacked bar chart showing how training emphasis across the 10 GPP domains has shifted over time. | Must |
| FR-4.6 | Modality-mix chart: normalized stacked bar or area chart showing the M/W/G proportion of training over time. | Must |

### 4.5 Per-Domain Tabs (×10)

One tab per GPP domain (Cardiovascular/Respiratory Endurance, Stamina, Strength, Flexibility, Power, Speed, Coordination, Agility, Balance, Accuracy):

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Monthly area chart showing training emphasis in that domain over time. | Must |
| FR-5.2 | Early-vs-late comparison stats (e.g. first half of history vs. most recent), showing whether emphasis has increased or decreased. | Must |
| FR-5.3 | A plain-language definition/blurb of what the domain means. | Must |
| FR-5.4 | Collapsible/expandable list of every workout classified into that domain, showing the specific keyword that triggered the match. | Must |

### 4.6 Per-Modality Tabs (×3)

One tab per modality (Metabolic Conditioning/Cardio, Weightlifting/Powerlifting, Gymnastics/Bodyweight), mirroring the per-domain tabs in 4.5 but aggregated by M/W/G proportion instead of GPP domain:

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Monthly area chart showing that modality's proportion of training over time. | Must |
| FR-6.2 | Early-vs-late comparison stats (e.g. first half of history vs. most recent), showing whether emphasis on that modality has increased or decreased. | Must |
| FR-6.3 | A plain-language definition/blurb of what the modality means (e.g. what counts as Gymnastics/Bodyweight work). | Must |
| FR-6.4 | Collapsible/expandable list of every workout with a nonzero proportion in that modality, showing the movement(s)/keyword(s) that drove the proportion and the workout's percentage split across M/W/G. | Must |

### 4.7 Sample / Demo Data Mode

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Landing page offers a "try it with sample data" option that loads the full dashboard experience using a bundled sample CSV, with no upload required. | Should |
| FR-7.2 | Sample data mode is visually/labelingly distinguishable from a member's own uploaded data (e.g. a persistent banner) so it's never mistaken for real results. | Should |

### 4.8 Theming

Swift's base UI is black-and-white, with matching light and dark modes. On top of that neutral base, the user can select a single primary color that accents interactive elements throughout the app — buttons, toggles, sliders, active tab indicators, links, and focus states.

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Base theme is black-and-white, with a light mode and a dark mode; the user can switch between them. | Must |
| FR-8.2 | User can pick a primary accent color from a curated set of swatches (not a full color picker for v1) that is applied to interactive elements: buttons, toggles, switches, sliders, active/selected states, links, and focus rings. A full custom color picker is a possible future enhancement, not v1 scope. | Must |
| FR-8.3 | The chosen primary color is derived into a full shade range (light/dark variants) so it renders correctly and with sufficient contrast in both light and dark mode. | Must |
| FR-8.4 | Theme selection (light/dark + primary color) persists across the session (e.g. local storage) so it isn't reset on every visit. | Should |
| FR-8.5 | A sensible default primary color and mode (matching system preference) is applied for users who don't customize it. | Must |
| FR-8.6 | Copy is plain and supportive rather than jargon-heavy or gimmicky (e.g. "your training log · N years and counting"). | Should |
| FR-8.7 | Landing page explains the product in one glance, shows the upload path, and follows a simple 3-step "upload → we read it → see your story" sequence. | Should |

### 4.9 Anonymous Usage Analytics

| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | Swift integrates PostHog for anonymous product-usage analytics (e.g. page views, upload attempted/succeeded/failed, sample-data-mode usage). | Should |
| FR-9.2 | Analytics capture usage events and error/failure signals only — never the contents of a member's uploaded CSV or any derived workout data. | Must |
| FR-9.3 | No personally identifying information is sent to PostHog (no name, email, or account identifiers, consistent with v1 having no accounts). | Must |

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Privacy | No training data is transmitted to or stored on any server; all processing is client-side in the member's browser. No accounts, no persistence, no analytics on workout content in v1. |
| Performance | A ~4-year (~1,200-row) CSV export parses, classifies, and renders the full dashboard in under 5 seconds on a typical modern laptop/phone. |
| Responsiveness | Fully usable on mobile, tablet, and desktop viewports; charts and tables reflow rather than requiring horizontal scrolling of the page itself. |
| Browser support | Latest two versions of Chrome, Safari, Firefox, and Edge, on both desktop and mobile. |
| Accessibility | Reasonable baseline: sufficient color contrast in both light and dark mode across any user-selected primary color, keyboard-navigable controls, alt text / accessible labeling on charts where feasible. |
| Reliability | Malformed or unexpected CSV input fails gracefully with a clear message; it never silently produces incorrect insights. |
| Maintainability | Solo-maintainer friendly: minimal moving parts, no backend/infrastructure to operate for v1, straightforward to extend with new domains or chart types. |
| Type safety | Entire codebase — app, build config, and classification logic — is written in TypeScript. No plain JavaScript (.js/.jsx) source files in the project. |
| Hosting cost | Runs within Vercel's free/hobby tier for v1 given no backend and low expected traffic. |
| Analytics cost | Runs within PostHog's free tier for v1 given expected traffic volume. |
| Theming | Base black/white UI plus a single user-selectable primary accent color must render with adequate contrast across both light and dark mode. |

---

## 6. Technology Stack

### 6.1 Core Stack

| Layer | Choice | Notes |
|---|---|---|
| Build tool / framework | Vite + React | Chosen over Astro; no backend/persistence needed for v1. |
| Language | TypeScript 7 (latest stable) | Entire codebase is TypeScript — no plain .js/.jsx files. TS 7 is Microsoft's native Go-based compiler port (a faithful, faster reimplementation of the same language/type system, not new syntax), so this is a tooling choice, not a language-version tradeoff. |
| UI components | shadcn/ui + Tailwind CSS | Component ownership and design-ceiling fit a customizable, brand-neutral product; CSS-variable-based theming supports the user-selectable primary color and light/dark modes (see 4.8). |
| Data grid (if needed for workout lists) | TanStack Table | Pairs natively with shadcn's table primitives; handles per-domain workout list sorting/filtering. |
| Charts | Recharts, via shadcn/ui's official chart component wrapper | shadcn's chart primitives (ChartContainer, ChartTooltip, etc.) are built specifically on Recharts, giving CSS-variable-based theming that matches the light/dark + custom primary color system in 4.8. Already validated in the working prototype (bar, line, area, stacked bar). |
| CSV parsing | Client-side CSV parser (e.g. PapaParse, used with its TypeScript types) | Runs entirely in-browser per the no-server-upload privacy requirement. |
| Classification logic | Ported to TypeScript from the validated Python reference | Behavior verified against the sample CSV during porting. |
| Hosting | Vercel | Static/SPA hosting, no backend for v1. Uses the default `*.vercel.app` domain for v1; tryswift.io is under consideration as a future custom domain. |
| Analytics | PostHog | Anonymous usage/error events only — never workout content or PII. |
| Source control | GitHub | Public repo, deployed via Vercel's GitHub integration. |

### 6.2 Explicitly Out of Scope for v1

- Backend server / API layer
- Database or any server-side persistence
- Authentication / user accounts
- Direct SugarWOD API integration

---

## 7. Data Flow (v1)

1. Member exports their training history from SugarWOD as a CSV.
2. Member uploads the CSV to Swift via the browser.
3. Swift parses the CSV client-side (PapaParse) into structured workout records.
4. Swift classifies each workout into GPP domains, M/W/G modality proportions, benchmark, and PR status, entirely in-browser.
5. Swift renders the Overview tab, 10 per-domain tabs, and 3 per-modality tabs from the classified, in-memory data.
6. No data persists after the browser tab/session ends; nothing is sent to a server.

---

## 8. Resolved Decisions (formerly open questions)

- **CSV schema:** v1 assumes one stable SugarWOD export schema; multi-version handling is deferred unless PostHog data indicates drift.
- **Demo mode:** v1 includes a sample-data "try it" experience (FR-7.1–7.2), reusing the PoC's existing sample CSV as-is.
- **Analytics:** PostHog for anonymous usage/error tracking, explicitly excluding workout content and PII (FR-9.1–9.3).
- **Domain:** v1 ships on the default Vercel domain; tryswift.io is a candidate future custom domain, not yet purchased.
- **PoC code:** treated as a reference for validated behavior only; Swift's codebase is rebuilt fresh rather than refactored in place, with a new git history.
- **Testing:** unit tests on the classification logic (GPP domains and M/W/G modality) are required for v1, not optional (see 9).

---

## 9. Testing Requirements

| ID | Requirement | Priority |
|---|---|---|
| TR-1 | Unit tests cover the GPP-domain classifier: each of the 10 domains has test cases verifying correct classification against representative workout names/descriptions, including multi-domain workouts. | Must |
| TR-2 | Unit tests cover the M/W/G modality classifier: representative single-modality and multi-modality (blended) workouts are verified to produce correct proportional splits. | Must |
| TR-3 | Classification unit tests are run against the same sample CSV used for demo mode, to catch regressions against the one validated real-world dataset. | Should |
| TR-4 | Where feasible, GPP-domain classification test cases are checked for behavioral parity with the original Python reference implementation's output. | Should |
| TR-5 | End-to-end/component testing beyond the classification logic (e.g. full UI interaction tests) is not required for v1. | Should |

---

## 10. Acceptance Criteria (Definition of Done for v1)

v1 is considered complete when all of the following hold:

- The project at `/Users/alexyovev/projects/stride` has been renamed to Swift throughout (directory, repo, package.json, page titles, in-app copy) with no remaining references to Stride.
- A fresh git repository has been initialized for Swift (no dependency on the PoC's — nonexistent — history).
- A user can upload a real SugarWOD CSV export and see the Overview tab, all 10 per-domain tabs, and all 3 per-modality tabs render correctly, matching the functional requirements in section 4.
- The bundled sample CSV (carried over from the PoC) powers a working "try it with sample data" demo mode with no upload required.
- GPP-domain and M/W/G classification unit tests exist and pass, per section 9.
- Light mode, dark mode, and at least one custom primary color selection all render correctly with adequate contrast across every tab (FR-8.1–8.5).
- No raw training data leaves the browser at any point — verified by inspecting network requests during a full upload-to-dashboard flow.
- PostHog anonymous usage events fire on key actions (upload attempted/succeeded/failed, sample-data-mode used) without any workout content or PII in the event payloads.
- The entire codebase is TypeScript with no plain .js/.jsx source files.
- The app is deployed and reachable on a Vercel default (`*.vercel.app`) domain.

---

## 11. Handoff Instructions

| Aspect | Instruction |
|---|---|
| This document's location | This requirements document lives at the base of the new Swift repository (e.g. `REQUIREMENTS.md`) as a temporary reference. Its ongoing/durable context should be migrated into `README.md` and `CLAUDE.md` as the project matures — this file is not meant to be the permanent home for that context. |
| Package manager | Use npm for all dependency management and scripts (not yarn or pnpm). |
| Environment variables / secrets | PostHog requires an API key. For now, add a placeholder entry to a local `.env` file (not committed) and a corresponding `.env.example` (committed, with no real value) so the project runs without a real key. The real PostHog key will be provided later. |
| Primary color selection UI | Implement as a curated set of swatches for v1, not a full/arbitrary color picker. A full color picker is a possible future enhancement, out of scope for v1 (see FR-8.2). |
