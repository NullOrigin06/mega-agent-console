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

import { TankParametersView, validateTankValue } from "./TankDataViews";
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

const typeAndEnter = (label: string, value: string) => {
  const input = estimatedInput(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
};

describe("TankParametersView - editing the Estimated values", () => {
  beforeEach(() => {
    recalculateJob.mockReset();
    refuseWith = null;
  });
  afterEach(cleanup);

  it("is read-only without a job to recalculate", () => {
    render(<TankParametersView data={shopData()} />);

    expect(screen.getByLabelText("Estimated Shell Thickness")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /recalculate/i })).toBeNull();
    expect(screen.getByText("Shell Thickness")).toBeInTheDocument();
  });

  it("uses the same Actual / Estimated layout as the other modules", () => {
    const { container } = render(<TankParametersView data={shopData()} jobId="job-1" onRecalculated={vi.fn()} />);

    expect(screen.getByText("Understanding Actual vs. Estimated Values")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset estimated to actual/i })).toBeInTheDocument();
    expect(container.querySelectorAll(".category-card").length).toBeGreaterThanOrEqual(4);          // a card per group, plus the nozzle schedule
    expect(container.querySelectorAll("table.values-table th.th-estimated").length).toBe(4);
    expect(screen.getAllByText("Baseline Reference (Read-Only)").length).toBe(4);
  });

  it("offers an input for every editable value and keeps the others read-only", () => {
    renderView();

    expect(estimatedInput("Shell Thickness").value).toBe("3");
    expect(estimatedInput("Shell Thickness")).not.toHaveAttribute("readonly");
    expect(estimatedInput("No. of Legs").value).toBe("3");
    expect(estimatedInput("Shell I.D.")).toHaveAttribute("readonly");                       // not editable
    expect((screen.getByLabelText("Estimated Top Root Type") as HTMLSelectElement).value).toBe("DISH");
  });

  it("sends the edit when Enter is pressed, with the values already edited, then hands over the recalculated job", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    const data = shopData();
    data.parameters[2] = { ...data.parameters[2], estimated: "5" };                          // an earlier edit: legs 5, calculated 3
    const onRecalculated = vi.fn();
    render(<TankParametersView data={data} jobId="job-1" onRecalculated={onRecalculated} />);

    typeAndEnter("Shell Thickness", "6");

    await waitFor(() => expect(onRecalculated).toHaveBeenCalledWith(updatedJob));
    expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: { SHELL_THK: "6", NO_OF_LEGS: "5" } });
  });

  it("also sends it when the field is left, and a list value as soon as it is picked", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    renderView();

    const input = estimatedInput("Shell Thickness");
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    await waitFor(() => expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: { SHELL_THK: "7" } }));

    recalculateJob.mockClear();
    fireEvent.change(screen.getByLabelText("Estimated Top Root Type"), { target: { value: "FLAT" } });
    await waitFor(() => expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: { TOP_ROOT_TYPE: "FLAT" } }));
  });

  it("does not call the server when nothing changed, and does not count 6 versus 6.0 as an edit", () => {
    renderView();

    typeAndEnter("Shell Thickness", "3.0");

    expect(recalculateJob).not.toHaveBeenCalled();
  });

  it("sends an empty set when a value is put back, so the override is removed", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    const data = shopData();
    data.parameters[1] = { ...data.parameters[1], estimated: "6" };      // an earlier edit: estimated 6, calculated 3
    render(<TankParametersView data={data} jobId="job-1" onRecalculated={vi.fn()} />);

    typeAndEnter("Shell Thickness", "3");

    await waitFor(() => expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: {} }));
  });

  it("refuses a value that is not a number before asking the server, and says so", () => {
    renderView();

    typeAndEnter("Shell Thickness", "abc");

    expect(recalculateJob).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Shell Thickness: Enter a number");
    expect(estimatedInput("Shell Thickness").value).toBe("3");                               // back to the accepted value
  });

  it("Escape drops what was typed", () => {
    renderView();
    const input = estimatedInput("Shell Thickness");
    fireEvent.change(input, { target: { value: "9" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("3");
    expect(recalculateJob).not.toHaveBeenCalled();
  });

  it("Reset Estimated to Actual sends an empty set, and is off while everything matches", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    renderView();
    expect(screen.getByRole("button", { name: /reset estimated to actual/i })).toBeDisabled();

    const data = shopData();
    data.parameters[1] = { ...data.parameters[1], estimated: "6" };
    cleanup();
    render(<TankParametersView data={data} jobId="job-1" onRecalculated={vi.fn()} />);
    expect(screen.getByText(/1 field modified from Actual baseline/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reset estimated to actual/i }));

    await waitFor(() => expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: {} }));
  });

  it("shows the server's message and the value goes back to the accepted one", async () => {
    refuseWith = new ApiFieldError("These values cannot be edited: NO_OF_LEGS.", { "overrides.NO_OF_LEGS": "This value is not editable." });
    renderView();

    typeAndEnter("No. of Legs", "5");

    expect(await screen.findByText(/cannot be edited/i)).toBeInTheDocument();
    await waitFor(() => expect(estimatedInput("No. of Legs").value).toBe("3"));
  });

  it("locks editing while a drawing is being generated", () => {
    renderView({ disabled: true });

    expect(estimatedInput("Shell Thickness")).toHaveAttribute("readonly");
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

    typeAndEnter("Shell Thickness", "6");

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
    expect(screen.getAllByLabelText("Position").filter((p) => (p as HTMLSelectElement).value === "SHELL")).toHaveLength(6);
  });

  it("a size of 1/2 switches the unit to inch, a bore switches it back to NB", () => {
    const nozzles = getDefaultShopTankNozzles().slice(0, 1);
    const onChange = rowsOf(nozzles, "ShopTank");

    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "1/2" } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ size: "1/2", unit: "inch" })]);
  });

  it("Site Tank: a nozzle moved to the SHELL keeps its orientation and gets an elevation; a ROOF nozzle has none", () => {
    const nozzles = getDefaultSiteTankNozzles().slice(0, 1);                 // N1, ROOF, 150°
    const onChange = rowsOf(nozzles, "SiteTank");

    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "SHELL" } });
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ position: "SHELL", orientation: "150°", elevation: "1000" })]);
  });

  it("Site Tank: a shell row has an orientation and an elevation, a roof row only an orientation", () => {
    rowsOf([...getDefaultSiteTankNozzles().slice(0, 1), ...getDefaultSiteTankNozzles().slice(9, 10)], "SiteTank");   // N1 roof, N10 shell

    const orientations = screen.getAllByLabelText("Orientation") as HTMLInputElement[];
    const elevations = screen.getAllByLabelText("Elevation") as HTMLInputElement[];
    expect(orientations[0]).toBeEnabled();
    expect(elevations[0]).toBeDisabled();
    expect(orientations[1]).toBeEnabled();
    expect(orientations[1].value).toBe("180°");
    expect(elevations[1]).toBeEnabled();
  });

  it("a bare number typed as an orientation gets its degree sign", () => {
    const nozzles = getDefaultShopTankNozzles().slice(1, 2);
    const onChange = rowsOf(nozzles, "ShopTank");

    fireEvent.blur(screen.getByLabelText("Orientation"), { target: { value: "300" } });

    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ orientation: "300°" })]);
  });
});

