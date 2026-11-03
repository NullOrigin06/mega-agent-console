import { describe, it, expect } from "vitest";
import { agentVersionState, compareVersions, latestRelease, releaseHighlights } from "./agentReleases";

describe("agent releases", () => {
  it("compares versions numerically, not as text", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBe(1);
    expect(compareVersions("1.2.9", "1.2.10")).toBe(-1);
    expect(compareVersions("1.2.14", "1.2.14")).toBe(0);
    expect(compareVersions("1.3", "1.2.14")).toBe(1);
  });

  it("finds the newest release whatever the order of the list", () => {
    const list = [
      { version: "1.2.9", date: "", notes: "" },
      { version: "1.2.14", date: "", notes: "" },
      { version: "1.2.10", date: "", notes: "" },
    ];
    expect(latestRelease(list)?.version).toBe("1.2.14");
    expect(latestRelease([])).toBeUndefined();
  });

  it("says where an agent's version stands", () => {
    expect(agentVersionState("1.2.14", "1.2.14")).toBe("latest");
    expect(agentVersionState("1.2.13", "1.2.14")).toBe("outdated");
    expect(agentVersionState(undefined, "1.2.14")).toBe("unknown");
    expect(agentVersionState("1.2.14", undefined)).toBe("unknown");
  });

  it("splits the notes into what the version does", () => {
    expect(releaseHighlights("Nozzle edits; Shop Tank GA drawing;  MOC edits")).toEqual(["Nozzle edits", "Shop Tank GA drawing", "MOC edits"]);
  });
});
