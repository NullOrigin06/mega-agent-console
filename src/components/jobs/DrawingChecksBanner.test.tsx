import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DrawingChecksBanner } from "./DrawingChecksBanner";

describe("DrawingChecksBanner", () => {
  afterEach(cleanup);

  it("shows nothing when nothing stands in the way", () => {
    const { container } = render(<DrawingChecksBanner reasons={undefined} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const again = render(<DrawingChecksBanner reasons={[]} />);
    expect(again.container).toBeEmptyDOMElement();
  });

  it("lists every reason and says how to clear it", () => {
    render(<DrawingChecksBanner reasons={["Shell I.D. is missing or zero.", "The tubes do not fit the shell: only 1200 of the 9999 tubes fit."]} />);

    expect(screen.getByRole("alert")).toHaveTextContent("The drawing cannot be made with these values yet.");
    expect(screen.getByText("Shell I.D. is missing or zero.")).toBeInTheDocument();
    expect(screen.getByText(/only 1200 of the 9999 tubes/)).toBeInTheDocument();
    expect(screen.getByText(/Correct them in the Estimated column/)).toBeInTheDocument();
  });
});
