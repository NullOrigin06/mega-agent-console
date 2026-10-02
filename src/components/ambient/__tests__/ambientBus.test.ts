import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { ambientBus, MOTION_STORAGE_KEY } from "../ambientBus";

describe("ambientBus", () => {
  beforeEach(() => {
    window.localStorage.clear();
    ambientBus.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is suspended while any reason is held, counting repeat holders", () => {
    const listener = vi.fn();
    const off = ambientBus.subscribe(listener);
    ambientBus.suspend("palette");
    ambientBus.suspend("modal");
    ambientBus.suspend("modal");
    expect(ambientBus.getSnapshot().suspended).toBe(true);
    expect(ambientBus.getSnapshot().reasons).toEqual(["palette", "modal"]);
    ambientBus.resume("palette");
    ambientBus.resume("modal");
    expect(ambientBus.getSnapshot().suspended).toBe(true);
    ambientBus.resume("modal");
    expect(ambientBus.getSnapshot().suspended).toBe(false);
    ambientBus.resume("twin3d"); // unbalanced resume is a no-op
    expect(ambientBus.getSnapshot().reasons).toEqual([]);
    expect(listener).toHaveBeenCalled();
    off();
  });

  it("keeps a stable snapshot between changes", () => {
    const a = ambientBus.getSnapshot();
    expect(ambientBus.getSnapshot()).toBe(a);
    ambientBus.highlight("TubeSheet");
    const b = ambientBus.getSnapshot();
    expect(b).not.toBe(a);
    expect(b.highlight).toBe("TubeSheet");
    ambientBus.highlight("TubeSheet");
    expect(ambientBus.getSnapshot()).toBe(b);
  });

  it("defaults to auto and persists the motion preference", () => {
    expect(ambientBus.getMotionPref()).toBe("auto");
    expect(ambientBus.getSnapshot().motion).toBe("live");
    ambientBus.setMotionPref("off");
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("off");
    expect(ambientBus.getSnapshot().motion).toBe("still");
    ambientBus.reset();
    expect(ambientBus.getMotionPref()).toBe("off");
  });

  it("survives a localStorage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(ambientBus.getMotionPref()).toBe("auto");
    expect(() => ambientBus.setMotionPref("off")).not.toThrow();
    expect(ambientBus.getSnapshot().motion).toBe("still");
    expect(() => ambientBus.setMotionPref("auto")).not.toThrow();
    expect(ambientBus.getSnapshot().motion).toBe("live");
  });
});
