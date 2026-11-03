import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import type { JobDetail, NozzleItem, TankData } from "../../types/engineering";
import { ApiFieldError } from "../../api/errors";

const recalculateJob = vi.fn();
/** When set, the next recalculation is refused with this error (kept outside vi.fn so the runner does not track the rejection). */
let refuseWith: Error | null = null;
vi.mock("../../api", () => ({
  recalculateJob: (...args: unknown[]) => (refuseWith ? Promise.reject(refuseWith) : recalculateJob(...args)),
}));

import { TankParametersView } from "./TankDataViews";
import { TankNozzleEditor } from "./TankNozzleEditor";
import { getDefaultShopTankNozzles, getDefaultSiteTankNozzles } from "../../constants/tankNozzles";

const shopData = (nozzles: NozzleItem[] = getDefaultShopTankNozzles().slice(0, 2)): TankData => ({
  module: "ShopTank",
  inputs: { shellId: 1200, shellHeight: 1500, designPressureType: "Atmospheric", courseHeight: 1250, supportType: "LEG SUPPORT", noOfStiffeners: 0, straightFlangeSF: 25 },
  overrides: {},
  nozzles,
  warnings: [],
  summary: [],
  parameters: [
    { key: "SHELL_ID", label: "Shell I.D.", unit: "mm", group: "Geometry", actual: "1200", estimated: "1200", editable: false },
    { key: "SHELL_THK", label: "Shell Thickness", unit: "mm", group: "Thicknesses", actual: "3", estimated: "3", editable: true },
    { key: "NO_OF_LEGS", label: "No. of Legs", unit: null, group: "Support", actual: "3", estimated: "3", editable: true },
    { key: "TOP_ROOT_TYPE", label: "Top Root Type", unit: null, group: "Heads", actual: "DISH", estimated: "DISH", editable: true },
  ],
});

const updatedJob = { id: "job-1", status: "completed" } as unknown as JobDetail;

function renderView(props: Partial<Parameters<typeof TankParametersView>[0]> = {}) {
  const onRecalculated = vi.fn();
  render(<TankParametersView data={shopData()} jobId="job-1" onRecalculated={onRecalculated} {...props} />);
  return { onRecalculated };
}

const estimatedInput = (label: string) => screen.getByLabelText(`Estimated ${label}`) as HTMLInputElement;
const recalcButton = () => screen.getByRole("button", { name: /recalculate/i });

describe("TankParametersView - editing the Estimated values", () => {
  beforeEach(() => {
    recalculateJob.mockReset();
    refuseWith = null;
  });
  afterEach(cleanup);

  it("is read-only without a job to recalculate", () => {
    render(<TankParametersView data={shopData()} />);

    expect(screen.queryByLabelText("Estimated Shell Thickness")).toBeNull();
    expect(screen.queryByRole("button", { name: /recalculate/i })).toBeNull();
    expect(screen.getByText("Shell Thickness")).toBeInTheDocument();
  });

  it("offers an input for every editable value and none for the others", () => {
    renderView();

    expect(estimatedInput("Shell Thickness").value).toBe("3");
    expect(estimatedInput("No. of Legs").value).toBe("3");
    expect(screen.queryByLabelText("Estimated Shell I.D.")).toBeNull();           // not editable
    expect((screen.getByLabelText("Estimated Top Root Type") as HTMLSelectElement).value).toBe("DISH");
  });

  it("keeps Recalculate off until something changes", () => {
    renderView();

    expect(recalcButton()).toBeDisabled();
    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "6" } });
    expect(recalcButton()).toBeEnabled();
  });

  it("sends only the values that differ from the calculation, then hands over the recalculated job", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    const { onRecalculated } = renderView();

    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Estimated Top Root Type"), { target: { value: "FLAT" } });
    fireEvent.click(recalcButton());

    await waitFor(() => expect(onRecalculated).toHaveBeenCalledWith(updatedJob));
    expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: { SHELL_THK: "6", TOP_ROOT_TYPE: "FLAT" } });
  });

  it("does not count 6 versus 6.0 as an edit", () => {
    renderView();

    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "3.0" } });

    expect(recalcButton()).toBeDisabled();
  });

  it("sends an empty set when a value is put back, so the override is removed", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    const data = shopData();
    data.parameters[1] = { ...data.parameters[1], estimated: "6" };      // an earlier edit: estimated 6, calculated 3
    render(<TankParametersView data={data} jobId="job-1" onRecalculated={vi.fn()} />);

    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "3" } });
    fireEvent.click(recalcButton());

    await waitFor(() => expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: {} }));
  });

  it("refuses a value that is not a number, and says so", () => {
    renderView();

    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "abc" } });

    expect(screen.getByText("Enter a number")).toBeInTheDocument();
    expect(recalcButton()).toBeDisabled();
  });

  it("puts the calculated values back with Discard changes", () => {
    renderView();
    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "9" } });

    fireEvent.click(screen.getByRole("button", { name: /discard changes/i }));

    expect(estimatedInput("Shell Thickness").value).toBe("3");
    expect(recalcButton()).toBeDisabled();
  });

  it("shows the server's message next to the value it refused", async () => {
    refuseWith = new ApiFieldError("These values cannot be edited: NO_OF_LEGS.", { "overrides.NO_OF_LEGS": "This value is not editable." });
    renderView();

    fireEvent.change(estimatedInput("No. of Legs"), { target: { value: "5" } });
    fireEvent.click(recalcButton());

    expect(await screen.findByText("This value is not editable.")).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();           // and the message above the table
  });

  it("locks editing while a drawing is being generated", () => {
    renderView({ disabled: true });

    expect(estimatedInput("Shell Thickness")).toBeDisabled();
    expect(screen.getByText(/drawing is being generated/i)).toBeInTheDocument();
  });

  it("takes the new result as the starting point after a recalculation", () => {
    const { rerender } = render(<TankParametersView data={shopData()} jobId="job-1" onRecalculated={vi.fn()} />);
    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "9" } });

    const next = shopData();
    next.parameters[1] = { ...next.parameters[1], estimated: "6" };
    rerender(<TankParametersView data={next} jobId="job-1" onRecalculated={vi.fn()} />);

    expect(estimatedInput("Shell Thickness").value).toBe("6");
  });
});

