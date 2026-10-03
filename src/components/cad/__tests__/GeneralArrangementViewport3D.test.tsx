import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GeneralArrangementViewport3D } from "../GeneralArrangementViewport3D";
import { webglAvailable } from "../gaWebgl";
import { REFERENCE_GA_SPEC } from "../gaSpec";

describe("GeneralArrangementViewport3D without WebGL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("probes WebGL and renders the text fallback when it is missing", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(webglAvailable()).toBe(false);
    const onClose = vi.fn();
    render(<GeneralArrangementViewport3D spec={REFERENCE_GA_SPEC} onClose={onClose} />);
    expect(screen.getByText("General Arrangement 3D unavailable")).toBeInTheDocument();
    expect(screen.getByText(/WebGL is not available/)).toBeInTheDocument();
    // the nozzle table stands in for the model
    expect(screen.getByText("N3")).toBeInTheDocument();
    expect(screen.queryByTestId("ga-viewport")).toBeNull();
    screen.getByRole("button", { name: "Close" }).click();
    expect(onClose).toHaveBeenCalled();
  });
});
