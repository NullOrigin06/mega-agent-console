import "@testing-library/jest-dom/vitest";

// cmdk (used by CommandPalette) observes element size via ResizeObserver,
// which jsdom doesn't implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// cmdk also calls scrollIntoView on the active item, which jsdom doesn't implement.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
