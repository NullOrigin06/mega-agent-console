# Brief for Antigravity — Mega Agent Console front-end

**Read this in full before writing any code.** You are building the web console; a separate agent (Claude Code) is working in a different repository (`MegaEngineeringSuite`, a .NET/WinForms app) extracting the real engineering logic into a headless library. That work is not done yet. You are not blocked on it — you build against a mock API contract that is designed to make swapping in the real thing later a small change, not a rewrite.

## 1. What this project is

A web front-end for a future "background agent" workflow layered on top of Mega Engineering Suite, an internal CAD/engineering-automation tool for Mega EPC (heat exchangers, tube sheets, bonnet flanges — pressure vessel components). Today that tool is a Windows desktop app (WinForms) where an engineer picks a Shell ID, reviews calculated values, and clicks Generate to produce a CAD drawing + BOM. This console is a future web-based way to do the same thing, so it eventually needs to support: submitting a job, watching its status, reviewing calculated values, and viewing/downloading the result.

## 2. Repo relationship — read this carefully

- This repo (`mega-agent-console`) is **separate from `MegaEngineeringSuite`** — different git history, different tech stack, no project reference. You should not need to open the other repo to do your job; everything you need is in this repo's `src/types/engineering.ts`, `src/mocks/`, and this brief.
- **There is no real backend yet.** `src/mocks/api.ts` is a mock implementation of the eventual API contract, with realistic delay and realistic data shapes (see §4). Build every screen against the functions in `src/mocks/api.ts`, never against `src/mocks/fixtures.ts` directly — that keeps the swap to a real API a one-file change.
- Do not invent your own data shapes that diverge from `src/types/engineering.ts`. If a screen needs a field that isn't there, add it to that file (matching .NET naming conventions, documented inline) rather than working around it locally.

## 3. Where to work, and where everything lives

**Your working folder is `C:\Users\PARTH\source\repos\mega-agent-console` — this entire repo.** It's a sibling folder to `MegaEngineeringSuite`, with no shared git history and no project reference between them. All the files you'll write go here.

Within this repo:

