# Mega Agent Console

Web front-end for a future background-agent-driven engineering workflow on top of **Mega Engineering Suite** (a separate repo: `MegaEngineeringSuite`).

## Status: pre-dependency scaffold

This project has **no working backend yet**. It exists ahead of its dependency on purpose, so the front-end shape can be designed early — but it cannot do real engineering work until the following lands in the `MegaEngineeringSuite` repo:

1. A headless class library extracted from `MegaEngineeringSuite`'s WinForms app (`Form3.cs` and related), exposing Tube Sheet / Bonnet Flange / Heat Exchanger Fab calculation, BOM, and CAD-generation logic without a WinForms dependency.
2. Some form of API surface (HTTP service, or another integration point — not yet decided) that this front-end can call.

See `MegaEngineeringSuite/docs/EXTRACTION_ANALYSIS.md` and `MegaEngineeringSuite/docs/EXTRACTION_HANDOFF.md` in the sibling repo for the full extraction plan, what's confirmed vs. still open, and which engineering conflicts require sign-off before any calculation logic can be trusted as a shared implementation.

**Until that backend exists, treat any data this app displays as mocked/stubbed**, not representative of real engineering output. Do not wire up a real CAD/BOM number here and present it as authoritative — several formulas in the source project have confirmed, unresolved divergences (tube pitch, material density, a π/4 factor, an OTL boundary rule, a dish-end diameter formula) that are explicitly **not yet decided** by the project owner. Building UI that implies a single authoritative answer for any of those would be presenting an undecided engineering question as settled.

## Stack

React + TypeScript + Vite (scaffolded via `npm create vite@latest -- --template react-ts`).

## Repo relationship

This is a **separate GitHub repository** from `MegaEngineeringSuite`, by design — no shared git history, no project reference. Once a real API exists, this app will call it over HTTP (or whatever integration point is decided); it will not directly reference `MegaEngineeringSuite`'s .NET code.

## Getting started

```bash
npm install
npm run dev
```
