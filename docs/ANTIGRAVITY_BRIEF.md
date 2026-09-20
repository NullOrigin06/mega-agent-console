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

- Deciding any of the open engineering questions mentioned in §4. Those are the project owner's calls, not something to resolve in this front-end.
- Shop Tank / Site Tank modules — two other engineering modules exist in the .NET app but are out of scope for both this console and the current extraction pass.

**Update, 2026-09-20:** the real API now exists and your real-mode client (`src/api/realApi.ts`) is done and verified — nice work, independently confirmed by the Claude Code session. This section's original first bullet ("the real API doesn't exist yet") is stale; see §8 for the current task.

## 8. Next task (2026-09-20): source Shell ID presets from real data in real mode

**The gap:** `SubmitJobModal.tsx`'s Shell ID quick-select presets (`600, 762, 914, 1100`) are guessed values. `762` is deliberately useful as a "show the failure case" demo, but a real user has no way to know which Shell IDs actually resolve without trial and error. `mega-agent-api` now exposes `GET /api/shell-ids` (a plain `number[]`, e.g. `[600, 700, 800, ...]`) — the workspace agent there was assigned this in parallel with you, so it may or may not exist yet when you start; handle that gracefully (see below).

**Your task:**
1. Add a `listShellIds(): Promise<number[]>` function to `src/api/realApi.ts`, calling `GET {VITE_API_BASE_URL}/api/shell-ids`, following the same pattern as your existing `listJobs`/`getJob`/`submitJob`.
2. Add a corresponding mock version to `src/mocks/api.ts` that returns a small hardcoded array (e.g. `[600, 700, 800, 900, 1000, 1100, 1200]` — these are confirmed-real values from earlier live testing against the actual Excel dataset, safe to hardcode as the mock's answer) — keep the mock/real symmetry you already established.
3. In `SubmitJobModal.tsx`, call `listShellIds()` (via whichever facade — mock or real — the mode toggle currently selects) when the modal opens, and use the result as the quick-select presets instead of the hardcoded `600, 762, 914, 1100` list. If the call fails (e.g. the endpoint doesn't exist yet in `mega-agent-api`, or the request errors for any reason), fall back to the existing hardcoded presets rather than showing a broken/empty preset row — this should degrade gracefully, not become a hard dependency.
4. Keep manual Shell ID entry working exactly as before — this only changes where the *quick-select* suggestions come from, not the input's validation or freedom to enter any number.

**Verification:** in real mode, confirm the presets shown are the live values from `GET /api/shell-ids` (not the old hardcoded four); in mock mode, confirm the mock's hardcoded list appears; and confirm the modal still works correctly if you temporarily point `VITE_API_BASE_URL` at a nonexistent port, to prove the fallback path is real and not just theoretical.

**Status: done, independently verified.** The Claude Code session confirmed the live preset grid in the browser matches the real `GET /api/shell-ids` output value-for-value (168, 219, 273, 290, 300...2250+, all 225 real values), not the mock list or the hardcoded fallback. One thing flagged back at the time, not yet acted on: rendering all 225 values as individual buttons is a lot of buttons — technically correct, just not very "quick" as a quick-select. Worth revisiting if you want it tightened (e.g. every 10th value, or a searchable list), but that's your and Parth's call, not required.

## 9. Next task (2026-09-20): real drawing download now genuinely works — check `DrawingView.tsx` actually uses it

**Real DWG generation now exists.** `mega-agent-api` can now generate an actual `.dwg` file for a `BonnetFlange` job (launches real GstarCAD, produces a real file, confirmed independently by the Claude Code session — a real 1,143,040-byte drawing, downloadable). It exposes this via `GET /api/jobs/{id}/drawing`, and a completed job's `drawingUrl` is now a real, working relative path like `/api/jobs/job-abc123/drawing` — not the mock's static `/mock-drawings/job-1001.pdf` placeholder.

**The question this task answers:** does `DrawingView.tsx`'s download button/link actually work against this in real mode, or does it still behave like the mock's "simulated download action"? Nobody has checked this yet.

**Your task:**
1. Submit a real `BonnetFlange` job in real mode (Shell ID 800 is confirmed working) and wait for it to complete.
2. Open that job's Drawing tab and try the actual download/view action. Confirm: does clicking it genuinely download a real `.dwg` file (check the downloaded file's size — it should be over 1MB, not 0 bytes or an HTML error page), or does something break (wrong base URL, CORS issue, the button still behaving like the old "simulated" mock action, wrong assumed content-type, etc.)?
3. If it's already working: great, just confirm it explicitly (a screenshot or a described test is enough) and note the file size you got, so this is verified rather than assumed.
4. If it's broken: fix it. Likely candidates, in rough order of likelihood: `drawingUrl` needs to be resolved against `VITE_API_BASE_URL` rather than treated as a same-origin path (the API runs on a different port than the Vite dev server); the download handler might be calling `window.open()` or similar in a way that assumes a same-origin static asset rather than an API endpoint that needs the base URL prefixed; or the "ILLUSTRATIVE PLACEHOLDER MOCKUP" SVG blueprint you built for the mock case might be incorrectly showing even when a real file is available — a real completed job with a real `drawingUrl` should offer the real download, and the placeholder mockup should only appear when there's genuinely no real drawing yet (queued/running/failed jobs, or mock-mode completed jobs).
5. Don't touch anything module-specific — `HeatExchangerFab` and `TubeSheet` don't have real generation yet (separate tasks, in progress on the API side), so their jobs should still show no real drawing / the placeholder, correctly. Only `BonnetFlange` jobs should be able to show a real download right now.

**Verification:** a real downloaded `.dwg` file from a real completed `BonnetFlange` job, confirmed by file size (should match whatever `mega-agent-api`'s `GeneratedDrawings/` folder shows for that job — check both sides agree), and confirmation that `HeatExchangerFab`/`TubeSheet` jobs still correctly show no real download (since they don't have one yet).

**Status: done, independently verified twice over.** The Claude Code session confirmed this in the browser itself: real jobs for all three modules render correctly, the Drawing tab shows the correct real asset path, and clicking the download button genuinely downloaded a real 1,148,919-byte `.dwg` file to disk (matching the API's own file exactly). Nice work — this was fully real, not simulated.

**Then Parth used it and gave feedback that changes the design — read §10 and §11 below before doing anything else.** Two things: (1) the file-download flow itself needs to go away entirely, replaced with a "launch CAD directly" flow, and (2) the Shell ID quick-select grid (all 225 buttons) needs to go away too — he wants manual entry only.

---

## 10. Next task (2026-09-20): remove the Shell ID preset grid — manual entry only

**Parth's exact words:** *"why are there this many options for shell id no need to display these ill enter that manually."*

The full 225-button grid from §8 (sourced from `GET /api/shell-ids`) is not what he wants — it was meant to be a "quick-select," but showing every valid value defeated that purpose (confirmed independently: it really was all 225, rendered as one big wall of buttons).

**Your task:**
1. In `SubmitJobModal.tsx`, remove the Shell ID quick-preset button grid entirely.
2. Keep the manual numeric Shell ID input exactly as it is — that's the only way to enter a Shell ID now.
3. You can either delete the `listShellIds()` call from this component entirely, or keep it around unused for now if it's easy to leave — your call, but nothing should render from it anymore. Don't delete `listShellIds()` from `src/api/realApi.ts`/`src/mocks/api.ts` themselves unless you're sure nothing else uses it — a quick grep is enough to check.

**Verification:** the Submit Job modal shows a plain numeric input for Shell ID, no button grid, in both mock and real mode.

## 11. Next task (2026-09-20): replace "Download Drawing" with "Generate Drawing" — real behavior change, not just a relabel

**This depends on `mega-agent-api`'s §16** (a new `POST /api/jobs/{id}/generate-drawing` endpoint and a new `DrawingStatus` field, separate from the job's main `Status`) — check with the user or inspect `mega-agent-api/Program.cs` directly to see if that's landed yet before starting; if it hasn't, you're blocked on it.

**Why this is changing:** this is a single-machine setup — the console, the API, and GstarCAD/AutoCAD all run on the same computer (Parth confirmed this is the permanent setup, not a temporary dev convenience). Downloading a `.dwg` file to the browser and asking the user to open it separately makes no sense here — the point of a real generation is that CAD opens directly on this machine as a side effect. Parth does not want any file transferred to the browser for this at all.

**The new model:**
- `POST /api/jobs` (submission) now only produces BOM/engineering data — it's fast, no CAD involved, and completes without a `drawingUrl`.
- A **separate, explicit "Generate Drawing" action**, available once a job is `completed`, calls `POST /api/jobs/{id}/generate-drawing`. This kicks off real CAD generation on the API's machine. The console should poll (reuse whatever polling/refresh mechanism you already have for job status) for the new `drawingStatus` field to move from `"generating"` to `"generated"` or `"failed"`.
- **There is nothing to download or preview in the browser once it succeeds.** The correct UI feedback for `"generated"` is something like *"Drawing generated — check GstarCAD/AutoCAD on this machine"*, not a download link or file preview.

**Your task, in `DrawingView.tsx` (and `JobDetailView.tsx`/wherever job state flows through) — this is a nontrivial rework, not a button rename:**
1. Remove the file-download logic entirely — the `Results.File`-based fetch/blob/`<a download>` mechanism you built for §9. Also remove (or clearly repurpose as a debug-only, de-emphasized link) the "Asset Path" / "Copy Path" UI — there's no meaningful path for a user to copy anymore in the primary flow.
2. Replace the "Download Drawing" button with a **"Generate Drawing"** button, shown once a job's `status` is `"completed"` and `drawingStatus` is `"not_generated"` (or `"failed"`, for retry). Clicking it calls `POST /api/jobs/{id}/generate-drawing`.
3. Add UI states for the new `drawingStatus` values: `"not_generated"` (show the Generate button, nothing else), `"generating"` (disable the button, show a real loading/in-progress indicator — this can take over a minute per the API's own timing logs, don't imply it's instant), `"generated"` (success message, no download link, maybe a "Generate Again" option), `"failed"` (show `drawingError`, offer retry).
4. **Keep the "ILLUSTRATIVE PLACEHOLDER MOCKUP" SVG blueprint** — that's still a reasonable always-shown visual regardless of real generation state, just make sure its labeling doesn't confuse users into thinking it's the real output (it already says this clearly, per your own earlier work — just re-check it still reads correctly next to the new button/status UI).
5. This changes behavior for all three modules identically — `BonnetFlange`, `HeatExchangerFab`, and `TubeSheet` all get the same "Generate Drawing" flow once §16 lands.

**Constraints:** don't invent a fallback file-download path "just in case" — Parth was explicit that same-machine is the permanent setup, and a half-supported download option that doesn't really work would be worse than not having one. If `mega-agent-api`'s §16 isn't done yet, don't guess at its response shape — wait, or ask.

**Verification:** submit a real job, wait for it to complete, click "Generate Drawing," confirm the button disables and shows a real in-progress state, confirm a real GstarCAD/AutoCAD window actually opens on this machine, confirm the UI updates to a success state with no download link once `drawingStatus` becomes `"generated"`.
