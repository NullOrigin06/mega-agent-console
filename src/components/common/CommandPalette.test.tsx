import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette } from "./CommandPalette";
import type { JobSummary } from "../../types/engineering";

const jobs: JobSummary[] = [
  {
    id: "job-1001",
    module: "HeatExchangerFab",
    shellId: 914,
    status: "completed",
    createdAt: new Date().toISOString(),
    drawingStatus: "generated",
  },
];

function renderPalette(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onNavigate: vi.fn(),
    onSelectModule: vi.fn(),
    onSelectJob: vi.fn(),
    onRefresh: vi.fn(),
    onOpenRotateKey: vi.fn(),
    onLogout: vi.fn(),
    jobs,
    ...overrides,
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette", () => {
  it("navigates to Jobs Dashboard and closes the palette when selected", async () => {
    const user = userEvent.setup();
    const props = renderPalette();

    await user.click(screen.getByText("Jobs Dashboard"));

    expect(props.onNavigate).toHaveBeenCalledWith("jobs");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens a job from the Recent Jobs list", async () => {
    const user = userEvent.setup();
    const props = renderPalette();

    await user.click(screen.getByText("job-1001"));

    expect(props.onSelectJob).toHaveBeenCalledWith("job-1001");
  });

  it("triggers Rotate API Key action", async () => {
    const user = userEvent.setup();
    const props = renderPalette();

    await user.click(screen.getByText("Rotate API Key"));

    expect(props.onOpenRotateKey).toHaveBeenCalled();
  });

  it("hides Sign Out when onLogout is not provided", () => {
    renderPalette({ onLogout: undefined });
    expect(screen.queryByText("Sign Out")).not.toBeInTheDocument();
  });

  it("renders nothing interactive when closed", () => {
    renderPalette({ open: false });
    expect(screen.queryByPlaceholderText("Search modules, jobs, actions...")).not.toBeInTheDocument();
  });
});
