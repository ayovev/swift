import "@testing-library/jest-dom/vitest";
// jsdom doesn't implement IndexedDB; this installs it as a global for every
// test, the same way jest-dom matchers are installed above.
import "fake-indexeddb/auto";
