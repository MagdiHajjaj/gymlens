# GymLens Health Hub — Design Proposal & Implementation Plan

**Status:** Proposed, awaiting owner review (@MagdiHajjaj)
**Date:** 2026-09-26
**Scope of this PR:** Design proposal only. No app source code is changed.
This PR adds two interactive HTML mockups and this plan. Implementation follows
after the direction is approved.

## 1. Summary

GymLens grows from a workout-form coach into a **health hub**: recovery, sleep,
strain, training schedule, and guided workouts in one minimal app. The proposal
covers two surfaces:

- **Mobile app** — `docs/design/mockups/mobile-app.html` (open in a mobile browser)
- **Desktop web** — `docs/design/mockups/desktop-web.html` (open in a desktop browser)

Both mockups are fully clickable prototypes (tabs, session flow, schedule
editing, rest timer, reports). All health data in them is **mocked**; the workout
skeleton is **simulated**. The real app will feed the camera through MediaPipe
into `ExerciseAnalyzer.ts` as it does today.

Three visual directions were prototyped and judged; the selected direction is
"refined minimal" (light system, serif display type, restrained green). The
studies are not committed — the two mockups above are the proposal.

## 2. Design decisions

| Decision | Rationale |
|---|---|
| 4-tab mobile IA: **Home / Coach / Train / History** | A tab must be a daily destination. Schedule editing is a weekly setup task, so Plan becomes a pushed "Edit plan" screen instead of a fifth tab. |
| New **Coach** tab | Data-driven recommendations, each with a "WHY" line citing the numbers behind it (recovery %, HRV delta, sleep latency). Capped at ~4 cards — no endless feed. |
| Home stays lean | Recovery card, sleep/strain minis, today's plan, schedule strip, one Coach teaser. Exercise list and charts moved to their own tabs. |
| Serif display type (Georgia) for headings + big numerals | Premium, editorial feel (Oura-like). Body text stays sans for readability. |
| Light minimal system, one green accent | Trust and clarity for a health product; works in bright judging rooms. Dark is reserved for the camera session screen. |
| Health data mocked for the hackathon | Recovery/HRV/sleep/strain ship as local mock data with a clean provider interface, so HealthKit/Whoop can plug in later without UI changes. |

## 3. Implementation plan

Work proceeds in phases, each independently reviewable. **Do not merge
implementation phases without explicit approval** — this PR is design-only.

### Phase 0 — Design tokens & app shell
- Add tokens to `frontend/src/styles/globals.css`: `--bg #F4F4F5`, `--card #fff`,
  `--line #E9E9EB`, `--ink #101012`, `--mut #6E6E73`, `--acc #1F9D55`,
  radius scale, serif display stack.
- Build `TabBar` + `AppShell` in `frontend/src/components/layout/` (4 tabs,
  floating blurred bar, active pill).
- Add shared `Card`, `SectionHeader` primitives to `frontend/src/components/ui/`.

### Phase 1 — Home hub
- Rework `frontend/src/pages/DashboardPage.tsx` into the hub: recovery ring
  (SVG, animated draw), HRV/RHR/sleep rows, sleep & strain minis, today's-plan
  card, schedule strip.
- New `frontend/src/features/health/healthStore.ts`: provider interface
  (`getRecovery()`, `getSleep()`, `getStrain()`) with a `MockHealthProvider`
  first; persists nothing, pure in-memory.
- Tapping recovery pushes the recovery detail view (vitals, 7-day chart, factors).

### Phase 2 — Coach tab
- New `frontend/src/pages/CoachPage.tsx`.
- `frontend/src/features/coaching/RecommendationEngine.ts`: pure functions
  `(health, recentSessions) => Recommendation[]`. Each recommendation carries
  `title`, `body`, `why` (cited metrics), and an optional deep-link action
  (start session, open report).
- Cap visible cards at 4, grouped Today / Patterns.

### Phase 3 — Plan as pushed view
- Move schedule UI out of the tab bar into a pushed view reachable from the
  schedule strip's "Edit plan".
- `frontend/src/features/workout/scheduleStore.ts`: weekly plan in
  `localStorage` (day → exercise | rest), editable via bottom sheet.
- "Start" on today's card deep-links into the session setup with the scheduled
  exercise preselected.

### Phase 4 — Train library, setup & session restyle
- Restyle (don't rewrite) the library, setup, live session, rest timer, and
  report views to the new system.
- **Untouched:** `ExerciseAnalyzer.ts` logic, camera pipeline, rep-counting,
  cue engine. Only presentation changes.
- Keep guest mode and existing workout behavior.

### Phase 5 — History
- Restyle `frontend/src/pages/HistoryPage.tsx`: session list + per-session
  report (shallow reps, depth chart, faults) in the new visual system.

### Phase 6 — Desktop web
- Responsive layout in `Shell.tsx`: sidebar nav (Dashboard, Coach, Plan,
  Exercises, History) above ~1024px, tab bar below.
- Reuse the same pages/components; no separate web codebase.

### What must not break
- `ExerciseAnalyzer.ts` behavior and its tests.
- Camera open / MediaPipe landmark flow.
- Guest mode, existing workout session behavior.
- `npm run build`, `tsc`, ESLint, Vitest stay green; backend untouched.

## 4. Data strategy

| Data | Hackathon | Later |
|---|---|---|
| Recovery / HRV / RHR / sleep / strain | Mock provider, realistic values | HealthKit (iOS) / Whoop API behind the same interface |
| Training schedule | `localStorage` | Backend sync if time permits |
| Workout sessions / reports | Existing `sessionBuffer` flow | Unchanged |
| Exercise library | Curated list; only exercises genuinely supported by the analyzer are startable | Expand as analyzer coverage grows |

Workout reports do **not** yet feed back into future recovery scores — noted as
a roadmap item, not a hackathon feature.

## 5. Testing per phase
- `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- Manual pass on a real phone: tab navigation, session flow with camera,
  schedule editing, report rendering.
- No browser E2E on this VM (documented environment limitation); device
  testing before judging.

## 6. Open questions for @MagdiHajjaj
1. Is the 4-tab IA (Plan as pushed view) right, or should Plan keep a tab?
2. Mock health data for the demo — agreed, or is HealthKit/Whoop integration
   already close enough to attempt?
3. Any exercises in the mock library the analyzer can't actually support yet?
   Those need a "coming soon" label or removal before judging.
4. Green light to start Phase 0–1 on a feature branch after this PR merges?

## 7. Acceptance criteria (demo-ready)
- [ ] Mobile: 4 tabs navigate; Home shows recovery/sleep/strain; Coach shows
      ≤4 cited recommendations; Plan edits and persists the week; session
      runs on camera with live skeleton, cues, rest timer, and report.
- [ ] Desktop: sidebar layout mirrors the same content at ≥1024px.
- [ ] No regressions: analyzer tests pass, build passes, guest mode works.
- [ ] No real health integration is claimed in UI — mock data is labeled.
