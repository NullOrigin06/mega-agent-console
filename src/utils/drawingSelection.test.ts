import { describe, it, expect } from "vitest";
import { toggleDrawing, canGenerateSelected, cardActionHint, isAnyDrawingGenerating, normalizeSelection } from "./drawingSelection";
import { buildGenerateDrawingBody, drawingDownloadUrl } from "../api/realApi";

describe("drawing selection", () => {
  it("starts empty and toggles in canonical order", () => {
    let sel = toggleDrawing([], "ga");
    expect(sel).toEqual(["ga"]);
    sel = toggleDrawing(sel, "fab");
    expect(sel).toEqual(["fab", "ga"]);
    sel = toggleDrawing(sel, "fab");
    expect(sel).toEqual(["ga"]);
    expect(toggleDrawing(["fab"], "fab", true)).toEqual(["fab"]);
    expect(toggleDrawing(["fab"], "ga", false)).toEqual(["fab"]);
    expect(normalizeSelection(["ga", "fab"])).toEqual(["fab", "ga"]);
  });

  it("enables generate only with a tick, an agent and nothing generating", () => {
    const base = { selected: ["fab" as const], statuses: ["not_generated", "not_generated"] as const, isTriggering: false, hasAgent: true };
    expect(canGenerateSelected(base)).toBe(true);
    expect(canGenerateSelected({ ...base, selected: [] })).toBe(false);
    expect(canGenerateSelected({ ...base, hasAgent: false })).toBe(false);
    expect(canGenerateSelected({ ...base, isTriggering: true })).toBe(false);
    expect(canGenerateSelected({ ...base, statuses: ["generated", "generating"] })).toBe(false);
    // an already generated drawing can be ticked again
    expect(canGenerateSelected({ ...base, statuses: ["generated", "generated"] })).toBe(true);
    expect(isAnyDrawingGenerating(["generated", "generating"])).toBe(true);
  });

  it("describes what a tick will do", () => {
    expect(cardActionHint("generated", false)).toBeNull();
    expect(cardActionHint("generated", true)).toMatch(/re-generated/);
    expect(cardActionHint("failed", true)).toMatch(/retried/);
    expect(cardActionHint("not_generated", true)).toMatch(/generated/);
  });
});

describe("drawing request building", () => {
  it("omits drawings when none are given (server defaults to fab)", () => {
    expect(buildGenerateDrawingBody("a1")).toEqual({ agentId: "a1" });
    expect(buildGenerateDrawingBody(undefined, [])).toEqual({ agentId: null });
  });
  it("sends the requested, de-duplicated kinds", () => {
    expect(buildGenerateDrawingBody("a1", ["ga"])).toEqual({ agentId: "a1", drawings: ["ga"] });
    expect(buildGenerateDrawingBody(undefined, ["fab", "ga", "fab"])).toEqual({ agentId: null, drawings: ["fab", "ga"] });
  });
  it("builds the download URL with ?kind=", () => {
    expect(drawingDownloadUrl("job 1", "ga")).toMatch(/\/job%201\/drawing\?kind=ga$/);
    expect(drawingDownloadUrl("job-1")).toMatch(/\/job-1\/drawing\?kind=fab$/);
  });
});