- **Write your components/pages under `src/`** (e.g. `src/pages/`, `src/components/` — create these, they don't exist yet beyond the Vite default `src/App.tsx`). No existing structure to conform to beyond what's already there.
- **Contract files you build against, don't fork:**
  - `C:\Users\PARTH\source\repos\mega-agent-console\src\types\engineering.ts` — the TypeScript interfaces (`JobRequest`, `JobSummary`, `JobDetail`, `EngineeringDataModel`, `EngineeringValues`, `NozzleItem`, `BomRow`).
  - `C:\Users\PARTH\source\repos\mega-agent-console\src\mocks\api.ts` — the mock API functions (`listJobs`, `getJob`, `submitJob`). Call these from your components; don't call `fixtures.ts` directly.
  - `C:\Users\PARTH\source\repos\mega-agent-console\src\mocks\fixtures.ts` — the sample data those functions return. Extend this if a screen needs more/different sample jobs, but keep the shapes matching `engineering.ts`.
  - You may **extend** all three of the above if you find a genuine gap (see §5), but keep names/style consistent with what's there.
- **Reference-only docs in this repo** (read for context, not code to run):
  - `C:\Users\PARTH\source\repos\mega-agent-console\README.md` — project status and stack.
  - `C:\Users\PARTH\source\repos\mega-agent-console\docs\ANTIGRAVITY_BRIEF.md` — this file.

**Do not open or edit anything in `C:\Users\PARTH\source\repos\MegaEngineeringSuite`** (the .NET repo) — you don't need to, and it's a different agent's active working tree. If you want deeper background on *why* the mock contract is shaped the way it is (the real engineering logic, its known inconsistencies, the extraction plan happening there), these are available for optional reading only, purely for understanding — never edit them, and never treat them as something your build depends on:

  - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\docs\EXTRACTION_ANALYSIS.md` — the full verified analysis of the real engineering logic: what's confirmed, what's stale, the open unresolved engineering conflicts referenced in §4 below, module inventory, git-drift findings.
  - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\docs\EXTRACTION_HANDOFF.md` — the .NET-side extraction plan and current division of labor between the two agents.
  - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\CLAUDE.md` — project context summary for the .NET app (pinned to an older commit; treat as background color, not current fact).
  - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\docs\MEGA_CONTEXT_ISSUES.md` — the full 90+-item finding register behind the analysis above.
  - The actual .NET source the mock types are modeled on, if you want to see the real field definitions with their own code comments:
    - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\MegaEngineeringSuite.Engineering\EngineeringDataModel.cs`
    - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\MegaEngineeringSuite.Engineering\EngineeringValues.cs`
    - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\MegaEngineeringSuite.Engineering\NozzleItem.cs`
    - `C:\Users\PARTH\source\repos\MegaEngineeringSuite\MegaEngineeringSuite.Engineering\HeatExchangerFab\HeatExchangerFabData.cs`

## 4. The mock contract — what's real and what isn't

`src/types/engineering.ts` mirrors real field names from the .NET codebase's `EngineeringDataModel`, `EngineeringValues`, and `NozzleItem` classes. This was deliberately done so that when a real API exists, the shapes won't need a redesign.

**Read the file-level comment at the top of `engineering.ts` before using it.** The short version:

- `EngineeringDataModel.actual` and `.estimated` are two parallel snapshots of the same fields. In the real system, `estimated` is the one that's actually authoritative once a user edits it, despite the name reading the opposite way. If you build a review/edit screen, editing should act on `estimated`, and `actual` should be presented as a read-only reference value.
- `BomRow` is a shape **invented for this console's display purposes**. The real .NET codebase has no single shared BOM structure — each engineering module builds its BOM independently, with different fields. Do not present `BomRow` as if it reflects a real backend contract; it's a normalized shape for showing a table in this UI.
- Several engineering values (tube pitch, material density, a couple of geometry formulas) have **confirmed, currently-unresolved disagreements** between different parts of the real system — different modules compute them differently and nobody has decided which is correct yet. This matters for you because: **do not build UI that implies one authoritative number exists for a value that the source system itself hasn't settled.** In practice, since your data is mocked anyway, this mostly means: don't invent your own "smart" derivation logic for these fields client-side — just display whatever the mock API returns, and if you need to fabricate a value for a fixture, treat it as illustrative, not correct.

## 5. Scope for this pass — four screens/flows

Build these against `src/mocks/api.ts`:

1. **Submit a job.** A form: pick a module (`TubeSheet` | `BonnetFlange` | `HeatExchangerFab`) and enter a Shell ID (number). Submitting calls `submitJob({ module, shellId })` and should navigate to or highlight the new job in the list/history view. This mirrors clicking one of the three Generate buttons in the real desktop app's main screen.
2. **Job list / history.** A table or list of jobs from `listJobs()`, showing module, Shell ID, status (`queued`/`running`/`completed`/`failed`), timestamps, and — for failed jobs — the error message. Should support opening a job to see its detail view. Status should be visually distinct (e.g. color-coded badges) since a user scanning this list needs to spot failures quickly.
3. **Review calculated values.** For a job with `engineeringData` present (see `getJob(jobId)`), show the Actual vs. Estimated values side by side (or in a way that makes the distinction clear), with Estimated editable and Actual read-only. You do not need to wire editing back to a real save endpoint yet — local component state is fine — but the UI should make the actual/estimated distinction obvious to someone unfamiliar with the terminology (a short inline explanation is reasonable, e.g. "Estimated overrides Actual for generation" or similar plain-language framing).
4. **View/download BOM & drawing.** For a completed job, show the `bom` rows as a table (item no, description, MOC, dimension, qty, weight, remark) and surface `drawingUrl` as a download/preview link. The mock `drawingUrl` won't resolve to a real file — a disabled-looking or placeholder link is fine, just wire the data through correctly.

You have latitude on layout/visual design — there's no existing design system to match yet. Keep it clean and functional; this is an internal engineering tool, not a marketing site.

## 6. Constraints

- Stack: React + TypeScript + Vite (already scaffolded — don't switch frameworks).
- Don't add a backend/server component to this repo. It's a static front-end for now.
- Don't add authentication/login flows yet — out of scope for this pass.
- Don't fetch from or reference the real `MegaEngineeringSuite` repo's files.
- Keep `src/mocks/api.ts`'s function signatures stable — other work (including a future real API client) is designed to be a drop-in replacement for that file's internals.
- If you find a gap in `src/types/engineering.ts` or `src/mocks/fixtures.ts` that blocks a screen, extend those files (with the same care about matching real .NET naming and adding honest comments about what's mocked) rather than working around it in a component.

## 7. What you are explicitly NOT responsible for

- The real API/backend that will eventually replace `src/mocks/api.ts`. That depends on extraction work happening in the `MegaEngineeringSuite` .NET repo — see the reference docs in §3 if you want the full context (not required reading for this pass).
- Deciding any of the open engineering questions mentioned in §4. Those are the project owner's calls, not something to resolve in this front-end.
- Shop Tank / Site Tank modules — two other engineering modules exist in the .NET app but are out of scope for both this console and the current extraction pass.
