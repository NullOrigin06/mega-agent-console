import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { AmbientEngine, AmbientEngineOptions } from "../../../ambient/types";
import type { JobSummary } from "../../../types/engineering";
import { TYPICAL_VESSEL } from "../../cad/vesselSpec";
import { createAmbientController, parseAmbientFlags, type AmbientInputs } from "../ambientController";

const engineMock = vi.hoisted(() => ({
  create: vi.fn(),
  still: vi.fn(),
}));

vi.mock("../../../ambient/engine", () => ({ default: engineMock.create }));
vi.mock("../../../ambient/fallback2d", () => ({ default: engineMock.still }));

function fakeEngine(): AmbientEngine {
  return {
    setState: vi.fn(),
    setLayout: vi.fn(),
    setScroll: vi.fn(),
    setPointer: vi.fn(),
    setVessel: vi.fn(),
    pushEvents: vi.fn(),
    setMode: vi.fn(),
    setSuspended: vi.fn(),
    setHints: vi.fn(),
    destroy: vi.fn(),
  };
}

const job = (status: JobSummary["status"]): JobSummary => ({
  id: "job-1",
  module: "TubeSheet",
  shellId: 800,
  status,
  createdAt: new Date().toISOString(),
  drawingStatus: "not_generated",
});

function inputs(overrides: Partial<AmbientInputs> = {}): AmbientInputs {
  return {
    page: "modules",
    workspaceModule: null,
    highlight: null,
    jobs: [job("queued")],
    agents: [],
    apiOk: true,
    vessel: TYPICAL_VESSEL,
    mode: "live",
    suspended: false,
    reducedMotion: false,
    ...overrides,
  };
}

function setup(initial = inputs()) {
  const root = document.createElement("div");
  const poster = document.createElement("div");
  root.appendChild(poster);
  document.body.appendChild(root);
  const docStates: string[] = [];
  const controller = createAmbientController({
    root,
    poster,
    flags: parseAmbientFlags(""),
    initial,
    routeKey: "modules:",
    onDocState: (s) => docStates.push(s),
  });
  return { root, poster, controller, docStates };
}

describe("createAmbientController", () => {
  beforeEach(() => {
    vi.stubGlobal("WebGL2RenderingContext", class {});
    engineMock.create.mockReset();
    engineMock.still.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("brings the engine up with the current inputs and forwards later changes", async () => {
    const engine = fakeEngine();
    engineMock.create.mockReturnValue(engine);
    const { controller, docStates, root } = setup();

    await vi.waitFor(() => expect(engineMock.create).toHaveBeenCalled());
    const [canvas, options] = engineMock.create.mock.calls[0] as [HTMLCanvasElement, AmbientEngineOptions];
    expect(canvas.parentElement).toBe(root);
    expect(options.playOpening).toBe(true);
    expect(engine.setLayout).toHaveBeenCalled();
    expect(engine.setVessel).toHaveBeenCalled();
    expect(engine.setState).toHaveBeenCalled();
    expect(engine.setMode).toHaveBeenCalledWith("live");
    expect(docStates.at(-1)).toBe("live");

    // Initial data was the silent baseline; a transition after it is an event.
    controller.setInputs(inputs({ jobs: [job("running")] }));
    expect(engine.pushEvents).toHaveBeenCalledWith([{ type: "dispatch", module: "TubeSheet", jobId: "job-1" }]);

    controller.setInputs(inputs({ jobs: [job("running")], suspended: true, mode: "still" }));
    expect(engine.setSuspended).toHaveBeenLastCalledWith(true);
    expect(engine.setMode).toHaveBeenLastCalledWith("still");
    expect(docStates.at(-1)).toBe("still");

    controller.destroy();
    expect(engine.destroy).toHaveBeenCalled();
    expect(root.querySelector("canvas")).toBeNull();
  });

  it("falls back to the Canvas2D still on a fresh canvas when the factory returns null", async () => {
    engineMock.create.mockReturnValue(null);
    const { controller, docStates, root } = setup();

    await vi.waitFor(() => expect(engineMock.still).toHaveBeenCalled());
    const [canvas] = engineMock.still.mock.calls[0] as [HTMLCanvasElement];
    expect(canvas).not.toBe(engineMock.create.mock.calls[0][0]);
    expect(root.querySelectorAll("canvas")).toHaveLength(1);
    expect(docStates.at(-1)).toBe("still");
    controller.destroy();
  });

  it("parses the debug query flags", () => {
    expect(parseAmbientFlags("?ambient=still&t=12&pose=face")).toEqual({
      debug: { forceStill: true, stillTime: 12, pose: "face" },
      demo: false,
    });
    expect(parseAmbientFlags("?ambient=stress&ambientDemo=1")).toEqual({ debug: { stress: true }, demo: true });
    expect(parseAmbientFlags("?pose=nonsense").debug).toEqual({});
  });
});