describe("TankParametersView - the nozzle schedule", () => {
  beforeEach(() => recalculateJob.mockReset());
  afterEach(cleanup);

  it("shows the schedule of the job and sends it, with the edited values, when a nozzle changes", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    renderView();
    const table = screen.getByRole("table", { name: /Shop Tank nozzle schedule/i });
    expect(within(table).getAllByRole("row")).toHaveLength(3);               // header + the two nozzles

    fireEvent.change(within(table).getAllByLabelText("Service")[0], { target: { value: "VENT" } });
    fireEvent.click(recalcButton());

    await waitFor(() => expect(recalculateJob).toHaveBeenCalled());
    const [, body] = recalculateJob.mock.calls[0];
    expect(body.overrides).toEqual({});
    expect(body.nozzles).toHaveLength(2);
    expect(body.nozzles[0].service).toBe("VENT");
  });

  it("asks before removing a nozzle, and keeps it when the answer is no", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: /remove nozzle N1/i }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("N1"));
    expect(screen.getAllByLabelText("Nozzle location")).toHaveLength(2);        // both rows are still there
    expect(recalcButton()).toBeDisabled();                                      // nothing changed
    confirm.mockRestore();
  });

  it("can add and remove a nozzle", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    recalculateJob.mockResolvedValue(updatedJob);
    renderView();

    fireEvent.click(screen.getByRole("button", { name: /add nozzle/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove nozzle N1/i }));
    fireEvent.click(recalcButton());

    await waitFor(() => expect(recalculateJob).toHaveBeenCalled());
    const nozzles = recalculateJob.mock.calls[0][1].nozzles as NozzleItem[];
    expect(nozzles).toHaveLength(2);
    expect(nozzles.map((n) => n.nozzleNo)).toEqual(["N2", "N3"]);          // N1 removed, the next free number added
    confirm.mockRestore();
  });

  it("does not send the schedule when only a value was edited", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    renderView();

    fireEvent.change(estimatedInput("Shell Thickness"), { target: { value: "6" } });
    fireEvent.click(recalcButton());

    await waitFor(() => expect(recalculateJob).toHaveBeenCalled());
    expect(recalculateJob.mock.calls[0][1]).not.toHaveProperty("nozzles");
  });
});

describe("TankNozzleEditor", () => {
  afterEach(cleanup);

  const rowsOf = (nozzles: NozzleItem[], module: "ShopTank" | "SiteTank") => {
    const onChange = vi.fn();
    render(<TankNozzleEditor module={module} nozzles={nozzles} onChange={onChange} />);
    return onChange;
  };

  it("Shop Tank has Location and Elevation / Radius, and the desktop default schedule has ten rows", () => {
    rowsOf(getDefaultShopTankNozzles(), "ShopTank");

    expect(screen.getByText("Nozzle Location")).toBeInTheDocument();
    expect(screen.getByText("Elevation / Radius (mm)")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Nozzle location")).toHaveLength(10);
  });

  it("Site Tank has Position, and its default is the 17-nozzle fermentor schedule", () => {
    rowsOf(getDefaultSiteTankNozzles(), "SiteTank");

    expect(screen.getAllByLabelText("Position")).toHaveLength(17);
    expect(screen.getAllByLabelText("Position").filter((p) => (p as HTMLSelectElement).value === "SHELL")).toHaveLength(5);
  });

  it("a size of 1/2 switches the unit to inch, a bore switches it back to NB", () => {
    const nozzles = getDefaultShopTankNozzles().slice(0, 1);
    const onChange = rowsOf(nozzles, "ShopTank");

    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "1/2" } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ size: "1/2", unit: "inch" })]);
  });

  it("Site Tank: a SHELL nozzle has no orientation and keeps an elevation; a ROOF nozzle the other way round", () => {
    const nozzles = getDefaultSiteTankNozzles().slice(0, 1);                 // N1, ROOF, 150°
    const onChange = rowsOf(nozzles, "SiteTank");

    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "SHELL" } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ position: "SHELL", orientation: "-", elevation: "1000" })]);
  });

  it("Site Tank: a shell row cannot be given an orientation and a roof row no elevation", () => {
    rowsOf([...getDefaultSiteTankNozzles().slice(0, 1), ...getDefaultSiteTankNozzles().slice(2, 3)], "SiteTank");   // N1 roof, N3 shell

    const orientations = screen.getAllByLabelText("Orientation") as HTMLInputElement[];
    const elevations = screen.getAllByLabelText("Elevation") as HTMLInputElement[];
    expect(orientations[0]).toBeEnabled();
    expect(elevations[0]).toBeDisabled();
    expect(orientations[1]).toBeDisabled();
    expect(elevations[1]).toBeEnabled();
  });

  it("a bare number typed as an orientation gets its degree sign", () => {
    const nozzles = getDefaultShopTankNozzles().slice(1, 2);
    const onChange = rowsOf(nozzles, "ShopTank");

    fireEvent.blur(screen.getByLabelText("Orientation"), { target: { value: "300" } });

    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ orientation: "300°" })]);
  });
});