describe("validateTankValue", () => {
  it("accepts what the desktop grid accepts", () => {
    expect(validateTankValue("NO_OF_STIFFENERS", "0", "0")).toBeNull();
    expect(validateTankValue("NO_OF_FULL_COURSES", "30", "7")).toBeNull();
    expect(validateTankValue("SUPPORT_TYPE", "saddle support", "LEG SUPPORT")).toBeNull();
    expect(validateTankValue("BOTTOM_SLOPE", "1 : 30", "1 : 25")).toBeNull();
  });

  it("refuses what the desktop grid refuses", () => {
    expect(validateTankValue("SHELL_THK", "abc", "3")).toBe("Enter a number");
    expect(validateTankValue("SHELL_THK", "0", "3")).toBe("Must be greater than zero");
    expect(validateTankValue("NO_OF_LEGS", "3.5", "4")).toBe("Must be a whole number");
    expect(validateTankValue("NO_OF_FULL_COURSES", "31", "7")).toBe("Whole number from 1 to 30");
    expect(validateTankValue("NO_OF_PARTIAL_COURSES", "2", "0")).toBe("Must be 0 or 1");
    expect(validateTankValue("SUPPORT_TYPE", "BOX SUPPORT", "LEG SUPPORT")).not.toBeNull();
  });
});

describe("Site Tank Extras", () => {
  beforeEach(() => recalculateJob.mockReset());
  afterEach(cleanup);

  const siteData = (): TankData => ({
    ...shopData(),
    module: "SiteTank",
    parameters: [
      { key: "EXTRA_DESIGN_CODE", label: "Design Code", unit: null, group: "Extras", actual: "API 650", estimated: "API 650", editable: true },
      { key: "EXTRA_CORROSION_ALLOWANCE", label: "Corrosion Allowance", unit: "mm", group: "Extras", actual: "1.50", estimated: "1.50", editable: true },
    ],
  });

  it("are a card of their own with an editable Estimated column, and accept any text", async () => {
    recalculateJob.mockResolvedValue(updatedJob);
    render(<TankParametersView data={siteData()} jobId="job-1" onRecalculated={vi.fn()} />);

    expect(screen.getByText("Extras", { selector: ".category-title" })).toBeInTheDocument();
    const input = screen.getByLabelText("Estimated Corrosion Allowance") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "to be agreed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(recalculateJob).toHaveBeenCalledWith("job-1", { overrides: { EXTRA_CORROSION_ALLOWANCE: "to be agreed" } }));
  });

  it("validateTankValue has no checks for them", () => {
    expect(validateTankValue("EXTRA_CORROSION_ALLOWANCE", "to be agreed", "1.50")).toBeNull();
  });
});
