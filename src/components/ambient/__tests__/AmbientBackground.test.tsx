import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AmbientBackground } from "../AmbientBackground";
import type { JobSummary } from "../../../types/engineering";

const jobs: JobSummary[] = [
  {
    id: "job-1",
    module: "TubeSheet",
    shellId: 800,
    status: "running",
    createdAt: new Date().toISOString(),
    drawingStatus: "not_generated",
  },
];

function renderBackground() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AmbientBackground page="modules" workspaceModule={null} jobs={jobs} agents={[]} apiOk />
    </QueryClientProvider>,
  );
}

describe("AmbientBackground", () => {
  afterEach(cleanup);

  it("renders a decorative, inert root without crashing in jsdom (no WebGL)", () => {
    const { container } = renderBackground();
    const root = container.querySelector(".ambient-root");
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveAttribute("role", "presentation");
    expect(root).toHaveAttribute("inert");
    expect(root?.querySelector(".ambient-poster")).not.toBeNull();
    // Poster only: no engine, so the document state is "off".
    expect(document.documentElement.dataset.ambient).toBe("off");
  });

  it("has no focusable descendants", () => {
    const { container } = renderBackground();
    const root = container.querySelector(".ambient-root")!;
    const focusable = root.querySelectorAll("a, button, input, select, textarea, [tabindex], [contenteditable]");
    expect(focusable).toHaveLength(0);
  });

  it("clears html[data-ambient] on unmount", () => {
    const { unmount } = renderBackground();
    unmount();
    expect(document.documentElement.dataset.ambient).toBeUndefined();
  });
});
