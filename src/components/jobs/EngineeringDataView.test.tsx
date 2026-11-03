import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { EngineeringDataModel, JobDetail } from "../../types/engineering";
import { ApiFieldError } from "../../api/errors";
import { sampleEngineeringData } from "../../mocks/fixtures";

const editEstimated = vi.fn();
/** When set, the next edit is refused with this error (kept outside vi.fn so the runner does not track the rejection). */
let refuseWith: Error | null = null;
vi.mock("../../api", () => ({
  editEstimated: (...args: unknown[]) => (refuseWith ? Promise.reject(refuseWith) : editEstimated(...args)),
}));

import { EngineeringDataView } from "./EngineeringDataView";

const data = (): EngineeringDataModel => ({
  ...sampleEngineeringData,
  actual: { ...sampleEngineeringData.actual, shellID: 800, flangeID: 812 },
  estimated: { ...sampleEngineeringData.actual, shellID: 800, flangeID: 812 },
});

/** The job the server returns after the Shell I.D. edit: the connected Flange ID followed. */
const jobAfterShellEdit = (): JobDetail =>
  ({
    id: "job-1",
    status: "completed",
    engineeringData: { ...data(), estimated: { ...data().estimated, shellID: 820, flangeID: 832 } },
  }) as unknown as JobDetail;

function renderView(props: Partial<Parameters<typeof EngineeringDataView>[0]> = {}) {
  const onUpdated = vi.fn();
  const view = render(<EngineeringDataView initialData={data()} jobId="job-1" onUpdated={onUpdated} {...props} />);
  return { onUpdated, ...view };
}

const input = (label: string) => screen.getByLabelText(`Estimated ${label}`) as HTMLInputElement;

describe("EngineeringDataView - the Estimated column is live", () => {
  beforeEach(() => {
    editEstimated.mockReset();
    refuseWith = null;
  });
  afterEach(cleanup);

  it("sends the edit when Enter is pressed and hands over the recalculated job", async () => {
    editEstimated.mockResolvedValue({ job: jobAfterShellEdit() });
    const { onUpdated } = renderView();

    fireEvent.change(input("Shell ID"), { target: { value: "820" } });
    fireEvent.keyDown(input("Shell ID"), { key: "Enter" });

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(editEstimated).toHaveBeenCalledWith("job-1", { key: "shellID", value: "820" });
    expect(onUpdated.mock.calls[0][0].engineeringData.estimated.flangeID).toBe(832);      // a connected value came back
  });

  it("also sends it when the field is left", async () => {
    editEstimated.mockResolvedValue({ job: jobAfterShellEdit() });
    renderView();

    fireEvent.change(input("Shell ID"), { target: { value: "820" } });
    fireEvent.blur(input("Shell ID"));

    await waitFor(() => expect(editEstimated).toHaveBeenCalledWith("job-1", { key: "shellID", value: "820" }));
  });

  it("does not call the server when nothing changed", () => {
    renderView();

    fireEvent.change(input("Shell ID"), { target: { value: "800.0" } });
    fireEvent.keyDown(input("Shell ID"), { key: "Enter" });

    expect(editEstimated).not.toHaveBeenCalled();
  });

  it("refuses a value that is not a positive number, before asking the server", () => {
    renderView();

    fireEvent.change(input("Flange ID"), { target: { value: "abc" } });
    fireEvent.keyDown(input("Flange ID"), { key: "Enter" });

    expect(editEstimated).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid positive number");
    expect(input("Flange ID").value).toBe("812");                       // back to the last accepted value
  });

  it("a count must be a whole number", () => {
    renderView();

    fireEvent.change(input("Shell ID"), { target: { value: "820.5" } });
    fireEvent.keyDown(input("Shell ID"), { key: "Enter" });

    expect(editEstimated).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("whole number");
  });

  it("Escape drops what was typed", () => {
    renderView();

    fireEvent.change(input("Flange ID"), { target: { value: "999" } });
    fireEvent.keyDown(input("Flange ID"), { key: "Escape" });

    expect(input("Flange ID").value).toBe("812");
  });

  it("shows the server's reason, and the field goes back to the accepted value", async () => {
    refuseWith = new ApiFieldError("Shell ID 7 was not found in the engineering standards dataset.", { shellID: "Shell ID 7 was not found in the engineering standards dataset." });
    renderView();

    fireEvent.change(input("Shell ID"), { target: { value: "7" } });
    fireEvent.keyDown(input("Shell ID"), { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("was not found in the engineering standards dataset");
    expect(input("Shell ID").value).toBe("800");
  });

  it("shows the geometry capacity notice the server returns", async () => {
    editEstimated.mockResolvedValue({ job: jobAfterShellEdit(), notice: "Tube quantity exceeds the shell capacity." });
    renderView();

    fireEvent.change(input("Shell ID"), { target: { value: "820" } });
    fireEvent.keyDown(input("Shell ID"), { key: "Enter" });

    expect(await screen.findByText("Tube quantity exceeds the shell capacity.")).toBeInTheDocument();
  });

  it("Reset Estimated to Actual asks the server to go back to the calculated values", async () => {
    editEstimated.mockResolvedValue({ job: { ...jobAfterShellEdit() } });
    const modified = data();
    modified.estimated = { ...modified.estimated, flangeID: 900 };
    renderView({ initialData: modified });

    fireEvent.click(screen.getByRole("button", { name: /reset estimated to actual/i }));

    await waitFor(() => expect(editEstimated).toHaveBeenCalledWith("job-1", { reset: true }));
  });

  it("Baffle OD is derived, so it is not edited (as in the software)", () => {
    renderView();

    expect(input("Baffle OD")).toHaveAttribute("readonly");
    fireEvent.keyDown(input("Baffle OD"), { key: "Enter" });
    expect(editEstimated).not.toHaveBeenCalled();
  });

  it("is read-only without a job, and while a drawing is generated", () => {
    const { rerender } = render(<EngineeringDataView initialData={data()} />);
    expect(input("Shell ID")).toHaveAttribute("readonly");

    rerender(<EngineeringDataView initialData={data()} jobId="job-1" onUpdated={vi.fn()} disabled />);
    expect(input("Shell ID")).toHaveAttribute("readonly");
    expect(screen.getByText(/drawing is being generated/i)).toBeInTheDocument();
  });

  it("shows the new Estimated values from the job it is given", () => {
    const { rerender } = renderView();
    expect(input("Flange ID").value).toBe("812");

    rerender(<EngineeringDataView initialData={jobAfterShellEdit().engineeringData!} jobId="job-1" onUpdated={vi.fn()} />);

    expect(input("Shell ID").value).toBe("820");
    expect(input("Flange ID").value).toBe("832");
  });
});
